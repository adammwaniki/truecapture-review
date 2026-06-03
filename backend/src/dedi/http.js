// DeDi registry client (the `dedi` seam). `lookup()` reads a record's published
// signing key from `details.publicKey`; `publish()` registers the org's signing
// certificate so verifiers can bind to it (C1). `fetchImpl` is injected so the
// client is testable without network.
export function createHttpDedi({ baseUrl = 'https://api.dedi.global', apiKey, fetchImpl = fetch } = {}) {
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

    async publish({ namespace, registry, recordName, publicKeyPem, keyType, entity }) {
      const res = await fetchImpl(`${baseUrl}/dedi/${namespace}/${registry}/save-record-as-draft?publish=true`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_name: recordName,
          description: 'TrueCapture signing key',
          details: { public_key_id: recordName, publicKey: publicKeyPem, keyType, keyFormat: 'pem', entity },
        }),
      });
      return res.ok;
    },
  };
}
