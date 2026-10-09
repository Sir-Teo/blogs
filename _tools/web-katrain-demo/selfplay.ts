// Searched 9x9 self-play for the blog's review demo. Every position gets a real
// web-katrain MCTS search (bundled b6c96 net, TF.js WASM backend: the pure-JS
// CPU backend is about 15x slower). The mover mostly plays
// the search's choice; now and then it plays a plausible policy move instead, so
// the review has mistakes of several sizes to show.
import fs from 'node:fs';

import { emptyBoard } from '../../../web-katrain/test/helpers/engineHarness';
import { loadWasmModel as loadHarnessModel } from './wasmModel';
import { MctsSearch } from '../../../web-katrain/src/engine/katago/analyzeMcts';
import { setBoardSize } from '../../../web-katrain/src/engine/katago/fastBoard';
import { applyCapturesInPlace, isValidMove } from '../../../web-katrain/src/utils/gameLogic';
import type { BoardState, Move, Player } from '../../../web-katrain/src/types';

const OUT = process.argv[2] ?? 'game.json';
const SEED = Number(process.argv[3] ?? 1);
const VISITS = Number(process.argv[4] ?? 200);
const SLIP = Number(process.argv[5] ?? 0.18);

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const clone = (b: BoardState): BoardState => b.map((row) => [...row]);
const other = (p: Player): Player => (p === 'black' ? 'white' : 'black');
const enc = (b: BoardState) => b.map((row) => row.map((c) => (c === 'black' ? 'x' : c === 'white' ? 'o' : '.')).join(''));

type Pos = { board: BoardState; prev?: BoardState; prevprev?: BoardState; toPlay: Player; history: Move[] };

function play(p: Pos, x: number, y: number): Pos {
  const board = clone(p.board);
  if (x >= 0) {
    board[y]![x] = p.toPlay;
    applyCapturesInPlace(board, x, y, p.toPlay);
  }
  return { board, prev: p.board, prevprev: p.prev, toPlay: other(p.toPlay), history: [...p.history, { x, y, player: p.toPlay } as Move] };
}

async function main() {
  const N = 9;
  const KOMI = 7;
  setBoardSize(N);
  const model = await loadHarnessModel();
  const rand = mulberry32(SEED);
  let pos: Pos = { board: emptyBoard(N), toPlay: 'black', history: [] };
  const frames: any[] = [];
  let passes = 0;
  const t0 = Date.now();
  for (let moveNo = 0; moveNo < 90; moveNo++) {
    const search = await MctsSearch.create({
      model,
      board: pos.board,
      previousBoard: pos.prev,
      previousPreviousBoard: pos.prevprev,
      currentPlayer: pos.toPlay,
      moveHistory: pos.history,
      komi: KOMI,
      rules: 'chinese',
      nnRandomize: true,
      conservativePass: true,
      maxChildren: 30,
      ownershipMode: 'tree',
      wideRootNoise: 0,
    });
    await search.run({ visits: VISITS, maxTimeMs: 600000, batchSize: 8 });
    const a = search.getAnalysis({ topK: 8, analysisPvLen: 6 });
    const moves = a.moves;
    frames.push({
      board: enc(pos.board),
      toPlay: pos.toPlay === 'black' ? 'b' : 'w',
      winB: r(a.rootWinRate, 4),
      leadB: r(a.rootScoreLead, 2),
      rawWinB: r(a.rawWinRate, 4),
      rawLeadB: r(a.rawScoreLead, 2),
      visits: a.rootVisits,
      own: Array.from(a.ownership, (v) => r(v, 2)),
      pol: Array.from({ length: N * N }, (_, i) => r(Math.max(0, a.policy[i] ?? 0), 4)),
      cands: moves.slice(0, 8).map((m) => ({
        x: m.x,
        y: m.y,
        v: m.visits,
        p: r(m.prior, 4),
        w: r(m.winRate, 4),
        s: r(m.scoreLead, 2),
        pl: r(m.pointsLost, 2),
        pv: m.pv.slice(0, 6),
      })),
    });
    if (passes >= 2) break;

    // Choose: the search's top move, or with probability SLIP a policy-sampled
    // alternative from the top few candidates (a plausible human slip).
    let pick = moves[0]!;
    if (moveNo >= 4 && rand() < SLIP && moves.length > 2) {
      const pool = moves.slice(1, 6).filter((m) => m.x >= 0);
      const w = pool.map((m) => Math.max(m.prior, 1e-4));
      let u = rand() * w.reduce((s, v) => s + v, 0);
      for (let k = 0; k < pool.length; k++) {
        u -= w[k]!;
        if (u <= 0) {
          pick = pool[k]!;
          break;
        }
      }
      frames[frames.length - 1].slip = true;
    }
    if (pick.x < 0) {
      passes++;
      frames[frames.length - 1].move = 'pass';
      pos = play(pos, -1, -1);
    } else {
      if (!isValidMove(pos.board, pick.x, pick.y, pos.toPlay, pos.prev)) throw new Error(`illegal ${pick.x},${pick.y}`);
      passes = 0;
      frames[frames.length - 1].move = [pick.x, pick.y];
      pos = play(pos, pick.x, pick.y);
    }
    process.stderr.write(`.${moveNo}`);
  }
  const f = frames;
  const losses: number[] = [];
  for (let k = 0; k + 1 < f.length; k++) {
    const sign = f[k].toPlay === 'b' ? 1 : -1;
    losses.push(r(sign * (f[k].leadB - f[k + 1].leadB), 2));
  }
  fs.writeFileSync(OUT, JSON.stringify({ size: N, komi: KOMI, rules: 'chinese', visits: VISITS, seed: SEED, frames }));
  console.log(
    '\n' +
      JSON.stringify({
        secs: (Date.now() - t0) / 1000,
        moves: f.length - 1,
        final: f[f.length - 1].leadB,
        losses,
        slips: f.map((x: any, i: number) => (x.slip ? i : -1)).filter((i: number) => i >= 0),
        leads: f.map((x: any) => x.leadB),
      }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
