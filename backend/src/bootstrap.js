import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureChain } from './keys/chain.js';
import { createC2pa } from './c2pa/index.js';
import { createSqliteStore } from './store/sqlite.js';
import { createDedi } from './dedi/index.js';
import { createCaptchaVerifier } from './captcha.js';
import { createOidcVerifier } from './oidc/verify.js';
import { createRemoteJWKSet } from 'jose';
import { createRateLimiter } from './ratelimit.js';
import { systemClock } from './clock.js';
import { resolveConfig } from './config.js';
import { scheduleRetention } from './retention.js';
import { createApp } from './app.js';

// Composition root — intentionally the SINGLE coverage exclusion (see
// vitest.config.js). The env→config DECISIONS live in the tested ./config.js
// (resolveConfig); this file only wires the resolved config to real
// implementations and has no branch logic of its own.
export async function start(env = process.env) {
  const cfg = resolveConfig(env);
  if (cfg.errors.length) {
    cfg.errors.forEach((e) => console.error('[config] FATAL:', e));
    throw new Error(`Invalid configuration: ${cfg.errors.join(' | ')}`);
  }
  cfg.warnings.forEach((w) => console.warn('[config] WARNING:', w));
  const here = dirname(fileURLToPath(import.meta.url));
  const keysDir = join(here, '..', '.keys');

  // EC P-256 CA→leaf chain (generated on first run; PKCS#8 leaf key).
  const keys = ensureChain(keysDir, { org: cfg.org });
  const leafPem = readFileSync(join(keysDir, 'leaf.crt'), 'utf8');

  const dedi = createDedi({ apiKey: cfg.dedi.apiKey });
  // Publish the signing certificate on DeDi so verifiers can bind to it (C1/C5).
  if (cfg.shouldPublish) {
    const published = await dedi
      .publish({ namespace: cfg.dedi.namespace, registry: cfg.dedi.registry, recordName: cfg.dedi.recordId, publicKeyPem: leafPem, keyType: 'ES256', entity: { name: cfg.org, url: cfg.orgUrl } })
      .catch(() => false);
    if (!published) console.error('DeDi registration did not succeed (network error or rejected) — signed files may verify as "untrusted".');
  }

  // Public service identity (no per-user "who"; trust is content + DeDi — C3).
  const identity = { org: { name: cfg.org, url: cfg.orgUrl }, dedi: { record_id: cfg.dedi.recordId, namespace: cfg.dedi.namespace, registry: cfg.dedi.registry } };

  // CAPTCHA + Origin allowlist + rate limit guard the keyless public /sign.
  const captcha = cfg.captcha.enforced
    ? createCaptchaVerifier({ verifyUrl: cfg.captcha.verifyUrl, secret: cfg.captcha.secret })
    : { verify: async () => true };

  // OIDC-bound signing (C3b) for authenticated user→content (e.g. mobile wallets).
  const oidc = cfg.oidc.enabled
    ? createOidcVerifier({ issuer: cfg.oidc.issuer, audience: cfg.oidc.audience, jwks: createRemoteJWKSet(new URL(cfg.oidc.jwksUri)) })
    : { verify: async () => null }; // not configured → /sign/session returns 401

  const store = createSqliteStore(join(keysDir, '..', 'records.db'));
  scheduleRetention({ store, retentionMs: cfg.retentionMs }); // H-3 (no-op when disabled)

  const app = createApp({
    c2pa: createC2pa(keys),
    store,
    clock: systemClock(),
    dedi,
    identity,
    oidc,
    captcha,
    captchaConfig: cfg.captcha.config,
    limiter: createRateLimiter({ max: cfg.rateLimitMax, windowMs: 60_000 }),
    corsOrigin: cfg.corsOrigin,
    allowedOrigins: cfg.allowedOrigins,
    maxFileSize: cfg.maxFileSize,
    trustProxy: cfg.trustProxy,
    verifyBaseUrl: cfg.verifyBaseUrl,
  });

  await app.listen({ port: cfg.port, host: cfg.host });
  return app;
}
