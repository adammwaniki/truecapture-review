# TrueCapture — Remediation Plan

Companion to [`truecap-architectural-review.md`](./truecap-architectural-review.md). This plan resolves **all 14 findings** (C1–C5, H1–H4, M1–M5).

## Chosen strategy (decisions made)

| Axis | Decision | Implication |
|---|---|---|
| Crypto core (C1/C4/C5) | **Adopt real C2PA now** | Replace the hand-rolled JSON box with genuine C2PA (JUMBF + CBOR + COSE_Sign1) via **`@contentauth/c2pa-node`** (the v2 binding; the pinned `c2pa-node` is deprecated) with a **`c2patool` subprocess fallback** — see [C2PA library decision](#c2pa-library-decision-investigated-june-2026); switch to ECDSA-P256 + X.509; become interoperable with Adobe/Truepic/`c2patool`. |
| Signing model (C3/H2) | **Server-side now, on-device on the SDK track** | Keep the backend signing the web/extension flows but harden it (auth, rate limit, real per-org identity); pursue Secure Enclave/Keystore signing only inside the native SDK. |
| Claims posture (C5/H1/H2/M4) | **Build to match the claims** | Where a finding can be closed by either building the capability or softening the marketing, we **build**: durable infra, independent verification, real crypto. Docs change only to describe the now-true behavior. |
| Tests & coverage (M5a, all findings) | **100% coverage at explicit thresholds** | The whole codebase is gated at **100% lines/branches/functions/statements**: backend units (Vitest + `@vitest/coverage-v8`) and frontend units (Vitest), plus Playwright **e2e flow coverage**; CI fails below threshold. Reaching it requires refactoring `backend/server.js` into injectable modules so every error path is reachable from a fake. See [Test architecture](#test-architecture--100-coverage). |

**Guiding principles**

1. **Tests and CI come first — at 100% coverage.** The whole codebase is held to explicit thresholds: backend + frontend units at **100% lines/branches/functions/statements** (Vitest + `@vitest/coverage-v8`), plus Playwright **e2e flow coverage**, all gated in CI. No change lands without a test that fails on the old behaviour. See [Test architecture](#test-architecture--100-coverage).
2. **DeDi is the trust anchor, not decoration.** A verdict of `authentic` must require that the C2PA signer's key matches the key published in DeDi for the claimed identity, and that the DeDi record is live.
3. **Backwards-compatibility is a first-class concern.** Files already signed in the legacy custom format and verify links already shared must not silently break (see [Migration](#migration--backwards-compatibility)).
4. **Effort is planning-grade**, assuming one mid/senior full-stack engineer comfortable with Node + applied crypto. **T-shirt sizes** — coarse relative-effort buckets (S/M/L/XL) used instead of false-precision hour estimates, a common agile shorthand: S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 1–2 weeks, XL ≈ 3+ weeks. The 100% coverage bar adds overhead to every task — factor in roughly +30–50% on the sizes below.
5. **Seams are how we reach 100%.** Total branch coverage requires injectable faults, so `backend/server.js` is refactored into small modules with an interface at every external boundary (the C2PA engine, DeDi client, manifest store, key source, clock, auth) — fakes then drive both success *and* failure paths. The refactor and the coverage goal are the same work.

---

## Test architecture — 100% coverage

The whole codebase is held to **100% unit + integration + e2e coverage at explicit, CI-enforced thresholds** — backend and browser frontend equally.

> **Honest note on "100%."** The last few percent (defensive branches, glue) is most of the effort. It is only tractable because the backend is refactored so faults are injectable — if a dependency can fail, a fake makes it fail. We gate on **branch** coverage (not just line) and allow exactly one explicit exclusion: the process bootstrap (`server.listen`/startup wiring), marked in config. While the refactor is in progress the gate is **scoped to covered modules and ratcheted up** so it is never green-by-omission.

### Backend testability refactor (prerequisite)
`backend/server.js` (one 561-line file) is split into small modules with an interface at every external boundary so error paths are reachable from fakes:
- `c2pa` — signing/reading engine (`@contentauth/c2pa-node` + `c2patool` fallback)
- `dedi` — publish + lookup (returns `details.publicKey`)
- `store` — manifest/verify persistence · `keys` — EC P-256 + X.509 · `identity` · `auth` · `clock`

Handlers receive these via injection; the bootstrap is the only place real implementations are wired. The backend findings (C4/C1/C3/H1/H4) are built **inside** these modules, test-first.

### Taxonomy & enforcement
| Layer | Tooling | "100%" means |
|---|---|---|
| **Unit** | Vitest + `@vitest/coverage-v8`; fakes for every seam | 100% lines/branches/functions/statements per module |
| **Integration** | Vitest + a real HTTP server (`supertest`/`fetch`), a stub DeDi server, the real `c2patool` binary, an ephemeral store | every route × {success, auth-fail, bad-input, dependency-fail} executed |
| **E2E** | Playwright vs the running backend + static site | **flow coverage**: every journey + verdict {authentic, tampered, unsigned, forged-key, revoked-key} has a test |

- Thresholds set to `100` (lines/branches/functions/statements) in the Vitest config; CI fails below.
- Playwright flows tracked in a journey registry so a new flow without a test fails CI.
- e2e "100%" = **flow coverage** (line coverage there is meaningless; lines are owned by unit + integration).

### Frontend
Extract the ~600-line inline `<script>` blocks (`webapp/index.html:626`, `verify/sign/index.html:626`) and the logic in `verify/verify/verify.js`, `extension/capture.js`, `extension/popup.js` into small ES modules with injected `fetch`/DOM seams (prerequisite for unit-testing them, and for M1/M3). Vitest covers pure functions at 100%; Playwright covers DOM-bound flows.

---

## Finding → phase map

| Finding | Title (short) | Phase | Severity | Size |
|---|---|---|---|---|
| M1 | Dead / duplicated code | 0 | Med | S |
| M5 | No tests/CI, dead deps, decorative cert | 0 (+1) | Med | M |
| C4 | Not real C2PA | 1 | Crit | L |
| C5 | RSA mislabelled as ECDSA | 1 | Crit | S–M |
| M2 | Fragile parsers / non-canonical signing | 1 | Med | (subsumed) |
| C1 | Signature verified against in-file key | 2 | Crit | M |
| C2 | Verify-link path does no verification | 2 | Crit | M |
| H2 | Verification hard-depends on our infra | 3 | High | M–L |
| C3 | `/sign` unauthenticated + open CORS | 4 | Crit | M |
| H3 | 500 MB in-memory buffering / DoS | 4 | High | M |
| H1 | In-memory manifest store | 4 | High | M |
| H4 | `ORG_NAME`/`ORG_URL` never read | 4 | High | S |
| M3 | `entity.url` injected into `href` | 5 | Med | S |
| M4 | Privacy copy vs retained UA | 5 | Med | S |
| T | Test architecture + 100% coverage gate | 0 (all) | — | L |

---

## Phase 0 — Foundations & guardrails

*Goal: be able to change the crypto core safely. No behavior change yet. Everything here is independent and can start immediately.*

### M1 — Remove dead and duplicated code
- **Root cause:** `verify/verify.js` (609 lines, unreferenced — only `verify/verify/verify.js` is loaded via `verify/verify/index.html:177`); `webapp/app.js` ≡ `verify/sign/app.js` byte-identical and **neither** `index.html` loads them (both use inline `<script>` at `webapp/index.html:626`, `verify/sign/index.html:626`); `webapp/` is an unrouted near-duplicate of `verify/sign/` (no route in `verify/serve.json`); dead recording handlers in `extension/popup.js:51-70`.
- **Fix:** Delete `verify/verify.js`, `webapp/app.js`, `verify/sign/app.js`, and the `webapp/` directory (confirm nothing deploys it first); remove dead handlers from `popup.js`; update the component table in `README.md:108`.
- **Acceptance:** `grep -r` shows no references to deleted files; verify + sign pages still function (manual + smoke test); repo file count drops accordingly.
- **Depends on:** nothing. **Size:** S.

### M5a/T — Test architecture + 100% coverage gate
- **Root cause:** no tests, no CI anywhere (`git ls-files`).
- **Fix:** Establish the full [Test architecture](#test-architecture--100-coverage): Vitest + `@vitest/coverage-v8` with **thresholds = 100** (lines/branches/functions/statements), Playwright e2e with a journey registry, and `.github/workflows/ci.yml` running lint + unit + integration + e2e on Node 20 + 22 with the coverage gate. Begin the backend testability refactor (split `server.js` into injectable modules) so subsequent findings are implemented test-first inside those modules. Seed tests for behaviour that survives Phase 1 (verdict semantics, DeDi key compare, the M3 URL sanitizer).
- **Acceptance:** CI green on a PR; coverage gate enforced at 100% (scoped + ratcheted while the refactor lands); `npm test` runs unit + integration + e2e; the journey registry is wired.
- **Depends on:** nothing (start first; foundational). **Size:** L (raised from M by the 100% bar).

### M5b — Remove dead dependencies
- **Root cause:** `jose` (`backend/package.json:15`) never imported; `sharp` (`:14`) only used by the dev-time `backend/create-icons.js`.
- **Fix:** Remove `jose`. Move `sharp` to `devDependencies`. **Replace the deprecated `c2pa-node` (`backend/package.json:13`) with `@contentauth/c2pa-node` (v2)** — see [C2PA library decision](#c2pa-library-decision-investigated-june-2026); Phase 1 wires it behind an internal module with a `c2patool` fallback.
- **Acceptance:** `npm ci` + tests pass; `depcheck` reports no unused runtime deps.
- **Depends on:** nothing. **Size:** S.

### Spike S1 — De-risk the C2PA + DeDi assumptions *(do before committing Phase 1/2 estimates)*
- **Validate:** (a) **`@contentauth/c2pa-node` (v2)** signing end-to-end given its "early version" warning — `LocalSigner` ES256 + X.509 cert, JPEG/PNG/video, real JUMBF/COSE output — and confirm the **`c2patool` subprocess fallback** covers the same; pin both versions (see [C2PA library decision](#c2pa-library-decision-investigated-june-2026)). (b) DeDi serving the key: it **already** stores `details.publicKey` (`backend/server.js:124-137`) and the query returns `details` (`:96-99`,`:377-389`) — `dediLookup` just discards it (`:382-389`); confirm response signing + fix the documented CORS 500 (`backend/server.js:535-537`). (c) Browser-side C2PA verification option for Phase 3 (`c2pa-js`/WASM).
- **Output:** a one-page decision note pinning library versions and the DeDi key-publish/lookup contract. **Size:** M.

---

## Phase 1 — Real C2PA signing core

*Goal: emit and read genuine C2PA. Closes C4, C5; eliminates M2 by deleting the hand-rolled code. Blocks Phases 2–3.*

### C2PA library decision (investigated June 2026)

**Decision:** standardize on **`@contentauth/c2pa-node` v0.5.5** (the official v2 napi binding to `c2pa-rs`; MIT; Node ≥ 18.20.2; prebuilt binaries for Linux/macOS/Windows x64+arm), wrapped behind a thin internal `c2pa` module, with a **`c2patool` subprocess fallback** behind the same interface.

**Evidence:**
- The pinned `c2pa-node@^0.5.5` (unscoped, `backend/package.json:13`) is **deprecated**: *"This repository and the `c2pa-node` package are deprecated. Use c2pa-node-v2 instead."* — [c2pa-node usage.md](https://github.com/contentauth/c2pa-node/blob/main/docs/usage.md)
- The successor publishes as **`@contentauth/c2pa-node` v0.5.5** — `name`/`version`/`license: MIT`/`engines.node >=18.20.2` confirmed from [package.json](https://raw.githubusercontent.com/contentauth/c2pa-node-v2/main/package.json). Signing: `LocalSigner.newSigner(cert, key, 'es256', tsaUrl)`, `CallbackSigner`, `IdentityAssertionSigner`; accepts `{path}` or `{buffer}`. — [c2pa-node-v2](https://github.com/contentauth/c2pa-node-v2)
- **Why the fallback:** the v2 README warns *"This is an early version of this library, and there may be bugs and unimplemented features."* So we pin + abstract it and keep the mature **`c2patool`** CLI (official `c2pa-rs` wrapper) swappable behind the same interface. — [c2pa-node-v2](https://github.com/contentauth/c2pa-node-v2), [c2pa-rs](https://github.com/contentauth/c2pa-rs)
- Only **ES256 (ECDSA-P256)** is documented — exactly the C5 target. Use a **production CA cert** (test certs fail online validators) or the DeDi-anchored model (C1/M5c). — [CAI open-source docs](https://opensource.contentauthenticity.org/docs/introduction/)

**Confidence:** facts are from the contentauth repos + the v2 `package.json`; the npmjs page was bot-blocked (403), so re-confirm the published version on npm at integration time.

### C4 — Replace the custom format with real C2PA
- **Root cause:** custom embed/extract (`backend/server.js:243-270`, `:297-372`) wrapping plain JSON (`:172-221`); the declared `c2pa-node` (`backend/package.json:13`) is both **never imported and deprecated** (use `@contentauth/c2pa-node`).
- **Fix:** Replace `signFile`/`embedInJpeg`/`embedInPng`/`embedInBinary`/`serverExtractC2PA`/`serverStripC2PA` with a thin internal `c2pa` module backed by **`@contentauth/c2pa-node`** (`LocalSigner`, ES256), with a **`c2patool` subprocess fallback** behind the same interface (see [C2PA library decision](#c2pa-library-decision-investigated-june-2026)): build a real manifest (assertions `c2pa.actions`, `stds.schema-org.CreativeWork`, hard-binding hash), sign as COSE_Sign1, embed as JUMBF. Map our metadata (source/device/capturedAt) onto standard assertions. For video use the library's BMFF handling rather than a magic trailer.
- **Acceptance:** Files signed by the backend are read and validated by `c2patool` and Adobe Content Credentials Verify; our verifier reads files produced by `c2patool`. The strings at `README.md:76`, `SDK_SPEC.md:427`, `verify/index.html:86` become true and are tested against a real C2PA tool in CI.
- **Depends on:** Spike S1. **Size:** L.

### C5 — Switch to ECDSA-P256 + honest key labelling
- **Root cause:** `forge.pki.rsa.generateKeyPair(2048)` (`backend/server.js:49`); RSASSA-PKCS1-v1_5 signing (`:214-219`); DeDi record falsely says `keyType: 'Ecdsa'` (`:130`).
- **Fix:** Generate an EC P-256 key + X.509 cert (`crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })` or `openssl`, per `DEPLOY_YOUR_OWN.md:48-66`); sign with ES256 inside the C2PA COSE flow. Set the DeDi record's `keyType` to the **actual** algorithm. (Falls out of C4’s signer wiring.)
- **Acceptance:** Emitted COSE alg header is ES256; DeDi record key type matches the real key; tests assert algorithm. ECDSA claims in `README.md:5,114`, `verify/faq/index.html:154,234,240`, `SDK_SPEC.md:426`, `DEPLOY_YOUR_OWN.md:66` reconciled.
- **Depends on:** C4 (shared signer wiring). **Size:** S–M.

### M2 — Retire the hand-rolled parsers & non-canonical signing *(resolved by C4)*
- **Root cause:** unbounded APP11 length write (`backend/server.js:247-248`); signing over `JSON.stringify` with verify over `JSON.stringify(JSON.parse(...))` (`:213` vs `:486`); broken cert-as-SPKI import in dead `verify/verify.js:387-395`.
- **Fix:** No bespoke parsing or JSON canonicalization survives — C2PA’s CBOR + COSE hard binding replaces it. Add a regression test for a large manifest (the old ~64 KB APP11 failure mode).
- **Acceptance:** No hand-rolled JPEG/PNG/trailer parsing remains in `backend/`; large-manifest test passes.
- **Depends on:** C4. **Size:** subsumed.

---

## Phase 2 — Make DeDi the real trust anchor

*Goal: a verdict means something. Closes C1 and C2. Depends on Phase 1.*

### C1 — Verify against the DeDi-published key, not the in-file key
- **Root cause:** signature checked with `manifest.public_key_pem` from inside the file (`backend/server.js:493,203`); verdict ignores DeDi (`:513-525`); `dediLookup` doesn’t even return the key (`:382-389`).
- **Fix:** (1) During registration, publish the signing **certificate/public key** into the DeDi record (extends Spike S1’s contract). (2) In `/verify`, resolve the signer identity → fetch the DeDi-published key for that `dedi_record_id` → require that the C2PA signer cert chains to / equals the DeDi key **and** `state === 'live'`. (3) `authentic` requires `c2paValid && dediKeyMatch && dediLive && hashMatch`. Stop trusting any key carried in the asset.
- **Acceptance:** Adversarial test — re-sign a doctored file with an attacker key + copied `dedi_record_id` ⇒ verdict `tampered`/`untrusted`, **not** `authentic`. (This is the headline regression test.)
- **Depends on:** C4, C5, Spike S1. **Size:** M.

### C2 — The verify-link path must verify content
- **Root cause:** `autoVerifyFromHash` hardcodes `sigValid: true` on a `Map` lookup and never sees the file (`verify/verify/verify.js:92-101`); `/manifest/:hash` just returns the stored record (`backend/server.js:450-454`).
- **Fix:** Re-anchor the link to content. Options to choose at build time: (a) link resolves to the **stored signed asset** (now durable per H1) and the page verifies *that* asset end-to-end; or (b) link encodes the content hash and the page requires the user’s file and compares. Remove the hardcoded `sigValid: true`; the link verdict must run the same C1 verification pipeline. Until content is bound, the page must state precisely what is proven.
- **Acceptance:** A link whose stored/declared content doesn’t match the presented/served bytes yields a non-authentic verdict; no code path asserts authenticity without a signature + hash + DeDi check.
- **Depends on:** C1; coordinate with H1 (durable store). **Size:** M.

---

## Phase 3 — Independent / client-side verification

### H2 — Make verification genuinely independent of TrueCapture infra
- **Root cause:** verifier hardcodes `BACKEND_URL` and uploads the file to us (`verify/verify/verify.js:4,46`); DeDi proxied through our backend (`backend/server.js:535-537`); contradicts `README.md:5` and `verify/index.html:86`.
- **Fix:** With real C2PA in place, ship a **client-side** verifier (`c2pa-js`/WASM) that validates the manifest in-browser and queries DeDi directly (resolve the CORS 500 with DeDi, or via a neutral/cacheable endpoint — not a hard dependency on *our* server). Keep the server `/verify` as a convenience/fallback, not the only path. Now the "stateless, client-side, no dependency" claims are true because *any* C2PA verifier works.
- **Acceptance:** A signed file verifies in the browser with our backend offline, and independently via third-party `c2patool`. Claims re-tested in CI.
- **Depends on:** Phase 1, Phase 2, Spike S1(c). **Size:** M–L.

---

## Phase 4 — Harden the signing service

*Goal: the service is safe to run publicly. Closes C3, H3, H1, H4. Largely independent of Phases 1–3 — can run in parallel after Phase 0.*

### C3 — Authenticate `/sign` and tighten CORS
- **Root cause:** `cors { origin: true }` (`backend/server.js:18`); `/sign` has no auth (`:401-448`); identity hardcoded "TrueCapture" (`:133,198`).
- **Fix:** Require an API key / OAuth client credential on `/sign`; bind each credential to an org identity (ties into H4). Restrict CORS to known origins for state-changing routes (keep read verification open if desired). Document the auth model.
- **Acceptance:** Unauthenticated `/sign` ⇒ 401; signed content carries the authenticated org’s identity; CORS rejects unknown origins on `/sign`. Tests cover both.
- **Depends on:** H4 (identity). **Size:** M.

### H3 — Bounded, streaming uploads + rate limiting
- **Root cause:** 500 MB multipart limit (`backend/server.js:23`) with full in-memory `Buffer.concat` (`:411-413,465-467`); no rate limit.
- **Fix:** Stream uploads to temp storage (or hash incrementally); set realistic per-type size caps; add `@fastify/rate-limit` (per IP + per API key); add a concurrency guard.
- **Acceptance:** Load test — concurrent large uploads no longer exhaust memory; rate limit returns 429; peak RSS bounded.
- **Depends on:** C3 (per-key limits). **Size:** M.

### H1 — Durable manifest store
- **Root cause:** `new Map()` (`backend/server.js:294,430`); lost on restart, unbounded growth; links 404 after redeploy (`verify/verify/verify.js:73-78`).
- **Fix:** Persist manifests/verify records in a real store (Postgres/Redis/KV — Railway add-on). Add retention/eviction policy and an index by verify hash. Consider lengthening the 64-bit truncated hash (`:233-237`) to reduce collision risk.
- **Acceptance:** Verify link survives a redeploy/restart; store has a defined retention policy; load test shows no unbounded growth.
- **Depends on:** coordinate with C2 (link→content). **Size:** M.

### H4 — Wire real per-org identity
- **Root cause:** `.env.example:19-23` and `DEPLOY_YOUR_OWN.md:100-104` tell operators to set `ORG_NAME`/`ORG_URL`, but `server.js` never reads them; identity hardcoded (`backend/server.js:57-58,126,133,198`).
- **Fix:** Read `ORG_NAME`/`ORG_URL` (and per-credential identity from C3) and thread them into the cert subject, C2PA manifest author, and DeDi record. Remove hardcoded "TrueCapture" strings or make them the default only.
- **Acceptance:** A fork that sets the env vars (and does **not** edit source) signs as its own org end-to-end; test asserts identity propagation. `DEPLOY_YOUR_OWN.md` Step 2/Step 5 reconciled (env-driven, not manual edits).
- **Depends on:** nothing hard; pairs with C3. **Size:** S.

---

## Phase 5 — Remaining hygiene & doc reconciliation

### M3 — Sanitize DeDi-controlled `entity.url`
- **Root cause:** `href="${escapeHtml(r.entity.url)}"` (`verify/verify/verify.js:216`, `verify/verify.js:557`); `escapeHtml` (`:264-267`) doesn’t stop a `javascript:` scheme.
- **Fix:** Allowlist URL schemes to `https:` (parse with `URL`, reject otherwise) before rendering; apply wherever DeDi fields render.
- **Acceptance:** A DeDi record with `entity.url = "javascript:..."` renders inert (no link or neutralized). Unit test on the sanitizer.
- **Depends on:** nothing. **Size:** S.

### M4 — Reconcile privacy: device user-agent
- **Root cause:** `device: navigator.userAgent` collected (`extension/capture.js:129`), embedded in the manifest (`backend/server.js:179`) and retained; `verify/faq/index.html:190` claims minimal retention.
- **Fix (build-to-match-claims posture):** Either stop collecting the raw UA (record a coarse device class instead) or disclose UA/filename/timestamp retention accurately in the privacy copy and add a retention window. Prefer minimizing collection so the existing claim becomes true.
- **Acceptance:** What’s embedded/retained matches the privacy page exactly; test asserts the manifest contains no raw UA (if minimized).
- **Depends on:** H1 (retention policy lives there). **Size:** S.

### Doc reconciliation sweep *(closes the claims half of C4/C5/H2)*
- **Fix:** After Phases 1–3 land, re-read and correct `README.md`, `verify/index.html`, `verify/faq/index.html`, `SDK_SPEC.md`, `DEPLOY_YOUR_OWN.md` so every C2PA/ECDSA/client-side/no-dependency statement reflects the now-true implementation. Add a CI doc-claims checklist test where feasible (e.g., assert the live algorithm string).
- **Acceptance:** No claim in the matrix of the review remains "False"; spot-checks automated where possible.
- **Depends on:** Phases 1–3. **Size:** S–M.

### M5c — Real certificate handling *(finishes M5)*
- **Root cause:** self-signed `serialNumber '01'`, never chain-validated (`backend/server.js:50-65,221`).
- **Fix:** Decide the trust model: either a proper CA-issued cert or DeDi-anchored self-signed (the C1 model) with explicit chain/identity validation in the verifier. Document it.
- **Acceptance:** Verifier explicitly validates the cert against the chosen anchor; no decorative cert path remains.
- **Depends on:** C1. **Size:** S–M.

---

## Phase 6 — On-device SDK track *(parallel, separate roadmap)*

*This is the "on-device on the SDK track" decision. It does not block the web/extension fixes above and can be staffed independently.*

- Implement `SDK_SPEC.md` for real: keys generated and held in **Secure Enclave (iOS)** / **Android Keystore**, non-exportable; on-device ES256 signing; offline queue; optional edit chain (Adobe-compatible); `verify()`. Publish each org’s on-device public key to DeDi (same trust contract as C1).
- **Acceptance:** Per `SDK_SPEC.md:419-433` — private key never leaves the device; files verify via the same Phase 2/3 pipeline; offline-signed files verify once synced.
- **Size:** XL (multi-platform). Sequence after Phase 1 sets the C2PA + DeDi contract so device and server emit identical, mutually-verifiable manifests.

---

## Sequencing & dependency graph

```
Phase 0  (M1, M5a, M5b, Spike S1)   ── start now, in parallel
   │
   ├──────────────► Phase 4  (C3 → H3, H1, H4)   ── parallelizable after P0
   │
   ▼
Phase 1  (C4 → C5, M2)              ── needs Spike S1
   │
   ▼
Phase 2  (C1 → C2)                  ── needs P1 + DeDi key contract
   │
   ▼
Phase 3  (H2)                       ── needs P1+P2
   │
   ▼
Phase 5  (M3, M4, doc sweep, M5c)   ── after the behavior is true

Phase 6  (SDK)                      ── independent; align to P1's contract
```

**Critical path to "no more critical findings":** Phase 0 → C4 → C5 → C1 → C2. **Critical path to "safe to run publicly":** Phase 0 → C3 → H3/H1/H4 (Phase 4). Run Phase 4 in parallel with Phase 1–2.

---

## Migration & backwards-compatibility

The cutover to real C2PA changes the on-disk format and the key algorithm. To avoid breaking already-shared content:

1. **Dual-read verifier:** during a transition window, the verifier reads **both** the legacy custom box (current `serverExtractC2PA`) and real C2PA, and labels legacy results clearly. Remove legacy read on a published end-date.
2. **Key rotation:** publish the new ECDSA key in DeDi alongside the old RSA key; keep the old key resolvable so previously signed files still verify until retired.
3. **Verify-link durability:** H1’s persistent store must be seeded/migrated so existing `…/verify/<hash>` links keep resolving across the cutover.
4. **Extension/PWA:** bump `extension/manifest.json` version; both clients already only POST to `/sign`, so they need no format awareness — but re-test against the auth change (C3).

---

## Cross-cutting acceptance gate (definition of done)

A finding is "resolved" only when:
- [ ] Code change merged **with an automated test** that fails on the old behavior and passes on the new.
- [ ] CI (Phase 0) runs that test on Node 20 + 22, and the **100% coverage gate** stays green (see [Test architecture](#test-architecture--100-coverage)).
- [ ] For C1/C2/C3: an **adversarial** test exists (forged key, mismatched content, unauthenticated caller).
- [ ] Any related claim in `README.md` / `verify/*` / `SDK_SPEC.md` / `DEPLOY_YOUR_OWN.md` is now accurate.

---

## Open questions / spikes to close first

1. **C2PA library — RESOLVED** (see [C2PA library decision](#c2pa-library-decision-investigated-june-2026)): standardize on `@contentauth/c2pa-node` v0.5.5 (deprecated `c2pa-node` replaced), wrapped behind an internal module with a `c2patool` subprocess fallback because v2 self-describes as an "early version." Remaining spike: validate v2 end-to-end + the fallback. (Spike S1a)
2. **DeDi key-publish & lookup — PARTLY RESOLVED:** the key is already published (`backend/server.js:124-137`) and returned by the query (`:96-99`,`:377-389`); `dediLookup` just discards it (`:382-389`), so C1 only needs to read `details.publicKey` and compare. Remaining: confirm response signing + fix the `Origin`→500 CORS (`backend/server.js:535-537`) for client-side verify. (Spike S1b)
3. **Browser C2PA verification** — `c2pa-js`/WASM viability for Phase 3’s independent verifier. (Spike S1c)
4. **C2 product shape** — link-resolves-to-stored-asset vs link-requires-user-file. Affects H1 storage design.
5. **Trust model for M5c** — CA-issued vs DeDi-anchored self-signed.

---

## Suggested milestones

| Milestone | Contents | Exit criterion |
|---|---|---|
| **M0 — Safe to iterate** | Phase 0 | CI green; dead code/deps gone; spikes closed |
| **M1 — Honest crypto** | Phase 1 | Files interoperate with `c2patool`; ES256 confirmed |
| **M2 — Trustworthy verdicts** | Phase 2 | Forged-file adversarial test yields non-authentic |
| **M3 — Hardened service** | Phase 4 | Auth + rate limit + durable store + real identity |
| **M4 — Independent verification** | Phase 3 | Verifies with our backend offline + via third-party tool |
| **M5 — Honest & clean** | Phase 5 | Review’s claims matrix has zero "False" rows |
| **M6 — SDK** | Phase 6 | On-device keys; device & server manifests cross-verify |
