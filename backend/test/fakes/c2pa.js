// Test double for the `c2pa` seam (production impl: @contentauth/c2pa-node with
// a c2patool fallback — see truecap-spike-c2pa-dedi.md). Contract:
//   sign(asset: Buffer, mimeType, manifest) -> Promise<Buffer>   (signed asset)
//   read(asset: Buffer, mimeType) -> Promise<{ validationState, signerKey, manifest } | null>
// Pass signImpl/readImpl to simulate every success and failure mode (C4/C1 tests).
export function fakeC2pa({ signImpl, readImpl } = {}) {
  return {
    async sign(asset, mimeType, manifest) {
      if (signImpl) return signImpl(asset, mimeType, manifest);
      return Buffer.concat([Buffer.from(asset), Buffer.from('::signed')]);
    },
    async read(asset, mimeType) {
      if (readImpl) return readImpl(asset, mimeType);
      return { validationState: 'Valid', signerKey: 'FAKE_PUBLIC_KEY', manifest: {} };
    },
  };
}
