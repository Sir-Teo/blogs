'use strict';
// The in-page server: the same hub behind loopback sockets, browser storage and
// BroadcastChannel tabs. Node supplies MessageChannel, BroadcastChannel and events.
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./server-core.cjs');
const aim={position:[8,7,7],yaw:Math.atan2(3,-1),pitch:-.038};
function memoryStorage(){const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>{map.set(k,String(v));},removeItem:k=>{map.delete(k);},map};}
function tab(t,storage,channel='test-'+t.name){const s=G.createPageServer({storage,channel,lifecycle:false,worker:false,findTimeout:150});t.after(()=>s.close());return s;}
function client(server){const socket=server.socket(),messages=[],waiters=[],closed=new Promise(resolve=>socket.addEventListener('close',resolve));
 socket.addEventListener('message',event=>{assert.equal(typeof event.data,'string');const m=JSON.parse(event.data);messages.push(m);for(const w of [...waiters])if(w.match(m)){waiters.splice(waiters.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}});
 const opened=new Promise(resolve=>socket.addEventListener('open',resolve));
 return {socket,messages,opened,closed,send:m=>socket.send(JSON.stringify(m)),wait(match){const found=messages.find(match);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const w={match,resolve};w.timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('Timed out; received '+JSON.stringify(messages.slice(-3)).slice(0,300)));},3000);waiters.push(w);});}};}

test('loopback sockets open and deliver asynchronously, keep delayed order, and save to storage',async t=>{
 const storage=memoryStorage(),server=tab(t,storage),a=client(server);
 assert.equal(a.socket.readyState,0,'Opening is never synchronous');assert.throws(()=>a.socket.send('{}'));
 await a.opened;assert.equal(a.socket.readyState,1);
 a.send({type:'join',room:null,name:'Alice'});assert.equal(a.messages.length,0,'Replies arrive in a later task');
 const welcome=await a.wait(m=>m.type==='welcome');assert.equal(welcome.cells.length,8192);assert.match(welcome.room,/^[A-Z2-9]{8}$/);
 a.send({type:'break-start',seq:1,...aim});a.send({type:'break-finish',seq:2,...aim});
 assert.equal((await a.wait(m=>m.type==='ack'&&m.seq===2)).accepted,false,'An early finish is refused');
 a.send({type:'delay',ms:250});const sent=Date.now();a.send({type:'break-abort',seq:3});a.send({type:'delay',ms:0});a.send({type:'break-abort',seq:4});
 await a.wait(m=>m.type==='ack'&&m.seq===4);assert(Date.now()-sent>=240,'The reply delay holds later replies behind it');
 const order=[3,4].map(seq=>a.messages.findIndex(m=>m.type==='ack'&&m.seq===seq));assert(order[0]<order[1]);
 a.send({type:'place',seq:5,position:[5,6,8],typeValue:8,yaw:0,pitch:-Math.PI/2});assert((await a.wait(m=>m.type==='ack'&&m.seq===5)).accepted);
 a.send({type:'save'});const saved=await a.wait(m=>m.type==='saved');assert.equal(saved.revision,1);
 const record=JSON.parse(storage.getItem('minecraft-multi:room:'+welcome.room));assert.equal(record.revision,1);assert.equal(G.deserialize(record).world.get(5,6,8),8);
 a.socket.close();await a.closed;assert.equal(a.socket.readyState,3);
 // A reload: a fresh page server with the same storage resumes the player.
 const reloaded=tab(t,storage,'reload-'+t.name),b=client(reloaded);await b.opened;b.send({type:'join',room:welcome.room.toLowerCase(),token:welcome.token});
 const resumed=await b.wait(m=>m.type==='welcome');assert.equal(resumed.playerId,welcome.playerId);assert.equal(resumed.inventory.torch,7);assert.equal(resumed.actionSeq,5);
 const missing=client(reloaded);await missing.opened;missing.send({type:'join',room:'ZZZZZZZZ'});assert.match((await missing.wait(m=>m.type==='error')).message,/not open in this browser/);
 b.socket.close();missing.socket.close();
});

test('another tab joins through the tab that holds the room, then takes over when it closes',async t=>{
 const storage=memoryStorage(),one=tab(t,storage),two=tab(t,storage),host=client(one);await host.opened;
 host.send({type:'join',room:null,name:'Host'});const created=await host.wait(m=>m.type==='welcome');
 const guest=client(two);await guest.opened;guest.send({type:'join',room:created.room,name:'Guest'});
 const joined=await guest.wait(m=>m.type==='welcome');assert.equal(joined.room,created.room);assert.equal(joined.players.length,2);
 assert.equal(two.hub.rooms.size,0,'The guest tab relays; it does not hold a second copy');assert.equal(one.hub.rooms.get(created.room).players.size,2);
 guest.send({type:'place',seq:1,position:[10,6,7],typeValue:9,yaw:0,pitch:-Math.PI/2});
 const ack=await guest.wait(m=>m.type==='ack'&&m.seq===1);
 if(ack.accepted)await host.wait(m=>m.type==='block'&&m.actionSeq===1&&m.by===joined.playerId);
 guest.send({type:'input',seq:1,forward:1,side:0,jump:false,sprint:false,yaw:-Math.PI/2,pitch:0,tool:'pickaxe'});
 await one.hub.step();await host.wait(m=>m.type==='state'&&m.players.some(p=>p.id===joined.playerId&&p.inputSeq===1));
 // The holding tab goes away (pagehide): it saves, and the guest is told why it closed.
 one.leave();const closed=await guest.closed;assert.match(closed.reason,/tab hosting this room was closed/);
 one.close();
 const again=client(two);await again.opened;again.send({type:'join',room:created.room,token:joined.token});
 const resumed=await again.wait(m=>m.type==='welcome');assert.equal(resumed.playerId,joined.playerId);assert.equal(two.hub.rooms.size,1,'The remaining tab restores the saved room');
 again.socket.close();await again.closed;host.socket.close();
});
