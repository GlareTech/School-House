import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db.js";
import { config } from "./config.js";
import { HttpError } from "./domain.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const cookieOptions = {
  httpOnly: true,
  sameSite: config.COOKIE_SAME_SITE,
  secure: config.COOKIE_SECURE,
  path: "/",
  priority: "high",
};

async function authenticatePlatform(req, _res, next) {
  const token = req.cookies.school_platform_session;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(401, "Platform administrator sign-in required");
  const session = await db.platformSession.findUnique({
    where: { id: hash(token) },
    include: { admin: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.admin.active)
    throw new HttpError(401, "Platform administrator sign-in required");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers["x-csrf-token"] !== session.csrf
  )
    throw new HttpError(403, "Invalid CSRF token");
  req.platformAdmin = session.admin;
  req.platformSession = session;
  next();
}

export async function ensurePlatformAdmin() {
  if (!config.PLATFORM_ADMIN_PASSWORD) return;
  const email = config.PLATFORM_ADMIN_EMAIL.toLowerCase();
  const passwordHash = await bcrypt.hash(config.PLATFORM_ADMIN_PASSWORD, 12);
  await db.platformAdmin.upsert({
    where: { email },
    create: { email, name: "Platform Administrator", passwordHash },
    update: { active: true, passwordHash },
  });
}

export function platformRouter() {
  const r = Router();
  r.post("/login", async (req, res) => {
    const input = z
      .object({
        email: z
          .string()
          .email()
          .transform((x) => x.toLowerCase()),
        password: z.string().max(128),
      })
      .parse(req.body);
    const admin = await db.platformAdmin.findUnique({
        where: { email: input.email },
      }),
      valid = await bcrypt.compare(
        input.password,
        admin?.passwordHash ||
          "$2b$12$C6UzMDM.H6dfI/f/IKcEe.6JdB5vCkDmrxRerAY.VnwkAebwkNQpe",
      );
    if (!admin?.active || !valid)
      throw new HttpError(401, "Invalid platform administrator credentials");
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(32).toString("hex"),
      expiresAt = new Date(Date.now() + config.SESSION_HOURS * 3600000);
    await db.$transaction(async (tx) => {
      await tx.platformSession.deleteMany({ where: { adminId: admin.id } });
      await tx.platformSession.create({
        data: { id: hash(token), adminId: admin.id, csrf, expiresAt },
      });
      await tx.platformAdmin.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      });
    });
    res
      .cookie("school_platform_session", token, {
        ...cookieOptions,
        expires: expiresAt,
      })
      .json({ admin: { name: admin.name, email: admin.email }, csrf });
  });
  r.get("/me", authenticatePlatform, (req, res) =>
    res.json({
      admin: { name: req.platformAdmin.name, email: req.platformAdmin.email },
      csrf: req.platformSession.csrf,
    }),
  );
  r.post("/logout", authenticatePlatform, async (req, res) => {
    await db.platformSession.delete({ where: { id: req.platformSession.id } });
    res
      .clearCookie("school_platform_session", cookieOptions)
      .json({ ok: true });
  });
  r.get("/plans", authenticatePlatform, async (_req, res) => {
    const plans = await db.subscriptionPlan.findMany({
      orderBy: { amountMinor: "asc" },
    });
    res.json(
      plans.map((plan) => ({
        ...plan,
        features: Array.isArray(plan.features) ? plan.features : [],
      })),
    );
  });
  r.post("/plans", authenticatePlatform, async (req, res) => {
    const input = z
      .object({
        code: z.string().trim().min(1).max(64).optional(),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional(),
        amountMinor: z
          .number()
          .int()
          .min(0)
          .or(z.string().transform((value) => Number(value)))
          .default(0),
        maxStudents: z
          .number()
          .int()
          .min(0)
          .or(z.string().transform((value) => Number(value)))
          .default(0),
        interval: z.string().trim().max(32).optional(),
        currency: z.string().trim().length(3).optional(),
        active: z.boolean().optional(),
        features: z.array(z.string().trim().min(1).max(160)).default([]),
      })
      .parse(req.body);
    const planCode =
      (input.code || input.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `plan-${Date.now()}`;
    const plan = await db.subscriptionPlan.create({
      data: {
        code: planCode,
        name: input.name,
        description: input.description || input.name,
        amountMinor: Number(input.amountMinor),
        maxStudents: Number(input.maxStudents),
        interval: input.interval || "monthly",
        currency: (input.currency || "NGN").toUpperCase(),
        active: input.active !== false,
        features: input.features,
      },
    });
    res
      .status(201)
      .json({
        ...plan,
        features: Array.isArray(plan.features) ? plan.features : [],
      });
  });
  r.put("/plans/:id", authenticatePlatform, async (req, res) => {
    const input = z
      .object({
        code: z.string().trim().min(1).max(64).optional(),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(500).optional(),
        amountMinor: z
          .number()
          .int()
          .min(0)
          .or(z.string().transform((value) => Number(value)))
          .optional(),
        maxStudents: z
          .number()
          .int()
          .min(0)
          .or(z.string().transform((value) => Number(value)))
          .optional(),
        interval: z.string().trim().max(32).optional(),
        currency: z.string().trim().length(3).optional(),
        active: z.boolean().optional(),
        features: z.array(z.string().trim().min(1).max(160)).optional(),
      })
      .parse(req.body);
    const data = {};
    if (input.code !== undefined)
      data.code = input.code
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.amountMinor !== undefined)
      data.amountMinor = Number(input.amountMinor);
    if (input.maxStudents !== undefined)
      data.maxStudents = Number(input.maxStudents);
    if (input.interval !== undefined) data.interval = input.interval;
    if (input.currency !== undefined)
      data.currency = input.currency.toUpperCase();
    if (input.active !== undefined) data.active = input.active;
    if (input.features !== undefined) data.features = input.features;
    const plan = await db.subscriptionPlan.update({
      where: { id: req.params.id },
      data,
    });
    res.json({
      ...plan,
      features: Array.isArray(plan.features) ? plan.features : [],
    });
  });
  r.get("/dashboard", authenticatePlatform, async (_req, res) => {
    const [organizations, activeTrials, activeSubscriptions, totalUsers] =
      await Promise.all([
        db.organization.findMany({
          include: {
            subscriptions: {
              include: { plan: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            _count: { select: { users: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 250,
        }),
        db.subscription.count({ where: { status: "TRIALING" } }),
        db.subscription.count({ where: { status: "ACTIVE" } }),
        db.user.count(),
      ]);
    const monthlyRevenueMinor = organizations.reduce(
      (sum, o) =>
        sum +
        (o.subscriptions[0]?.status === "ACTIVE"
          ? o.subscriptions[0].plan.amountMinor
          : 0),
      0,
    );
    res.json({
      metrics: {
        organizations: organizations.length,
        activeTrials,
        activeSubscriptions,
        totalUsers,
        monthlyRevenueMinor,
      },
      organizations: organizations.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        active: o.active,
        trialEndsAt: o.trialEndsAt,
        createdAt: o.createdAt,
        userCount: o._count.users,
        subscription: o.subscriptions[0] || null,
      })),
    });
  });
  r.patch("/organizations/:id", authenticatePlatform, async (req, res) => {
    const input = z
      .object({
        active: z.boolean().optional(),
        planId: z.string().min(1).optional(),
      })
      .refine((x) => Object.keys(x).length > 0, "Provide an account change")
      .parse(req.body);
    const organization = await db.organization.findUnique({
      where: { id: req.params.id },
      include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!organization) throw new HttpError(404, "School workspace not found");
    await db.$transaction(async (tx) => {
      if (input.active !== undefined) {
        await tx.organization.update({
          where: { id: organization.id },
          data: { active: input.active },
        });
        if (!input.active)
          await tx.session.deleteMany({
            where: { user: { organizationId: organization.id } },
          });
      }
      if (input.planId) {
        const plan = await tx.subscriptionPlan.findFirst({
          where: { id: input.planId, active: true },
        });
        if (!plan)
          throw new HttpError(400, "Choose an active subscription plan");
        const subscription = organization.subscriptions[0];
        if (subscription)
          await tx.subscription.update({
            where: { id: subscription.id },
            data: { planId: plan.id },
          });
        else {
          const now = new Date(),
            trialEndsAt = new Date(Date.now() + 7 * 86400000);
          await tx.subscription.create({
            data: {
              organizationId: organization.id,
              planId: plan.id,
              status: "TRIALING",
              trialStartsAt: now,
              trialEndsAt,
            },
          });
        }
      }
    });
    res.json({ ok: true });
  });
  r.delete("/organizations/:id", authenticatePlatform, async (req, res) => {
    const organization = await db.organization.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!organization) throw new HttpError(404, "School workspace not found");
    await db.organization.delete({ where: { id: organization.id } });
    res.json({ ok: true });
  });
  return r;
}
