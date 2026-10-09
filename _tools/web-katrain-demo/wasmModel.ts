import fs from 'node:fs';
import zlib from 'node:zlib';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import { parseKataGoModelV8 } from '../../../web-katrain/src/engine/katago/loadModelV8';
import { KataGoModelV8Tf } from '../../../web-katrain/src/engine/katago/modelV8';

// Runtime paths come from run.sh, which knows where the web-katrain checkout is.
const WK = process.env.WEB_KATRAIN ?? '../../../web-katrain';
const MODEL = `${WK}/public/models/katago-small.bin.gz`;
let p: Promise<KataGoModelV8Tf> | null = null;
export function loadWasmModel(): Promise<KataGoModelV8Tf> {
  if (!p) p = (async () => {
    setWasmPaths(`${WK}/node_modules/@tensorflow/tfjs-backend-wasm/dist/`);
    const ok = await tf.setBackend(process.env.TF_BACKEND ?? 'wasm');
    await tf.ready();
    process.stderr.write(`backend=${tf.getBackend()} ok=${ok}\n`);
    return new KataGoModelV8Tf(parseKataGoModelV8(new Uint8Array(zlib.gunzipSync(fs.readFileSync(MODEL)))));
  })();
  return p;
}
