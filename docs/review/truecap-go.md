# TrueCapture — Go Rewrite & Test-Driven Refactor Plan

Standalone companion to [`truecap-architectural-review.md`](./truecap-architectural-review.md) and [`truecap-remediation-plan.md`](./truecap-remediation-plan.md). **This plan does not replace the remediation plan** — the remediation plan describes *what* to fix (the 14 findings) in a language-neutral way; this plan describes *how the backend is rebuilt in Go* and how the whole codebase becomes test-based at **100% unit + integration + e2e coverage**.

## Decisions this plan implements

| Axis | Decision |
|---|---|
| Backend language | **Rewrite `backend/` in idiomatic Go** (the frontend stays browser JS) |
| C2PA engine | **Real C2PA via the `c2patool` subprocess** (ECDSA-P256 / COSE_Sign1 / JUMBF), interoperable with Adobe/Truepic |
| Trust anchor | **DeDi-published key** is fetched and compared against the C2PA signer key; a verdict of `authentic` requires that match + a live record |
| Tests | **100% unit + integration + e2e coverage**, gated in CI, Go-idiomatic |
| Signing model | Server-side signing for web/extension (hardened); on-device keys remain the native-SDK track |

---

## 0. Research & evidence (sources)

*Investigated June 2026. The C2PA facts are from primary contentauth repositories; the DeDi facts combine the product docs with this repo's own live integration. Items marked **(confirm in Spike G-S1)** could not be fully verified headlessly and must be re-checked against the live API/docs.*

### 0.1 C2PA tooling
- **`c2pa-node` is deprecated.** The package pinned here, `c2pa-node@^0.5.5` (`backend/package.json:13`), is end-of-life: *"This repository and the `c2pa-node` package are deprecated. Use c2pa-node-v2 instead."* → [contentauth/c2pa-node usage.md](https://github.com/contentauth/c2pa-node/blob/main/docs/usage.md)
- **Signing is supported** via `c2pa.sign()` + `LocalSigner` (certificate + private key + `SigningAlgorithm.ES256` = ECDSA P-256, optional TSA) **or** a remote/callback signer (`reserveSize()` + `sign()`). Buffer signing is **JPEG/PNG only**; file-path signing covers **all formats incl. video**. → [c2pa-node usage.md](https://github.com/contentauth/c2pa-node/blob/main/docs/usage.md), [contentauth/c2pa-node-v2](https://github.com/contentauth/c2pa-node-v2)
- `c2pa-node-v2` binds the **C2PA v24 API**, ships precompiled binaries (Linux x64/arm64, macOS, Windows): `LocalSigner.newSigner(certBuf, keyBuf, 'es256', tsaUrl?)`. → [c2pa-node-v2](https://github.com/contentauth/c2pa-node-v2)

### 0.2 C2PA from Go
- **No official Go binding exists** (official: Rust, Node, Python, Java, C/C++, Android). → [c2pa-rs](https://github.com/contentauth/c2pa-rs), [c2pa-c](https://github.com/contentauth/c2pa-c)
- Options for Go, in order of preference:
  1. **`c2patool` subprocess** — official CLI from `c2pa-rs`; ES256 + local signer + all formats; language-agnostic; pin a version, ship as a vendored binary or container layer. → [c2pa-rs / c2patool](https://github.com/contentauth/c2pa-rs)
  2. **cgo over the official C API** (`c2pa-c` / `c2pa-bindings`) — in-process, no subprocess, but cgo build complexity. → [c2pa-c](https://github.com/contentauth/c2pa-c)
  3. **`streamplace/c2pa-go`** — community PoC binding over `c2pa-rs`; evaluate maturity before relying on it. → [streamplace/c2pa-go](https://github.com/streamplace/c2pa-go)

### 0.3 DeDi key registry
- DeDi **publishes and verifies public keys** as a first-class record type, with **cryptographically signed JSON** responses, one endpoint, sub-200ms lookups. → [dedi.global](https://dedi.global/), [DeDi GitBook docs](https://dedi-global.gitbook.io/docs), [LF Decentralized Trust — DeDi protocol](https://github.com/LF-Decentralized-Trust-labs/decentralized-directory-protocol), [DeDi API spec (finternet-io/dedi)](https://github.com/finternet-io/dedi)
- **The key is already stored and served by DeDi in this deployment.** Registration POSTs `details.publicKey` + `keyType` + `entity` to `…/dedi/{namespace}/{registry}/save-record-as-draft?publish=true` (`backend/server.js:124-137`); the query endpoint `…/dedi/query/{namespace}/{registry}` returns `data.records[].details` (`backend/server.js:96-99`, `:377-389`). The current `dediLookup` **discards `details.publicKey`**, reading only `entity`/`keyType` (`backend/server.js:382-389`). → **C1 needs no new DeDi feature — just read `details.publicKey` and compare it to the signer key.**
- **CORS:** `api.dedi.global` reportedly **returns 500 when an `Origin` header is present** (`backend/server.js:535-537`), which forces server-side proxying today. The Phase-3 client-side verifier must resolve this. **(confirm in Spike G-S1)**

---

## 1. Target architecture

### 1.1 Go package layout
```
backend-go/
  cmd/server/main.go        // composition root: wiring only — the single coverage exclusion
  internal/httpapi/         // handlers + middleware: /sign /verify /manifest /dedi-lookup /health /public-key
  internal/signing/         // manifest assembly + sign orchestration (pure; fully unit-tested)
  internal/c2pa/            // C2PATool interface → c2patool subprocess impl + in-memory fake
  internal/dedi/            // DediClient interface → HTTP impl (publish + lookup incl. key) + fake
  internal/store/           // ManifestStore interface → Postgres/Redis impl + in-memory fake
  internal/keys/            // EC P-256 keygen + X.509 (crypto/ecdsa, crypto/x509) — replaces node-forge
  internal/identity/        // org identity (ORG_NAME/ORG_URL + per-credential)
  internal/auth/            // API-key / OAuth middleware
  internal/clock/           // Clock interface (real + fake) — deterministic timestamps
  testdata/                 // golden signed manifests, fuzz corpus, sample assets
```
Router: stdlib `net/http` + a light mux (`chi`). No framework. Single static binary for Railway.

### 1.2 Interface seams (the mechanism for 100% coverage)
Every external dependency is an interface with a real impl **and** a fake that can return success *and* each failure mode — so error branches are reachable without flaky infra:

| Seam | Real impl | Fake drives | Covers |
|---|---|---|---|
| `C2PATool` | `c2patool` subprocess | valid sign/verify, malformed JUMBF, tool-missing, non-zero exit, timeout | signing + verify error paths |
| `DediClient` | DeDi HTTP API | live / revoked / missing / key-mismatch / timeout / unsigned-response | trust logic (C1), H2 |
| `ManifestStore` | Postgres/Redis | hit / miss / write-error | C2, H1 |
| `KeyStore` | disk + `crypto/x509` | present / absent / corrupt PEM | C5, cert handling |
| `Authenticator` | API-key / OAuth | valid / missing / expired / wrong-scope | C3 |
| `Clock` | `time.Now` | fixed instants | deterministic manifests |

DI by constructor injection; `cmd/server/main.go` is the only place real impls are assembled.

---

## 2. C2PA integration design (`internal/c2pa`)
- `C2PATool` interface: `Sign(ctx, asset []byte, mime string, manifest Manifest, signer Signer) ([]byte, error)` and `Read(ctx, asset []byte, mime string) (*Report, error)`.
- Real impl shells out to a **pinned `c2patool` version** via `os/exec` with `context.Context` timeouts; writes the asset to a temp file (file-path mode supports all formats incl. video; buffer mode would be JPEG/PNG-only per §0.1); passes a manifest definition JSON and an **ES256 local signer** (cert + key from `internal/keys`).
- Manifest: standard assertions `c2pa.actions` (`c2pa.created`), `stds.schema-org.CreativeWork`, plus the hard-binding content hash that `c2patool` computes — replacing the hand-rolled hash/embed in `backend/server.js:210,243-270`.
- Packaging: vendor the `c2patool` binary in the image (or a container layer); record the exact version in `go.mod`-adjacent docs and assert it at startup.
- **Replaces** `signFile`/`embedInJpeg`/`embedInPng`/`embedInBinary`/`serverExtractC2PA`/`serverStripC2PA` (`backend/server.js:169-372`) entirely.

---

## 3. DeDi trust-anchor integration (`internal/dedi`)
- `DediClient` interface: `Publish(ctx, key PublicKey, identity Org) (RecordRef, error)` and `Lookup(ctx, recordID string) (*Record, error)` where **`Record` includes the published key bytes** (`details.publicKey`).
- **C1 fix:** in `/verify`, after `c2patool` validates the manifest, fetch the DeDi record named by the manifest, and require: `signerKey == record.details.publicKey` **AND** `record.state == "live"` **AND** the content hash matches. Drop all trust in any key carried inside the asset.
- Reads the key field the current code already publishes but discards (`backend/server.js:124-137` vs `:382-389`).
- CORS: keep server-side DeDi calls in Go for `/verify`; for the Phase-3 in-browser verifier, resolve the documented `Origin`→500 issue (`backend/server.js:535-537`) — server-fetch, a cacheable CORS-enabled mirror, or a DeDi-side fix. **(Spike G-S1)**

---

## 4. Test strategy — 100% across the board

> **Honest note on "100%."** The last few percent is where the effort concentrates (defensive `default:` arms, glue). The seam design above turns that into a checklist: if a dependency can fail, a fake makes it fail. We gate on **branch** coverage (not just line), exclude exactly one thing — `cmd/server/main.go` wiring — and mark it explicitly so the number stays honest.

### 4.1 Taxonomy
| Layer | Tooling | Scope | "100%" means |
|---|---|---|---|
| **Unit** | `go test` table-driven + fakes; native `Fuzz*`; `httptest` | each package's logic + **all** error branches via injected faults | 100% statement **and** branch coverage; only `main.go` excluded |
| **Integration** | `httptest.Server`, stub DeDi server, **real** `c2patool` binary, ephemeral DB (testcontainers or in-memory impl) | each HTTP route end-to-end in-process | every route × {success, auth-fail, bad-input, dependency-fail} |
| **E2E** | Playwright vs the running Go binary + static site | full journeys: PWA/extension sign → share link → verify, verdicts {authentic, tampered, unsigned, forged-key, revoked-key} | **flow coverage** — every journey + verdict has a test, incl. the C1 forgery flow |

E2E "100%" is **flow coverage** (a registry of journeys, each with a test); line coverage at that layer is meaningless and is owned by unit + integration.

### 4.2 Enforcement in CI
- **Go:** `go test ./... -race -covermode=atomic -coverprofile=cover.out`; a gate script fails the build if total < 100% after excluding the marked `main`. Plus `go vet`, `staticcheck`, `govulncheck`.
- **Frontend:** Vitest + `c8`/istanbul thresholds `100` (lines/branches/functions/statements); the Playwright flow list is diffed against the journey registry so a new flow without a test fails CI.
- **Gate:** no merge below threshold; coverage reported on every PR; wired in **G0** before feature work.

### 4.3 Go values → concrete practice
| Go value | Practice here | Replaces / fixes |
|---|---|---|
| Small, single-purpose packages | the `internal/*` layout | one 561-line `server.js` |
| Explicit errors (`return err`, `%w`) | every failure returned and tested | silent `catch {}` at `backend/server.js:332,370` |
| Interfaces at boundaries | the seams in §1.2 | untestable inline `fetch`/`crypto` |
| Composition + DI | constructor injection; `main` is the only wiring | singletons `manifestStore`/`dediRegistration` |
| `context.Context` | timeouts on DeDi + `c2patool` calls | unbounded `fetch` to DeDi |
| Concurrency safety | `-race` in CI; store guarded/DB-backed | data-race-prone `Map` (`server.js:294`) |
| Table-driven + golden files | verdict matrices; golden signed manifests (`-update`) | no tests at all |
| Native fuzzing | `FuzzVerify`/`FuzzRead` over the verifier; corpus of malformed JUMBF/COSE | hand-rolled parsers never fuzzed |
| Deterministic time | `Clock` fake; no `time.Now()` in logic | scattered `new Date()` (`server.js:176-199`) |
| Single static binary | reproducible build, clean deploy | Node runtime + node_modules |

### 4.4 Frontend testability refactor (JS, same bar)
- Extract the ~600-line inline `<script>` blocks (`webapp/index.html:626`, `verify/sign/index.html:626`) and the logic in `verify/verify/verify.js`, `extension/capture.js`, `extension/popup.js` into small ES modules with injected `fetch`/DOM seams (prerequisite for unit-testing them at all).
- Vitest covers pure functions (verdict rendering, hash display, URL/scheme sanitizer) at 100%; Playwright covers DOM-bound flows.

---

## 5. Phased delivery

Each Go phase implements the corresponding remediation findings; cross-reference in brackets.

### G0 — Skeleton, seams & coverage-gated CI
- Init Go module; create `internal/*` packages with interfaces + fakes (no real logic yet); stand up the 100% coverage gate, `staticcheck`, `govulncheck`, `-race`; add Vitest + Playwright scaffolding; extract frontend inline scripts into modules. **[remediation M1, M5a]**
- **Done when:** CI green; coverage gate enforced; one Playwright smoke flow (sign→verify) runs against the Go binary.

### G-S1 — Spikes (close before G1 estimates harden)
- (a) `c2patool` subprocess signing from Go: ES256 local signer + cert, JUMBF for JPEG/PNG/BMFF video, pin version + packaging; evaluate `streamplace/c2pa-go` and `c2pa-c`+cgo as alternatives.
- (b) DeDi: confirm the query response returns `details.publicKey`, response signing, and the `Origin`→500 CORS behaviour + a client-side path. **[review Open Q2]**
- **Done when:** a one-page decision note pins the C2PA invocation method, the DeDi key-read contract, and the CORS approach.

### G1 — Real C2PA signing + ECDSA keys
- Implement `internal/keys` (EC P-256 + X.509 via `crypto/ecdsa`/`crypto/x509`) and `internal/c2pa` (c2patool); port `/sign` to emit genuine C2PA; set DeDi `keyType` to the real algorithm. **[remediation C4, C5, M2]**
- **Done when:** backend-signed files validate in `c2patool` and Adobe Verify; our reader reads `c2patool`-produced files; tests assert COSE alg = ES256; golden manifests committed.

### G2 — DeDi trust anchor + content-bound verify
- Implement `internal/dedi` (publish + lookup-with-key); make `/verify` require signer-key == DeDi key + live + hash match; remove hardcoded `sigValid:true` on the link path and bind the link to content. **[remediation C1, C2]**
- **Done when:** the adversarial forgery test (attacker key + copied `dedi_record_id`) returns **not** `authentic`; the link path runs the full pipeline.

### G3 — Hardened service
- `internal/auth` (API-key/OAuth) on `/sign`; per-origin CORS; streaming/bounded uploads + rate limiting; `internal/store` (durable DB) with retention; `internal/identity` wiring `ORG_NAME`/`ORG_URL` + per-credential identity. **[remediation C3, H3, H1, H4]**
- **Done when:** unauth `/sign`⇒401; load test bounds memory + returns 429; verify links survive restart; a fork signs as its own org via env only.

### G4 — Independent / client-side verification
- Ship a browser C2PA verifier (`c2pa-js`/WASM) that validates in-browser and reads DeDi directly (CORS resolved); keep Go `/verify` as fallback. **[remediation H2]**
- **Done when:** a signed file verifies in-browser with the backend offline and via third-party `c2patool`.

### G5 — Cutover & doc reconciliation
- Strangler or clean cutover behind a proxy; dual-read legacy format during transition; update all docs to the now-true Go/C2PA/ECDSA/independent-verify behaviour. **[remediation M3, M4, doc sweep, M5c]**
- **Done when:** legacy and new both verify during the window; the review's claims matrix has zero "False" rows.

---

## 6. Migration & cutover
1. **Dual-read verifier:** during transition, read both the legacy custom box and real C2PA; label legacy clearly; remove on a published end-date.
2. **Key rotation:** publish the new EC key in DeDi alongside the old RSA key; keep the old resolvable until retired.
3. **Verify-link durability:** seed/migrate the new persistent store so existing `…/verify/<hash>` links keep resolving.
4. **Clients:** extension/PWA only POST `/sign`; the Go backend keeps the same contract — only the new auth header (G3) changes; bump `extension/manifest.json` and re-test.
5. **Strangler option:** run Go beside Node behind a proxy, migrating routes one at a time; given the small surface, a clean cutover is equally viable.

---

## 7. Risks & open items
1. **`c2patool` packaging & version drift** — vendoring a binary adds a supply-chain + ops concern; pin + checksum + assert version at startup. (G-S1)
2. **No official Go C2PA binding** — subprocess is robust but adds process management; cgo (`c2pa-c`) is an in-process fallback if subprocess latency matters. (G-S1)
3. **DeDi CORS `Origin`→500** — blocks the pure client-side verifier (G4); needs a confirmed path. (G-S1)
4. **DeDi query response schema** — confirm `details.publicKey` is returned and whether responses carry a verifiable signature to check. (G-S1)
5. **Video signing** — file-path mode required (buffer mode is JPEG/PNG-only); ensure temp-file handling is streamed/bounded (ties to G3/H3).
6. **100% coverage maintenance cost** — the gate can become friction; mitigated by seams + the single explicit `main` exclusion; revisit if it impedes velocity.

---

## 8. Milestones
| Milestone | Phase | Exit criterion |
|---|---|---|
| **GM0 — Scaffolding** | G0 + G-S1 | CI green; 100% gate live; spikes closed; frontend scripts extracted |
| **GM1 — Honest crypto in Go** | G1 | Files interoperate with `c2patool`/Adobe; ES256 asserted |
| **GM2 — Trustworthy verdicts** | G2 | Forgery test returns non-authentic; link path bound to content |
| **GM3 — Hardened service** | G3 | Auth + limits + durable store + real identity |
| **GM4 — Independent verify** | G4 | Verifies in-browser offline + via third-party tool |
| **GM5 — Cutover & honest docs** | G5 | Dual-read window works; claims matrix zero "False" |

---

## Sources
- [contentauth/c2pa-node usage.md](https://github.com/contentauth/c2pa-node/blob/main/docs/usage.md) · [contentauth/c2pa-node-v2](https://github.com/contentauth/c2pa-node-v2) · [contentauth/c2pa-rs](https://github.com/contentauth/c2pa-rs) · [contentauth/c2pa-c](https://github.com/contentauth/c2pa-c) · [streamplace/c2pa-go](https://github.com/streamplace/c2pa-go)
- [dedi.global](https://dedi.global/) · [DeDi GitBook docs](https://dedi-global.gitbook.io/docs) · [LF Decentralized Trust — DeDi protocol](https://github.com/LF-Decentralized-Trust-labs/decentralized-directory-protocol) · [DeDi API spec (finternet-io/dedi)](https://github.com/finternet-io/dedi)
- Repo evidence: `backend/server.js:124-137` (publishes `details.publicKey`), `:96-99` & `:377-389` (query returns `details`), `:382-389` (`dediLookup` discards the key), `:535-537` (DeDi CORS 500).
