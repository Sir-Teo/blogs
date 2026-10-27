'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const B=require('../../assets/js/minecraft-build-core.js');
const S=require('../../assets/js/minecraft-story.js');
const P=require('../../assets/js/minecraft-play-core.js');
const Game=require('../../assets/js/minecraft-play.js');
test('the build starts empty and generation preserves one reference address',()=>{
  const w=B.createWorld(S);assert.equal(B.counts(w).blocks,0);assert.equal(w.data.length,8192);assert.equal(w.data.byteLength,16384);
  w.set(...B.target,7);assert.equal(B.counts(w).blocks,1);assert.equal(w.data[1912],7);assert.equal(w.set(-1,7,7,1),false);assert.equal(w.set(1.5,7,7,1),false);
  w.generate();assert.ok(B.counts(w).blocks>3000);assert.equal(w.get(...B.target),7);assert.equal(w.get(5,7,7),0);assert.ok(w.data.includes(4));
  const initial=w.data.slice(),version=w.version;w.set(...B.target,0);assert.equal(w.version,version+1);w.generate();assert.deepEqual(w.data,initial);w.clear();assert.equal(B.counts(w).blocks,0);
});
test('all projections read live edits without changing canonical storage',()=>{
  const w=B.createWorld(S);w.generate();const original=w.data.slice();assert.equal(B.counts(B.view(w,'empty')).blocks,0);assert.equal(B.counts(B.view(w,'cell')).blocks,1);
  const before=S.faces(B.view(w,'terrain'),false);w.set(...B.target,0);const after=S.faces(B.view(w,'terrain'),false);
  assert.equal(B.view(w,'cell').get(...B.target),0);assert.equal(B.view(w,'terrain').get(...B.target),0);assert.equal(after.blocks,before.blocks-1);assert.notDeepEqual(before.faces,after.faces);
  assert.equal(w.data.reduce((n,v,i)=>n+(v!==original[i]),0),1);assert.equal(B.counts(w).changes,1);
});
test('saves roundtrip blocks, inventory, build stage and viewpoints',()=>{
  const w=B.createWorld(S);w.generate();w.set(...B.target,0);w.set(5,7,7,8);
  const poses=[{id:'mc-world',player:{x:5.5,y:6,z:8.5},yaw:1.2,pitch:-.04,tool:'torch',surface:false}];
  const saved=B.decode(B.encode(w,{cobblestone:33,torch:7},8,poses),w);
  assert.deepEqual(saved.cells,Array.from(w.data));assert.deepEqual(saved.inventory,{cobblestone:33,torch:7});assert.equal(saved.stage,8);assert.deepEqual(saved.poses,poses);
});
test('invalid saves are rejected before the world is touched',()=>{
  const w=B.createWorld(S);w.generate();const before=w.data.slice(),good=JSON.parse(B.encode(w,{cobblestone:32,torch:8},7));
  for(const mutate of [v=>v.cells.pop(),v=>v.cells[0]=10,v=>v.cells[0]=1.5,v=>v.dimensions=[16,16,16],v=>v.inventory.torch=-1,v=>v.stage=20,v=>v.version=2,v=>v.poses=[{id:'mc-world',player:{x:null,y:6,z:8}}]]){
    const bad=structuredClone(good);mutate(bad);assert.throws(()=>B.decode(JSON.stringify(bad),w));assert.deepEqual(w.data,before);
  }
  assert.throws(()=>B.decode('broken',w));assert.throws(()=>B.decode('x'.repeat(1000001),w));
});
function request(player,extra){return {kind:'break',position:[8,7,7],seconds:.4,tool:'pickaxe',camera:{x:player.x,y:player.y+1.62,z:player.z,yaw:Math.atan2(3,-1),pitch:-.038},...extra};}
test('local authority checks reach, current target and completed mining without mutation',()=>{
  const w=B.createWorld(S);w.generate();const player={x:5.5,y:6,z:8.5},inventory={cobblestone:32,torch:8},v=w.version;
  assert.equal(B.authorize(w,player,request(player),inventory,P).ok,true);
  for(const extra of [{seconds:.35},{seconds:NaN},{tool:'invalid'},{position:[8,6,7]},{position:[8,0,7]},{position:[30,7,7]}])assert.equal(B.authorize(w,player,request(player,extra),inventory,P).ok,false);
  const spoof=request(player);spoof.camera.x+=1;assert.equal(B.authorize(w,player,spoof,inventory,P).ok,false);
  w.set(...B.target,0);assert.equal(B.authorize(w,player,request(player),inventory,P).ok,false);assert.equal(w.version,v+1);
});
test('placement authority verifies item counts, support and body overlap',()=>{
  const w=B.createWorld(S);w.generate();const player={x:5.5,y:6,z:8.5},camera={x:5.5,y:7.62,z:8.5,yaw:Math.atan2(3,-1),pitch:-.8},inventory={cobblestone:32,torch:8};
  const hit=P.raycast(w,[camera.x,camera.y,camera.z],Game.direction(camera),4.5),action={kind:'place',position:hit.previous,type:9,camera};
  assert.equal(B.authorize(w,player,action,inventory,P).ok,true);assert.equal(B.authorize(w,player,action,{cobblestone:0,torch:0},P).ok,false);
  assert.equal(B.authorize(w,player,{...action,type:8},inventory,P).ok,true);
  assert.equal(B.authorize(w,player,{...action,type:1},inventory,P).ok,false);
  const tiny=B.volume(16,16,16);tiny.set(6,2,5,1);const p={x:5.8,y:1,z:5.5},c={x:5.8,y:2.62,z:5.5,yaw:Math.PI/2,pitch:0},a={kind:'place',position:[5,2,5],type:9,camera:c};
  assert.equal(B.authorize(tiny,p,a,inventory,P).ok,false,'Placement overlaps player');
  a.type=8;assert.equal(B.authorize(tiny,p,a,inventory,P).ok,false,'No torch support');
});
test('the article has one cumulative sequence and no removed appendices',()=>{
  const post=fs.readFileSync(require('node:path').join(__dirname,'../../_posts/2026-10-26-taking-minecraft-apart-one-block-at-a-time.markdown'),'utf8');
  const stages=[...post.matchAll(/<figure[^>]+data-build-stage="(\d+)"/g)].map(m=>+m[1]);assert.deepEqual(stages,[0,1,2,3,4,5,6,7,8]);
  assert.doesNotMatch(post,/engine-notebook|implementation notes|resources|mc-network|mc-render-queue/i);assert.match(post,/minecraft-build-core\.js/);assert.match(post,/minecraft-build\.js/);
});
