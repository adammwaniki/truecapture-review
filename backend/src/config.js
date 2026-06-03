// Pure resolution of process.env into a typed config object (the testable half
// of the composition root). bootstrap.js wires real seams from this; all the
// conditional/branch logic lives here so it is covered by tests rather than
// hidden behind the bootstrap coverage exclusion (review finding L-2).

const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export function resolveConfig(env) {
  const org = env.ORG_NAME || 'TrueCapture';
  const orgUrl = env.ORG_URL || 'https://www.truecapture.global';

  const namespace = env.DEDI_NAMESPACE || null;
  const registry = env.DEDI_REGISTRY || 'signing-keys';
  const recordId = env.DEDI_RECORD_ID || null;
  const apiKey = env.DEDI_API_KEY || null;
  // All three are required for a signed file to ever verify as `authentic`.
  const shouldPublish = Boolean(apiKey && namespace && recordId);

  const captchaEnforced = Boolean(env.CAPTCHA_SECRET && env.CAPTCHA_VERIFY_URL);
  const captchaConfig = env.CAPTCHA_PROVIDER && env.CAPTCHA_SITE_KEY
    ? { provider: env.CAPTCHA_PROVIDER, siteKey: env.CAPTCHA_SITE_KEY }
    : null;

  const oidcEnabled = Boolean(env.OIDC_ISSUER && env.OIDC_AUDIENCE && env.OIDC_JWKS_URI);

  const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : null;
  const corsOrigin = env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',') : false;

  // H-1: DeDi needs ALL of api key + namespace + record id, or none. With only
  // some set, publish is skipped and signed files can never reach `authentic`
  // (extractDediRef requires record_id) — fail fast instead of shipping a broken
  // deployment that silently verifies everything as `untrusted`.
  const errors = [];
  const dediVarsSet = [apiKey, namespace, recordId].filter(Boolean).length;
  if (dediVarsSet > 0 && dediVarsSet < 3) {
    errors.push(
      'DeDi is partially configured. Set DEDI_API_KEY, DEDI_NAMESPACE and DEDI_RECORD_ID together — ' +
        'without all three, key registration is skipped and signed files can never verify as "authentic" (they fall back to "untrusted").',
    );
  }

  // M-1: the keyless public /sign fails OPEN when unprotected — surface it loudly
  // rather than silently shipping a public signer guarded only by the rate limit.
  const warnings = [];
  if (!captchaEnforced && !allowedOrigins) {
    warnings.push(
      'Public /sign is protected only by the per-IP rate limit — no CAPTCHA and no Origin allowlist. ' +
        'Set CAPTCHA_SECRET + CAPTCHA_VERIFY_URL and/or ALLOWED_ORIGINS before exposing it publicly.',
    );
  }
  if (!captchaEnforced && (env.CAPTCHA_SECRET || env.CAPTCHA_VERIFY_URL)) {
    warnings.push('CAPTCHA is only partially configured (set BOTH CAPTCHA_SECRET and CAPTCHA_VERIFY_URL) — it is currently disabled.');
  }

  return {
    errors,
    warnings,
    org,
    orgUrl,
    dedi: { namespace, registry, recordId, apiKey },
    shouldPublish,
    captcha: {
      enforced: captchaEnforced,
      secret: env.CAPTCHA_SECRET || null,
      verifyUrl: env.CAPTCHA_VERIFY_URL || null,
      config: captchaConfig,
    },
    oidc: {
      enabled: oidcEnabled,
      issuer: env.OIDC_ISSUER || null,
      audience: env.OIDC_AUDIENCE || null,
      jwksUri: env.OIDC_JWKS_URI || null,
    },
    allowedOrigins,
    corsOrigin,
    maxFileSize: Number(env.MAX_FILE_SIZE || DEFAULT_MAX_FILE_SIZE),
    rateLimitMax: Number(env.RATE_LIMIT_MAX || 120),
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
  };
}
