import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { createApp } from './app.js';
import { createMemoryStore } from './store/memory.js';
import { systemClock } from './clock.js';
import { createRateLimiter } from './ratelimit.js';

describe('H3 anti-DoS', () => {
  it('rate-limits floods with 429', async () => {
    const app = createApp({
      store: createMemoryStore(),
      clock: systemClock(),
      limiter: createRateLimiter({ max: 1, windowMs: 60000, now: () => 0 }),
    });
    const base = await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      expect((await fetch(`${base}/health`)).status).toBe(200);
      expect((await fetch(`${base}/health`)).status).toBe(429);
    } finally {
      await app.close();
    }
  });

  it('rejects an upload over the size cap', async () => {
    const app = createApp({
      store: createMemoryStore(),
      clock: systemClock(),
      c2pa: { async read() { return null; } },
      dedi: { async lookup() { return null; } },
      maxFileSize: 100,
    });
    const base = await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } } })
        .jpeg().toBuffer();
      const fd = new FormData();
      fd.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'big.jpg');
      const res = await fetch(`${base}/verify`, { method: 'POST', body: fd });
      expect(res.status).toBe(413);
    } finally {
      await app.close();
    }
  });
});
