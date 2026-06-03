import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ensureChain } from './keys/chain.js';
import { createC2pa } from './c2pa/index.js';
import { createMemoryStore } from './store/memory.js';
import { systemClock } from './clock.js';
import { createApp } from './app.js';

describe('Share-link verify (C2, content-bound)', () => {
  let app;
  let base;
  let jpeg;

  beforeAll(async () => {
    const orgDir = join(mkdtempSync(join(tmpdir(), 'tc-link-')), 'k');
    const keys = ensureChain(orgDir);
    const orgLeafPem = readFileSync(join(orgDir, 'leaf.crt'), 'utf8');
    const dedi = {
      async lookup({ recordId }) {
        return recordId === 'org-rec'
          ? { recordId, state: 'live', publicKey: orgLeafPem, entity: { name: 'TrueCapture' } }
          : null;
      },
    };
    const identity = { org: { name: 'TrueCapture', url: 'https://x' }, dedi: { record_id: 'org-rec', namespace: 'truecapture', registry: 'signing-keys' } };
    app = createApp({ c2pa: createC2pa(keys), store: createMemoryStore(), clock: systemClock(), dedi, identity });
    base = await app.listen({ port: 0, host: '127.0.0.1' });
    jpeg = await sharp({ create: { width: 24, height: 24, channels: 3, background: { r: 5, g: 6, b: 7 } } }).jpeg().toBuffer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('re-verifies the stored asset and returns the real verdict (not hardcoded)', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'p.jpg');
    const signRes = await fetch(`${base}/sign`, { method: 'POST', body: fd });
    const hash = signRes.headers.get('x-verify-hash');

    const linkRes = await fetch(`${base}/verify/${hash}`);
    expect(linkRes.status).toBe(200);
    const body = await linkRes.json();
    expect(body.verdict).toBe('authentic');
    expect(body.entity).toEqual({ name: 'TrueCapture' });
  });

  it('returns 404/unknown for an unknown hash', async () => {
    const res = await fetch(`${base}/verify/deadbeefdeadbeefdeadbeef`);
    expect(res.status).toBe(404);
    expect((await res.json()).verdict).toBe('unknown');
  });
});
