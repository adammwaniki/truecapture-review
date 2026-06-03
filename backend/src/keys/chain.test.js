import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureChain } from './chain.js';

describe('ensureChain', () => {
  it('generates an EC P-256 CA→leaf chain, then loads it idempotently', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'tc-keys-')), 'keys');

    const a = ensureChain(dir); // generate (default org)
    expect(a.leafKeyPem.toString()).toContain('BEGIN PRIVATE KEY'); // PKCS#8, not SEC1
    expect(a.caCertPem).toContain('BEGIN CERTIFICATE');
    const certCount = a.chainPem.toString().match(/BEGIN CERTIFICATE/g).length;
    expect(certCount).toBe(2); // leaf + CA

    const b = ensureChain(dir); // load (chain.pem exists → skips generation)
    expect(b.chainPem.equals(a.chainPem)).toBe(true);
  });
});
