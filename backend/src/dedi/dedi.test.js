import { describe, it, expect } from 'vitest';
import { createHttpDedi } from './http.js';
import { createDedi } from './index.js';

const res = (ok, body) => ({ ok, json: async () => body });
const ref = { namespace: 'truecapture', registry: 'signing-keys', recordId: 'rec-1' };

describe('createDedi / createHttpDedi.lookup', () => {
  it('createDedi returns a client with lookup() and publish()', () => {
    const d = createDedi();
    expect(typeof d.lookup).toBe('function');
    expect(typeof d.publish).toBe('function');
  });

  it('returns the record with publicKey + entity when found', async () => {
    const dedi = createHttpDedi({
      fetchImpl: async () => res(true, { data: { records: [
        { record_id: 'rec-1', state: 'live', details: { publicKey: 'PEM', entity: { name: 'TrueCapture' } } },
      ] } }),
    });
    expect(await dedi.lookup(ref)).toEqual({
      recordId: 'rec-1', state: 'live', publicKey: 'PEM', entity: { name: 'TrueCapture' },
    });
  });

  it('maps missing details to null fields', async () => {
    const dedi = createHttpDedi({
      fetchImpl: async () => res(true, { data: { records: [{ record_id: 'rec-1', state: 'live' }] } }),
    });
    expect(await dedi.lookup(ref)).toEqual({ recordId: 'rec-1', state: 'live', publicKey: null, entity: null });
  });

  it('returns null on a non-ok response', async () => {
    const dedi = createHttpDedi({ fetchImpl: async () => res(false, {}) });
    expect(await dedi.lookup(ref)).toBeNull();
  });

  it('returns null when the record is absent (and when there is no data)', async () => {
    const dedi = createHttpDedi({ fetchImpl: async () => res(true, {}) });
    expect(await dedi.lookup(ref)).toBeNull();
  });

  it('returns null (fail closed) when the lookup fetch throws — timeout/network (L-3)', async () => {
    const dedi = createHttpDedi({ fetchImpl: async () => { throw new Error('timeout'); } });
    expect(await dedi.lookup(ref)).toBeNull();
  });

  it('caches a lookup within the TTL and refetches after it expires (L-3)', async () => {
    let calls = 0;
    let t = 0;
    const dedi = createHttpDedi({
      now: () => t,
      cacheTtlMs: 1000,
      fetchImpl: async () => { calls += 1; return res(true, { data: { records: [{ record_id: 'rec-1', state: 'live', details: {} }] } }); },
    });
    await dedi.lookup(ref);
    await dedi.lookup(ref);
    expect(calls).toBe(1); // second served from cache
    t = 2000;
    await dedi.lookup(ref);
    expect(calls).toBe(2); // TTL elapsed → refetch
  });
});

describe('createHttpDedi.publish', () => {
  it('POSTs the signing cert and returns true on success', async () => {
    let captured;
    const dedi = createHttpDedi({
      apiKey: 'secret',
      fetchImpl: async (url, opts) => { captured = { url, opts }; return res(true, {}); },
    });
    const ok = await dedi.publish({
      namespace: 'truecapture', registry: 'signing-keys', recordName: 'rec-1',
      publicKeyPem: 'CERTPEM', keyType: 'ES256', entity: { name: 'TrueCapture' },
    });
    expect(ok).toBe(true);
    expect(captured.url).toContain('/dedi/truecapture/signing-keys/save-record-as-draft?publish=true');
    expect(captured.opts.headers.Authorization).toBe('Bearer secret');
    expect(JSON.parse(captured.opts.body).details.publicKey).toBe('CERTPEM');
  });

  it('returns false on a non-ok response', async () => {
    const dedi = createHttpDedi({ apiKey: 'x', fetchImpl: async () => res(false, {}) });
    expect(await dedi.publish({ namespace: 'n', registry: 'r', recordName: 'x', publicKeyPem: 'p', keyType: 'ES256', entity: {} })).toBe(false);
  });

  it('returns false when the publish request throws (L-3)', async () => {
    const dedi = createHttpDedi({ apiKey: 'x', fetchImpl: async () => { throw new Error('net'); } });
    expect(await dedi.publish({ namespace: 'n', registry: 'r', recordName: 'x', publicKeyPem: 'p', keyType: 'ES256', entity: {} })).toBe(false);
  });
});
