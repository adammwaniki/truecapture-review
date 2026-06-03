import {
  Builder,
  LocalSigner,
  createTrustSettings,
  createVerifySettings,
  mergeSettings,
} from '@contentauth/c2pa-node';

// Real C2PA engine over @contentauth/c2pa-node (ES256 / COSE_Sign1 / JUMBF).
// The leaf signs; its CA is registered as the trust anchor (spike recipe).
// `read()` (verification) is added with C1 (it needs the DeDi key compare and
// the temp-file read workaround for the v0.5.5 buffer-read bug).
export function createContentAuthC2pa({ chainPem, leafKeyPem, caCertPem }) {
  const signer = LocalSigner.newSigner(chainPem, leafKeyPem, 'es256');
  const settings = mergeSettings(
    createVerifySettings({ verifyAfterSign: true }),
    createTrustSettings({ trustAnchors: caCertPem }),
  );
  return {
    async sign(asset, mimeType, manifestDefinition) {
      const builder = Builder.withJson(manifestDefinition, settings);
      return builder.sign(signer, { buffer: asset, mimeType }, { buffer: null });
    },
  };
}
