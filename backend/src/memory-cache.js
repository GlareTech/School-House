// Explicit single-process local profile. PostgreSQL/SQL Server remains durable truth.
export class MemoryCache {
  status = 'ready';
  entries = new Map();
  read(key) { const v = this.entries.get(key); if (v && v.expires <= Date.now()) { this.entries.delete(key); return null; } return v; }
  makeRoom() {
    for (const [key, value] of this.entries) if (value.expires <= Date.now()) this.entries.delete(key);
    if (this.entries.size >= 10000) throw new Error('Local cache capacity reached');
  }
  async eval(script, count, key, ...args) {
    if (count !== 1) throw new Error('Unsupported cache operation');
    let value = this.read(key);
    if (!value) { this.makeRoom(); value = {}; this.entries.set(key, value); }
    if (key.startsWith('login:') || key.startsWith('login-ip:')) {
      value.count = (value.count || 0) + 1;
      value.expires ||= Date.now() + 900000;
      return value.count;
    }
    if (key.startsWith('attempt:')) {
      const [revision, snapshot] = args;
      if (value.revision === undefined || Number(revision) >= value.revision) {
        value.revision = Number(revision); value.snapshot = snapshot; value.expires = Date.now() + 86400000;
      }
      return 1;
    }
    throw new Error('Unsupported cache key');
  }
  async hget(key, field) { return this.read(key)?.[field] ?? null; }
  async del(key) { return Number(this.entries.delete(key)); }
  async ping() { return 'PONG'; }
  on() { return this; }
  disconnect() { this.entries.clear(); }
}
