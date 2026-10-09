// Pikafish, as web-xiangqi ships it (dist/ cores and pikafish.nnue), in Node,
// through the repo's own loader. Output can arrive synchronously inside
// postMessage, so every wait scans from the line count noted before sending.
const path = require('path')

const WEB_XIANGQI = process.env.WEB_XIANGQI || path.resolve(__dirname, '../../../web-xiangqi')

async function boot({ variant = 'single-simd', threads = 1, hashMb = 64 } = {}) {
  const { loadPikafishNode } = require(path.join(WEB_XIANGQI, 'scripts/load-pikafish-node.cjs'))
  const dist = path.join(WEB_XIANGQI, 'dist')
  const p = loadPikafishNode(dist, variant, 'blog-demo')
  const engine = await p.createPikafish({
    basePath: dist,
    nnuePath: path.join(dist, 'pikafish.nnue'),
    variant: p.variant,
    coreFactory: p.coreFactory,
    allowSIMD: p.variant.includes('simd'),
    threads,
  })
  const lines = []
  let wake = null
  engine.addMessageListener(line => { lines.push(line); if (wake) wake() })
  // Pthread workers do not hold Node's event loop open.
  const keepalive = setInterval(() => {}, 1000)

  async function until(from, pred, timeoutMs = 600000) {
    const t0 = Date.now()
    for (;;) {
      for (let i = from; i < lines.length; i++) if (pred(lines[i])) return i
      if (Date.now() - t0 > timeoutMs) throw new Error('timeout')
      await new Promise(r => { wake = r; setTimeout(r, 50) })
      wake = null
    }
  }
  function send(cmd) { engine.postMessage(cmd) }
  async function ready() {
    const from = lines.length
    send('isready')
    await until(from, l => l === 'readyok')
  }

  let from = lines.length
  send('uci')
  await until(from, l => l === 'uciok')
  const name = lines.find(l => l.startsWith('id name ')).slice(8)
  send(`setoption name Threads value ${threads}`)
  send(`setoption name Hash value ${hashMb}`)
  await ready()

  return {
    name,
    variant: p.variant,
    send,
    ready,
    async fresh() {
      send('ucinewgame')
      send('setoption name Clear Hash')
      await ready()
    },
    // Runs one search and returns every line it printed, bestmove last.
    async search(position, go) {
      const start = lines.length
      send(position)
      send(go)
      const end = await until(start, l => l.startsWith('bestmove'))
      return lines.slice(start, end + 1)
    },
    // Sends commands and returns the first line after them that matches.
    async ask(cmds, pred) {
      const start = lines.length
      for (const c of cmds) send(c)
      return lines[await until(start, pred, 30000)]
    },
    quit() { clearInterval(keepalive); try { engine.terminate && engine.terminate() } catch (_) {} },
  }
}

// The fields web-xiangqi's live analysis reads from an info line.
function parseInfo(line) {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null
  const t = line.split(' ')
  const at = k => { const i = t.indexOf(k); return i < 0 ? undefined : t[i + 1] }
  const s = t.indexOf('score')
  const out = {
    depth: Number(at('depth')),
    seldepth: Number(at('seldepth')),
    multipv: Number(at('multipv') || 1),
    nodes: Number(at('nodes')),
    nps: Number(at('nps')),
    time: Number(at('time')),
    hashfull: Number(at('hashfull')),
    bound: t.includes('lowerbound') ? 'lower' : t.includes('upperbound') ? 'upper' : null,
    pv: t.slice(t.indexOf('pv') + 1),
  }
  if (s >= 0) {
    if (t[s + 1] === 'cp') out.cp = Number(t[s + 2])
    else if (t[s + 1] === 'mate') out.mate = Number(t[s + 2])
  }
  const w = t.indexOf('wdl')
  if (w >= 0) out.wdl = [Number(t[w + 1]), Number(t[w + 2]), Number(t[w + 3])]
  return out
}

module.exports = { boot, parseInfo }
