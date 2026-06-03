import Fastify from 'fastify';

// App factory: wires injected seams (store, clock, and later c2pa/dedi/auth)
// to routes. Handlers depend only on the injected services, never on globals,
// so they are testable with fakes (see test/fakes/). The real service
// implementations land in their own findings (C4/C1/C3/H1); `createApp` and the
// route shells are the integration seam they plug into.
//
// `cmd`-style bootstrap (reading env, building real services, listen()) is the
// only code excluded from the coverage gate.
export function createApp({ store, clock }) {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'TrueCapture Backend',
    time: clock.now().toISOString(),
    manifests: store.size(),
  }));

  return app;
}
