import { describe, it, expect } from 'vitest';
import { resolveConfig } from './config.js';

describe('resolveConfig', () => {
  it('applies safe defaults for an empty env', () => {
    const c = resolveConfig({});
    expect(c.org).toBe('TrueCapture');
    expect(c.orgUrl).toBe('https://www.truecapture.global');
    expect(c.dedi).toEqual({ namespace: null, registry: 'signing-keys', recordId: null, apiKey: null });
    expect(c.shouldPublish).toBe(false);
    expect(c.captcha).toEqual({ enforced: false, secret: null, verifyUrl: null, config: null });
    expect(c.oidc).toEqual({ enabled: false, issuer: null, audience: null, jwksUri: null });
    expect(c.allowedOrigins).toBeNull();
    expect(c.corsOrigin).toBe(false);
    expect(c.maxFileSize).toBe(50 * 1024 * 1024);
    expect(c.rateLimitMax).toBe(120);
    expect(c.port).toBe(3000);
    expect(c.host).toBe('0.0.0.0');
  });

  it('resolves a fully-configured env (every branch on)', () => {
    const c = resolveConfig({
      ORG_NAME: 'BBC', ORG_URL: 'https://bbc.co.uk',
      DEDI_API_KEY: 'k', DEDI_NAMESPACE: 'bbc', DEDI_REGISTRY: 'keys', DEDI_RECORD_ID: 'rec',
      CAPTCHA_SECRET: 's', CAPTCHA_VERIFY_URL: 'https://v', CAPTCHA_PROVIDER: 'turnstile', CAPTCHA_SITE_KEY: 'sk',
      OIDC_ISSUER: 'https://i', OIDC_AUDIENCE: 'aud', OIDC_JWKS_URI: 'https://jwks',
      ALLOWED_ORIGINS: 'https://a,https://b', CORS_ORIGINS: 'https://a',
      MAX_FILE_SIZE: '1000', RATE_LIMIT_MAX: '5', PORT: '8080', HOST: '127.0.0.1',
    });
    expect(c.org).toBe('BBC');
    expect(c.orgUrl).toBe('https://bbc.co.uk');
    expect(c.dedi).toEqual({ namespace: 'bbc', registry: 'keys', recordId: 'rec', apiKey: 'k' });
    expect(c.shouldPublish).toBe(true);
    expect(c.captcha.enforced).toBe(true);
    expect(c.captcha.config).toEqual({ provider: 'turnstile', siteKey: 'sk' });
    expect(c.oidc.enabled).toBe(true);
    expect(c.allowedOrigins).toEqual(['https://a', 'https://b']);
    expect(c.corsOrigin).toEqual(['https://a']);
    expect(c.maxFileSize).toBe(1000);
    expect(c.rateLimitMax).toBe(5);
    expect(c.port).toBe(8080);
    expect(c.host).toBe('127.0.0.1');
  });

  it('does not publish when DeDi is only partially configured', () => {
    expect(resolveConfig({ DEDI_API_KEY: 'k', DEDI_NAMESPACE: 'n' }).shouldPublish).toBe(false); // no recordId
    expect(resolveConfig({ CAPTCHA_SECRET: 's' }).captcha.enforced).toBe(false); // no verifyUrl
    expect(resolveConfig({ CAPTCHA_PROVIDER: 'turnstile' }).captcha.config).toBeNull(); // no siteKey
  });

  it('flags partial DeDi config as a fatal error, full or empty as fine (H-1)', () => {
    expect(resolveConfig({}).errors).toEqual([]); // nothing set → dev mode, OK
    expect(resolveConfig({ DEDI_API_KEY: 'k', DEDI_NAMESPACE: 'n', DEDI_RECORD_ID: 'r' }).errors).toEqual([]); // all set → OK
    expect(resolveConfig({ DEDI_API_KEY: 'k', DEDI_NAMESPACE: 'n' }).errors).toHaveLength(1); // missing record id
    expect(resolveConfig({ DEDI_RECORD_ID: 'r' }).errors).toHaveLength(1); // only record id
  });
});
