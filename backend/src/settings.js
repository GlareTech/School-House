import { db } from "./db.js";
import { config } from "./config.js";
import { featureSnapshot } from "./features.js";
import { currentTenantId } from "./tenant-context.js";
export const defaultGradingScale = [
  { grade: "A", min: 70, remark: "Excellent" },
  { grade: "B", min: 60, remark: "Very good" },
  { grade: "C", min: 50, remark: "Good" },
  { grade: "D", min: 45, remark: "Fair" },
  { grade: "E", min: 40, remark: "Pass" },
  { grade: "F", min: 0, remark: "Needs improvement" },
];
export const defaults = {
  schoolName: "Schoolhouse",
  shortName: "SH",
  tagline: "Your school. Connected.",
  primaryColor: "#103d36",
  accentColor: "#e9f2c8",
  academicYear: "",
  currentTerm: "",
  defaultCurrency: "NGN",
  locale: "en-NG",
  timeZone: "Africa/Lagos",
  autosaveSeconds: 5,
  kioskFullscreen: true,
  logoPath: "",
  watermarkPath: "",
  address: "",
  contactEmail: "",
  contactPhone: "",
  gradingScale: defaultGradingScale,
  passingMark: 40,
  syncEnabled: false,
  hostelEnabled: false,
  staffResumptionTime: "08:00",
  staffLateAfterTime: "08:15",
  activeSessionId: null,
  activeTermId: null,
  principalName: "",
  principalSignaturePath: "",
};
const settingsCache = new Map();
export async function getSettings() {
  const organizationId = currentTenantId();
  if (!organizationId) return defaults;
  const hit = settingsCache.get(organizationId);
  if (hit && Date.now() < hit.expires) return hit.value;
  let value;
  try {
    value =
      (await db.appSetting.findFirst()) ||
      (await db.appSetting.create({ data: { ...defaults, organizationId } }));
  } catch {
    value = defaults;
  }
  settingsCache.set(organizationId, { value, expires: Date.now() + 15000 });
  return value;
}
export function clearSettingsCache() {
  settingsCache.clear();
}
export async function originAllowed(origin) {
  if (!origin) return false;
  try {
    if (config.APP_ORIGINS.includes(new URL(origin).origin)) return true;
  } catch {
    return false;
  }
  return false;
}
export const publicSettings = (s) => ({
  schoolName: s.schoolName,
  shortName: s.shortName,
  tagline: s.tagline,
  primaryColor: s.primaryColor,
  accentColor: s.accentColor,
  academicYear: s.academicYear,
  currentTerm: s.currentTerm,
  defaultCurrency: s.defaultCurrency,
  locale: s.locale,
  timeZone: s.timeZone,
  autosaveSeconds: s.autosaveSeconds,
  kioskFullscreen: s.kioskFullscreen,
  hostelEnabled: config.FEATURE_HOSTEL && s.hostelEnabled,
  features: featureSnapshot(s),
  logoUrl: s.logoPath ? `/api/assets/${s.logoPath}` : "",
  watermarkUrl: s.watermarkPath ? `/api/assets/${s.watermarkPath}` : "",
});
