import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const bool = z.enum(['true', 'false']).default('false').transform(v => v === 'true');
const enabled = z.enum(['true', 'false']).default('true').transform(v => v === 'true');
const featureKeys=['CBT','ASSIGNMENTS','LIBRARY','ATTENDANCE','REPORTS','HOSTEL','PAYMENTS','CLOUD_SYNC','COMMUNICATIONS','EMAIL','SMS'];
const featureFileSchema=z.object(Object.fromEntries(featureKeys.map(key=>[key.toLowerCase(),z.boolean()]))).strict();
const projectRoot=fileURLToPath(new URL('../../',import.meta.url));
const featureFilePath=process.env.FEATURE_SETTINGS_FILE
  ? resolve(projectRoot,process.env.FEATURE_SETTINGS_FILE)
  : fileURLToPath(new URL('../../config/features.json',import.meta.url));
let featureFile;
try { featureFile=featureFileSchema.parse(JSON.parse(readFileSync(featureFilePath,'utf8'))); }
catch (error) { throw new Error(`Invalid feature settings file ${featureFilePath}: ${error.message}`); }
const rawConfig={...process.env};
for(const key of featureKeys) rawConfig[`FEATURE_${key}`]??=String(featureFile[key.toLowerCase()]);
export const config = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  DATABASE_URL: z.string().min(1).refine(
    v => v.startsWith('postgresql://') || v.startsWith('postgres://'),
    'DATABASE_URL must start with postgresql:// or postgres://'
  ),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ORIGINS: z.string().min(1).transform(v => v.split(',').map(x => new URL(x.trim()).origin)),
  COOKIE_SECURE: bool, COOKIE_SAME_SITE: z.enum(['strict','lax','none']).default('strict'), TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(0),
  SESSION_HOURS: z.coerce.number().min(1).max(24).default(12),
  SITE_ID: z.string().min(1).max(100), CLOUD_SYNC_URL: z.string().default(''),
  CLOUD_SYNC_TOKEN: z.string().default(''), SYNC_INTERVAL_MS: z.coerce.number().min(1000).default(15000),
  LOG_LEVEL: z.string().default('info'),
  FEATURE_CBT: enabled, FEATURE_ASSIGNMENTS: enabled, FEATURE_LIBRARY: enabled, FEATURE_ATTENDANCE: enabled,
  FEATURE_REPORTS: enabled, FEATURE_HOSTEL: enabled, FEATURE_PAYMENTS: enabled, FEATURE_CLOUD_SYNC: enabled,
  FEATURE_COMMUNICATIONS: enabled, FEATURE_EMAIL: enabled, FEATURE_SMS: enabled,
  MAIL_TRANSPORT: z.enum(['disabled','smtp','console']).default('disabled'),
  SMTP_HOST: z.string().default(''), SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587), SMTP_SECURE: bool,
  SMTP_USER: z.string().default(''), SMTP_PASS: z.string().default(''), SMTP_FROM: z.string().max(320).refine(v=>!/[\r\n]/.test(v),'SMTP_FROM must be one line').default(''),
  SMS_TRANSPORT: z.enum(['disabled','generic','twilio','console']).default('disabled'),
  SMS_API_URL: z.string().default(''), SMS_API_TOKEN: z.string().default(''), SMS_SENDER_ID: z.string().regex(/^[A-Za-z0-9 ._-]{1,20}$/,'SMS_SENDER_ID contains unsupported characters').default('Schoolhouse'),
  TWILIO_ACCOUNT_SID: z.string().default(''), TWILIO_AUTH_TOKEN: z.string().default(''), TWILIO_FROM: z.string().max(30).default(''),
  COMMUNICATION_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  COMMUNICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  // npm workspaces start the API with backend/ as process.cwd(). Resolve the
  // configured path from the project root so local, LAN and maintenance tasks
  // always use the same persistent upload directory.
  UPLOAD_DIR: z.string().default('./data/uploads').transform(value => resolve(projectRoot, value)),
  FIREBASE_STORAGE_BUCKET: z.string().trim().default(''),
  CLOUD_SQL_INSTANCE: z.string().trim().default(''),
  FIREBASE_DATA_CONNECT_ENABLED: bool
  ,PAYSTACK_SECRET_KEY: z.string().trim().default('')
  ,PAYSTACK_TOKEN_AMOUNT: z.coerce.number().int().min(5000).default(5000)
  ,RESEND_API_KEY: z.string().trim().default('')
  ,RESEND_FROM: z.string().trim().default('Schoolhouse <onboarding@resend.dev>')
  ,PLATFORM_ADMIN_EMAIL: z.string().email().default('admin@techinvasion.com.ng')
  ,PLATFORM_ADMIN_PASSWORD: z.string().max(128).refine(value=>!value||value.length>=8,'Platform password must contain at least 8 characters').default('')
}).parse(rawConfig);
if (config.FEATURE_CLOUD_SYNC && config.CLOUD_SYNC_URL) {
  const url = new URL(config.CLOUD_SYNC_URL);
  if (config.NODE_ENV !== 'test' && url.protocol !== 'https:') throw new Error('Cloud sync requires HTTPS');
  if (config.CLOUD_SYNC_TOKEN.length < 32) throw new Error('Cloud token must contain at least 32 characters');
}

if (config.COOKIE_SAME_SITE === 'none' && !config.COOKIE_SECURE) throw new Error('SameSite=None cookies require COOKIE_SECURE=true');
if (config.NODE_ENV === 'production' && ['console'].includes(config.MAIL_TRANSPORT)) throw new Error('Console email transport is not allowed in production');
if (config.NODE_ENV === 'production' && ['console'].includes(config.SMS_TRANSPORT)) throw new Error('Console SMS transport is not allowed in production');
if (config.FEATURE_EMAIL && config.MAIL_TRANSPORT === 'smtp' && (!config.SMTP_HOST || !config.SMTP_FROM)) throw new Error('SMTP_HOST and SMTP_FROM are required for SMTP email');
if (config.FEATURE_SMS && config.SMS_TRANSPORT === 'generic') {
  const url=new URL(config.SMS_API_URL);
  if(config.NODE_ENV!=='test'&&url.protocol!=='https:')throw new Error('The SMS API requires HTTPS');
  if(!config.SMS_API_TOKEN)throw new Error('SMS_API_TOKEN is required for the generic SMS transport');
}
if (config.FEATURE_SMS && config.SMS_TRANSPORT === 'twilio' && (!config.TWILIO_ACCOUNT_SID||!config.TWILIO_AUTH_TOKEN||!config.TWILIO_FROM)) throw new Error('Twilio credentials and sender number are required');
if (config.FEATURE_SMS && config.SMS_TRANSPORT === 'twilio' && !/^\+?[0-9]{7,20}$/.test(config.TWILIO_FROM)) throw new Error('TWILIO_FROM must be a valid sender number');
