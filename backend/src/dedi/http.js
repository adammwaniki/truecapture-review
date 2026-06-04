// DeDi registry client (the `dedi` seam). `lookup()` reads a record's published
// signing key from `details.publicKey`; `publish()` registers the org's signing
// certificate so verifiers can bind to it (C1). `fetchImpl`/`now` are injected so
// the client is testable without network.
//
// L-3: lookups have a request timeout (a hung DeDi must not stall every /verify)
// and a short-TTL in-memory cache (verify is hot and the key rarely changes); on
// any network error the lookup returns null, so the verdict fails closed to
// `untrusted` rather than throwing.
export function createHttpDedi({ baseUrl = 'https://api.dedi.global', apiKey, fetchImpl = fetch, now = () => Date.now(), timeoutMs = 5000, cacheTtlMs = 30_000 } = {}) {
  const cache = new Map(); // key -> { value, at }

  async function fetchRecord({ namespace, registry, recordId }) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}/dedi/query/${namespace}/${registry}`, { signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      return null; // timeout / network error → fail closed
    }
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
  }

  return {
    async lookup(ref) {
      const key = `${ref.namespace}/${ref.registry}/${ref.recordId}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < cacheTtlMs) return hit.value;
      const value = await fetchRecord(ref);
      cache.set(key, { value, at: now() });
      return value;
    },

    async publish({ namespace, registry, recordName, publicKeyPem, keyType, entity }) {
      let res;
      try {
        res = await fetchImpl(`${baseUrl}/dedi/${namespace}/${registry}/save-record-as-draft?publish=true`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record_name: recordName,
            description: 'TrueCapture signing key',
            details: { public_key_id: recordName, publicKey: publicKeyPem, keyType, keyFormat: 'pem', entity },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        return false; // timeout / network error
      }
      return res.ok;
    },
  };
}
