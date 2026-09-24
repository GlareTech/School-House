import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuthTypes, Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import Redis from 'ioredis';
import pino from 'pino';
import { config } from './config.js';
import { configureClient } from './provider.js';
import { MemoryCache } from './memory-cache.js';
export const logger = pino({ level: config.LOG_LEVEL, redact: ['password', 'token', 'headers.cookie', 'headers.authorization'] });
async function createDatabaseClient() {
  if (!config.CLOUD_SQL_INSTANCE) return new PrismaClient();

  const databaseUrl = new URL(config.DATABASE_URL);
  const connector = new Connector();
  const connectionOptions = await connector.getOptions({
    instanceConnectionName: config.CLOUD_SQL_INSTANCE,
    ipType: IpAddressTypes.PUBLIC,
    authType: AuthTypes.IAM,
  });
  const adapter = new PrismaPg({
    ...connectionOptions,
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.slice(1),
    max: Number(databaseUrl.searchParams.get('connection_limit') || 10),
  });
  return new PrismaClient({ adapter });
}

export const db = configureClient(await createDatabaseClient());
export const redis = config.CACHE_BACKEND === 'memory' ? new MemoryCache() : new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2000 });
if (config.CACHE_BACKEND === 'memory') logger.info('Local single-process cache enabled; rate limits reset on restart');
redis.on('error', () => logger.warn('Redis unavailable; durable answer saves still use PostgreSQL'));
export const audit = (tx, actorId, action, entityId) => tx.auditLog.create({ data: { actorId, action, entityId } });
export const enqueue = (tx, kind, entityId, payload) => tx.syncLog.create({ data: {
  siteId: config.SITE_ID, kind, entityId, payload: JSON.parse(JSON.stringify(payload))
} });
