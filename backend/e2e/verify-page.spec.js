import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serve the real static verify/ site over HTTP (ES modules need http, not file://)
// and drive the verify page in headless Chromium with the backend mocked.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'verify');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.map': 'application/json' };
const BACKEND = 'https://api.truecapture.global';

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
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(() => server.close());

const mockVerdict = (page, body) => page.route(`${BACKEND}/**`, (route) => route.fulfill({ json: body }));

test('share link renders the REAL authentic verdict + a safe entity link (C1/C2/M3)', async ({ page }) => {
  await mockVerdict(page, { verdict: 'authentic', entity: { name: 'BBC', url: 'https://bbc.com' } });
  await page.goto(`${origin}/verify/index.html?hash=aaaaaaaaaaaaaaaa`);
  await expect(page.locator('#verdict-title')).toHaveText('Authentic');
  await expect(page.locator('#verdict-banner')).toHaveClass(/authentic/);
  await expect(page.locator('#dedi-section')).toContainText('BBC');
  await expect(page.locator('#dedi-section a')).toHaveAttribute('href', 'https://bbc.com/');
});

test('forged verdict strips an unsafe entity link (M3)', async ({ page }) => {
  await mockVerdict(page, { verdict: 'forged', entity: { name: 'EvilCorp', url: 'javascript:alert(1)' } });
  await page.goto(`${origin}/verify/index.html?hash=bbbbbbbbbbbbbbbb`);
  await expect(page.locator('#verdict-title')).toHaveText('Forged');
  await expect(page.locator('#dedi-section')).toContainText('EvilCorp');
  await expect(page.locator('#dedi-section a')).toHaveCount(0);
  expect(await page.locator('#dedi-section').innerHTML()).not.toContain('javascript:');
});

test('no hardcoded authenticity — a tampered result renders as Tampered', async ({ page }) => {
  await mockVerdict(page, { verdict: 'tampered' });
  await page.goto(`${origin}/verify/index.html?hash=cccccccccccccccc`);
  await expect(page.locator('#verdict-title')).toHaveText('Tampered');
});

test('selecting a file does NOT auto-upload (privacy default, H2)', async ({ page }) => {
  // The new default reads the file in-browser; nothing is POSTed unless the user
  // clicks "Confirm signer with DeDi". A result still renders (either an
  // in-browser verdict, or a "couldn't read" state if the vendored reader is
  // absent) — but no upload happens. The signed-file + confirm path is covered
  // end-to-end in verify-browser.spec.js.
  let posts = 0;
  await page.route(`${BACKEND}/**`, (route) => {
    if (route.request().method() === 'POST') posts += 1;
    route.fulfill({ json: { verdict: 'unsigned' } });
  });
  await page.goto(`${origin}/verify/index.html`);
  await page.setInputFiles('#file-input', { name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  await expect(page.locator('#result-section')).toBeVisible({ timeout: 20000 });
  expect(posts).toBe(0);
});
