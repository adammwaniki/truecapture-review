import { X509Certificate, createPublicKey } from 'node:crypto';

// Normalizes a PEM certificate OR a PEM public key to base64 SPKI DER.
export function toSpkiB64(value) {
  if (!value) return null;
  try {
    return new X509Certificate(value).publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  } catch {
    /* not a certificate */
  }
  try {
    return createPublicKey(value).export({ type: 'spki', format: 'der' }).toString('base64');
  } catch {
    /* not a public key */
  }
  return null;
}

// True iff the asset's signer SPKI (base64) equals the DeDi-published key/cert's
// SPKI. This is the forgery-proof identity binding: an attacker's key produces a
// different SPKI and fails to match.
export function publicKeysEqual(assetSpkiB64, dediPemOrKey) {
  const expected = toSpkiB64(dediPemOrKey);
  return Boolean(assetSpkiB64) && Boolean(expected) && assetSpkiB64 === expected;
}
