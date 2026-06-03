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

// Real C2PA engine over @contentauth/c2pa-node (ES256 / COSE_Sign1 / JUMBF).
// The leaf signs; `trustAnchors` is the anchor the signature must chain to —
// in C1 this is set to the org's DeDi-published cert, so a signature that does
// NOT chain to it verifies as non-Valid (forgery-proof).
//
// Two v0.5.5 quirks handled here (see truecap-spike-c2pa-dedi.md):
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
        const reader = await Reader.fromAsset({ path, mimeType }, settings);
        if (!reader) return null; // no C2PA manifest present
        const store = reader.json();
        const manifest = store.manifests[store.active_manifest];
        return {
          validationState: store.validation_state,
          signatureInfo: manifest.signature_info,
          manifestStore: store,
        };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
