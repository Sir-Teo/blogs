/* Play the explanation: one editable cave shared with the article's diagrams. */
(function (root) {
  'use strict';
  function direction(camera) {
    var cp=Math.cos(camera.pitch);
    return [Math.sin(camera.yaw)*cp,Math.sin(camera.pitch),Math.cos(camera.yaw)*cp];
  }
  function createWorld(story) {
    var v=story.scene(false,false),original;
    for(var z=4;z<=12;z++)for(var x=3;x<=13;x++)v.set(x,5,z,1);
    v.set(5,6,7,1);v.set(5,7,7,8);
    original=v.data.slice();v.version=0;
    var write=v.set;
    v.set=function(x,y,z,type){if(x<0||x>=v.w||y<0||y>=v.h||z<0||z>=v.d||v.get(x,y,z)===type)return false;write(x,y,z,type);v.version++;return true;};
    v.reset=function(){v.data.set(original);v.version++;};
    return v;
  }
  function canPlace(world,player,p,type) {
    if(!p||p[0]<0||p[0]>=world.w||p[1]<1||p[1]>=world.h||p[2]<0||p[2]>=world.d||world.get.apply(null,p)!==0)return false;
    if(type===8)return world.get(p[0],p[1]-1,p[2])!==0&&world.get(p[0],p[1]-1,p[2])!==8;
    var r=player.radius||.3,h=player.height||1.8;
    return !(player.x+r>p[0]&&player.x-r<p[0]+1&&player.y+h>p[1]&&player.y<p[1]+1&&player.z+r>p[2]&&player.z-r<p[2]+1);
  }
  var api={createWorld:createWorld,direction:direction,canPlace:canPlace};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MinecraftGameplay=api;
  if(typeof document==='undefined')return;
  var Story=root.MinecraftStory,Core=root.MinecraftPlayCore,Render=root.MinecraftPlayRender;
  if(!Story||!Core||!Render)return;
  var BuildCore=root.MinecraftBuildCore,staged=!!document.querySelector('[data-minecraft-build]');
  var world=staged?BuildCore.createWorld(Story):createWorld(Story),lighting=Core.computeLighting(world),sessions=[],active=null;
  var flatLighting={sample:function(){return [0,15];}},tickCount=0,authority={accepted:0,rejected:0,last:'World rules ready.'};
  api.world=world;api.getLighting=function(){return lighting;};
  var reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var names={1:'Stone',2:'Dirt',3:'Grass',4:'Water',5:'Log',6:'Leaves',7:'Our stone',8:'Torch',9:'Cobblestone'};
  var inventory={cobblestone:32,torch:8};
  function el(tag,attrs,parent){var n=document.createElement(tag);Object.keys(attrs||{}).forEach(function(k){if(k==='text')n.textContent=attrs[k];else n.setAttribute(k,attrs[k]);});if(parent)parent.appendChild(n);return n;}
  function toolIcon(tool){var bits=tool==='pickaxe'?'<path fill="#9a7745" d="M7 12h3v3H7zm3-3h3v3h-3zm3-3h3v3h-3z"/><path fill="#cbd5d7" d="M7 3h9v3H7zm9 3h3v6h-3zM4 6h3v3H4z"/>':tool==='torch'?'<path fill="#a17b46" d="M10 9h3v10h-3z"/><path fill="#ffb34f" d="M8 3h7v7H8z"/><path fill="#ffe9a1" d="M10 2h3v6h-3z"/>':'<path fill="#c0c3be" d="m4 6 8-4 8 4-8 4z"/><path fill="#7a817e" d="m4 6 8 4v10l-8-4z"/><path fill="#949d97" d="m12 10 8-4v10l-8 4z"/><path stroke="#535e58" fill="none" d="m5 9 4 2v4l3 2m0-7 4 2 4-3M8 4l4 3 4-3m0 8v5"/>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true">'+bits+'</svg>';}
  function changed(){for(var y=1;y<world.h;y++)for(var z=0;z<world.d;z++)for(var x=0;x<world.w;x++)if(world.get(x,y,z)===8&&!Core.solid(world.get(x,y-1,z))){world.set(x,y,z,0);inventory.torch++;}Story.live.changed();document.dispatchEvent(new Event('minecraft:world-changed'));}
  api.changed=changed;
  api.generate=function(){world.generate?world.generate():world.reset();if(staged&&root.MinecraftBuild&&root.MinecraftBuild.stage>=6)world.set(5,7,7,8);inventory.cobblestone=32;inventory.torch=8;sessions.forEach(function(s){s.spawn();});changed();};
  api.clear=function(){if(active)active.deactivate();world.clear();inventory.cobblestone=32;inventory.torch=8;tickCount=0;changed();};
  api.replace=function(cells,items,poses){if(active)active.deactivate();world.data.set(cells);world.version++;inventory.cobblestone=items.cobblestone;inventory.torch=items.torch;sessions.forEach(function(s){s.spawn();var pose=(poses||[]).find(function(p){return p.id===s.id;});if(pose)s.restorePose(pose);});changed();};
  api.writeCell=function(p,type){if(world.set(p[0],p[1],p[2],type)){changed();return true;}return false;};
  api.inventory=inventory;
  Story.live.attach(world);
  Story.live.subscribe(function(){lighting=Core.computeLighting(world);sessions.forEach(function(s){Core.depenetratePlayer(world,s.player);s.invalidate();});});

  function mount(fig) {
    var required=Number(fig.dataset.buildStage)||0,features={edit:!required||required>=5,light:!required||required>=6,authority:required>=8};
    var defaultSurface=fig.dataset.spawn==='surface',lightView=fig.dataset.gameplay==='light',body=el('div',{class:'mp'},null);
    fig.insertBefore(body,fig.querySelector('figcaption'));fig.dataset.figureMounted='true';
    var frame=el('div',{class:'mp-frame'},body),canvas=el('canvas',{class:'mp-view',tabindex:'0','aria-label':'Playable cave. Press Enter to play. W A S D walk; arrows look; Space jumps; hold F to mine; E places; 1, 2, 3 choose tools; Escape releases controls.'},frame);
    var overview=el('canvas',{class:'mp-overview',hidden:'',tabindex:'0',role:'img','aria-label':'Cutaway of the same editable hillside. Drag or use left and right arrows to rotate.'},frame);
    var renderer=null,ctx=null;
    var play=el('button',{class:'mp-play',type:'button',text:'Play the cave'},frame);
    var exit=el('button',{class:'mp-exit',type:'button',text:'Done',hidden:''},frame);
    var targetLabel=el('span',{class:'mp-target','aria-hidden':'true'},frame);
    var hotbar=el('div',{class:'mp-hotbar','aria-label':'Choose held item'},frame),slots={};
    ['pickaxe','cobblestone','torch'].filter(function(tool){return features.light||tool!=='torch';}).forEach(function(tool,i){var b=el('button',{type:'button','aria-label':(i+1)+': '+(tool==='pickaxe'?'Iron pickaxe':tool),'aria-pressed':String(i===0)},hotbar);b.innerHTML=toolIcon(tool);el('span',{class:'mp-key',text:i+1},b);el('span',{class:'mp-count'},b);b.addEventListener('pointerdown',function(e){e.preventDefault();});b.addEventListener('click',function(){s.tool=tool;stopMining();invalidate();if(s.active)canvas.focus({preventScroll:true});});slots[tool]=b;});
    var touch=el('div',{class:'mp-touch',hidden:''},frame),stick=el('div',{class:'mp-stick',role:'group','aria-label':'Drag to walk'},touch),knob=el('span',{},stick);
    var touchActions=el('div',{class:'mp-touch-actions'},touch);
    var mine=el('button',{type:'button',text:'Mine'},touchActions),place=el('button',{type:'button',text:'Place'},touchActions),jump=el('button',{type:'button',text:'Jump'},touchActions);
    var controls=el('div',{class:'mp-controls'},body),toggle=el('button',{type:'button','aria-pressed':'false',text:'Cutaway view'},controls);
    var respawn=el('button',{type:'button',text:lightView?'Back to this chamber':'Walk the hillside'},controls);
    if(!lightView&&(!required||required===8))el('button',{class:'mp-reset',type:'button',text:'Reset world'},controls).addEventListener('click',function(){api.generate();sessions.forEach(function(a){a.message='';});});
    var helpId=fig.id+'-help';
    var hint=el('p',{class:'mp-help',id:helpId},body);
    hint.innerHTML='<span><kbd>WASD</kbd> walk</span><span><kbd>Space</kbd> jump</span>'+(features.edit?'<span><kbd>Click / F</kbd> hold to mine</span><span><kbd>Right-click / E</kbd> place</span>':'');
    if(matchMedia('(pointer: coarse)').matches)hint.textContent='Drag to look · use the stick to walk'+(features.edit?' · hold Mine to break a block':' · Jump to climb');
    var idleHelpHTML=hint.innerHTML;
    canvas.setAttribute('aria-describedby',helpId);
    overview.setAttribute('aria-describedby',helpId);
    var status=el('p',{class:'mp-status'},body);
    var s={id:fig.id,features:features,locked:!!required,accumulator:0,player:{},yaw:0,pitch:0,tool:'pickaxe',active:false,visible:false,cutaway:false,surface:false,angle:42,keys:{},touchX:0,touchZ:0,touchJump:false,touchMode:false,holding:false,mining:0,elapsed:0,mineKey:'',cooldown:0,particles:[],message:'',messageUntil:0,raf:0,last:0,hit:null};
    sessions.push(s);s.invalidate=invalidate;s.spawn=spawn;
    function spawn(surface){if(surface===undefined)surface=defaultSurface;s.surface=!!surface;s.player={x:lightView?10.5:5.5,y:6,z:lightView?7.5:8.5,vy:0,onGround:true,radius:.3,height:1.8,walked:0};s.yaw=lightView?-Math.PI/2:Math.atan2(3,-1);s.pitch=lightView?-.04:-.038;if(s.surface){s.player.x=11.5;s.player.z=11.5;var top=world.h-1;while(top>0&&!Core.solid(world.get(11,top,11)))top--;s.player.y=top+1;s.yaw=-2.35;s.pitch=-.08;}if(!lightView)respawn.textContent=s.surface?'Back to the wall':'Walk the hillside';play.textContent=s.surface?'Explore the hillside':required===8?'Play the world':'Play the cave';Core.depenetratePlayer(world,s.player);s.message='';s.messageUntil=0;s.particles=[];stopMining();invalidate();}
    function camera(){return {x:s.player.x,y:s.player.y+1.62+(s.active&&!reduced?Math.sin(s.player.walked*8)*.025:0),z:s.player.z,yaw:s.yaw,pitch:s.pitch,fov:78};}
    function say(text){s.message=text;s.messageUntil=performance.now()+3200;status.textContent=text;}
    function stopMining(){s.holding=false;s.mining=0;s.elapsed=0;s.mineKey='';}
    function render(now){
      var cam=camera();s.hit=Core.raycast(world,[cam.x,cam.y,cam.z],direction(cam),4.5);
      if(s.visible||s.active){
        if(s.cutaway||s.locked){
          var rect=frame.getBoundingClientRect();
          if(rect.width&&rect.height){
            if(!ctx)ctx=overview.getContext('2d');
            ctx.setTransform(overview.width/rect.width,0,0,overview.height/rect.height,0,0);
            ctx.clearRect(0,0,rect.width,rect.height);
            ctx.font='12px '+getComputedStyle(document.body).fontFamily;
            Story.live.overview(ctx,rect.width,rect.height,{angle:s.angle,lit:features.light&&!s.locked,target:!staged||root.MinecraftBuild&&root.MinecraftBuild.stage>=1,guideHeight:s.locked&&root.MinecraftBuild&&root.MinecraftBuild.stage<2?16:0,monochrome:s.locked});
          }
        }
        else if(ensureRenderer())renderer.draw(world,cam,{hit:features.edit?s.hit:null,tools:features.edit,reticle:features.edit,mining:s.mining,swing:(s.holding||s.keys.KeyF)?Math.sin(now*.022)*.5+.5:0,tool:s.tool,time:now/1000,particles:s.particles,walking:s.active?s.player.walked:0},features.light?lighting:flatLighting);
        fig.dataset.paintedVersion=world.version;
      }
      var h=s.hit;targetLabel.textContent=lightView?'Block light '+lighting.sample(Math.floor(cam.x),Math.floor(cam.y),Math.floor(cam.z))[0]+' / 15':h?names[h.type]:'';
      Object.keys(slots).forEach(function(k){slots[k].setAttribute('aria-pressed',String(s.tool===k));slots[k].querySelector('.mp-count').textContent=inventory[k]==null?'':inventory[k];});
      if(now>s.messageUntil)status.textContent=s.locked?'Add this layer to continue building the same world.':!features.edit?'Walking, jumping and collision are ready. Mining comes next.':s.cutaway?'The same blocks, seen from outside.':s.active?(h?(s.mining>0?'Mining '+names[h.type].toLowerCase()+' · '+Math.round(s.mining*100)+'%':names[h.type]+' · '+h.distance.toFixed(1)+' blocks away'):'Look around; blocks within reach can be mined.'):lightView?'A torch has to light a path through air.':s.surface?'The same hillside, above the cave. Explore, build, or return to the wall.':'Aim at the amber outline. Hold to mine; remove the block below it to walk through.';
      fig.dataset.buildReady=String(!s.locked);fig.dataset.featureEditing=String(features.edit);fig.dataset.featureLighting=String(features.light);
      fig.dataset.target=h?[h.x,h.y,h.z].join(','):'';fig.dataset.mining=s.mining.toFixed(2);fig.dataset.active=String(s.active);fig.dataset.removed=String(Story.live.isRemoved());fig.dataset.light=lighting.sample(10,7,7)[0];fig.dataset.worldVersion=world.version;
    }
    function particles(hit){if(reduced)return;for(var i=0;i<16;i++)s.particles.push({x:hit.x+.5,y:hit.y+.5,z:hit.z+.5,age:0,vx:(Math.random()-.5)*2,vy:Math.random()*2,vz:(Math.random()-.5)*2,type:hit.type});}
    function breakBlock(dt){
      var hit=s.hit;if(!hit||hit.y===0||s.cooldown>0){s.elapsed=0;s.mining=0;return;}
      var key=[hit.x,hit.y,hit.z,hit.type,s.tool].join(',');if(key!==s.mineKey){s.elapsed=0;s.mining=0;s.mineKey=key;}
      s.elapsed+=dt*(s.player.onGround?1:.2);s.mining=Core.miningProgress(s.elapsed,hit.type,s.tool);
      if(s.mining>=1){if(!validate({kind:'break',position:[hit.x,hit.y,hit.z],seconds:s.elapsed,tool:s.tool,camera:camera()})){stopMining();return;}world.set(hit.x,hit.y,hit.z,0);particles(hit);if((hit.type===1||hit.type===7||hit.type===9)&&s.tool==='pickaxe')inventory.cobblestone++;if(hit.type===8)inventory.torch++;s.elapsed=0;s.mining=0;s.mineKey='';s.cooldown=.25;changed();say(hit.type===7?'The wall is open. Mine the block below to make room to walk.':hit.type===8?'Torch removed. Its light disappears too.':'Block removed.');}
    }
    function placeBlock(){
      if(!s.active||s.cutaway||!features.edit)return;var hit=s.hit,type=s.tool==='torch'?8:s.tool==='cobblestone'?9:0;
      if(!type){say('Choose cobblestone (2) or a torch (3) to place.');return;}
      if(!hit){say('Aim at a surface within reach.');return;}
      var p=hit.previous;
      if(features.authority&&!validate({kind:'place',position:p,type:type,camera:camera(),tool:s.tool}))return;
      if(!canPlace(world,s.player,p,type)){say(type===8?'Place a torch on an empty space above a solid floor.':'Leave enough room for yourself.');return;}
      if(inventory[s.tool]<=0){say('No '+s.tool+' left. Mine some to recover it.');return;}
      world.set(p[0],p[1],p[2],type);inventory[s.tool]--;changed();say(type===8?'Torch placed. Watch the warm light reach the walls.':'Cobblestone placed. The faces and light change together.');
    }
    function tick(now){s.raf=0;var dt=Math.min(.05,Math.max(0,(now-(s.last||now))/1000));s.last=now;
      if(s.active&&!s.cutaway){var forward=(s.keys.KeyW?1:0)-(s.keys.KeyS?1:0)-s.touchZ,side=(s.keys.KeyD?1:0)-(s.keys.KeyA?1:0)+s.touchX;
        var turn=(s.keys.ArrowRight?1:0)-(s.keys.ArrowLeft?1:0),tilt=(s.keys.ArrowUp?1:0)-(s.keys.ArrowDown?1:0);s.yaw+=turn*dt*1.7;s.pitch=Math.max(-1.45,Math.min(1.45,s.pitch+tilt*dt*1.4));
        Core.movePlayer(world,s.player,{dx:Math.sin(s.yaw)*forward+Math.cos(s.yaw)*side,dz:Math.cos(s.yaw)*forward-Math.sin(s.yaw)*side,jump:s.keys.Space||s.touchJump,sprint:s.keys.ShiftLeft||s.keys.ShiftRight},dt);
        var cam=camera();s.hit=Core.raycast(world,[cam.x,cam.y,cam.z],direction(cam),4.5);
        s.accumulator+=dt;
        while(s.accumulator>=.05){s.accumulator-=.05;tickCount++;s.cooldown=Math.max(0,s.cooldown-.05);if(features.edit&&(s.holding||s.keys.KeyF))breakBlock(.05);else {s.elapsed=0;s.mining=0;s.mineKey='';}document.dispatchEvent(new Event('minecraft:tick'));}
      }
      s.particles=s.particles.filter(function(p){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=6*dt;return p.age<.65;});
      render(now);if(s.visible&&!document.hidden&&(s.active||s.particles.length))s.raf=requestAnimationFrame(tick);
    }
    function invalidate(){if(!s.raf){s.last=0;s.raf=requestAnimationFrame(tick);}}
    function resize(){if(!s.visible&&!s.active)return;var rect=frame.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);[canvas,overview].forEach(function(c){var w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;});invalidate();}
    function ensureRenderer(){
      if(!renderer){
        renderer=Render.create(canvas,{lighting:features.light});
        fig.dataset.rendererReady=String(renderer.available);
        if(!renderer.available){s.cutaway=true;syncStage();}
      }
      return renderer.available;
    }
    function activate(lock,touchMode){if(s.locked&&root.MinecraftBuild)root.MinecraftBuild.advance(required);if(s.cutaway||!ensureRenderer())return;if(active&&active!==s)active.deactivate();active=s;s.active=true;s.touchMode=!!touchMode;play.hidden=true;exit.hidden=false;touch.hidden=!s.touchMode;frame.classList.add('mp-playing');resize();hint.textContent=s.touchMode?'Drag to look · use the stick to walk'+(features.edit?' · Mine / Place / Jump':' · Jump to climb'):'WASD walk · Space jump'+(features.edit?' · hold click/F mine · right-click/E place':'')+' · Esc release';canvas.focus({preventScroll:true});if(lock&&canvas.requestPointerLock){try{var request=canvas.requestPointerLock();if(request&&request.catch)request.catch(function(){});}catch(ignore){}}invalidate();}
    function updateHelp(){
      if(renderer&&!renderer.available)hint.textContent='Interactive cutaway · drag or use ← / → to rotate. First-person play needs WebGL.';
      else if(s.locked)hint.textContent='Build this layer, then step into the same world.';
      else if(s.cutaway)hint.textContent=matchMedia('(pointer: coarse)').matches?'Drag to rotate':'Drag to rotate · ← / → turn';
      else hint.innerHTML=idleHelpHTML;
    }
    function deactivate(){s.active=false;s.keys={};stopMining();s.touchX=s.touchZ=0;s.touchJump=false;knob.style.transform='';play.hidden=s.cutaway||!!renderer&&!renderer.available;exit.hidden=true;touch.hidden=true;frame.classList.remove('mp-playing');if(active===s)active=null;if(document.pointerLockElement===canvas)document.exitPointerLock();updateHelp();invalidate();}
    s.deactivate=deactivate;
    play.addEventListener('click',function(e){activate(e.isTrusted&&!matchMedia('(pointer:coarse)').matches,matchMedia('(pointer:coarse)').matches);e.stopPropagation();});
    exit.addEventListener('click',deactivate);respawn.addEventListener('click',function(){if(s.cutaway)toggle.click();spawn(!lightView&&!s.surface);say(s.surface?'The same hillside, above the cave.':'Back at the '+(lightView?'second chamber.':'wall.'));});
    toggle.addEventListener('click',function(){deactivate();s.cutaway=!s.cutaway;canvas.hidden=s.cutaway;overview.hidden=!s.cutaway;hotbar.hidden=s.cutaway||!features.edit;targetLabel.hidden=s.cutaway||!features.edit;play.hidden=s.cutaway;toggle.textContent=s.cutaway?'First-person view':'Cutaway view';toggle.setAttribute('aria-pressed',String(s.cutaway));updateHelp();resize();});
    var pointer=null;
    canvas.addEventListener('pointerdown',function(e){if(e.button===2){e.preventDefault();if(!s.active)activate(false,e.pointerType==='touch');placeBlock();invalidate();return;}if(e.button!==0)return;e.preventDefault();var wasActive=s.active;activate(false,e.pointerType==='touch');if(document.pointerLockElement===canvas){s.holding=true;return;}pointer={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);if(wasActive&&e.pointerType!=='touch')s.holding=true;});
    canvas.addEventListener('pointermove',function(e){if(!s.active)return;if(document.pointerLockElement===canvas){s.yaw+=e.movementX*.0027;s.pitch=Math.max(-1.45,Math.min(1.45,s.pitch-e.movementY*.0027));return;}if(pointer&&pointer.id===e.pointerId){var dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.abs(dx)+Math.abs(dy)>2)pointer.moved=true;s.yaw+=dx*.004;s.pitch=Math.max(-1.45,Math.min(1.45,s.pitch-dy*.004));pointer.x=e.clientX;pointer.y=e.clientY;if(pointer.moved)stopMining();}});
    function pointerEnd(){pointer=null;stopMining();invalidate();}
    canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);canvas.addEventListener('contextmenu',function(e){e.preventDefault();});
    canvas.addEventListener('keydown',function(e){if(e.code==='Enter'&&!s.active){e.preventDefault();activate(false,false);return;}if(e.code==='Escape'){deactivate();return;}if(!s.active)return;
      if(['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyF','KeyE','Digit1','Digit2','Digit3'].includes(e.code)){e.preventDefault();s.keys[e.code]=true;if(e.code==='KeyE'&&!e.repeat)placeBlock();if(/^Digit[123]$/.test(e.code)){var nextTool=['pickaxe','cobblestone','torch'][Number(e.code.slice(-1))-1];if(slots[nextTool])s.tool=nextTool;stopMining();}invalidate();}
    });
    canvas.addEventListener('keyup',function(e){delete s.keys[e.code];if(e.code==='KeyF'){stopMining();invalidate();}});
    canvas.addEventListener('blur',function(){if(document.pointerLockElement!==canvas&&s.active)deactivate();});
    document.addEventListener('pointerlockchange',function(){if(document.pointerLockElement===canvas&&!s.active){document.exitPointerLock();return;}if(document.pointerLockElement!==canvas&&s.active&&!pointer&&!s.touchMode)deactivate();});
    function heldButton(button,start,end){button.addEventListener('pointerdown',function(e){e.preventDefault();button.setPointerCapture(e.pointerId);start();invalidate();});['pointerup','pointercancel','lostpointercapture'].forEach(function(name){button.addEventListener(name,function(){end();invalidate();});});}
    heldButton(mine,function(){s.holding=true;},stopMining);heldButton(jump,function(){s.touchJump=true;},function(){s.touchJump=false;});place.addEventListener('pointerdown',function(e){e.preventDefault();placeBlock();invalidate();});
    function moveStick(e){var r=stick.getBoundingClientRect(),dx=(e.clientX-r.left-r.width/2)/(r.width*.32),dy=(e.clientY-r.top-r.height/2)/(r.height*.32),len=Math.max(1,Math.hypot(dx,dy));s.touchX=dx/len;s.touchZ=dy/len;knob.style.transform='translate('+s.touchX*23+'px,'+s.touchZ*23+'px)';}
    stick.addEventListener('pointerdown',function(e){e.preventDefault();stick.setPointerCapture(e.pointerId);s.stick=e.pointerId;moveStick(e);});stick.addEventListener('pointermove',function(e){if(s.stick===e.pointerId)moveStick(e);});['pointerup','pointercancel','lostpointercapture'].forEach(function(name){stick.addEventListener(name,function(){s.stick=null;s.touchX=s.touchZ=0;knob.style.transform='';});});
    var turnStart=null;overview.addEventListener('pointerdown',function(e){turnStart={x:e.clientX,a:s.angle};overview.setPointerCapture(e.pointerId);});overview.addEventListener('pointermove',function(e){if(turnStart){s.angle=Math.max(18,Math.min(75,turnStart.a+(e.clientX-turnStart.x)*.22));invalidate();}});overview.addEventListener('pointerup',function(){turnStart=null;});overview.addEventListener('pointercancel',function(){turnStart=null;});
    overview.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();s.angle=Math.max(18,Math.min(75,s.angle+(e.key==='ArrowRight'?5:-5)));invalidate();}});
    fig.storyAction=function(){if(lightView){world.set(8,7,7,0);world.set(8,6,7,0);changed();say('A two-block passage now connects the chambers.');}};
    new ResizeObserver(resize).observe(frame);
    new IntersectionObserver(function(entries){s.visible=entries[0].isIntersecting;if(!s.visible&&s.active)deactivate();if(s.visible)resize();},{threshold:.08}).observe(frame);
    function validate(action){
      if(!features.authority||!BuildCore)return true;
      var result=BuildCore.authorize(world,s.player,action,inventory,Core);
      authority[result.ok?'accepted':'rejected']++;
      authority.last=result.ok?'Accepted '+action.kind+' at '+action.position.join(', '):result.reason;
      document.dispatchEvent(new Event('minecraft:authority'));
      if(!result.ok)say(result.reason);
      return result.ok;
    }
    function syncStage(){
      var was=s.locked;s.locked=!!required&&(!root.MinecraftBuild||root.MinecraftBuild.stage<required);
      if(was&&!s.locked){spawn();s.cutaway=false;}
      var unavailable=!!renderer&&!renderer.available;
      if(unavailable)s.cutaway=true;
      canvas.hidden=s.locked||s.cutaway;overview.hidden=!canvas.hidden;
      hotbar.hidden=s.locked||s.cutaway||!features.edit;
      targetLabel.hidden=s.locked||s.cutaway||!features.edit;
      toggle.hidden=s.locked||unavailable;respawn.hidden=s.locked||unavailable;
      play.hidden=s.active||(unavailable&&!s.locked)||(!s.locked&&s.cutaway);
      var resetButton=body.querySelector('.mp-reset');if(resetButton)resetButton.hidden=s.locked;
      mine.hidden=!features.edit;place.hidden=!features.edit;
      play.textContent=s.locked?({4:'Add a player',5:'Add mining & building',6:'Add lighting',8:'Finish & play'})[required]||'Build this layer':s.surface?'Explore the hillside':required===8?'Play the world':'Play the cave';
      updateHelp();invalidate();
    }
    document.addEventListener('minecraft:build-stage',syncStage);
    spawn();if(staged)syncStage();
    s.restorePose=function(p){if(!p.player||!['x','y','z'].every(function(k){return Number.isFinite(p.player[k]);}))return;var next=Object.assign({},s.player,p.player);if(next.x<.3||next.x>world.w-.3||next.z<.3||next.z>world.d-.3||next.y<0||next.y>world.h-1.8||Core.collides(world,next))return;s.player=next;if(Number.isFinite(p.yaw))s.yaw=p.yaw;if(Number.isFinite(p.pitch))s.pitch=Math.max(-1.45,Math.min(1.45,p.pitch));if(slots[p.tool])s.tool=p.tool;s.surface=!!p.surface;if(!lightView)respawn.textContent=s.surface?'Back to the wall':'Walk the hillside';if(!s.locked)play.textContent=s.surface?'Explore the hillside':required===8?'Play the world':'Play the cave';s.message='';s.messageUntil=0;};
    s.snapshot=function(){return {id:s.id,locked:s.locked,features:features,player:Object.assign({},s.player),yaw:s.yaw,pitch:s.pitch,tool:s.tool,active:s.active,hit:s.hit,mining:s.mining,cutaway:s.cutaway,surface:s.surface};};
  }
  function init(){document.querySelectorAll('figure[data-gameplay]').forEach(mount);}
  api.snapshot=function(){return {version:world.version,removed:Story.live.isRemoved(),light:lighting.sample(10,7,7)[0],inventory:Object.assign({},inventory),ticks:tickCount,authority:Object.assign({},authority),sessions:sessions.map(function(s){return s.snapshot();})};};
  document.addEventListener('visibilitychange',function(){if(document.hidden&&active)active.deactivate();});
  window.addEventListener('blur',function(){if(active)active.deactivate();});
  new MutationObserver(function(){sessions.forEach(function(s){s.invalidate();});}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
