import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ensureChain } from '../src/keys/chain.js';
import { createC2pa } from '../src/c2pa/index.js';
import { createMemoryStore } from '../src/store/memory.js';
import { systemClock } from '../src/clock.js';
import { createApp } from '../src/app.js';

// The full-stack journey: the REAL backend + the REAL verify page together.
// Signs a file through the live /sign endpoint, then drops it on the verify page,
// which uploads it for the single combined check (real c2pa read + cert
// extraction + DeDi key compare) and renders the 2-axis result → Authentic.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', 'verify');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

let backend;
let backendOrigin;
let web;
let webOrigin;
let signedJpeg;

test.beforeAll(async () => {
  const keysDir = join(await mkdtemp(join(tmpdir(), 'fs-k-')), 'k');
  const keys = ensureChain(keysDir);
  const leafPem = readFileSync(join(keysDir, 'leaf.crt'), 'utf8');
  const identity = { org: { name: 'TrueCapture', url: 'https://www.truecapture.global' }, dedi: { record_id: 'rec-1', namespace: 'truecapture', registry: 'signing-keys' } };
  // Fake DeDi publishes the org's OWN signing key as live → verify reaches `authentic`.
  const dedi = {
    async lookup({ recordId }) {
      return recordId === 'rec-1'
        ? { recordId, state: 'live', publicKey: leafPem, entity: { name: 'TrueCapture', url: 'https://www.truecapture.global' } }
        : null;
    },
  };
  backend = createApp({ c2pa: createC2pa(keys), store: createMemoryStore(), clock: systemClock(), dedi, identity, corsOrigin: true });
  backendOrigin = await backend.listen({ port: 0, host: '127.0.0.1' });

  // Sign a real file THROUGH the live /sign endpoint.
  const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 7, g: 8, b: 9 } } }).jpeg().toBuffer();
  const fd = new FormData();
  fd.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'p.jpg');
  const signRes = await fetch(`${backendOrigin}/sign`, { method: 'POST', body: fd });
  signedJpeg = Buffer.from(await signRes.arrayBuffer());

  web = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://x');
      const f = join(ROOT, pathname.endsWith('/') ? `${pathname}index.html` : pathname);
      const b = await readFile(f);
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
      res.end(b);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  await new Promise((r) => web.listen(0, '127.0.0.1', r));
  webOrigin = `http://127.0.0.1:${web.address().port}`;
});

test.afterAll(async () => {
  if (backend) await backend.close();
  if (web) web.close();
});

test('full stack: live sign → verify page upload → combined check → authentic (L-1)', async ({ page }) => {
  await page.addInitScript((origin) => { window.TRUECAPTURE_BACKEND = origin; }, backendOrigin);
  await page.goto(`${webOrigin}/verify/index.html`);
  await page.setInputFiles('#file-input', { name: 'signed.jpg', mimeType: 'image/jpeg', buffer: signedJpeg });

  // One upload → live /verify (real c2pa read + extract-cert + DeDi key compare).
  await expect(page.locator('#verdict-title')).toHaveText('Authentic', { timeout: 20000 });
  await expect(page.locator('#sig-status')).toContainText('Valid');
  await expect(page.locator('#signer-status')).toContainText('Verified');
  await expect(page.locator('#dedi-section')).toContainText('TrueCapture');
});
