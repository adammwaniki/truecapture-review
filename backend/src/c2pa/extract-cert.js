import { X509Certificate } from 'node:crypto';

// Extracts the end-entity (leaf) signing certificate's public key from a signed
// C2PA asset and returns it as base64-encoded SPKI DER, or null if none found.
//
// Why this exists: c2pa-node v0.5.5's Reader does NOT expose the signer key, and
// its trust-list verification does not honor custom anchors (see
// truecap-spike-c2pa-dedi.md). So C1 binds identity by extracting the signer
// cert here and comparing its key to the DeDi-published key (see keymatch.js).
//
// EC P-256 certs are a few hundred bytes, so their DER is `30 82 <len16>` — we
// scan for that prefix and try to parse each candidate as an X.509 certificate;
// the leaf is the non-CA cert in the embedded x5chain.
export function extractSignerSpki(signed) {
  const certs = [];
  for (let i = 0; i + 4 < signed.length; i++) {
    if (signed[i] !== 0x30 || signed[i + 1] !== 0x82) continue;
    const end = i + 4 + ((signed[i + 2] << 8) | signed[i + 3]);
    if (end > signed.length) continue;
    try {
      certs.push(new X509Certificate(signed.subarray(i, end)));
    } catch {
      /* not a certificate */
    }
  }
  const leaf = certs.find((c) => c.ca === false);
  if (!leaf) return null;
  return leaf.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}
