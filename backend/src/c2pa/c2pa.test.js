import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ensureChain } from '../keys/chain.js';
import { createC2pa } from './index.js';

describe('c2pa engine (contentauth, ES256)', () => {
  let c2pa;
  let jpeg;

  beforeAll(async () => {
    const keys = ensureChain(join(mkdtempSync(join(tmpdir(), 'tc-c2pa-keys-')), 'k'));
    c2pa = createC2pa(keys);
    jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .jpeg().toBuffer();
  });

  it('signs a JPEG into a real C2PA asset that reads back as Valid (ES256)', async () => {
    const manifest = {
      claim_generator_info: [{ name: 'TrueCapture', version: '1.0.0' }],
      title: 'test.jpg',
      assertions: [{ label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created' }] } }],
    };
    const signed = await c2pa.sign(jpeg, 'image/jpeg', manifest);
    expect(signed.length).toBeGreaterThan(jpeg.length);

    const report = await c2pa.read(signed, 'image/jpeg');
    expect(report.validationState).toBe('Valid');
    expect(report.signatureInfo.alg).toBe('Es256');
  });

  it('returns null when reading an asset with no C2PA manifest', async () => {
    expect(await c2pa.read(jpeg, 'image/jpeg')).toBeNull();
  });
});
