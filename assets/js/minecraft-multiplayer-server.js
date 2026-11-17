/* The cave server: rooms, sessions and the authoritative rules for Part 2.
 * Node runs this file behind real WebSockets (_tools/minecraft-multiplayer/
 * server.cjs). A static host such as GitHub Pages cannot, so the article runs
 * the same code in the page and reaches it through loopback sockets that carry
 * the same JSON text. A teaching protocol, not the Minecraft wire protocol. */
(function(root){
 'use strict';
 var Core=root.MinecraftPlayCore,Build=root.MinecraftBuildCore,Story=root.MinecraftStory;
 if(typeof module!=='undefined'&&module.exports){Core=require('./minecraft-play-core.js');Build=require('./minecraft-build-core.js');Story=require('./minecraft-story.js');}
 const DIMENSIONS=[16,32,16];
 const TOOLS=['pickaxe','cobblestone','torch'];
 const finite=Number.isFinite;
 function randomBytes(n){const bytes=new Uint8Array(n);(root.crypto||require('node:crypto').webcrypto).getRandomValues(bytes);return bytes;}
 function hex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
 // crypto.randomUUID needs a secure context; a LAN http:// page has none.
 function uuid(){if(root.crypto&&typeof root.crypto.randomUUID==='function')return root.crypto.randomUUID();const h=hex(randomBytes(16).map((b,i)=>i===6?b&15|64:i===8?b&63|128:b));return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}
 function roomCode(){return Array.from(randomBytes(8),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');}

 // Room state. Shared browser modules supply collision, selection and edit
 // rules; whoever runs this code owns every commit.
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
 function player(index, name) { return {id:uuid(),token:hex(randomBytes(32)),name:typeof name==='string'?name.replace(/[\x00-\x1f<>]/g,'').trim().slice(0,24)||'Player':'Player',...spawn(index),vy:0,onGround:true,tool:'pickaxe',inputSeq:0,color:index%8,inventory:{cobblestone:32,torch:8},lastReceived:0,actionSeq:0,queue:[],intent:null,ticket:null,peer:null}; }
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

 // Sessions: joining, the message protocol, ordered artificial reply delay,
 // presence and the 20 Hz clock. The host supplies the transport, given each
 // peer: {open(peer), deliver(peer,text), congested(peer), close(peer,code,reason)};
 // save(room) resolves to the {revision,tick} it wrote; load(code) may restore a room.
 function createHub(options) {
  const rooms=options.rooms||new Map(),peers=new Set(),maxRooms=options.maxRooms??64,link=options.transport;
  const load=options.load||(()=>null),missing=options.missingRoom||(()=>'Room not found. Check the invite code.');
  function save(r){return options.save(r);}
  function send(peer,message,immediate=false){if(!link.open(peer))return;const text=JSON.stringify(message);if(peer.pending.length>=150||link.congested(peer)){link.close(peer,1008,'Slow connection');return;}const due=Math.max(Date.now()+(immediate?0:peer.delay),peer.lastDue);peer.lastDue=due;peer.pending.push({text,due});flush(peer);}
  function flush(peer){if(peer.timer||!peer.pending.length)return;const next=peer.pending[0],wait=next.due-Date.now();if(wait>0){peer.timer=setTimeout(()=>{peer.timer=null;flush(peer);},wait);return;}while(peer.pending.length&&peer.pending[0].due<=Date.now()){const m=peer.pending.shift();if(link.open(peer))link.deliver(peer,m.text);}if(peer.pending.length)flush(peer);}
  function broadcast(r,m){for(const p of r.players.values())if(p.peer)send(p.peer,m);}
  function state(r){for(const p of r.players.values())if(p.peer)send(p.peer,{type:'state',tick:r.tick,revision:r.revision,players:active(r),inventory:{...p.inventory}});}
  function error(peer,message,code){send(peer,code?{type:'error',message,code}:{type:'error',message});}
  function connect(peer){Object.assign(peer,{room:null,player:null,delay:0,pending:[],lastDue:0,timer:null,window:Date.now(),count:0});peers.add(peer);peer.joinTimer=setTimeout(()=>{if(!peer.player)link.close(peer,1008,'Join first');},10000);return peer;}
  function join(peer,m){
   if(peer.player){error(peer,'Already joined.');return;}let r;
   if(m.room==null){if(rooms.size>=maxRooms){error(peer,'Room limit reached.');return;}let code;do{code=roomCode();}while(rooms.has(code));r=room(code);rooms.set(code,r);}
   else {const code=typeof m.room==='string'?m.room.toUpperCase():null;if(code&&!rooms.has(code)&&/^[A-Z2-9]{8}$/.test(code)&&rooms.size<maxRooms){const restored=load(code);if(restored&&restored.code===code)rooms.set(code,restored);}if(!code||!rooms.has(code)){error(peer,missing(code),'room-missing');return;}r=rooms.get(code);}
   if(active(r).length>=8){error(peer,'This room already has eight connected players.');return;}
   let p;if(m.token!==undefined){if(typeof m.token!=='string'||!(p=[...r.players.values()].find(p=>p.token===m.token))){error(peer,'Resume token not found. Join without it to create a new player.');return;}if(p.peer){error(peer,'This player is already connected in another tab.');return;}}
   if(!p){if(r.players.size>=64){error(peer,'Saved player limit reached.');return;}p=player(r.players.size,m.name);r.players.set(p.id,p);if(!r.hostId)r.hostId=p.id;}
   p.peer=peer;p.queue=[];p.intent=null;p.ticket=null;p.lastReceived=p.inputSeq;peer.room=r;peer.player=p;r.dirty=true;clearTimeout(peer.joinTimer);send(peer,{...snapshot(r,p,'welcome'),protocol:1,room:r.code,playerId:p.id,token:p.token,actionSeq:p.actionSeq});state(r);
  }
  function receive(peer,data,binary){try{if(Date.now()-peer.window>=1000){peer.window=Date.now();peer.count=0;}if(++peer.count>100){link.close(peer,1008,'Message rate exceeded');return;}if(binary){error(peer,'Text JSON messages required.');return;}let m;try{m=JSON.parse(String(data));}catch{error(peer,'Malformed JSON.');return;}if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.type!=='string'){error(peer,'Invalid message.');return;}
   if(m.type==='join'){join(peer,m);return;}
   if(!peer.player){error(peer,'Join a room first.');return;}const r=peer.room,p=peer.player;
   if(m.type==='input'){if(!input(p,m))error(peer,'Invalid, duplicate, or excessive input.');return;}
   if(m.type==='delay'){if(!Number.isInteger(m.ms)||m.ms<0||m.ms>600)error(peer,'Delay must be between 0 and 600 milliseconds.');else peer.delay=m.ms;return;}
   if(m.type==='ping'){if(typeof m.time==='number'&&Number.isFinite(m.time))send(peer,{type:'pong',time:m.time,tick:r.tick});else error(peer,'Invalid ping.');return;}
   if(m.type==='save'){save(r).then(saved=>send(peer,{type:'saved',...saved})).catch(()=>error(peer,'The room could not be saved.'));return;}
   if(m.type==='respawn'){const pose=m.surface===true?surfaceSpawn(p.color,r.world):spawn(p.color);Object.assign(p,pose,{vy:0,onGround:false,queue:[],intent:null,ticket:null});r.dirty=true;send(peer,{type:'respawn',player:wire(p)});state(r);return;}
   if(m.type==='demo-reset'){if(p.id!==r.hostId){error(peer,'Only the room host can reset the experiment.');return;}resetDemo(r);for(const other of r.players.values())if(other.peer)send(other.peer,snapshot(r,other));return;}
   const result=action(r,p,m);for(const edit of result.edits)broadcast(r,edit);send(peer,result.response);
  }catch(error_){error(peer,'Invalid message.');}}
  function disconnect(peer){clearTimeout(peer.joinTimer);clearTimeout(peer.timer);peer.pending=[];if(!peers.delete(peer))return;if(peer.player){const r=peer.room,p=peer.player;p.peer=null;p.intent=null;p.queue=[];p.ticket=null;r.dirty=true;state(r);save(r).catch(()=>{});}}
  function step(){for(const r of rooms.values())if(active(r).length){tick(r);state(r);}}
  function autosave(){for(const r of rooms.values())if(r.dirty)save(r).catch(()=>{});}
  return {rooms,peers,connect,receive,disconnect,step,autosave};
 }

 // In the page. A loopback socket has the WebSocket interface the article's
 // client uses. Every message crosses as JSON text in its own later task, never
 // synchronously, so prediction, reply delay and races behave as on a network.
 // Rooms persist in localStorage. Other tabs of this browser reach a room
 // through BroadcastChannel: the tab holding it serves it, the others relay.
 const CONNECTING=0,OPEN=1,CLOSING=2,CLOSED=3,MAX_PAYLOAD=4096;
 let tasks=null;
 function later(fn){
  // A message-channel task in browsers (timers are clamped and throttled); a macrotask in Node.
  if(!tasks){tasks={queue:[]};const run=()=>{const next=tasks.queue.shift();if(next)next();};if(typeof setImmediate==='function')tasks.post=()=>setImmediate(run);else if(typeof MessageChannel==='function'){const channel=new MessageChannel();channel.port1.onmessage=run;tasks.post=()=>channel.port2.postMessage(0);}else tasks.post=()=>setTimeout(run,0);}
  tasks.queue.push(fn);tasks.post();
 }
 class PageSocket extends EventTarget {
  constructor(url){super();this.url=url;this.readyState=CONNECTING;this.protocol='';this.extensions='';this.binaryType='blob';this.bufferedAmount=0;this.onopen=this.onmessage=this.onerror=this.onclose=null;}
  send(data){if(this.readyState===CONNECTING)throw new DOMException('Still in CONNECTING state.','InvalidStateError');if(this.readyState===OPEN)this._up(String(data));}
  close(code=1000,reason=''){if(this.readyState===CLOSING||this.readyState===CLOSED)return;this.readyState=CLOSING;this._end(code,reason);}
  _emit(type,init){const event=type==='message'?new MessageEvent('message',init):type==='close'&&typeof CloseEvent==='function'?new CloseEvent('close',init):Object.assign(new Event(type),init);this.dispatchEvent(event);const handler=this['on'+type];if(typeof handler==='function')handler.call(this,event);}
 }
 Object.entries({CONNECTING,OPEN,CLOSING,CLOSED}).forEach(([k,v])=>{PageSocket[k]=v;PageSocket.prototype[k]=v;});
 function pageStorage(){try{return root.localStorage||null;}catch{return null;}}
 function createPageServer(options={}) {
  const storage=options.storage===undefined?pageStorage():options.storage,prefix=options.prefix||'minecraft-multi:room:',indexKey=prefix+'index',keep=options.keep||12,tab=uuid();
  const Channel=options.BroadcastChannel===undefined?(typeof BroadcastChannel==='function'?BroadcastChannel:null):options.BroadcastChannel;
  const relays=new Map(),routes=new Map(),finding=new Map();
  let channel=null,timers=null,watchdog=null,stopped=false;
  const hub=createHub({maxRooms:64,save:persist,load:restore,
   missingRoom:code=>code?'Room '+code+' is not open in this browser. In-page rooms stay in the browser that created them: open the invite in another tab there, or run the cave server (npm --prefix _tools/minecraft-multiplayer start) to play across devices.':'Room not found. Check the invite code.',
   transport:{open:peer=>peer.link.open(),deliver:(peer,text)=>peer.link.deliver(text),congested:()=>false,close:(peer,code,reason)=>peer.link.close(code,reason)}});
  try{if(Channel){channel=new Channel(options.channel||'minecraft-multiplayer');channel.onmessage=event=>heard(event.data);if(channel.unref)channel.unref();}}catch{channel=null;}
  function post(m){if(channel)try{channel.postMessage(m);}catch{}}
  // Storage: the same versioned record the Node server writes to disk.
  function index(){try{const v=JSON.parse(storage.getItem(indexKey)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
  function persist(r){
   const value=serialize(r),saved={revision:value.revision,tick:value.tick};r.dirty=false;
   if(r.moved)return Promise.resolve(saved);
   try{
    if(!storage)throw Error('This browser blocks storage.');
    const text=JSON.stringify(value),list=index();list[r.code]=Date.now();
    const order=Object.keys(list).sort((a,b)=>list[b]-list[a]);
    for(const code of order.slice(keep)){storage.removeItem(prefix+code);delete list[code];}
    try{storage.setItem(prefix+r.code,text);}catch(full){for(const code of order)if(code!==r.code&&!hub.rooms.has(code)){storage.removeItem(prefix+code);delete list[code];}storage.setItem(prefix+r.code,text);}
    storage.setItem(indexKey,JSON.stringify(list));
    return Promise.resolve(saved);
   }catch(error){r.dirty=true;return Promise.reject(error);}
  }
  function restore(code){try{const text=storage&&storage.getItem(prefix+code);if(!text||text.length>1000000)return null;const r=deserialize(JSON.parse(text));if(r.code!==code)return null;post({kind:'claim',room:code,from:tab});return r;}catch{return null;}}
  // A newer claim wins: this tab stops serving the room without saving over it.
  function release(code){const r=hub.rooms.get(code);if(!r)return;r.moved=true;hub.rooms.delete(code);for(const p of r.players.values())if(p.peer)p.peer.link.close(1012,'This room moved to another tab. Reconnect to follow it.');}
  // The clock. Hidden tabs throttle timers but not a worker's messages, so a
  // room this tab serves to another tab keeps its 20 Hz simulation.
  function sync(){const busy=hub.peers.size>0&&!stopped;if(busy&&!timers)startClock();else if(!busy&&timers){timers.stop();timers=null;hub.autosave();}}
  function startClock(){
   let interval=null,worker=null,url=null;const fallback=()=>{if(worker){worker.terminate();worker=null;}if(!interval)interval=setInterval(hub.step,50);};
   try{if(options.worker===false||typeof Worker!=='function'||typeof Blob!=='function')throw 0;url=URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},50)'],{type:'text/javascript'}));worker=new Worker(url);worker.onmessage=()=>{if(url){URL.revokeObjectURL(url);url=null;}hub.step();};worker.onerror=fallback;}catch{fallback();}
   const autosave=setInterval(hub.autosave,2000);
   timers={stop(){clearInterval(autosave);clearInterval(interval);if(worker)worker.terminate();if(url)URL.revokeObjectURL(url);}};
  }
  // Client side of a loopback connection. Its first message, the join, picks a route.
  function socket(url){
   const s=new PageSocket(url||'in-page:'),conn={id:uuid(),socket:s,route:null,peer:null,owner:null,buffer:[],closed:false,heard:0};
   s._up=text=>{if(text.length>MAX_PAYLOAD){s.readyState=CLOSING;later(()=>finish(conn,1009,'Message too big',true));return;}later(()=>up(conn,text));};
   s._end=(code,reason)=>later(()=>finish(conn,code,reason,true));
   later(()=>{if(s.readyState!==CONNECTING)return;s.readyState=OPEN;s._emit('open');});
   return s;
  }
  function down(conn,text){if(!conn.closed&&conn.socket.readyState===OPEN)conn.socket._emit('message',{data:text});}
  function serveHere(conn){conn.route='local';conn.peer=hub.connect({link:{open:()=>!conn.closed&&conn.socket.readyState===OPEN,deliver:text=>later(()=>down(conn,text)),close:(code,reason)=>drop(conn,code,reason,false)}});sync();}
  function up(conn,text){
   if(conn.closed)return;
   if(conn.route==='local'){hub.receive(conn.peer,text,false);return;}
   if(conn.route==='remote'){post({kind:'send',to:conn.owner,from:tab,conn:conn.id,text});return;}
   if(conn.route==='finding'){conn.buffer.push(text);return;}
   let m=null;try{m=JSON.parse(text);}catch{}
   const code=m&&m.type==='join'&&typeof m.room==='string'?m.room.toUpperCase():null;
   if(!code||hub.rooms.has(code)||!channel){serveHere(conn);hub.receive(conn.peer,text,false);return;}
   conn.route='finding';conn.buffer.push(text);
   find(code).then(owner=>{
    if(conn.closed)return;
    if(owner){conn.route='remote';conn.owner=owner;conn.heard=Date.now();routes.set(conn.id,conn);post({kind:'open',to:owner,from:tab,conn:conn.id});conn.buffer.splice(0).forEach(t=>post({kind:'send',to:owner,from:tab,conn:conn.id,text:t}));watch();}
    else {serveHere(conn);conn.buffer.splice(0).forEach(t=>hub.receive(conn.peer,t,false));}
   });
  }
  function find(code){return new Promise(resolve=>{const nonce=uuid(),timer=setTimeout(()=>{finding.delete(nonce);resolve(null);},options.findTimeout||300);finding.set(nonce,{resolve,timer});post({kind:'find',room:code,from:tab,nonce});});}
  function drop(conn,code,reason,notify){if(conn.closed||conn.socket.readyState===CLOSED)return;conn.socket.readyState=CLOSING;later(()=>finish(conn,code,reason,notify));}
  function finish(conn,code,reason,notify){
   if(conn.closed)return;conn.closed=true;routes.delete(conn.id);
   if(conn.route==='local')hub.disconnect(conn.peer);else if(conn.route==='remote'&&notify)post({kind:'leave',to:conn.owner,from:tab,conn:conn.id});
   conn.socket.readyState=CLOSED;conn.socket._emit('close',{code,reason,wasClean:code!==1006});sync();
  }
  function watch(){if(watchdog)return;watchdog=setInterval(()=>{const now=Date.now();for(const conn of routes.values())if(now-conn.heard>8000)drop(conn,1006,'The tab hosting this room stopped answering.',true);if(!routes.size){clearInterval(watchdog);watchdog=null;}},2000);}
  // Server side of connections relayed from other tabs.
  function heard(m){
   if(!m||typeof m!=='object'||m.from===tab)return;
   if(m.kind==='find'){const r=hub.rooms.get(m.room);if(r&&!r.moved)post({kind:'here',to:m.from,from:tab,nonce:m.nonce});return;}
   if(m.kind==='claim'){release(m.room);return;}
   if(m.kind==='gone'){for(const [key,peer] of relays)if(peer.from===m.from){relays.delete(key);peer.live=false;hub.disconnect(peer);}for(const conn of routes.values())if(conn.owner===m.from)drop(conn,1001,'The tab hosting this room was closed. Reconnect to keep playing here.',false);sync();return;}
   if(m.to!==tab)return;
   const key=m.from+'/'+m.conn;
   if(m.kind==='here'){const w=finding.get(m.nonce);if(w){finding.delete(m.nonce);clearTimeout(w.timer);w.resolve(m.from);}return;}
   if(m.kind==='open'&&!relays.has(key)){const peer={from:m.from,conn:m.conn,live:true};peer.link={open:()=>peer.live,deliver:text=>post({kind:'deliver',to:peer.from,from:tab,conn:peer.conn,text}),close:(code,reason)=>{if(!peer.live)return;peer.live=false;post({kind:'kick',to:peer.from,from:tab,conn:peer.conn,code,reason});later(()=>{relays.delete(key);hub.disconnect(peer);sync();});}};relays.set(key,hub.connect(peer));sync();return;}
   if(m.kind==='send'){const peer=relays.get(key);if(peer&&peer.live&&typeof m.text==='string'&&m.text.length<=MAX_PAYLOAD)hub.receive(peer,m.text,false);return;}
   if(m.kind==='leave'){const peer=relays.get(key);if(peer){relays.delete(key);peer.live=false;hub.disconnect(peer);sync();}return;}
   const conn=routes.get(m.conn);if(!conn||conn.owner!==m.from)return;
   if(m.kind==='deliver'&&typeof m.text==='string'){conn.heard=Date.now();down(conn,m.text);}
   else if(m.kind==='kick')drop(conn,m.code||1000,m.reason||'',false);
  }
  function leaving(){for(const r of hub.rooms.values())persist(r).catch(()=>{});post({kind:'gone',from:tab});}
  function returning(event){if(!event.persisted)return;for(const [key,peer] of relays){relays.delete(key);peer.live=false;hub.disconnect(peer);}for(const conn of routes.values())drop(conn,1001,'This page was restored. Reconnect to keep playing.',false);sync();}
  if(options.lifecycle!==false&&typeof root.addEventListener==='function'){root.addEventListener('pagehide',leaving);root.addEventListener('pageshow',returning);}
  return {tab,hub,socket,shareable:!!channel&&!!storage,
   close(){stopped=true;if(timers){timers.stop();timers=null;}clearInterval(watchdog);watchdog=null;if(channel)channel.close();channel=null;if(typeof root.removeEventListener==='function'){root.removeEventListener('pagehide',leaving);root.removeEventListener('pageshow',returning);}},
   leave:leaving};
 }
 let shared=null;
 function page(){return shared||(shared=createPageServer());}

 const api={world,spawn,surfaceSpawn,player,wire,room,active,snapshot,input,tick,action,resetDemo,serialize,deserialize,createHub,createPageServer,page,PageSocket,DIMENSIONS};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.MinecraftMultiplayerServer=api;
})(typeof window!=='undefined'?window:globalThis);
