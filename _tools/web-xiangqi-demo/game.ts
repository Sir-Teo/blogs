// A game between two of web-xiangqi's opponent levels, then reviewed by the
// app's own review code, with Pikafish (single-simd, as shipped) in Node.
//
//   node game.mjs <out.json> <red level 1-6> <black level 1-6> <seed> [review depth] [--scan]
//
// Moves are chosen by getAiSearchConfig + chooseAiMoveFromPv with a seeded
// random, searching `go depth D` without the app's movetime so a rerun with the
// same seed plays the same game. The review searches every position at the high
// tier's base depth (16, again without its time limit or revisit pass) and
// grades with computeReviewArtifacts. A third pass asks for three lines per
// position for the candidate list.
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import {
  AI_STRENGTH_LABELS, chooseAiMoveFromPv, getAiSearchConfig, type AiCandidateLine, type AiStrength,
} from '../../../web-xiangqi/src/utils/aiOpponent'
import { computeReviewArtifacts, getMoveAccuracyForWinPercentLoss } from '../../../web-xiangqi/src/utils/review'
import {
  START_POSITION_FEN, boardToFen, hasAnyLegalMove, parseFenBoard, validateMoveStr, type BoardState, type Side,
} from '../../../web-xiangqi/src/utils/xiangqi'

const { boot, parseInfo } = createRequire(import.meta.url)(`${process.env.XQ_DEMO}/pikafish.cjs`)

const args = process.argv.slice(2)
const scan = args.includes('--scan')
const [out, redArg, blackArg, seedArg, depthArg] = args.filter(a => a !== '--scan')
const levels: Record<Side, AiStrength> = { w: Number(redArg) as AiStrength, b: Number(blackArg) as AiStrength }
const seed = Number(seedArg)
const reviewDepth = Number(depthArg || 16)
const MAX_PLIES = 200
const MATE = 30000

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const random = mulberry32(seed)

// Side-to-move score in the app's encoding: centipawns, or a mate sentinel.
type Info = { depth: number; multipv: number; cp?: number; mate?: number; bound: string | null; pv: string[]; nodes: number }
const scoreOf = (i: Info) => (i.mate !== undefined ? (i.mate > 0 ? MATE - i.mate : -MATE - i.mate) : i.cp!)

const engine = await boot({ variant: 'single-simd', threads: 1, hashMb: 64 })
const startBoard = parseFenBoard(START_POSITION_FEN.split(' ')[0])

// ---- play ------------------------------------------------------------------
let board: BoardState = startBoard
let side: Side = 'w'
const moves: { uci: string; piece: string; captured: string }[] = []
const seen = new Map<string, number>()
let result = '*'
let ending = ''
await engine.fresh()
let multiPv = 0
while (moves.length < MAX_PLIES) {
  if (!hasAnyLegalMove(board, side)) {
    result = side === 'w' ? '0-1' : '1-0'
    ending = 'no legal move'
    break
  }
  const key = boardToFen(board, side)
  seen.set(key, (seen.get(key) ?? 0) + 1)
  if (seen.get(key)! >= 3) { result = '1/2-1/2'; ending = 'third repetition'; break }

  const config = getAiSearchConfig(levels[side], 12)
  if (config.multiPv !== multiPv) {
    engine.send(`setoption name MultiPV value ${config.multiPv}`)
    multiPv = config.multiPv
    await engine.ready()
  }
  const position = `position startpos${moves.length ? ' moves ' + moves.map(m => m.uci).join(' ') : ''}`
  const lines: string[] = await engine.search(position, `go depth ${config.depth}`)
  const infos = lines.map(parseInfo).filter(Boolean) as Info[]
  const byPv = new Map<number, Info>()
  for (const i of infos) {
    if (i.bound) continue
    const prior = byPv.get(i.multipv)
    if (!prior || i.depth >= prior.depth) byPv.set(i.multipv, i)
  }
  const pvLines: AiCandidateLine[] = [...byPv.values()].map(i => ({ score: scoreOf(i), moves: i.pv, multipv: i.multipv, searchTag: null }))
  const bestmove = lines[lines.length - 1].split(' ')[1]
  const choice = chooseAiMoveFromPv({
    fallbackMove: bestmove,
    fallbackScore: pvLines[0]?.score ?? 0,
    pvLines,
    searchTag: null,
    strength: levels[side],
    random,
  })
  const check = validateMoveStr(choice.move, board, side)
  if (!check.ok) throw new Error(`illegal ${choice.move}: ${check.reason}`)
  const next = board.map(r => r.slice())
  const piece = next[Number(choice.move[1])][choice.move.charCodeAt(0) - 97]
  const captured = next[Number(choice.move[3])][choice.move.charCodeAt(2) - 97]
  next[Number(choice.move[3])][choice.move.charCodeAt(2) - 97] = piece
  next[Number(choice.move[1])][choice.move.charCodeAt(0) - 97] = ''
  moves.push({ uci: choice.move, piece, captured })
  board = next
  side = side === 'w' ? 'b' : 'w'
}
if (!ending) ending = `stopped at ${MAX_PLIES} plies`
console.log(`${AI_STRENGTH_LABELS[levels.w]} (Red) vs ${AI_STRENGTH_LABELS[levels.b]} (Black), seed ${seed}: ${result} after ${moves.length} plies, ${ending}`)

// ---- review ----------------------------------------------------------------
type Eval = { score: number; cp: number | null; mate: number | null; best: string; pv: string[]; nodes: number }
async function searchAll(mpv: number) {
  await engine.fresh()
  engine.send(`setoption name MultiPV value ${mpv}`)
  await engine.ready()
  const res: Info[][] = []
  for (let ply = 0; ply <= moves.length; ply++) {
    const stm: Side = ply % 2 === 0 ? 'w' : 'b'
    const position = `position startpos${ply ? ' moves ' + moves.slice(0, ply).map(m => m.uci).join(' ') : ''}`
    if (ply === moves.length && ending === 'no legal move') { res.push([]); continue }
    const lines: string[] = await engine.search(position, `go depth ${reviewDepth}`)
    const byPv = new Map<number, Info>()
    for (const i of lines.map(parseInfo).filter(Boolean) as Info[]) {
      if (i.bound || i.depth !== reviewDepth) continue
      byPv.set(i.multipv, i)
    }
    res.push([...byPv.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]))
    void stm
  }
  return res
}
const t0 = Date.now()
const graded = await searchAll(1)
const gradeMs = Date.now() - t0
const red = (ply: number, s: number) => (ply % 2 === 0 ? s : -s)
const evals: Eval[] = graded.map((set, ply) => {
  if (!set.length) {
    // The side to move has no legal move and has lost.
    const s = ply % 2 === 0 ? -MATE : MATE
    return { score: s, cp: null, mate: 0, best: '', pv: [], nodes: 0 }
  }
  const i = set[0]
  return {
    score: red(ply, scoreOf(i)),
    cp: i.cp === undefined ? null : red(ply, i.cp),
    mate: i.mate === undefined ? null : red(ply, i.mate),
    best: i.pv[0],
    pv: i.pv.slice(0, 12),
    nodes: i.nodes,
  }
})

const treeNodes: Record<string, { parentId: string | null; record?: Record<string, unknown> }> = { root: { parentId: null } }
const ids: string[] = []
moves.forEach((m, k) => {
  const id = `n${k + 1}`
  treeNodes[id] = {
    parentId: k === 0 ? 'root' : `n${k}`,
    record: { uci: m.uci, piece: m.piece, ply: k + 1, evalScore: evals[k + 1].score, bestMove: evals[k].best, bestLine: evals[k].pv },
  }
  ids.push(id)
})
const { summary, annotations } = computeReviewArtifacts(ids, treeNodes as never, { root: evals[0].score }, 0)
console.log(`  graded ${moves.length + 1} positions at depth ${reviewDepth} in ${(gradeMs / 1000).toFixed(1)}s:`,
  `accuracy ${summary.accuracy} (Red ${summary.redAccuracy}, Black ${summary.blackAccuracy}),`,
  `best ${summary.bestCount} good ${summary.goodCount} inacc ${summary.inaccuracyCount} mistake ${summary.mistakeCount} blunder ${summary.blunderCount}`)
for (const a of annotations) if (['inaccuracy', 'mistake', 'blunder'].includes(a.quality)) console.log(`   ply ${a.moveIndex + 1} ${moves[a.moveIndex].uci} ${a.quality} swing ${a.swing} win% -${a.winPercentLoss?.toFixed(1)}`)
if (scan) { engine.quit(); process.exit(0) }

const candidates = await searchAll(3)
engine.quit()

writeFileSync(out, JSON.stringify({
  engine: engine.name,
  variant: engine.variant,
  seed,
  levels: { red: { level: levels.w, label: AI_STRENGTH_LABELS[levels.w] }, black: { level: levels.b, label: AI_STRENGTH_LABELS[levels.b] } },
  result,
  ending,
  reviewDepth,
  gradeMs,
  moves: moves.map(m => m.uci),
  evals: evals.map(e => ({ cp: e.cp, mate: e.mate, best: e.best || null })),
  lines: candidates.map((set, ply) => set.map(i => ({
    pv: i.pv.slice(0, 10),
    cp: i.cp === undefined ? null : red(ply, i.cp),
    mate: i.mate === undefined ? null : red(ply, i.mate),
  }))),
  rows: annotations.map(a => ({
    ply: a.moveIndex + 1,
    quality: a.quality,
    swing: a.swing,
    winLoss: a.winPercentLoss,
    accuracy: getMoveAccuracyForWinPercentLoss(a.winPercentLoss ?? 0),
    best: a.bestMove ?? null,
  })),
  summary: {
    accuracy: summary.accuracy,
    red: summary.redAccuracy,
    black: summary.blackAccuracy,
    acpl: summary.averageCentipawnLoss,
    counts: { best: summary.bestCount, good: summary.goodCount, inaccuracy: summary.inaccuracyCount, mistake: summary.mistakeCount, blunder: summary.blunderCount },
  },
}))
process.exit(0)
