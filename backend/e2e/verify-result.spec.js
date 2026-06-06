import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Drives the REAL verify page in headless Chromium with the backend mocked, and
// asserts the new single-upload combined result: a plain-language headline plus
// the two explicit lines (Signature / Signer). The page uploads the file and
// renders whatever the server returns — no in-browser read, no Confirm step.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'verify');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const BACKEND = 'https://api.truecapture.global';
const TINY = Buffer.from([0xff, 0xd8, 0xff, 0xd9]); // content irrelevant — the server is mocked

let server;
let origin;

test.beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://x');
      const file = join(ROOT, pathname.endsWith('/') ? `${pathname}index.html` : pathname);
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(() => server && server.close());

// Drop a file; the mocked /verify returns `result`. Returns a POST counter.
async function drop(page, result) {
  let posts = 0;
  await page.route(`${BACKEND}/**`, (route) => {
    if (route.request().method() === 'POST') posts += 1;
    route.fulfill({ json: result });
  });
  await page.goto(`${origin}/verify/index.html`);
  await page.setInputFiles('#file-input', { name: 'f.jpg', mimeType: 'image/jpeg', buffer: TINY });
  return () => posts;
}

test('valid signature + verified signer → Authentic, both lines, entity', async ({ page }) => {
  await drop(page, { signature: 'valid', signer: 'verified', verdict: 'authentic', entity: { name: 'BBC', url: 'https://bbc.com' } });
  await expect(page.locator('#verdict-title')).toHaveText('Authentic');
  await expect(page.locator('#verdict-banner')).toHaveClass(/authentic/);
  await expect(page.locator('#sig-status')).toContainText('Valid');
  await expect(page.locator('#signer-status')).toContainText('Verified');
  await expect(page.locator('#dedi-section')).toContainText('BBC');
  await expect(page.locator('#dedi-section a')).toHaveAttribute('href', 'https://bbc.com/');
});

test('valid signature + UNREGISTERED signer → clear headline (the reported case), not "Not signed"', async ({ page }) => {
  await drop(page, { signature: 'valid', signer: 'unregistered', verdict: 'untrusted', entity: null });
  await expect(page.locator('#verdict-title')).toHaveText('Valid signature — signer not registered on DeDi');
  await expect(page.locator('#verdict-banner')).toHaveClass(/untrusted/);
  await expect(page.locator('#sig-status')).toContainText('Valid');
  await expect(page.locator('#signer-status')).toContainText('Not registered');
});

test('valid signature + key mismatch → Forged, unsafe entity link stripped (M3)', async ({ page }) => {
  await drop(page, { signature: 'valid', signer: 'mismatch', verdict: 'forged', entity: { name: 'EvilCorp', url: 'javascript:alert(1)' } });
  await expect(page.locator('#verdict-title')).toContainText('Forged');
  await expect(page.locator('#signer-status')).toContainText('Does NOT match');
  await expect(page.locator('#dedi-section')).toContainText('EvilCorp');
  await expect(page.locator('#dedi-section a')).toHaveCount(0);
});

test('content modified still reports the signer line', async ({ page }) => {
  await drop(page, { signature: 'modified', signer: 'verified', verdict: 'tampered', entity: { name: 'BBC' } });
  await expect(page.locator('#verdict-title')).toContainText('modified');
  await expect(page.locator('#sig-status')).toContainText('changed');
  await expect(page.locator('#signer-status')).toContainText('Verified');
});

test('unsigned → "Not signed", no signer line, but the file IS uploaded for the one combined check', async ({ page }) => {
  const posts = await drop(page, { signature: 'none', signer: 'none', verdict: 'unsigned', entity: null });
  await expect(page.locator('#verdict-title')).toHaveText('Not signed');
  await expect(page.locator('#signer-row')).toBeHidden();
  expect(posts()).toBeGreaterThan(0);
});
