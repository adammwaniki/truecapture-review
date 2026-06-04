# TrueCapture Trust Model

This document defines how TrueCapture decides that a file is authentic, and why
the decision is anchored in the **DeDi.global** public key registry rather than
in a certificate authority chain or the C2PA trust list. It closes remediation
finding **M5c** ("Define + enforce the certificate trust model").

## Summary

A verdict of **`authentic`** requires *all* of:

1. The file carries a valid C2PA manifest whose cryptographic signature **and**
   content hash verify (`validation_state === 'Valid'`).
2. The manifest names a DeDi identity (the `org.truecapture.dedi` assertion).
3. That DeDi record is **live** (not revoked, not absent).
4. The **public key of the file's signing certificate equals the public key the
   organisation published in that DeDi record.**

If (1) fails → `tampered`/`unsigned`. If (2) or (3) fail → `untrusted`. If (4)
fails → `forged`. The decision is computed in
`backend/src/verify/verdict.js:7` (`verdictFor`) and driven by
`backend/src/verify/pipeline.js:10` (`verifyAsset`); it is never hardcoded.

## The decision: DeDi-anchored, not CA-chain

TrueCapture uses a **DeDi-anchored, self-signed** trust model. The signing
certificate is generated locally as an EC P-256 **CA → leaf** chain
(`backend/src/keys/chain.js:13`, `ensureChain`); the CA is self-created, not a
public/commercial CA. Trust does **not** come from who issued the certificate —
it comes from the signer's key matching the key the organisation has published,
under its own identity, in the DeDi public registry.

The certificate therefore functions as a **key carrier** that satisfies the
C2PA/COSE signing format (PKCS#8 leaf, `keyUsage=digitalSignature`,
`extendedKeyUsage=emailProtection`, chained to a CA so c2pa accepts it — see the
spike note `docs/review/truecap-spike-c2pa-dedi.md`). The leaf's public key is the thing
that must match DeDi.

## Why not the C2PA trust list or a public CA

Two findings from the integration spike (`docs/review/truecap-spike-c2pa-dedi.md`) make a
CA/trust-list model unsafe to rely on here:

- **The C2PA reader's trust-list verification does not honour custom anchors.**
  An attacker who signs with their own cert can still produce a manifest the
  reader reports as `Valid`. So "the reader said Valid" is **not** proof of
  identity — only of content integrity.
- **The reader does not expose the signer's public key** — only
  `issuer` / `cert_serial_number` / `alg` / `time` in `signature_info`, all of
  which an attacker can forge into their own certificate's subject/issuer fields.

Because of this, the forgery-proof binding cannot use the reader's identity
fields. Instead the verifier **extracts the leaf signing certificate directly
from the signed bytes** (`backend/src/c2pa/extract-cert.js:14`,
`extractSignerSpki` — it scans for `30 82`-prefixed DER, parses each candidate as
an X.509 cert, and takes the non-CA leaf) and compares its SPKI to the
DeDi-published key (`backend/src/verify/keymatch.js`, `publicKeysEqual` at
`:22`, `toSpkiB64` at `:4`). An attacker's certificate yields a different SPKI
and fails the comparison, regardless of what issuer/serial they forged.

A public CA-issued cert remains a valid *future* option (e.g. for ecosystems
that consume the C2PA trust list), but it is **orthogonal** to the identity
guarantee: even with a CA cert, the verdict here is still gated on the DeDi key
match. DeDi is the trust anchor.

## How a verdict is reached

`verifyAsset` (`backend/src/verify/pipeline.js:10`) gathers the inputs and calls
`verdictFor` (`backend/src/verify/verdict.js:7`). The decision table:

| Condition                                                        | Verdict      |
| ---------------------------------------------------------------- | ------------ |
| No C2PA manifest                                                 | `unsigned`   |
| Manifest present, `validation_state !== 'Valid'`                 | `tampered`   |
| Valid, but no `org.truecapture.dedi` reference                   | `untrusted`  |
| Valid + ref, but DeDi record missing or `state !== 'live'`       | `untrusted`  |
| Valid + ref + live record, signer key **≠** DeDi key             | `forged`     |
| Valid + ref + live record, signer key **=** DeDi key             | `authentic`  |

The same pipeline serves both `POST /verify` (uploaded bytes) and
`GET /verify/:hash` (the stored signed asset behind a share link), so a share
link cannot return a more favourable verdict than re-verifying the bytes would
(`backend/src/app.js`).

## Revocation

Trust is **live-checked at verification time**, not assumed from issuance. The
DeDi record must report `state === 'live'`
(`backend/src/verify/verdict.js`); a `revoked` or absent record downgrades the
verdict to `untrusted` even if the key would otherwise match. Revocation is
therefore an operation on the DeDi record, not a CRL/OCSP step.

## Fail-closed properties

The key binding fails **closed** — anything ambiguous resolves to *not
authentic*:

- No leaf certificate found in the bytes → `extractSignerSpki` returns `null` →
  `publicKeysEqual(null, …)` is `false` → `forged`
  (`backend/src/verify/keymatch.js:22`).
- DeDi key/cert unparseable → `toSpkiB64` returns `null` →
  `publicKeysEqual(…, null)` is `false` → `forged`.
- DeDi lookup error / no record / not live → `untrusted`.

These paths are covered by `backend/src/verify/verify.test.js` and
`backend/src/c2pa/extract-cert.test.js` (malformed/short DER, no-cert, key
mismatch, null inputs).

## Threat model — scope

**Protected against:**
- Content tampering after signing (content-hash break → `tampered`).
- Identity forgery: signing with any key other than the org's DeDi-published key
  → `forged`, even if issuer/serial strings are copied.
- Use of a revoked/withdrawn key → `untrusted`.

**Not protected against (by design / out of scope):**
- **Capture-time deception.** TrueCapture signs the bytes presented at capture.
  If the source itself is a deepfake/replayed feed at the moment of capture, the
  signature faithfully attests to a fake. Provenance ≠ truth of subject.
- **Compromise of the organisation's signing key or DeDi account.** Whoever
  controls the live DeDi-published key can produce `authentic` files; protecting
  that key (and, on the SDK track, moving it into Secure Enclave / Android
  Keystore) is the mitigation.
- **Stripping.** A platform that removes the C2PA manifest yields `unsigned`,
  not `forged` — verification then relies on the shared verify link.

## References

- Verdict logic — `backend/src/verify/verdict.js` (`verdictFor`)
- Pipeline — `backend/src/verify/pipeline.js` (`verifyAsset`)
- Signer-cert extraction — `backend/src/c2pa/extract-cert.js` (`extractSignerSpki`)
- Key comparison — `backend/src/verify/keymatch.js` (`publicKeysEqual`, `toSpkiB64`)
- DeDi reference assertion — `backend/src/verify/dedi-ref.js` (`extractDediRef`)
- DeDi lookup (live key/state) — `backend/src/dedi/http.js`
- Key/cert generation — `backend/src/keys/chain.js` (`ensureChain`)
- Integration findings that motivated this model — `docs/review/truecap-spike-c2pa-dedi.md`
