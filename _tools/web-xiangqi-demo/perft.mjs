// Checks the bundled rules (assets/js/web-xiangqi-core.js) against move counts
// from Pikafish's own `go perft`, the cases web-xiangqi's perft.test.ts pins.
//
//   node perft.mjs <web-xiangqi-core.js>
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const ctx = {}
vm.createContext(ctx)
vm.runInContext(readFileSync(process.argv[2], 'utf8') + ';this.X = WebXiangqiCore', ctx)
const X = ctx.X

const CASES = [
  ['start, Red', `${'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR'} w`, [44, 1920, 79666]],
  ['start, Black', `${'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR'} b`, [44, 1920, 79666]],
  ['middlegame', 'r1ba1a3/4kn3/2n1b4/pNp1p1p1p/4c4/6P2/P1P2P2P/1CN1B4/9/2BAKA1R1 w', [6, 163, 5158]],
  ['soldier between generals', '4k4/9/9/9/4P4/9/9/9/9/4K4 w', [4, 10, 51]],
  ['cannon screens', '3ak4/4a4/9/9/2C1c4/9/2P1p4/9/4A4/3AK4 w', [10, 157, 2164]],
  ['advisors and elephants', '3ak4/4a4/9/9/9/9/9/4B4/4A4/3AK1B2 w', [8, 31, 193]],
]

function perft(board, side, depth) {
  if (depth === 0) return 1
  let n = 0
  for (let r = 0; r < 10; r++) for (let f = 0; f < 9; f++) {
    const p = board[r][f]
    if (!p || (p === p.toUpperCase()) !== (side === 'w')) continue
    for (const t of X.legalMovesFrom(board, f, r, side)) {
      if (depth === 1) { n++; continue }
      const next = X.cloneBoardState(board)
      next[t.rank][t.file] = p
      next[r][f] = ''
      n += perft(next, side === 'w' ? 'b' : 'w', depth - 1)
    }
  }
  return n
}

let failed = 0
for (const [name, fen, want] of CASES) {
  const [placement, side] = fen.split(' ')
  const board = X.parseFenBoard(placement)
  const got = want.map((_, i) => perft(board, side, i + 1))
  const ok = got.every((v, i) => v === want[i])
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got.join(' / ')}${ok ? '' : ` (Pikafish: ${want.join(' / ')})`}`)
}
if (failed) process.exit(1)
