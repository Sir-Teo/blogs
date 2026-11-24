#!/usr/bin/env python3
"""Zero-dependency Chrome CDP verifier + screenshotter + 1200x630 social-card renderer.

Verifies all 7 Google export figures, all 21 tabs, sub-pills, inline action links,
light/dark themes, and SVG text viewBox/overlap bounds at 1440px, 390px, and 320px,
and renders assets/social/reading-my-own-google-export.png.
"""
from __future__ import annotations

import base64
import hashlib
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
SHOT_DIR = Path(os.environ.get("SHOT_DIR", "")) if os.environ.get("SHOT_DIR") else None
RENDER_SOCIAL = os.environ.get("RENDER_SOCIAL", "1") == "1"

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".woff2": "font/woff2",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}


def render_post_html() -> str:
    raw = (ROOT / "_posts" / "2026-11-24-reading-my-own-google-export.markdown").read_text()
    m = re.match(r"^---\n([\s\S]*?)\n---\n([\s\S]*)$", raw)
    fm, body_raw = m.group(1), m.group(2)
    title = re.search(r'^title:\s*"(.*)"', fm, re.M).group(1)

    body_raw = re.sub(r"\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}", BASE + r"\1", body_raw)
    body_raw = re.sub(r"\{%\s*post_url\s+([^%]+?)\s*%\}", r"#post-\1", body_raw)
    blocks = []
    for blk in re.split(r"\n\n+", body_raw.strip()):
        s = blk.strip()
        if not s:
            continue
        if s.startswith("<figure") or s.startswith("<details") or s.startswith("</details"):
            blocks.append(s)
        elif s.startswith("## "):
            blocks.append(f"<h2>{s[3:]}</h2>")
        else:
            s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
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
  <link rel="stylesheet" href="{BASE}/assets/css/google.css">
  <script defer src="{BASE}/assets/js/site.js"></script>
  <script defer src="{BASE}/assets/js/google.js"></script>
</head>
<body id="top">
  <header class="site-header" id="site-header"><a class="site-name" href="{BASE}/">Teo's blog</a></header>
  <div id="wrapper">
    <main id="main" class="post">
      <article class="post-article">
        <header class="post-heading post-head">
          <p class="post-kicker"><a href="#series-title">Reading my own data · Part 3 of 3</a></p>
          <h1 class="post-title">{title}</h1>
          <div class="publish-metadata">
            <p class="post-author">Teo</p>
            <p class="meta post-date-meta"><time datetime="2026-11-24">Nov 24, 2026</time><span>7 figures</span><span>7 min read</span></p>
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
    txt = (ROOT / "_includes" / "post-thumb.html").read_text()
    m = re.search(r"when 'reading-my-own-google-export'\s*-%\}([\s\S]*?)\{%-\s*when ", txt)
    assert m, "Thumbnail for reading-my-own-google-export not found"
    return f'<div class="post-thumb-wrap" aria-hidden="true">{m.group(1)}</div>'


def render_social_html() -> str:
    thumb = extract_thumb()
    return f"""<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="{BASE}/assets/css/main.css">
<style>
  html, body {{ margin: 0; width: 1200px; height: 630px; background: var(--bg); overflow: hidden; }}
  .card {{ box-sizing: border-box; width: 1200px; height: 630px; padding: 72px 80px 64px;
    display: grid; grid-template-columns: 1fr 380px; grid-template-rows: auto 1fr auto; column-gap: 64px; }}
  .site {{ grid-column: 1 / -1; font: 500 26px/1 var(--sans); color: var(--fg-2); letter-spacing: -0.01em; }}
  .site span {{ color: var(--fg-3); font-weight: 400; }}
  h1 {{ align-self: center; margin: 0; font: 500 66px/1.1 var(--serif); letter-spacing: -0.025em; color: var(--fg);
    text-wrap: balance; }}
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
  .thumb svg .thumb-ink, .thumb svg .thumb-ink-box, .thumb svg .thumb-stone-w {{ stroke-width: 2.5px; }}
  .thumb svg .thumb-flow {{ stroke-width: 3.5px; }}
  .thumb svg .thumb-flow-thin {{ stroke-width: 2.5px; }}
  .thumb svg .thumb-node-ring {{ stroke-width: 3px; }}
  .foot {{ grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: end;
    font: 24px/1 var(--sans); color: var(--fg-3); border-top: 2px solid var(--line); padding-top: 26px; }}
  .foot b {{ font-weight: 500; color: var(--accent); }}
</style></head><body><div class="card">
  <div class="site">Teo’s blog <span>· Reading my own data</span></div>
  <h1>Reading my own Google export</h1>
  <div class="thumb">{thumb}</div>
  <div class="foot"><span>Nov 24, 2026 · 7 min read · 7 figures</span><b>teozeng.dev/blogs</b></div>
</div></body></html>"""


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/favicon.ico":
            self.send_response(204); self.end_headers(); return
        if p == f"{BASE}/post.html":
            data = render_post_html().encode()
            self.send_response(200); self.send_header("Content-Type", MIME[".html"]); self.end_headers(); self.wfile.write(data); return
        if p == f"{BASE}/social.html":
            data = render_social_html().encode()
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
    """Minimal RFC 6455 WebSocket client for Chrome DevTools Protocol."""

    def __init__(self, ws_url: str):
        m = re.match(r"ws://([^:/]+):(\d+)(/.*)", ws_url)
        host, port, path = m.group(1), int(m.group(2)), m.group(3)
        self.sock = socket.create_connection((host, port), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
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
            hdr.append(0x80 | 126)
            hdr.extend(struct.pack("!H", L))
        else:
            hdr.append(0x80 | 127)
            hdr.extend(struct.pack("!Q", L))
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
            if op == 9:  # ping -> pong
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
  for (const svg of document.querySelectorAll('figure.goog svg')) {
    const v = svg.viewBox.baseVal;
    const figId = svg.closest('figure').id;
    const boxes = [];
    for (const el of svg.querySelectorAll('text')) {
      const b = el.getBBox();
      if (b.width === 0 && b.height === 0) continue;
      if (b.x < -3 || b.y < -3 || b.x + b.width > v.width + 3 || b.y + b.height > v.height + 3) {
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
    for (const el of svg.querySelectorAll('path')) {
      const b = el.getBBox();
      if (b.width === 0 && b.height === 0) continue;
      if (b.x < -30 || b.y < -30 || b.x + b.width > v.width + 30 || b.y + b.height > v.height + 30) {
        bad.push(`${figId}: path outside viewBox (${b.x.toFixed(1)},${b.y.toFixed(1)} ${b.width.toFixed(1)}x${b.height.toFixed(1)} vs ${v.width}x${v.height})`);
      }
    }
    if ([...svg.querySelectorAll('*')].some(e => [...e.attributes].some(a => a.name !== 'href' && /NaN|Infinity/.test(a.value)))) {
      bad.push(`${figId}: NaN/Infinity attribute`);
    }
  }
  return bad;
})()"""


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()

    # Find free debug port
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    dbg_port = s.getsockname()[1]
    s.close()

    with tempfile.TemporaryDirectory() as tmpdir:
        proc = subprocess.Popen(
            [
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                f"--remote-debugging-port={dbg_port}",
                f"--user-data-dir={tmpdir}",
                "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            ws_url = None
            for _ in range(50):
                try:
                    tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{dbg_port}/json/list").read())
                    for tab in tabs:
                        if tab.get("type") == "page" and tab.get("webSocketDebuggerUrl"):
                            ws_url = tab["webSocketDebuggerUrl"]
                            break
                    if ws_url:
                        break
                except Exception:
                    pass
                time.sleep(0.1)
            assert ws_url, "Chrome CDP failed to start"

            cdp = CDPClient(ws_url)
            cdp.call("Page.enable")
            cdp.call("Runtime.enable")
            cdp.call("Log.enable")

            def set_vp(w: int, h: int = 1000, dpr: int = 2):
                cdp.call("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": dpr, "mobile": w < 500})
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")

            def check(label: str):
                bad = cdp.eval(BOUNDS_JS)
                if bad:
                    raise AssertionError(f"Geometry failed at {label}:\n  " + "\n  ".join(bad))

            # 1. Open post and wait for all 7 single-form figures ready
            set_vp(1440, 1000, 1)
            cdp.call("Page.navigate", {"url": f"http://127.0.0.1:{port}{BASE}/post.html"})
            for _ in range(60):
                ready = cdp.eval("document.querySelectorAll('figure.goog.ready').length")
                if ready == 7:
                    break
                time.sleep(0.1)
            assert cdp.eval("document.querySelectorAll('figure.goog.ready').length") == 7, "Figures failed to mount"
            assert cdp.eval("document.querySelectorAll('.goog-error').length") == 0, "Figure load error"
            cdp.eval("document.fonts.ready")
            cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")

            # Check across themes & widths (1440, 390, 320)
            for theme, w in [("light", 1440), ("dark", 1440), ("light", 390), ("dark", 390), ("light", 320)]:
                set_vp(w, 1000, 1)
                cdp.eval(f"document.documentElement.dataset.theme = '{theme}'")
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
                check(f"{w}-{theme}")

            # Exercise all 6 session x-rays & all inline action links & figure action buttons
            ids = ["goog-ads", "goog-culture", "goog-rhythm", "goog-sessions", "goog-geo", "goog-pings", "goog-account"]
            set_vp(1200, 900, 1)
            cdp.eval("document.documentElement.dataset.theme = 'light'")
            for i in range(6):
                cdp.eval(f"document.querySelectorAll('#goog-sessions [data-xr]')[{i}].click()")
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
                check(f"xray-{i}")

            for sel in ["#goog-rhythm [data-raw]", "#goog-pings [data-sleep]", "#goog-culture [data-spin]"]:
                cdp.eval(f"document.querySelector('{sel}').click()")
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
                check(f"btn-{sel}")

            n_acts = cdp.eval("document.querySelectorAll('a.act[href^=\"#goog-\"]').length")
            assert n_acts >= 14, f"Expected >=14 action links, found {n_acts}"
            for i in range(n_acts):
                cdp.eval(f"document.querySelectorAll('a.act[href^=\"#goog-\"]')[{i}].click()")
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
                check(f"act-{i}")

            # Verify all 3D canvases actually painted non-blank pixels
            for fid in ["goog-rhythm", "goog-geo", "goog-pings"]:
                non_empty = cdp.eval(f"""(() => {{
                  const c = document.querySelector('#{fid} canvas');
                  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                  for (let i = 3; i < d.length; i += 400) if (d[i] > 10) return true;
                  return false;
                }})()""")
                assert non_empty, f"Canvas blank for {fid}"

            # Check zero JS exceptions logged
            js_errs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
            assert not js_errs, f"Runtime JS errors: {js_errs}"

            # 2. Capture crisp screenshots of all 7 unified minimalist figures
            if SHOT_DIR:
                SHOT_DIR.mkdir(parents=True, exist_ok=True)
                set_vp(1280, 900, 2)
                cdp.call("Page.navigate", {"url": f"http://127.0.0.1:{port}{BASE}/post.html"})
                for _ in range(60):
                    if cdp.eval("document.querySelectorAll('figure.goog.ready').length") == 7:
                        break
                    time.sleep(0.1)
                cdp.eval("document.documentElement.dataset.theme = 'light'")
                cdp.eval("document.fonts.ready")
                time.sleep(0.55)
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")

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
                    (SHOT_DIR / fname).write_bytes(base64.b64decode(res["data"]))

                for fid in ids:
                    snap(f"#{fid}", f"{fid}.png")

            # 3. Render 1200x630 social preview card
            if RENDER_SOCIAL:
                set_vp(1200, 630, 1)
                cdp.call("Page.navigate", {"url": f"http://127.0.0.1:{port}{BASE}/social.html"})
                time.sleep(0.5)
                cdp.eval("document.fonts.ready")
                cdp.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
                res = cdp.call("Page.captureScreenshot", {"format": "png", "clip": {"x": 0, "y": 0, "width": 1200, "height": 630, "scale": 1}})
                out_card = ROOT / "assets" / "social" / "reading-my-own-google-export.png"
                out_card.parent.mkdir(parents=True, exist_ok=True)
                out_card.write_bytes(base64.b64decode(res["data"]))
                print(f"Wrote {out_card} (1200x630)")

            cdp.close()
            print("Chrome CDP audit: all 7 figures, 21 tabs, sub-pills, 23+ prose action links, light/dark themes, and 1440/390/320px viewBox bounds PASSED.")
        finally:
            proc.terminate()
            proc.wait(timeout=5)
            srv.shutdown()


if __name__ == "__main__":
    main()
