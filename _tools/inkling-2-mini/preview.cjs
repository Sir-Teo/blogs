#!/usr/bin/env node
/* Faithful local preview server for Teo's blog using the Connectionism layout and Kramdown math protection. */
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

const ROOT = path.resolve(__dirname, '..', '..');
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
  '.webp': 'image/webp',
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseFrontMatter(fileContent) {
  const m = fileContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { data: {}, content: fileContent };
  const rawYaml = m[1], body = m[2];
  const data = {};
  let currentKey = null;
  let currentItem = null;

  for (const line of rawYaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (line.startsWith('  - ')) {
      if (currentKey) {
        if (!Array.isArray(data[currentKey])) data[currentKey] = [];
        const rest = line.slice(4).trim();
        const objKv = rest.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
        if (objKv) {
          currentItem = { [objKv[1]]: objKv[2].trim().replace(/^['"]|['"]$/g, '') };
          data[currentKey].push(currentItem);
        } else {
          currentItem = null;
          data[currentKey].push(rest.replace(/^['"]|['"]$/g, ''));
        }
      }
      continue;
    }
    if (line.startsWith('    ') && currentItem && currentKey && Array.isArray(data[currentKey])) {
      const objKv = trimmed.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (objKv) currentItem[objKv[1]] = objKv[2].trim().replace(/^['"]|['"]$/g, '');
      continue;
    }
    const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      currentItem = null;
      const val = kv[2].trim();
      if (val === '>-' || val === '>' || val === '|') data[currentKey] = '';
      else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) data[currentKey] = val.slice(1, -1);
      else if (val.length > 0) data[currentKey] = val;
    } else if (currentKey && (line.startsWith('  ') || line.startsWith('\t'))) {
      if (typeof data[currentKey] === 'string') {
        data[currentKey] = (data[currentKey] ? data[currentKey] + ' ' : '') + trimmed;
      }
    }
  }
  return { data, content: body };
}

function renderMarkdown(md) {
  md = md.replace(/\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}/g, (_, p) => BASEURL + p);
  md = md.replace(/\{\{\s*"([^"]+)"\s*\|\s*relative_url\s*\}\}/g, (_, p) => BASEURL + p);
  const slots = [];
  const hold = s => { const id = `@@MATH${slots.length}@@`; slots.push(s); return id; };
  // Protect math only outside fenced/inline code, while letting marked render code normally
  const codeOrMath = /(```[\s\S]*?```|`[^`\n]+`)|(^|\n)\$\$\n([\s\S]*?)\n\$\$(?=\n|$)|\$\$([^\n$]+?)\$\$/g;
  const protectMath = txt => txt.replace(codeOrMath, (m, code, pre, disp, inl) => {
    if (code) return code;
    if (disp !== undefined) return pre + hold(`\\[${disp}\\]`);
    return hold(`\\(${inl}\\)`);
  });
  md = protectMath(md);
  md = md.replace(/<details([^>]*)markdown="1"([^>]*)>([\s\S]*?)<\/details>/g, (_, a, b, inner) => {
    const sm = inner.match(/^(\s*<summary>[\s\S]*?<\/summary>)([\s\S]*)$/);
    if (!sm) return `<details${a}${b}>${marked.parse(inner)}</details>`;
    return `<details${a}${b}>${sm[1]}${marked.parse(sm[2])}</details>`;
  });
  let html = marked.parse(md, { gfm: true, breaks: false });
  for (let i = slots.length - 1; i >= 0; i--) {
    html = html.split(`@@MATH${i}@@`).join(slots[i]);
  }
  return html;
}

function layoutShell({ title, desc, layout, bodyHtml, styles = [], scripts = [] }) {
  const mathHead = layout === 'post' ? `
  <link rel="stylesheet" href="${BASEURL}/assets/vendor/katex/katex.min.css">
  <link rel="stylesheet" href="${BASEURL}/assets/css/math.css">
  <script defer id="site-math-core" src="${BASEURL}/assets/vendor/katex/katex.min.js"></script>
  <script defer src="${BASEURL}/assets/vendor/katex/auto-render.min.js"></script>
  <script defer src="${BASEURL}/assets/js/math.js"></script>` : '';
  const styleTags = styles.map(s => `<link rel="stylesheet" href="${BASEURL}${s}">`).join('\n  ');
  const scriptTags = scripts.map(s => `<script defer src="${BASEURL}${s}"></script>`).join('\n  ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect x='1' y='1' width='14' height='14' rx='3.5' fill='%23282828'/%3E%3Cpath d='M4.2 4.6h7.6v1.45H8.85V12H7.15V6.05H4.2z' fill='%23ffffff'/%3E%3C/svg%3E">
  <link rel="preload" as="font" type="font/woff2" href="${BASEURL}/assets/fonts/newsreader-latin.woff2" crossorigin>
  <link rel="stylesheet" href="${BASEURL}/assets/css/main.css">
  ${mathHead}
  ${styleTags}
  <script defer src="${BASEURL}/assets/js/site.js"></script>
  ${scriptTags}
</head>
<body id="top">
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header" id="site-header">
    <a class="site-name" href="${BASEURL}/">Teo’s blog</a>
    <nav class="top-nav" aria-label="Site">
      <a href="${BASEURL}/" aria-current="page">Writing</a>
      <a href="https://github.com/Sir-Teo">GitHub</a>
      <a href="https://www.youtube.com/@teozeng3999">YouTube</a>
      <a href="https://teozeng.dev">teozeng.dev</a>
    </nav>
    <button class="hamburger" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="mobile-menu">
      <span></span><span></span><span></span>
    </button>
  </header>
  <div id="wrapper">
    <main id="main" class="${layout === 'home' ? 'index list section-blog' : 'post'}">
      ${bodyHtml}
    </main>
  </div>
</body>
</html>`;
}

function renderPost(postPath) {
  const raw = fs.readFileSync(postPath, 'utf8');
  const { data, content } = parseFrontMatter(raw);
  const htmlContent = renderMarkdown(content);
  const title = data.title || 'Post';
  const desc = data.description || '';
  const dateStr = data.date ? data.date.slice(0, 10) : '2026-11-23';
  const dateFormatted = new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const figs = (content.match(/<figure\s+class="fig/g) || []).length;
  const plainWords = content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round((plainWords + 115) / 230));
  const linksHtml = Array.isArray(data.links) && data.links.length
    ? `<p class="post-header-links meta-links">${data.links.map(l => `<a href="${esc(l.url)}">${esc(l.title)}</a>`).join('')}</p>`
    : '';

  const bodyHtml = `
    <article class="post-article">
      <header class="post-heading post-head">
        <h1 class="post-title">${esc(title)}</h1>
        <div class="publish-metadata">
          <p class="post-author">Teo</p>
          <p class="meta post-date-meta">
            <time datetime="${dateStr}">${dateFormatted}</time>
            ${figs > 0 ? `<span>${figs} ${figs === 1 ? 'figure' : 'figures'}</span>` : ''}
            <span>${minutes} min read</span>
          </p>
          ${linksHtml}
        </div>
      </header>
      <div class="post-content-shell">
        <div class="post-content content">
          ${htmlContent}
        </div>
      </div>
    </article>`;
  return layoutShell({
    title: `${title} — Teo’s blog`,
    desc,
    layout: 'post',
    bodyHtml,
    styles: data.styles || [],
    scripts: data.scripts || [],
  });
}

function renderIndex() {
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
    const dateFormatted = new Date(`${yr}-${mo}-${da}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const figs = (content.match(/<figure\s+class="fig/g) || []).length;
    const plainWords = content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.round((plainWords + 115) / 230));
    return `<li>
      <a class="post-item-link post-index-link" href="${url}">
        <time datetime="${yr}-${mo}-${da}">${dateFormatted}</time>
        <div class="post-info post-index-body">
          <h2 class="post-title post-index-title">${esc(data.title || slug)}</h2>
          <p class="author-date post-index-meta">${figs > 0 ? `${figs} ${figs === 1 ? 'figure' : 'figures'} · ` : ''}${minutes} min read</p>
        </div>
      </a>
    </li>`;
  }).join('\n');

  const bodyHtml = `<div class="home"><ol class="post-group post-index" id="posts" reversed>${items}</ol></div>`;
  return layoutShell({ title: 'Teo’s blog', desc: 'Things I build, explained with figures you can play with.', layout: 'home', bodyHtml });
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === BASEURL) {
    res.writeHead(302, { Location: `${BASEURL}/` });
    return res.end();
  }
  const cleanPath = urlPath.startsWith(BASEURL) ? urlPath.slice(BASEURL.length) || '/' : urlPath;
  if (cleanPath === '/' || cleanPath === '/index.html') {
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    return res.end(renderIndex());
  }
  const postMatch = cleanPath.match(/^\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)\.html$/);
  if (postMatch) {
    const [, yr, mo, da, slug] = postMatch;
    const md = path.join(ROOT, '_posts', `${yr}-${mo}-${da}-${slug}.markdown`);
    const alt = path.join(ROOT, '_posts', `${yr}-${mo}-${da}-${slug}.md`);
    const target = fs.existsSync(md) ? md : fs.existsSync(alt) ? alt : null;
    if (target) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return res.end(renderPost(target));
    }
  }
  const filePath = path.join(ROOT, cleanPath.replace(/^\//, ''));
  if (filePath.startsWith(ROOT) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Preview server running at http://127.0.0.1:${PORT}${BASEURL}/2026/11/23/inside-inkling-2-mini.html`);
  });
} else {
  module.exports = { server, renderPost, renderIndex };
}
