import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMemoryStore } from './store/memory.js';
import { systemClock } from './clock.js';
import { createApp } from './app.js';

describe('OpenAPI spec + Swagger UI', () => {
  let app;
  let base;

  beforeAll(async () => {
    app = createApp({ store: createMemoryStore(), clock: systemClock(), dedi: {}, c2pa: {}, identity: { org: {}, dedi: {} } });
    base = await app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves an OpenAPI 3 document listing every endpoint', async () => {
    const res = await fetch(`${base}/openapi.json`);
    expect(res.status).toBe(200);
    const spec = await res.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe('TrueCapture API');
    const paths = Object.keys(spec.paths);
    for (const p of ['/health', '/sign', '/sign/session', '/verify', '/verify/{hash}']) {
      expect(paths).toContain(p);
    }
  });

  it('serves Swagger UI at /docs', async () => {
    const res = await fetch(`${base}/docs`, { redirect: 'manual' });
    expect([200, 301, 302].includes(res.status)).toBe(true);
  });
});
