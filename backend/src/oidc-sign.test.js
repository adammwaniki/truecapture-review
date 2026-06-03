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

const identity = { org: { name: 'TrueCapture', url: 'https://x' }, dedi: { record_id: 'org-rec', namespace: 'truecapture', registry: 'signing-keys' } };

// Fake OIDC verifier (the real jose-based one is unit-tested in oidc/verify.test.js).
const oidc = {
  async verify(token) {
    if (token === 'valid') return { iss: 'https://idp', sub: 'user-1', email: 'u@x.com', email_verified: true };
    if (token === 'valid-noemail') return { iss: 'https://idp', sub: 'user-2', email_verified: true }; // verified, but no email
    if (token === 'valid-unverified') return { iss: 'https://idp', sub: 'user-3', email: 'u@x.com', email_verified: false };
    return null;
  },
};

describe('POST /sign/session (OIDC-bound, C3b)', () => {
  let app;
  let base;
  let c2pa;
  let jpeg;

  beforeAll(async () => {
    const keys = ensureChain(join(mkdtempSync(join(tmpdir(), 'tc-oidc-')), 'k'));
    c2pa = createC2pa(keys);
    app = createApp({ c2pa, store: createMemoryStore(), clock: systemClock(), dedi: { async lookup() { return null; } }, identity, oidc });
    base = await app.listen({ port: 0, host: '127.0.0.1' });
    jpeg = await sharp({ create: { width: 24, height: 24, channels: 3, background: { r: 3, g: 4, b: 5 } } }).jpeg().toBuffer();
  });

  afterAll(async () => {
    await app.close();
  });

  const sendFile = (token) => {
    const fd = new FormData();
    fd.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 's.jpg');
    return fetch(`${base}/sign/session`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: fd });
  };

  const signerAssertion = async (signed) => {
    const report = await c2pa.read(signed, 'image/jpeg');
    const m = report.manifestStore.manifests[report.manifestStore.active_manifest];
    return m.assertions.find((a) => a.label === 'org.truecapture.signer');
  };

  it('binds the verified user (sub/iss/email) into the manifest', async () => {
    const res = await sendFile('valid');
    expect(res.status).toBe(200);
    const signer = await signerAssertion(Buffer.from(await res.arrayBuffer()));
    expect(signer.data).toEqual({ iss: 'https://idp', sub: 'user-1', email: 'u@x.com' });
  });

  it('binds a user with no email (email → null)', async () => {
    const res = await sendFile('valid-noemail');
    expect(res.status).toBe(200);
    const signer = await signerAssertion(Buffer.from(await res.arrayBuffer()));
    expect(signer.data.email).toBeNull();
  });

  it('does not bind an UNVERIFIED email (L-4)', async () => {
    const res = await sendFile('valid-unverified');
    expect(res.status).toBe(200);
    const signer = await signerAssertion(Buffer.from(await res.arrayBuffer()));
    expect(signer.data).toEqual({ iss: 'https://idp', sub: 'user-3', email: null });
  });

  it('rejects a missing token with 401', async () => {
    expect((await sendFile(undefined)).status).toBe(401);
  });

  it('rejects an invalid token with 401', async () => {
    expect((await sendFile('garbage')).status).toBe(401);
  });

  it('returns 400 when authenticated but no file', async () => {
    const fd = new FormData();
    fd.append('note', 'no file');
    const res = await fetch(`${base}/sign/session`, { method: 'POST', headers: { authorization: 'Bearer valid' }, body: fd });
    expect(res.status).toBe(400);
  });
});
