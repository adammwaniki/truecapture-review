import {
  Builder,
  LocalSigner,
  Reader,
  createTrustSettings,
  createVerifySettings,
  mergeSettings,
} from '@contentauth/c2pa-node';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sniffMimeType } from './sniff-format.js';

// One read attempt for a given mimetype. Returns the Reader, or null if the
// mimetype is empty/unhelpful or c2pa can't parse a manifest with that hint.
async function tryRead(path, mimeType, settings) {
  if (!mimeType) return null;
  try {
    return await Reader.fromAsset({ path, mimeType }, settings);
  } catch {
    return null; // unparseable with this hint
  }
}

// Real C2PA engine over @contentauth/c2pa-node (ES256 / COSE_Sign1 / JUMBF).
// The leaf signs; `trustAnchors` is the org CA. NB: an untrusted signer does NOT
// make validation_state non-Valid (an intact, validly-signed file stays Valid and
// merely carries a signingCredential.untrusted status) — forgery protection is the
// DeDi signer-key compare in the verify pipeline (C1), not trust-anchor chaining.
//
// Two v0.5.5 quirks handled here (see docs/review/truecap-spike-c2pa-dedi.md):
//  - sign(): the embedded asset is the mutated `output.buffer`, NOT the return value.
//  - read(): in-memory buffer reads throw UnsupportedType, so reads go via a temp file.
export function createContentAuthC2pa({ chainPem, leafKeyPem, caCertPem }) {
  const signer = LocalSigner.newSigner(chainPem, leafKeyPem, 'es256');
  const settings = mergeSettings(
    createVerifySettings({ verifyAfterSign: true }),
    createTrustSettings({ trustAnchors: caCertPem }),
  );

  return {
    async sign(asset, mimeType, manifestDefinition) {
      const builder = Builder.withJson(manifestDefinition, settings);
      const output = { buffer: null };
      builder.sign(signer, { buffer: asset, mimeType }, output);
      return output.buffer; // the signed asset (the return value is not readable)
    },

    async read(asset, mimeType) {
      const dir = mkdtempSync(join(tmpdir(), 'tc-c2pa-read-'));
      try {
        const path = join(dir, 'asset');
        writeFileSync(path, asset);
        // Try the declared type first. If it yields no manifest, the declared type
        // may be wrong/missing (e.g. a browser sent application/octet-stream because
        // it couldn't determine file.type) — sniff the real format from the bytes and
        // retry, so a genuinely-signed file is never misreported as "Not signed".
        let reader = await tryRead(path, mimeType, settings);
        if (!reader) {
          const sniffed = sniffMimeType(asset);
          if (sniffed && sniffed !== mimeType) reader = await tryRead(path, sniffed, settings);
        }
        if (!reader) return null; // no C2PA manifest present (genuinely unsigned/corrupt)
        const store = reader.json();
        const manifest = store.manifests[store.active_manifest];
        return {
          validationState: store.validation_state,
          validationStatus: store.validation_status,
          signatureInfo: manifest.signature_info,
          manifestStore: store,
        };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
