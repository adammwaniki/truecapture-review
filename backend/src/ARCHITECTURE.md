# Backend architecture (test-first seams)

The backend is being refactored out of the legacy `../server.js` monolith into
small modules behind interfaces, so every error path is reachable from a fake
and the codebase can hold **100% coverage** (see `../../truecap-remediation-plan.md`
→ "Test architecture"). Findings C1/C2/C4/C5/C3/C3b/H1/H3/H4/M3/M4/M5c are
implemented **inside** these seams, test-first.

## Seams (interfaces)

| Seam | Module | Contract | Production impl | Finding |
|------|--------|----------|-----------------|---------|
| `clock` | `src/clock.js` | `now() -> Date` | `systemClock()` | — |
| `store` | `src/store/{memory,sqlite}.js` | `put/get/has/size` (+ retention) | SQLite (`node:sqlite`); memory for tests | H1 |
| `c2pa` | `src/c2pa/` | `sign(asset,mime,manifest)->Buffer`, `read(asset,mime)->{validationState,validationStatus,manifestStore}\|null` | `@contentauth/c2pa-node` (single engine; no fallback) | C4 |
| `verify` | `src/verify/` | `verifyAsset({c2pa,dedi},bytes,mime)->{verdict,entity}` — DeDi-anchored, see `../../TRUST_MODEL.md` | — | C1/C2/M5c |
| `dedi` | `src/dedi/http.js` | `lookup(recordId)->{state,publicKey,entity}`, `publish(key,identity)->{recordId}` | DeDi HTTP API (reads `details.publicKey`) | C1 |
| `keys` | `src/keys/chain.js` | EC P-256 (PKCS#8) + X.509 CA→leaf chain (`ensureChain`) | `crypto` / `openssl` | C5 |
| `identity` | `src/bootstrap.js` | org name/url + DeDi record embedded in every manifest | env `ORG_*` / `DEDI_*` | H4 |
| `captcha` | `src/captcha.js` | `verify(token)->bool` — the public `/sign` has **no secret key** | Turnstile/hCaptcha siteverify | C3 |
| `oidc` | `src/oidc/verify.js` | `verify(bearer)->claims\|null` for `/sign/session` | `jose` + remote JWKS | C3b |
| `limiter` | `src/ratelimit.js` | `check(ip)->bool`, per-IP/min | in-memory sliding window | H3 |

The C2PA reader does **not** expose the signer's public key; it is extracted
from the signed bytes (`src/c2pa/extract-cert.js`) and compared to the
DeDi-published key (`src/verify/keymatch.js`). See `../../TRUST_MODEL.md`.

## App factory

`src/app.js` `createApp(deps)` builds a Fastify instance with routes that call
injected seams only. Tests build it with fakes and use `app.inject(...)`. The
`cmd`-style bootstrap (env → real services → `listen()`) is the single coverage
exclusion.

## Key spike findings baked into these contracts
(see `../../truecap-spike-c2pa-dedi.md`)
- C2PA signer needs a **PKCS#8** EC key and a **CA→leaf chain** (self-signed leaf is rejected); verdict comes from `reader.json().validation_state` **plus** the DeDi key compare.
- DeDi already serves `details.publicKey`; browser-direct DeDi calls hit a CORS `Origin`→500, so the `dedi` seam is server-side (client-side verify resolves CORS separately — H2).
