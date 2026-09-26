import { config } from "./config.js";
import { HttpError } from "./domain.js";

const values = {
  cbt: config.FEATURE_CBT,
  assignments: config.FEATURE_ASSIGNMENTS,
  library: config.FEATURE_LIBRARY,
  attendance: config.FEATURE_ATTENDANCE,
  reports: config.FEATURE_REPORTS,
  hostel: config.FEATURE_HOSTEL,
  payments: config.FEATURE_PAYMENTS,
  cloudSync: config.FEATURE_CLOUD_SYNC,
  communications: config.FEATURE_COMMUNICATIONS,
  email: config.FEATURE_COMMUNICATIONS && config.FEATURE_EMAIL,
  sms: config.FEATURE_COMMUNICATIONS && config.FEATURE_SMS,
};
export const featureSnapshot = (settings) => ({
  ...values,
  hostel: values.hostel && settings?.hostelEnabled !== false,
});
const planLabels = {
  cbt: ["CBT Tests", "Examinations"],
  assignments: ["Assignments and grading", "Academic command centre"],
  library: ["Library", "Academic command centre"],
  attendance: ["Attendance and behaviour"],
  reports: ["Progress Report", "Progress reports", "Reports and analytics"],
  hostel: ["Hostel and facilities"],
  payments: ["Billing and payments"],
  cloudSync: ["Cloud sync"],
  communications: ["Communication hub"],
  email: ["Communication hub", "Provider settings"],
  sms: ["Communication hub", "Provider settings"],
};
export const planAllows = (features, name) =>
  !Array.isArray(features) ||
  features.some((item) => (planLabels[name] || []).includes(item));
export const tenantFeatureSnapshot = (settings, features) =>
  Object.fromEntries(
    Object.entries(featureSnapshot(settings)).map(([name, enabled]) => [
      name,
      enabled && planAllows(features, name),
    ]),
  );
export function requireFeature(name) {
  return (req, res, next) =>
    !values[name]
      ? next(
          new HttpError(
            404,
            "This module is disabled by the server administrator",
          ),
        )
      : planAllows(
            req.user?.organization?.subscriptions?.[0]?.plan?.features,
            name,
          )
        ? next()
        : next(
            new HttpError(
              403,
              "This module is not included in your school subscription",
            ),
          );
}
const gate = (rules) => (req, res, next) => {
  const match = rules.find(([prefix]) => req.path.startsWith(prefix));
  if (!match) return next();
  const name = match[1];
  if (!values[name])
    return next(
      new HttpError(404, "This module is disabled by the server administrator"),
    );
  return planAllows(
    req.user?.organization?.subscriptions?.[0]?.plan?.features,
    name,
  )
    ? next()
    : next(
        new HttpError(
          403,
          "This module is not included in your school subscription",
        ),
      );
};
const adminGate = gate([
  ["/exams", "cbt"],
  ["/monitor", "cbt"],
  ["/results", "cbt"],
  ["/attendance", "attendance"],
  ["/payments", "payments"],
  ["/providers", "communications"],
  ["/sync", "cloudSync"],
]);
export const adminFeatureGate = (req, res, next) =>
  req.path.startsWith("/results/import") ? next() : adminGate(req, res, next);
export const academicFeatureGate = gate([
  ["/assignments", "assignments"],
  ["/submissions", "assignments"],
  ["/library", "library"],
  ["/materials", "library"],
  ["/attendance", "attendance"],
  ["/reports", "reports"],
  ["/progress-reports", "reports"],
  ["/promotions", "reports"],
  ["/ratings", "reports"],
]);
export const featureEnabled = (name) => Boolean(values[name]);
