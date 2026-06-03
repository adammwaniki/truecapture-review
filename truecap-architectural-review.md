# TrueCapture — Technical Architecture Review

> Structured architectural review of the TrueCapture repository. Every finding cites
> `file:line` against the codebase as reviewed. Scope: all 47 tracked files
> (~4,000 lines of hand-written code, excluding `backend/package-lock.json`).

---

## 1. What the system is

TrueCapture is a C2PA-style media-provenance system with four components (`README.md:103-108`):

- **`backend/`** — a Fastify server (`backend/server.js`) that generates a keypair, registers a public key on DeDi.global, signs uploaded media, and verifies it.
- **`extension/`** — an MV3 Chrome extension that captures photo/video/screen and uploads to the backend for signing.
- **`verify/`** — a static site (landing, `/verify`, `/sign`, `/faq`, `/use-cases`, `/privacy`) served by `npx serve`.
- **`webapp/`** — a near-duplicate of `verify/sign/` (see M1).

**Core data flow** (grounded in code): capture → `POST /sign` (`backend/server.js:401`) → server hashes the file (`backend/server.js:210`), builds a JSON manifest (`backend/server.js:172`), signs `JSON.stringify(manifest)` (`backend/server.js:213-219`), embeds a custom JSON box (`backend/server.js:243-270`), stores the manifest in an in-memory `Map` (`backend/server.js:294,430`), returns the file + a short verify URL. Verification is either file-upload (`POST /verify`, `backend/server.js:457`) or link-based (`GET /manifest/:hash`, `backend/server.js:450`).

The headline promise is: *"If a single pixel changes after signing, the signature breaks… an instant, server-side verdict with no app, no account, and no dependency on TrueCapture infrastructure required"* (`README.md:5`).

**Overall assessment:** the engineering is clean and readable, but the security architecture does not deliver the guarantee it advertises. The trust anchor is decorative, the primary verification path performs no cryptography, and the shipped crypto/format do not match the marketing or the SDK spec. These are design-level issues, not polish items.

---

## 2. Critical findings

### C1 — The signature is verified against a key carried *inside the same file*; the DeDi trust anchor never affects the verdict → forgeable

This is the central flaw. At signing, the public key is embedded in the manifest:

```js
public_key_pem: publicKeyPem,   // backend/server.js:203
```

At verification, the signature is checked **with that embedded key**:

```js
sigValid = verify.verify(manifest.public_key_pem, signature, 'base64');  // backend/server.js:493
```

The verdict depends only on `sigValid && hashMatch` (`backend/server.js:513-525`). The DeDi record is fetched (`backend/server.js:508-510`) but **never used in the decision**, and `dediLookup` does not even return the registered public key to compare against — it returns only `record_id, record_name, state, created_at, entity, keyType` (`backend/server.js:382-389`).

**Consequence:** an attacker generates their own RSA keypair, writes a manifest with *their* `public_key_pem`, sets `file_hash` to *their* doctored image, signs with *their* private key, and copies TrueCapture's real `dedi_record_id` into the manifest. `/verify` returns **`authentic`**, and the UI even renders "TrueCapture" as the registered entity (the DeDi panel reads the record the attacker referenced — `verify/verify/verify.js:205-226`). The signature proves only *"this file was signed by whoever made this file,"* which is vacuous. A provenance system's signature must be verified against a key obtained from the trust anchor (DeDi), not from the payload.

### C2 — The verify-link path (the primary share/mobile flow) does no verification at all

When a reader opens `…/verify/<hash>`, the page calls:

```js
const res = await fetch(`${BACKEND_URL}/manifest/${hash}`);
...
showResult('authentic', { ... sigValid: true, ... });   // verify/verify/verify.js:92-101
```

`sigValid: true` is **hardcoded**; no signature is checked, no hash is recomputed, and **the reader never uploads the file they are actually looking at**. `/manifest/:hash` simply returns the stored entry (`backend/server.js:450-454`). The FAQ confirms this is the intended mobile flow: *"use the verify link… the verdict loads instantly with no upload needed"* (`verify/faq/index.html:216`).

**Consequence:** a manipulated image placed next to a genuine verify link shows "Authentic — its provenance is verified" (`verify/verify/verify.js:94`). The link attests only that *some* file with that 64-bit truncated hash (`backend/server.js:233-237`) was once signed here — not that the displayed media is that file.

### C3 — `/sign` is unauthenticated and CORS reflects any origin → public "Signed by TrueCapture" oracle

CORS is `origin: true` (`backend/server.js:18`) and `/sign` (`backend/server.js:401-448`) has no authentication. The signing identity is hardcoded to "TrueCapture" (`backend/server.js:133,198`). Anyone, from any origin, can sign arbitrary content that then verifies as "Signed by TrueCapture." Combined with C1, the organizational-identity claim ("sign as themselves," `SDK_SPEC.md:14`) has no enforcement on the live service.

### C4 — It is not actually C2PA; `c2pa-node` is declared but never used

The embedding writes a bespoke JSON blob — a JPEG APP11 segment labelled `C2PA\x00`, a PNG `caBX` chunk, or a `\x00C2PA_TRUECAPTURE\x00` binary trailer (`backend/server.js:243-270`) — wrapping `{version, manifest, signature, certificate}` (`backend/server.js:221`). Real C2PA is JUMBF-boxed CBOR claims signed with COSE_Sign1. `backend/package.json:13` declares `c2pa-node` `^0.5.5`, but it is **never imported** (verified: no `c2pa-node` import anywhere in `backend/`).

This makes these claims false: *"compatible with any C2PA-aware toolchain"* (`README.md:76`), *"readable by any C2PA-compatible tool"* (`SDK_SPEC.md:427`), *"implements the C2PA open standard"* (`verify/index.html:86`). No `c2patool`/Adobe Content Credentials/Truepic reader can parse this format.

### C5 — Marketed as ECDSA-P256; actually RSA-2048; the DeDi record is labelled "Ecdsa" falsely

The key is RSA, not ECDSA:

```js
const keys = forge.pki.rsa.generateKeyPair(2048);   // backend/server.js:49
```

`createSign('SHA256')` over an RSA key is RSASSA-PKCS1-v1_5 (`backend/server.js:214-219`; the verify comment even says so — `backend/server.js:488`). Yet the DeDi registration records `keyType: 'Ecdsa'` (`backend/server.js:130`) — a false attribute written to the public registry. The ECDSA claim recurs in `README.md:5,114`, `verify/index.html:86`, `verify/faq/index.html:154,234,240`, and `SDK_SPEC.md:426`, while `DEPLOY_YOUR_OWN.md:66` admits the opposite ("RSA-2048 keypair automatically"). The repo contradicts itself.

---

## 3. High-severity findings

### H1 — In-memory manifest store: verify links are non-durable and leak memory

```js
const manifestStore = new Map();   // backend/server.js:294
manifestStore.set(verifyHash, { manifest, signature, signedAt });   // backend/server.js:430
```

No persistence, no eviction. On any Railway redeploy/restart or horizontal scale-out, every previously issued verify link 404s and silently degrades to "drop your file" (`verify/verify/verify.js:73-78`). The Map also grows unbounded for the life of the process (a slow memory leak / DoS). This directly undermines the "paste the link in your caption" durability story (`README.md:70`).

### H2 — Verification hard-depends on TrueCapture infrastructure (contradicts "stateless / client-side / no dependency")

`BACKEND_URL` is hardcoded to `https://api.truecapture.global` (`verify/verify/verify.js:4`); `/verify` uploads the file there (`verify/verify/verify.js:46`); DeDi is proxied through the backend because direct browser calls fail (`backend/server.js:535-537`). The live verifier's own comment states *"No client-side crypto or manifest parsing"* (`verify/verify/verify.js:1-2`). This contradicts *"no dependency on TrueCapture infrastructure required"* (`README.md:5`) and *"Verification is stateless and fully client-side"* (`verify/index.html:86`). (The only client-side verifier, `verify/verify.js`, is dead code — see M1.)

### H3 — Whole-file in-memory buffering up to 500 MB on unauthenticated endpoints → memory-exhaustion DoS

The multipart limit is 500 MB (`backend/server.js:23`), and both `/sign` and `/verify` read the entire upload into RAM via `Buffer.concat(chunks)` (`backend/server.js:411-413`, `backend/server.js:465-467`). There is no `@fastify/rate-limit`. A handful of concurrent large uploads to a public, unauthenticated endpoint exhausts the instance.

### H4 — `ORG_NAME` / `ORG_URL` are documented but never read; forkers silently sign as "TrueCapture"

`.env.example:19-23` and `DEPLOY_YOUR_OWN.md:100-104` instruct operators to set `ORG_NAME`/`ORG_URL`, but `backend/server.js` never reads them (it reads only `DEDI_*`, `VERIFY_BASE_URL`, `PORT`, `HOST`). Identity is hardcoded (`backend/server.js:57-58,126,133,198`). A newsroom that follows the deploy guide's env step — but misses the separate "manually edit `server.js` strings" step (`DEPLOY_YOUR_OWN.md:40-42`) — will register a DeDi record and sign files as **"TrueCapture,"** defeating the whole "sign as your own org" premise.

---

## 4. Medium-severity findings

### M1 — Substantial dead and duplicated code

- `verify/verify.js` (609 lines, the client-side crypto verifier) is referenced by **nothing**; the live page loads the sibling `verify/verify/verify.js` (`verify/verify/index.html:177`). Entire file is dead.
- `webapp/app.js` and `verify/sign/app.js` are **byte-identical** (211 lines) and **neither `index.html` loads them** — both pages use a ~600-line inline `<script>` (`webapp/index.html:626`, `verify/sign/index.html:626`). Dead in both locations. `webapp/styles.css` == `verify/sign/styles.css`.
- The whole `webapp/` directory is an unrouted near-duplicate of `verify/sign/` (no `webapp` route in `verify/serve.json`), yet `README.md:108` lists it as a component.
- `extension/popup.js:51-70` wires up recording controls (`btn-stop-rec`, `mediaRecorder`) but capture actually happens in `capture.html`/`capture.js`; those popup handlers reference a `mediaRecorder` never instantiated in `popup.js` — dead path.

### M2 — Fragile hand-rolled parsers and non-canonical JSON signing

- JPEG APP11 length is a 16-bit field and `embedInJpeg` does `writeUInt16BE(dataLength + 2)` with no bounds guard (`backend/server.js:247-248`); a manifest pushing the box past ~64 KB throws `RangeError` and 500s. Real C2PA spans multiple boxes precisely to avoid this.
- The signature is computed over `JSON.stringify(manifest)` (`backend/server.js:213`) and verified over `JSON.stringify(JSON.parse(...))` (`backend/server.js:486`). This relies on V8 preserving key insertion order; any third-party tool that re-serializes the manifest reorders keys and breaks the signature. There is no canonicalization (JCS/CBOR) — which is also why the "any C2PA tool can read it" claim could never hold even if the format were standard.
- The dead `verify/verify.js:387-395` tries to `importKey('spki', certDer …)` on a full X.509 certificate (a cert is not an SPKI), so that branch can only ever fail through to the fallback — indicative of the parsing being untested.

### M3 — DeDi-controlled `entity.url` is injected into an `href` with insufficient sanitization

Both verifiers render `href="${escapeHtml(r.entity.url)}"` (`verify/verify/verify.js:216`, `verify/verify.js:557`). `escapeHtml` only neutralizes `&<>"` via a text node (`verify/verify/verify.js:264-267`); a scheme like `javascript:doSomething()` contains none of those and survives as a clickable link. Since the SDK model invites arbitrary organizations to self-register their `entity.url` on DeDi (`SDK_SPEC.md:66,396`), a malicious record can place a `javascript:` link on every verifier's result page. User-click + `target=_blank` lowers severity, but the URL scheme should be allowlisted to `https:`.

### M4 — Privacy claim vs. retained data

`device: navigator.userAgent` is collected at capture (`extension/capture.js:129`, and the `verify/sign/app.js` path), written into the manifest (`backend/server.js:179`), embedded in the file, and retained in `manifestStore`. `verify/faq/index.html:190` states *"We store only the file hash and verify link — not the file itself, not your name… not your IP."* In fact the retained manifest also holds the user-agent string, original filename, and timestamps — a fingerprinting surface the privacy copy doesn't acknowledge.

### M5 — Dead dependencies, no tests, decorative certificate

- `jose` (`backend/package.json:15`) is never imported; `sharp` (`backend/package.json:14`) is used only by the dev-time `backend/create-icons.js`, not the server, yet sits in runtime `dependencies`.
- There are **no tests and no CI** anywhere in the repo (verified against `git ls-files`) for a cryptographic signing service.
- A self-signed cert (`serialNumber '01'`, 10-year validity) is generated and embedded (`backend/server.js:50-65,221`) but never validated against any chain — purely decorative.

---

## 5. Claims-vs-implementation matrix

| Claim | Source | Reality | Verdict |
| --- | --- | --- | --- |
| "ECDSA key" / "ECDSA P-256" | `verify/index.html:86`, `verify/faq/index.html:154,240`, `README.md:5,114`, `SDK_SPEC.md:426` | RSA-2048 + RSASSA-PKCS1-v1_5 (`backend/server.js:49,214`) | **False** |
| "Verification is stateless and fully client-side" | `verify/index.html:86` | Server-side upload to `api.truecapture.global` (`verify/verify/verify.js:2,46`) | **False** |
| "no dependency on TrueCapture infrastructure" | `README.md:5` | Hard dependency on backend + in-memory store + DeDi proxy (`backend/server.js:294,537`) | **False** |
| "compatible with any C2PA-aware toolchain" | `README.md:76`, `SDK_SPEC.md:427` | Custom JSON box; `c2pa-node` unused (`backend/server.js:243-270`) | **False** |
| Signature proves the signer's identity | implied throughout | Verified against key inside the file; DeDi unused (`backend/server.js:493,513-525`) | **False** |
| DeDi record reflects the key | `backend/server.js:130` writes `keyType:'Ecdsa'` | Key is RSA | **False/misleading** |
| "If a single pixel changes, the signature breaks" | `verify/index.html:86` | True for the upload path's hash check — but anyone can re-sign, and the link path checks nothing | **Misleading** |
| Forkers sign as their own org via env vars | `.env.example`, `DEPLOY_YOUR_OWN.md:100` | `ORG_NAME`/`ORG_URL` never read (`backend/server.js`) | **False** |

Note also that `SDK_SPEC.md` describes a *fundamentally different and stronger* architecture than what ships — on-device Secure Enclave/Keystore keys, genuine ECDSA-P256, real C2PA, offline signing (`SDK_SPEC.md:34-66,419-433`). It is explicitly "implementation in progress" (`SDK_SPEC.md:2`), but a reader can easily conflate the spec's security model with the live RSA/server-side product. The two should be clearly demarcated.

---

## 6. Strengths (in fairness)

- **Secrets hygiene is correct**: `*.pem`, `.keys/`, `.env` are all git-ignored at root and in `backend/.gitignore` (`.gitignore:3-23`, `backend/.gitignore`), and no keys are committed.
- **Frontend is dependency-light with no build step** (`README.md:118`), which genuinely reduces supply-chain risk.
- **Honest threat-model caveat** in the SDK spec: *"It does not prove the file depicts what it claims to depict"* (`SDK_SPEC.md:433`).
- **DeDi restart-resilience handling** is thoughtfully written — adopting an existing record after local state loss (`backend/server.js:93-110`).
- The capture UX (MV3 service worker minimalism, tab-based camera permission workaround) is pragmatic and well-commented (`extension/background.js:1-6`, `extension/popup.js:38-44`).

---

## 7. Prioritized recommendations

1. **Fix the trust model (C1).** Fetch the public key *from the DeDi record* referenced by `dedi_record_id` and verify the signature against that — never against `manifest.public_key_pem`. Make `dediRecord.state === 'live'` and key-match a precondition of an `authentic` verdict (`backend/server.js:493,508-525`). Have `dediLookup` return the registered key (`backend/server.js:382-389`).
2. **Make the link path verify (C2), or relabel it.** Either require the file on the link path, or change the verdict copy to state precisely what a Map hit proves; remove the hardcoded `sigValid: true` (`verify/verify/verify.js:92-101`).
3. **Authenticate `/sign` and tighten CORS (C3)**; add `@fastify/rate-limit` and stream/cap uploads (H3).
4. **Reconcile crypto + format with the claims (C4, C5):** either adopt real C2PA via the already-declared `c2pa-node`, or correct every "C2PA-compliant / ECDSA / client-side / no-dependency" statement across `README.md`, `verify/index.html`, `verify/faq/index.html`, and `SDK_SPEC.md`. Stop writing `keyType:'Ecdsa'` for an RSA key (`backend/server.js:130`).
5. **Persist the manifest store (H1)** (DB/KV) with eviction, and wire `ORG_NAME`/`ORG_URL` into the manifest (H4) so the fork story works.
6. **Delete dead code (M1):** `verify/verify.js`, both `app.js` copies, the orphaned `webapp/`, and the dead popup recording handlers — then update `README.md:108`.
7. **Add tests + CI (M5)** around sign→verify round-trips and tamper detection; allowlist `https:` for `entity.url` (M3).

**Most important takeaway:** C1 and C2 together mean the system, as deployed, will report "Authentic" for forged and for mismatched content. Everything else is **secondary** to closing those two gaps.
