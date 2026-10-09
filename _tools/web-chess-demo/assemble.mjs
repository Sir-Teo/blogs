// Turns review.mjs output into assets/data/web-chess-demo.json: names the
// games, compacts the every-legal-move table, picks the variety figure's first
// position, and prints the numbers the post quotes.
//
//   node assemble.mjs <review.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs'

const [src, out] = process.argv.slice(2)
const data = JSON.parse(readFileSync(src, 'utf8'))
const META = [
  { id: 'opera', tab: 'Opera Game, 1858', short: 'Opera Game', nick: 'Opera', subtitle: 'Morphy against the Duke of Brunswick and Count Isouard, Paris' },
  { id: 'club', tab: 'Club vs Intermediate', short: 'Club vs Intermediate', nick: 'Club game', subtitle: 'web-chess’s Club level as White, Intermediate as Black' },
]
data.games.forEach((g, i) => {
  Object.assign(g, META[i])
  g.title = META[i].tab
  if (g.headers) g.result = g.headers.Result
  delete g.headers
})

// Variety figure: start on an undecided Opera Game position where the old rule
// did the most damage. A forced mate would make every other move look ruinous.
const all = []
data.games.forEach(g => g.allMoves.forEach(p => all.push({ g: g.id, ply: p.ply, moves: p.moves })))
const big = p => p.moves.filter(m => p.moves[0].cp - m.cp >= 300).length / p.moves.length
const open = p => p.g === 'opera' && p.ply >= 8 && Math.abs(p.moves[0].cp) < 300
let start = all.findIndex(open)
all.forEach((p, i) => { if (open(p) && big(p) > big(all[start])) start = i })
data.variety = { start }

function stats(level) {
  const v = { 1: [0.38, 180], 2: [0.2, 90] }[level]
  const s = { old: [0, 0], now: [0, 0] }
  for (const p of all) {
    const n = p.moves.length, top = p.moves[0].cp
    const alts = []
    for (let i = 1; i < Math.min(4, n); i++) if (p.moves[i].cp >= top - v[1] && Math.abs(p.moves[i].cp) < 10000) alts.push(i)
    p.moves.forEach((m, i) => {
      const c = Math.min(1000, top - m.cp)
      const old = (i === 0 ? 1 - v[0] : 0) + v[0] / n
      const now = alts.length ? (i === 0 ? 1 - v[0] : alts.includes(i) ? v[0] / alts.length : 0) : (i === 0 ? 1 : 0)
      s.old[0] += old * c; s.now[0] += now * c
      if (c >= 300) { s.old[1] += old; s.now[1] += now }
    })
  }
  return `old ${(s.old[0] / all.length / 100).toFixed(2)} pawns/move, ${(100 * s.old[1] / all.length).toFixed(1)}% lose 3+; now ${(s.now[0] / all.length / 100).toFixed(2)}, ${(100 * s.now[1] / all.length).toFixed(1)}%`
}

for (const g of data.games) {
  g.allMoves = g.allMoves.map(p => ({ ply: p.ply, moves: p.moves.map(m => ({ san: m.san, uci: m.uci, cp: m.cp })) }))
  console.log(`${g.id}: ${g.frames.length - 1} plies, ${(g.gradeMs / 1000).toFixed(1)}s, ${g.nodes} nodes; accuracy W ${g.summary.white.toFixed(2)} B ${g.summary.black.toFixed(2)}; ${JSON.stringify(g.counts)}`)
  for (const r of g.rows) if (['inaccuracy', 'mistake', 'blunder'].includes(r.quality) || (r.deltaCp ?? 0) < -150) {
    console.log(`  ${r.ply} ${r.san} ${r.quality} ${r.deltaCp}cp ${r.winLoss?.toFixed(2)} pts acc ${r.accuracy?.toFixed(1)} best ${r.best}`)
  }
}
console.log(`variety: ${all.length} positions, start ${all[start].g} ply ${all[start].ply} (${all[start].moves.length} moves)`)
console.log(`Beginner: ${stats(1)}`)
console.log(`Novice:   ${stats(2)}`)
writeFileSync(out, JSON.stringify(data))
