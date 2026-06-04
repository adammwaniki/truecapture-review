import { X509Certificate } from 'node:crypto';

// Extracts the end-entity (leaf) signing certificate's public key from a signed
// C2PA asset and returns it as base64-encoded SPKI DER, or null if none found.
//
// Why this exists: c2pa-node v0.5.5's Reader does NOT expose the signer key, and
// its trust-list verification does not honor custom anchors (see
// docs/review/truecap-spike-c2pa-dedi.md). So C1 binds identity by extracting the signer
// cert here and comparing its key to the DeDi-published key (see keymatch.js).
//
// Method: scan for an ASN.1 SEQUENCE (`0x30`) with a DER *definite long-form*
// length (`0x81`–`0x84`; certificates are always > 127 bytes, so the short form
// can be skipped), parse each candidate as an X.509 certificate, and take the
// non-CA leaf. Assumption: TrueCapture manifests embed a single signer chain, so
// the first non-CA cert is the signer — we do not re-parse the COSE structure to
// bind the cert to the signature. This holds for our own signed files; a foreign
// manifest carrying multiple leaf certs is the documented limit of this heuristic.
export function extractSignerSpki(signed) {
  const certs = [];
  for (let i = 0; i + 1 < signed.length; i++) {
    if (signed[i] !== 0x30) continue;
    const lenByte = signed[i + 1];
    if (lenByte < 0x81 || lenByte > 0x84) continue; // only DER long-form lengths
    const numLenBytes = lenByte & 0x7f; // 1..4 length octets follow
    if (i + 2 + numLenBytes > signed.length) continue;
    let len = 0;
    for (let j = 0; j < numLenBytes; j++) len = len * 256 + signed[i + 2 + j];
    const end = i + 2 + numLenBytes + len;
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
