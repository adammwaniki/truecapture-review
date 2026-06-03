// DeDi registry client (the `dedi` seam). lookup() reads a record's published
// signing key from `details.publicKey` — which DeDi already stores and serves
// (see truecap-spike-c2pa-dedi.md; today's server.js publishes it but discards
// it on read). `fetchImpl` is injected so the client is testable without network.
export function createHttpDedi({ baseUrl = 'https://api.dedi.global', fetchImpl = fetch } = {}) {
  return {
    async lookup({ namespace, registry, recordId }) {
      const res = await fetchImpl(`${baseUrl}/dedi/query/${namespace}/${registry}`);
      if (!res.ok) return null;
      const body = await res.json();
      const records = (body.data && body.data.records) || [];
      const rec = records.find((r) => r.record_id === recordId);
      if (!rec) return null;
      const details = rec.details || {};
      return {
        recordId: rec.record_id,
        state: rec.state,
        publicKey: details.publicKey || null,
        entity: details.entity || null,
      };
    },
  };
}
