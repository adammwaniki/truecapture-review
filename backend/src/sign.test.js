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

const ORIGIN = 'https://www.truecapture.global';
const identity = {
  org: { name: 'TrueCapture', url: ORIGIN },
  dedi: { record_id: 'rec-1', namespace: 'truecapture', registry: 'signing-keys' },
};

describe('POST /sign (public: rate-limit + Origin allowlist + CAPTCHA, no key)', () => {
  let c2pa;
  let jpeg;
  let guarded; // allowlist + token-checking CAPTCHA
  let open; // no allowlist, default CAPTCHA (always true)
  let guardedBase;
  let openBase;

  beforeAll(async () => {
    const keys = ensureChain(join(mkdtempSync(join(tmpdir(), 'tc-sign-')), 'k'));
    c2pa = createC2pa(keys);
    jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();

    guarded = createApp({
      c2pa, store: createMemoryStore(), clock: systemClock(), dedi: { async lookup() { return null; } }, identity,
      allowedOrigins: [ORIGIN],
      captcha: { verify: async (t) => t === 'good' },
    });
    open = createApp({ c2pa, store: createMemoryStore(), clock: systemClock(), dedi: { async lookup() { return null; } }, identity, verifyBaseUrl: 'https://verify.example/verify' });
    guardedBase = await guarded.listen({ port: 0, host: '127.0.0.1' });
    openBase = await open.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await guarded.close();
    await open.close();
  });

  const form = () => {
    const fd = new FormData();
    fd.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'photo.jpg');
    return fd;
  };

  it('signs with allowed origin + valid CAPTCHA', async () => {
    const res = await fetch(`${guardedBase}/sign`, { method: 'POST', headers: { origin: ORIGIN, 'x-captcha-token': 'good' }, body: form() });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-verify-hash')).toMatch(/^[0-9a-f]{24}$/);
    const out = Buffer.from(await res.arrayBuffer());
    expect(out.includes(Buffer.from('c2pa'))).toBe(true);
  });

  it('rejects a disallowed origin with 403', async () => {
    const res = await fetch(`${guardedBase}/sign`, { method: 'POST', headers: { origin: 'https://evil.example', 'x-captcha-token': 'good' }, body: form() });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid CAPTCHA with 403', async () => {
    const res = await fetch(`${guardedBase}/sign`, { method: 'POST', headers: { origin: ORIGIN, 'x-captcha-token': 'bad' }, body: form() });
    expect(res.status).toBe(403);
  });

  it('returns 400 when no file is present', async () => {
    const fd = new FormData();
    fd.append('note', 'no file');
    const res = await fetch(`${guardedBase}/sign`, { method: 'POST', headers: { origin: ORIGIN, 'x-captcha-token': 'good' }, body: fd });
    expect(res.status).toBe(400);
  });

  it('signs with no allowlist configured and the default CAPTCHA (dev)', async () => {
    const res = await fetch(`${openBase}/sign`, { method: 'POST', body: form() });
    expect(res.status).toBe(200);
  });

  it('emits X-Verify-URL from the configured base, and only X-Verify-Hash without one (M-7)', async () => {
    const withUrl = await fetch(`${openBase}/sign`, { method: 'POST', body: form() });
    const hash = withUrl.headers.get('x-verify-hash');
    expect(withUrl.headers.get('x-verify-url')).toBe(`https://verify.example/verify/${hash}`);
    // the `guarded` app has no verifyBaseUrl → header absent
    const noUrl = await fetch(`${guardedBase}/sign`, { method: 'POST', headers: { origin: ORIGIN, 'x-captcha-token': 'good' }, body: form() });
    expect(noUrl.headers.get('x-verify-url')).toBeNull();
  });

  it('embeds the coarse device class (M4), not the raw user agent', async () => {
    const res = await fetch(`${openBase}/sign`, { method: 'POST', headers: { 'x-device-class': 'iOS' }, body: form() });
    expect(res.status).toBe(200);
    const report = await c2pa.read(Buffer.from(await res.arrayBuffer()), 'image/jpeg');
    const m = report.manifestStore.manifests[report.manifestStore.active_manifest];
    const capture = m.assertions.find((a) => a.label === 'org.truecapture.capture');
    expect(capture.data).toEqual({ deviceClass: 'iOS' });
  });
});
