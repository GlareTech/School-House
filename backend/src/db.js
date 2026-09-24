import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuthTypes, Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import pino from 'pino';
import { config } from './config.js';
import { configureClient } from './provider.js';
import { MemoryCache } from './memory-cache.js';
export const logger = pino({ level: config.LOG_LEVEL, redact: ['password', 'token', 'headers.cookie', 'headers.authorization'] });
let rawClient = null;
let clientPromise = null;

async function createDatabaseClient() {
  if (!config.CLOUD_SQL_INSTANCE) return new PrismaClient();

  const databaseUrl = new URL(config.DATABASE_URL);
  const connector = new Connector();
  const connectionOptions = await connector.getOptions({
    instanceConnectionName: config.CLOUD_SQL_INSTANCE,
    ipType: IpAddressTypes.PUBLIC,
    authType: AuthTypes.IAM,
  });
  const adapter = new PrismaPg(
    {
      ...connectionOptions,
      user: decodeURIComponent(databaseUrl.username),
      ...(databaseUrl.password ? { password: decodeURIComponent(databaseUrl.password) } : {}),
      database: databaseUrl.pathname.slice(1),
      max: Number(databaseUrl.searchParams.get('connection_limit') || 10),
    },
    {
      schema: databaseUrl.searchParams.get('schema') || 'public',
    }
  );
  return new PrismaClient({ adapter });
}

export async function getClient() {
  if (rawClient) return rawClient;
  if (!clientPromise) {
    clientPromise = createDatabaseClient().then(client => {
      rawClient = client;
      return rawClient;
    }).catch(err => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

function createLazyModelProxy(modelName) {
  return new Proxy({}, {
    get(_modelTarget, method) {
      if (method === 'then') return undefined;
      return async (...args) => {
        const client = await getClient();
        const model = client[modelName];
        if (!model || typeof model[method] !== 'function') {
          throw new TypeError(`Prisma model '${String(modelName)}' does not have method '${String(method)}'`);
        }
        return model[method](...args);
      };
    }
  });
}

function createLazyClientProxy() {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return undefined;
      if (prop.startsWith('$')) {
        return async (...args) => {
          const client = await getClient();
          return client[prop](...args);
        };
      }
      return createLazyModelProxy(prop);
    }
  });
}

export const db = configureClient(createLazyClientProxy());
export const cache = new MemoryCache();
logger.info('Local single-process cache enabled; rate limits reset on restart');
export const audit = (tx, actorId, action, entityId) => tx.auditLog.create({ data: { actorId, action, entityId } });
export const enqueue = (tx, kind, entityId, payload) => tx.syncLog.create({ data: {
  siteId: config.SITE_ID, kind, entityId, payload: JSON.parse(JSON.stringify(payload))
} });
