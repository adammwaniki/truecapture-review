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

  it('still reads a signed asset when the client sends an unhelpful mimetype (sniff fallback)', async () => {
    // A browser that can't determine file.type uploads as application/octet-stream
    // (or empty). The reader must sniff the real format and still find the manifest,
    // so a genuinely-signed file is never misreported as "Not signed".
    const signed = await c2pa.sign(jpeg, 'image/jpeg', {
      claim_generator_info: [{ name: 'TrueCapture' }],
      assertions: [{ label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created' }] } }],
    });
    expect((await c2pa.read(signed, 'application/octet-stream')).validationState).toBe('Valid');
    expect((await c2pa.read(signed, '')).validationState).toBe('Valid'); // empty mimetype too
  });

  it('returns null when the bytes match no known format and the mimetype is unhelpful', async () => {
    const notMedia = Buffer.from('this is plainly not a media file at all', 'utf8');
    expect(await c2pa.read(notMedia, 'application/octet-stream')).toBeNull();
  });

  it('signs a manifest larger than the legacy 64KB APP11 limit (M2 regression)', async () => {
    const big = 'x'.repeat(100 * 1024); // would overflow the old 16-bit APP11 length field
    const signed = await c2pa.sign(jpeg, 'image/jpeg', {
      claim_generator_info: [{ name: 'TrueCapture' }],
      assertions: [
        { label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created' }] } },
        { label: 'org.truecapture.note', data: { note: big } },
      ],
    });
    const report = await c2pa.read(signed, 'image/jpeg');
    expect(report.validationState).toBe('Valid');
  });

  it('returns null when the manifest is corrupt/unparseable', async () => {
    const signed = await c2pa.sign(jpeg, 'image/jpeg', {
      claim_generator_info: [{ name: 'TrueCapture' }],
      assertions: [{ label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created' }] } }],
    });
    const corrupt = Buffer.from(signed);
    corrupt[Math.floor(corrupt.length * 0.7)] ^= 0xff; // damage the manifest region
    expect(await c2pa.read(corrupt, 'image/jpeg')).toBeNull();
  });
});
