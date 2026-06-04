# TrueCapture

**Production-ready media signing for browser and mobile, built on the C2PA open standard.**

TrueCapture lets anyone cryptographically sign photos and videos at the moment of capture. Each signed file carries an embedded C2PA manifest containing a SHA-256 hash of the content, an ECDSA-P256 signature, and a reference to the signer's public key on [DeDi.global](https://dedi.global), a decentralised key registry. If a single pixel changes after signing, the signature breaks. Anyone with the verify link gets an instant verdict — no app, no account. Because the signer's key is published on DeDi.global, the file is independently verifiable with any C2PA-aware tool, without trusting TrueCapture.

---

## Who is this for?

**Journalists and news organisations** Field reporters and newsrooms who need to prove footage is authentic before publication.

**Photojournalists** Photographers whose work needs to be verifiable by editors, fact-checkers, and the public.

**Public figures and politicians** Anyone making official statements who needs protection against fake attribution.

**Doctors and health professionals** Medical practitioners sharing guidance who need to distinguish their content from impersonation.

**Legal and law enforcement** Officers, investigators, and legal teams handling digital evidence that must survive scrutiny.

**Financial institutions** Banks and finance teams protecting high-value authorisation workflows against deepfake fraud.

**Content creators and influencers** Creators who need to prove their content is original and protect against AI impersonation.

**Human rights workers and activists** Field documenters whose recordings of events need cryptographic proof to be taken seriously.

**Anyone** who needs to prove a photo or video is real, unedited, and genuinely theirs.

---

## SDK

For organisations embedding TrueCapture signing directly into their own apps — BBC, Reuters, AP, or any news org, legal team, or institution that needs their content signed as themselves rather than as TrueCapture.

The SDK supports:
- On-device signing using Secure Enclave (iOS) and Android Keystore (Android) — private key never leaves the device
- Offline signing — works with zero connectivity, syncs when connection returns
- Optional edit chain — extends the C2PA manifest after authorised edits, compatible with Adobe Lightroom and Photoshop
- iOS (Swift), Android (Kotlin), React Native

Status: **specification only — a future implementation** (not yet shipped). Today the web app and Chrome extension sign server-side; on-device signing (Secure Enclave / Android Keystore) lands with the SDK. See [SDK_SPEC.md](./SDK_SPEC.md) for the full technical specification.

Contact [tanushka@cdpi.dev](mailto:tanushka@cdpi.dev) to discuss integration.

---

## Live demo

| | |
|---|---|
| Landing page | [www.truecapture.global](https://www.truecapture.global) |
| Verify a file | [www.truecapture.global/verify](https://www.truecapture.global/verify) |
| Sign on mobile | [www.truecapture.global/sign](https://www.truecapture.global/sign) |

---

## How it works

1. **Capture** — a journalist opens the TrueCapture Chrome extension (or mobile web app at `/sign`) and takes a photo, records video, or captures their screen.

2. **Sign** — the browser sends the file to the backend signing server (the public endpoint has **no secret key**; it is guarded by a CAPTCHA, an Origin allowlist, and a per-IP rate limit — and a separate OIDC-bound endpoint exists for authenticated users). The server:
   - Builds a standards-compliant **C2PA manifest** — a content hard-binding, a `c2pa.actions` assertion, a coarse capture device class (iOS/Android/Desktop; never the raw user-agent), and the signer's DeDi reference
   - Signs it as **COSE_Sign1 / ES256** with the EC P-256 leaf key via [`@contentauth/c2pa-node`](https://opensource.contentauthenticity.org/) — no hand-rolled signing or custom container
   - Embeds the manifest into the file per the C2PA spec, stores the verify hash **durably** (SQLite), and returns the signed file + a short verify URL

3. **Register** — the signer's public key is registered on [DeDi.global](https://dedi.global), a decentralised public key directory. The manifest embeds the DeDi record ID so any verifier can independently confirm the key belongs to the claimed organisation.

4. **Share** — the journalist pastes the verify URL (`truecapture.global/verify/<hash>`) into their post caption or article. Readers tap it for an instant verdict.

5. **Verify** — opening a file on the verify page reads it **in your browser** to check it is intact and signed (no upload). Confirming that the signer is the claimed organisation is an explicit step that re-checks the signer's key against the DeDi registry on the backend. A shared verify link (`/verify/<hash>`) is checked server-side. The verdict is **DeDi-anchored** — `authentic`, `forged`, `untrusted`, `tampered`, or `unsigned` — see [TRUST_MODEL.md](./TRUST_MODEL.md).

### C2PA compliance

TrueCapture implements the [C2PA specification](https://c2pa.org) — the same provenance standard used by Adobe Content Credentials, Google, Sony, the BBC, and the Microsoft Azure AI Content Safety team. Signed files are compatible with any C2PA-aware toolchain.

---

## API

All endpoints are served by the **backend** (Fastify) at its base URL — `http://localhost:3000` in local dev, `https://api.yourdomain.com` (your configured domain) in production — **not** the static verify site (`:8080` locally). The interactive docs and the spec are available in **every** environment the backend runs:

- **Swagger UI** → `GET /docs` — e.g. `http://localhost:3000/docs` locally, `https://api.yourdomain.com/docs` in prod
- **OpenAPI spec** → `GET /openapi.json`

> Note: `/docs` and `/openapi.json` are served **publicly** wherever the backend runs. If you don't want public API docs in production, restrict those paths at your proxy/CDN.

| Method & path | Purpose |
|---------------|---------|
| `GET /health` | Liveness. |
| `GET /config` | Public client config — CAPTCHA provider + site key, or `null`. |
| `POST /sign` | Public keyless signing (Origin allowlist + CAPTCHA + per-IP rate limit). Returns the signed asset; verify hash in the `X-Verify-Hash` header. |
| `POST /sign/session` | Sign bound to an OIDC-authenticated user (when OIDC is configured). |
| `POST /verify` | Verify an uploaded file → DeDi-anchored verdict. |
| `GET /verify/:hash` | Verify the stored asset behind a share link. |

---

## Architecture

```
┌─────────────────────┐     upload      ┌──────────────────────┐
│  Chrome Extension   │────────────────▶│   Backend (Fastify)  │
│  /sign (mobile web) │◀────signed file─│   api.domain.com     │
└─────────────────────┘                 └──────────┬───────────┘
                                                   │ register public key
                                                   ▼
                                         ┌─────────────────────┐
                                         │    DeDi.global      │
                                         │  Key registry       │
                                         └─────────────────────┘

┌─────────────────────┐   POST /verify  ┌──────────────────────┐
│   Verify page       │────────────────▶│   Backend (Fastify)  │
│   /verify           │◀────verdict─────│   Extract · Sign     │
└─────────────────────┘                 │   Hash · DeDi lookup │
                                        └──────────────────────┘
```

### Components

| Directory | Description |
|-----------|-------------|
| `backend/` | Node.js + Fastify signing and verification server |
| `extension/` | Chrome extension — Photo, Video, Screen capture |
| `verify/` | Static site: landing page, `/verify`, `/sign` |

---

## Tech stack

- **Backend** — Node.js 22.5+ (uses the built-in `node:sqlite`), [Fastify](https://fastify.dev), `@fastify/multipart`, `@fastify/swagger` (OpenAPI + Swagger UI at `/docs`, spec at `/openapi.json`)
- **Signing** — real **C2PA** (COSE_Sign1 / ES256) via [`@contentauth/c2pa-node`](https://opensource.contentauthenticity.org/) — no hand-rolled signing or custom container
- **Keys** — EC P-256 CA→leaf chain generated with `openssl` + `node:crypto`
- **Trust** — DeDi-anchored verdict (signer key compared to the [DeDi.global](https://dedi.global) record); see [TRUST_MODEL.md](./TRUST_MODEL.md)
- **Storage** — SQLite (`node:sqlite`) for verify-hash records (durable, with retention)
- **Frontend** — plain HTML, CSS, JavaScript — no build step, no framework
- **Verify crypto** — in-browser C2PA read via [`@contentauth/c2pa-web`](https://opensource.contentauthenticity.org/) (WASM) for content integrity with **no upload**; the forgery-proof key-binding is confirmed server-side
- **Deployment** — [Railway](https://railway.app)

---

## Run it locally

Everything runs on your machine. You can drive just the **API with `curl`**, or stand up the **full UI**.

### Prerequisites

- **Node.js 22.5+** — the backend uses the built-in `node:sqlite`.
- **OpenSSL on your `PATH`** — the backend generates its EC P-256 signing chain with it on first run (`backend/src/keys/chain.js`). Pre-installed on most macOS/Linux systems (`openssl version` to check).
- DeDi is **optional** locally — see [Getting an `authentic` verdict](#getting-an-authentic-verdict-locally) below.

### 1. Start the backend

```bash
cd backend
npm install
node server.js          # http://localhost:3000
```

On first run it generates an EC P-256 CA→leaf chain in `backend/.keys/`. With **no `.env`** it runs in dev mode (no DeDi, CAPTCHA disabled) and logs a one-line warning that `/sign` is unprotected — expected for local.

Browse the API at **`http://localhost:3000/docs`** (Swagger UI; raw spec at `/openapi.json`). These are served by the **backend** — not the `:8080` verify site, where they 404.

### 2. Test the API directly (fastest — no browser, no CORS)

```bash
# sign a file → the verify hash is returned in a response header
curl -s -D- -o signed.jpg -F file=@your-photo.jpg http://localhost:3000/sign | grep -i x-verify-hash

# verify the signed file (upload)
curl -s -F file=@signed.jpg http://localhost:3000/verify
# → {"verdict":"untrusted",...}   (see the DeDi caveat for "authentic")

# verify by hash (the share-link path)
curl -s http://localhost:3000/verify/<hash-from-the-header>
```

Flip a byte in `signed.jpg` → `tampered`; an unsigned file → `unsigned`.

### 3. Run the full UI (verify + sign pages)

The static clients default to the **production** backend, so for local you must point them at `localhost` **and** enable CORS for the verify origin.

1. **Point the clients at your local backend:**
   - `verify/verify/verify.js` (top): `const BACKEND_URL = window.TRUECAPTURE_BACKEND || 'http://localhost:3000';`
   - `verify/sign/index.html` (inline `<script>` near the top): `const BACKEND_URL = 'http://localhost:3000';`
2. **Start the backend allowing the verify origin** (CORS is off by default):
   ```bash
   cd backend && CORS_ORIGINS=http://localhost:8080 node server.js
   ```
3. **Serve the verify site:**
   ```bash
   cd verify
   npm install
   npm run vendor        # builds the in-browser C2PA reader (c2pa-web bundle + WASM)
   npm start             # http://localhost:8080
   ```
4. Open `http://localhost:8080/verify`, drop `signed.jpg` → **"Content intact · signed"** (read in your browser, no upload) → click **Confirm signer with DeDi** for the server verdict.

> The **sign page on desktop** shows a "use the extension" message (live capture is mobile/extension). On desktop, create signed files via `curl` (step 2) or the extension.

### 4. Chrome extension (optional)

`chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/`. In the popup set **Backend URL** = `http://localhost:3000` and **Verify site URL** = `http://localhost:8080`.

### Getting an `authentic` verdict locally

Without DeDi, a correctly-signed, intact file verifies as **`untrusted`** — there is no published key to bind it to. The verdict only reaches **`authentic`** when the signer's key is live on DeDi.global. To enable it, set **all three** in `backend/.env` (all or none — partial config refuses to start):

```env
DEDI_API_KEY=your_dedi_api_key
DEDI_NAMESPACE=your-namespace
DEDI_RECORD_ID=your-key-record
```

The key publishes on the next boot; verify then returns `authentic`. See [TRUST_MODEL.md](./TRUST_MODEL.md) for why.

---

## Run it in prod

TrueCapture runs as **two services** — a Node backend (signing + verification) and the static verify/sign site. The reference deployment uses Railway, but any Node 22.5+ host plus a static host works.

| Service | Directory | Example domain |
|---------|-----------|----------------|
| Backend (Fastify) | `backend/` | `api.yourdomain.com` |
| Verify site (static) | `verify/` | `www.yourdomain.com` |

### 1. Backend environment

Set these on the backend service (full template in [`.env.example`](.env.example)):

| Variable | Purpose |
|----------|---------|
| `ORG_NAME`, `ORG_URL` | Your org identity — embedded as the C2PA claim generator + signer entity in every manifest. |
| `DEDI_API_KEY`, `DEDI_NAMESPACE`, `DEDI_RECORD_ID` | DeDi registration — **set all three, or none** (partial config refuses to start). Required for `authentic` verdicts; the signing key publishes on boot. |
| `DEDI_REGISTRY` | Registry name (default `signing-keys`). |
| `VERIFY_BASE_URL` | e.g. `https://www.yourdomain.com/verify` — returned to clients as the `X-Verify-URL` share link. |
| `CORS_ORIGINS` | **Required for the web UI** — your verify site origin(s), comma-separated, so the browser can call the API cross-origin. |
| `ALLOWED_ORIGINS` | Optional exact-match Origin allowlist for `/sign`. ⚠️ The Chrome extension's `chrome-extension://…` origin is blocked if you set this — leave unset if you rely on the extension. |
| `CAPTCHA_PROVIDER`, `CAPTCHA_SITE_KEY` | Public CAPTCHA config served to clients via `GET /config` (`turnstile` or `hcaptcha`). |
| `CAPTCHA_SECRET`, `CAPTCHA_VERIFY_URL` | Server-side CAPTCHA enforcement on `/sign`. Set **all four** to protect the keyless public signer; unset = no CAPTCHA (a startup warning is logged). |
| `TRUST_PROXY` | `true` behind a CDN/load balancer so the rate limiter keys on the real client IP, not the proxy's. |
| `RATE_LIMIT_MAX` | Max `/sign`+`/verify` requests per IP per minute (default `120`). |
| `RETENTION_MS` | Prune stored verify records older than this (unset = kept forever; pruned records' share links stop resolving). |
| `MAX_FILE_SIZE` | Max upload size in bytes (default 50 MB). |
| `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URI` | Optional — enables `POST /sign/session` for authenticated-user signing (mobile wallets etc.). |
| `PORT`, `HOST` | Listen address (default `3000` / `0.0.0.0`). |

### 2. Signing keys (persist them!)

On first boot the backend generates an EC P-256 CA→leaf chain in `backend/.keys/` (needs `openssl`). **Mount `backend/.keys/` on a persistent volume** — regenerating the key changes your published identity and breaks verification of everything signed before. To supply your own chain, place `chain.pem`, `leaf.key`, and `ca.crt` there (commands in [DEPLOY_YOUR_OWN.md](DEPLOY_YOUR_OWN.md)).

### 3. Register your key on DeDi.global

Create a DeDi account → namespace → registry → key record, and set the three `DEDI_*` vars. The backend publishes the leaf certificate on boot so any verifier can bind signatures to your org (see [TRUST_MODEL.md](./TRUST_MODEL.md)). **Without this, verdicts cap at `untrusted`.**

### 4. Point the clients at your backend, then build + serve the site

The static clients default to `https://api.truecapture.global`. Set `BACKEND_URL` in `verify/verify/verify.js` and `verify/sign/index.html` to your backend domain. Then:

```bash
cd verify && npm ci && npm run vendor && npm start
```

`npm run vendor` (the c2pa-web bundle + WASM for in-browser verification) **must run at build time**. Any static host works — serve `verify/` with the SPA rewrites in `verify/serve.json`.

### 5. Chrome extension (optional)

Set **Backend URL** + **Verify site URL** in the popup (or the `backendUrl`/`webUrl` defaults in `extension/capture.js`/`popup.js`). If you enable CAPTCHA, add your verify domain to the extension manifest's `content_security_policy.extension_pages` → `frame-src`.

### 6. Hardening checklist

- [ ] HTTPS on both services.
- [ ] `CORS_ORIGINS` set to your verify origin (and nothing broader).
- [ ] CAPTCHA configured (all four vars) so the keyless `/sign` isn't open to abuse.
- [ ] `TRUST_PROXY=true` if behind a CDN/load balancer.
- [ ] `backend/.keys/` on a persistent volume.
- [ ] All three `DEDI_*` set (or the backend refuses to start), and the key shows live on DeDi.
- [ ] A backup/rotation plan for the signing key before the 825-day leaf expires.
- [ ] Decide whether `/docs` + `/openapi.json` should be public; restrict them at the proxy if not.

→ Full step-by-step (Railway) walkthrough: **[DEPLOY_YOUR_OWN.md](DEPLOY_YOUR_OWN.md)**.

---

## Running your own instance

Any newsroom or organisation can fork this repository and run a fully independent instance under their own domain and keypair. Your journalists sign as **"Signed by [Your Org]"** — there is no dependency on TrueCapture infrastructure, keys, or accounts.

→ **[DEPLOY_YOUR_OWN.md](DEPLOY_YOUR_OWN.md)**

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).

---

## Built by

**Tanushka Vaid**, Chief of Staff, [CDPI](https://cdpi.dev) · [tanushka@cdpi.dev](mailto:tanushka@cdpi.dev)

Built on the [C2PA open standard](https://c2pa.org) · Keys on [DeDi.global](https://dedi.global) · Deployed on [Railway](https://railway.app)
