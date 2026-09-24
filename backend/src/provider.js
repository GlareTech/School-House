import { config } from './config.js';
export const isSqlServer = config.DATABASE_PROVIDER === 'sqlserver';
export async function lockRow(tx, table, id) {
  if (!['User','Exam','Attempt','PromotionRun'].includes(table)) throw new Error('Unsupported lock target');
  return isSqlServer
    ? tx.$queryRawUnsafe(`SELECT id FROM [${table}] WITH (UPDLOCK, ROWLOCK) WHERE id=@P1`, id)
    : tx.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id=$1 FOR UPDATE`, id);
}
export async function dbNow(tx) {
  const rows = isSqlServer ? await tx.$queryRaw`SELECT SYSUTCDATETIME() AS now` : await tx.$queryRaw`SELECT clock_timestamp() AS now`;
  return rows[0].now;
}
const jsonFields = new Set(['questionOrder','optionOrder','payload','gradingScale','qualifications','rows','traits','ratings','affectiveRatings','psychomotorRatings','reportMetadata']);
function transform(value, encode) {
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(v => transform(v, encode));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (jsonFields.has(key)) {
      if (encode && item !== undefined && typeof item !== 'string' && typeof item !== 'boolean') return [key, JSON.stringify(item)];
      if (!encode && typeof item === 'string') return [key, JSON.parse(item)];
    }
    return [key, transform(item, encode)];
  }));
}
export function configureClient(client) {
  if (isSqlServer) client.$use(async (params, next) => {
    // SQL Server stores these validated JSON documents in NVARCHAR(MAX).
    // Only mutation data is encoded; selections and query filters stay intact.
    if (params.args) for (const key of ['data','create','update']) {
      if (params.args[key]) params.args[key] = transform(params.args[key], true);
    }
    return transform(await next(params), false);
  });
  return client;
}
