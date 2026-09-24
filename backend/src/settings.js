import { networkInterfaces } from 'node:os';
import { db } from './db.js';
import { config } from './config.js';
import { featureSnapshot } from './features.js';
export const defaultGradingScale = [
  { grade:'A', min:70, remark:'Excellent' }, { grade:'B', min:60, remark:'Very good' },
  { grade:'C', min:50, remark:'Good' }, { grade:'D', min:45, remark:'Fair' },
  { grade:'E', min:40, remark:'Pass' }, { grade:'F', min:0, remark:'Needs improvement' }
];
export const defaults = { id:'global', schoolName:'Schoolhouse', shortName:'SH', tagline:'Your school. Connected.', primaryColor:'#103d36', accentColor:'#e9f2c8', academicYear:'', currentTerm:'', defaultCurrency:'NGN', locale:'en-NG', timeZone:'Africa/Lagos', autosaveSeconds:5, kioskFullscreen:true, remoteEnabled:false, remoteUrl:'', allowedOrigins:'', logoPath:'', watermarkPath:'', address:'', contactEmail:'', contactPhone:'', gradingScale:defaultGradingScale, passingMark:40, syncEnabled:false, hostelEnabled:false, activeSessionId:null, activeTermId:null, principalName:'', principalSignaturePath:'' };
let cached, expires = 0;
export async function getSettings() {
  if (cached && Date.now() < expires) return cached;
  try { cached = await db.appSetting.upsert({ where:{id:'global'}, create:defaults, update:{} }); }
  catch { cached = defaults; }
  expires = Date.now() + 15000; return cached;
}
export function clearSettingsCache() { expires = 0; }
export function connectionDefaults() {
  const rank=host=>host.startsWith('192.168.')?0:host.startsWith('10.')?1:/^172\.(1[6-9]|2\d|3[01])\./.test(host)?2:3;
  const detectedHosts=[...new Set(Object.values(networkInterfaces()).flat().filter(item=>item&&item.family==='IPv4'&&!item.internal).map(item=>item.address))].sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b));
  const hosts=config.CONNECTION_HOST?[config.CONNECTION_HOST]:detectedHosts;
  const standardPort=(config.CONNECTION_SCHEME==='http'&&config.CONNECTION_PORT===80)||(config.CONNECTION_SCHEME==='https'&&config.CONNECTION_PORT===443);
  const suffix=standardPort?'':`:${config.CONNECTION_PORT}`;
  const lanUrls=hosts.map(host=>`${config.CONNECTION_SCHEME}://${host}${suffix}/`);
  return {scheme:config.CONNECTION_SCHEME,port:config.CONNECTION_PORT,hostOverride:config.CONNECTION_HOST,detectedHosts,lanUrls,recommendedUrl:lanUrls[0]||`${config.CONNECTION_SCHEME}://localhost${suffix}/`};
}
export async function originAllowed(origin) {
  if (!origin) return false;
  try { if (config.APP_ORIGINS.includes(new URL(origin).origin)) return true; } catch { return false; }
  if(connectionDefaults().lanUrls.some(value=>new URL(value).origin===new URL(origin).origin))return true;
  if (!config.FEATURE_REMOTE_ACCESS) return false;
  const settings = await getSettings();
  if (!settings.remoteEnabled) return false;
  return [settings.remoteUrl,...settings.allowedOrigins.split(/\r?\n|,/)].map(value => value.trim()).filter(Boolean).some(value => {
    try { return new URL(value).origin === new URL(origin).origin; } catch { return false; }
  });
}
export const publicSettings = s => ({ schoolName:s.schoolName, shortName:s.shortName, tagline:s.tagline, primaryColor:s.primaryColor, accentColor:s.accentColor, academicYear:s.academicYear, currentTerm:s.currentTerm, defaultCurrency:s.defaultCurrency, locale:s.locale, timeZone:s.timeZone, autosaveSeconds:s.autosaveSeconds, kioskFullscreen:s.kioskFullscreen, hostelEnabled:config.FEATURE_HOSTEL&&s.hostelEnabled, features:featureSnapshot(s), logoUrl:s.logoPath ? `/api/assets/${s.logoPath}` : '', watermarkUrl:s.watermarkPath ? `/api/assets/${s.watermarkPath}` : '' });
