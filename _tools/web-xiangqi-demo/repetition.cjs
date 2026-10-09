// Two repeating lines, and what Pikafish's own repetition rules make of them
// after each move. web-xiangqi's build patch exposes Position::rule_judge as a
// `rulejudge` UCI command; the outcome is from the side to move's point of view.
//
//   node repetition.cjs <out.json>
const { writeFileSync } = require('fs')
const { boot } = require('./pikafish.cjs')
const LINES = {
  check: {
    fen: '9/4k4/R8/9/9/9/9/9/9/3K5 w - - 0 1',
    moves: ['a7a8', 'e8e9', 'a8a9', 'e9e8', 'a9a8', 'e8e9', 'a8a9', 'e9e8', 'a9a8', 'e8e9', 'a8a9'],
  },
  chase: {
    fen: '4k4/9/7n1/9/9/9/9/9/9/3K3R1 w - - 0 1',
    moves: ['h0h1', 'h7g9', 'h1g1', 'g9h7', 'g1h1', 'h7g9', 'h1g1', 'g9h7', 'g1h1', 'h7g9', 'h1g1'],
  },
}
;(async () => {
  const e = await boot({ variant: 'single-simd', threads: 1, hashMb: 16 })
  const out = {}
  for (const [name, line] of Object.entries(LINES)) {
    const judged = []
    for (let k = 0; k <= line.moves.length; k++) {
      const position = `position fen ${line.fen}${k ? ' moves ' + line.moves.slice(0, k).join(' ') : ''}`
      const reply = await e.ask([position, 'rulejudge'], l => l.startsWith('rulejudge'))
      const m = reply.match(/claim outcome (\w+)/)
      judged.push(m ? m[1] : null)
    }
    out[name] = { ...line, judged }
    console.log(name, judged.map((j, k) => `${k}:${j || '-'}`).join(' '))
  }
  e.quit()
  writeFileSync(process.argv[2], JSON.stringify({ engine: e.name, lines: out }))
  process.exit(0)
})()
