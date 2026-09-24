// Explicit single-process local profile. PostgreSQL/SQL Server remains durable truth.
export class MemoryCache {
  status = 'ready';
  entries = new Map();
  read(key) { const v = this.entries.get(key); if (v && v.expires <= Date.now()) { this.entries.delete(key); return null; } return v; }
  makeRoom() {
    for (const [key, value] of this.entries) if (value.expires <= Date.now()) this.entries.delete(key);
    if (this.entries.size >= 10000) throw new Error('Local cache capacity reached');
  }
  async increment(key, ttl) {
    let value = this.read(key);
    if (!value) { this.makeRoom(); value = {}; this.entries.set(key, value); }
    value.count = (value.count || 0) + 1;
    value.expires ||= Date.now() + ttl;
    return value.count;
  }
  async saveAttemptSnapshot(key, revision, snapshot, ttl) {
    const value = this.read(key);
    if (!value || value.revision === undefined || Number(revision) >= value.revision) {
      this.makeRoom();
      this.entries.set(key, { revision: Number(revision), snapshot, expires: Date.now() + ttl });
    }
    return 1;
  }
  async del(key) { return Number(this.entries.delete(key)); }
  async ping() { return 'PONG'; }
  disconnect() { this.entries.clear(); }
}
