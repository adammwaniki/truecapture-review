import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import { createOidcVerifier } from './verify.js';

const ISS = 'https://idp.example';
const AUD = 'truecapture';

describe('createOidcVerifier', () => {
  let publicKey;
  let privateKey;

  beforeAll(async () => {
    ({ publicKey, privateKey } = await generateKeyPair('ES256'));
  });

  const token = (claims = {}, { iss = ISS, aud = AUD } = {}) =>
    new SignJWT({ sub: 'user-1', ...claims })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer(iss)
      .setAudience(aud)
      .setExpirationTime('1h')
      .sign(privateKey);

  it('returns the claims for a valid token', async () => {
    const v = createOidcVerifier({ issuer: ISS, audience: AUD, jwks: publicKey });
    const claims = await v.verify(await token({ email: 'u@x.com' }));
    expect(claims.sub).toBe('user-1');
    expect(claims.email).toBe('u@x.com');
  });

  it('returns null for a malformed token', async () => {
    const v = createOidcVerifier({ issuer: ISS, audience: AUD, jwks: publicKey });
    expect(await v.verify('not.a.jwt')).toBeNull();
  });

  it('returns null when the audience does not match', async () => {
    const v = createOidcVerifier({ issuer: ISS, audience: 'someone-else', jwks: publicKey });
    expect(await v.verify(await token())).toBeNull();
  });
});
