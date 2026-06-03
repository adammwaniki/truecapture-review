import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { createHash } from 'node:crypto';
import { extractSignerSpki } from './c2pa/extract-cert.js';
import { extractDediRef } from './verify/dedi-ref.js';
import { publicKeysEqual } from './verify/keymatch.js';
import { verdictFor } from './verify/verdict.js';

// App factory: wires injected seams (c2pa, store, clock, dedi, auth) to routes.
// `corsOrigin` defaults to false (same-origin only) — replacing the legacy
// `origin: true` (C3). The `cmd`-style bootstrap (env → real services → listen)
// is the only coverage exclusion.
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

  // Sign into real C2PA (ES256/JUMBF). Requires an authenticated credential
  // (C3); the credential's org identity + DeDi reference are embedded (H4),
  // so each org signs as itself and the verifier can bind to the right key.
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
    store.put(verifyHash, { signedAt: when, mimeType, filename: data.filename, org: cred.org.name });

    reply.header('Content-Type', mimeType);
    reply.header('X-Verify-Hash', verifyHash);
    reply.header('Access-Control-Expose-Headers', 'X-Verify-Hash');
    return reply.send(signed);
  });

  // Forgery-proof verify (C1): validation_state=Valid proves crypto signature +
  // content-hash integrity; identity is bound by requiring the asset's signer
  // key to equal the DeDi-published key for the claimed (live) record. Public.
  app.post('/verify', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });

    const asset = await data.toBuffer();
    const mimeType = data.mimetype;
    const report = await c2pa.read(asset, mimeType);
    if (!report) return { verdict: 'unsigned' };
    if (report.validationState !== 'Valid') return { verdict: 'tampered' };

    const ref = extractDediRef(report.manifestStore);
    const record = ref ? await dedi.lookup(ref) : null;
    let keyMatches = false;
    if (record && record.state === 'live') {
      keyMatches = publicKeysEqual(extractSignerSpki(asset), record.publicKey);
    }

    const verdict = verdictFor({
      hasManifest: true,
      validationState: report.validationState,
      hasRef: Boolean(ref),
      record,
      keyMatches,
    });
    return { verdict, entity: record?.entity ?? null };
  });

  return app;
}
