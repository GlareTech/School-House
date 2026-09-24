import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import pino from 'pino';
import { config } from './config.js';
import { configureClient } from './provider.js';
import { MemoryCache } from './memory-cache.js';
export const logger = pino({ level: config.LOG_LEVEL, redact: ['password', 'token', 'headers.cookie', 'headers.authorization'] });
export const db = configureClient(new PrismaClient());
export const redis = config.CACHE_BACKEND === 'memory' ? new MemoryCache() : new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2000 });
if (config.CACHE_BACKEND === 'memory') logger.info('Local single-process cache enabled; rate limits reset on restart');
redis.on('error', () => logger.warn('Redis unavailable; durable answer saves still use PostgreSQL'));
export const audit = (tx, actorId, action, entityId) => tx.auditLog.create({ data: { actorId, action, entityId } });
export const enqueue = (tx, kind, entityId, payload) => tx.syncLog.create({ data: {
  siteId: config.SITE_ID, kind, entityId, payload: JSON.parse(JSON.stringify(payload))
} });
