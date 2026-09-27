import { createHash } from "node:crypto";
import { db, cache, logger } from "./db.js";

const digest = (value) =>
  createHash("sha256").update(String(value)).digest("hex");
let settingsCache = { value: null, expires: 0 };
export const ipHash = (req) =>
  digest(req.ip || req.socket?.remoteAddress || "unknown");
export function clearSecuritySettings() {
  settingsCache.expires = 0;
}
async function settings() {
  if (settingsCache.value && settingsCache.expires > Date.now())
    return settingsCache.value;
  const value = await db.securitySetting.upsert({
    where: { id: "platform" },
    create: { id: "platform" },
    update: {},
  });
  settingsCache = { value, expires: Date.now() + 10000 };
  return value;
}
const attackPatterns = [
  [/<\/?(?:script|iframe|object|embed|svg)\b/i, "XSS_PATTERN"],
  [
    /(?:union\s+select|or\s+['"]?1['"]?\s*=\s*['"]?1|sleep\s*\(|information_schema)/i,
    "SQL_INJECTION_PATTERN",
  ],
  [/(?:\.\.\/|\.\.\\|%2e%2e%2f)/i, "PATH_TRAVERSAL_PATTERN"],
  [/(?:\$where|__proto__|constructor\s*\[)/i, "OBJECT_INJECTION_PATTERN"],
];
async function record(req, { severity, kind, detail, blocked }) {
  try {
    await db.securityEvent.create({
      data: {
        severity,
        kind,
        detail: String(detail || "").slice(0, 500),
        blocked,
        ipHash: ipHash(req),
        method: req.method,
        path: req.path.slice(0, 500),
        userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
      },
    });
  } catch (error) {
    logger.warn({ err: error, kind }, "Security event could not be recorded");
  }
}
export async function intrusionDetection(req, res, next) {
  try {
    if (req.path.startsWith("/api/health/")) return next();
    const policy = await settings(),
      fingerprint = ipHash(req);
    if (
      Array.isArray(policy.blockedIpHashes) &&
      policy.blockedIpHashes.includes(fingerprint)
    ) {
      await record(req, {
        severity: "HIGH",
        kind: "BLOCKED_IP",
        blocked: true,
      });
      return res
        .status(403)
        .json({ error: "Request blocked by platform security policy" });
    }
    const minute = Math.floor(Date.now() / 60000),
      count = await cache.increment(`ids:${fingerprint}:${minute}`, 70000);
    if (count > policy.requestsPerMinute) {
      await record(req, {
        severity: "HIGH",
        kind: "RATE_LIMIT",
        detail: `${count} requests in current minute`,
        blocked: true,
      });
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ error: "Too many requests" });
    }
    const sample = `${req.originalUrl} ${req.headers["user-agent"] || ""} ${req.body && typeof req.body === "object" ? JSON.stringify(req.body).slice(0, 5000) : ""}`;
    const match = attackPatterns.find(([pattern]) => pattern.test(sample));
    if (match) {
      const blocked = policy.mode === "BLOCK";
      await record(req, {
        severity: "HIGH",
        kind: match[1],
        detail: "Suspicious request pattern detected",
        blocked,
      });
      if (blocked)
        return res
          .status(403)
          .json({ error: "Request blocked by platform security policy" });
    }
    next();
  } catch (error) {
    logger.error({ err: error }, "Intrusion detection failed open");
    next();
  }
}
