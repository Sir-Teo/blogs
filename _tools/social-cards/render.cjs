#!/usr/bin/env node
/*
 * Renders a 1200x630 social preview card for every post into assets/social/.
 *
 * Reads the built site (default _site/, or pass a directory), so build first:
 *   bundle exec jekyll build && node _tools/social-cards/render.cjs
 *
 * Each card reuses the post's schematic thumbnail from the home page, its
 * title and its series name, styled by the site's own main.css.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const site = path.resolve(process.argv[2] || path.join(root, '_site'));
const out = path.join(root, 'assets', 'social');
const BASE = '/blogs';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' };

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!p.startsWith(BASE)) { res.writeHead(404); return res.end(); }
      p = path.join(site, p.slice(BASE.length));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!p.startsWith(site) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve(server));
  });
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function card(origin, post) {
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="${origin}${BASE}/assets/css/main.css">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; background: var(--bg); }
  .card { box-sizing: border-box; width: 1200px; height: 630px; padding: 72px 80px 64px;
    display: grid; grid-template-columns: 1fr 380px; grid-template-rows: auto 1fr auto; column-gap: 64px; }
  .site { grid-column: 1 / -1; font: 500 26px/1 var(--sans); color: var(--fg-2); letter-spacing: -0.01em; }
  .site span { color: var(--fg-3); font-weight: 400; }
  h1 { align-self: center; margin: 0; font: 500 66px/1.1 var(--serif); letter-spacing: -0.025em; color: var(--fg);
    text-wrap: balance; }
  .thumb { align-self: center; justify-self: end; width: 380px; }
  .thumb .post-thumb-wrap, .thumb svg { width: 380px !important; height: auto !important; display: block; }
  .thumb svg :is(rect, line, path, circle, polygon) { vector-effect: non-scaling-stroke; }
  .thumb svg .thumb-bg { stroke-width: 2px; }
  .thumb svg .thumb-grid, .thumb svg .thumb-wire, .thumb svg .thumb-wire-dash { stroke-width: 2px; }
  .thumb svg .thumb-ink, .thumb svg .thumb-ink-box, .thumb svg .thumb-stone-w { stroke-width: 2.5px; }
  .thumb svg .thumb-flow { stroke-width: 3.5px; }
  .thumb svg .thumb-flow-thin { stroke-width: 2.5px; }
  .thumb svg .thumb-node-ring { stroke-width: 3px; }
  .foot { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: end;
    font: 24px/1 var(--sans); color: var(--fg-3); border-top: 2px solid var(--line); padding-top: 26px; }
  .foot b { font-weight: 500; color: var(--accent); }
</style></head><body><div class="card">
  <div class="site">Teo’s blog${post.series ? ` <span>· ${esc(post.series)}</span>` : ''}</div>
  <h1>${esc(post.title)}</h1>
  <div class="thumb">${post.thumb}</div>
  <div class="foot"><span>${esc(post.meta)}</span><b>teozeng.dev/blogs</b></div>
</div></body></html>`;
}

(async () => {
  if (!fs.existsSync(path.join(site, 'index.html'))) {
    console.error(`No built site at ${site}. Run bundle exec jekyll build first.`);
    process.exit(1);
  }
  fs.mkdirSync(out, { recursive: true });
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

  await page.goto(`${origin}${BASE}/`, { waitUntil: 'networkidle' });
  const posts = await page.evaluate(() => [...document.querySelectorAll('.post-index > li')].map(li => {
    const a = li.querySelector('.post-index-link');
    const meta = [...li.querySelectorAll('.post-index-meta > time, .post-index-meta > span:not(.meta-links)')]
      .map(n => n.textContent.trim()).join(' · ');
    return { url: a.getAttribute('href'), title: a.textContent.trim(), thumb: li.querySelector('.post-thumb-wrap')?.outerHTML || '', meta };
  }));

  let made = 0;
  for (const post of posts) {
    const slug = post.url.replace(/\/$/, '').split('/').pop().replace(/\.html$/, '');
    // Read the series name and whether the post opts out of site branding from the post itself.
    await page.goto(origin + post.url, { waitUntil: 'domcontentloaded' });
    const info = await page.evaluate(() => ({
      neutral: !document.querySelector('meta[property="og:title"]'),
      series: document.querySelector('.series-title')?.textContent.trim() || ''
    }));
    if (info.neutral) { console.log(`skip ${slug} (neutral post)`); continue; }
    post.series = info.series;
    await page.setContent(card(origin, post), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, `${slug}.png`) });
    made++;
    console.log(`wrote assets/social/${slug}.png`);
  }
  await browser.close();
  server.close();
  console.log(`${made} cards`);
})();
