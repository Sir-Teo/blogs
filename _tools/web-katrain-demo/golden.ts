// KataGo's golden 5x5 position through web-katrain's own parser, graph, input
// planes and post-processing, on the TF.js CPU backend exactly as
// test/engineGolden.test.ts does it. Writes { golden: { diagram, ours } }.
import fs from 'node:fs';
import * as tf from '@tensorflow/tfjs';

import { loadHarnessModel } from '../../../web-katrain/test/helpers/engineHarness';
import { postprocessKataGoV8 } from '../../../web-katrain/src/engine/katago/evalV8';
import { fillInputsV7Fast } from '../../../web-katrain/src/engine/katago/featuresV7Fast';
import {
  BLACK,
  BOARD_AREA,
  WHITE,
  computeAreaMapV7KataGo,
  computeLadderFeaturesV7KataGo,
  computeLadderedStonesV7KataGo,
  setBoardSize,
} from '../../../web-katrain/src/engine/katago/fastBoard';

const OUT = process.argv[2] ?? 'golden.json';

const r = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

// --------------------------------------------------------------------------
// 1. KataGo golden position: web-katrain vs KataGo's own recorded output.
// --------------------------------------------------------------------------
async function golden() {
  const SIZE = 5;
  const DIAGRAM = ['.....', '...x.', '..o..', '.xxo.', '.....'];
  const SYM = 3;
  const symPoint = (x: number, y: number, n: number, sym: number): [number, number] => {
    let px = x;
    let py = y;
    if (sym & 1) py = n - 1 - py;
    if (sym & 2) px = n - 1 - px;
    if (sym & 4) [px, py] = [py, px];
    return [px, py];
  };
  const model = await loadHarnessModel();
  setBoardSize(SIZE);
  const stones = new Uint8Array(BOARD_AREA);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const ch = DIAGRAM[y]![x]!;
      stones[y * SIZE + x] = ch === 'x' ? BLACK : ch === 'o' ? WHITE : 0;
    }
  const baseSpatial = new Float32Array(BOARD_AREA * 22);
  const global = new Float32Array(19);
  const ladder = computeLadderFeaturesV7KataGo({ stones, koPoint: -1, currentPlayer: WHITE });
  const prevLaddered = computeLadderedStonesV7KataGo({ stones, koPoint: -1 });
  fillInputsV7Fast({
    stones,
    koPoint: -1,
    currentPlayer: 'white',
    recentMoves: [],
    komi: 7.5,
    rules: 'chinese',
    conservativePassAndIsRoot: false,
    areaMap: computeAreaMapV7KataGo(stones, true),
    ladderedStones: ladder.ladderedStones,
    ladderWorkingMoves: ladder.ladderWorkingMoves,
    prevLadderedStones: prevLaddered,
    prevPrevLadderedStones: prevLaddered,
    outSpatial: baseSpatial,
    outGlobal: global,
  });
  global[6] = 1.0;
  global[7] = 0.5;
  global[8] = 1.0;
  const spatial = new Float32Array(BOARD_AREA * 22);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const [tx, ty] = symPoint(x, y, SIZE, SYM);
      for (let c = 0; c < 22; c++) spatial[(ty * SIZE + tx) * 22 + c] = baseSpatial[(y * SIZE + x) * 22 + c]!;
    }
  const st = tf.tensor4d(spatial, [1, SIZE, SIZE, 22]);
  const gt = tf.tensor2d(global, [1, 19]);
  const out = model.forward(st, gt);
  const [policyArr, passArr, valueArr, scoreArr, ownershipArr] = (await Promise.all([
    out.policy.data(),
    out.policyPass.data(),
    out.value.data(),
    out.scoreValue.data(),
    out.ownership.data(),
  ])) as Float32Array[];
  const ev = postprocessKataGoV8({
    nextPlayer: 'white',
    valueLogits: valueArr,
    scoreValue: scoreArr,
    postProcessParams: model.postProcessParams,
  });
  const ownership: number[][] = [];
  const logits = new Float32Array(BOARD_AREA + 1);
  for (let y = 0; y < SIZE; y++) {
    const row: number[] = [];
    for (let x = 0; x < SIZE; x++) {
      const [tx, ty] = symPoint(x, y, SIZE, SYM);
      row.push(Math.round(Math.tanh(ownershipArr[ty * SIZE + tx]!) * 1000));
      logits[y * SIZE + x] = policyArr[(ty * SIZE + tx) * model.policyOutChannels]!;
    }
    ownership.push(row);
  }
  logits[BOARD_AREA] = passArr[0]!;
  let max = -Infinity;
  for (let i = 0; i <= BOARD_AREA; i++) if (i === BOARD_AREA || stones[i] === 0) max = Math.max(max, logits[i]!);
  const probs = new Float64Array(BOARD_AREA + 1);
  let sum = 0;
  for (let i = 0; i <= BOARD_AREA; i++) {
    if (i < BOARD_AREA && stones[i] !== 0) continue;
    probs[i] = Math.exp(logits[i]! - max);
    sum += probs[i]!;
  }
  const policy: number[][] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: number[] = [];
    for (let x = 0; x < SIZE; x++) row.push(stones[y * SIZE + x] ? -1 : Math.round((probs[y * SIZE + x]! / sum) * 1000));
    policy.push(row);
  }
  return {
    diagram: DIAGRAM,
    ours: {
      win: r(1 - ev.blackWinProb - ev.blackNoResultProb, 4),
      lead: r(-ev.blackScoreLead, 3),
      scoreMean: r(-ev.blackScoreMean, 3),
      policy,
      pass: Math.round((probs[BOARD_AREA]! / sum) * 1000),
      ownership,
    },
  };
}

golden().then((g) => {
  fs.writeFileSync(OUT, JSON.stringify({ golden: g }));
  console.log(JSON.stringify({ win: g.ours.win, lead: g.ours.lead }));
});
