import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync as exec } from 'node:child_process';
import { mkdtempSync as mkdtemp, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { ensureChain } from './keys/chain.js';
import { createC2pa } from './c2pa/index.js';
import { createMemoryStore } from './store/memory.js';
import { systemClock } from './clock.js';
import { createTranscoder } from './media/transcode.js';
import { createApp } from './app.js';

const identity = { org: { name: 'TrueCapture', url: 'https://www.truecapture.global' }, dedi: { record_id: 'rec-1', namespace: 'truecapture', registry: 'signing-keys' } };

describe('POST /sign with WebM → ffmpeg transcode → signable MP4', () => {
  let c2pa;
  let app;
  let base;
  let webm;

  beforeAll(async () => {
    c2pa = createC2pa(ensureChain(join(mkdtemp(join(tmpdir(), 'tc-st-')), 'k')));
    app = createApp({
      c2pa, store: createMemoryStore(), clock: systemClock(), dedi: { async lookup() { return null; } }, identity,
      transcode: createTranscoder({ ffmpegPath: ffmpegStatic }),
    });
    base = await app.listen({ port: 0, host: '127.0.0.1' });

    // A tiny real VP8 WebM, like Chrome's MediaRecorder produces.
    const dir = mkdtemp(join(tmpdir(), 'tc-wb-'));
    const out = join(dir, 's.webm');
    exec(ffmpegStatic, ['-nostdin', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x64:rate=10', '-c:v', 'libvpx', out]);
    webm = readFileSync(out);
  });

  afterAll(async () => { await app.close(); });

  it('accepts the WebM upload and returns a signed MP4 that reads back as Valid', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([webm], { type: 'video/webm' }), 'recording.webm');
    const res = await fetch(`${base}/sign`, { method: 'POST', body: fd });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('video/mp4'); // not webm
    expect(res.headers.get('x-verify-hash')).toMatch(/^[0-9a-f]{24}$/);

    const signed = Buffer.from(await res.arrayBuffer());
    const report = await c2pa.read(signed, 'video/mp4');
    expect(report.validationState).toBe('Valid');
  }, 60000);
});

describe('sign routes when transcoding fails → 422 (no signing of garbage)', () => {
  const failing = { isTranscodable: () => true, toMp4: async () => { throw new Error('bad webm'); } };
  const oidc = { verify: async () => ({ iss: 'https://i', sub: 'u1', email_verified: true, email: 'a@b' }) };
  let app;
  let base;

  beforeAll(async () => {
    const c2pa = createC2pa(ensureChain(join(mkdtemp(join(tmpdir(), 'tc-stf-')), 'k')));
    app = createApp({ c2pa, store: createMemoryStore(), clock: systemClock(), dedi: { async lookup() { return null; } }, identity, oidc, transcode: failing });
    base = await app.listen({ port: 0, host: '127.0.0.1' });
  });
  afterAll(async () => { await app.close(); });

  const brokenWebm = () => {
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from('not a video')], { type: 'video/webm' }), 'broken.webm');
    return fd;
  };

  it('POST /sign → 422', async () => {
    const res = await fetch(`${base}/sign`, { method: 'POST', body: brokenWebm() });
    expect(res.status).toBe(422);
  });

  it('POST /sign/session → 422 (after auth)', async () => {
    const res = await fetch(`${base}/sign/session`, { method: 'POST', headers: { authorization: 'Bearer tok' }, body: brokenWebm() });
    expect(res.status).toBe(422);
  });
});
