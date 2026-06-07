# TrueCapture — Architectural Review (Post-Remediation)

**Reviewer:** Technical architect review
**Date:** 2026-06-04
**Branch reviewed:** `remediation/phase-0`
**Scope:** Full codebase — `backend/`, `verify/`, `extension/`, tests/CI, and docs.
**Method:** Every claim is backed by a specific `path:line` reference; the load-bearing findings were verified directly against the source.

> This is a *fresh* review of the codebase after the remediation work. It supersedes nothing — the original pre-remediation review is preserved at [`truecap-architectural-review.md`](./truecap-architectural-review.md). Where the remediation closed an earlier finding, this review treats the result as the new baseline and looks for what is *now* weak.

---

## 1. Executive summary

The remediation transformed TrueCapture from a system whose security claims outran its implementation into one whose **core trust mechanism is sound, real, and tested**. Signing is genuine C2PA (COSE_Sign1 / ES256) over an EC P-256 CA→leaf chain (`backend/src/c2pa/contentauth.js:22,32`); the verdict is forgery-proof and DeDi-anchored, derived by re-verifying the actual bytes and comparing the signer's extracted public key to the key published on DeDi (`backend/src/verify/pipeline.js:10-29`, `backend/src/verify/verdict.js:7-13`); the design is a clean seam/dependency-injection architecture with a 100% coverage gate (`backend/vitest.config.js:14`).

The residual risk has shifted from **"the crypto is fake"** to **"the operational edges are soft"**: an in-memory rate limiter that doesn't scale or bound its memory, abuse controls that silently fail *open* when misconfigured, a retention routine that exists but is never called, and a documentation/config gap that prevents a self-hosted fork from ever producing an `authentic` verdict. None of these undermine the cryptographic core, but several would bite in a real deployment.

**Severity tally:** 3 High, 8 Medium, 6 Low (one Medium — M-5 — was introduced by the remediation's own H2 work).

---

## 2. Architecture overview

### 2.1 Backend — ports-and-adapters with a thin composition root
Every external dependency is a *seam* (a factory returning a small contract); `createApp(...)` receives them all as injected parameters with test defaults (`backend/src/app.js:21-34`). The single composition root that touches `process.env`, the network, and the disk is `backend/src/bootstrap.js:18-76`; `backend/server.js:1-9` is a 9-line entry point. This is the one file excluded from coverage (`backend/vitest.config.js:13`, justified at `backend/src/bootstrap.js:15-17`).

Fastify registers `cors`/`multipart`/`swagger`/`swagger-ui` up front (`backend/src/app.js:35-52`), a global `onRequest` hook applies the rate limit (`backend/src/app.js:55-57`), and routes are registered in a child plugin *after* swagger so the OpenAPI spec captures them (`backend/src/app.js:85-87`): `GET /openapi.json`, `/health`, `/config`, `POST /sign`, `POST /sign/session`, `POST /verify`, `GET /verify/:hash`.

### 2.2 The trust model (the heart of the system)
At publish time the leaf cert is registered on DeDi (`backend/src/bootstrap.js:34-38`). At verify time `verifyAsset` (`backend/src/verify/pipeline.js:10-29`) reads the manifest, extracts the signer's SPKI directly from the embedded x5chain (`backend/src/c2pa/extract-cert.js:14-29`) — deliberately *not* trusting the reader's issuer/serial, because c2pa-node v0.5.5's reader ignores custom trust anchors (`backend/src/c2pa/extract-cert.js:5-9`) — and compares it SPKI-to-SPKI against the DeDi-published key (`backend/src/verify/keymatch.js:22-25`). The pure decision ladder is `unsigned → tampered → untrusted → forged → authentic` (`backend/src/verify/verdict.js:8-12`). This is documented in [`TRUST_MODEL.md`](./TRUST_MODEL.md), whose `file:line` references I verified to be accurate.

### 2.3 Frontend — no-build static site, privacy-maximal verify
The verify page reads the file **in the browser** by default via a lazy-loaded c2pa-web WASM (`verify/verify/c2pa-read.js:8-17`), maps the result through tested pure modules (`verify/lib/render-model.js:33-44`), and uploads **only** when the user clicks "Confirm signer with DeDi" (`verify/verify/verify.js:123-133`). Pure logic lives in `verify/lib/*` under a 100% gate (`verify/vitest.config.js:14`); DOM glue is thin.

### 2.4 Extension — MV3 with an iframe-isolated CAPTCHA
The popup launches a full tab for camera permissions (`extension/popup.js:24-26`); `capture.js` signs via `POST /sign` sending only a coarse `X-Device-Class` (`extension/capture.js:50-55,178`). Because MV3 forbids remote scripts in extension pages, the Turnstile/hCaptcha widget runs in a hosted iframe that `postMessage`s the token back, with an origin check on the receiver (`extension/capture.js:27-33`).

---

## 3. Strengths

- **Forgery-proof binding is real and adversarially tested.** Distinct CA chains for org vs attacker; the attacker reuses the victim's `record_id` and still gets `forged` (`backend/src/verify-route.test.js:26-27,72-74`). This is the security-critical property and it is end-to-end, not mocked.
- **Fail-closed verdict ladder.** Unparseable manifest → `null` → `unsigned` (`backend/src/c2pa/contentauth.js:43-47`); DeDi lookup failure → `untrusted`; key mismatch → `forged`; a non-`live` DeDi record can never yield `authentic` (`backend/src/verify/verdict.js:11`).
- **Verify always re-checks bytes.** `GET /verify/:hash` re-runs the full pipeline on the stored asset rather than trusting a cached verdict (`backend/src/app.js:170-173`).
- **No PII by default.** Only a coarse device class is recorded, "never the raw UA" (`backend/src/app.js:68`), verified by a test that inspects the POST body for UA strings (`backend/e2e/sign-page.spec.js:54-58`).
- **Correct output escaping + M3 URL hardening.** The DeDi entity link is the only dynamic `innerHTML`; `entityName` round-trips through `escapeText` and `entityUrl` through `httpsUrlOrNull` (`verify/verify/verify.js:79-83`, `verify/lib/safe-url.js:5-14`).
- **Disciplined seams + deterministic tests.** Injected `fetchImpl`/`now()`/`jwks` mean no hidden `Date.now()`/`fetch`; real crypto is exercised (`backend/src/c2pa/c2pa.test.js:20-32`), durability is tested by reopening SQLite (`backend/src/store/sqlite.test.js:21-24`).
- **Honest documentation.** `TRUST_MODEL.md` references check out; the SDK is consistently flagged as a future implementation (`SDK_SPEC.md:4,8-13`, `README.md:41`, `verify/faq/index.html:150`).

---

## 4. Findings (severity-ranked)

### HIGH

**H-1 — A self-hosted fork can never produce an `authentic` verdict (`DEDI_RECORD_ID` is required by code but absent from all setup docs).**
The composition root reads `env.DEDI_RECORD_ID` (`backend/src/bootstrap.js:30`), requires it for DeDi registration (`backend/src/bootstrap.js:34`), and embeds it as `identity.dedi.record_id` in every manifest (`backend/src/bootstrap.js:41`). Verification requires it back: `extractDediRef` returns `null` unless `record_id` is present (`backend/src/verify/dedi-ref.js:9`), and a null ref forces `untrusted` (`backend/src/verify/verdict.js:10`). But `DEDI_RECORD_ID` appears **0 times** in `.env.example` and **0 times** in `DEPLOY_YOUR_OWN.md`. A deployer who follows the docs gets `record_id: undefined` → every signed file verifies as `untrusted`, and the deploy checklist's "verify link shows Authentic" (`DEPLOY_YOUR_OWN.md:220`) is unreachable. **Fix:** document `DEDI_RECORD_ID` in `.env.example` and the deploy steps; consider failing fast at boot if it's missing while other DeDi vars are set.

**H-2 — In-memory rate limiter: unbounded memory growth, no cross-instance state, no `trustProxy`.**
`createRateLimiter` stores counts in a process-local `Map` (`backend/src/ratelimit.js:5`) whose entries are only ever rewritten when the *same key* returns after its window (`backend/src/ratelimit.js:10-11`) — there is **no eviction sweep**, so a flood from many distinct IPs leaves one stale entry per IP forever (a memory-exhaustion vector). It is also per-process: N instances enforce N independent windows, so the effective limit is `max × instances`. Finally, Fastify is created with no `trustProxy` (`backend/src/app.js:35`; `trustProxy` appears nowhere), so behind a CDN/load balancer `req.ip` (`backend/src/app.js:56`) is the proxy's IP — the limiter throttles *all* users as one. **Fix:** a TTL/size-bounded structure or a shared store (Redis); set `trustProxy` and key on the real client IP.

**H-3 — Retention is defined and tested but never invoked; the DB stores full assets forever.**
`prune(maxAgeMs)` exists (`backend/src/store/sqlite.js:35`) and is unit-tested, but is **called nowhere** in `app.js`/`bootstrap.js`/`server.js` (verified by grep). Meanwhile every signed asset is persisted base64-encoded in the record (`backend/src/app.js:74`) — ~33% inflation, up to the 50 MB file cap (`backend/src/bootstrap.js:69`), in a single SQLite file, retained indefinitely. The H1 "durable store + retention" claim is half-delivered: durable yes, retention not wired. **Fix:** schedule `prune()` (interval or on-write sampling), and reconsider storing whole assets vs. just the manifest/hash.

### MEDIUM

**M-1 — CAPTCHA and the Origin allowlist silently fail *open* when unconfigured, with no startup warning.**
If `CAPTCHA_SECRET`/`CAPTCHA_VERIFY_URL` are unset, the verifier becomes `{ verify: async () => true }` (`backend/src/bootstrap.js:44-46`), so the keyless public `/sign` accepts everything (`backend/src/app.js:113`). The Origin gate only enforces when `ALLOWED_ORIGINS` is set (`backend/src/bootstrap.js:68`, `backend/src/app.js:110`). A forgotten env var in production turns the only human-check on a public signer into a no-op with no logged warning. **Fix:** log a prominent warning at boot when the public signer is unprotected; consider refusing to start in production mode without at least one control.

**M-2 — `validation_state !== 'Valid'` collapses distinct failures into `tampered`.**
Both `backend/src/verify/pipeline.js:13` and `backend/src/verify/verdict.js:9` treat *any* non-`Valid` state as `tampered` and return before the DeDi key compare. A validly-signed-but-untrusted asset (signature that doesn't chain to the configured anchor; `trustAnchors` set at `backend/src/c2pa/contentauth.js:23-26`) would be shown to the user as "Tampered," which is misleading, and the binary `=== 'Valid'` string gate is brittle against any library change to that enum. **Fix:** distinguish content-hash failure from trust/other invalidity and label accordingly.

**M-3 — Cert-extraction heuristic trusts the first non-CA cert and assumes one DER length form.**
`extractSignerSpki` scans the entire asset for the `0x30 0x82` DER prefix (`backend/src/c2pa/extract-cert.js:14-19`) — handling only the 2-byte long form (misses certs <256 or ≥65536 bytes) — and returns the *first* cert with `ca === false` (`backend/src/c2pa/extract-cert.js:26`). It does **not** tie the extracted cert to the COSE_Sign1 signature; soundness rests on "the only/first non-CA cert is the signer." For TrueCapture's own EC P-256 leaves this holds, but it is an undocumented hard assumption and a weaker link than parsing the actual signature structure. **Fix:** parse the COSE signer cert from the manifest structure rather than byte-scanning, or at minimum document and assert the assumptions.

**M-4 — The "c2patool fallback" does not exist.**
`createC2pa` unconditionally returns the contentauth engine (`backend/src/c2pa/index.js:6-8`); the fallback is only a comment ("deferred", `backend/src/c2pa/index.js:3-5`) and `backend/src/ARCHITECTURE.md:15` still advertises it. If the native `@contentauth/c2pa-node` addon fails to load on a platform, signing *and* verify have no degraded path. **Fix:** implement the subprocess fallback or remove the claim from the docs.

**M-5 — Verify-page banner styling is missing for `signed`/`forged`/`untrusted`/`unsigned` — the H2 `.signed` rule was added to the wrong stylesheet. (Introduced by the remediation.)**
The verify page links `styles.css` which resolves to `verify/verify/styles.css` (`verify/verify/index.html:7`); that sheet themes only `.verdict.authentic`/`.tampered`/`.unknown` (`verify/verify/styles.css:180`). The H2 work added `.verdict.signed` to `verify/styles.css` (the landing sheet, `verify/styles.css:181`) — **the wrong file** — so the default in-browser verdict "Content intact · signed" renders with the bare `.verdict { border: 2px solid }` and no border-color/tint. `forged`/`untrusted`/`unsigned` are likewise unthemed. The e2e passed because it asserts the class attribute, not computed style (`backend/e2e/verify-browser.spec.js`). **Fix:** add `.verdict.signed`/`.forged`/`.untrusted`/`.unsigned` to `verify/verify/styles.css`.

**M-6 — Privacy/FAQ copy contradicts CAPTCHA's third-party data flow.**
`verify/privacy/index.html:114` claims "No cookies. No tracking." and `:129` "No other third parties receive your data," but when `/config` enables CAPTCHA the sign page loads Cloudflare Turnstile or hCaptcha directly into the page (`verify/sign/index.html:666,669`) — third parties that set cookies and receive the user's IP. The policy never mentions them. (Also, "we don't collect your IP" is a backend-dependent claim the frontend can't guarantee.) **Fix:** disclose the CAPTCHA provider in the privacy policy, conditioned on deployment.

**M-7 — Extension verify link is hardcoded to the public domain; `webUrl` is unsettable.**
`capture.js:188` reads an `X-Verify-URL` header the backend **never sets** (`sendSigned` sets only `X-Verify-Hash`, `backend/src/app.js:78-83`), so it always falls back to a hardcoded `https://www.truecapture.global/verify/${hash}`. The configurable `webUrl` is read from storage (`extension/capture.js:15-17`) but **never written** by the popup (`extension/popup.js` only stores `backendUrl`). A self-hosted fork's extension therefore shows/copies links to the public TrueCapture site, and the CAPTCHA iframe origin + CSP `frame-src` are pinned to `www.truecapture.global` (`extension/manifest.json:39`). **Fix:** have the backend emit `X-Verify-URL` (or derive from a configurable verify base), make `webUrl` settable, and document the manifest CSP edit for forks.

**M-8 — Deploy/README instructions point at files and variables that don't exist.**
`DEPLOY_YOUR_OWN.md:40-42` tells users to edit `claim_generator`/`entity.*` in `backend/server.js` — a 9-line entry point with none of those (org identity comes from `ORG_NAME`/`ORG_URL`, `backend/src/bootstrap.js:21-22,41`). `README.md:170` and `DEPLOY_YOUR_OWN.md:162-181` say to set `const BACKEND_URL` in `extension/background.js`; `background.js` has no such variable and the real value is `let backendUrl` in `extension/capture.js:4` (set via the popup). A deployer following these steps misconfigures the fork. **Fix:** rewrite these steps to reference env vars and the actual extension config field.

### LOW

**L-1 — e2e is almost entirely backend-mocked, and the journey registry is decorative *and* internally inconsistent.**
Three of four e2e specs never touch the backend — `page.route('…/**')` returns canned JSON (`backend/e2e/verify-page.spec.js:35`, `backend/e2e/sign-page.spec.js:36-37`); the `webServer` block that would boot a real full stack is explicitly deferred (`backend/playwright.config.js:4-6`). The journey registry declares 7 journeys (`backend/e2e/journeys.js:4-12`) but **no journey id appears in any spec**, and `registry.spec.js:17` asserts the registry contains verdict names `forged-key`/`revoked-key` that the system never emits (the real enum is `forged`/`untrusted`, `backend/src/verify/verdict.js:8-12`). The "CI fails a journey without one" promise (`backend/e2e/registry.spec.js:2`) is not implemented. **Fix:** add one real full-stack journey; reconcile the registry's verdict vocabulary with the code or delete it.

**L-2 — The `bootstrap.js` coverage exclusion hides real, untested conditional logic.**
`bootstrap.js` is not purely declarative: `:34-38` is a conditional DeDi `publish()` whose failure is swallowed to `console.error`, and `:44-50` selects real-vs-noop seams from env. The smoke test only runs the no-creds path (`backend/src/bootstrap.test.js:14`), so the publish branch, its error handler, and the configured-CAPTCHA/OIDC branches are exercised by no test and exempt from the gate. **Fix:** lift the conditional selection into a tested helper, leaving only wiring in the excluded file.

**L-3 — DeDi lookup is uncached, untimed, and O(n); publish result is discarded.**
`lookup` GETs the public endpoint, fetches the full records list, and `.find`s client-side on every verify (`backend/src/dedi/http.js:8-12`) — no cache, no `fetch` timeout (a hung DeDi stalls verify), and added latency per call. `publish` returns `res.ok` (`backend/src/dedi/http.js:33`) but the boot only catches thrown errors (`backend/src/bootstrap.js:35-38`), so a non-ok-but-200 publish is silently "successful." **Fix:** add a timeout + short-TTL cache; check the publish boolean.

**L-4 — Assorted hardening / hygiene.**
- No key rotation: the 825-day leaf (`backend/src/keys/chain.js`) expires with no re-publish path.
- `/health` discloses the total signed-record count on an unauthenticated endpoint (`backend/src/app.js:92`).
- OIDC binding embeds `claims.email` without checking `email_verified` (`backend/src/app.js:140`).
- `CONTRIBUTING.md:55` says "there are no automated tests yet" — stale; an extensive suite exists.
- Backend has no committed lockfile, so CI uses `npm install` not `npm ci` (`.github/workflows/ci.yml:22-24`) — non-reproducible builds.
- Share-link `HASH_RE = /^[0-9a-f]{16,32}$/` (`verify/verify/verify.js:195`) silently rejects any non-lowercase/longer hash; this is an undocumented cross-repo contract with the backend's verify-hash format.
- Accessibility gaps on the verify page: no `aria-live` on the verdict banner, unlabeled file input, and the sign page disables zoom (`verify/sign/index.html:9`).

---

## 5. Test architecture assessment

The unit/integration layer is genuinely strong: real crypto, a real adversary for the forgery test, injected seams, deterministic clocks, and a meaningful 100% gate enforced in CI across Node 20/22 (`.github/workflows/ci.yml:12-13`). The H2 in-browser reader runs for real in CI because the vendored bundle is rebuilt before the e2e job (`.github/workflows/ci.yml:57-59`).

The weaknesses are concentrated at the edges: (1) e2e mocks the backend almost entirely, so server↔client contract drift (header names, verdict JSON) is caught only by unit tests if at all (L-1); (2) the `bootstrap.js` exclusion hides untested branches (L-2); (3) there is no coverage of the real DeDi API, the (nonexistent) c2patool fallback, concurrency, or large files; and (4) the H2 tests skip silently if the vendor isn't built (`backend/e2e/verify-browser.spec.js:26,58`), and a skipped test is indistinguishable from a pass in the list reporter. 100% line/branch coverage is real but, as M-2/L-1 show, does not equal scenario coverage.

---

## 6. Recommended priorities

1. **H-1** — Document `DEDI_RECORD_ID` (and fail fast if missing) so forks can reach `authentic`. *Highest impact, smallest fix.*
2. **H-3** — Wire `prune()` and stop storing full assets indefinitely.
3. **H-2** — Bound the rate-limiter memory, set `trustProxy`, and move to shared state for multi-instance.
4. **M-1** — Warn (or refuse to boot) when the public signer has no CAPTCHA/Origin protection.
5. **M-5** — Move the `.verdict.signed`/`forged`/`untrusted` styles into `verify/verify/styles.css`.
6. **M-2 / M-3** — Tighten verdict labelling and bind cert extraction to the actual COSE signer.
7. **M-7 / M-8 / M-6** — Fix the deploy docs, the extension verify-link/`webUrl`, and the CAPTCHA privacy disclosure so a fork is correct and honest end-to-end.

**Overall:** the cryptographic and trust core is in good shape and well-tested; this round's findings are operational and documentation hardening rather than fundamental design flaws. Closing H-1 through M-1 would make a self-hosted deployment both correct and safe by default.
