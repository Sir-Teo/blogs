// Merge generator outputs into the blog's demo data file and report what was picked.
// usage: node assemble.mjs <golden out.json> <game.json> <dest.json>
import fs from 'node:fs';

const [goldenPath, gamePath, dest] = process.argv.slice(2);
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8')).golden;
const game = JSON.parse(fs.readFileSync(gamePath, 'utf8'));
const F = game.frames;
const N = game.size;
const COLS = 'ABCDEFGHJKLMNOPQRST';
const name = (x, y) => (x < 0 ? 'pass' : COLS[x] + (N - y));

// Points lost by the move that reached frame k.
const lost = F.map((f, k) => {
  if (k === 0 || F[k - 1].move === 'pass') return null;
  const sign = F[k - 1].toPlay === 'b' ? 1 : -1;
  return sign * (F[k - 1].leadB - f.leadB);
});

// PUCT position: the search's favourite is not the network's favourite, with a
// real value gap between them, early enough that six candidates are distinct.
let best = null;
for (let k = 4; k < Math.min(F.length - 1, 40); k++) {
  const f = F[k];
  const cands = f.cands.filter((c) => c.x >= 0).slice(0, 6);
  if (cands.length < 6) continue;
  const mover = f.toPlay === 'b';
  const win = (c) => (mover ? c.w : 1 - c.w);
  const topPrior = cands.reduce((a, c) => (c.p > a.p ? c : a));
  const topValue = cands.reduce((a, c) => (win(c) > win(a) ? c : a));
  if (topPrior === topValue) continue;
  const gap = win(topValue) - win(topPrior);
  const score = gap * Math.min(topPrior.p, 0.6) + 0.02 * (topValue.v > topPrior.v);
  if (!best || score > best.score) best = { k, score, gap, topPrior, topValue };
}

// Review starts on the position right after the biggest mistake.
let worst = 1;
for (let k = 1; k < F.length; k++) if (lost[k] !== null && (lost[worst] === null || lost[k] > lost[worst])) worst = k;

const out = { golden, game, puct: { at: best ? best.k : 10 }, review: { start: worst } };
fs.writeFileSync(dest, JSON.stringify(out));

console.log('moves', F.length - 1, 'final leadB', F[F.length - 1].leadB, 'last move', JSON.stringify(F[F.length - 2].move));
console.log('bytes', fs.statSync(dest).size);
console.log('losses', lost.map((v) => (v === null ? '-' : v.toFixed(1))).join(' '));
const classes = [12, 6, 3, 1.5, 0.5];
const counts = [0, 0, 0, 0, 0, 0];
lost.forEach((v) => {
  if (v === null) return;
  let i = 0;
  while (i < classes.length && v < classes[i]) i++;
  counts[i]++;
});
console.log('class counts [blunder..best]', counts.join(' '));
console.log('worst', worst, lost[worst]?.toFixed(2), name(...F[worst - 1].move));
if (best) {
  const f = F[best.k];
  console.log('puct at', best.k, 'mover', f.toPlay, 'gap', best.gap.toFixed(3));
  f.cands.filter((c) => c.x >= 0).slice(0, 6).forEach((c) =>
    console.log('  ', name(c.x, c.y), 'p', c.p, 'v', c.v, 'win(mover)', (f.toPlay === 'b' ? c.w : 1 - c.w).toFixed(3), 'pl', c.pl),
  );
  console.log('  raw win(mover)', (f.toPlay === 'b' ? f.rawWinB : 1 - f.rawWinB).toFixed(3), 'visits', f.visits);
}
