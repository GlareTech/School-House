export async function lockRow(tx, table, id) {
  if (!['User','Exam','Attempt','PromotionRun'].includes(table)) throw new Error('Unsupported lock target');
  return tx.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id=$1 FOR UPDATE`, id);
}
export async function dbNow(tx) {
  const rows = await tx.$queryRaw`SELECT clock_timestamp() AS now`;
  return rows[0].now;
}
export const configureClient=client=>client;
