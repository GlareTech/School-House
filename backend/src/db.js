import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuthTypes, Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import pino from 'pino';
import { config } from './config.js';
import { configureClient } from './provider.js';
import { MemoryCache } from './memory-cache.js';
import { currentTenantId } from './tenant-context.js';
export const logger = pino({ level: config.LOG_LEVEL, redact: ['password', 'token', 'headers.cookie', 'headers.authorization'] });
let rawClient = null;
let clientPromise = null;

async function createDatabaseClient() {
  let client;
  if (!config.CLOUD_SQL_INSTANCE) client = new PrismaClient();

  if (!client) {
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
      ...(databaseUrl.password ? { password: decodeURIComponent(databaseUrl.password) } : {}),
      database: databaseUrl.pathname.slice(1),
      max: Number(databaseUrl.searchParams.get('connection_limit') || 10),
    }, { schema: databaseUrl.searchParams.get('schema') || 'public' });
    client = new PrismaClient({ adapter });
  }
  const tenantModels = new Set(['User','StaffRole','AppSetting','Class','Exam','Attendance','StaffAttendance','TimetableEntry','Payment','SyncLog','AuditLog','CommunicationCampaign','AcademicSession','Subject','StoredFile','Hostel']);
  return client.$extends({ query: { $allModels: { async $allOperations({ model, operation, args, query }) {
    const organizationId = currentTenantId();
    if (!organizationId || !tenantModels.has(model)) return query(args);
    if (['findMany','findFirst','findFirstOrThrow','findUnique','findUniqueOrThrow','count','aggregate','update','updateMany','delete','deleteMany'].includes(operation)) {
      args.where = { ...(args.where || {}), organizationId };
    }
    if (operation === 'create') args.data = { ...args.data, organizationId };
    if (operation === 'createMany' || operation === 'createManyAndReturn') {
      args.data = (Array.isArray(args.data) ? args.data : [args.data]).map(data => ({ ...data, organizationId }));
    }
    if (operation === 'upsert') {
      args.where = { ...(args.where || {}), organizationId };
      args.create = { ...args.create, organizationId };
    }
    return query(args);
  } } } });
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
export const audit = (tx, actorId, action, entityId) => tx.auditLog.create({ data: {
  organizationId: currentTenantId(), actorId, action, entityId
} });
export const enqueue = (tx, kind, entityId, payload) => tx.syncLog.create({ data: {
  organizationId: currentTenantId(), siteId: config.SITE_ID, kind, entityId,
  payload: JSON.parse(JSON.stringify(payload))
} });
