import { config } from './config.js';
import { HttpError } from './domain.js';

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
  sms: config.FEATURE_COMMUNICATIONS && config.FEATURE_SMS
};
export const featureSnapshot = settings => ({...values,hostel:values.hostel && settings?.hostelEnabled !== false});
export function requireFeature(name) {
  return (req,res,next) => values[name] ? next() : next(new HttpError(404,'This module is disabled by the server administrator'));
}
const gate = rules => (req,res,next) => {
  const match=rules.find(([prefix])=>req.path.startsWith(prefix));
  return !match || values[match[1]] ? next() : next(new HttpError(404,'This module is disabled by the server administrator'));
};
const adminGate=gate([
  ['/exams','cbt'],['/monitor','cbt'],['/results','cbt'],['/attendance','attendance'],
  ['/payments','payments'],['/sync','cloudSync']
]);
export const adminFeatureGate=(req,res,next)=>req.path.startsWith('/results/import')?next():adminGate(req,res,next);
export const academicFeatureGate=gate([
  ['/assignments','assignments'],['/submissions','assignments'],['/library','library'],['/materials','library'],
  ['/attendance','attendance'],['/reports','reports'],['/progress-reports','reports'],['/promotions','reports'],['/ratings','reports']
]);
export const featureEnabled=name=>Boolean(values[name]);
