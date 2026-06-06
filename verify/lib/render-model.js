import { httpsUrlOrNull } from './safe-url.js';

// Maps the backend's two-axis verify result { signature, signer, verdict, entity }
// to a display model: a plain-language headline, a banner verdict class + icon,
// and the two explicit lines (Signature + Signer). Drives the UI from the REAL
// result (no hardcoded "authentic"); the DeDi entity link is rendered only when
// it is a safe https URL (M3).

const SIGNATURE_LABEL = {
  valid: 'Valid — content is intact since it was signed',
  modified: 'Content has changed since it was signed',
  invalid: 'Present, but could not be validated',
  none: 'No C2PA signature found',
};

const SIGNER_LABEL = {
  verified: 'Verified — key matches the organisation registered on DeDi.global',
  unregistered: 'Not registered on DeDi.global',
  revoked: 'Registered, but the key is revoked on DeDi.global',
  mismatch: 'Does NOT match the organisation registered on DeDi.global',
  none: null,
};

export function toCombinedModel(result) {
  const r = result || {};
  if (r.verdict === 'unknown' || (!r.signature && !r.verdict)) {
    return { verdict: 'unknown', icon: 'info', headline: "Couldn't verify this file", signatureLabel: null, signerLabel: null, entityName: null, entityUrl: null };
  }

  const signature = r.signature || 'none';
  const signer = r.signer || 'none';
  const entity = r.entity || null;

  let verdict;
  let icon;
  let headline;
  if (signature === 'none') {
    verdict = 'unsigned'; icon = 'info'; headline = 'Not signed';
  } else if (signature === 'modified') {
    verdict = 'tampered'; icon = 'cross'; headline = 'Content modified since signing';
  } else if (signature === 'invalid') {
    verdict = 'invalid'; icon = 'cross'; headline = 'Signature could not be validated';
  } else if (signer === 'verified') {
    verdict = 'authentic'; icon = 'check'; headline = 'Authentic';
  } else if (signer === 'mismatch') {
    verdict = 'forged'; icon = 'cross'; headline = "Forged — signer's key doesn't match DeDi";
  } else if (signer === 'revoked') {
    verdict = 'untrusted'; icon = 'warn'; headline = "Valid signature — signer's key is revoked on DeDi";
  } else {
    verdict = 'untrusted'; icon = 'warn'; headline = 'Valid signature — signer not registered on DeDi';
  }

  return {
    verdict,
    icon,
    headline,
    signatureLabel: SIGNATURE_LABEL[signature] || SIGNATURE_LABEL.none,
    signerLabel: signature === 'none' ? null : SIGNER_LABEL[signer] || null,
    entityName: (entity && entity.name) || null,
    entityUrl: httpsUrlOrNull(entity && entity.url),
  };
}
