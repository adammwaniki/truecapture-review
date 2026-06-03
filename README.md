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
   - Signs it as **COSE_Sign1 / ES256** with the EC P-256 leaf key via [`@contentauth/c2pa-node`](https://opensource.contentauthenticity.org/) (with a `c2patool` fallback) — no hand-rolled signing or custom container
   - Embeds the manifest into the file per the C2PA spec, stores the verify hash **durably** (SQLite), and returns the signed file + a short verify URL

3. **Register** — the signer's public key is registered on [DeDi.global](https://dedi.global), a decentralised public key directory. The manifest embeds the DeDi record ID so any verifier can independently confirm the key belongs to the claimed organisation.

4. **Share** — the journalist pastes the verify URL (`truecapture.global/verify/<hash>`) into their post caption or article. Readers tap it for an instant verdict.

5. **Verify** — opening a file on the verify page reads it **in your browser** to check it is intact and signed (no upload). Confirming that the signer is the claimed organisation is an explicit step that re-checks the signer's key against the DeDi registry on the backend. A shared verify link (`/verify/<hash>`) is checked server-side. The verdict is **DeDi-anchored** — `authentic`, `forged`, `untrusted`, `tampered`, or `unsigned` — see [TRUST_MODEL.md](./TRUST_MODEL.md).

### C2PA compliance

TrueCapture implements the [C2PA specification](https://c2pa.org) — the same provenance standard used by Adobe Content Credentials, Google, Sony, the BBC, and the Microsoft Azure AI Content Safety team. Signed files are compatible with any C2PA-aware toolchain.

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

- **Backend** — Node.js 20+, [Fastify](https://fastify.dev), `@fastify/multipart`, `@fastify/swagger` (OpenAPI + Swagger UI at `/docs`, spec at `/openapi.json`)
- **Signing** — real **C2PA** (COSE_Sign1 / ES256) via [`@contentauth/c2pa-node`](https://opensource.contentauthenticity.org/) with a `c2patool` fallback — no hand-rolled signing or custom container
- **Keys** — EC P-256 CA→leaf chain generated with `openssl` + `node:crypto`
- **Trust** — DeDi-anchored verdict (signer key compared to the [DeDi.global](https://dedi.global) record); see [TRUST_MODEL.md](./TRUST_MODEL.md)
- **Storage** — SQLite (`node:sqlite`) for verify-hash records (durable, with retention)
- **Frontend** — plain HTML, CSS, JavaScript — no build step, no framework
- **Verify crypto** — in-browser C2PA read via [`@contentauth/c2pa-web`](https://opensource.contentauthenticity.org/) (WASM) for content integrity with **no upload**; the forgery-proof key-binding is confirmed server-side
- **Deployment** — [Railway](https://railway.app)

---

## Quick start (local)

### Prerequisites

- Node.js 20+
- A [DeDi.global](https://dedi.global) account and API key (free)

### 1. Clone and install

```bash
git clone https://github.com/TanushkaCDPI/truecapture.git
cd truecapture/backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — add your DeDi API key, org name, and domain
```

See [`.env.example`](.env.example) for all required variables.

### 3. Start the backend

```bash
node server.js
```

On first run the server auto-generates an EC P-256 CA→leaf certificate chain in `backend/.keys/` and registers the public key on DeDi.global.

### 4. Serve the verify site

```bash
cd ../verify
npm install
npm run vendor   # builds the in-browser C2PA reader (c2pa-web bundle + WASM)
npm start
# Runs at http://localhost:8080
```

### 5. Load the Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder

Update `BACKEND_URL` in `extension/background.js` to point to your local backend.

---

## Deployment

TrueCapture is deployed as two Railway services:

| Service | Directory | Domain |
|---------|-----------|--------|
| Backend | `backend/` | `api.truecapture.global` |
| Verify site | `verify/` | `www.truecapture.global` |

See [DEPLOY_YOUR_OWN.md](DEPLOY_YOUR_OWN.md) for full step-by-step instructions to run your own branded instance.

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
