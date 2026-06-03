import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { createHash } from 'node:crypto';
import { verifyAsset } from './verify/pipeline.js';

// App factory: wires injected seams (c2pa, store, clock, dedi, auth, limiter) to
// routes. Handlers depend only on injected services. The `cmd`-style bootstrap
// (env → real services → listen) is the only coverage exclusion.
export function createApp({
  c2pa,
  store,
  clock,
  dedi,
  auth,
  corsOrigin = false,
  limiter = { check: () => true },
  maxFileSize = 50 * 1024 * 1024,
}) {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: corsOrigin, methods: ['GET', 'POST', 'OPTIONS'] });
  app.register(multipart, { limits: { fileSize: maxFileSize } });

  // Rate limit (anti-DoS, H3): reject floods by client IP before any work.
  app.addHook('onRequest', async (req, reply) => {
    if (!limiter.check(req.ip)) return reply.code(429).send({ error: 'Too Many Requests' });
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'TrueCapture Backend',
    time: clock.now().toISOString(),
    manifests: store.size(),
  }));

  // Sign into real C2PA (ES256/JUMBF), authenticated (C3); the credential's org
  // identity + DeDi reference are embedded (H4). The signed asset is stored so
  // the share link can re-verify the exact bytes (C2).
  app.post('/sign', async (req, reply) => {
    const cred = auth.authenticate(req.headers);
    if (!cred) return reply.code(401).send({ error: 'Unauthorized' });

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });

    const asset = await data.toBuffer();
    const mimeType = data.mimetype;
    const when = clock.now().toISOString();
    const manifestDefinition = {
      claim_generator_info: [{ name: cred.org.name, version: '1.0.0' }],
      format: mimeType,
      title: data.filename,
      assertions: [
        { label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created', when }] } },
        { label: 'org.truecapture.dedi', data: { record_id: cred.dedi.record_id, namespace: cred.dedi.namespace, registry: cred.dedi.registry } },
      ],
    };

    const signed = await c2pa.sign(asset, mimeType, manifestDefinition);
    const verifyHash = createHash('sha256').update(signed).digest('hex').slice(0, 24);
    store.put(verifyHash, { signedAt: when, mimeType, filename: data.filename, org: cred.org.name, assetB64: signed.toString('base64') });

    reply.header('Content-Type', mimeType);
    reply.header('X-Verify-Hash', verifyHash);
    reply.header('Access-Control-Expose-Headers', 'X-Verify-Hash');
    return reply.send(signed);
  });

  // Verify uploaded bytes (public). Real verdict from the shared pipeline (C1).
  app.post('/verify', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });
    const asset = await data.toBuffer();
    return verifyAsset({ c2pa, dedi }, asset, data.mimetype);
  });

  // Share-link verify (C2): re-verify the STORED signed asset end-to-end and
  // return the real verdict. No hardcoded authenticity, and bound to the bytes.
  app.get('/verify/:hash', async (req, reply) => {
    const rec = store.get(req.params.hash);
    if (!rec) return reply.code(404).send({ verdict: 'unknown' });
    const asset = Buffer.from(rec.assetB64, 'base64');
    return verifyAsset({ c2pa, dedi }, asset, rec.mimeType);
  });

  return app;
}
