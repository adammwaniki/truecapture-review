// Pure verdict decision for /verify. Inputs are gathered by the route:
//  - hasManifest:   a C2PA manifest was found
//  - validationState: c2pa-node's validation_state ('Valid' = crypto sig + content hash OK)
//  - hasRef:        the asset claims a DeDi identity (org.truecapture.dedi assertion)
//  - record:        the DeDi record looked up for that identity ({ state, ... } | null)
//  - keyMatches:    the asset's signer key equals the DeDi-published key
export function verdictFor({ hasManifest, validationState, hasRef, record, keyMatches }) {
  if (!hasManifest) return 'unsigned';
  if (validationState !== 'Valid') return 'tampered';
  if (!hasRef) return 'untrusted';
  if (!record || record.state !== 'live') return 'untrusted';
  return keyMatches ? 'authentic' : 'forged';
}
