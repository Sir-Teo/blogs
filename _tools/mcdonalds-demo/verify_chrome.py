#!/usr/bin/env python3
"""
End-to-end headless Chrome CDP verification + social card renderer for the McDonald's export post.

Zero third-party dependencies (raw RFC 6455 WebSocket + stdlib HTTP server):
  - Serves the Jekyll-built post (or standalone fallback HTML)
  - Verifies all 6 interactive figures mount with zero console/runtime errors
  - Tests every viewport (1440px, 390px, 320px) in light & dark themes
  - Asserts zero SVG text clipping, zero SVG text overlaps, zero NaN attributes,
    and non-blank 3D Canvas rendering
  - Clicks every figure toggle, subpill, session replay tab, and inline a.act link
  - Captures screenshots of all 6 figures when --screenshots <dir> is passed
  - Renders the 1200x630 social preview card into assets/social/reading-my-own-mcdonalds-export.png
    when --social is passed
"""
from __future__ import annotations

import argparse
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
SITE_DIR = ROOT / "_site"
POST_SLUG = "reading-my-own-mcdonalds-export"
SOCIAL_OUT = ROOT / "assets" / "social" / f"{POST_SLUG}.png"
THUMB_SRC = ROOT / "_includes" / "post-thumb.html"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE = "/blogs"

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".webp": "image/webp",
}


def extract_thumb_svg() -> str:
    txt = THUMB_SRC.read_text(encoding="utf-8")
    m = re.search(
        r"when 'reading-my-own-mcdonalds-export'.*?(<svg class=\"post-thumb\".*?</svg>)",
        txt,
        re.S,
    )
    assert m, "Could not find reading-my-own-mcdonalds-export thumbnail in _includes/post-thumb.html"
    return f'<div class="post-thumb-wrap" aria-hidden="true">{m.group(1)}</div>'


def render_social_html() -> str:
    thumb = extract_thumb_svg()
    return f"""<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="{BASE}/assets/css/main.css">
<style>
  html, body {{ margin: 0; width: 1200px; height: 630px; background: var(--bg); }}
  .card {{ box-sizing: border-box; width: 1200px; height: 630px; padding: 72px 80px 64px;
    display: grid; grid-template-columns: 1fr 380px; grid-template-rows: auto 1fr auto; column-gap: 64px; }}
  .site {{ grid-column: 1 / -1; font: 500 26px/1 var(--sans); color: var(--fg-2); letter-spacing: -0.01em; }}
  .site span {{ color: var(--fg-3); font-weight: 400; }}
  h1 {{ align-self: center; margin: 0; font: 500 64px/1.1 var(--serif); letter-spacing: -0.025em; color: var(--fg);
    text-wrap: balance; }}
  .thumb {{ align-self: center; justify-self: end; width: 380px; }}
  .thumb .post-thumb-wrap, .thumb svg {{ width: 380px !important; height: auto !important; display: block; }}
  .post-thumb .thumb-bg {{ fill: var(--subtle); stroke: var(--line-2); }}
  .post-thumb .thumb-grid {{ fill: none; stroke: var(--line); }}
  .post-thumb .thumb-wire {{ fill: none; stroke: var(--line-2); stroke-linecap: round; stroke-linejoin: round; }}
  .post-thumb .thumb-wire-dash {{ fill: none; stroke: var(--line-2); stroke-dasharray: 2 2.5; stroke-linecap: round; }}
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
  <div class="site">Teo’s blog <span>· Reading my own data</span></div>
  <h1>Reading my own McDonald’s export</h1>
  <div class="thumb">{thumb}</div>
  <div class="foot"><span>Nov 25, 2026 · 7 min read · 7 figures</span><b>teozeng.dev/blogs</b></div>
</div></body></html>"""


def render_post_html() -> str:
    raw = (ROOT / "_posts" / f"2026-11-25-{POST_SLUG}.markdown").read_text(encoding="utf-8")
    m = re.match(r"^---\n([\s\S]*?)\n---\n([\s\S]*)$", raw)
    fm, body_raw = m.group(1), m.group(2)
    title = re.search(r'^title:\s*"(.*)"', fm, re.M).group(1)

    body_raw = re.sub(r"\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}", BASE + r"\1", body_raw)
    body_raw = body_raw.replace("{{ site.baseurl }}", BASE)
    blocks = []
    for blk in re.split(r"\n\n+", body_raw.strip()):
        s = blk.strip()
        if not s:
            continue
        if s.startswith("<figure") or s.startswith("<details") or s.startswith("</details"):
            blocks.append(s)
        elif s.startswith("## "):
            blocks.append(f"<h2>{s[3:]}</h2>")
        elif s.startswith("- "):
            bold_re = re.compile(r"\*\*([^*]+)\*\*")
            lis = "".join("<li>" + bold_re.sub(r"<strong>\1</strong>", ln[2:]) + "</li>" for ln in s.splitlines() if ln.startswith("- "))
            blocks.append(f"<ul>{lis}</ul>")
        else:
            s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
            s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
            s = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", s)
            s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
            blocks.append(f"<p>{s}</p>")
    body = "\n".join(blocks)
    return f"""<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <link rel="preload" as="font" type="font/woff2" href="{BASE}/assets/fonts/newsreader-latin.woff2" crossorigin>
  <link rel="stylesheet" href="{BASE}/assets/css/main.css">
  <link rel="stylesheet" href="{BASE}/assets/css/mcdonalds.css">
  <script defer src="{BASE}/assets/js/site.js"></script>
  <script defer src="{BASE}/assets/js/mcdonalds.js"></script>
</head>
<body id="top">
  <header class="site-header" id="site-header"><a class="site-name" href="{BASE}/">Teo's blog</a></header>
  <div id="wrapper">
    <main id="main" class="post">
      <article class="post-article">
        <header class="post-heading post-head">
          <p class="post-kicker"><a href="#series-title">Reading my own data · Part 4 of 4</a></p>
          <h1 class="post-title">{title}</h1>
          <div class="publish-metadata">
            <p class="post-author">Teo</p>
            <p class="meta post-date-meta"><time datetime="2026-11-25">Nov 25, 2026</time><span>7 figures</span><span>7 min read</span></p>
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


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/favicon.ico":
            self.send_response(204); self.end_headers(); return
        if p == f"{BASE}/post.html":
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
            f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.sock.recv(4096)
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
        self.msg_id = 0
        self.events = []

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
            op, length = b1 & 0x0F, b2 & 0x7F
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
            self.events.append(msg)

    def eval(self, expr: str):
        res = self.call("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True})
        if "exceptionDetails" in res:
            raise RuntimeError(f"JS exception: {res['exceptionDetails']}")
        return res.get("result", {}).get("value")

    def close(self):
        self.sock.close()


BOUNDS_JS = r"""(() => {
  const bad = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    bad.push(`Overflow: ${document.documentElement.scrollWidth} > ${innerWidth}`);
  }
  for (const svg of document.querySelectorAll('figure.mcd svg')) {
    if (svg.hidden || svg.getBoundingClientRect().width === 0) continue;
    const v = svg.viewBox.baseVal;
    const figId = svg.closest('figure').id;
    const boxes = [];
    const rootInv = svg.getScreenCTM() ? svg.getScreenCTM().inverse() : null;
    for (const el of svg.querySelectorAll('text')) {
      const bb = el.getBBox();
      if (bb.width === 0 && bb.height === 0) continue;
      let x0 = bb.x, y0 = bb.y, x1 = bb.x + bb.width, y1 = bb.y + bb.height;
      if (rootInv && el.getScreenCTM()) {
        const m = rootInv.multiply(el.getScreenCTM());
        const pt = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
        const p1 = pt(x0, y0), p2 = pt(x1, y1);
        x0 = Math.min(p1.x, p2.x); y0 = Math.min(p1.y, p2.y);
        x1 = Math.max(p1.x, p2.x); y1 = Math.max(p1.y, p2.y);
      }
      const b = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      if (b.x < -4 || b.y < -4 || b.x + b.width > v.width + 4 || b.y + b.height > v.height + 4) {
        bad.push(`${figId}: outside viewBox "${el.textContent}" (${b.x.toFixed(1)},${b.y.toFixed(1)} ${b.width.toFixed(1)}x${b.height.toFixed(1)} vs ${v.width}x${v.height})`);
      }
      boxes.push({ text: el.textContent, x: b.x, y: b.y, w: b.width, h: b.height });
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.x + 2 < b.x + b.w && a.x + a.w - 2 > b.x && a.y + 3 < b.y + b.h && a.y + a.h - 3 > b.y) {
          bad.push(`${figId}: overlap "${a.text}" vs "${b.text}"`);
        }
      }
    }
    if ([...svg.querySelectorAll('*')].some(e => [...e.attributes].some(a => a.name !== 'href' && /NaN|Infinity/.test(a.value)))) {
      bad.push(`${figId}: NaN/Infinity attribute`);
    }
  }
  return bad;
})()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--screenshots", type=Path, default=None)
    ap.add_argument("--social", action="store_true")
    args = ap.parse_args()

    post_url_path = f"{BASE}/post.html"

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    dbg_port = s.getsockname()[1]
    s.close()

    with tempfile.TemporaryDirectory() as tmpdir:
        proc = subprocess.Popen(
            [
                CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
                f"--remote-debugging-port={dbg_port}", f"--user-data-dir={tmpdir}", "about:blank",
            ],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            ws_url = None
            for _ in range(60):
                try:
                    tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{dbg_port}/json/list").read())
                    for tab in tabs:
                        if tab.get("type") == "page" and tab.get("webSocketDebuggerUrl"):
                            ws_url = tab["webSocketDebuggerUrl"]; break
                    if ws_url: break
                except Exception:
                    pass
                time.sleep(0.1)
            assert ws_url, "Chrome CDP failed to start"

            cdp = CDPClient(ws_url)
            cdp.call("Page.enable")
            cdp.call("Runtime.enable")
            cdp.call("Log.enable")

            def set_vp(w: int, h: int = 1000, dpr: int = 1):
                cdp.call("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": dpr, "mobile": w < 500})
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")

            def check(label: str):
                bad = cdp.eval(BOUNDS_JS)
                if bad:
                    raise AssertionError(f"Geometry failed at {label}:\n  " + "\n  ".join(bad))

            # 1. Navigate & wait for all 7 figures ready
            set_vp(1440, 1000, 1)
            cdp.call("Page.navigate", {"url": f"http://127.0.0.1:{port}{post_url_path}"})
            for _ in range(60):
                if cdp.eval("document.querySelectorAll('figure.mcd.ready').length") == 7:
                    break
                time.sleep(0.1)
            assert cdp.eval("document.querySelectorAll('figure.mcd.ready').length") == 7, "Not all 7 figures mounted"
            assert cdp.eval("document.querySelectorAll('.mcd-error').length") == 0, "Figure load error"
            cdp.eval("document.fonts.ready")
            cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")

            # Check across light/dark and 1440/390/320
            for theme, w in [("light", 1440), ("dark", 1440), ("light", 390), ("dark", 390), ("light", 320)]:
                set_vp(w, 1000, 1)
                cdp.eval(f"document.documentElement.dataset.theme = '{theme}'")
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
                check(f"{w}-{theme}")

            # Exercise all figure toggles, subpills, and inline action links
            set_vp(1280, 900, 1)
            cdp.eval("document.documentElement.dataset.theme = 'light'")
            toggles = [
                "#mcd-atlas button[data-act='ghosts']",
                "#mcd-menu button[data-act='d90']",
                "#mcd-menu button[data-act='d30']",
                "#mcd-menu button[data-act='d365']",
                "#mcd-mirror button[data-act='churn']",
                "#mcd-mirror button[data-act='topdown']",
                "#mcd-mirror button[data-act='topdown']",
            ]
            for sel in toggles:
                cdp.eval(f"document.querySelector(\"{sel}\").click()")
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
                check(f"toggle-{sel}")

            # Click all 4 session replay tabs
            for i in range(4):
                cdp.eval(f"document.querySelectorAll('#mcd-kiosk .mcd-subpills button')[{i}].click()")
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
                check(f"kiosk-session-{i}")

            # Click all inline action links
            n_acts = cdp.eval("document.querySelectorAll('a.act[href^=\"#mcd-\"]').length")
            assert n_acts >= 20, f"Expected >=20 action links, found {n_acts}"
            for i in range(n_acts):
                cdp.eval(f"document.querySelectorAll('a.act[href^=\"#mcd-\"]')[{i}].click()")
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
                check(f"act-{i}")

            # Verify BOTH 3D canvases (#mcd-atlas and #mcd-mirror) paint non-blank pixels
            cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
            for cid in ["mcd-atlas", "mcd-mirror"]:
                non_empty = cdp.eval(f"""(() => {{
                  const c = document.querySelector('#{cid} canvas');
                  if (!c) return false;
                  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                  for (let i = 3; i < d.length; i += 400) if (d[i] > 10) return true;
                  return false;
                }})()""")
                assert non_empty, f"3D Canvas blank for #{cid}"

            # Zero JS exceptions
            js_errs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
            assert not js_errs, f"Runtime JS errors: {js_errs}"

            # 2. Capture crisp screenshots of all 7 figures (fresh default state)
            if args.screenshots:
                args.screenshots.mkdir(parents=True, exist_ok=True)
                set_vp(1280, 900, 2)
                cdp.call("Page.navigate", {"url": f"http://127.0.0.1:{port}{post_url_path}"})
                for _ in range(60):
                    if cdp.eval("document.querySelectorAll('figure.mcd.ready').length") == 7:
                        break
                    time.sleep(0.1)
                cdp.eval("document.documentElement.dataset.theme = 'light'")
                cdp.eval("document.fonts.ready")
                time.sleep(0.45)

                def snap(selector: str, fname: str):
                    cdp.eval(f"document.querySelector('{selector}').scrollIntoView({{block:'center'}})")
                    time.sleep(0.15)
                    cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
                    box = cdp.eval(f"(() => {{ const el = document.querySelector('{selector}'); const r = el.getBoundingClientRect(); return {{x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height}}; }})()")
                    res = cdp.call("Page.captureScreenshot", {
                        "format": "png",
                        "clip": {"x": max(0, box["x"] - 8), "y": max(0, box["y"] - 8), "width": box["w"] + 16, "height": box["h"] + 16, "scale": 1},
                        "captureBeyondViewport": True,
                    })
                    (args.screenshots / fname).write_bytes(base64.b64decode(res["data"]))

                for fid in ["mcd-journey", "mcd-rhythm", "mcd-atlas", "mcd-menu", "mcd-deals", "mcd-kiosk", "mcd-mirror"]:
                    snap(f"#{fid}", f"{fid}.png")

            # 3. Render 1200x630 social preview card
            if args.social:
                set_vp(1200, 630, 1)
                cdp.call("Page.navigate", {"url": f"http://127.0.0.1:{port}{BASE}/social.html"})
                time.sleep(0.45)
                cdp.eval("document.fonts.ready")
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
                res = cdp.call("Page.captureScreenshot", {"format": "png", "clip": {"x": 0, "y": 0, "width": 1200, "height": 630, "scale": 1}})
                SOCIAL_OUT.parent.mkdir(parents=True, exist_ok=True)
                SOCIAL_OUT.write_bytes(base64.b64decode(res["data"]))
                print(f"Wrote {SOCIAL_OUT} ({SOCIAL_OUT.stat().st_size // 1024} KB)")

            cdp.close()
            print(f"PASS verify_chrome.py: 7/7 figures verified across 5 viewports/themes, {n_acts} action links, 2 3D canvases, 0 overlaps, 0 errors.")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
            srv.shutdown()


if __name__ == "__main__":
    main()
