// Verify result is reported on TWO independent axes so the UI can state both
// clearly (e.g. "valid signature, but the signer isn't registered on DeDi"):
//
//   signature: 'none' | 'valid' | 'modified' | 'invalid'
//     none     — no C2PA manifest
//     valid    — crypto signature + content hash OK (validation_state Valid)
//     modified — content changed since signing (a content-hash mismatch)
//     invalid  — signed, but the signature itself doesn't validate
//
//   signer: 'none' | 'verified' | 'unregistered' | 'revoked' | 'mismatch'
//     none         — no signature to attribute
//     verified     — signer key matches the live DeDi-published key (forgery-proof)
//     unregistered — no DeDi reference, or no record for it
//     revoked      — DeDi record exists but is not live
//     mismatch     — DeDi record is live but the signer key does NOT match it
//
// The two axes are evaluated independently — the signer is checked even when the
// signature is invalid — so every combination in the matrix is reportable.

export function signatureStatus(report) {
  if (report.validationState === 'Valid') return 'valid';
  return isContentTampered(report.validationStatus) ? 'modified' : 'invalid';
}

// `keyMatches` is a thunk so the (cert-extraction) work only runs for a live record.
export function signerStatus({ hasRef, record, keyMatches }) {
  if (!hasRef || !record) return 'unregistered';
  if (record.state !== 'live') return 'revoked';
  return keyMatches() ? 'verified' : 'mismatch';
}

// Single roll-up verdict (kept for the share-link API + back-compat). Same values
// the verifier emitted before: unsigned | tampered | invalid | untrusted | forged | authentic.
export function combinedVerdict(signature, signer) {
  if (signature === 'none') return 'unsigned';
  if (signature === 'modified') return 'tampered';
  if (signature === 'invalid') return 'invalid';
  if (signer === 'verified') return 'authentic';
  if (signer === 'mismatch') return 'forged';
  return 'untrusted'; // valid signature, but unregistered or revoked
}

// True iff validation failed because the signed content's hash no longer matches
// (the bytes were altered). Grounded in the c2pa-node status codes (e.g.
// assertion.hashedURI.mismatch, assertion.dataHash.mismatch).
export function isContentTampered(validationStatus) {
  return (
    Array.isArray(validationStatus) &&
    validationStatus.some((s) => s && typeof s.code === 'string' && /mismatch/i.test(s.code) && /hash/i.test(s.code))
  );
}
