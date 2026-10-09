// Games through web-chess's own review code, with Stockfish 18 Lite (the
// single-threaded WASM build the app ships) running in Node.
//
//   node review.mjs <out.json> <depth> <allDepth> <game.pgn>... [--scan]
//
// For each game, three passes, each after `ucinewgame` and a cleared hash so
// one cannot warm the next one's table (the npm loader boots one engine per
// process):
//   1. grading: MultiPV 1 at the app's default review depth, read with the
//      review pool's own snapshotFromSearchLines, graded by buildReviewRows
//      with the opening table wired in, as the app does;
//   2. lines: MultiPV 3 at the same depth, for the candidate list;
//   3. every legal move scored (MultiPV = number of legal moves) at allDepth,
//      for the figure about the weak levels. Skipped when allDepth is 0.
// --scan runs the grading pass only and prints a one-line summary per game.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Chess } from 'chess.js'
import {
  accuracyFromWinPercentLoss, buildReviewRows, pvLineMoves, scoreToCp, summarizeAccuracy, summarizeReview,
  winPercentFromCp, type EvalSnapshot,
} from '../../../web-chess/src/engine/analysis'
import { volatilityWeights } from '../../../web-chess/src/engine/accuracyAggregate'
import { snapshotFromSearchLines } from '../../../web-chess/src/engine/reviewPoolRunner'
import { buildPositionCommand } from '../../../web-chess/src/engine/uci'
import { parseInfoLine } from '../../../web-chess/src/hooks/useStockfishEngine'

const WEB_CHESS = process.env.WEB_CHESS!
const require = createRequire(import.meta.url)
const initEngine = require(`${WEB_CHESS}/node_modules/stockfish`)
const args = process.argv.slice(2)
const scan = args.includes('--scan')
const [out, depthArg, allDepthArg, ...pgns] = args.filter(a => a !== '--scan')
const depth = Number(depthArg)
const allDepth = Number(allDepthArg)

const eco = JSON.parse(readFileSync(`${WEB_CHESS}/src/assets/eco.json`, 'utf8')) as Record<string, { eco: string; name: string }>
const openingKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ')
const isBookPosition = (fen: string) => Boolean(eco[openingKey(fen)])

type Engine = { listener: (line: string) => void; sendCommand: (cmd: string) => void }
const engine: Engine = await initEngine('lite-single')
let lines: string[] = []
let waiter: ((l: string) => boolean) | null = null
let done: (() => void) | null = null
engine.listener = (line: string) => {
  lines.push(line)
  if (waiter && waiter(line)) { waiter = null; done!() }
}
const until = (pred: (l: string) => boolean) => new Promise<void>(r => { waiter = pred; done = r })
engine.sendCommand('uci')
await until(l => l === 'uciok')
const engineName = lines.find(l => l.startsWith('id name '))!.slice(8)

type Target = { fen: string; moves: string[] }
async function fresh(options: Record<string, string | number>) {
  engine.sendCommand('ucinewgame')
  engine.sendCommand('setoption name Clear Hash')
  for (const [k, v] of Object.entries(options)) engine.sendCommand(`setoption name ${k} value ${v}`)
  engine.sendCommand('isready')
  await until(l => l === 'readyok')
}
async function search(rootFen: string, t: Target, go: string, extra: string[] = []) {
  for (const c of extra) engine.sendCommand(c)
  lines = []
  engine.sendCommand(buildPositionCommand(t.fen, t.moves, rootFen))
  engine.sendCommand(go)
  await until(l => l.startsWith('bestmove'))
  return lines
}

// White's point of view, for the graph and the bar.
const whiteCp = (fen: string, cp: number) => (fen.split(' ')[1] === 'w' ? cp : -cp)

async function reviewGame(path: string) {
  const game = new Chess()
  game.loadPgn(readFileSync(path, 'utf8'))
  const history = game.history({ verbose: true })
  const headers = game.getHeaders()
  const replay = new Chess()
  const rootFen = replay.fen()
  const targets: Target[] = [{ fen: rootFen, moves: [] }]
  const ucis: string[] = []
  for (const m of history) {
    replay.move(m.san)
    ucis.push(m.from + m.to + (m.promotion ?? ''))
    targets.push({ fen: replay.fen(), moves: [...ucis] })
  }

  // 1. grading
  const t0 = Date.now()
  await fresh({ Hash: 64, MultiPV: 1, UCI_ShowWDL: 'true' })
  const evals = new Map<string, EvalSnapshot>()
  let nodes = 0
  for (const t of targets) {
    if (new Chess(t.fen).isGameOver()) continue
    const snap = snapshotFromSearchLines(await search(rootFen, t, `go depth ${depth}`), Date.now())
    if (snap) { evals.set(t.fen, snap); nodes += snap.nodes ?? 0 }
  }
  const gradeMs = Date.now() - t0
  const rows = buildReviewRows(history as never, evals, rootFen, { isBookPosition })
  const summary = summarizeAccuracy(rows)
  const counts = summarizeReview(rows)
  if (scan) {
    const wins = rows.map(r => (r.sideToMove === 'w' ? r.winPercentBefore! : 100 - r.winPercentBefore!))
    console.log(`${path.split('/').pop()}: ${history.length} plies ${headers.Result}, white win% ${Math.min(...wins).toFixed(0)}..${Math.max(...wins).toFixed(0)}, acc W ${summary.white?.toFixed(1)} B ${summary.black?.toFixed(1)}`,
      JSON.stringify(counts))
    return null
  }

  // 2. candidate lines
  await fresh({ Hash: 64, MultiPV: 3, UCI_ShowWDL: 'true' })
  const lineSets: unknown[][] = []
  for (const t of targets) {
    if (new Chess(t.fen).isGameOver()) { lineSets.push([]); continue }
    const got = await search(rootFen, t, `go depth ${depth}`)
    const byPv = new Map<number, NonNullable<ReturnType<typeof parseInfoLine>>>()
    for (const l of got) {
      if (!l.startsWith('info ')) continue
      const p = parseInfoLine(l)
      if (!p || p.depth !== depth || p.scoreBound) continue
      byPv.set(p.multipv, p)
    }
    lineSets.push([...byPv.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => {
      const pv = pvLineMoves(t.fen, p.pv, 10)
      return {
        san: pv.map(m => m.san),
        uci: p.pv.slice(0, pv.length),
        cp: whiteCp(t.fen, scoreToCp(p.cp, p.mate)!),
        mate: p.mate === undefined ? null : whiteCp(t.fen, p.mate),
      }
    }))
  }

  // 3. every legal move, from the mover's point of view
  const allMoves: { ply: number; moves: { san: string; uci: string; cp: number; mate: number | null }[] }[] = []
  if (allDepth > 0) {
    await fresh({ Hash: 64, MultiPV: 1 })
    for (const [i, t] of targets.entries()) {
      const pos = new Chess(t.fen)
      if (pos.isGameOver()) continue
      const legal = pos.moves({ verbose: true })
      const got = await search(rootFen, t, `go depth ${allDepth}`, [`setoption name MultiPV value ${legal.length}`])
      const byMove = new Map<string, { cp: number; mate: number | null }>()
      for (const l of got) {
        if (!l.startsWith('info ')) continue
        const p = parseInfoLine(l)
        if (!p || p.depth !== allDepth || p.scoreBound) continue
        byMove.set(p.pv[0], { cp: scoreToCp(p.cp, p.mate)!, mate: p.mate ?? null })
      }
      const moves = legal.map(m => {
        const uci = m.from + m.to + (m.promotion ?? '')
        const s = byMove.get(uci)
        if (!s) throw new Error(`no score for ${uci} at ply ${i}`)
        return { san: m.san, uci, cp: s.cp, mate: s.mate }
      }).sort((a, b) => b.cp - a.cp)
      allMoves.push({ ply: i, moves })
    }
  }

  const frames = targets.map((t, i) => {
    const snap = evals.get(t.fen)
    const pos = new Chess(t.fen)
    const mv = i > 0 ? history[i - 1] : null
    let ev: { cp: number; mate: number | null; wdl: number[] | null; depth: number | null }
    if (snap) {
      const flip = t.fen.split(' ')[1] === 'b'
      const wdl = snap.wdl ? (flip ? [snap.wdl.l, snap.wdl.d, snap.wdl.w] : [snap.wdl.w, snap.wdl.d, snap.wdl.l]) : null
      ev = { cp: whiteCp(t.fen, snap.cp), mate: snap.mate === undefined ? null : whiteCp(t.fen, snap.mate), wdl, depth: snap.depth ?? null }
    } else if (pos.isCheckmate()) {
      const whiteLost = pos.turn() === 'w'
      ev = { cp: whiteLost ? -10000 : 10000, mate: 0, wdl: whiteLost ? [0, 0, 1000] : [1000, 0, 0], depth: null }
    } else {
      ev = { cp: 0, mate: null, wdl: [0, 1000, 0], depth: null }
    }
    return {
      fen: t.fen,
      move: mv ? { san: mv.san, from: mv.from, to: mv.to } : null,
      eval: ev,
      best: snap?.bestMove ?? null,
      lines: lineSets[i],
    }
  })

  const last = rows[rows.length - 1]
  const weights = volatilityWeights([
    ...rows.map(r => r.winPercentBefore ?? 50),
    (last.winPercentBefore ?? 50) - (last.winPercentLoss ?? 0),
  ])

  console.log(`${path.split('/').pop()}: ${targets.length} positions graded in ${(gradeMs / 1000).toFixed(1)}s, ${nodes} nodes`)
  console.log('  accuracy', summary.overall?.toFixed(2), summary.white?.toFixed(2), summary.black?.toFixed(2), JSON.stringify(counts))
  for (const r of rows) {
    if (['inaccuracy', 'mistake', 'blunder'].includes(r.quality) || (r.deltaCp ?? 0) < -150) {
      console.log('  ', String(r.ply).padStart(3), r.san.padEnd(7), r.quality.padEnd(11), String(r.deltaCp).padStart(6), r.winPercentLoss?.toFixed(2).padStart(6), 'best', r.bestMoveSan)
    }
  }

  return {
    headers,
    gradeMs,
    nodes,
    frames,
    rows: rows.map((r, i) => ({
      ply: r.ply,
      san: r.san,
      side: r.sideToMove,
      quality: r.quality,
      deltaCp: r.deltaCp ?? null,
      winBefore: r.winPercentBefore ?? null,
      winLoss: r.winPercentLoss ?? null,
      accuracy: r.winPercentLoss === undefined ? null : accuracyFromWinPercentLoss(r.winPercentLoss),
      weight: weights[i],
      best: r.bestMoveSan ?? null,
    })),
    summary,
    counts,
    allMoves,
  }
}

const games = []
for (const p of pgns) games.push(await reviewGame(p))
if (!scan) {
  writeFileSync(out, JSON.stringify({
    engine: engineName,
    depth,
    allDepth,
    hashMb: 64,
    games,
    winCheck: [0, 100, 300, 2000].map(cp => winPercentFromCp(cp)),
  }))
}
process.exit(0)
