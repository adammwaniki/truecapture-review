# Spike decision note — C2PA signing + DeDi key/CORS (task #21)

**Date:** June 2026 · **Verdict: GO.** `@contentauth/c2pa-node` v0.5.5 signs and verifies real C2PA end-to-end. Findings below are hands-on (run locally, Node v24, Linux x64), not just docs.

## 1. Library / environment
- Installed `@contentauth/c2pa-node` **v0.5.5** (MIT, Node ≥18.20.2); native binary loads on Linux x64. Exports incl. `Builder`, `LocalSigner`, `CallbackSigner`, `Reader`, `createTrustSettings`, `createVerifySettings`, `mergeSettings`, `settingsToJson`. (The unscoped `c2pa-node` is deprecated — [usage.md](https://github.com/contentauth/c2pa-node/blob/main/docs/usage.md).)
- API contract (from bundled `dist/types/*.d.ts`, confirmed at runtime):
  - `LocalSigner.newSigner(certificate: Buffer, privateKey: Buffer, algorithm: SigningAlg, tsaUrl?): LocalSigner`
  - `Builder.withJson(manifest, settings?)` → `.sign(signer, input: SourceAsset, output: DestinationAsset): Buffer` / `.signFile(signer, filePath, output: DestinationAsset)`
  - `Reader.fromAsset(asset: SourceAsset, settings?): Promise<Reader|null>` → `reader.json()` (ManifestStore)
  - `SourceAsset = {buffer, mimeType} | {path, mimeType?}`; `DestinationAsset = {buffer: null} | {path}`
  - `signAsync` is for `CallbackSigner` only (a `LocalSigner` there throws a neon downcast error).

## 2. Signing — proven happy path
A real signed asset was produced and re-read as **`validation_state = Valid`, `alg = Es256`** (293-byte JPEG → 42,754-byte signed file with embedded JUMBF/COSE manifest, assertion `c2pa.actions.v2`, issuer = our org).

**Working recipe (reusable by C4/C5):**
1. **Leaf key must be PKCS#8** (`-----BEGIN PRIVATE KEY-----`). `openssl ecparam -genkey` emits SEC1 (`EC PRIVATE KEY`) and the signer **rejects it** (`PKCS#8 ASN.1 error … expecting "PRIVATE KEY"`). Use `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256` (or convert with `openssl pkcs8 -topk8 -nocrypt`).
2. **The leaf cert must chain to a trusted anchor.** A bare self-signed leaf is **rejected at sign time** (`Error: the certificate was self-signed`), and `verifyAfterSign:false` does **not** bypass it. Build a CA → leaf chain; leaf needs `keyUsage=critical,digitalSignature` + an accepted EKU (`extendedKeyUsage=emailProtection` worked).
3. Signer = `LocalSigner.newSigner(fullChainPem, leafKeyPem, 'es256')` (chain = leaf + CA concatenated).
4. Settings = `mergeSettings(createVerifySettings({verifyAfterSign:true}), createTrustSettings({trustAnchors: caCertPem}))`, passed to `Builder.withJson(manifest, settings)`.
5. `builder.signFile(signer, src, {path: dest})`, then `Reader.fromAsset({path: dest}, settings)`.

**Quirk:** in-memory **buffer** read — `Reader.fromAsset({buffer, mimeType:'image/jpeg'}, settings)` — threw `C2pa(UnsupportedType)` in v0.5.5; the **file/path** form worked cleanly. Consistent with the v2 "early version" warning. → C4 should prefer file/temp-path I/O (also aligns with H3 streaming) and pin the version; keep the `c2patool` fallback for parity.

## 3. DeDi key registry + CORS — live evidence
- **The key is already published and served.** Registration POSTs `details.publicKey` (`backend/server.js:124-137`); the query returns `data.records[].details` (`:96-99`, `:377-389`); `dediLookup` merely discards it (`:382-389`). → **C1 needs only to read `details.publicKey` and compare** — no new DeDi capability. Refs: [dedi.global](https://dedi.global/), [DeDi docs](https://dedi-global.gitbook.io/docs), [API spec](https://github.com/finternet-io/dedi).
- **CORS breakage reproduced.** `GET https://api.dedi.global/dedi/query/<ns>/<reg>`:
  - no `Origin` header → **HTTP 404** `{"message":"Namespace not found"}` (reachable, normal error)
  - with `Origin: https://www.truecapture.global` → **HTTP 500**
  Confirms the comment at `backend/server.js:535-537`. → **H2** (browser-direct DeDi) needs a fix: keep a server proxy, stand up a CORS-correct mirror/cache, or get DeDi to fix CORS. Server-side calls (C1 `/verify`) are unaffected.

## 4. Decisions / implications for tasks
- **#22 C4:** standardize on `@contentauth/c2pa-node` v0.5.5 behind an internal `c2pa` seam; file/temp-path I/O; `c2patool` fallback behind the same interface; pin the version.
- **#23 C5:** generate **EC P-256 in PKCS#8**; emit a **CA→leaf chain** (leaf: digitalSignature + emailProtection EKU). `signature_info.alg` reads back as `Es256`.
- **#34 M5c / #25 C1:** TrueCapture must operate a signing CA (or use a real CA); the org **CA cert is the c2pa trust anchor** (`createTrustSettings({trustAnchors})`). This is how "trust the DeDi-published key" maps onto c2pa-rs: the verifier trusts the org's published anchor, then compares the signer/DeDi key.
- **Verdict source:** drive the verdict from `reader.json().validation_state` (`"Valid"`) **plus** our DeDi key comparison (C1) — never the in-file key.

## 5. Residuals (need credentials / later phases)
- Live DeDi **key compare** + response-signature check need a real DeDi namespace + API key (do during C1).
- `c2patool` **fallback** not yet exercised hands-on (validate during C4).
- **Video/BMFF** signing not exercised (validate during C4; file-path mode expected).

## Addendum — C1 trust-binding blocker (found while implementing C1)

Implementing C1 (forgery-proof verify) surfaced a hard limitation in `@contentauth/c2pa-node` v0.5.5, all reproduced hands-on:
- `validation_state = Valid` reflects only **cryptographic signature validity + content-hash match**, NOT signer trust. An asset signed by an **attacker's own key/CA still reads `Valid`** (verified: attacker-signed JPEG → `Valid`).
- The SDK trust check (`verify.verifyTrust` + `trust.verifyTrustList` + `trustAnchors`, confirmed applied via `settingsToJson`) does **not** honor a custom CA anchor in this version: even the **legitimate** org cert reports `signingCredential.untrusted` against its own CA. So we cannot bind to the DeDi key via the SDK trust list. The trust outcome surfaces in `validation_results.activeManifest.failure[].code = signingCredential.untrusted`, but it's `untrusted` for legit and attacker alike.
- The Reader exposes only `signature_info` = `{alg, issuer, common_name, cert_serial_number}` — **not** the signer's public key/cert. Serial+issuer+CN are forgeable, so they cannot form a secure binding.

**Implication:** Phase 1 signing is sound, but **verification is not yet forgery-proof** with this binding — **C1 must not be marked done** until a real binding to the DeDi-published key lands, via one of:
- **(B, recommended)** extract the COSE `x5chain` signing cert from the signed bytes and compare its public key to the DeDi-published cert (library-independent; bounded JUMBF/CBOR/COSE extraction);
- **(A)** switch the engine to the `c2patool` subprocess (reference impl; may honor trust config / expose the chain) and re-test;
- **(C)** get c2pa-rs trust config to make `signingCredential.trusted` work for our anchor (uncertain on v0.5.5).

## Sources
[c2pa-node-v2](https://github.com/contentauth/c2pa-node-v2) · [c2pa-node usage.md (deprecation)](https://github.com/contentauth/c2pa-node/blob/main/docs/usage.md) · [c2pa-rs / c2patool](https://github.com/contentauth/c2pa-rs) · [dedi.global](https://dedi.global/) · [DeDi docs](https://dedi-global.gitbook.io/docs) · [DeDi API spec](https://github.com/finternet-io/dedi) · plus the bundled `@contentauth/c2pa-node/dist/types/*.d.ts`.
