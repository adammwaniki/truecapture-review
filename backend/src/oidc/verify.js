import { jwtVerify } from 'jose';

// OIDC verifier seam (C3b). Validates a JWT against the provider's keys and the
// expected issuer/audience; returns the claims, or null on any failure. `jwks`
// is the key input jose accepts — `createRemoteJWKSet(new URL(jwksUri))` in
// production, or a local key in tests.
export function createOidcVerifier({ issuer, audience, jwks }) {
  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, jwks, { issuer, audience });
        return payload;
      } catch {
        return null;
      }
    },
  };
}
