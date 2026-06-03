import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { createHash } from 'node:crypto';
import { verifyAsset } from './verify/pipeline.js';

// App factory: wires injected seams to routes. The public /sign has no secret
// key — its abuse controls are the per-IP rate limit (H3) + an Origin allowlist
// + CAPTCHA (C3); trust comes from the content binding + DeDi-anchored verify
// (C1/C2). The `cmd`-style bootstrap is the only coverage exclusion.
export function createApp({
  c2pa,
  store,
  clock,
  dedi,
  identity,
  oidc,
  captcha = { verify: async () => true },
  corsOrigin = false,
  allowedOrigins = null,
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

  async function signAndStore(asset, mimeType, filename, extraAssertions = []) {
    const when = clock.now().toISOString();
    const manifestDefinition = {
      claim_generator_info: [{ name: identity.org.name, version: '1.0.0' }],
      format: mimeType,
      title: filename,
      assertions: [
        { label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created', when }] } },
        { label: 'org.truecapture.dedi', data: { record_id: identity.dedi.record_id, namespace: identity.dedi.namespace, registry: identity.dedi.registry } },
        ...extraAssertions,
      ],
    };
    const signed = await c2pa.sign(asset, mimeType, manifestDefinition);
    const verifyHash = createHash('sha256').update(signed).digest('hex').slice(0, 24);
    store.put(verifyHash, { signedAt: when, mimeType, filename, org: identity.org.name, assetB64: signed.toString('base64') });
    return { signed, verifyHash };
  }

  function sendSigned(reply, mimeType, signed, verifyHash) {
    reply.header('Content-Type', mimeType);
    reply.header('X-Verify-Hash', verifyHash);
    reply.header('Access-Control-Expose-Headers', 'X-Verify-Hash');
    return reply.send(signed);
  }

  app.get('/health', async () => ({
    status: 'ok',
    service: 'TrueCapture Backend',
    time: clock.now().toISOString(),
    manifests: store.size(),
  }));

  // Public sign — no secret key; Origin allowlist + CAPTCHA + per-IP rate limit (C3).
  app.post('/sign', async (req, reply) => {
    if (allowedOrigins && !allowedOrigins.includes(req.headers.origin)) {
      return reply.code(403).send({ error: 'Origin not allowed' });
    }
    if (!(await captcha.verify(req.headers['x-captcha-token']))) {
      return reply.code(403).send({ error: 'CAPTCHA verification failed' });
    }
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });
    const asset = await data.toBuffer();
    const { signed, verifyHash } = await signAndStore(asset, data.mimetype, data.filename);
    return sendSigned(reply, data.mimetype, signed, verifyHash);
  });

  // OIDC-bound sign (C3b): authenticate a user session and bind the verified
  // user (sub/iss/email) into the manifest, in addition to the org DeDi key.
  app.post('/sign/session', async (req, reply) => {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    const claims = token ? await oidc.verify(token) : null;
    if (!claims) return reply.code(401).send({ error: 'Invalid session' });

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });
    const asset = await data.toBuffer();
    const userAssertion = { label: 'org.truecapture.signer', data: { iss: claims.iss, sub: claims.sub, email: claims.email ?? null } };
    const { signed, verifyHash } = await signAndStore(asset, data.mimetype, data.filename, [userAssertion]);
    return sendSigned(reply, data.mimetype, signed, verifyHash);
  });

  // Verify uploaded bytes (public). Real verdict from the shared pipeline (C1).
  app.post('/verify', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });
    const asset = await data.toBuffer();
    return verifyAsset({ c2pa, dedi }, asset, data.mimetype);
  });

  // Share-link verify (C2): re-verify the STORED signed asset; real verdict.
  app.get('/verify/:hash', async (req, reply) => {
    const rec = store.get(req.params.hash);
    if (!rec) return reply.code(404).send({ verdict: 'unknown' });
    const asset = Buffer.from(rec.assetB64, 'base64');
    return verifyAsset({ c2pa, dedi }, asset, rec.mimeType);
  });

  return app;
}
