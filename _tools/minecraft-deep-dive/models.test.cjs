'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const core = require(path.join(root, 'assets/js/minecraft-core.js'));
const systems = require(path.join(root, 'assets/js/minecraft-systems.js'));
const fields = require(path.join(root, 'assets/js/minecraft-fields.js'));
const engine = require(path.join(root, 'assets/js/minecraft-engine.js'));
const render = require(path.join(root, 'assets/js/minecraft-render.js'));
const story = require(path.join(root, 'assets/js/minecraft-story.js'));
const sandbox = { window: {}, document: { readyState: 'loading', addEventListener() {} } };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/minecraft-world.js'), 'utf8'), sandbox);
const world = sandbox.window.MinecraftWorld;

test('negative block coordinates roundtrip and indices cover a complete section', () => {
  const indices = new Set();
  for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const c = core.coordinate(x, y, z);
    indices.add(c.index);
    assert.equal(c.index, y * 256 + z * 16 + x);
  }
  assert.equal(indices.size, 4096);
  for (let n = -64; n <= 64; n++) {
    const c = core.coordinate(n, n, n);
    assert.equal(c.chunkX * 16 + c.localX, n);
    assert.equal(c.sectionY * 16 + c.localY, n);
    assert.ok(c.localX >= 0 && c.localX < 16);
  }
  assert.equal(core.coordinate(-1, 70, 18).index, 1583);
});

test('local palettes widen at the actual thresholds, including 64-bit padding', () => {
  const cases = [[1, 0, 0], [2, 4, 2048], [16, 4, 2048], [17, 5, 2736], [32, 5, 2736],
    [33, 6, 3280], [64, 6, 3280], [65, 7, 3648], [128, 7, 3648], [129, 8, 4096], [256, 8, 4096]];
  for (const [states, bits, bytes] of cases) {
    const c = systems.paletteConfig(states);
    assert.equal(c.bits, bits);
    assert.equal(c.bytes, bytes);
    if (!bits) continue;
    for (const start of [0, Math.max(0, 4096 - c.entriesPerLong)]) {
      let word = 0n;
      const values = [];
      for (let slot = 0; slot < c.entriesPerLong; slot++) {
        const value = (start + slot) % states;
        values.push(value);
        word = systems.packIndex(word, slot, value, bits);
      }
      for (let slot = 0; slot < values.length; slot++) assert.equal(systems.unpackIndex(word, slot, bits), values[slot]);
      assert.equal(word >> BigInt(c.entriesPerLong * bits), 0n);
    }
  }
  assert.throws(() => systems.paletteConfig(257), RangeError);
});

test('trilinear weights preserve constants, endpoints, convexity, and center mean', () => {
  const corners = [-.8, .5, .9, -.4, -.3, .7, .4, -.6];
  for (let i = 0; i < 8; i++) {
    const r = core.trilinear(corners, i & 1 ? 1 : 0, i & 2 ? 1 : 0, i & 4 ? 1 : 0);
    assert.equal(r.value, corners[i]);
  }
  const center = core.trilinear(corners, .5, .5, .5);
  assert.ok(Math.abs(center.value - corners.reduce((a, b) => a + b) / 8) < 1e-12);
  for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10; b++) {
    const r = core.trilinear(corners, a / 10, b / 10, .37);
    assert.ok(Math.abs(r.weights.reduce((x, y) => x + y) - 1) < 1e-12);
    assert.ok(r.value >= -.8 && r.value <= .9);
    assert.ok(Math.abs(core.trilinear(Array(8).fill(3), a / 10, b / 10, .37).value - 3) < 1e-12);
  }
  assert.equal(core.squeeze(2), core.squeeze(1));
  assert.equal(core.squeeze(-2), -core.squeeze(1));
  assert.equal(core.squeeze(0), 0);
});

test('2D light follows shortest unobstructed paths and competing sources', () => {
  const w = 9, h = 9, empty = new Uint8Array(w * h);
  let r = systems.propagateLight(empty, w, h, [{ x: 4, y: 4, level: 14 }]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    assert.equal(r.values[y * w + x], 14 - Math.abs(x - 4) - Math.abs(y - 4));
  const wall = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) wall[y * w + 5] = 1;
  r = systems.propagateLight(wall, w, h, [{ x: 4, y: 4, level: 14 }]);
  assert.equal(r.values[4 * w + 6], 0);
  const both = systems.propagateLight(wall, w, h, [{ x: 4, y: 4, level: 14 }, { x: 7, y: 4, level: 10 }]);
  assert.equal(both.values[4 * w + 6], 9);
  assert.equal(systems.propagateLight(empty, w, h, []).lit, 0);
});

test('face counts distinguish a full cube, a tunnel, and hidden interfaces', () => {
  for (const n of [2, 8, 14, 16]) {
    const cube = world.makeMeshVolume(n, 'solid');
    assert.equal(world.meshFaces(cube, false).count, 6 * n ** 3);
    assert.equal(world.meshFaces(cube, true).count, 6 * n ** 2);
  }
  const tunnel = world.makeMeshVolume(8, 'tunnel');
  assert.ok(world.meshFaces(tunnel, true).count > 6 * 8 ** 2);
});

test('grid traversal stops at the first hit and handles axis-aligned rays', () => {
  const grid = Array.from({ length: 4 }, () => new Uint8Array(6));
  grid[1][4] = 1;
  const ray = world.traceRay2D(grid, [.5, 1.5], [1, 0]);
  assert.equal(ray.length, 5);
  assert.equal(ray.at(-1).x, 4);
  assert.equal(ray.at(-1).hit, true);
  assert.equal(ray.at(-1).t, 3.5);
  for (const item of ray) assert.equal(item.tMaxZ, Infinity);
  const reverse = world.traceRay2D(grid, [3.5, .5], [-1, 0]);
  assert.equal(reverse.at(-1).x, 0);
});

test('region coordinates handle negatives and record size includes a five-byte header', () => {
  assert.equal(core.region(-1, -1, 4091).slot, 1023);
  assert.equal(core.region(-1, -1, 4091).regionX, -1);
  assert.equal(core.region(32, 0, 4091).slot, 0);
  assert.equal(core.region(32, 0, 4091).regionX, 1);
  assert.equal(core.region(12, 8, 4091).sectors, 1);
  assert.equal(core.region(12, 8, 4092).sectors, 2);
  assert.equal(core.region(12, 8, 9600).timestampByte, 5168);
});

test('tick work is independent of frame rate in the teaching model', () => {
  assert.equal(systems.tickModel(20, 60, 225).tps, 20);
  assert.equal(systems.tickModel(80, 144, 225).tps, 12.5);
  assert.equal(systems.tickModel(100, 30, 225).tick, systems.tickModel(100, 144, 225).tick);
  assert.equal(systems.tickModel(20, 60, 225).interpolated, 3.5);
});

test('climate distance is to intervals and all six axes participate', () => {
  const region = { ranges: Array.from({length:6}, () => [-.2, .2]), offset: .1 };
  assert.equal(fields.intervalDistance(0, [-.2, .2]), 0);
  assert.equal(fields.climateFitness([0,0,0,0,0,0], region), 1000000);
  for (let axis = 0; axis < 6; axis++) {
    const p = [0,0,0,0,0,0]; p[axis] = .5;
    assert.equal(fields.climateFitness(p, region), 10000000);
  }
  assert.equal(fields.biomeAt([0,0,0,0,-.8,0]).name, 'Deep cave');
});

test('global substance boundaries and density buffer layout are exact subsets', () => {
  assert.equal(fields.globalSubstance(-60, .1, 63), 'stone');
  assert.equal(fields.globalSubstance(-55, 0, 63), 'lava');
  assert.equal(fields.globalSubstance(-54, 0, 63), 'water');
  assert.equal(fields.globalSubstance(62, -.1, 63), 'water');
  assert.equal(fields.globalSubstance(63, -.1, 63), 'air');
  const indices = new Set();
  for (let z=0;z<4;z++) for (let x=0;x<4;x++) for (let y=0;y<4;y++) indices.add(fields.densityIndex(x,y,z,4,4));
  assert.equal(indices.size, 64);
  assert.equal(fields.densityIndex(0,1,0,4,4), 1);
  assert.equal(fields.densityIndex(1,0,0,4,4), 4);
});

test('sky source columns remain fifteen while side paths attenuate', () => {
  const s = fields.skyField(9, 9, 5, 4, 1);
  for (let y=0;y<9;y++) assert.equal(s.direct[y*9+3], 15);
  assert.equal(s.direct[2*9+4], 0);
  assert.equal(s.light[2*9+4], 14);
  assert.equal(s.lowest[3], 0);
  assert.equal(s.lowest[4], 6);
  assert.equal(s.solid[5*9+4], 1);
});

test('collision clips a wall and a step resolves only within allowance', () => {
  const box = {x1:1,x2:1.6,y1:0,y2:1.8};
  const obstacles = [{x1:-1,x2:9,y1:-1,y2:0}, {x1:3,x2:4,y1:0,y2:.5}];
  const blocked = engine.collisionModel(box, 2.4, -.4, obstacles, 0);
  assert.equal(blocked.x, 1.4);
  assert.equal(blocked.y, 0);
  const stepped = engine.collisionModel(box, 2.4, -.4, obstacles, .6);
  assert.equal(stepped.x, 2.4);
  assert.equal(stepped.y, .5);
  assert.equal(engine.clipAxis({x1:4.4,x2:5,y1:0,y2:1.8}, -2, 'x', obstacles), -.40000000000000036);
});

test('scheduled identity, ordering, and random trials preserve mechanism differences', () => {
  const a = {position:4,type:'block',trigger:3,priority:2,order:9};
  const b = {position:4,type:'fluid',trigger:3,priority:1,order:8};
  const c = {position:8,type:'block',trigger:1,priority:3,order:7};
  assert.equal(engine.uniqueTicks([a,{...a},b]).length,2);
  assert.deepEqual(engine.sortTicks([a,b,c]),[c,b,a]);
  const trials = engine.randomTrials(17, 20, 3, 64);
  assert.equal(trials.length,60);
  assert.deepEqual(trials,engine.randomTrials(17,20,3,64));
  assert.ok(trials.every(n=>n>=0&&n<64));
  assert.ok(new Set(trials).size<trials.length);
});

test('wire attenuation is instantaneous in the model while repeater output is delayed', () => {
  assert.deepEqual(engine.wireLevels(15,4,-1),[15,14,13,12]);
  assert.deepEqual(engine.wireLevels(15,4,2),[15,14,0,0]);
  for (let delay=1;delay<=4;delay++) {
    assert.equal(engine.redstoneModel(15,delay,delay*2-1,-1).output,0);
    assert.equal(engine.redstoneModel(15,delay,delay*2,-1).output,15);
    assert.equal(engine.redstoneModel(15,delay,10,2).output,0);
  }
});

test('surface averaging, alpha ordering, and pipeline invalidation remain distinct', () => {
  assert.equal(render.cornerShade(.2,.2,1,1,true,true),.4);
  assert.equal(render.cornerShade(.2,.2,1,1,false,false),.6);
  assert.equal(render.bilinear([0,1,1,0],.5,.5),.5);
  const a = {color:[200,0,0],alpha:.5}, b = {color:[0,0,200],alpha:.5};
  assert.deepEqual(render.composite([a,b],[0,0,0]),[50,0,100]);
  assert.deepEqual(render.composite([b,a],[0,0,0]),[100,0,50]);
  let p = render.initialPipeline();
  p=render.pipelineAction(p,'step');p=render.pipelineAction(p,'edit');
  assert.equal(p.cancelled,1);assert.equal(p.displayed,1);
  for(let i=0;i<5;i++)p=render.pipelineAction(p,'step');
  assert.equal(p.displayed,p.revision);
  const revision=p.revision;p=render.pipelineAction(p,'camera');p=render.pipelineAction(p,'step');
  assert.equal(p.revision,revision);assert.equal(p.sortedCamera,p.cameraRevision);
});

test('oversized region records use an external stream and a single-sector stub', () => {
  const edge=255*4096-5;
  assert.equal(core.region(0,0,edge).external,false);
  assert.equal(core.region(0,0,edge+1).external,true);
  assert.equal(core.region(0,0,1200000).recordSectors,1);
});

test('package aggregates and finding links cover their complete inputs', () => {
  const data=JSON.parse(fs.readFileSync(path.join(root,'assets/data/minecraft/package.json'),'utf8'));
  function sum(n){if(!n.children.length)return;for(const key of ['bytes','files','classes'])assert.equal(n[key],n.children.reduce((s,c)=>s+c[key],0));n.children.forEach(sum);}
  sum(data.tree);assert.equal(data.tree.classes,11383);
  assert.equal(data.tree.files+data.directoryEntries,data.archiveEntries);
  const findings=JSON.parse(fs.readFileSync(path.join(root,'assets/data/minecraft/coverage.json'),'utf8'));
  const legacy=['mc-world','mc-coordinate','mc-palette','mc-generation','mc-samplers','mc-density','mc-aquifer','mc-biomes','mc-activity','mc-ticks','mc-scheduler','mc-redstone','mc-collision','mc-ray','mc-light','mc-skylight','mc-occlusion','mc-mesh','mc-interpolation','mc-transparency','mc-render-queue','mc-network','mc-region','mc-edit','mc-package'];
  const linked=new Set();
  assert.equal(findings.groups.flatMap(g=>g.findings).length,49);
  for(const g of findings.groups)for(const f of g.findings){
    assert.ok(f.source&&f.detail&&f.title);
    for(const id of f.figures){assert.ok(legacy.includes(id),id);linked.add(id);}
  }
  assert.deepEqual([...linked].sort(),legacy.sort(),'The retained research catalog is complete');
});

test('the story keeps one coordinate and changes exactly one voxel', () => {
  const a=story.scene(false,false),b=story.scene(true,false);
  assert.equal(a.get(...story.target),7);assert.equal(b.get(...story.target),0);
  assert.equal(a.data.reduce((n,v,i)=>n+(v!==b.data[i]),0),1);
  assert.equal(story.density(...story.target),.65);
  assert.deepEqual(story.target.map((v,i)=>v+story.offset[i]),[200,7,135]);
  assert.equal(story.packedSelection(16).index,1912);
  for(const states of [16,17]) {
    const solid=story.packedSelection(states),air=story.packedSelection(states,true);
    assert.equal(solid.ids[solid.slot],6);assert.equal(air.ids[air.slot],0);
    assert.equal(solid.word,air.word);assert.equal(solid.slot,air.slot);
    assert.equal(solid.bytes,states===16?2048:2736);
  }
});

test('opening the story wall creates a shorter light path through that coordinate', () => {
  const closed=story.lightField(false),open=story.lightField(true);
  assert.equal(closed.get(10,7,7),0);
  assert.equal(open.get(10,7,7),9);
  assert.equal(open.get(8,7,7),11);
  assert.equal(open.get(10,7,7,4),0);
  assert.equal(open.get(10,7,7,5),9);
  const before=story.faces(story.scene(false,true)).faces,after=story.faces(story.scene(true,true)).faces;
  assert.ok(before.some(f=>f.x===8&&f.y===7&&f.z===7));
  assert.ok(!after.some(f=>f.x===8&&f.y===7&&f.z===7));
  const oldKeys=new Set(before.map(f=>[f.x,f.y,f.z,f.side].join(',')));
  assert.ok(after.some(f=>!oldKeys.has([f.x,f.y,f.z,f.side].join(','))));
});

test('the story separates predicted state, authoritative state, and acknowledgement', () => {
  assert.equal(story.breakState(.1,false).clientRemoved,true);
  assert.equal(story.breakState(.1,false).serverRemoved,false);
  assert.equal(story.breakState(.6,false).serverRemoved,true);
  const pending=story.breakState(.85,true);
  assert.equal(pending.stateArrived,true);assert.equal(pending.acknowledged,false);
  assert.equal(pending.clientRemoved,true);
  assert.equal(story.breakState(1,true).clientRemoved,false);
  assert.equal(story.breakState(1,false).clientRemoved,true);
  assert.equal(story.breakState(1,false).acknowledged,true);
});
