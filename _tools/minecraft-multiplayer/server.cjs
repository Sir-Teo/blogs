'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');
const Game=require('./server-core.cjs');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
async function start(options={}) {
  const host=options.host??process.env.HOST??'127.0.0.1',port=options.port??Number(process.env.PORT||4174),dataDir=path.resolve(options.dataDir??process.env.DATA_DIR??path.join(__dirname,'var')),siteDir=path.resolve(options.siteDir??process.env.SITE_DIR??path.join(__dirname,'../../_site'));
  options.publicOrigin??=process.env.PUBLIC_ORIGIN;
  const rooms=new Map(),peers=new Set(),maxRooms=options.maxRooms??64;
  await fs.mkdir(dataDir,{recursive:true});
  for(const name of (await fs.readdir(dataDir)).filter(n=>/^[A-Z2-9]{8}\.json$/.test(n)).slice(0,maxRooms))try{const text=await fs.readFile(path.join(dataDir,name),'utf8');if(text.length>1000000)continue;const room=Game.deserialize(JSON.parse(text));if(name!==room.code+'.json')continue;rooms.set(room.code,room);}catch(error){console.warn('Ignored invalid room save:',name,error.message);}
  let saving=Promise.resolve();
  function save(r){const snapshot=Game.serialize(r),body=JSON.stringify(snapshot),saved={revision:snapshot.revision,tick:snapshot.tick};r.dirty=false;const task=saving.then(async()=>{const file=path.join(dataDir,r.code+'.json'),temp=file+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';await fs.writeFile(temp,body,{mode:0o600});await fs.rename(temp,file);return saved;});saving=task.catch(error=>{r.dirty=true;console.error('Room save failed:',error.message);});return task;}
  function send(peer,message,immediate=false){if(peer.ws.readyState!==WebSocket.OPEN)return;const text=JSON.stringify(message);if(peer.pending.length>=150||peer.ws.bufferedAmount>1000000){peer.ws.close(1008,'Slow connection');return;}const due=Math.max(Date.now()+(immediate?0:peer.delay),peer.lastDue);peer.lastDue=due;peer.pending.push({text,due});flush(peer);}
  function flush(peer){if(peer.timer||!peer.pending.length)return;const next=peer.pending[0],wait=next.due-Date.now();if(wait>0){peer.timer=setTimeout(()=>{peer.timer=null;flush(peer);},wait);return;}while(peer.pending.length&&peer.pending[0].due<=Date.now()){const m=peer.pending.shift();if(peer.ws.readyState===WebSocket.OPEN)peer.ws.send(m.text);}if(peer.pending.length)flush(peer);}
  function broadcast(r,m){for(const p of r.players.values())if(p.peer)send(p.peer,m);}
  function state(r){for(const p of r.players.values())if(p.peer)send(p.peer,{type:'state',tick:r.tick,revision:r.revision,players:Game.active(r),inventory:{...p.inventory}});}
  function error(peer,message){send(peer,{type:'error',message});}
  const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(u.pathname==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,protocol:1,rooms:rooms.size}));return;}let pathname=decodeURIComponent(u.pathname);if(pathname==='/blogs')pathname='/';else if(pathname.startsWith('/blogs/'))pathname=pathname.slice(6);const file=path.resolve(siteDir,'.'+pathname);if(file!==siteDir&&!file.startsWith(siteDir+path.sep)){res.writeHead(403);res.end();return;}let target=file;const stat=await fs.stat(target);if(stat.isDirectory())target=path.join(target,'index.html');const body=await fs.readFile(target);res.writeHead(200,{'content-type':MIME[path.extname(target)]||'application/octet-stream','x-content-type-options':'nosniff'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}});
  const wss=new WebSocketServer({noServer:true,maxPayload:4096});
  function originAllowed(req){if(!req.headers.origin)return true;try{const o=new URL(req.headers.origin),requestHost=new URL('http://'+req.headers.host).hostname;if(options.publicOrigin&&o.origin===new URL(options.publicOrigin).origin)return true;return ['http:','https:'].includes(o.protocol)&&(['localhost','127.0.0.1','[::1]','sir-teo.github.io'].includes(o.hostname)||(o.hostname===requestHost&&['4173','4174',''].includes(o.port)));}catch{return false;}}
  server.on('upgrade',(req,socket,head)=>{if(req.url!=='/ws'||!originAllowed(req)||peers.size>=256){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
  wss.on('connection',ws=>{const peer={ws,room:null,player:null,delay:0,pending:[],lastDue:0,timer:null,window:Date.now(),count:0};peers.add(peer);const joinTimer=setTimeout(()=>{if(!peer.player)ws.close(1008,'Join first');},10000);
    ws.on('error',()=>{});
    ws.on('message',(data,binary)=>{try{if(Date.now()-peer.window>=1000){peer.window=Date.now();peer.count=0;}if(++peer.count>100){ws.close(1008,'Message rate exceeded');return;}if(binary){error(peer,'Text JSON messages required.');return;}let m;try{m=JSON.parse(data.toString());}catch{error(peer,'Malformed JSON.');return;}if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.type!=='string'){error(peer,'Invalid message.');return;}
      if(m.type==='join'){
        if(peer.player){error(peer,'Already joined.');return;}let r;
        if(m.room==null){if(rooms.size>=maxRooms){error(peer,'Room limit reached.');return;}let code;do{code=Array.from(crypto.randomBytes(8),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');}while(rooms.has(code));r=Game.room(code);rooms.set(code,r);}
        else {if(typeof m.room!=='string'||!rooms.has(m.room.toUpperCase())){error(peer,'Room not found. Check the invite code.');return;}r=rooms.get(m.room.toUpperCase());}
        if(Game.active(r).length>=8){error(peer,'This room already has eight connected players.');return;}
        let p;if(m.token!==undefined){if(typeof m.token!=='string'||!(p=[...r.players.values()].find(p=>p.token===m.token))){error(peer,'Resume token not found. Join without it to create a new player.');return;}if(p.peer){error(peer,'This player is already connected in another tab.');return;}}
        if(!p){if(r.players.size>=64){error(peer,'Saved player limit reached.');return;}p=Game.player(r.players.size,m.name);r.players.set(p.id,p);if(!r.hostId)r.hostId=p.id;}
        p.peer=peer;p.queue=[];p.intent=null;p.ticket=null;p.lastReceived=p.inputSeq;peer.room=r;peer.player=p;r.dirty=true;clearTimeout(joinTimer);send(peer,{...Game.snapshot(r,p,'welcome'),protocol:1,room:r.code,playerId:p.id,token:p.token,actionSeq:p.actionSeq});state(r);return;
      }
      if(!peer.player){error(peer,'Join a room first.');return;}const r=peer.room,p=peer.player;
      if(m.type==='input'){if(!Game.input(p,m))error(peer,'Invalid, duplicate, or excessive input.');return;}
      if(m.type==='delay'){if(!Number.isInteger(m.ms)||m.ms<0||m.ms>600)error(peer,'Delay must be between 0 and 600 milliseconds.');else peer.delay=m.ms;return;}
      if(m.type==='ping'){if(typeof m.time==='number'&&Number.isFinite(m.time))send(peer,{type:'pong',time:m.time,tick:r.tick});else error(peer,'Invalid ping.');return;}
      if(m.type==='save'){save(r).then(saved=>send(peer,{type:'saved',...saved})).catch(()=>error(peer,'The room could not be saved.'));return;}
      if(m.type==='respawn'){const pose=m.surface===true?Game.surfaceSpawn(p.color,r.world):Game.spawn(p.color);Object.assign(p,pose,{vy:0,onGround:false,queue:[],intent:null,ticket:null});r.dirty=true;send(peer,{type:'respawn',player:Game.wire(p)});state(r);return;}
      if(m.type==='demo-reset'){if(p.id!==r.hostId){error(peer,'Only the room host can reset the experiment.');return;}Game.resetDemo(r);for(const other of r.players.values())if(other.peer)send(other.peer,Game.snapshot(r,other));return;}
      const result=Game.action(r,p,m);for(const edit of result.edits)broadcast(r,edit);send(peer,result.response);
    }catch(error_){error(peer,'Invalid message.');}});
    ws.on('close',()=>{clearTimeout(joinTimer);clearTimeout(peer.timer);peer.pending=[];peers.delete(peer);if(peer.player){const r=peer.room,p=peer.player;p.peer=null;p.intent=null;p.queue=[];p.ticket=null;r.dirty=true;state(r);save(r).catch(()=>{});}});
  });
  const interval=setInterval(()=>{for(const r of rooms.values())if(Game.active(r).length){Game.tick(r);state(r);}},50);
  const autosave=setInterval(()=>{for(const r of rooms.values())if(r.dirty)save(r).catch(()=>{});},2000);
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});} catch(error) {clearInterval(interval);clearInterval(autosave);wss.close();throw error;}
  const address=server.address();return {server,rooms,port:address.port,url:`http://${host}:${address.port}`,async close(){clearInterval(interval);clearInterval(autosave);for(const peer of peers)peer.ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));for(const r of rooms.values())await save(r);await saving;}};
}
if(require.main===module){const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i++){const key={'--port':'port','--host':'host','--data-dir':'dataDir','--site-dir':'siteDir','--public-origin':'publicOrigin'}[args[i]];if(!key||args[i+1]===undefined)throw Error('Usage: node server.cjs [--host 127.0.0.1] [--port 4174] [--data-dir path] [--site-dir path] [--public-origin https://example.com]');options[key]=key==='port'?Number(args[++i]):args[++i];}start(options).then(app=>{console.log('Cave server listening at '+app.url+' (WebSocket /ws)');let closing=false;const stop=()=>{if(!closing){closing=true;app.close().then(()=>process.exit(0));}};process.on('SIGINT',stop);process.on('SIGTERM',stop);}).catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={start};
