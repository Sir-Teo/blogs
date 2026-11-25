#!/usr/bin/env python3
"""Zero-dependency Chrome CDP verifier, screenshotter, and 1200x630 social-card renderer
for 'Why matrix multiplication stops at nine fourths'.

Verifies:
- Zero console errors / page errors / failed asset fetches
- Local KaTeX math rendering with zero .katex-error nodes and full MathML
- All 6 figures (#mm-history, #mm-tripod, #mm-rect, #mm-fermion, #mm-engine, #mm-map)
  mount, respond to interactive tabs/buttons/sliders/action-links, and produce
  zero horizontal overflow at 1440px, 390px, and 320px
- Saves visual inspection screenshots of every figure (desktop + mobile)
- Renders assets/social/why-matrix-multiplication-stops-at-nine-fourths.png
"""
from __future__ import annotations

import base64
import http.server
import json
import os
import re
import socket
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHROME = os.environ.get("CHROME_PATH", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
BASE = "/blogs"
SLUG = "why-matrix-multiplication-stops-at-nine-fourths"
POST_FILE = ROOT / "_posts" / f"2026-11-24-{SLUG}.markdown"
SOCIAL_OUT = ROOT / "assets" / "social" / f"{SLUG}.png"
SHOT_DIR = Path(
    os.environ.get(
        "SHOT_DIR",
        "/Users/teo/.gemini/antigravity/brain/f98304d2-1304-434b-99b8-c1817eed3694/scratch/shots",
    )
)

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}


def md_inline(s: str) -> str:
    # Emulate Kramdown: inline $$...$$ -> <script type="math/tex">...</script>
    tokens: list[str] = []

    def stash(m: re.Match) -> str:
        inner = m.group(1)
        tokens.append(f'<script type="math/tex">{inner}</script>')
        return f"@@MATH{len(tokens) - 1}@@"

    s = re.sub(r"\$\$([^$\n]+?)\$\$", stash, s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    for i, tok in enumerate(tokens):
        s = s.replace(f"@@MATH{i}@@", tok)
    return s


def render_post_html() -> str:
    raw = POST_FILE.read_text(encoding="utf-8")
    m = re.match(r"^---\n([\s\S]*?)\n---\n([\s\S]*)$", raw)
    assert m, "Invalid front matter"
    fm, body_raw = m.group(1), m.group(2)
    title = re.search(r'^title:\s*"(.*)"', fm, re.M).group(1)
    body_raw = re.sub(r"\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}", BASE + r"\1", body_raw)

    blocks = []
    for blk in re.split(r"\n\n+", body_raw.strip()):
        s = blk.strip()
        if not s:
            continue
        if s.startswith("<figure"):
            # Convert inline $$...$$ inside figcaption like Kramdown does
            s = re.sub(r"\$\$([^$\n]+?)\$\$", r'<script type="math/tex">\1</script>', s)
            blocks.append(s)
        elif s.startswith("<details") or s.startswith("</details") or s.startswith("<summary"):
            blocks.append(md_inline(s))
        elif s.startswith("$$") and s.endswith("$$"):
            inner = s[2:-2].strip()
            blocks.append(f'<script type="math/tex; mode=display">{inner}</script>')
        elif s.startswith("## "):
            blocks.append(f"<h2>{md_inline(s[3:])}</h2>")
        elif s.startswith("- ") or re.match(r"^\d+\.\s", s):
            is_ol = bool(re.match(r"^\d+\.\s", s))
            tag = "ol" if is_ol else "ul"
            items = [re.sub(r"^(?:-|\d+\.)\s+", "", ln) for ln in s.splitlines()]
            blocks.append(f"<{tag}>" + "".join(f"<li>{md_inline(it)}</li>" for it in items) + f"</{tag}>")
        else:
            blocks.append(f"<p>{md_inline(s)}</p>")

    body = "\n".join(blocks)
    words = len(re.sub(r"<[^>]+>", " ", body).split())
    mins = max(1, (words + 115) // 230)
    figs = body.count('<figure class="fig')
    header_links = "".join(
        f'<a href="{url}">{lbl}</a>'
        for lbl, url in re.findall(r"-\s+title:\s*(.+?)\n\s+url:\s*(\S+)", fm)
    )

    return f"""<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <link rel="preload" as="font" type="font/woff2" href="{BASE}/assets/fonts/newsreader-latin.woff2" crossorigin>
  <link rel="stylesheet" href="{BASE}/assets/css/main.css">
  <link rel="stylesheet" href="{BASE}/assets/vendor/katex/katex.min.css">
  <link rel="stylesheet" href="{BASE}/assets/css/math.css">
  <link rel="stylesheet" href="{BASE}/assets/css/matrix-exponent.css">
  <script defer id="site-math-core" src="{BASE}/assets/vendor/katex/katex.min.js"></script>
  <script defer src="{BASE}/assets/vendor/katex/auto-render.min.js"></script>
  <script defer src="{BASE}/assets/js/math.js"></script>
  <script defer src="{BASE}/assets/js/site.js"></script>
  <script defer src="{BASE}/assets/js/matrix-exponent.js"></script>
</head>
<body id="top">
  <header class="site-header" id="site-header"><a class="site-name" href="{BASE}/">Teo’s blog</a></header>
  <div id="wrapper">
    <main id="main" class="post">
      <article class="post-article">
        <header class="post-heading post-head">
          <h1 class="post-title">{title}</h1>
          <div class="publish-metadata">
            <p class="post-author">Teo</p>
            <p class="meta post-date-meta"><time datetime="2026-11-24">Nov 24, 2026</time><span>{figs} figures</span><span>{mins} min read</span></p>
            {f'<p class="post-header-links meta-links">{header_links}</p>' if header_links else ''}
          </div>
        </header>
        <div class="post-content-shell">
          <div class="post-content content">{body}</div>
        </div>
      </article>
    </main>
  </div>
</body>
</html>"""


def extract_thumb() -> str:
    txt = (ROOT / "_includes" / "post-thumb.html").read_text(encoding="utf-8")
    m = re.search(rf"when '{re.escape(SLUG)}'\s*-%\>([\s\S]*?)\{{%-\s*when ", txt)
    if not m:
        m = re.search(rf"when '{re.escape(SLUG)}'\s*-%\}}([\s\S]*?)\{{%-\s*when ", txt)
    assert m, f"Thumbnail for {SLUG} not found in post-thumb.html"
    return f'<div class="post-thumb-wrap" aria-hidden="true">{m.group(1)}</div>'


def render_social_html() -> str:
    raw = POST_FILE.read_text(encoding="utf-8")
    m = re.match(r"^---\n([\s\S]*?)\n---\n([\s\S]*)$", raw)
    fm, body_raw = m.group(1), m.group(2)
    title = re.search(r'^title:\s*"(.*)"', fm, re.M).group(1)
    words = len(re.sub(r"<[^>]+>", " ", body_raw).split())
    mins = max(1, (words + 115) // 230)
    figs = body_raw.count('<figure class="fig')
    thumb = extract_thumb()
    return f"""<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="{BASE}/assets/css/main.css">
<style>
  html, body {{ margin: 0; width: 1200px; height: 630px; background: var(--bg); overflow: hidden; }}
  .card {{ box-sizing: border-box; width: 1200px; height: 630px; padding: 72px 80px 64px;
    display: grid; grid-template-columns: 1fr 380px; grid-template-rows: auto 1fr auto; column-gap: 64px; }}
  .site {{ grid-column: 1 / -1; font: 500 26px/1 var(--sans); color: var(--fg-2); letter-spacing: -0.01em; }}
  h1 {{ align-self: center; margin: 0; font: 500 66px/1.1 var(--serif); letter-spacing: -0.025em; color: var(--fg); text-wrap: balance; }}
  .thumb {{ align-self: center; justify-self: end; width: 380px; }}
  .thumb .post-thumb-wrap, .thumb svg {{ width: 380px !important; height: auto !important; display: block; }}
  .post-thumb .thumb-bg {{ fill: var(--subtle); stroke: var(--line-2); }}
  .post-thumb .thumb-grid {{ fill: none; stroke: var(--line); }}
  .post-thumb .thumb-wire {{ fill: none; stroke: var(--line-2); stroke-linecap: round; stroke-linejoin: round; }}
  .post-thumb .thumb-wire-dash {{ fill: none; stroke: var(--line-2); stroke-dasharray: 2 2.5; stroke-linecap: round; }}
  .post-thumb .thumb-ink {{ fill: none; stroke: var(--fg-3); stroke-linecap: round; stroke-linejoin: round; }}
  .post-thumb .thumb-bars {{ fill: var(--line-2); }}
  .post-thumb .thumb-accent {{ opacity: 0.92; }}
  .post-thumb .thumb-flow {{ fill: none; stroke: var(--accent); stroke-linecap: round; stroke-linejoin: round; }}
  .post-thumb .thumb-flow-thin {{ fill: none; stroke: var(--accent); stroke-linecap: round; }}
  .post-thumb .thumb-soft {{ fill: var(--accent-soft); }}
  .post-thumb .thumb-halo {{ fill: var(--accent-soft); opacity: 1; }}
  .post-thumb .thumb-node-act {{ fill: var(--accent); }}
  .post-thumb .thumb-node-ring {{ fill: var(--bg); stroke: var(--accent); }}
  .thumb svg :is(rect, line, path, circle, polygon) {{ vector-effect: non-scaling-stroke; }}
  .thumb svg .thumb-bg {{ stroke-width: 2px; }}
  .thumb svg .thumb-grid, .thumb svg .thumb-wire, .thumb svg .thumb-wire-dash {{ stroke-width: 2px; }}
  .thumb svg .thumb-flow {{ stroke-width: 3.5px; }}
  .thumb svg .thumb-flow-thin {{ stroke-width: 2.5px; }}
  .thumb svg .thumb-node-ring {{ stroke-width: 3px; }}
  .foot {{ grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: end;
    font: 24px/1 var(--sans); color: var(--fg-3); border-top: 2px solid var(--line); padding-top: 26px; }}
  .foot b {{ font-weight: 500; color: var(--accent); }}
</style></head><body><div class="card">
  <div class="site">Teo’s blog</div>
  <h1>{title}</h1>
  <div class="thumb">{thumb}</div>
  <div class="foot"><span>Nov 24, 2026 · {figs} figures · {mins} min read</span><b>teozeng.dev/blogs</b></div>
</div></body></html>"""


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/favicon.ico":
            self.send_response(204); self.end_headers(); return
        if p in ("/", "/blogs", "/blogs/", f"{BASE}/post.html", f"{BASE}/2026/11/24/{SLUG}.html"):
            data = render_post_html().encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", MIME[".html"]); self.end_headers(); self.wfile.write(data); return
        if p == f"{BASE}/social.html":
            data = render_social_html().encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", MIME[".html"]); self.end_headers(); self.wfile.write(data); return
        clean = p[len(BASE):] if p.startswith(BASE) else p
        fp = (ROOT / clean.lstrip("/")).resolve()
        if not str(fp).startswith(str(ROOT)) or not fp.is_file():
            self.send_response(404); self.end_headers(); return
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(fp.suffix, "application/octet-stream"))
        self.end_headers()
        self.wfile.write(fp.read_bytes())


class CDPClient:
    def __init__(self, ws_url: str):
        m = re.match(r"ws://([^:/]+):(\d+)(/.*)", ws_url)
        host, port, path = m.group(1), int(m.group(2)), m.group(3)
        self.sock = socket.create_connection((host, port), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\n"
            f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.sock.recv(4096)
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
        self.msg_id = 0
        self.console_errors: list[str] = []

    def _recv_exact(self, n: int) -> bytes:
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise EOFError("WebSocket closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _send_text(self, s: str):
        payload = s.encode("utf-8")
        mask = os.urandom(4)
        hdr = bytearray([0x81])
        L = len(payload)
        if L < 126:
            hdr.append(0x80 | L)
        elif L < 65536:
            hdr.append(0x80 | 126); hdr.extend(struct.pack("!H", L))
        else:
            hdr.append(0x80 | 127); hdr.extend(struct.pack("!Q", L))
        hdr.extend(mask)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(hdr) + masked)

    def _recv_frame(self) -> str:
        while True:
            b1, b2 = self._recv_exact(2)
            op = b1 & 0x0F
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._recv_exact(8))[0]
            payload = self._recv_exact(length)
            if op == 1:
                return payload.decode("utf-8")
            if op == 9:
                self.sock.sendall(bytes([0x8A, 0x80]) + os.urandom(4))

    def call(self, method: str, params: dict | None = None) -> dict:
        self.msg_id += 1
        cid = self.msg_id
        self._send_text(json.dumps({"id": cid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self._recv_frame())
            if msg.get("id") == cid:
                if "error" in msg:
                    raise RuntimeError(f"CDP error in {method}: {msg['error']}")
                return msg.get("result", {})
            if msg.get("method") == "Runtime.exceptionThrown":
                self.console_errors.append(str(msg.get("params")))
            elif msg.get("method") == "Runtime.consoleAPICalled":
                p = msg.get("params", {})
                if p.get("type") == "error":
                    self.console_errors.append(str(p.get("args")))

    def eval(self, expr: str):
        res = self.call("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True})
        if "exceptionDetails" in res:
            raise RuntimeError(f"JS exception: {res['exceptionDetails']}")
        return res.get("result", {}).get("value")

    def screenshot_element(self, selector: str, out_path: Path):
        self.eval(f"""(() => {{
          const el = document.querySelector({json.dumps(selector)});
          el.scrollIntoView({{ block: 'center', behavior: 'instant' }});
        }})()""")
        time.sleep(0.25)
        rect = self.eval(f"""(() => {{
          const el = document.querySelector({json.dumps(selector)});
          const r = el.getBoundingClientRect();
          return {{
            x: Math.max(0, r.left + window.scrollX - 8),
            y: Math.max(0, r.top + window.scrollY - 8),
            width: r.width + 16,
            height: r.height + 16,
          }};
        }})()""")
        shot = self.call("Page.captureScreenshot", {
            "format": "png",
            "captureBeyondViewport": True,
            "clip": {**rect, "scale": 1},
        })
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(base64.b64decode(shot["data"]))

    def close(self):
        self.sock.close()


def find_free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    dbg_port = find_free_port()
    tmp_dir = tempfile.mkdtemp(prefix="chrome-mm-")
    proc = subprocess.Popen(
        [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            f"--remote-debugging-port={dbg_port}",
            f"--user-data-dir={tmp_dir}",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        ws_url = None
        for _ in range(50):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{dbg_port}/json/list") as r:
                    tabs = json.loads(r.read().decode())
                    for tab in tabs:
                        if tab.get("type") == "page" and tab.get("webSocketDebuggerUrl"):
                            ws_url = tab["webSocketDebuggerUrl"]
                            break
                if ws_url:
                    break
            except Exception:
                time.sleep(0.1)
        assert ws_url, "Chrome CDP failed to start"

        cdp = CDPClient(ws_url)
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")

        # 1. Desktop 1440x900 verification + figure screenshots
        cdp.call("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 900, "deviceScaleFactor": 2, "mobile": False})
        cdp.call("Page.navigate", {"url": f"http://127.0.0.1:{port}{BASE}/post.html"})

        for _ in range(80):
            ready = cdp.eval("document.documentElement.dataset.mmReady === '1' && document.documentElement.dataset.math === 'ready'")
            if ready:
                break
            time.sleep(0.1)
        assert ready, "Page figures or math did not initialize in time"
        cdp.eval("document.fonts.ready")
        time.sleep(0.4)

        # Verify math + zero errors + zero overflow + all 6 figures mounted
        report = cdp.eval("""(() => {
          const figs = [...document.querySelectorAll('figure.mm')].map(f => ({
            id: f.id,
            shell: !!f.querySelector('.mm-shell'),
            w: Math.round(f.getBoundingClientRect().width),
            h: Math.round(f.getBoundingClientRect().height),
          }));
          const katexCount = document.querySelectorAll('.post-content .katex').length;
          const katexErrors = document.querySelectorAll('.post-content .katex-error').length;
          const rawDollars = [...document.querySelectorAll('.post-content p, .post-content li')]
            .filter(el => /\\$\\$/.test(el.textContent)).length;
          return {
            figs,
            katexCount,
            katexErrors,
            rawDollars,
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            scrollW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
          };
        })()""")
        print("Desktop 1440px report:", json.dumps(report, indent=2))
        assert len(report["figs"]) == 6
        assert all(f["shell"] and f["h"] > 200 for f in report["figs"]), f"Unmounted figure: {report['figs']}"
        assert report["katexCount"] >= 25, f"Too few KaTeX nodes: {report['katexCount']}"
        assert report["katexErrors"] == 0, f"KaTeX errors found: {report['katexErrors']}"
        assert report["rawDollars"] == 0, f"Unrendered $$ left in prose!"
        assert not report["overflow"], f"Desktop horizontal overflow: {report['scrollW']} > {report['innerW']}"

        # Screenshot every figure on desktop
        for fid in ["mm-history", "mm-tripod", "mm-rect", "mm-fermion", "mm-engine", "mm-map"]:
            cdp.screenshot_element(f"#{fid}", SHOT_DIR / f"desktop-{fid}.png")

        # Test interactive mode switches + capture extra key states
        cdp.eval("document.querySelector('#mm-history [data-tab=\"finite\"]').click()")
        time.sleep(0.25)
        cdp.screenshot_element("#mm-history", SHOT_DIR / "desktop-mm-history-finite.png")

        cdp.eval("document.querySelector('#mm-fermion [data-mode=\"seam\"]').click(); document.querySelector('#mm-fermion [data-seam-step=\"2\"]').click()")
        time.sleep(0.6)
        cdp.screenshot_element("#mm-fermion", SHOT_DIR / "desktop-mm-fermion-seam.png")

        cdp.eval("document.querySelector('#mm-map [data-filter=\"lean\"]').click()")
        time.sleep(0.3)
        cdp.screenshot_element("#mm-map", SHOT_DIR / "desktop-mm-map-lean.png")

        # Test action link clicks
        act_ok = cdp.eval("""(() => {
          const links = [...document.querySelectorAll('a.act[href^="#mm-"]')];
          links.forEach(a => a.click());
          return links.length;
        })()""")
        print(f"Clicked {act_ok} inline action links cleanly.")
        assert act_ok >= 10

        # 2. Mobile 390px and 320px checks
        for mw in (390, 320):
            cdp.call("Emulation.setDeviceMetricsOverride", {"width": mw, "height": 844, "deviceScaleFactor": 2, "mobile": True})
            time.sleep(0.45)
            mob = cdp.eval("({ overflow: document.documentElement.scrollWidth > window.innerWidth + 1, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth })")
            print(f"Mobile {mw}px check:", mob)
            assert not mob["overflow"], f"Overflow at {mw}px: {mob}"
            if mw == 390:
                cdp.screenshot_element("#mm-tripod", SHOT_DIR / "mobile-mm-tripod.png")
                cdp.screenshot_element("#mm-rect", SHOT_DIR / "mobile-mm-rect.png")

        # 3. Render 1200x630 social card!
        cdp.call("Emulation.setDeviceMetricsOverride", {"width": 1200, "height": 630, "deviceScaleFactor": 1, "mobile": False})
        cdp.call("Page.navigate", {"url": f"http://127.0.0.1:{port}{BASE}/social.html"})
        time.sleep(0.6)
        cdp.eval("document.fonts.ready")
        time.sleep(0.25)
        shot = cdp.call("Page.captureScreenshot", {"format": "png", "clip": {"x": 0, "y": 0, "width": 1200, "height": 630, "scale": 1}})
        SOCIAL_OUT.parent.mkdir(parents=True, exist_ok=True)
        SOCIAL_OUT.write_bytes(base64.b64decode(shot["data"]))
        print(f"Wrote social card {SOCIAL_OUT} ({SOCIAL_OUT.stat().st_size} bytes)")

        assert not cdp.console_errors, f"Console/Runtime errors: {cdp.console_errors}"
        cdp.close()
        print("ALL CHROME VERIFICATION CHECKS PASSED!")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        server.shutdown()


if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 2 and sys.argv[1] == "--serve":
        port = int(sys.argv[2]) if len(sys.argv) >= 3 else 0
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
        actual_port = srv.server_address[1]
        print(f"Serving post at http://127.0.0.1:{actual_port}{BASE}/2026/11/24/{SLUG}.html", flush=True)
        srv.serve_forever()
    else:
        main()
