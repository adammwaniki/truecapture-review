import { describe, it, expect } from 'vitest';
import { verifyByUpload, verifyByHash, signFile } from './verify-client.js';

const ok = (body, headers = {}) => ({ ok: true, status: 200, json: async () => body, blob: async () => 'BLOB', headers: { get: (k) => headers[k] ?? null } });
const notOk = (status) => ({ ok: false, status, json: async () => ({}), blob: async () => null, headers: { get: () => null } });

describe('verify-client', () => {
  it('verifyByUpload POSTs the file and returns the verdict JSON', async () => {
    let captured;
    const fetchImpl = async (url, opts) => { captured = { url, opts }; return ok({ verdict: 'authentic' }); };
    expect(await verifyByUpload(fetchImpl, 'http://api', new Blob(['x']))).toEqual({ verdict: 'authentic' });
    expect(captured.url).toBe('http://api/verify');
    expect(captured.opts.method).toBe('POST');
  });

  it('verifyByHash returns the verdict on success', async () => {
    const fetchImpl = async () => ok({ verdict: 'authentic', entity: { name: 'BBC' } });
    expect((await verifyByHash(fetchImpl, 'http://api', 'abc')).verdict).toBe('authentic');
  });

  it('verifyByHash returns unknown on a non-ok response', async () => {
    const fetchImpl = async () => notOk(404);
    expect(await verifyByHash(fetchImpl, 'http://api', 'nope')).toEqual({ verdict: 'unknown' });
  });

  it('signFile sends the CAPTCHA token + coarse device class and returns the hash + blob', async () => {
    let captured;
    const fetchImpl = async (url, opts) => { captured = { url, opts }; return ok(null, { 'x-verify-hash': 'h123' }); };
    const out = await signFile(fetchImpl, 'http://api', new Blob(['x']), { captchaToken: 'captcha-tok', deviceClass: 'iOS' });
    expect(captured.opts.headers['x-captcha-token']).toBe('captcha-tok');
    expect(captured.opts.headers['x-device-class']).toBe('iOS');
    expect(out).toEqual({ verifyHash: 'h123', blob: 'BLOB' });
  });

  it('signFile omits headers when not provided (no raw UA, no empty token)', async () => {
    let captured;
    const fetchImpl = async (url, opts) => { captured = { url, opts }; return ok(null, { 'x-verify-hash': 'h' }); };
    await signFile(fetchImpl, 'http://api', new Blob(['x']));
    expect(captured.opts.headers).toEqual({});
  });

  it('signFile throws on a non-ok response', async () => {
    const fetchImpl = async () => notOk(403);
    await expect(signFile(fetchImpl, 'http://api', new Blob(['x']), { captchaToken: 't' })).rejects.toThrow('sign failed: 403');
  });
});
