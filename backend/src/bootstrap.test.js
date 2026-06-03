import { describe, it, expect, afterAll } from 'vitest';
import { start } from './bootstrap.js';

// Smoke test for the composition root (excluded from the coverage gate): proves
// the real seams actually wire together and serve traffic. No DEDI_* creds, so
// DeDi registration is skipped and no network is touched.
describe('bootstrap.start (smoke)', () => {
  let app;
  afterAll(async () => {
    if (app) await app.close();
  });

  it('wires the real services and serves /health', async () => {
    app = await start({ PORT: '0', HOST: '127.0.0.1' });
    const { port } = app.server.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ok');
  });
});
