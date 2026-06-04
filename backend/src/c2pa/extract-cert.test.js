import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { X509Certificate } from 'node:crypto';
import sharp from 'sharp';
import { ensureChain } from '../keys/chain.js';
import { createC2pa } from './index.js';
import { extractSignerSpki } from './extract-cert.js';
import { toSpkiB64 } from '../verify/keymatch.js';

describe('extractSignerSpki', () => {
  let signed;
  let leafPem;
  let expectedSpki;

  beforeAll(async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'tc-ec-')), 'k');
    const keys = ensureChain(dir);
    leafPem = readFileSync(join(dir, 'leaf.crt'), 'utf8');
    expectedSpki = new X509Certificate(leafPem).publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 4, g: 5, b: 6 } } })
      .jpeg().toBuffer();
    signed = await createC2pa(keys).sign(jpeg, 'image/jpeg', {
      claim_generator_info: [{ name: 'TrueCapture' }],
      assertions: [{ label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created' }] } }],
    });
  });

  it('extracts the leaf SPKI from a signed asset', () => {
    expect(extractSignerSpki(signed)).toBe(expectedSpki);
  });

  it('toSpkiB64 of the leaf cert PEM equals the extracted SPKI (cert branch)', () => {
    expect(toSpkiB64(leafPem)).toBe(expectedSpki);
  });

  it('returns null when there is no certificate', () => {
    expect(extractSignerSpki(Buffer.from('no certificates here, just plain text'))).toBeNull();
  });

  it('skips a DER length that overruns the buffer', () => {
    expect(extractSignerSpki(Buffer.from([0x30, 0x82, 0xff, 0xff, 0x00]))).toBeNull();
  });

  it('skips a 30 82 candidate that is not a valid certificate', () => {
    expect(extractSignerSpki(Buffer.from([0x30, 0x82, 0x00, 0x02, 0x01, 0x02]))).toBeNull();
  });

  it('handles all DER long-form lengths and skips short/over-long forms (M-3)', () => {
    expect(extractSignerSpki(Buffer.from([0x30, 0x05, 0x01]))).toBeNull(); // short form (< 0x81) skipped
    expect(extractSignerSpki(Buffer.from([0x30, 0x85, 0x00]))).toBeNull(); // > 4-octet length skipped
    expect(extractSignerSpki(Buffer.from([0x00, 0x30, 0x83]))).toBeNull(); // long-form header runs past end
    expect(extractSignerSpki(Buffer.from([0x30, 0x81, 0x02, 0x01, 0x02]))).toBeNull(); // 1-octet form, not a cert
  });
});
