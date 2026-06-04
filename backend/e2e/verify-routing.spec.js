import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression: the verify page is served at the BARE `/verify` URL via a serve.json
// rewrite (no trailing slash, no index.html), so its <script>/<link> must resolve
// independently of the page URL — page-relative `verify.js` became `/verify.js`
// and 404'd, leaving the page inert. This server mirrors the serve.json rewrites
// and loads `/verify` directly to prove the script actually executes.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'verify');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.map': 'application/json' };
const REWRITES = { '/verify': '/verify/index.html', '/sign': '/sign/index.html', '/privacy': '/privacy/index.html', '/faq': '/faq/index.html', '/use-cases': '/use-cases/index.html' };
const HASH_PATH = /^\/verify\/[0-9a-f]{16,32}$/;

let server;
let origin;

test.beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    try {
      let { pathname } = new URL(req.url, 'http://x');
      if (REWRITES[pathname]) pathname = REWRITES[pathname]; // serve.json rewrites
      else if (HASH_PATH.test(pathname)) pathname = '/verify/index.html';
      else if (pathname.endsWith('/')) pathname += 'index.html';
      const body = await readFile(join(ROOT, pathname));
      res.writeHead(200, { 'content-type': MIME[extname(pathname)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(() => server && server.close());

test('the bare /verify URL (serve.json rewrite) loads its module + correct stylesheet', async ({ page }) => {
  const broken = [];
  page.on('requestfailed', (r) => broken.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) broken.push(`${r.status()} ${r.url()}`); });

  await page.goto(`${origin}/verify`); // the bare URL — the form that was broken

  // verify.js executed → it assigns window.handleFile (undefined if the script 404'd).
  await expect.poll(() => page.evaluate(() => typeof window.handleFile)).toBe('function');
  await expect(page.locator('#drop-zone')).toBeVisible();
  // The verify page's own assets must not 404.
  expect(broken.filter((u) => /verify\.js|styles\.css/.test(u))).toEqual([]);
});
