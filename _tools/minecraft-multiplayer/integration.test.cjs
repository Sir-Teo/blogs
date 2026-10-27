'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {WebSocket}=require('ws');
const {start}=require('./server.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function client(url){const ws=new WebSocket(url.replace('http:','ws:')+'/ws',{origin:'http://localhost:4173'}),messages=[],waiters=[];ws.on('message',data=>{const m=JSON.parse(data);messages.push(m);for(const w of [...waiters])if(w.match(m)){waiters.splice(waiters.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return {ws,messages,send:m=>ws.send(JSON.stringify(m)),wait(match){const found=messages.find(match);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const w={match,resolve};w.timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('Timed out waiting for message; received '+JSON.stringify(messages.slice(-3))));},3500);waiters.push(w);});},async close(){if(ws.readyState===WebSocket.CLOSED)return;ws.close();await new Promise(resolve=>ws.once('close',resolve));}};}
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cave-server-')),site=path.join(dir,'site');await fs.mkdir(site);await fs.writeFile(path.join(site,'index.html'),'<h1>Cave</h1>');let app=await start({port:0,dataDir:path.join(dir,'data'),siteDir:site});t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});return {dir,site,get app(){return app;},async restart(){await app.close();app=await start({port:0,dataDir:path.join(dir,'data'),siteDir:site});return app;}};}
const aim={position:[8,7,7],yaw:Math.atan2(3,-1),pitch:-.038};
test('two real clients share authoritative edits, delayed ordering, movement and restart persistence',async t=>{const f=await setup(t),a=await client(f.app.url),b=await client(f.app.url);a.send({type:'join',room:null,name:'Alice'});const one=await a.wait(m=>m.type==='welcome');b.send({type:'join',room:one.room,name:'Bob'});const two=await b.wait(m=>m.type==='welcome');assert.deepEqual(one.cells,two.cells);assert.equal(two.players.length,2);assert.equal(one.cells.length,8192);
  a.send({type:'break-start',seq:1,...aim});assert((await a.wait(m=>m.type==='ack'&&m.seq===1)).accepted);a.send({type:'break-finish',seq:2,...aim});assert.equal((await a.wait(m=>m.type==='ack'&&m.seq===2)).accepted,false);
  a.send({type:'break-start',seq:3,...aim});await a.wait(m=>m.type==='ack'&&m.seq===3);b.send({type:'break-start',seq:1,...aim,yaw:-Math.PI/2,pitch:-.04});assert((await b.wait(m=>m.type==='ack'&&m.seq===1)).accepted);await delay(460);a.send({type:'break-finish',seq:4,...aim});const edit=await b.wait(m=>m.type==='block'&&m.actionSeq===4);assert.equal(edit.typeValue,0);const ack=await a.wait(m=>m.type==='ack'&&m.seq===4);assert(ack.changed);assert.equal(ack.inventory.cobblestone,33);b.send({type:'break-finish',seq:2,...aim,yaw:-Math.PI/2,pitch:-.04});const loser=await b.wait(m=>m.type==='ack'&&m.seq===2);assert.equal(loser.accepted,false);assert.equal(loser.inventory.cobblestone,32);
  a.send({type:'delay',ms:250});a.send({type:'break-abort',seq:5});a.send({type:'delay',ms:0});a.send({type:'break-abort',seq:6});await a.wait(m=>m.type==='ack'&&m.seq===6);const indexes=[5,6].map(seq=>a.messages.findIndex(m=>m.type==='ack'&&m.seq===seq));assert(indexes[0]<indexes[1]);
  a.send({type:'input',seq:1,forward:1,side:0,jump:false,sprint:false,yaw:Math.PI/2,pitch:0,tool:'pickaxe'});a.send({type:'input',seq:2,forward:0,side:0,jump:false,sprint:false,yaw:Math.PI/2,pitch:0,tool:'pickaxe'});const state=await a.wait(m=>m.type==='state'&&m.players.find(p=>p.id===one.playerId)?.inputSeq===2);const pose=state.players.find(p=>p.id===one.playerId);assert(Math.abs(pose.x-5.715)<.001);a.send({type:'save'});await a.wait(m=>m.type==='saved');await a.close();await b.close();await f.restart();
  const c=await client(f.app.url);c.send({type:'join',room:one.room,token:one.token});const resumed=await c.wait(m=>m.type==='welcome');assert.equal(resumed.playerId,one.playerId);assert.equal(resumed.inventory.cobblestone,33);assert.equal(resumed.cells[(7*16+7)*16+8],0);assert.equal(resumed.players[0].x,pose.x);assert.equal(resumed.actionSeq,6);assert.equal(resumed.players[0].inputSeq,2);await c.close();
});
test('malformed traffic, room lookup, concurrent token, HTTP and origin policy',async t=>{const {app}=await setup(t);assert.equal((await fetch(app.url+'/health')).status,200);assert.equal(await (await fetch(app.url+'/blogs/')).text(),'<h1>Cave</h1>');assert.equal((await fetch(app.url+'/missing')).status,404);const a=await client(app.url);a.ws.send('{');await a.wait(m=>m.type==='error'&&m.message.includes('Malformed'));a.send({type:'join',room:'UNKNOWN1'});await a.wait(m=>m.type==='error'&&m.message.includes('Room not found'));a.send({type:'join',room:null});const welcome=await a.wait(m=>m.type==='welcome');a.send({type:'input',seq:1,forward:100});await a.wait(m=>m.type==='error'&&m.message.includes('input'));a.send({type:'unknown',seq:1});assert.equal((await a.wait(m=>m.type==='ack'&&m.seq===1)).accepted,false);a.send({type:'ping',time:123});await a.wait(m=>m.type==='pong'&&m.time===123);const b=await client(app.url);b.send({type:'join',room:welcome.room,token:welcome.token});await b.wait(m=>m.type==='error'&&m.message.includes('already connected'));b.send({type:'join',room:welcome.room});await b.wait(m=>m.type==='welcome');b.send({type:'demo-reset'});await b.wait(m=>m.type==='error'&&m.message.includes('host'));await a.close();await b.close();await assert.rejects(new Promise((resolve,reject)=>{const bad=new WebSocket(app.url.replace('http:','ws:')+'/ws',{origin:'https://evil.invalid'});bad.once('open',()=>{bad.close();resolve();});bad.once('error',reject);}));});
test('save acknowledgment identifies the written snapshot when a later edit commits during its write',async t=>{
  const f=await setup(t),a=await client(f.app.url);
  a.send({type:'join',room:null});
  const welcome=await a.wait(m=>m.type==='welcome');
  const originalWrite=fs.writeFile;
  let release,entered;
  const blocked=new Promise(resolve=>{release=resolve;});
  const writing=new Promise(resolve=>{entered=resolve;});
  let held=false;
  fs.writeFile=async function(file,...args){
    if(!held&&String(file).startsWith(path.join(f.dir,'data',welcome.room+'.json.'))){
      held=true;entered();await blocked;
    }
    return originalWrite.call(this,file,...args);
  };
  try {
    a.send({type:'save'});
    await Promise.race([writing,delay(2000).then(()=>{throw Error('Save write did not start');})]);
    // This valid edit commits after serialization, while the old snapshot is blocked.
    a.send({type:'place',seq:1,position:[5,6,8],typeValue:8,yaw:0,pitch:-Math.PI/2});
    const edit=await a.wait(m=>m.type==='ack'&&m.seq===1);
    assert.equal(edit.accepted,true);
    assert.equal(edit.revision,1);
    release();
    const saved=await a.wait(m=>m.type==='saved');
    const disk=JSON.parse(await fs.readFile(path.join(f.dir,'data',welcome.room+'.json'),'utf8'));
    assert.equal(saved.revision,0);
    assert.equal(saved.revision,disk.revision);
    assert.equal(saved.tick,disk.tick);
    assert.equal(disk.cells[(6*16+8)*16+5],0);
    assert.equal(f.app.rooms.get(welcome.room).world.get(5,6,8),8);
  } finally {
    release();fs.writeFile=originalWrite;await a.close();
  }
});
test('two players respawn on distinct supported surface tiles with clear body space',async t=>{
  const {app}=await setup(t),a=await client(app.url),b=await client(app.url);
  a.send({type:'join',room:null});
  const first=await a.wait(m=>m.type==='welcome');
  b.send({type:'join',room:first.room});
  await b.wait(m=>m.type==='welcome');
  const room=app.rooms.get(first.room);
  // The second tile's terrain differs, so a shared hardcoded height would fail.
  room.world.set(9,24,9,9);
  a.send({type:'respawn',surface:true});
  b.send({type:'respawn',surface:true});
  const p=(await a.wait(m=>m.type==='respawn')).player;
  const q=(await b.wait(m=>m.type==='respawn')).player;
  assert.deepEqual([p.x,p.z],[11.5,11.5]);
  assert.deepEqual([q.x,q.z],[9.5,9.5]);
  assert.equal(q.y,25);
  const Core=require('../../assets/js/minecraft-play-core.js');
  for(const pose of [p,q]){
    assert.equal(Core.collides(room.world,pose),false);
    assert(Core.solid(room.world.get(Math.floor(pose.x),pose.y-1,Math.floor(pose.z))));
  }
  assert(Math.hypot(p.x-q.x,p.z-q.z)>.6);
  await a.close();await b.close();
});
