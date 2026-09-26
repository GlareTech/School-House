import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, cache } from "./db.js";
import { config } from "./config.js";
import { HttpError } from "./domain.js";
import { originAllowed } from "./settings.js";
import { runWithTenant } from "./tenant-context.js";
import { paystack, sendWelcomeEmail } from "./billing.js";
export const PERMISSIONS = [
  "CLASSES_MANAGE",
  "STUDENTS_MANAGE",
  "STAFF_MANAGE",
  "EXAMS_MANAGE",
  "EXAMS_MONITOR",
  "ASSIGNMENTS_MANAGE",
  "MATERIALS_MANAGE",
  "LIBRARY_MANAGE",
  "HOSTEL_MANAGE",
  "GRADES_MANAGE",
  "RATINGS_MANAGE",
  "REPORTS_VIEW",
  "PROMOTIONS_MANAGE",
  "RESULTS_VIEW",
  "ATTENDANCE_MANAGE",
  "PAYMENTS_MANAGE",
  "COMMUNICATIONS_MANAGE",
  "PROVIDERS_MANAGE",
  "SYNC_VIEW",
  "AUDIT_VIEW",
  "SETTINGS_MANAGE",
];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const cookieOptions = {
  httpOnly: true,
  sameSite: config.COOKIE_SAME_SITE,
  secure: config.COOKIE_SECURE,
  path: "/",
  priority: "high",
};
export async function corsForAllowedOrigins(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return req.method === "OPTIONS" ? res.sendStatus(400) : next();
  const allowed = await originAllowed(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", new URL(origin).origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-CSRF-Token, X-File-Name, X-File-Purpose",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    res.append("Vary", "Origin");
  }
  if (req.method === "OPTIONS")
    return allowed ? res.sendStatus(204) : res.sendStatus(403);
  next();
}
export async function checkOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (
    req.path.startsWith("/api/device-sync/") &&
    /^Bearer\s+[A-Za-z0-9_-]{32,}$/i.test(
      String(req.headers.authorization || ""),
    )
  )
    return next();
  if (!(await originAllowed(req.headers.origin)))
    throw new HttpError(403, "Untrusted origin");
  next();
}
export async function sessionFromCookie(cookie) {
  if (!cookie || !/^[a-f0-9]{64}$/.test(cookie)) return null;
  const session = await db.session.findUnique({
    where: { id: hash(cookie) },
    include: {
      user: {
        include: {
          staffRole: { include: { grants: true } },
          organization: {
            include: {
              subscriptions: {
                include: { plan: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  return session &&
    session.expiresAt > new Date() &&
    tenantAccessAllowed(session.user)
    ? session
    : null;
}
const tenantAccessAllowed = (user) =>
  user?.active &&
  user.organization?.active &&
  (user.organization.subscriptions.length === 0 ||
    user.organization.subscriptions.some(
      (s) =>
        s.status === "ACTIVE" ||
        (s.status === "TRIALING" && s.trialEndsAt > new Date()),
    ));
export async function authenticate(req, res, next) {
  const session = await sessionFromCookie(req.cookies.school_session);
  if (!session) throw new HttpError(401, "Please sign in");
  req.user = session.user;
  req.session = session;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers["x-csrf-token"] !== session.csrf
  )
    throw new HttpError(403, "Invalid CSRF token");
  return runWithTenant(session.user.organizationId, next);
}
export function admin(req, res, next) {
  if (req.user.role !== "ADMIN")
    throw new HttpError(403, "Administrator access required");
  next();
}
export function permit(permission) {
  return (req, res, next) => {
    if (
      req.user.role === "ADMIN" ||
      (req.user.role === "STAFF" &&
        req.user.staffRole?.grants.some(
          (grant) => grant.permission === permission,
        ))
    )
      return next();
    throw new HttpError(403, "Your staff role does not permit this action");
  };
}
export const publicUser = (u) => ({
  id: u.id,
  organizationId: u.organizationId,
  name: u.name,
  email: u.email,
  role: u.role,
  classId: u.classId,
  profilePictureId: u.profilePictureId || null,
  staffRole: u.staffRole
    ? { id: u.staffRole.id, name: u.staffRole.name }
    : null,
  permissions:
    u.role === "ADMIN"
      ? PERMISSIONS
      : (u.staffRole?.grants || []).map((g) => g.permission),
  planFeatures: u.organization?.subscriptions?.[0]?.plan?.features || null,
});
export function authRoutes(app) {
  app.get("/api/auth/plans", async (_req, res) => {
    res.json(
      await db.subscriptionPlan.findMany({
        where: { active: true },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          amountMinor: true,
          currency: true,
          interval: true,
          maxStudents: true,
          features: true,
        },
        orderBy: { amountMinor: "asc" },
      }),
    );
  });
  app.post("/api/auth/signup", async (req, res) => {
    const input = z
      .object({
        schoolName: z.string().trim().min(2).max(120),
        name: z.string().trim().min(2).max(120),
        email: z
          .string()
          .email()
          .transform((v) => v.toLowerCase()),
        password: z.string().min(12).max(128),
        planCode: z.string().trim().min(1).max(40),
      })
      .parse(req.body);
    if (!config.PAYSTACK_SECRET_KEY)
      throw new HttpError(
        503,
        "Online subscription checkout is being configured",
      );
    if (await db.user.findUnique({ where: { email: input.email } }))
      throw new HttpError(409, "An account already exists for this email");
    const plan = await db.subscriptionPlan.findFirst({
      where: { code: input.planCode, active: true },
    });
    if (!plan) throw new HttpError(400, "Choose a valid subscription package");
    const reference = `schoolhouse_${Date.now()}_${randomBytes(8).toString("hex")}`;
    const passwordHash = await bcrypt.hash(input.password, 12);
    await db.signupIntent.create({
      data: {
        schoolName: input.schoolName,
        name: input.name,
        email: input.email,
        passwordHash,
        reference,
        planId: plan.id,
      },
    });
    try {
      const transaction = await paystack("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          amount: String(config.PAYSTACK_TOKEN_AMOUNT),
          currency: plan.currency,
          reference,
          channels: ["card"],
          callback_url: `${config.APP_ORIGINS[0]}/?payment=${encodeURIComponent(reference)}`,
          metadata: JSON.stringify({
            schoolName: input.schoolName,
            planCode: plan.code,
            purpose: "trial_card_authorization",
          }),
        }),
      });
      res.status(201).json({ authorizationUrl: transaction.authorization_url });
    } catch (error) {
      await db.signupIntent.deleteMany({ where: { reference } });
      throw error;
    }
  });
  app.post("/api/auth/signup/verify", async (req, res) => {
    const { reference } = z
      .object({ reference: z.string().regex(/^schoolhouse_[A-Za-z0-9_]+$/) })
      .parse(req.body);
    const intent = await db.signupIntent.findUnique({
      where: { reference },
      include: { plan: true },
    });
    if (!intent) throw new HttpError(404, "Signup session not found");
    const transaction = await paystack(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    const authorization = transaction.authorization;
    if (
      transaction.status !== "success" ||
      transaction.amount !== config.PAYSTACK_TOKEN_AMOUNT ||
      transaction.customer?.email?.toLowerCase() !== intent.email ||
      authorization?.channel !== "card" ||
      !authorization?.reusable
    )
      throw new HttpError(
        402,
        "A reusable card authorization is required to start the trial",
      );
    let planCode = intent.plan.paystackPlanCode;
    if (!planCode) {
      const remotePlan = await paystack("/plan", {
        method: "POST",
        body: JSON.stringify({
          name: `Schoolhouse ${intent.plan.name}`,
          amount: intent.plan.amountMinor,
          interval: intent.plan.interval,
          currency: intent.plan.currency,
        }),
      });
      planCode = remotePlan.plan_code;
      await db.subscriptionPlan.update({
        where: { id: intent.planId },
        data: { paystackPlanCode: planCode },
      });
    }
    const trialStartsAt = new Date(),
      trialEndsAt = new Date(Date.now() + 7 * 86400000);
    const remoteSubscription = await paystack("/subscription", {
      method: "POST",
      body: JSON.stringify({
        customer: transaction.customer.customer_code,
        plan: planCode,
        authorization: authorization.authorization_code,
        start_date: trialEndsAt.toISOString(),
      }),
    });
    const slugBase =
      intent.schoolName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 45) || "school";
    const result = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: intent.schoolName,
          slug: `${slugBase}-${randomBytes(3).toString("hex")}`,
          trialEndsAt,
        },
      });
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: intent.email,
          name: intent.name,
          passwordHash: intent.passwordHash,
          role: "ADMIN",
        },
      });
      await tx.appSetting.create({
        data: {
          organizationId: organization.id,
          schoolName: intent.schoolName,
          gradingScale: [],
        },
      });
      await tx.subscription.create({
        data: {
          organizationId: organization.id,
          planId: intent.planId,
          status: "TRIALING",
          trialStartsAt,
          trialEndsAt,
          nextChargeAt: trialEndsAt,
          paystackCustomerCode: transaction.customer.customer_code,
          paystackSubscriptionCode: remoteSubscription.subscription_code,
          paystackEmailToken: remoteSubscription.email_token,
          authorizationCode: authorization.authorization_code,
          authorizationSignature: authorization.signature,
          cardBrand: authorization.card_type,
          cardLast4: authorization.last4,
        },
      });
      await tx.signupIntent.delete({ where: { id: intent.id } });
      return { user, organization };
    });
    sendWelcomeEmail({
      email: intent.email,
      name: intent.name,
      schoolName: intent.schoolName,
      trialEndsAt,
      planName: intent.plan.name,
    }).catch(() => {});
    res.json({ ok: true, email: result.user.email, trialEndsAt });
  });
  app.post("/api/auth/login", async (req, res) => {
    const input = z
      .object({
        email: z
          .string()
          .email()
          .max(254)
          .transform((s) => s.toLowerCase()),
        password: z.string().max(128),
      })
      .parse(req.body);
    // Fail closed for new logins if the shared abuse-control store is unavailable.
    const key = `login:${hash(req.ip + ":" + input.email)}`;
    const ipKey = `login-ip:${hash(req.ip)}`;
    let count, ipCount;
    try {
      [count, ipCount] = await Promise.all([
        cache.increment(key, 900000),
        cache.increment(ipKey, 900000),
      ]);
    } catch {
      throw new HttpError(503, "Sign-in temporarily unavailable");
    }
    if (count > 12 || ipCount > 150)
      throw new HttpError(429, "Too many sign-in attempts; wait 15 minutes");
    const user = await db.user.findUnique({
      where: { email: input.email },
      include: {
        staffRole: { include: { grants: true } },
        organization: {
          include: {
            subscriptions: {
              include: { plan: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    const valid = await bcrypt.compare(
      input.password,
      user?.passwordHash ||
        "$2b$12$C6UzMDM.H6dfI/f/IKcEe.6JdB5vCkDmrxRerAY.VnwkAebwkNQpe",
    );
    if (!user?.active || !valid)
      throw new HttpError(401, "Invalid email or password");
    if (!tenantAccessAllowed(user))
      throw new HttpError(402, "Your school subscription needs attention");
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + config.SESSION_HOURS * 3600000);
    await db.$transaction(async (tx) => {
      if (req.cookies.school_session)
        await tx.session.deleteMany({
          where: { id: hash(req.cookies.school_session) },
        });
      await tx.session.create({
        data: { id: hash(token), userId: user.id, csrf, expiresAt },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "auth.login",
          entityId: user.id,
          organizationId: user.organizationId,
        },
      });
    });
    await cache.del(key);
    res
      .cookie("school_session", token, { ...cookieOptions, expires: expiresAt })
      .json({ user: publicUser(user), csrf });
  });
  app.get("/api/auth/me", authenticate, (req, res) =>
    res.json({ user: publicUser(req.user), csrf: req.session.csrf }),
  );
  app.post("/api/auth/logout", authenticate, async (req, res) => {
    await db.$transaction([
      db.session.delete({ where: { id: req.session.id } }),
      db.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "auth.logout",
          entityId: req.user.id,
          organizationId: req.user.organizationId,
        },
      }),
    ]);
    res.clearCookie("school_session", cookieOptions).json({ ok: true });
  });
}
