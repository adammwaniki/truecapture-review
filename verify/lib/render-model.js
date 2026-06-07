import { httpsUrlOrNull } from './safe-url.js';

// Maps the backend's two-axis verify result { signature, signer, verdict, entity }
// to a display model. The two axes are presented INDEPENDENTLY so the UI can give
// an honest, split verdict — e.g. a green "signature is valid" pass plus a SEPARATE
// orange warning that the signer isn't registered on DeDi. Drives the UI from the
// REAL result (no hardcoded "authentic"); the DeDi entity link is rendered only
// when it is a safe https URL (M3).
//
// Model shape:
//   verdict        banner CSS class (presentation): authentic|signed|tampered|forged|invalid|unsigned|checking|unknown
//   icon, headline banner icon + plain-language headline
//   subtitle       optional second line under the headline (null when none)
//   warning        optional secondary block { tone:'warn'|'bad', icon, title, detail } (null when none)
//   showChecks     whether to render the two-row "Checks" card (false when the banner
//                  + warning already carry both axes, e.g. the green-pass + orange-warning case)
//   signatureLabel/signerLabel + signatureTone/signerTone  the two "Checks" rows

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

// Per-axis colour tone for the "Checks" rows: good=green, warn=orange, bad=red.
const SIGNATURE_TONE = { valid: 'good', modified: 'bad', invalid: 'bad', none: 'neutral' };
const SIGNER_TONE = { verified: 'good', unregistered: 'warn', revoked: 'warn', mismatch: 'bad', none: 'neutral' };

export function toCombinedModel(result) {
  const r = result || {};
  if (r.verdict === 'unknown' || (!r.signature && !r.verdict)) {
    return {
      verdict: 'unknown', icon: 'info', headline: "Couldn't verify this file",
      subtitle: null, warning: null, showChecks: false,
      signatureLabel: null, signerLabel: null, signatureTone: 'neutral', signerTone: 'neutral',
      entityName: null, entityUrl: null,
    };
  }

  const signature = r.signature || 'none';
  const signer = r.signer || 'none';
  const pending = signer === 'pending'; // fast in-browser preview: signature known, signer still checking
  const entity = r.entity || null;

  let verdict;
  let icon;
  let headline;
  let subtitle = null;
  let warning = null;
  let showChecks = true;

  if (signature === 'none') {
    verdict = 'unsigned'; icon = 'info'; headline = 'Not signed';
  } else if (signature === 'modified') {
    verdict = 'tampered'; icon = 'cross'; headline = 'Content modified since signing';
  } else if (signature === 'invalid') {
    verdict = 'invalid'; icon = 'cross'; headline = 'Signature could not be validated';
  } else if (pending) {
    verdict = 'checking'; icon = 'info'; headline = 'Signed — confirming signer…';
  } else if (signer === 'verified') {
    verdict = 'authentic'; icon = 'check'; headline = 'Authentic';
  } else if (signer === 'mismatch') {
    // The signature is cryptographically valid, but the signer key does NOT match
    // the org's DeDi-published key — an active forgery. Deliberately NOT a green
    // pass: the headline stays red so a forged file never reads as "valid".
    verdict = 'forged'; icon = 'cross'; headline = "Forged — signer's key doesn't match DeDi";
  } else {
    // Valid signature + (unregistered | revoked): the signature truly passed, and the
    // only gap is WHO signed it. Show a GREEN signature pass + a SEPARATE orange
    // warning for the untrusted signer (requested UX). The banner + warning carry
    // both axes, so the "Checks" card is redundant here.
    verdict = 'signed'; icon = 'check'; headline = 'Signature is valid';
    subtitle = 'Content is intact since it was signed';
    showChecks = false;
    warning = signer === 'revoked'
      ? { tone: 'warn', icon: 'warn', title: 'Signer key revoked on DeDi.global', detail: 'The signing key has been revoked, so the signer can no longer be trusted.' }
      : { tone: 'warn', icon: 'warn', title: 'Signer not registered on DeDi.global', detail: "We can't confirm who signed this file." };
  }

  return {
    verdict,
    icon,
    headline,
    subtitle,
    warning,
    showChecks,
    signatureLabel: SIGNATURE_LABEL[signature] || SIGNATURE_LABEL.none,
    signerLabel: signature === 'none' ? null : (pending ? 'Checking DeDi.global…' : SIGNER_LABEL[signer] || null),
    signatureTone: SIGNATURE_TONE[signature] || 'neutral',
    signerTone: pending ? 'neutral' : (SIGNER_TONE[signer] || 'neutral'),
    entityName: (entity && entity.name) || null,
    entityUrl: httpsUrlOrNull(entity && entity.url),
  };
}
