#!/usr/bin/env node
/* A local development server for Teo's blog emulating Jekyll's routes and layouts. */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');

let marked;
try {
  marked = require('marked').marked;
} catch {
  const runtime = process.env.CODEX_RUNTIME_NODE_MODULES ||
    path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
  marked = require(path.join(runtime, 'marked')).marked;
}

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const BASEURL = '/blogs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

function parseFrontMatter(fileContent) {
  const m = fileContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { data: {}, content: fileContent };
  const rawYaml = m[1], body = m[2];
  const data = {};
  let currentKey = null;

  for (const line of rawYaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (line.startsWith('  - ')) {
      if (currentKey) {
        if (!Array.isArray(data[currentKey])) data[currentKey] = [];
        data[currentKey].push(line.slice(4).trim().replace(/^['"]|['"]$/g, ''));
      }
      continue;
    }
    const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      let val = kv[2].trim();
      if (val === '>-' || val === '>' || val === '|') {
        data[currentKey] = '';
      } else if (val.startsWith('"') && val.endsWith('"')) {
        data[currentKey] = val.slice(1, -1);
      } else if (val.startsWith("'") && val.endsWith("'")) {
        data[currentKey] = val.slice(1, -1);
      } else if (val === 'null') {
        data[currentKey] = null;
      } else if (val === 'true') {
        data[currentKey] = true;
      } else if (val === 'false') {
        data[currentKey] = false;
      } else if (val.length > 0) {
        data[currentKey] = val;
      }
    } else if (currentKey && (line.startsWith('  ') || line.startsWith('\t'))) {
      if (typeof data[currentKey] === 'string') {
        data[currentKey] = (data[currentKey] ? data[currentKey] + ' ' : '') + trimmed;
      }
    }
  }
  return { data, content: body };
}

function resolveLiquid(text) {
  return text
    .replace(/\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}/g, `${BASEURL}$1`)
    .replace(/\{\{\s*"([^"]+)"\s*\|\s*relative_url\s*\}\}/g, `${BASEURL}$1`)
    .replace(/\{\{\s*site\.baseurl\s*\}\}/g, BASEURL)
    .replace(/\{\{\s*'([^']+)'\s*\|\s*file_exists\s*\}\}/g, 'true');
}

function renderPost(postPath) {
  const raw = fs.readFileSync(postPath, 'utf8');
  const { data, content: rawBody } = parseFrontMatter(raw);
  const resolvedBody = resolveLiquid(rawBody);

  // Use marked for markdown rendering
  const htmlContent = marked.parse(resolvedBody, {
    gfm: true,
    breaks: false,
  });

  const title = data.title || 'Post';
  const desc = data.description || '';
  const dateStr = data.date ? data.date.slice(0, 10) : '2026-11-09';
  const dObj = new Date(dateStr + 'T12:00:00Z');
  const dateFormatted = dObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  // Word count & read time
  const plainWords = rawBody.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round((plainWords + 115) / 230));

  const styles = (data.styles || []).map(s => `<link rel="stylesheet" href="${BASEURL}${s}">`).join('\n  ');
  const scripts = (data.scripts || []).map(s => `<script defer src="${BASEURL}${s}"></script>`).join('\n  ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>
    (function () {
      var t = null;
      try { t = localStorage.getItem('theme'); } catch (e) {}
      if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = t;
    })();
  </script>
  <meta name="color-scheme" content="light dark">
  <title>${title} · Teo's blog</title>
  <meta name="description" content="${desc.replace(/"/g, '&quot;')}">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cstyle%3Erect%7Bfill:%23171716%7Dpath%7Bfill:%23fcfbf9%7D@media(prefers-color-scheme:dark)%7Brect%7Bfill:%23ededeb%7Dpath%7Bfill:%23111112%7D%7D%3C/style%3E%3Crect x='1' y='1' width='14' height='14' rx='3.5'/%3E%3Cpath d='M4.2 4.6h7.6v1.45H8.85V12H7.15V6.05H4.2z'/%3E%3C/svg%3E">
  <link rel="preload" as="font" type="font/woff2" href="${BASEURL}/assets/fonts/newsreader-latin.woff2" crossorigin>
  <link rel="stylesheet" href="${BASEURL}/assets/css/main.css">
  <link rel="stylesheet" href="${BASEURL}/assets/vendor/katex/katex.min.css">
  <link rel="stylesheet" href="${BASEURL}/assets/css/math.css">
  <script defer id="site-math-core" src="${BASEURL}/assets/vendor/katex/katex.min.js"></script>
  <script defer src="${BASEURL}/assets/vendor/katex/auto-render.min.js"></script>
  <script defer src="${BASEURL}/assets/js/math.js"></script>
  ${styles}
  <script defer src="${BASEURL}/assets/js/site.js"></script>
  ${scripts}
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="site-name" href="${BASEURL}/">Teo's blog</a>
    <nav class="site-nav" aria-label="Site">
      <a href="${BASEURL}/about/">About</a>
      <a class="nav-github" href="https://github.com/Sir-Teo" aria-label="GitHub" title="GitHub">
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><use href="${BASEURL}/assets/icons.svg#icon-github"/></svg>
        <span class="link-label">GitHub</span>
      </a>
      <button class="theme-toggle" type="button" aria-label="Toggle dark mode">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 3a7 7 0 0 0 0 14z"/></svg>
      </button>
    </nav>
  </header>

  <main id="main">
    <article class="post">
      <header class="post-head">
        <h1>${title}</h1>
        <p class="meta">
          <time datetime="${dateStr}">${dateFormatted}</time>
          <span>${minutes} min read</span>
        </p>
      </header>
      <div class="post-content">
        ${htmlContent}
      </div>
    </article>
  </main>

  <footer class="site-footer">
    <a href="${BASEURL}/about/">About</a>
    <a href="https://github.com/Sir-Teo"><svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><use href="${BASEURL}/assets/icons.svg#icon-github"/></svg>GitHub</a>
    <a href="${BASEURL}/feed.xml"><svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><use href="${BASEURL}/assets/icons.svg#icon-rss"/></svg>RSS</a>
  </footer>
</body>
</html>`;
}

function renderIndex() {
  const thumbFile = fs.readFileSync(path.join(ROOT, '_includes/post-thumb.html'), 'utf8');
  const postFiles = fs.readdirSync(path.join(ROOT, '_posts'))
    .filter(f => f.endsWith('.markdown') || f.endsWith('.md'))
    .sort().reverse();

  const items = postFiles.map(file => {
    const raw = fs.readFileSync(path.join(ROOT, '_posts', file), 'utf8');
    const { data, content } = parseFrontMatter(raw);
    const m = file.match(/^(\d{4})-(\d{2})-(\d{2})-(.*)\.(markdown|md)$/);
    if (!m) return '';
    const [, yr, mo, da, slug] = m;
    const url = `${BASEURL}/${yr}/${mo}/${da}/${slug}.html`;
    const title = data.title || slug;
    const desc = data.excerpt || data.description || '';
    const dateFormatted = new Date(`${yr}-${mo}-${da}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const figs = (content.match(/<figure\s+class="fig/g) || []).length;
    const plainWords = content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.round((plainWords + 115) / 230));

    // Extract thumb svg for this slug
    const reThumb = new RegExp(`when '${slug}'\\s*-%\\}([\\s\\S]*?)(?:\\{%-\\s*when|\\{%-\\s*else|\\{%-\\s*endcase)`, 'm');
    const tm = thumbFile.match(reThumb);
    const thumbSvg = tm ? tm[1].trim() : '<svg class="post-thumb" viewBox="0 0 104 68"><rect class="thumb-bg" width="104" height="68" rx="6"/></svg>';

    return `<li>
      <div class="post-thumb-wrap" aria-hidden="true">
        ${thumbSvg}
      </div>
      <div class="post-index-body">
        <h2 class="post-index-head">
          <a class="post-index-link" href="${url}">
            <span class="post-index-title">${title}</span>
          </a>
        </h2>
        ${desc ? `<p class="post-index-excerpt">${desc}</p>` : ''}
        <p class="meta post-index-meta">
          <time datetime="${yr}-${mo}-${da}">${dateFormatted}</time>
          ${figs > 0 ? `<span class="post-index-figs">${figs} ${figs === 1 ? 'figure' : 'figures'}</span>` : ''}
          <span>${minutes} min read</span>
        </p>
      </div>
    </li>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>
    (function () {
      var t = null;
      try { t = localStorage.getItem('theme'); } catch (e) {}
      if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = t;
    })();
  </script>
  <meta name="color-scheme" content="light dark">
  <title>Teo's blog</title>
  <meta name="description" content="Things I build, explained with figures you can play with.">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cstyle%3Erect%7Bfill:%23171716%7Dpath%7Bfill:%23fcfbf9%7D@media(prefers-color-scheme:dark)%7Brect%7Bfill:%23ededeb%7Dpath%7Bfill:%23111112%7D%7D%3C/style%3E%3Crect x='1' y='1' width='14' height='14' rx='3.5'/%3E%3Cpath d='M4.2 4.6h7.6v1.45H8.85V12H7.15V6.05H4.2z'/%3E%3C/svg%3E">
  <link rel="preload" as="font" type="font/woff2" href="${BASEURL}/assets/fonts/newsreader-latin.woff2" crossorigin>
  <link rel="stylesheet" href="${BASEURL}/assets/css/main.css">
  <script defer src="${BASEURL}/assets/js/site.js"></script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="site-name" href="${BASEURL}/">Teo's blog</a>
    <nav class="site-nav" aria-label="Site">
      <a href="${BASEURL}/about/">About</a>
      <a class="nav-github" href="https://github.com/Sir-Teo" aria-label="GitHub" title="GitHub">
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><use href="${BASEURL}/assets/icons.svg#icon-github"/></svg>
        <span class="link-label">GitHub</span>
      </a>
      <button class="theme-toggle" type="button" aria-label="Toggle dark mode">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 3a7 7 0 0 0 0 14z"/></svg>
      </button>
    </nav>
  </header>

  <main id="main">
    <div class="home">
      <header class="home-head">
        <h1 class="home-lead">Things I build, explained with figures you can play with.</h1>
      </header>
      <ol class="post-index" id="posts" reversed>
        ${items}
      </ol>
    </div>
  </main>

  <footer class="site-footer">
    <a href="${BASEURL}/about/">About</a>
    <a href="https://github.com/Sir-Teo"><svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><use href="${BASEURL}/assets/icons.svg#icon-github"/></svg>GitHub</a>
    <a href="${BASEURL}/feed.xml"><svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><use href="${BASEURL}/assets/icons.svg#icon-rss"/></svg>RSS</a>
  </footer>
</body>
</html>`;
}

function handleRequest(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);

  // Handle redirects
  if (urlPath === '/' || urlPath === '/blogs') {
    res.writeHead(302, { Location: `${BASEURL}/` });
    res.end();
    return;
  }

  // Strip BASEURL prefix
  const cleanPath = urlPath.startsWith(BASEURL) ? urlPath.slice(BASEURL.length) || '/' : urlPath;

  // Home page
  if (cleanPath === '/' || cleanPath === '/index.html') {
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(renderIndex());
    return;
  }

  // Post pages: /YYYY/MM/DD/slug.html
  const postMatch = cleanPath.match(/^\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)\.html$/);
  if (postMatch) {
    const [, yr, mo, da, slug] = postMatch;
    const postName = `${yr}-${mo}-${da}-${slug}.markdown`;
    const postPath = path.join(ROOT, '_posts', postName);
    const altPath = path.join(ROOT, '_posts', `${yr}-${mo}-${da}-${slug}.md`);
    const target = fs.existsSync(postPath) ? postPath : fs.existsSync(altPath) ? altPath : null;

    if (target) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(renderPost(target));
      return;
    }
  }

  // Static assets or root files
  const filePath = path.join(ROOT, cleanPath.replace(/^\//, ''));
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(filePath));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
}

const server = http.createServer(handleRequest);

server.listen(PORT, '127.0.0.1', () => {
  const postUrl = `http://localhost:${PORT}${BASEURL}/2026/11/09/reading-my-own-duolingo-export.html`;
  console.log(`Server running at http://localhost:${PORT}${BASEURL}/`);
  console.log(`Direct link to post: ${postUrl}`);
});
