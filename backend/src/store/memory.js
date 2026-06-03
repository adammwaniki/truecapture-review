// In-memory ManifestStore — implements the `store` seam:
//   put(hash, record), get(hash) -> record|null, has(hash) -> bool, size() -> number,
//   prune(maxAgeMs) -> removed count
// This is the default/dev store; the durable SQLite impl (H1) implements the same
// contract — including prune() for retention (H-3) — so handlers never change.
export function createMemoryStore({ now = () => Date.now() } = {}) {
  const records = new Map(); // hash -> { record, createdAt }
  return {
    put(hash, record) {
      records.set(hash, { record, createdAt: now() });
    },
    get(hash) {
      const entry = records.get(hash);
      return entry ? entry.record : null;
    },
    has(hash) {
      return records.has(hash);
    },
    size() {
      return records.size;
    },
    prune(maxAgeMs) {
      const cutoff = now() - maxAgeMs;
      let removed = 0;
      for (const [hash, entry] of records) {
        if (entry.createdAt < cutoff) {
          records.delete(hash);
          removed += 1;
        }
      }
      return removed;
    },
  };
}
