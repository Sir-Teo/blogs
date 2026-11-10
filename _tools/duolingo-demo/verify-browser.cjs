/* Render the Duolingo post in headless Chrome and verify all 7 figures, tabs, prose links, themes, and SVG viewBox bounds at desktop and phone widths. */
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
const ids = ['duo-run', 'duo-ladder', 'duo-calendar', 'duo-clock', 'duo-receipts', 'duo-courses', 'duo-now'];

function renderPostHtml() {
  const raw = fs.readFileSync(path.join(ROOT, '_posts/2026-11-09-reading-my-own-duolingo-export.markdown'), 'utf8');
  const [, fm, bodyRaw] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const title = fm.match(/^title:\s*"(.*)"/m)[1];
  const body = bodyRaw
    .replace(/\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}/g, '/blogs$1')
    .split(/\n\n+/)
    .map(block => {
      const s = block.trim();
      if (!s) return '';
      if (s.startsWith('<figure') || s.startsWith('<details') || s.startsWith('</details')) return s;
      if (s.startsWith('## ')) return `<h2>${s.slice(3)}</h2>`;
      return `<p>${s.replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="preload" as="font" type="font/woff2" href="/blogs/assets/fonts/newsreader-latin.woff2" crossorigin>
  <link rel="stylesheet" href="/blogs/assets/css/main.css">
  <link rel="stylesheet" href="/blogs/assets/css/duolingo.css">
  <script defer src="/blogs/assets/js/site.js"></script>
  <script defer src="/blogs/assets/js/duolingo.js"></script>
</head>
<body>
  <header class="site-header">
    <a class="site-name" href="/blogs/">Teo's blog</a>
  </header>
  <main id="main">
    <article class="post">
      <header class="post-head">
        <h1>${title}</h1>
        <p class="meta"><time datetime="2026-11-09">November 9, 2026</time><span>4 min read</span></p>
      </header>
      <div class="post-content">
        ${body}
      </div>
    </article>
  </main>
</body>
</html>`;
}

function renderThumbHtml() {
  const thumbFile = fs.readFileSync(path.join(ROOT, '_includes/post-thumb.html'), 'utf8');
  const m = thumbFile.match(/when 'reading-my-own-duolingo-export'\s*-%\}([\s\S]*?)\{%-\s*when /);
  return `<!doctype html><html><head><link rel="stylesheet" href="/blogs/assets/css/main.css"></head><body><main><div class="home"><ol class="post-index"><li><div class="post-thumb-wrap">${m ? m[1] : ''}</div><div class="post-index-body"><h2 class="post-index-head"><span class="post-index-title">Reading my own Duolingo export</span></h2><p class="meta post-index-meta"><span class="post-index-figs">7 figures</span></p></div></li></ol></div></main></body></html>`;
}

function serveWorkspace() {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
  };
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const clean = decodeURIComponent(req.url.split('?')[0]).replace(/^\/blogs/, '') || '/';
      if (clean === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      if (clean === '/' || clean === '/index.html') {
        res.writeHead(200, { 'Content-Type': mime['.html'] });
        res.end(renderThumbHtml());
        return;
      }
      if (clean.endsWith('reading-my-own-duolingo-export.html')) {
        res.writeHead(200, { 'Content-Type': mime['.html'] });
        res.end(renderPostHtml());
        return;
      }
      const file = path.join(ROOT, clean);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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
    for (const svg of document.querySelectorAll('figure.duo svg')) {
      const v = svg.viewBox.baseVal;
      const figId = svg.closest('figure').id;
      const boxes = [];
      for (const el of svg.querySelectorAll('text')) {
        const b = el.getBBox();
        if (b.width === 0 && b.height === 0) continue;
        if (b.x < -2 || b.y < -2 || b.x + b.width > v.width + 2 || b.y + b.height > v.height + 2) {
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
  const server = await serveWorkspace();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/blogs/2026/11/09/reading-my-own-duolingo-export.html`;
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(url);
    await page.waitForSelector('#duo-now.ready');
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('figure.duo.ready').count(), 7);
    assert.equal(await page.locator('.duo-error').count(), 0);

    const shotsDir = process.env.SHOTS_DIR;
    if (shotsDir) {
      fs.mkdirSync(shotsDir, { recursive: true });
      await page.locator('#duo-run').screenshot({ path: path.join(shotsDir, 'duo-run-v3.png') });
      await page.locator('#duo-ladder').screenshot({ path: path.join(shotsDir, 'duo-ladder-v3.png') });
      await page.locator('#duo-now [data-choice="skills"]').click();
      await settle(page);
      await page.locator('#duo-now').screenshot({ path: path.join(shotsDir, 'duo-now-skills-v3.png') });
      await page.locator('#duo-now [data-choice="path"]').click();
      await settle(page);
    }

    for (const [theme, w] of [['light', 1440], ['dark', 1440], ['light', 390], ['dark', 390], ['light', 320]]) {
      await page.setViewportSize({ width: w, height: 1000 });
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      await settle(page);
      await checkBounds(page, `${w}-${theme}`);
    }

    // Exercise every tab choice at 1440px, 390px, and 320px.
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

    // Exercise every inline action link in the prose.
    await page.setViewportSize({ width: 1200, height: 900 });
    const nActs = await page.locator('a.act[href^="#duo-"]').count();
    assert(nActs >= 14, `Expected at least 14 action links, found ${nActs}`);
    for (let i = 0; i < nActs; i++) {
      await page.locator('a.act[href^="#duo-"]').nth(i).click();
      await settle(page);
      await checkBounds(page, `act-${i}`);
    }

    // Verify the home page index thumbnail renders cleanly.
    await page.goto(`http://127.0.0.1:${port}/blogs/`);
    const firstItem = page.locator('.post-index > li').first();
    assert((await firstItem.innerText()).includes('Reading my own Duolingo export'));
    assert.equal(await firstItem.locator('svg.post-thumb').count(), 1);

    assert.deepEqual(errors, []);
    console.log('Browser checks: all 7 figures, tabs, prose links, themes, and viewBox bounds passed.');
  } finally {
    await browser.close();
    server.close();
  }
})();
