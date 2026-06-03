// API-key authenticator (the `auth` seam). Maps an API key to an org identity
// (name/url + DeDi reference) so /sign is no longer an open "Signed by
// TrueCapture" oracle (C3) and each credential signs as its OWN org (H4).
// The key→identity map is built by the bootstrap from configuration
// (ORG_NAME/ORG_URL/DEDI_* etc. — coverage-excluded wiring).
export function createApiKeyAuth(credentials) {
  return {
    authenticate(headers) {
      const authz = headers.authorization || '';
      const key = authz.startsWith('Bearer ') ? authz.slice(7) : (headers['x-api-key'] || '');
      return key ? (credentials[key] || null) : null;
    },
  };
}
