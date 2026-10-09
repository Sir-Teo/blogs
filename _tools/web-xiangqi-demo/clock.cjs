// The same endgame searched at every value of the FEN's halfmove clock.
//
//   node clock.cjs <out.json> <fen with CLOCK> [depth]
const { writeFileSync } = require('fs')
const { boot, parseInfo } = require('./pikafish.cjs')
const [out, fen, depthArg] = process.argv.slice(2)
const depth = Number(depthArg || 14)
;(async () => {
  const e = await boot({ variant: 'single-simd', threads: 1, hashMb: 64 })
  const rows = []
  for (let clock = 0; clock <= 120; clock++) {
    await e.fresh()
    const lines = await e.search(`position fen ${fen.replace('CLOCK', clock)}`, `go depth ${depth}`)
    const info = lines.map(parseInfo).filter(i => i && i.depth === depth && !i.bound).pop()
    rows.push({ clock, cp: info.cp ?? null, mate: info.mate ?? null, pv: info.pv.slice(0, 8) })
  }
  e.quit()
  const show = r => (r.mate !== null ? 'M' + r.mate : r.cp)
  console.log(fen, rows.filter(r => r.clock % 10 === 0 || r.clock > 110).map(r => `${r.clock}:${show(r)}`).join(' '))
  writeFileSync(out, JSON.stringify({ engine: e.name, depth, fen, rows }))
  process.exit(0)
})()
