import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import { extractDediRef } from './dedi-ref.js';
import { signatureStatus, signerStatus, combinedVerdict, isContentTampered } from './verdict.js';
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

describe('signatureStatus', () => {
  it('valid when validation_state is Valid', () => expect(signatureStatus({ validationState: 'Valid' })).toBe('valid'));
  it('modified on a content-hash mismatch', () => expect(signatureStatus({ validationState: 'Invalid', validationStatus: [{ code: 'assertion.hashedURI.mismatch' }] })).toBe('modified'));
  it('invalid when not Valid and not a content-hash mismatch', () => expect(signatureStatus({ validationState: 'Invalid', validationStatus: [{ code: 'claimSignature.mismatch' }] })).toBe('invalid'));
});

describe('signerStatus', () => {
  it('unregistered with no dedi reference', () => expect(signerStatus({ hasRef: false, record: null, keyMatches: () => true })).toBe('unregistered'));
  it('unregistered when the record is missing', () => expect(signerStatus({ hasRef: true, record: null, keyMatches: () => true })).toBe('unregistered'));
  it('revoked when the record is not live', () => expect(signerStatus({ hasRef: true, record: { state: 'revoked' }, keyMatches: () => true })).toBe('revoked'));
  it('verified when live and the key matches', () => expect(signerStatus({ hasRef: true, record: { state: 'live' }, keyMatches: () => true })).toBe('verified'));
  it('mismatch when live but the key differs', () => expect(signerStatus({ hasRef: true, record: { state: 'live' }, keyMatches: () => false })).toBe('mismatch'));
});

describe('combinedVerdict (matrix → roll-up)', () => {
  it('unsigned', () => expect(combinedVerdict('none', 'none')).toBe('unsigned'));
  it('tampered (content modified)', () => expect(combinedVerdict('modified', 'verified')).toBe('tampered'));
  it('invalid (broken signature)', () => expect(combinedVerdict('invalid', 'verified')).toBe('invalid'));
  it('authentic (valid + verified)', () => expect(combinedVerdict('valid', 'verified')).toBe('authentic'));
  it('forged (valid + key mismatch)', () => expect(combinedVerdict('valid', 'mismatch')).toBe('forged'));
  it('untrusted (valid + unregistered)', () => expect(combinedVerdict('valid', 'unregistered')).toBe('untrusted'));
  it('untrusted (valid + revoked)', () => expect(combinedVerdict('valid', 'revoked')).toBe('untrusted'));
});

describe('isContentTampered', () => {
  it('true for a hash-mismatch status code', () => {
    expect(isContentTampered([{ code: 'assertion.hashedURI.mismatch' }])).toBe(true);
    expect(isContentTampered([{ code: 'signingCredential.untrusted' }, { code: 'assertion.dataHash.mismatch' }])).toBe(true);
  });
  it('false for a non-hash failure (untrusted signer / bad signature)', () => {
    expect(isContentTampered([{ code: 'signingCredential.untrusted' }])).toBe(false);
    expect(isContentTampered([{ code: 'claimSignature.mismatch' }])).toBe(false); // mismatch but not a hash
  });
  it('false for empty / non-array / malformed entries', () => {
    expect(isContentTampered([])).toBe(false);
    expect(isContentTampered(null)).toBe(false);
    expect(isContentTampered([{}, { code: 5 }, null])).toBe(false);
  });
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
