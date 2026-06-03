// Pure verdict decision for /verify. Inputs are gathered by the route:
//  - hasManifest:    a C2PA manifest was found
//  - validationState: c2pa-node's validation_state ('Valid' = crypto sig + content hash OK)
//  - contentTampered: the validation failed specifically on a content-hash mismatch
//                     (vs a signature/credential problem) — see isContentTampered
//  - hasRef:         the asset claims a DeDi identity (org.truecapture.dedi assertion)
//  - record:         the DeDi record looked up for that identity ({ state, ... } | null)
//  - keyMatches:     the asset's signer key equals the DeDi-published key
//
// Note: an intact file signed by an *untrusted* signer stays validation_state
// 'Valid' (signer identity is the DeDi key compare below, not the trust anchor),
// so only a real content-hash mismatch reaches `tampered`; other invalidity
// (e.g. a broken signature) is `invalid`.
export function verdictFor({ hasManifest, validationState, contentTampered, hasRef, record, keyMatches }) {
  if (!hasManifest) return 'unsigned';
  if (validationState !== 'Valid') return contentTampered ? 'tampered' : 'invalid';
  if (!hasRef) return 'untrusted';
  if (!record || record.state !== 'live') return 'untrusted';
  return keyMatches ? 'authentic' : 'forged';
}

// True iff validation failed because the signed content's hash no longer matches
// (the bytes were altered). Grounded in the c2pa-node status codes (e.g.
// assertion.hashedURI.mismatch, assertion.dataHash.mismatch), so a
// broken-signature-but-intact file is labelled `invalid` rather than `tampered`.
export function isContentTampered(validationStatus) {
  return (
    Array.isArray(validationStatus) &&
    validationStatus.some((s) => s && typeof s.code === 'string' && /mismatch/i.test(s.code) && /hash/i.test(s.code))
  );
}
