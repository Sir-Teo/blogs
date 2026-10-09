// Merges the generators' output into assets/data/web-xiangqi-demo.json.
//
//   node assemble.mjs <game.json> <clock-mate.json> <clock-won.json> <repetition.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs'

const read = p => JSON.parse(readFileSync(p, 'utf8'))
const [gameP, mateP, wonP, repP, out] = process.argv.slice(2)
const game = read(gameP)
const clocks = [read(mateP), read(wonP)]
const rep = read(repP)
const show = r => (r.mate !== null ? 'M' + r.mate : (r.cp / 100).toFixed(2))
for (const c of clocks) {
  const flip = c.rows.findIndex((r, i) => i > 0 && (r.mate === null) !== (c.rows[i - 1].mate === null) || (i > 0 && r.cp === 0 && c.rows[i - 1].cp !== 0))
  console.log(`${c.fen}: ${c.rows.filter(r => r.clock % 20 === 0).map(r => `${r.clock}:${show(r)}`).join(' ')}; last nonzero before 0.00 at clock ${c.rows.filter(r => r.cp !== 0).pop().clock}`)
  void flip
}
const s = game.summary
console.log(`game: ${game.levels.red.label} vs ${game.levels.black.label}, seed ${game.seed}, ${game.moves.length} plies, ${game.result} (${game.ending}); accuracy ${s.accuracy} (Red ${s.red}, Black ${s.black}); ${JSON.stringify(s.counts)}`)
for (const r of game.rows) if (r.quality !== 'best' && r.quality !== 'good') console.log(`  ply ${r.ply} ${game.moves[r.ply - 1]} ${r.quality} swing ${r.swing} win -${r.winLoss.toFixed(1)} best ${r.best}`)
writeFileSync(out, JSON.stringify({
  engine: game.engine,
  game,
  clocks: [
    { id: 'mate', tab: 'Mate in three', ...clocks[0] },
    { id: 'won', tab: 'A won ending', ...clocks[1] },
  ],
  repetition: rep.lines,
}))
