import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, cache } from "./db.js";
import { config } from "./config.js";
import { HttpError } from "./domain.js";
import { originAllowed } from "./settings.js";
import { runWithTenant } from "./tenant-context.js";
import { paystack, sendWelcomeEmail, subscriptionWalletBalance, nextSubscriptionPeriod } from "./billing.js";
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
export async function verifyHuman(input) {
  const challenge = await cache.take(`human:${input.robotChallengeId}`);
  if (!challenge || challenge.answer !== String(input.robotAnswer).trim())
    throw new HttpError(
      400,
      "Robot check failed. Please try the new question.",
    );
}
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
export async function sessionFromCookie(cookie, allowRenewal = false) {
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
    (tenantAccessAllowed(session.user) ||
      (allowRenewal && renewalAllowed(session.user)))
    ? session
    : null;
}
const tenantAccessAllowed = (user) =>
  user?.active &&
  user.organization?.active &&
  (user.organization.subscriptions.length === 0 ||
    user.organization.subscriptions.some(
      (s) =>
        (s.status === "ACTIVE" &&
          (!s.currentPeriodEnd || s.currentPeriodEnd > new Date())) ||
        (s.status === "TRIALING" && s.trialEndsAt > new Date()),
    ));
const renewalAllowed = (user) => user?.active && user.organization?.active;
export async function authenticate(req, res, next) {
  const session = await sessionFromCookie(req.cookies.school_session, true);
  if (!session) throw new HttpError(401, "Please sign in");
  req.user = session.user;
  req.session = session;
  if (
    !tenantAccessAllowed(session.user) &&
    ![
      "/api/auth/me",
      "/api/auth/logout",
      "/api/auth/renewal",
      "/api/auth/renewal/initialize",
      "/api/auth/renewal/verify",
      "/api/auth/renewal/wallet",
      "/api/auth/wallet/topup/initialize",
      "/api/auth/wallet/topup/verify",
    ].includes(req.path)
  )
    throw new HttpError(402, "Renew your school subscription to continue");
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
  phone: u.phone || "",
  address: u.address || "",
  staffRole: u.staffRole
    ? { id: u.staffRole.id, name: u.staffRole.name }
    : null,
  permissions:
    u.role === "ADMIN"
      ? PERMISSIONS
      : (u.staffRole?.grants || []).map((g) => g.permission),
  planFeatures: u.organization?.subscriptions?.[0]?.plan?.features || null,
  renewalRequired: !tenantAccessAllowed(u),
});
export function authRoutes(app) {
  app.get("/api/auth/challenge", async (_req, res) => {
    const left = 2 + Math.floor(Math.random() * 8),
      right = 1 + Math.floor(Math.random() * 9),
      id = randomBytes(18).toString("base64url");
    await cache.put(
      `human:${id}`,
      { answer: String(left + right) },
      5 * 60 * 1000,
    );
    res.json({ id, question: `What is ${left} + ${right}?` });
  });
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
        robotChallengeId: z.string().min(10).max(100),
        robotAnswer: z.string().trim().min(1).max(20),
        termsAccepted: z.literal("on", {
          errorMap: () => ({
            message: "Accept the Terms and Conditions to continue",
          }),
        }),
      })
      .parse(req.body);
    await verifyHuman(input);
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
        acceptedTermsAt: new Date(),
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
        robotChallengeId: z.string().min(10).max(100),
        robotAnswer: z.string().trim().min(1).max(20),
      })
      .parse(req.body);
    await verifyHuman(input);
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
    if (!tenantAccessAllowed(user) && !renewalAllowed(user))
      throw new HttpError(
        402,
        user.organization?.active
          ? "Ask your school administrator to renew the subscription"
          : "This school workspace is unavailable",
      );
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
  app.get("/api/auth/renewal", authenticate, async (req, res) => {
    const subscription = req.user.organization.subscriptions[0];
    if (!subscription) throw new HttpError(404, "No subscription found");
    const wallet = await db.wallet.findUnique({ where: { organizationId: req.user.organizationId } });
    res.json({
      required: !tenantAccessAllowed(req.user),
      canPay: req.user.role === "ADMIN",
      schoolName: req.user.organization.name,
      walletBalanceMinor: await subscriptionWalletBalance(db, wallet?.id),
      currentPeriodEnd: subscription.currentPeriodEnd,
      plan: {
        name: subscription.plan.name,
        amountMinor: subscription.plan.amountMinor,
        currency: subscription.plan.currency,
        interval: subscription.plan.interval,
      },
    });
  });
  app.post("/api/auth/wallet/topup/initialize", authenticate, async (req, res) => {
    if (req.user.role !== "ADMIN") throw new HttpError(403, "School administrator access required");
    const { amountMinor } = z.object({ amountMinor: z.number().int().min(5000).max(100000000) }).strict().parse(req.body);
    const reference = `topup_${randomBytes(18).toString("hex")}`;
    const currency = "NGN";
    const callback = tenantAccessAllowed(req.user) ? "wallet" : "renew";
    const transaction = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: req.user.email, amount: amountMinor, currency, reference, channels: ["card"],
        callback_url: `${config.APP_ORIGINS[0]}/${callback}?topup=${reference}`,
        metadata: { purpose: "schoolhouse_wallet_topup", organizationId: req.user.organizationId, amountMinor },
      }),
    });
    res.json({ authorizationUrl: transaction.authorization_url });
  });
  app.post("/api/auth/wallet/topup/verify", authenticate, async (req, res) => {
    if (req.user.role !== "ADMIN") throw new HttpError(403, "School administrator access required");
    const { reference } = z.object({ reference: z.string().regex(/^topup_[a-f0-9]{36}$/) }).strict().parse(req.body);
    const transaction = await paystack(`/transaction/verify/${reference}`);
    const metadata = typeof transaction.metadata === "string" ? JSON.parse(transaction.metadata) : transaction.metadata;
    if (transaction.status !== "success" || transaction.reference !== reference ||
      !Number.isInteger(transaction.amount) || transaction.amount < 5000 || transaction.amount > 100000000 ||
      transaction.currency !== "NGN" || transaction.customer?.email?.toLowerCase() !== req.user.email.toLowerCase() ||
      metadata?.purpose !== "schoolhouse_wallet_topup" || metadata.organizationId !== req.user.organizationId ||
      Number(metadata.amountMinor) !== transaction.amount)
      throw new HttpError(402, "Top-up could not be verified for this school");
    const result = await db.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { organizationId: req.user.organizationId },
        create: { organizationId: req.user.organizationId, currency: "NGN" }, update: {},
      });
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;
      const existing = await tx.walletTransaction.findUnique({ where: { walletId_reference: { walletId: wallet.id, reference: `topup:${reference}` } } });
      if (!existing) {
        await tx.walletTransaction.create({ data: { walletId: wallet.id, type: "CREDIT", amountMinor: transaction.amount, reference: `topup:${reference}`, description: "Verified Paystack wallet top-up", createdById: req.user.id } });
        await tx.wallet.update({ where: { id: wallet.id }, data: { balanceMinor: { increment: transaction.amount } } });
      }
      return { credited: !existing, balanceMinor: await subscriptionWalletBalance(tx, wallet.id) };
    });
    res.json(result);
  });
  app.post("/api/auth/renewal/wallet", authenticate, async (req, res) => {
    if (req.user.role !== "ADMIN") throw new HttpError(403, "School administrator access required");
    const result = await db.$transaction(async (tx) => {
      const subscriptionId = req.user.organization.subscriptions[0]?.id;
      if (!subscriptionId) throw new HttpError(404, "No subscription found");
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${subscriptionId} FOR UPDATE`;
      const subscription = await tx.subscription.findFirst({ where: { id: subscriptionId, organizationId: req.user.organizationId }, include: { plan: true } });
      if (!subscription) throw new HttpError(404, "No subscription found");
      const now = new Date();
      const dueAt = subscription.currentPeriodEnd || subscription.trialEndsAt;
      if (["ACTIVE", "TRIALING"].includes(subscription.status) && dueAt && dueAt.getTime() - now.getTime() > 7 * 86400000)
        throw new HttpError(409, "Subscription renewal opens seven days before it is due");
      const wallet = await tx.wallet.findUnique({ where: { organizationId: req.user.organizationId } });
      if (!wallet || wallet.currency !== subscription.plan.currency) throw new HttpError(402, "Add verified funds to your wallet first");
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;
      const lockedWallet = await tx.wallet.findUnique({ where: { id: wallet.id } });
      const available = await subscriptionWalletBalance(tx, wallet.id);
      const amount = subscription.plan.amountMinor;
      if (available < amount || lockedWallet.balanceMinor < amount) throw new HttpError(402, "Verified wallet funds are insufficient for this renewal");
      if (subscription.paystackSubscriptionCode && subscription.paystackEmailToken) {
        await paystack("/subscription/disable", { method: "POST", body: JSON.stringify({ code: subscription.paystackSubscriptionCode, token: subscription.paystackEmailToken }) });
      }
      const start = dueAt && dueAt > now ? dueAt : now;
      const periodEnd = nextSubscriptionPeriod(start, subscription.plan.interval);
      await tx.wallet.update({ where: { id: wallet.id }, data: { balanceMinor: { decrement: amount } } });
      await tx.walletTransaction.create({ data: { walletId: wallet.id, type: "DEBIT", amountMinor: amount, reference: `subscription:${randomBytes(18).toString("hex")}`, description: `${subscription.plan.name} subscription renewal`, createdById: req.user.id } });
      await tx.subscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE", currentPeriodStart: start, currentPeriodEnd: periodEnd, nextChargeAt: periodEnd, cancelledAt: null, paystackSubscriptionCode: null, paystackEmailToken: null } });
      return { ok: true, periodEnd, balanceMinor: available - amount };
    });
    res.json(result);
  });
  app.post("/api/auth/renewal/initialize", authenticate, async (req, res) => {
    if (req.user.role !== "ADMIN")
      throw new HttpError(403, "School administrator access required");
    const subscription = req.user.organization.subscriptions[0];
    if (!subscription) throw new HttpError(404, "No subscription found");
    if (tenantAccessAllowed(req.user))
      throw new HttpError(409, "Subscription is already active");
    const reference = `renew_${randomBytes(18).toString("hex")}`;
    const transaction = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: req.user.email,
        amount: subscription.plan.amountMinor,
        currency: subscription.plan.currency,
        reference,
        channels: ["card"],
        callback_url: `${config.APP_ORIGINS[0]}/renew?reference=${reference}`,
        metadata: {
          purpose: "schoolhouse_renewal",
          organizationId: req.user.organizationId,
          planId: subscription.planId,
        },
      }),
    });
    res.json({ authorizationUrl: transaction.authorization_url });
  });
  app.post("/api/auth/renewal/verify", authenticate, async (req, res) => {
    if (req.user.role !== "ADMIN")
      throw new HttpError(403, "School administrator access required");
    const { reference } = z
      .object({ reference: z.string().regex(/^renew_[a-f0-9]{36}$/) })
      .strict()
      .parse(req.body);
    const subscription = req.user.organization.subscriptions[0];
    if (!subscription) throw new HttpError(404, "No subscription found");
    const transaction = await paystack(`/transaction/verify/${reference}`);
    const metadata =
      typeof transaction.metadata === "string"
        ? JSON.parse(transaction.metadata)
        : transaction.metadata;
    if (
      transaction.status !== "success" ||
      transaction.reference !== reference ||
      transaction.amount !== subscription.plan.amountMinor ||
      transaction.currency !== subscription.plan.currency ||
      transaction.customer?.email?.toLowerCase() !==
        req.user.email.toLowerCase() ||
      metadata?.purpose !== "schoolhouse_renewal" ||
      metadata.organizationId !== req.user.organizationId ||
      metadata.planId !== subscription.planId
    )
      throw new HttpError(402, "Payment could not be verified for this school");
    const paidAt = new Date(transaction.paid_at || transaction.paidAt);
    if (Number.isNaN(paidAt.getTime()))
      throw new HttpError(502, "Payment date could not be verified");
    const periodEnd = new Date(paidAt);
    if (
      subscription.plan.interval === "annually" ||
      subscription.plan.interval === "annual"
    )
      periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
    else periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: paidAt,
        currentPeriodEnd: periodEnd,
        nextChargeAt: periodEnd,
        cancelledAt: null,
      },
    });
    res.json({ ok: true, periodEnd });
  });
  app.patch("/api/auth/profile", authenticate, async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(120),
        phone: z.string().trim().max(50).default(""),
        address: z.string().trim().max(1000).default(""),
      })
      .strict()
      .parse(req.body);
    const user = await db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: req.user.id },
        data: input,
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "account.profile.update",
          entityId: req.user.id,
          organizationId: req.user.organizationId,
        },
      });
      return updated;
    });
    res.json({ user: { ...publicUser(req.user), ...input, id: user.id } });
  });
  app.post("/api/auth/change-password", authenticate, async (req, res) => {
    const input = z
      .object({
        currentPassword: z.string().min(1).max(128),
        newPassword: z.string().min(12).max(128),
      })
      .strict()
      .parse(req.body);
    if (!(await bcrypt.compare(input.currentPassword, req.user.passwordHash)))
      throw new HttpError(400, "Current password is incorrect");
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await db.$transaction([
      db.user.update({ where: { id: req.user.id }, data: { passwordHash } }),
      db.session.deleteMany({
        where: { userId: req.user.id, id: { not: req.session.id } },
      }),
      db.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "account.password.change",
          entityId: req.user.id,
          organizationId: req.user.organizationId,
        },
      }),
    ]);
    res.json({ ok: true });
  });
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
