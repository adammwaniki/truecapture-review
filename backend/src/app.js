import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { createHash } from 'node:crypto';
import { verifyAsset } from './verify/pipeline.js';
import { toMp4Filename } from './media/transcode.js';

const DEVICE_CLASSES = new Set(['iOS', 'Android', 'Desktop', 'unknown']);
const deviceClassFrom = (headers) => (DEVICE_CLASSES.has(headers['x-device-class']) ? headers['x-device-class'] : 'unknown');

// Loose (non-filtering) response schema so serialization never drops `entity`.
const verdictResponse = {
  200: { description: 'Verification verdict (verdict + optional entity)', type: 'object', additionalProperties: true },
};

// App factory: wires injected seams to routes. The public /sign has no secret
// key — abuse controls are the per-IP rate limit (H3) + Origin allowlist +
// CAPTCHA (C3); trust comes from content + DeDi-anchored verify (C1/C2). The
// `cmd`-style bootstrap is the only coverage exclusion.
export function createApp({
  c2pa,
  store,
  clock,
  dedi,
  identity,
  oidc,
  captcha = { verify: async () => true },
  captchaConfig = null,
  // Converts unsigned-but-convertible containers (e.g. Chrome's WebM) to a
  // signable MP4 before signing. Default: nothing is transcodable (sign as-is);
  // `toMp4` is only consulted when `isTranscodable` returns true.
  transcode = { isTranscodable: () => false },
  corsOrigin = false,
  allowedOrigins = null,
  limiter = { check: () => true },
  maxFileSize = 50 * 1024 * 1024,
  trustProxy = false,
  verifyBaseUrl = null,
}) {
  const app = Fastify({ logger: false, trustProxy });
  app.register(cors, { origin: corsOrigin, methods: ['GET', 'POST', 'OPTIONS'] });
  app.register(multipart, { limits: { fileSize: maxFileSize } });
  app.register(swagger, {
    openapi: {
      info: {
        title: 'TrueCapture API',
        version: '1.0.0',
        description: 'C2PA media signing (ES256/JUMBF) with DeDi-anchored, forgery-proof verification.',
      },
      tags: [
        { name: 'sign', description: 'Signing endpoints' },
        { name: 'verify', description: 'Verification endpoints' },
        { name: 'system', description: 'Health & docs' },
      ],
    },
  });
  app.register(swaggerUi, { routePrefix: '/docs' });

  // Rate limit (anti-DoS, H3): reject floods by client IP before any work.
  app.addHook('onRequest', async (req, reply) => {
    if (!limiter.check(req.ip)) return reply.code(429).send({ error: 'Too Many Requests' });
  });

  // Buffer the uploaded file and, when it's an unsigned-but-convertible container
  // (e.g. Chrome's WebM), transcode it to a signable MP4. Returns the bytes +
  // adjusted mimetype/filename, or null after replying 422 if conversion fails.
  async function prepareUpload(data, reply) {
    let asset = await data.toBuffer();
    let { mimetype, filename } = data;
    if (transcode.isTranscodable(mimetype)) {
      try {
        asset = await transcode.toMp4(asset);
      } catch {
        reply.code(422).send({ error: 'Could not process the uploaded video' });
        return null;
      }
      mimetype = 'video/mp4';
      filename = toMp4Filename(filename);
    }
    return { asset, mimetype, filename };
  }

  async function signAndStore(asset, mimeType, filename, extraAssertions, deviceClass) {
    const when = clock.now().toISOString();
    const manifestDefinition = {
      claim_generator_info: [{ name: identity.org.name, version: '1.0.0' }],
      format: mimeType,
      title: filename,
      assertions: [
        { label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created', when }] } },
        { label: 'org.truecapture.dedi', data: { record_id: identity.dedi.record_id, namespace: identity.dedi.namespace, registry: identity.dedi.registry } },
        { label: 'org.truecapture.capture', data: { deviceClass } }, // M4: coarse class, never the raw UA
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
    const exposed = ['X-Verify-Hash'];
    if (verifyBaseUrl) {
      // M-7: tell clients the canonical share link so the extension/sign page
      // don't have to hardcode the public domain.
      reply.header('X-Verify-URL', `${verifyBaseUrl}/${verifyHash}`);
      exposed.push('X-Verify-URL');
    }
    reply.header('Access-Control-Expose-Headers', exposed.join(', '));
    return reply.send(signed);
  }

  // Routes live in a plugin registered AFTER @fastify/swagger so its onRoute
  // hook captures them into the OpenAPI spec.
  app.register(async (route) => {
    route.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

    route.get('/health', {
      schema: { tags: ['system'], summary: 'Liveness' },
      // L-4: do not expose the signed-record count on an unauthenticated endpoint.
    }, async () => ({ status: 'ok', service: 'TrueCapture Backend', time: clock.now().toISOString() }));

    // Public client config: the CAPTCHA provider + PUBLIC site key (never the
    // secret) so the static sign clients can render the right widget. `null`
    // when CAPTCHA is not configured — clients then sign without a token.
    route.get('/config', {
      schema: { tags: ['system'], summary: 'Public client config (CAPTCHA provider + site key)' },
    }, async () => ({ captcha: captchaConfig }));

    // Public sign — no secret key; Origin allowlist + CAPTCHA + per-IP rate limit (C3).
    route.post('/sign', {
      schema: {
        tags: ['sign'],
        summary: 'Sign an uploaded asset as the org (public)',
        description: 'Keyless public signing: requires an allowed Origin + a valid CAPTCHA token (X-Captcha-Token), rate-limited per IP. Returns the signed C2PA asset; the verify hash is in the X-Verify-Hash header.',
        consumes: ['multipart/form-data'],
      },
    }, async (req, reply) => {
      if (allowedOrigins && !allowedOrigins.includes(req.headers.origin)) {
        return reply.code(403).send({ error: 'Origin not allowed' });
      }
      if (!(await captcha.verify(req.headers['x-captcha-token']))) {
        return reply.code(403).send({ error: 'CAPTCHA verification failed' });
      }
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'No file provided' });
      const prepared = await prepareUpload(data, reply);
      if (!prepared) return reply; // 422 already sent (transcode failed)
      const { asset, mimetype, filename } = prepared;
      const { signed, verifyHash } = await signAndStore(asset, mimetype, filename, [], deviceClassFrom(req.headers));
      return sendSigned(reply, mimetype, signed, verifyHash);
    });

    // OIDC-bound sign (C3b): authenticate a user session and bind the verified user.
    route.post('/sign/session', {
      schema: {
        tags: ['sign'],
        summary: 'Sign with an OIDC-authenticated user binding',
        description: 'Validates a Bearer OIDC token, signs with the org DeDi-anchored key, and binds the verified user (sub/iss/email) into the manifest.',
        consumes: ['multipart/form-data'],
      },
    }, async (req, reply) => {
      const authz = req.headers.authorization || '';
      const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
      const claims = token ? await oidc.verify(token) : null;
      if (!claims) return reply.code(401).send({ error: 'Invalid session' });

      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'No file provided' });
      const prepared = await prepareUpload(data, reply);
      if (!prepared) return reply; // 422 already sent (transcode failed)
      const { asset, mimetype, filename } = prepared;
      // L-4: only bind the email when the IdP marked it verified.
      const userAssertion = { label: 'org.truecapture.signer', data: { iss: claims.iss, sub: claims.sub, email: claims.email_verified ? (claims.email ?? null) : null } };
      const { signed, verifyHash } = await signAndStore(asset, mimetype, filename, [userAssertion], deviceClassFrom(req.headers));
      return sendSigned(reply, mimetype, signed, verifyHash);
    });

    // Verify uploaded bytes (public). Real verdict from the shared pipeline (C1).
    route.post('/verify', {
      schema: {
        tags: ['verify'],
        summary: 'Verify an uploaded asset',
        description: 'Returns authentic / tampered / forged / untrusted / unsigned by re-checking the C2PA signature, content hash, and the DeDi-published key.',
        consumes: ['multipart/form-data'],
        response: verdictResponse,
      },
    }, async (req, reply) => {
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'No file provided' });
      const asset = await data.toBuffer();
      return verifyAsset({ c2pa, dedi }, asset, data.mimetype);
    });

    // Share-link verify (C2): re-verify the STORED signed asset; real verdict.
    route.get('/verify/:hash', {
      schema: {
        tags: ['verify'],
        summary: 'Verify a stored asset by its share-link hash',
        params: { type: 'object', properties: { hash: { type: 'string' } }, required: ['hash'] },
        response: verdictResponse,
      },
    }, async (req, reply) => {
      const rec = store.get(req.params.hash);
      if (!rec) return reply.code(404).send({ verdict: 'unknown' });
      const asset = Buffer.from(rec.assetB64, 'base64');
      return verifyAsset({ c2pa, dedi }, asset, rec.mimeType);
    });
  });

  return app;
}
