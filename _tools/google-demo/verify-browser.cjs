#!/usr/bin/env node
/* Render the built Google export post in headless Chrome and verify all 7 figures,
   tabs, pills, inline prose links, themes, and SVG viewBox bounds at desktop and phone widths. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

let playwright;
try {
  playwright = require('playwright');
} catch {
  const runtime = process.env.CODEX_RUNTIME_NODE_MODULES ||
    path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
  playwright = require(path.join(runtime, 'playwright'));
}
const { chromium } = playwright;
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(__dirname, '../..');
const SITE = path.join(ROOT, '_site');
const BASE = '/blogs';
const SHOT_DIR = process.env.SHOT_DIR || '';
const ids = [
  'goog-ads', 'goog-culture', 'goog-rhythm', 'goog-sessions',
  'goog-geo', 'goog-pings', 'goog-account',
];

function serveSite() {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let clean = decodeURIComponent(req.url.split('?')[0]);
      if (clean === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      if (clean.startsWith(BASE)) clean = clean.slice(BASE.length) || '/';
      let file = path.join(SITE, clean);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(SITE) || !fs.existsSync(file)) {
        res.writeHead(404); res.end('Not found'); return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function settle(page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function checkBounds(page, label) {
  const problems = await page.evaluate(() => {
    const bad = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) {
      bad.push(`Document overflows (${document.documentElement.scrollWidth} > ${innerWidth})`);
    }
    for (const svg of document.querySelectorAll('figure.goog svg')) {
      const v = svg.viewBox.baseVal;
      const figId = svg.closest('figure').id;
      const boxes = [];
      for (const el of svg.querySelectorAll('text')) {
        const b = el.getBBox();
        if (b.width === 0 && b.height === 0) continue;
        if (b.x < -3 || b.y < -3 || b.x + b.width > v.width + 3 || b.y + b.height > v.height + 3) {
          bad.push(`${figId}: text "${el.textContent}" outside viewBox (${b.x.toFixed(1)},${b.y.toFixed(1)} ${b.width.toFixed(1)}x${b.height.toFixed(1)} vs ${v.width}x${v.height})`);
        }
        boxes.push({ text: el.textContent, x: b.x, y: b.y, w: b.width, h: b.height });
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (a.x + 2 < b.x + b.w && a.x + a.w - 2 > b.x && a.y + 3 < b.y + b.h && a.y + a.h - 3 > b.y) {
            bad.push(`${figId}: text overlap "${a.text}" vs "${b.text}"`);
          }
        }
      }
      if ([...svg.querySelectorAll('*')].some(e => [...e.attributes].some(a => a.name !== 'href' && /NaN|Infinity/.test(a.value)))) {
        bad.push(`${figId}: Nonfinite SVG geometry`);
      }
    }
    return bad;
  });
  assert.deepEqual(problems, [], `Geometry check failed at ${label}`);
}

(async () => {
  assert(fs.existsSync(path.join(SITE, 'index.html')), 'Build _site first with bundle exec jekyll build');
  const server = await serveSite();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}${BASE}/2026/11/24/reading-my-own-google-export.html`;
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('#goog-account.ready');
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('figure.goog.ready').count(), 7);
    assert.equal(await page.locator('.goog-error').count(), 0);

    // Check default views across light/dark and desktop/mobile widths
    for (const [theme, w] of [['light', 1440], ['dark', 1440], ['light', 390], ['dark', 390], ['light', 320]]) {
      await page.setViewportSize({ width: w, height: 1000 });
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      await settle(page);
      await checkBounds(page, `${w}-${theme}`);
    }

    // Optional screenshots of all figures at desktop light + dark for visual inspection
    if (SHOT_DIR) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
      await settle(page);
      for (const id of ids) {
        await page.locator(`#${id}`).screenshot({ path: path.join(SHOT_DIR, `${id}-light.png`) });
      }
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
      await settle(page);
      await page.locator('#goog-ads').screenshot({ path: path.join(SHOT_DIR, 'goog-ads-dark.png') });
      await page.locator('#goog-geo').screenshot({ path: path.join(SHOT_DIR, 'goog-geo-dark.png') });
      await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    }

    // Exercise every tab choice at 1440px, 390px, and 320px
    for (const w of [1440, 390, 320]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const id of ids) {
        const choices = await page.locator(`#${id} [data-choice]`).evaluateAll(bs => bs.map(b => b.dataset.choice));
        for (const choice of choices) {
          await page.locator(`#${id} [data-choice="${choice}"]`).click();
          await settle(page);
          await checkBounds(page, `${w}-${id}-${choice}`);
        }
      }
    }

    // Exercise interactive sub-pills across figures
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.locator('#goog-rhythm [data-choice="dial"]').click();
    await settle(page);
    for (const sel of ['#goog-rhythm [data-pri]', '#goog-rhythm [data-ovl]']) {
      const n = await page.locator(sel).count();
      for (let i = 0; i < n; i++) {
        await page.locator(sel).nth(i).click();
        await settle(page);
        await checkBounds(page, `pill-${sel}-${i}`);
      }
    }
    await page.locator('#goog-sessions [data-choice="xrays"]').click();
    await settle(page);
    for (let i = 0; i < 6; i++) {
      await page.locator('#goog-sessions [data-xr]').nth(i).click();
      await settle(page);
      await checkBounds(page, `xray-${i}`);
    }

    // Exercise every inline action link in prose
    const nActs = await page.locator('a.act[href^="#goog-"]').count();
    assert(nActs >= 20, `Expected >=20 action links, found ${nActs}`);
    for (let i = 0; i < nActs; i++) {
      await page.locator('a.act[href^="#goog-"]').nth(i).click();
      await settle(page);
      await checkBounds(page, `act-${i}`);
    }

    // Verify home page index row & series block
    await page.goto(`http://127.0.0.1:${port}${BASE}/`, { waitUntil: 'networkidle' });
    const firstItem = page.locator('.post-index > li').first();
    assert((await firstItem.innerText()).includes('Reading my own Google export'));
    assert.equal(await firstItem.locator('svg.post-thumb').count(), 1);

    assert.deepEqual(errors, []);
    console.log('Browser checks: all 7 figures, 21 tabs, pills, prose links, themes, and viewBox bounds passed.');
  } finally {
    await browser.close();
    server.close();
  }
})();
