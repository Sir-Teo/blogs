'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./server-core.cjs');
function fixture(){const r=G.room('ABCDEFGH'),p=G.player(0,'One'),q=G.player(1,'Two');r.players.set(p.id,p);r.players.set(q.id,q);r.hostId=p.id;p.peer={};q.peer={};return {r,p,q};}
const aim={position:[8,7,7],yaw:Math.atan2(3,-1),pitch:-.038};
test('one queued input per tick and invalid inputs never alter sequence',()=>{const {r,p}=fixture();const command={seq:1,forward:1,side:0,jump:false,sprint:false,yaw:Math.PI/2,pitch:0,tool:'pickaxe'};assert.equal(G.input(p,{...command,forward:NaN}),false);assert.equal(p.lastReceived,0);assert(G.input(p,command));assert(G.input(p,{...command,seq:2,forward:0}));assert.equal(G.input(p,command),false);G.tick(r);assert.equal(p.inputSeq,1);assert(p.x>5.5);const x=p.x;G.tick(r);assert.equal(p.inputSeq,2);assert.equal(p.x,x);});
test('server ticks authorize mining and contested cell awards once',()=>{const {r,p,q}=fixture();assert(G.action(r,p,{type:'break-start',seq:1,...aim}).response.accepted);const early=G.action(r,p,{type:'break-finish',seq:2,...aim});assert(!early.response.accepted);assert.equal(r.revision,0);Object.assign(q,{x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch});assert(G.action(r,p,{type:'break-start',seq:3,...aim}).response.accepted);assert(G.action(r,q,{type:'break-start',seq:1,...aim}).response.accepted);for(let i=0;i<8;i++)G.tick(r);const first=G.action(r,p,{type:'break-finish',seq:4,...aim}),second=G.action(r,q,{type:'break-finish',seq:2,...aim});assert(first.response.accepted);assert(!second.response.accepted);assert.equal(r.revision,1);assert.equal(p.inventory.cobblestone+q.inventory.cobblestone,65);assert.equal(r.acceptedEdits,1);});
test('placement checks selection, inventory, support and player overlap before mutations',()=>{const {r,p,q}=fixture();Object.assign(p,{x:5.5,y:6,z:8.5,yaw:0,pitch:-Math.PI/2});const down={position:[5,6,8],yaw:0,pitch:-Math.PI/2};const bad=G.action(r,p,{type:'place',seq:1,typeValue:9,...down});assert(!bad.response.accepted);assert.equal(p.inventory.cobblestone,32);const torch=G.action(r,p,{type:'place',seq:2,typeValue:8,...down});assert(torch.response.accepted);assert.equal(p.inventory.torch,7);assert.equal(r.world.get(5,6,8),8);assert.equal(G.action(r,q,{type:'place',seq:1,typeValue:8,...down}).response.accepted,false);assert.equal(G.action(r,p,{type:'place',seq:3,typeValue:9,position:[1,1,1],yaw:0,pitch:0}).response.accepted,false);});
test('breaking floor removes and refunds its unsupported torch',()=>{const {r,p}=fixture();Object.assign(p,{x:5.5,y:6,z:8.5});r.world.set(7,6,7,9);r.world.set(7,7,7,8);const target={position:[7,6,7],yaw:Math.atan2(2,-1),pitch:Math.atan2(-1.12,Math.hypot(2,1))};assert(G.action(r,p,{type:'break-start',seq:1,...target}).response.accepted);for(let i=0;i<10;i++)G.tick(r);const result=G.action(r,p,{type:'break-finish',seq:2,...target});assert(result.response.accepted);assert.equal(result.edits.length,2);assert.equal(r.world.get(7,7,7),0);assert.equal(p.inventory.torch,9);});
test('save round trip validates cells, inventories, duplicate credentials and host',()=>{const {r,p}=fixture();const value=G.serialize(r);assert.equal(G.deserialize(value).players.get(p.id).token,p.token);for(const mutate of [v=>v.cells.pop(),v=>v.players[0].inventory.torch=-1,v=>v.players[1].token=v.players[0].token,v=>v.hostId='unknown']){const copy=structuredClone(value);mutate(copy);assert.throws(()=>G.deserialize(copy));}});
test('demo reset changes only experiment cells and poses',()=>{const {r,p}=fixture();r.world.set(8,7,7,0);r.world.set(8,6,7,0);r.world.set(10,7,10,9);p.inventory.torch=3;p.x=12;G.resetDemo(r);assert.equal(r.world.get(8,7,7),7);assert.equal(r.world.get(8,6,7),1);assert.equal(r.world.get(10,7,10),9);assert.equal(p.inventory.torch,3);assert.equal(p.x,5.5);});

test('authoritative mining progresses five times slower while airborne',()=>{
  const {r,p,q}=fixture();
  Object.assign(q,{x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch});
  assert(G.action(r,p,{type:'break-start',seq:1,...aim}).response.accepted);
  assert(G.action(r,q,{type:'break-start',seq:1,...aim}).response.accepted);
  Object.assign(q,{y:40,vy:0,onGround:false});
  for(let i=0;i<8;i++)G.tick(r);
  assert.equal(p.ticket.tick,0);
  assert(Math.abs(p.ticket.progressSeconds-.4)<1e-9);
  assert(Math.abs(q.ticket.progressSeconds-.08)<1e-9);
  // Return to the same valid selection: only server-earned duration can differ.
  Object.assign(q,{x:p.x,y:p.y,z:p.z,vy:0,onGround:true});
  const early=G.action(r,q,{type:'break-finish',seq:2,...aim});
  assert.equal(early.response.accepted,false);
  assert.equal(early.response.reason,'Mining is not finished.');
  assert.equal(r.world.get(8,7,7),7);
  assert(G.action(r,p,{type:'break-finish',seq:2,...aim}).response.accepted);
});
