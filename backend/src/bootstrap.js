import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureChain } from './keys/chain.js';
import { createC2pa } from './c2pa/index.js';
import { createSqliteStore } from './store/sqlite.js';
import { createDedi } from './dedi/index.js';
import { createCaptchaVerifier } from './captcha.js';
import { createRateLimiter } from './ratelimit.js';
import { systemClock } from './clock.js';
import { createApp } from './app.js';

// Composition root — intentionally the SINGLE coverage exclusion (see
// vitest.config.js). It only wires the tested src/ seams to real
// implementations from env; it contains no business logic of its own.
export async function start(env = process.env) {
  const here = dirname(fileURLToPath(import.meta.url));
  const keysDir = join(here, '..', '.keys');
  const org = env.ORG_NAME || 'TrueCapture';
  const orgUrl = env.ORG_URL || 'https://www.truecapture.global';

  // EC P-256 CA→leaf chain (generated on first run; PKCS#8 leaf key).
  const keys = ensureChain(keysDir, { org });
  const leafPem = readFileSync(join(keysDir, 'leaf.crt'), 'utf8');

  const namespace = env.DEDI_NAMESPACE;
  const registry = env.DEDI_REGISTRY || 'signing-keys';
  const recordId = env.DEDI_RECORD_ID;
  const dedi = createDedi({ apiKey: env.DEDI_API_KEY });

  // Publish the signing certificate on DeDi so verifiers can bind to it (C1/C5).
  if (env.DEDI_API_KEY && namespace && recordId) {
    await dedi
      .publish({ namespace, registry, recordName: recordId, publicKeyPem: leafPem, keyType: 'ES256', entity: { name: org, url: orgUrl } })
      .catch((err) => console.error('DeDi registration failed:', err.message));
  }

  // Public service identity (no per-user "who"; trust is content + DeDi — C3).
  const identity = { org: { name: org, url: orgUrl }, dedi: { record_id: recordId, namespace, registry } };

  // CAPTCHA + Origin allowlist + rate limit guard the keyless public /sign.
  const captcha = env.CAPTCHA_SECRET && env.CAPTCHA_VERIFY_URL
    ? createCaptchaVerifier({ verifyUrl: env.CAPTCHA_VERIFY_URL, secret: env.CAPTCHA_SECRET })
    : { verify: async () => true };

  const app = createApp({
    c2pa: createC2pa(keys),
    store: createSqliteStore(join(keysDir, '..', 'records.db')),
    clock: systemClock(),
    dedi,
    identity,
    captcha,
    limiter: createRateLimiter({ max: Number(env.RATE_LIMIT_MAX || 120), windowMs: 60_000 }),
    corsOrigin: env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',') : false,
    allowedOrigins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : null,
    maxFileSize: Number(env.MAX_FILE_SIZE || 50 * 1024 * 1024),
  });

  const port = Number(env.PORT || 3000);
  const host = env.HOST || '0.0.0.0';
  await app.listen({ port, host });
  return app;
}
