'use strict';
// A teaching protocol, not the Minecraft wire protocol. Shared browser modules
// supply collision, selection and edit rules; this process owns every commit.
const crypto = require('node:crypto');
const Core = require('../../assets/js/minecraft-play-core.js');
const Build = require('../../assets/js/minecraft-build-core.js');
const Story = require('../../assets/js/minecraft-story.js');
const DIMENSIONS = [16, 32, 16];
const TOOLS = ['pickaxe', 'cobblestone', 'torch'];
const finite = Number.isFinite;
function world() { const w = Build.createWorld(Story); w.generate(); w.set(5,7,7,8); return w; }
function spawn(index) { return index % 2 === 0 ? {x:5.5,y:6,z:8.5,yaw:Math.atan2(3,-1),pitch:-.038} : {x:10.5,y:6,z:7.5,yaw:-Math.PI/2,pitch:-.04}; }
// Spawn above the highest solid cell on each player's own fixed surface tile.
// Centering the .6-wide body inside one tile leaves its entire box clear.
function surfaceSpawn(index, world) {
  const positions=[[11.5,11.5],[9.5,9.5],[11.5,9.5],[9.5,11.5],[7.5,9.5],[9.5,7.5],[11.5,7.5],[7.5,11.5]];
  const [x,z]=positions[index%positions.length];
  let top=world.h-1;
  while(top>=0&&!Core.solid(world.get(Math.floor(x),top,Math.floor(z))))top--;
  return {...spawn(index),x,y:top+1,z};
}
function player(index, name) { return {id:crypto.randomUUID(),token:crypto.randomBytes(32).toString('hex'),name:typeof name==='string'?name.replace(/[\x00-\x1f<>]/g,'').trim().slice(0,24)||'Player':'Player',...spawn(index),vy:0,onGround:true,tool:'pickaxe',inputSeq:0,color:index%8,inventory:{cobblestone:32,torch:8},lastReceived:0,actionSeq:0,queue:[],intent:null,ticket:null,peer:null}; }
function wire(p) { const result={}; for(const k of ['id','name','x','y','z','vy','onGround','yaw','pitch','tool','inputSeq','color']) result[k]=p[k]; return result; }
function active(room) { return [...room.players.values()].filter(p=>p.peer).map(wire); }
function room(code) { return {code,world:world(),players:new Map(),hostId:null,tick:0,revision:0,acceptedEdits:0,dirty:true}; }
function snapshot(r,p,type='world') { return {type,tick:r.tick,revision:r.revision,dimensions:DIMENSIONS,cells:Array.from(r.world.data),players:active(r),inventory:{...p.inventory},hostId:r.hostId}; }
function input(p,m) {
  if(!Number.isSafeInteger(m.seq)||m.seq<=p.lastReceived||m.seq>p.lastReceived+10000||!finite(m.forward)||Math.abs(m.forward)>1||!finite(m.side)||Math.abs(m.side)>1||typeof m.jump!=='boolean'||typeof m.sprint!=='boolean'||!finite(m.yaw)||!finite(m.pitch)||Math.abs(m.yaw)>1e6||Math.abs(m.pitch)>Math.PI/2||!TOOLS.includes(m.tool)) return false;
  if(p.queue.length>=40) return false;
  p.lastReceived=m.seq; p.queue.push({seq:m.seq,forward:m.forward,side:m.side,jump:m.jump,sprint:m.sprint,yaw:m.yaw,pitch:m.pitch,tool:m.tool}); return true;
}
function tick(r) {
  r.tick++;
  for(const p of r.players.values()) if(p.peer) {
    const command=p.queue.shift();
    if(command) { p.intent=command; p.inputSeq=command.seq; p.yaw=command.yaw; p.pitch=command.pitch; p.tool=command.tool; }
    const i=p.intent||{forward:0,side:0};
    Core.movePlayer(r.world,p,{dx:Math.sin(p.yaw)*i.forward+Math.cos(p.yaw)*i.side,dz:Math.cos(p.yaw)*i.forward-Math.sin(p.yaw)*i.side,jump:!!i.jump,sprint:!!i.sprint},.05);
    if(p.ticket)p.ticket.progressSeconds+=.05*(p.onGround?1:.2);
  }
}
function camera(p,m) { return {x:p.x,y:p.y+1.62,z:p.z,yaw:m.yaw,pitch:m.pitch}; }
function validAim(m) { return finite(m.yaw)&&Math.abs(m.yaw)<=1e6&&finite(m.pitch)&&Math.abs(m.pitch)<=Math.PI/2; }
function cell(r,position) { return Array.isArray(position)&&position.length===3&&position.every(Number.isInteger)?r.world.get(...position):null; }
function action(r,p,m) {
  const response={type:'ack',seq:m.seq,kind:m.type,accepted:false,changed:false,reason:'Invalid action.',revision:r.revision,position:m.position,typeValue:cell(r,m.position),inventory:{...p.inventory}};
  const edits=[];
  function done(reason) { if(reason) response.reason=reason; response.revision=r.revision; response.inventory={...p.inventory}; if(response.position)response.typeValue=cell(r,response.position); return {response,edits}; }
  if(!Number.isSafeInteger(m.seq)||m.seq<=p.actionSeq) return done('Action sequence was already used or is invalid.');
  p.actionSeq=m.seq;
  if(m.type==='break-abort') {p.ticket=null;response.accepted=true;return done('Mining canceled.');}
  if(!validAim(m))return done('Invalid viewpoint.');
  const base={position:m.position,camera:camera(p,m)};
  if(m.type==='break-start') {
    // A completed hypothetical duration checks selection without trusting client time.
    const result=Build.authorize(r.world,p,{...base,kind:'break',seconds:100000,tool:p.tool},p.inventory,Core);
    p.ticket=null;
    if(!result.ok)return done(result.reason);
    p.ticket={position:m.position.slice(),tick:r.tick,progressSeconds:0,type:result.previous,tool:p.tool};response.accepted=true;return done('Mining started.');
  }
  let result;
  if(m.type==='break-finish') {
    const t=p.ticket;p.ticket=null;
    if(!t||!Array.isArray(m.position)||m.position.join(',')!==t.position.join(',')||cell(r,m.position)!==t.type||p.tool!==t.tool)return done('The mining target changed.');
    result=Build.authorize(r.world,p,{...base,kind:'break',seconds:t.progressSeconds,tool:t.tool},p.inventory,Core);
  } else if(m.type==='place') {
    result=Build.authorize(r.world,p,{...base,kind:'place',type:m.typeValue},p.inventory,Core);
    if(result.ok&&m.typeValue===9)for(const other of r.players.values())if(other.peer&&other!==p){const box=Core.playerBox(other),q=m.position;if(box.x2>q[0]&&box.x1<q[0]+1&&box.y2>q[1]&&box.y1<q[1]+1&&box.z2>q[2]&&box.z1<q[2]+1){result={ok:false,reason:'That block would overlap another player.'};break;}}
  } else return done('Unknown action.');
  if(!result.ok)return done(result.reason);
  if(!r.world.set(...result.position,result.type))return done('The block already changed.');
  if(m.type==='place')p.inventory[result.type===8?'torch':'cobblestone']--;
  else if(result.previous===8)p.inventory.torch++;
  else if([1,7,9].includes(result.previous)&&p.tool==='pickaxe')p.inventory.cobblestone++;
  function committed(position,typeValue) {for(const other of r.players.values())if(other.ticket&&other.ticket.position.join(',')===position.join(','))other.ticket=null;r.revision++;r.acceptedEdits++;edits.push({type:'block',tick:r.tick,revision:r.revision,position,typeValue,by:p.id,actionSeq:m.seq});}
  committed(result.position,result.type);
  const [x,y,z]=result.position;
  if(result.type===0&&r.world.get(x,y+1,z)===8) {r.world.set(x,y+1,z,0);p.inventory.torch++;committed([x,y+1,z],0);}
  r.dirty=true;response.accepted=true;response.changed=true;return done('Committed.');
}
function resetDemo(r) {
  for(const [x,y,z,t] of [[8,7,7,7],[8,6,7,1]])if(r.world.set(x,y,z,t))r.revision++;
  let index=0;for(const p of r.players.values()){Object.assign(p,spawn(index++),{vy:0,onGround:true,queue:[],intent:null,ticket:null});}
  r.dirty=true;
}
function serialize(r) { return {format:'minecraft-multiplayer',version:1,code:r.code,dimensions:DIMENSIONS,cells:Array.from(r.world.data),tick:r.tick,revision:r.revision,hostId:r.hostId,players:[...r.players.values()].map(p=>({...wire(p),token:p.token,inventory:p.inventory,lastReceived:p.lastReceived,actionSeq:p.actionSeq}))}; }
function deserialize(value) {
  if(!value||value.format!=='minecraft-multiplayer'||value.version!==1||!/^\w{8}$/.test(value.code)||!Array.isArray(value.dimensions)||value.dimensions.join(',')!==DIMENSIONS.join(',')||!Array.isArray(value.cells)||value.cells.length!==8192||!value.cells.every(t=>Number.isInteger(t)&&t>=0&&t<=9)||!Number.isSafeInteger(value.tick)||value.tick<0||!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.players)||value.players.length>64)throw Error('Invalid saved room');
  const r=room(value.code);r.world.data.set(value.cells);r.tick=value.tick;r.revision=value.revision;
  const tokens=new Set();
  for(const saved of value.players){
    if(!saved||typeof saved.id!=='string'||!/^[-a-zA-Z0-9]{1,64}$/.test(saved.id)||!/^([a-f0-9]{64})$/.test(saved.token)||tokens.has(saved.token)||r.players.has(saved.id)||!['x','y','z','vy','yaw','pitch'].every(k=>finite(saved[k]))||saved.x<.3||saved.x>15.7||saved.z<.3||saved.z>15.7||saved.y<0||saved.y>100||Math.abs(saved.vy)>30||Math.abs(saved.yaw)>1e6||Math.abs(saved.pitch)>Math.PI/2||typeof saved.onGround!=='boolean'||!Number.isInteger(saved.color)||saved.color<0||saved.color>7||typeof saved.name!=='string'||saved.name.length>24||!Number.isSafeInteger(saved.inputSeq)||saved.inputSeq<0||!saved.inventory||!['cobblestone','torch'].every(k=>Number.isSafeInteger(saved.inventory[k])&&saved.inventory[k]>=0&&saved.inventory[k]<=100000)||!TOOLS.includes(saved.tool)||!Number.isSafeInteger(saved.lastReceived)||saved.lastReceived<0||!Number.isSafeInteger(saved.actionSeq)||saved.actionSeq<0)throw Error('Invalid saved player');
    const p=player(r.players.size,saved.name);Object.assign(p,saved,{peer:null,queue:[],intent:null,ticket:null,inventory:{...saved.inventory}});r.players.set(p.id,p);tokens.add(p.token);
  }
  if(!r.players.has(value.hostId))throw Error('Invalid saved host');r.hostId=value.hostId;r.dirty=false;return r;
}
module.exports={world,spawn,surfaceSpawn,player,wire,room,active,snapshot,input,tick,action,resetDemo,serialize,deserialize};
