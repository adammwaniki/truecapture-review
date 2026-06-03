import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import { extractDediRef } from './dedi-ref.js';
import { verdictFor } from './verdict.js';
import { publicKeysEqual, toSpkiB64 } from './keymatch.js';

const storeWith = (assertions) => ({ active_manifest: 'm', manifests: { m: { assertions } } });

describe('extractDediRef', () => {
  const ref = { record_id: 'r', namespace: 'n', registry: 'g' };
  it('returns the reference when the assertion is present and complete', () => {
    expect(extractDediRef(storeWith([{ label: 'org.truecapture.dedi', data: ref }])))
      .toEqual({ recordId: 'r', namespace: 'n', registry: 'g' });
  });
  it('returns null when the dedi assertion is absent', () => {
    expect(extractDediRef(storeWith([{ label: 'c2pa.actions.v2', data: {} }]))).toBeNull();
  });
  it('returns null when assertions are missing entirely', () => {
    expect(extractDediRef(storeWith(undefined))).toBeNull();
  });
  it('returns null when the assertion has no data', () => {
    expect(extractDediRef(storeWith([{ label: 'org.truecapture.dedi' }]))).toBeNull();
  });
  it('returns null when a required field is missing', () => {
    expect(extractDediRef(storeWith([{ label: 'org.truecapture.dedi', data: { record_id: 'r', namespace: 'n' } }]))).toBeNull();
  });
});

describe('verdictFor', () => {
  const base = { hasManifest: true, validationState: 'Valid', hasRef: true, record: { state: 'live' }, keyMatches: true };
  it('unsigned when no manifest', () => expect(verdictFor({ ...base, hasManifest: false })).toBe('unsigned'));
  it('tampered when validation not Valid', () => expect(verdictFor({ ...base, validationState: 'Invalid' })).toBe('tampered'));
  it('untrusted when no dedi reference', () => expect(verdictFor({ ...base, hasRef: false })).toBe('untrusted'));
  it('untrusted when record missing', () => expect(verdictFor({ ...base, record: null })).toBe('untrusted'));
  it('untrusted when record not live', () => expect(verdictFor({ ...base, record: { state: 'revoked' } })).toBe('untrusted'));
  it('forged when key does not match', () => expect(verdictFor({ ...base, keyMatches: false })).toBe('forged'));
  it('authentic when live and key matches', () => expect(verdictFor(base)).toBe('authentic'));
});

describe('keymatch', () => {
  // Self-signed cert + its public key, and a different key, all via node crypto.
  const mkCertAndKeys = () => {
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    return publicKey.export({ type: 'spki', format: 'pem' });
  };
  const keyA = mkCertAndKeys();
  const keyB = mkCertAndKeys();
  const spkiA = toSpkiB64(keyA);

  it('toSpkiB64 parses a public key PEM', () => expect(toSpkiB64(keyA)).toBeTypeOf('string'));
  it('toSpkiB64 returns null for null and garbage', () => {
    expect(toSpkiB64(null)).toBeNull();
    expect(toSpkiB64('not a key')).toBeNull();
  });
  it('matches identical keys', () => expect(publicKeysEqual(spkiA, keyA)).toBe(true));
  it('rejects different keys', () => expect(publicKeysEqual(spkiA, keyB)).toBe(false));
  it('rejects when either side is missing', () => {
    expect(publicKeysEqual(null, keyA)).toBe(false);
    expect(publicKeysEqual(spkiA, null)).toBe(false);
  });
});
