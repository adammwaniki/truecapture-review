# Backend architecture (test-first seams)

The backend is being refactored out of the legacy `../server.js` monolith into
small modules behind interfaces, so every error path is reachable from a fake
and the codebase can hold **100% coverage** (see `../../truecap-remediation-plan.md`
→ "Test architecture"). Findings C4/C1/C3/H1/H4 are implemented **inside** these
seams, test-first.

## Seams (interfaces)

| Seam | Module | Contract | Production impl | Finding |
|------|--------|----------|-----------------|---------|
| `clock` | `src/clock.js` | `now() -> Date` | `systemClock()` | — |
| `store` | `src/store/memory.js` | `put/get/has/size` | memory (dev) → Postgres/Redis | H1 |
| `c2pa` | _(C4)_ | `sign(asset,mime,manifest)->Buffer`, `read(asset,mime)->{validationState,signerKey,manifest}` | `@contentauth/c2pa-node` + `c2patool` fallback | C4 |
| `dedi` | _(C1)_ | `lookup(recordId)->{state,publicKey,entity}`, `publish(key,identity)->{recordId}` | DeDi HTTP API (reads `details.publicKey`) | C1 |
| `keys` | _(C5)_ | EC P-256 (PKCS#8) + X.509 CA→leaf chain | `crypto` / `openssl` | C5 |
| `auth` | _(C3)_ | `authenticate(req)->{org}\|401` | API-key / OAuth | C3 |

Test doubles for the not-yet-implemented seams live in `test/fakes/`.

## App factory

`src/app.js` `createApp(deps)` builds a Fastify instance with routes that call
injected seams only. Tests build it with fakes and use `app.inject(...)`. The
`cmd`-style bootstrap (env → real services → `listen()`) is the single coverage
exclusion.

## Key spike findings baked into these contracts
(see `../../truecap-spike-c2pa-dedi.md`)
- C2PA signer needs a **PKCS#8** EC key and a **CA→leaf chain** (self-signed leaf is rejected); verdict comes from `reader.json().validation_state` **plus** the DeDi key compare.
- DeDi already serves `details.publicKey`; browser-direct DeDi calls hit a CORS `Origin`→500, so the `dedi` seam is server-side (client-side verify resolves CORS separately — H2).
