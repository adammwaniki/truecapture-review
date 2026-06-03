import { describe, it, expect } from 'vitest';
import { createHttpDedi } from './http.js';
import { createDedi } from './index.js';

const res = (ok, body) => ({ ok, json: async () => body });
const ref = { namespace: 'truecapture', registry: 'signing-keys', recordId: 'rec-1' };

describe('createDedi / createHttpDedi.lookup', () => {
  it('createDedi returns a client with lookup()', () => {
    expect(typeof createDedi().lookup).toBe('function');
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
});
