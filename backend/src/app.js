import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { createHash } from 'node:crypto';

// App factory: wires injected seams (c2pa, store, clock, and later dedi/auth)
// to routes. Handlers depend only on injected services, never on globals, so
// they are testable with fakes/real impls. The `cmd`-style bootstrap (env →
// real services → listen()) is the only code excluded from the coverage gate.
export function createApp({ c2pa, store, clock }) {
  const app = Fastify({ logger: false });
  app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // H3 will refine

  app.get('/health', async () => ({
    status: 'ok',
    service: 'TrueCapture Backend',
    time: clock.now().toISOString(),
    manifests: store.size(),
  }));

  // Sign an uploaded asset into a real C2PA file (ES256/JUMBF). Verification
  // (the DeDi-key trust check) lands in C1; this route produces genuine C2PA.
  app.post('/sign', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });

    const asset = await data.toBuffer();
    const mimeType = data.mimetype;
    const when = clock.now().toISOString();
    const manifestDefinition = {
      claim_generator_info: [{ name: 'TrueCapture', version: '1.0.0' }],
      format: mimeType,
      title: data.filename,
      assertions: [{ label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created', when }] } }],
    };

    const signed = await c2pa.sign(asset, mimeType, manifestDefinition);
    const verifyHash = createHash('sha256').update(signed).digest('hex').slice(0, 24);
    store.put(verifyHash, { signedAt: when, mimeType, filename: data.filename });

    reply.header('Content-Type', mimeType);
    reply.header('X-Verify-Hash', verifyHash);
    reply.header('Access-Control-Expose-Headers', 'X-Verify-Hash');
    return reply.send(signed);
  });

  return app;
}
