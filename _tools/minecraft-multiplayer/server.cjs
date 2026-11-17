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
  const rooms=new Map(),maxRooms=options.maxRooms??64;
  await fs.mkdir(dataDir,{recursive:true});
  for(const name of (await fs.readdir(dataDir)).filter(n=>/^[A-Z2-9]{8}\.json$/.test(n)).slice(0,maxRooms))try{const text=await fs.readFile(path.join(dataDir,name),'utf8');if(text.length>1000000)continue;const room=Game.deserialize(JSON.parse(text));if(name!==room.code+'.json')continue;rooms.set(room.code,room);}catch(error){console.warn('Ignored invalid room save:',name,error.message);}
  let saving=Promise.resolve();
  function save(r){const snapshot=Game.serialize(r),body=JSON.stringify(snapshot),saved={revision:snapshot.revision,tick:snapshot.tick};r.dirty=false;const task=saving.then(async()=>{const file=path.join(dataDir,r.code+'.json'),temp=file+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';await fs.writeFile(temp,body,{mode:0o600});await fs.rename(temp,file);return saved;});saving=task.catch(error=>{r.dirty=true;console.error('Room save failed:',error.message);});return task;}
  // Sessions, reply delay and the protocol are shared with the in-page server.
  const hub=Game.createHub({rooms,maxRooms,save,transport:{open:peer=>peer.ws.readyState===WebSocket.OPEN,deliver:(peer,text)=>peer.ws.send(text),congested:peer=>peer.ws.bufferedAmount>1000000,close:(peer,code,reason)=>peer.ws.close(code,reason)}}),peers=hub.peers;
  // Tell pages this process serves that their cave server is right here.
  const marker='<meta name="minecraft-multiplayer-server" content="/ws">';
  const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(u.pathname==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,protocol:1,rooms:rooms.size}));return;}let pathname=decodeURIComponent(u.pathname);if(pathname==='/blogs')pathname='/';else if(pathname.startsWith('/blogs/'))pathname=pathname.slice(6);const file=path.resolve(siteDir,'.'+pathname);if(file!==siteDir&&!file.startsWith(siteDir+path.sep)){res.writeHead(403);res.end();return;}let target=file;const stat=await fs.stat(target);if(stat.isDirectory())target=path.join(target,'index.html');let body=await fs.readFile(target);if(path.extname(target)==='.html'){const html=body.toString('utf8'),at=html.indexOf('</head>');if(at>=0)body=Buffer.from(html.slice(0,at)+marker+html.slice(at));}res.writeHead(200,{'content-type':MIME[path.extname(target)]||'application/octet-stream','x-content-type-options':'nosniff'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}});
  const wss=new WebSocketServer({noServer:true,maxPayload:4096});
  function originAllowed(req){if(!req.headers.origin)return true;try{const o=new URL(req.headers.origin),requestHost=new URL('http://'+req.headers.host).hostname;if(options.publicOrigin&&o.origin===new URL(options.publicOrigin).origin)return true;return ['http:','https:'].includes(o.protocol)&&(['localhost','127.0.0.1','[::1]','sir-teo.github.io'].includes(o.hostname)||(o.hostname===requestHost&&['4173','4174',''].includes(o.port)));}catch{return false;}}
  server.on('upgrade',(req,socket,head)=>{if(req.url!=='/ws'||!originAllowed(req)||peers.size>=256){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
  wss.on('connection',ws=>{const peer=hub.connect({ws});
    ws.on('error',()=>{});
    ws.on('message',(data,binary)=>hub.receive(peer,data.toString(),binary));
    ws.on('close',()=>hub.disconnect(peer));
  });
  const interval=setInterval(hub.step,50);
  const autosave=setInterval(hub.autosave,2000);
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});} catch(error) {clearInterval(interval);clearInterval(autosave);wss.close();throw error;}
  const address=server.address();return {server,rooms,port:address.port,url:`http://${host}:${address.port}`,async close(){clearInterval(interval);clearInterval(autosave);for(const peer of peers)peer.ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));for(const r of rooms.values())await save(r);await saving;}};
}
if(require.main===module){const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i++){const key={'--port':'port','--host':'host','--data-dir':'dataDir','--site-dir':'siteDir','--public-origin':'publicOrigin'}[args[i]];if(!key||args[i+1]===undefined)throw Error('Usage: node server.cjs [--host 127.0.0.1] [--port 4174] [--data-dir path] [--site-dir path] [--public-origin https://example.com]');options[key]=key==='port'?Number(args[++i]):args[++i];}start(options).then(app=>{console.log('Cave server listening at '+app.url+' (WebSocket /ws)');let closing=false;const stop=()=>{if(!closing){closing=true;app.close().then(()=>process.exit(0));}};process.on('SIGINT',stop);process.on('SIGTERM',stop);}).catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={start};
