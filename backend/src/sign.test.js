import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ensureChain } from './keys/chain.js';
import { createC2pa } from './c2pa/index.js';
import { createMemoryStore } from './store/memory.js';
import { systemClock } from './clock.js';
import { createApp } from './app.js';

describe('POST /sign (integration, real C2PA)', () => {
  let app;
  let base;
  let store;
  let jpeg;

  beforeAll(async () => {
    const keys = ensureChain(join(mkdtempSync(join(tmpdir(), 'tc-sign-')), 'k'));
    store = createMemoryStore();
    app = createApp({
      c2pa: createC2pa(keys),
      store,
      clock: systemClock(),
      dedi: { async lookup() { return null; } },
      dediRef: { record_id: 'rec-1', namespace: 'truecapture', registry: 'signing-keys' },
    });
    base = await app.listen({ port: 0, host: '127.0.0.1' });
    jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg().toBuffer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('signs an uploaded file into real C2PA and records a verify hash', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'photo.jpg');
    const res = await fetch(`${base}/sign`, { method: 'POST', body: fd });

    expect(res.status).toBe(200);
    const hash = res.headers.get('x-verify-hash');
    expect(hash).toMatch(/^[0-9a-f]{24}$/);
    const out = Buffer.from(await res.arrayBuffer());
    expect(out.length).toBeGreaterThan(jpeg.length);
    expect(out.includes(Buffer.from('c2pa'))).toBe(true);
    expect(store.has(hash)).toBe(true);
  });

  it('returns 400 when no file part is present', async () => {
    const fd = new FormData();
    fd.append('note', 'no file here');
    const res = await fetch(`${base}/sign`, { method: 'POST', body: fd });
    expect(res.status).toBe(400);
  });
});
