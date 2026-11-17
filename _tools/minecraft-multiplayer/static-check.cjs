'use strict';
// The article on a static host: no cave server, no WebSocket. Every figure must
// work against the in-page server, and the final invite across tabs.
//   bundle exec jekyll build && PLAYWRIGHT_MODULE=/path/to/playwright node _tools/minecraft-multiplayer/static-check.cjs
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const site=path.resolve(process.env.SITE_DIR||path.join(__dirname,'../../_site'));
const out=process.env.MINECRAFT_MULTIPLAYER_SCREENSHOTS||'/tmp/minecraft-multiplayer-qa/in-page';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.json':'application/json','.xml':'application/xml'};
// A plain file server, like GitHub Pages: /blogs/ maps to the build output.
const files=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!name.startsWith('/blogs/')){res.writeHead(404);res.end();return;}name=path.join(site,name.slice(6));if(!name.startsWith(site)){res.writeHead(403);res.end();return;}if(fs.existsSync(name)&&fs.statSync(name).isDirectory())name=path.join(name,'index.html');fs.readFile(name,(error,body)=>{if(error){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':MIME[path.extname(name)]||'application/octet-stream'});res.end(body);});});
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>files.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+files.address().port,post=base+'/blogs/2026/10/26/one-world-two-players.html';
 const browser=await chromium.launch();const errors=[],log=s=>console.log('ok '+s);
 function watch(page,label){page.on('pageerror',e=>errors.push(label+' pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push(label+' console: '+m.text());});page.on('websocket',ws=>errors.push(label+' unexpected real WebSocket: '+ws.url()));}
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'}),p=await context.newPage();watch(p,'A');
  await p.goto(post,{waitUntil:'networkidle'});
  assert.equal(await p.locator('figure[data-multi-stage]').count(),8);
  assert.equal(await p.locator('#mn-connect .mn-connection .mn-mode').innerText(),'In-page server (this tab)');log('settings summary names the in-page mode before connecting');
  const S=()=>p.evaluate(()=>MinecraftMultiplayer.snapshot());
  async function press(id,label){await p.locator('#'+id).getByRole('button',{name:label,exact:true}).click();await p.waitForFunction(()=>!MinecraftMultiplayer.snapshot().busy);}
  const status=()=>p.locator('#mn-connect .mn-global-status').innerText();
  await p.locator('#mn-copies').getByRole('button',{name:'Mine in the first copy',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#mn-copies .mb-metrics strong').textContent==='Air');log('00 copies');
  // 01
  await press('mn-connect','Connect to the server');let s=await S();
  assert.equal(s.mode,'in-page');assert.equal(s.status,'Connected');assert.ok(/^[A-Z2-9]{8}$/.test(s.room));assert.equal(s.primary.ready,true);
  assert.match(await status(),/Connected to room .* on the in-page server\./);
  const metrics01=await p.locator('#mn-connect .mb-metrics').innerText();assert.match(metrics01,/Connected/);assert.match(metrics01,/8,192/);assert.match(metrics01,/PLAY/);
  log('01 connect: '+s.room+' · '+metrics01.replace(/\s+/g,' '));
  await p.locator('#mn-connect .mn-connection summary').click();await p.locator('#mn-connect').screenshot({path:out+'/01-connect.png'});
  // typing an address switches the label without connecting
  await p.locator('.mn-server-input').fill('ws://127.0.0.1:4174/ws');await p.waitForTimeout(100);
  const help=await p.locator('#mn-connect .mn-connection p').innerText();assert.match(help,/Connect to the server.*to switch/);assert.equal(await p.locator('#mn-connect .mn-mode').innerText(),'In-page server (this tab)','Summary keeps naming the live connection');
  await p.locator('.mn-server-input').fill('');await p.waitForTimeout(100);assert.match(await p.locator('#mn-connect .mn-connection p').innerText(),/runs inside this tab/);log('settings panel describes modes; typed address offers a switch');
  // 02
  await press('mn-second','Connect the second client');s=await S();assert.equal(s.primary.players.length,2);assert.equal(s.companion.ready,true);assert.equal(s.companion.revision,s.primary.revision);log('02 second client joins: players='+s.primary.players.length);
  // 03
  await press('mn-authority','Mine through the server');s=await S();assert.equal(s.primary.reference,0);assert.equal(s.companion.reference,0);assert.equal(s.primary.inventory.cobblestone,33);log('03 committed edit on both clients, cobblestone=33');
  // 04 prediction: confirmed, then refused with 600 ms delay
  await p.locator('#mn-prediction').getByRole('slider',{name:'Reply delay',exact:true}).evaluate(n=>{n.value='600';n.dispatchEvent(new Event('input',{bubbles:true}));});
  let t0=Date.now();await press('mn-prediction','Predict a completed break');s=await S();assert.equal(s.primary.reference,0);assert.equal(s.primary.pending,0);assert.match(await status(),/predicted opening is now confirmed/);log('04 prediction confirmed in '+(Date.now()-t0)+' ms');
  await p.locator('#mn-prediction').getByRole('button',{name:'Try finishing too early',exact:true}).click();await p.waitForFunction(()=>MinecraftMultiplayer.snapshot().primary.pending>0);
  s=await S();assert.equal(s.primary.reference,0);assert.equal(s.companion.reference,7,'Second client keeps confirmed stone');await p.locator('#mn-prediction').screenshot({path:out+'/04-prediction-pending.png'});
  t0=Date.now();await p.waitForFunction(()=>!MinecraftMultiplayer.snapshot().busy);const settle=Date.now()-t0;s=await S();assert.equal(s.primary.reference,7);assert.equal(s.primary.pending,0);assert.ok(s.primary.rejected>0);assert.ok(settle>=300,'the refusal waits for the delayed reply ('+settle+' ms)');log('04 refused early finish rolled back after '+settle+' ms of pending prediction');
  await p.waitForTimeout(2300);const rtt=await p.locator('#mn-prediction .mb-metrics').innerText();const ms=+(/(\d+) ms/.exec(rtt)||[])[1];assert.ok(ms>=590,'round trip reflects the 600 ms delay: '+rtt);log('04 measured round trip '+ms+' ms with the 600 ms slider');
  await p.locator('#mn-prediction').getByRole('slider',{name:'Reply delay',exact:true}).evaluate(n=>{n.value='0';n.dispatchEvent(new Event('input',{bubbles:true}));});
  // 05 race
  await press('mn-race','Reset the target and race');s=await S();assert.deepEqual(s.lastRace,{accepted:1,awarded:1});assert.equal(s.primary.revision,s.companion.revision);await p.locator('#mn-race').screenshot({path:out+'/05-race.png'});log('05 race: '+JSON.stringify(s.lastRace));
  // 06 movement
  await p.locator('#mn-movement').getByRole('button',{name:'Add movement',exact:true}).evaluate(n=>n.click());await p.waitForFunction(()=>MinecraftMultiplayer.snapshot().stage===6);await p.keyboard.press('Escape');
  s=await S();const cid=s.companion.id,before=s.primary.players.find(q=>q.id===cid);
  await press('mn-movement','Move the second client');await p.waitForTimeout(300);s=await S();const after=s.primary.players.find(q=>q.id===cid);
  assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>1,'the second client moved in the first client view');assert.match(await p.locator('#mn-movement .mn-global-status').innerText(),/walked across/);
  await p.locator('#mn-movement').scrollIntoViewIfNeeded();await p.waitForTimeout(300);await p.locator('#mn-movement').screenshot({path:out+'/06-movement.png'});log('06 second client avatar moved from '+[before.x,before.z].map(v=>v.toFixed(2))+' to '+[after.x,after.z].map(v=>v.toFixed(2)));
  // 07 play, save, disconnect, reconnect, reload
  const fa=p.locator('#mn-play');await fa.locator('.mp-play').evaluate(n=>n.click());await p.waitForFunction(()=>MinecraftMultiplayer.snapshot().stage===7&&!MinecraftMultiplayer.snapshot().busy);await p.keyboard.press('Escape');
  s=await S();assert.equal(s.companion,null);const room=s.room;
  const link=fa.locator('.mn-invite-link');assert.equal(await link.innerText(),'Open in another tab ↗');const href=await link.getAttribute('href');assert.equal(href,base+'/blogs/2026/10/26/one-world-two-players.html?room='+room+'&guest=1#mn-play');
  assert.equal(await fa.locator('.mn-invite-note').isVisible(),true);log('07 invite: '+href);
  // mine the reference with the keyboard, as a reader would
  const va=fa.locator('.mp-view');await va.scrollIntoViewIfNeeded();await va.focus();await p.keyboard.press('Enter');
  await p.keyboard.down('KeyF');await p.waitForFunction(()=>{const q=MinecraftMultiplayer.snapshot().primary;return q.reference===0&&q.pending===0;},null,{timeout:8000}).catch(async e=>{console.log(await S());throw e;});await p.keyboard.up('KeyF');await p.keyboard.press('Escape');
  await fa.getByRole('button',{name:'Save world',exact:true}).click();await p.waitForFunction(()=>MinecraftMultiplayer.snapshot().lastSaved!==null);const saved=await S();
  assert.match(await fa.locator('.mn-global-status').innerText(),/in this browser/);
  const stored=await p.evaluate(r=>JSON.parse(localStorage.getItem('minecraft-multi:room:'+r)),room);assert.equal(stored.revision,saved.lastSaved.revision);log('07 saved revision '+stored.revision+' to localStorage');
  await fa.getByRole('button',{name:'Disconnect',exact:true}).click();await p.waitForFunction(()=>MinecraftMultiplayer.snapshot().status==='Disconnected');
  await fa.locator('.mp-play').evaluate(n=>n.click());await p.waitForFunction(()=>MinecraftMultiplayer.snapshot().status==='Connected'&&!MinecraftMultiplayer.snapshot().busy);await p.keyboard.press('Escape');
  s=await S();assert.equal(s.primary.id,saved.primary.id);assert.deepEqual(s.primary.inventory,saved.primary.inventory);assert.equal(s.primary.reference,0);log('07 disconnect + reconnect resumed same player, inventory '+JSON.stringify(s.primary.inventory));
  await p.reload({waitUntil:'networkidle'});await fa.locator('.mp-play').evaluate(n=>n.click());await p.waitForFunction(()=>MinecraftMultiplayer.snapshot().stage===7&&MinecraftMultiplayer.snapshot().status==='Connected');await p.keyboard.press('Escape');
  s=await S();assert.equal(s.primary.id,saved.primary.id);assert.equal(s.room,room);assert.equal(s.primary.reference,0);log('07 reload resumed the same player from localStorage + sessionStorage');
  await fa.scrollIntoViewIfNeeded();await p.waitForTimeout(300);await fa.screenshot({path:out+'/07-play.png'});
  // Cross-tab invite in the same browser
  const pb=await context.newPage();watch(pb,'B');await pb.goto(href,{waitUntil:'networkidle'});const fb=pb.locator('#mn-play');
  assert.equal(await fb.locator('.mp-play').innerText(),'Join this world');
  await fb.locator('.mp-play').evaluate(n=>n.click());await pb.waitForFunction(()=>MinecraftMultiplayer.snapshot().stage===7&&MinecraftMultiplayer.snapshot().status==='Connected',null,{timeout:10000});await pb.keyboard.press('Escape');
  await p.waitForFunction(()=>MinecraftMultiplayer.snapshot().primary.players.length===2);
  let sb=await pb.evaluate(()=>MinecraftMultiplayer.snapshot());s=await S();assert.equal(sb.room,room);assert.notEqual(sb.primary.id,s.primary.id);assert.equal(sb.primary.reference,0,'guest sees the saved edit');
  assert.equal(await pb.evaluate(()=>MinecraftMultiplayerServer.page().hub.rooms.size),0,'guest tab relays');log('cross-tab guest joined '+room+' through tab A');
  // guest walks; host sees it
  const gid=sb.primary.id,g0=s.primary.players.find(q=>q.id===gid);const vb=fb.locator('.mp-view');await vb.scrollIntoViewIfNeeded();await vb.focus();await pb.keyboard.press('Enter');await pb.keyboard.down('KeyW');await pb.waitForTimeout(600);await pb.keyboard.up('KeyW');await pb.keyboard.press('Escape');await p.waitForTimeout(300);
  s=await S();const g1=s.primary.players.find(q=>q.id===gid);assert.ok(Math.hypot(g1.x-g0.x,g1.z-g0.z)>.5,'host sees guest move '+JSON.stringify([g0,g1]));log('guest moved '+Math.hypot(g1.x-g0.x,g1.z-g0.z).toFixed(2)+' blocks in host view');
  // host places a torch at its feet; guest receives the edit
  const rev=s.primary.revision;await va.scrollIntoViewIfNeeded();await va.focus();await p.keyboard.press('Enter');await p.keyboard.down('ArrowDown');await p.waitForFunction(()=>MinecraftMultiplayer.snapshot().primary.pitch<-.8);await p.keyboard.up('ArrowDown');await p.waitForTimeout(150);await p.keyboard.press('Digit3');await p.keyboard.press('KeyE');
  await pb.waitForFunction(v=>MinecraftMultiplayer.snapshot().primary.revision>v,rev,{timeout:5000});await p.keyboard.press('Escape');log('host torch edit reached the guest tab (revision '+(await pb.evaluate(()=>MinecraftMultiplayer.snapshot().primary.revision))+')');
  await fb.scrollIntoViewIfNeeded();await pb.waitForTimeout(300);await fb.screenshot({path:out+'/07-guest-tab.png'});
  // the host tab closes: guest is told, then takes the room over from storage on reconnect
  await p.close();await pb.waitForFunction(()=>MinecraftMultiplayer.snapshot().status==='Disconnected',null,{timeout:5000});
  const told=await fb.locator('.mn-global-status').innerText();assert.match(told,/tab hosting this room was closed/);
  await fb.locator('.mp-play').evaluate(n=>n.click());await pb.waitForFunction(()=>MinecraftMultiplayer.snapshot().status==='Connected'&&!MinecraftMultiplayer.snapshot().busy,null,{timeout:10000});await pb.keyboard.press('Escape');
  sb=await pb.evaluate(()=>MinecraftMultiplayer.snapshot());assert.equal(sb.primary.id,gid);assert.equal(await pb.evaluate(()=>MinecraftMultiplayerServer.page().hub.rooms.size),1);log('after host tab closed, guest resumed and now holds the room: '+told);
  await context.close();
  // A shared link with a room this browser lacks must not block early figures; the final figure explains.
  const c2=await browser.newContext({viewport:{width:390,height:900},deviceScaleFactor:1}),q=await c2.newPage();watch(q,'C');
  await q.goto(post+'?room=ABCDEFGH&guest=1#mn-play',{waitUntil:'networkidle'});
  await q.locator('#mn-play .mp-play').evaluate(n=>n.click());await q.waitForFunction(()=>!MinecraftMultiplayer.snapshot().busy&&/not open in this browser/.test(document.querySelector('#mn-play .mn-global-status').textContent),null,{timeout:5000});
  log('final figure explains a foreign invite: '+(await q.locator('#mn-play .mn-global-status').innerText()).slice(0,90)+'…');
  await q.locator('#mn-play').screenshot({path:out+'/07-foreign-invite-390.png'});
  await q.locator('#mn-connect').getByRole('button',{name:'Connect to the server',exact:true}).click();await q.waitForFunction(()=>!MinecraftMultiplayer.snapshot().busy);
  const s3=await q.evaluate(()=>MinecraftMultiplayer.snapshot());assert.equal(s3.status,'Connected');assert.notEqual(s3.room,'ABCDEFGH');log('figure 01 recovers with a new world '+s3.room);
  assert.ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No phone overflow');
  await q.locator('#mn-connect .mn-connection summary').click();await q.locator('#mn-connect').screenshot({path:out+'/01-connect-390.png'});
  for(const width of [390,320])for(const theme of ['light','dark']){await q.setViewportSize({width,height:900});await q.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert.ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No overflow at '+width);for(const id of ['mn-connect','mn-play'])await q.locator('#'+id).screenshot({path:`${out}/${id}-${width}-${theme}.png`});}
  log('no horizontal overflow at 390/320 in light and dark');
  await c2.close();
  assert.deepEqual(errors,[]);console.log('PASS: in-page server on a static host: all figures, delayed prediction and refusal, single race award, remote movement, save/disconnect/reload, cross-tab invite and takeover, foreign-invite recovery, no page or console errors. '+out);
 }finally{await browser.close();files.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
