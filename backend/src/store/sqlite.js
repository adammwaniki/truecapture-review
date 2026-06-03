import { createRequire } from 'node:module';

// node:sqlite is newer than vite's builtin list, so a static `import` is
// rewritten to a bare "sqlite" specifier that fails to resolve under vitest.
// Loading it through createRequire uses Node's real builtin resolution instead.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

// Durable ManifestStore backed by node:sqlite (file-based; survives restart) —
// same contract as the in-memory store (put/get/has/size) plus prune() for
// retention, so verify links no longer vanish on redeploy (H1) and memory does
// not grow unbounded. A Postgres/Redis impl can implement the same interface
// behind the store seam for larger deployments.
export function createSqliteStore(path, { now = () => Date.now() } = {}) {
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS records (hash TEXT PRIMARY KEY, record TEXT NOT NULL, created_at INTEGER NOT NULL)');
  const insert = db.prepare('INSERT OR REPLACE INTO records (hash, record, created_at) VALUES (?, ?, ?)');
  const select = db.prepare('SELECT record FROM records WHERE hash = ?');
  const count = db.prepare('SELECT COUNT(*) AS n FROM records');
  const purge = db.prepare('DELETE FROM records WHERE created_at < ?');

  return {
    put(hash, record) {
      insert.run(hash, JSON.stringify(record), now());
    },
    get(hash) {
      const row = select.get(hash);
      return row ? JSON.parse(row.record) : null;
    },
    has(hash) {
      return select.get(hash) !== undefined;
    },
    size() {
      return count.get().n;
    },
    prune(maxAgeMs) {
      return purge.run(now() - maxAgeMs).changes;
    },
    close() {
      db.close();
    },
  };
}
