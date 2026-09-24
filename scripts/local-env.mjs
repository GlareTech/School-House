import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import dotenv from 'dotenv';
const previous = existsSync('.env') ? dotenv.parse(readFileSync('.env')) : {};
const password = previous.ADMIN_PASSWORD && !previous.ADMIN_PASSWORD.includes('replace_with') ? previous.ADMIN_PASSWORD : randomBytes(24).toString('base64url');
const values = {
  DATABASE_PROVIDER: 'sqlserver', DATABASE_URL: 'sqlserver://127.0.0.1:14333;database=Schoolhouse;integratedSecurity=true;encrypt=true;trustServerCertificate=true;connectionLimit=20',
  CACHE_BACKEND: 'memory', REDIS_URL: 'redis://127.0.0.1:6379', PORT: '3000',
  APP_ORIGINS: 'http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5173,http://localhost:5173',
  COOKIE_SECURE: 'false', TRUST_PROXY: '0', SESSION_HOURS: '12', SITE_ID: 'schoolhouse-local',
  ADMIN_EMAIL: 'admin@school.local', ADMIN_NAME: 'School Administrator', ADMIN_PASSWORD: password,
  CLOUD_SYNC_URL: '', CLOUD_SYNC_TOKEN: '', SYNC_INTERVAL_MS: '15000', LOG_LEVEL: 'info'
};
writeFileSync('.env', Object.entries(values).map(([key,value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
mkdirSync('../../outputs', { recursive: true });
writeFileSync('../../outputs/LOCAL-ACCESS.txt', `Schoolhouse local setup\n\nApp: http://127.0.0.1:4173/\nSQL Server: 127.0.0.1,14333 (SQLEXPRESS)\nDatabase: Schoolhouse\nDatabase authentication: your Windows account\n\nAdministrator email: admin@school.local\nAdministrator password: ${password}\n\nKeep this file private. SQL Server credentials are not stored; Windows integrated authentication is used.\nLocal cache: single-process memory (install/configure Redis before production).\n`, { mode: 0o600 });
console.log('Local configuration and private access file created; no credentials printed.');
