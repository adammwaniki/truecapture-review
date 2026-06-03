import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureChain } from './keys/chain.js';
import { createC2pa } from './c2pa/index.js';
import { createSqliteStore } from './store/sqlite.js';
import { createDedi } from './dedi/index.js';
import { createApiKeyAuth } from './auth/apikey.js';
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

  // Publish the signing certificate on DeDi so verifiers can bind to it (C1/C5:
  // the record carries the real ES256 cert + keyType). Skipped without creds.
  if (env.DEDI_API_KEY && namespace && recordId) {
    await dedi
      .publish({ namespace, registry, recordName: recordId, publicKeyPem: leafPem, keyType: 'ES256', entity: { name: org, url: orgUrl } })
      .catch((err) => console.error('DeDi registration failed:', err.message));
  }

  const identity = { org: { name: org, url: orgUrl }, dedi: { record_id: recordId, namespace, registry } };
  const auth = createApiKeyAuth(env.SIGNING_API_KEY ? { [env.SIGNING_API_KEY]: identity } : {});

  const app = createApp({
    c2pa: createC2pa(keys),
    store: createSqliteStore(join(keysDir, '..', 'records.db')),
    clock: systemClock(),
    dedi,
    auth,
    limiter: createRateLimiter({ max: Number(env.RATE_LIMIT_MAX || 120), windowMs: 60_000 }),
    corsOrigin: env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',') : false,
    maxFileSize: Number(env.MAX_FILE_SIZE || 50 * 1024 * 1024),
  });

  const port = Number(env.PORT || 3000);
  const host = env.HOST || '0.0.0.0';
  await app.listen({ port, host });
  return app;
}
