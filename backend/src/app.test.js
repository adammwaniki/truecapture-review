import { describe, it, expect } from 'vitest';
import { createApp } from './app.js';
import { createMemoryStore } from './store/memory.js';
import { fixedClock } from './clock.js';

describe('app /health (integration via inject)', () => {
  it('reports status + deterministic time and does NOT expose the record count (L-4)', async () => {
    const app = createApp({ store: createMemoryStore(), clock: fixedClock(new Date('2026-01-01T00:00:00.000Z')) });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'TrueCapture Backend', time: '2026-01-01T00:00:00.000Z' });
    expect(res.json().manifests).toBeUndefined();
    await app.close();
  });
});

describe('app /config (public client config)', () => {
  it('returns null captcha when not configured', async () => {
    const app = createApp({ store: createMemoryStore(), clock: fixedClock(new Date('2026-01-01T00:00:00.000Z')) });
    const res = await app.inject({ method: 'GET', url: '/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ captcha: null });
    await app.close();
  });

  it('exposes the provider + public site key (never the secret) when configured', async () => {
    const captchaConfig = { provider: 'turnstile', siteKey: '1x00000000000000000000AA' };
    const app = createApp({ store: createMemoryStore(), clock: fixedClock(new Date('2026-01-01T00:00:00.000Z')), captchaConfig });
    const res = await app.inject({ method: 'GET', url: '/config' });
    expect(res.json()).toEqual({ captcha: captchaConfig });
    expect(JSON.stringify(res.json())).not.toContain('secret');
    await app.close();
  });
});
