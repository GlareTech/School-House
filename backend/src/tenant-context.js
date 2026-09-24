import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export const runWithTenant = (organizationId, callback) => storage.run({ organizationId }, callback);
export const currentTenantId = () => storage.getStore()?.organizationId || null;

