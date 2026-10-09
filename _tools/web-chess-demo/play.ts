// A game between two of web-chess's opponent levels, played with the app's own
// settings: aiDifficultyCommands, aiMultiPv, DIFFICULTY_MOVETIME (through
// aiMovetimeMs with no clock), one thread, and pickVarietyMove over the lines
// the search reported, collected the way useAiPlayer collects them.
//
//   node play.mjs <out.pgn> <white level 1-8> <black level 1-8> [seed] [max plies]
//
// The variety roll is seeded; Stockfish's own strength limit is not, so a
// rerun plays a different game. The post's game is kept in games/.
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Chess } from 'chess.js'
import {
  DIFFICULTY_LABELS, aiDifficultyCommands, aiMovetimeMs, aiMultiPv, pickVarietyMove, type AiDifficulty,
} from '../../../web-chess/src/hooks/useAiPlayer'
import { parseInfoLine, type EngineLine } from '../../../web-chess/src/hooks/useStockfishEngine'

const WEB_CHESS = process.env.WEB_CHESS!
const require = createRequire(import.meta.url)
const initEngine = require(`${WEB_CHESS}/node_modules/stockfish`)
const [out, w, b, seedArg, maxArg] = process.argv.slice(2)
const levels = { w: Number(w) as AiDifficulty, b: Number(b) as AiDifficulty }
const seed = Number(seedArg || 1)
const maxPlies = Number(maxArg || 160)

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const random = mulberry32(seed)

const engine = await initEngine('lite-single')
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
engine.sendCommand('setoption name Hash value 16')
engine.sendCommand('setoption name Threads value 1')
engine.sendCommand('ucinewgame')

const game = new Chess()
const startFen = game.fen()
const ucis: string[] = []
const notes: string[] = []
let current: AiDifficulty | null = null
while (!game.isGameOver() && ucis.length < maxPlies) {
  const level = levels[game.turn()]
  if (level !== current) {
    for (const c of aiDifficultyCommands(level)) engine.sendCommand(c)
    engine.sendCommand(`setoption name MultiPV value ${aiMultiPv(level)}`)
    current = level
  }
  engine.sendCommand('isready')
  await until(l => l === 'readyok')
  lines = []
  engine.sendCommand(`position fen ${startFen}${ucis.length ? ' moves ' + ucis.join(' ') : ''}`)
  engine.sendCommand(`go movetime ${aiMovetimeMs(level, null)}`)
  await until(l => l.startsWith('bestmove'))

  const held = new Map<number, EngineLine>()
  for (const l of lines) {
    if (!l.startsWith('info ')) continue
    const parsed = parseInfoLine(l)
    if (!parsed?.pv[0]) continue
    const prior = held.get(parsed.multipv)
    if (!prior || parsed.depth >= prior.depth) held.set(parsed.multipv, parsed)
  }
  const engineMove = lines.find(l => l.startsWith('bestmove '))!.split(' ')[1]
  const searchLines = [...held.values()].map(h => ({ multipv: h.multipv, cp: h.cp, mate: h.mate, move: h.pv[0]! }))
  const move = pickVarietyMove(level, searchLines, engineMove, random)!
  const played = game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] })
  ucis.push(move)
  if (move !== engineMove) notes.push(`${Math.ceil(ucis.length / 2)}${played.color === 'w' ? '.' : '...'} ${played.san}: varied from ${engineMove}`)
}

let result = '*'
if (game.isCheckmate()) result = game.turn() === 'w' ? '0-1' : '1-0'
else if (game.isDraw()) result = '1/2-1/2'
game.setHeader('Event', 'web-chess opponent levels')
game.setHeader('White', `${DIFFICULTY_LABELS[levels.w]} (level ${levels.w})`)
game.setHeader('Black', `${DIFFICULTY_LABELS[levels.b]} (level ${levels.b})`)
game.setHeader('Result', result)
game.setHeader('Annotator', `play.ts seed ${seed}`)
writeFileSync(out, game.pgn() + '\n')
console.log(`${game.getHeaders().White} vs ${game.getHeaders().Black}: ${result} in ${ucis.length} plies`)
for (const n of notes) console.log('  ' + n)
process.exit(0)
