import { extractDediRef } from './dedi-ref.js';
import { publicKeysEqual } from './keymatch.js';
import { verdictFor, isContentTampered } from './verdict.js';
import { extractSignerSpki } from '../c2pa/extract-cert.js';

// Shared verify pipeline used by both POST /verify (uploaded bytes) and
// GET /verify/:hash (the stored signed asset behind a share link). The verdict
// is always derived from re-verifying the actual bytes + binding the signer key
// to the DeDi-published key (C1) — never hardcoded.
export async function verifyAsset({ c2pa, dedi }, asset, mimeType) {
  const report = await c2pa.read(asset, mimeType);
  if (!report) return { verdict: 'unsigned', entity: null };
  if (report.validationState !== 'Valid') {
    const verdict = verdictFor({ hasManifest: true, validationState: report.validationState, contentTampered: isContentTampered(report.validationStatus) });
    return { verdict, entity: null };
  }

  const ref = extractDediRef(report.manifestStore);
  const record = ref ? await dedi.lookup(ref) : null;
  let keyMatches = false;
  if (record && record.state === 'live') {
    keyMatches = publicKeysEqual(extractSignerSpki(asset), record.publicKey);
  }
  const verdict = verdictFor({
    hasManifest: true,
    validationState: report.validationState,
    hasRef: Boolean(ref),
    record,
    keyMatches,
  });
  return { verdict, entity: record?.entity ?? null };
}
