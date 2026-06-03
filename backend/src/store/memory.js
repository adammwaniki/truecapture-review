// In-memory ManifestStore — implements the `store` seam:
//   put(hash, record), get(hash) -> record|null, has(hash) -> bool, size() -> number
// This is the default/dev store; the durable Postgres/Redis impl (H1) implements
// the same contract so handlers never change.
export function createMemoryStore() {
  const records = new Map();
  return {
    put(hash, record) {
      records.set(hash, record);
    },
    get(hash) {
      return records.get(hash) ?? null;
    },
    has(hash) {
      return records.has(hash);
    },
    size() {
      return records.size;
    },
  };
}
