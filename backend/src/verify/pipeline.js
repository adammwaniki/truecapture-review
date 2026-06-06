import { extractDediRef } from './dedi-ref.js';
import { publicKeysEqual } from './keymatch.js';
import { signatureStatus, signerStatus, combinedVerdict } from './verdict.js';
import { extractSignerSpki } from '../c2pa/extract-cert.js';

// Shared verify pipeline used by both POST /verify (uploaded bytes) and
// GET /verify/:hash (the stored signed asset behind a share link). It runs BOTH
// checks at once on the actual bytes and reports both axes — the C2PA signature
// status and the DeDi signer status (forgery-proof key binding, C1) — plus a
// single roll-up `verdict`. The signer is evaluated even when the signature is
// invalid, so the UI can state both dimensions. Never hardcoded.
export async function verifyAsset({ c2pa, dedi }, asset, mimeType) {
  const report = await c2pa.read(asset, mimeType);
  if (!report) return { signature: 'none', signer: 'none', verdict: 'unsigned', entity: null };

  const signature = signatureStatus(report);

  const ref = extractDediRef(report.manifestStore);
  const record = ref ? await dedi.lookup(ref) : null;
  const signer = signerStatus({
    hasRef: Boolean(ref),
    record,
    keyMatches: () => publicKeysEqual(extractSignerSpki(asset), record.publicKey),
  });

  return { signature, signer, verdict: combinedVerdict(signature, signer), entity: record?.entity ?? null };
}
