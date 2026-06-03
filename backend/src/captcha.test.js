import { describe, it, expect } from 'vitest';
import { createCaptchaVerifier } from './captcha.js';

const res = (ok, body) => ({ ok, json: async () => body });

describe('createCaptchaVerifier', () => {
  it('returns false without a token (no network call)', async () => {
    let called = false;
    const c = createCaptchaVerifier({ verifyUrl: 'x', secret: 's', fetchImpl: async () => { called = true; return res(true, {}); } });
    expect(await c.verify('')).toBe(false);
    expect(called).toBe(false);
  });

  it('returns true when the provider reports success', async () => {
    const c = createCaptchaVerifier({ verifyUrl: 'x', secret: 's', fetchImpl: async () => res(true, { success: true }) });
    expect(await c.verify('tok')).toBe(true);
  });

  it('returns false when the provider reports failure', async () => {
    const c = createCaptchaVerifier({ verifyUrl: 'x', secret: 's', fetchImpl: async () => res(true, { success: false }) });
    expect(await c.verify('tok')).toBe(false);
  });

  it('returns false on a non-ok response', async () => {
    const c = createCaptchaVerifier({ verifyUrl: 'x', secret: 's', fetchImpl: async () => res(false, {}) });
    expect(await c.verify('tok')).toBe(false);
  });
});
