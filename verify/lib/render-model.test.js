import { describe, it, expect } from 'vitest';
import { toCombinedModel } from './render-model.js';

describe('toCombinedModel (two-axis verify result)', () => {
  it('authentic: valid signature + verified signer, with a safe entity link', () => {
    const m = toCombinedModel({ signature: 'valid', signer: 'verified', verdict: 'authentic', entity: { name: 'BBC', url: 'https://bbc.com' } });
    expect(m.verdict).toBe('authentic');
    expect(m.icon).toBe('check');
    expect(m.headline).toBe('Authentic');
    expect(m.signatureLabel).toMatch(/Valid/);
    expect(m.signerLabel).toMatch(/Verified/);
    expect(m.entityName).toBe('BBC');
    expect(m.entityUrl).toBe('https://bbc.com/');
  });

  it('valid signature + UNREGISTERED signer → clear "not registered" headline (the reported case)', () => {
    const m = toCombinedModel({ signature: 'valid', signer: 'unregistered', verdict: 'untrusted', entity: null });
    expect(m.verdict).toBe('untrusted');
    expect(m.icon).toBe('warn');
    expect(m.headline).toBe('Valid signature — signer not registered on DeDi');
    expect(m.signatureLabel).toMatch(/Valid/);
    expect(m.signerLabel).toBe('Not registered on DeDi.global');
  });

  it('valid signature + revoked signer', () => {
    const m = toCombinedModel({ signature: 'valid', signer: 'revoked', verdict: 'untrusted' });
    expect(m.headline).toMatch(/revoked/);
    expect(m.signerLabel).toMatch(/revoked/);
  });

  it('valid signature + key mismatch → forged', () => {
    const m = toCombinedModel({ signature: 'valid', signer: 'mismatch', verdict: 'forged', entity: { name: 'X', url: 'javascript:evil()' } });
    expect(m.verdict).toBe('forged');
    expect(m.headline).toMatch(/Forged/);
    expect(m.signerLabel).toMatch(/Does NOT match/);
    expect(m.entityUrl).toBeNull(); // M3: unsafe link stripped
    expect(m.entityName).toBe('X');
  });

  it('modified content still reports the signer axis (e.g. modified + registered)', () => {
    const m = toCombinedModel({ signature: 'modified', signer: 'verified', verdict: 'tampered' });
    expect(m.verdict).toBe('tampered');
    expect(m.headline).toMatch(/modified/i);
    expect(m.signatureLabel).toMatch(/changed/);
    expect(m.signerLabel).toMatch(/Verified/); // both axes shown
  });

  it('invalid signature reports both axes', () => {
    const m = toCombinedModel({ signature: 'invalid', signer: 'unregistered', verdict: 'invalid' });
    expect(m.verdict).toBe('invalid');
    expect(m.headline).toMatch(/could not be validated/);
    expect(m.signerLabel).toBe('Not registered on DeDi.global');
  });

  it('unsigned: no signature → no signer line', () => {
    const m = toCombinedModel({ signature: 'none', signer: 'none', verdict: 'unsigned' });
    expect(m.verdict).toBe('unsigned');
    expect(m.headline).toBe('Not signed');
    expect(m.signatureLabel).toMatch(/No C2PA signature/);
    expect(m.signerLabel).toBeNull();
  });

  it('unknown / null → "Couldn\'t verify"', () => {
    expect(toCombinedModel({ verdict: 'unknown' }).headline).toBe("Couldn't verify this file");
    const m = toCombinedModel(null);
    expect(m.verdict).toBe('unknown');
    expect(m.signatureLabel).toBeNull();
    expect(m.entityUrl).toBeNull();
  });

  it('degrades gracefully for partial/unexpected values (defensive fallbacks)', () => {
    // a verdict with no axes → axes default to 'none'
    const a = toCombinedModel({ verdict: 'authentic' });
    expect(a.signatureLabel).toMatch(/No C2PA signature/);
    expect(a.signerLabel).toBeNull();
    // unexpected enum values → safe label fallbacks (no throw, no undefined)
    const b = toCombinedModel({ signature: 'weird', signer: 'weird' });
    expect(b.signatureLabel).toMatch(/No C2PA signature/);
    expect(b.signerLabel).toBeNull();
  });
});
