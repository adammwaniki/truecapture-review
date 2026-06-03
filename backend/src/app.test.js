import { describe, it, expect } from 'vitest';
import { createApp } from './app.js';
import { createMemoryStore } from './store/memory.js';
import { fixedClock } from './clock.js';

describe('app /health (integration via inject)', () => {
  it('reports status, deterministic time, and live manifest count from injected seams', async () => {
    const store = createMemoryStore();
    const app = createApp({ store, clock: fixedClock(new Date('2026-01-01T00:00:00.000Z')) });

    let res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'ok',
      service: 'TrueCapture Backend',
      time: '2026-01-01T00:00:00.000Z',
      manifests: 0,
    });

    store.put('abc', { manifest: {} });
    res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json().manifests).toBe(1);

    await app.close();
  });
});
