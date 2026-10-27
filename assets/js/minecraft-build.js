/* One world, progressively exposed by the article's eight build steps. */
(function(root){
  'use strict';
  if(typeof document==='undefined')return;
  var Core=root.MinecraftBuildCore,Story=root.MinecraftStory,Game=root.MinecraftGameplay;
  if(!Core||!Story||!Game||!Game.world)return;
  var world=Game.world,stage=0,views=[],pending=false,cache={},cacheVersion=-1,lastSaved='',dirty=false;
  var api=root.MinecraftBuild={stage:0,advance:advance,save:save,load:load,replay:replay,snapshot:snapshot};
  function el(tag,attrs,parent){var n=document.createElement(tag);Object.keys(attrs||{}).forEach(function(k){if(k==='text')n.textContent=attrs[k];else n.setAttribute(k,attrs[k]);});if(parent)parent.appendChild(n);return n;}
  function button(parent,text,fn,primary){var b=el('button',{type:'button',class:'mb-action'+(primary?' mb-primary':''),text:text},parent);b.addEventListener('click',fn);return b;}
  function emit(){document.dispatchEvent(new Event('minecraft:build-stage'));schedule();}
  function advance(next){
    next=Math.max(0,Math.min(8,Math.floor(next)));
    if(next<=stage)return;
    var previous=stage;stage=next;api.stage=stage;
    if(previous<2&&stage>=2)Game.generate();
    else if(previous<1&&stage>=1)Game.writeCell(Core.target,7);
    if(previous<6&&stage>=6)Game.writeCell([5,7,7],8);
    emit();
  }
  function replay(){stage=0;api.stage=0;Game.clear();dirty=false;emit();}
  function setSaveMessage(message){document.querySelectorAll('.mb-save-message').forEach(function(n){n.textContent=message;});}
  function save(){
    advance(7);
    try{
      var snapshot=Game.snapshot();
      var poses=snapshot.sessions.map(function(s){return {id:s.id,player:s.player,yaw:s.yaw,pitch:s.pitch,tool:s.tool,surface:s.surface};});
      var text=Core.encode(world,Game.inventory,stage,poses);
      localStorage.setItem(Core.saveKey,text);lastSaved=text;dirty=false;
      setSaveMessage('Saved in this browser · '+(new Blob([text]).size/1024).toFixed(1)+' KiB');schedule();return true;
    }catch(error){setSaveMessage('Could not save: browser storage is unavailable.');return false;}
  }
  function load(){
    try{
      var text=localStorage.getItem(Core.saveKey);
      if(!text){setSaveMessage('There is no saved world yet.');return false;}
      var saved=Core.decode(text,world);
      stage=saved.stage;api.stage=stage;emit();
      Game.replace(saved.cells,saved.inventory,saved.poses);lastSaved=text;dirty=false;
      setSaveMessage('Restored blocks, inventory, and viewpoints.');schedule();return true;
    }catch(error){setSaveMessage('That saved world could not be loaded. Your current world is unchanged.');return false;}
  }
  function snapshot(){return {stage:stage,version:world.version,blocks:worldCounts().blocks,dirty:dirty,savedBytes:lastSaved?new Blob([lastSaved]).size:0};}
  function refreshCache(){if(cacheVersion!==world.version){cacheVersion=world.version;cache={};}}
  function currentView(mode){refreshCache();if(!cache[mode])cache[mode]=Core.view(world,mode);return cache[mode];}
  function worldCounts(){refreshCache();return cache.counts||(cache.counts=Core.counts(world));}
  function cutawayMesh(){refreshCache();return cache.mesh||(cache.mesh=Story.faces(currentView('terrain'),false));}
  function metrics(parent){return el('div',{class:'mb-metrics'},parent);}
  function setMetrics(node,items){
    var key=JSON.stringify(items);if(node.dataset.values===key)return;node.dataset.values=key;node.replaceChildren();
    items.forEach(function(item){var cell=el('div',{},node);el('strong',{text:item[0]},cell);el('span',{text:item[1]},cell);});
  }
  function schedule(view){
    if(view&&view.draw)view.dirty=true;else views.forEach(function(v){v.dirty=true;});
    if(pending)return;pending=true;
    requestAnimationFrame(function(){pending=false;views.forEach(function(v){v.update();if(v.visible&&v.dirty)v.draw();});updateGameplayReadouts();});
  }
  function paintView(fig){
    var number=+fig.dataset.buildStage,mode=number===0?'empty':number===1?'cell':'terrain';
    var body=el('div',{class:'mb'},null);fig.insertBefore(body,fig.querySelector('figcaption'));
    var host=el('div',{class:'mb-canvas-wrap'},body),canvas=el('canvas',{tabindex:'0',role:'img','aria-label':fig.dataset.sceneLabel||'The same voxel world at this build stage. Drag or use arrow keys to rotate.'},host);
    var controls=el('div',{class:'mb-controls'},body),action,status=el('span',{class:'mb-status'},controls),readout=metrics(body),angle=42;
    if(number===0){action=button(controls,'Replay from an empty grid',replay);}
    if(number===1){action=button(controls,'Write the first block',function(){if(stage<1)advance(1);else Game.writeCell(Core.target,world.get.apply(world,Core.target)?0:7);},true);}
    if(number===2){action=button(controls,'Generate the terrain',function(){advance(2);},true);}
    if(number===3){action=button(controls,'Build the mesh',function(){advance(3);},true);}
    if(number===7){
      action=button(controls,'Save world',save,true);button(controls,'Restore saved world',load);
      status.classList.add('mb-save-message');status.setAttribute('role','status');
      try{status.textContent=localStorage.getItem(Core.saveKey)?'A saved world is available.':'No saved world yet.';}catch(ignore){status.textContent='Save and restore this world in your browser.';}
    }
    var view={visible:false,dirty:true,update:function(){
      var ready=stage>=number,c=worldCounts(),sample=world.get.apply(world,Core.target),mesh=number===3?cutawayMesh():null;
      fig.dataset.ready=String(ready);fig.dataset.worldVersion=world.version;fig.dataset.blocks=number===0?'0':String(c.blocks);
      if(number===0){action.hidden=stage===0;status.textContent='The starting point: coordinates, air, and no blocks.';setMetrics(readout,[['0','blocks'],['16 × 16','ground grid'],['Air','every cell']]);}
      if(number===1){action.textContent=stage<1?'Write the first block':sample?'Clear this cell':'Write stone here';status.textContent='One address in the shared world array.';setMetrics(readout,[[sample?'Stone':'Air','cell (8, 7, 7)'],['1,912','array index'],['4,096','cells per section']]);}
      if(number===2){action.disabled=ready;action.textContent=ready?'Terrain added':'Generate the terrain';status.textContent=ready?'These are the blocks every later chapter uses.':'Fill the empty world with the same hillside and cave.';setMetrics(readout,[[c.blocks.toLocaleString(),'stored blocks'],[c.states,'block states'],['16 × 32 × 16','world dimensions']]);}
      if(number===3){action.disabled=ready;action.textContent=ready?'Mesh added':'Build the mesh';status.textContent=ready?'Only the exposed faces become geometry.':'Read the generated blocks and keep their visible surfaces.';setMetrics(readout,[[mesh.blocks.toLocaleString(),'blocks in cutaway'],[mesh.count.toLocaleString(),'visible faces'],[(mesh.count*2).toLocaleString(),'triangles']]);}
      if(number===7)setMetrics(readout,[[stage>=2?c.changes.toLocaleString():'0','edits since terrain'],[lastSaved?(new Blob([lastSaved]).size/1024).toFixed(1)+' KiB':'—','saved world'],[stage<7?'Pending':dirty?'Unsaved':lastSaved?'Saved':'Ready','current changes']]);
    },draw:function(){
      if(!view.visible)return;
      var w=host.clientWidth;if(!w)return;
      var h=w<600?330:420,dpr=Math.min(devicePixelRatio||1,2),pixelW=Math.round(w*dpr),pixelH=Math.round(h*dpr);
      if(canvas.width!==pixelW)canvas.width=pixelW;if(canvas.height!==pixelH)canvas.height=pixelH;
      canvas.style.height=h+'px';
      var ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.font='12px '+getComputedStyle(document.body).fontFamily;
      Story.drawWorld(ctx,w,h,currentView(mode),{angle:angle,guideHeight:number<=1||stage<2?16:0,target:number>0&&stage>=1,label:number===1?'(8, 7, 7)':stage>=2?'same cell':null,monochrome:number===2||stage<3,wire:number===3&&stage>=3});
      view.dirty=false;fig.dataset.paintedVersion=world.version;
    }};
    views.push(view);
    new ResizeObserver(function(){schedule(view);}).observe(host);
    new IntersectionObserver(function(entries){view.visible=entries[0].isIntersecting;if(view.visible)schedule(view);},{rootMargin:'200px'}).observe(host);
    var pointer=null;canvas.addEventListener('pointerdown',function(e){pointer={x:e.clientX,angle:angle};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',function(e){if(pointer){angle=Math.max(18,Math.min(75,pointer.angle+(e.clientX-pointer.x)*.22));schedule(view);}});
    ['pointerup','pointercancel','lostpointercapture'].forEach(function(name){canvas.addEventListener(name,function(){pointer=null;});});
    canvas.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();angle=Math.max(18,Math.min(75,angle+(e.key==='ArrowRight'?5:-5)));schedule(view);}});
  }
  function addGameplayReadouts(){
    document.querySelectorAll('figure[data-gameplay]').forEach(function(fig){
      var body=fig.querySelector('.mp');if(!body)return;
      var n=+fig.dataset.buildStage;
      if(n===8){
        var bar=el('div',{class:'mb-controls mb-final-save'},body);
        button(bar,'Save world',save);button(bar,'Restore saved world',load);
        el('span',{class:'mb-save-message mb-status',role:'status',text:'Your world can be saved in this browser.'},bar);
      }
      var readout=metrics(body);readout.dataset.gameStage=n;
    });
  }
  function updateGameplayReadouts(){
    var snapshot=Game.snapshot();
    document.querySelectorAll('.mb-metrics[data-game-stage]').forEach(function(node){
      var n=+node.dataset.gameStage,session=snapshot.sessions.find(function(s){return s.id===node.closest('figure').id;});
      if(n===4)setMetrics(node,[['0.6 × 1.8','player body'],['Gravity','and collision'],[session&&session.locked?'Pending':'Ready','movement']]);
      if(n===5)setMetrics(node,[[snapshot.ticks.toLocaleString(),'simulation ticks'],['20 Hz','game actions'],[snapshot.inventory.cobblestone,'cobblestone']]);
      if(n===6)setMetrics(node,[[stage>=6?'14':'—','torch emission'],[snapshot.light+' / 15','other chamber'],[snapshot.inventory.torch,'torches available']]);
      if(n===8)setMetrics(node,[[snapshot.authority.accepted,'accepted edits'],[snapshot.authority.rejected,'refused edits'],['Local','single-player authority']]);
    });
  }
  function init(){
    document.querySelectorAll('figure[data-build-stage]:not([data-gameplay])').forEach(paintView);
    addGameplayReadouts();
    document.addEventListener('minecraft:world-changed',function(){dirty=true;schedule();});
    document.addEventListener('minecraft:tick',updateGameplayReadouts);
    document.addEventListener('minecraft:authority',updateGameplayReadouts);
    new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
