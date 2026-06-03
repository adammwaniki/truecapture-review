// Test double for the `dedi` seam (production impl: DeDi HTTP API). Contract:
//   lookup(recordId) -> Promise<{ recordId, state, publicKey, entity } | null>
//   publish(publicKey, identity) -> Promise<{ recordId }>
// Seed `records` to simulate live / revoked / missing / key-mismatch (C1 tests).
export function fakeDedi(records = {}) {
  return {
    async lookup(recordId) {
      return records[recordId] ?? null;
    },
    async publish() {
      return { recordId: 'fake-record-id' };
    },
  };
}
