/* Original visual models of inspected Java Edition systems. Source boundaries
 * are explicit: schematic ticket footprints, synthetic queues, 2D collisions,
 * and an unlocked straight redstone circuit; no game assets or code copied. */
(function (root) {
  'use strict';
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function shifted(box, x, y) { return { x1:box.x1+x, x2:box.x2+x, y1:box.y1+y, y2:box.y2+y }; }
  function clipAxis(box, amount, axis, obstacles) {
    var a=axis==='x'?'x':'y', other=a==='x'?'y':'x';
    obstacles.forEach(function(o){
      if(box[other+'2']<=o[other+'1'] || box[other+'1']>=o[other+'2'])return;
      if(amount>0 && box[a+'2']<=o[a+'1'])amount=Math.min(amount,o[a+'1']-box[a+'2']);
      if(amount<0 && box[a+'1']>=o[a+'2'])amount=Math.max(amount,o[a+'2']-box[a+'1']);
    });
    return amount;
  }
  function collisionModel(box, dx, dy, obstacles, maxStep) {
    var y=clipAxis(box,dy,'y',obstacles), x=clipAxis(shifted(box,0,y),dx,'x',obstacles);
    var result={x:x,y:y,step:0,path:[[0,0],[0,y],[x,y]]};
    if(maxStep>0 && Math.abs(x)<Math.abs(dx) && y<=0) {
      obstacles.map(function(o){return o.y2-box.y1;}).filter(function(h){return h>0 && h<=maxStep;}).sort(function(a,b){return a-b;}).forEach(function(h){
        var up=clipAxis(box,h,'y',obstacles);if(up<h)return;
        var sx=clipAxis(shifted(box,0,h),dx,'x',obstacles), down=clipAxis(shifted(box,sx,h),-h,'y',obstacles);
        if(Math.abs(sx)>Math.abs(result.x))result={x:sx,y:h+down,step:h,path:[[0,0],[0,h],[sx,h],[sx,h+down]]};
      });
    }
    return result;
  }
  function wireLevels(source, length, cut) {
    var out=[],power=source;
    for(var i=0;i<length;i++){if(i===cut)power=0;out.push(power);power=Math.max(0,power-1);}
    return out;
  }
  function redstoneModel(source, delay, tick, cut) {
    var left=wireLevels(tick>=0?source:0,4,cut),input=left[3]>0;
    var output=input&&tick>=delay*2?15:0;
    return {left:left,right:wireLevels(output,4,-1),input:input,output:output,due:delay*2};
  }
  function randomTrials(seed, ticks, trials, population) {
    var state=(seed||1)>>>0,points=[];
    for(var i=0;i<ticks*trials;i++){state^=state<<13;state^=state>>>17;state^=state<<5;points.push((state>>>0)%population);}
    return points;
  }
  function uniqueTicks(events) {
    var keys=new Set();return events.filter(function(e){var k=e.position+':'+e.type;if(keys.has(k))return false;keys.add(k);return true;});
  }
  function sortTicks(events) { return events.slice().sort(function(a,b){return a.trigger-b.trigger||a.priority-b.priority||a.order-b.order;}); }
  var api={clipAxis:clipAxis,collisionModel:collisionModel,wireLevels:wireLevels,redstoneModel:redstoneModel,randomTrials:randomTrials,uniqueTicks:uniqueTicks,sortTicks:sortTicks};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MinecraftEngine=api;if(typeof document==='undefined')return;
  var NS='http://www.w3.org/2000/svg';
  function el(tag,cls,text,parent){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;if(parent)parent.appendChild(n);return n;}
  function svg(tag,attrs,parent){var n=document.createElementNS(NS,tag);Object.keys(attrs||{}).forEach(function(k){n.setAttribute(k,attrs[k]);});if(parent)parent.appendChild(n);return n;}
  function text(p,x,y,v,cls,anchor){var n=svg('text',{x:x,y:y,'class':cls||'','text-anchor':anchor||'start'},p);n.textContent=v;return n;}
  function rect(p,x,y,w,h,cls,attrs){return svg('rect',Object.assign({x:x,y:y,width:w,height:h,'class':cls||''},attrs||{}),p);}
  function line(p,x1,y1,x2,y2,cls,attrs){return svg('line',Object.assign({x1:x1,y1:y1,x2:x2,y2:y2,'class':cls||''},attrs||{}),p);}
  function mount(id,title){var f=document.getElementById(id);if (!f || f.dataset.story === 'true' || f.dataset.figureMounted || f.closest('details:not([open])')) return null; f.dataset.figureMounted = 'true';f.classList.add('mc-engine','ready');var b=el('div','mce-body');f.insertBefore(b,f.querySelector('figcaption'));var h=el('div','mce-head',undefined,b);el('span','mce-kicker',title,h);var r=el('button','btn','Reset',h);r.type='button';return {body:b,reset:r};}
  function controls(p){return el('div','mce-controls',undefined,p);}
  function button(p,label,fn){var n=el('button','btn',label,p);n.type='button';n.addEventListener('click',fn);return n;}
  function range(p,label,min,max,step,value,fn,format){var l=el('label','mce-slider',undefined,p);el('span','',label,l);var o=el('output','',format?format(value):value,l),i=el('input','',undefined,l);Object.assign(i,{type:'range',min:min,max:max,step:step,value:value});i.setAttribute('aria-label',label);function set(v){i.value=v;o.value=format?format(v):v;}i.addEventListener('input',function(){set(+i.value);fn(+i.value);});return {input:i,set:set};}
  function tabs(p,label,items,value,fn){var w=el('div','tabs',undefined,p);w.setAttribute('role','group');w.setAttribute('aria-label',label);var bs=items.map(function(v){var b=el('button','',v[1],w);b.type='button';b.setAttribute('aria-pressed',String(v[0]===value));b.addEventListener('click',function(){set(v[0]);fn(v[0]);});return [v[0],b];});function set(v){bs.forEach(function(q){q[1].setAttribute('aria-pressed',String(q[0]===v));});}return {set:set};}
  function plot(p,label){return svg('svg',{'class':'mce-plot',role:'img','aria-label':label},p);}
  function note(p,v){return el('p','mce-note',v,p);}
  function facts(p,names){var d=el('dl','mce-facts',undefined,p);return names.map(function(v){var e=el('div','',undefined,d);el('dt','',v,e);return el('dd','',undefined,e);});}
  function watch(body,draw){new ResizeObserver(draw).observe(body);new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});draw();}

  function activityFigure(){
    var m=mount('mc-activity','Loaded, ticking, or asleep');if(!m)return;
    var view=6,simulation=3,player=0,tick=12,c=controls(m.body);
    var vr=range(c,'Loading radius',3,8,1,view,function(v){view=v;if(simulation>=view){simulation=view-1;sr.set(simulation);}draw();});
    var sr=range(c,'Simulation radius',1,5,1,simulation,function(v){simulation=v;if(view<=simulation){view=simulation+1;vr.set(view);}draw();});
    var pr=range(c,'Player chunk x',-3,3,1,player,function(v){player=v;draw();});
    var split=el('div','mce-split',undefined,m.body),g=plot(split,'Schematic chunk ticket footprint, distinguishing loaded, block-ticking, and entity-ticking chunks.'),side=el('div','mce-activity-key',undefined,split);
    [['loaded','Loaded only','Blocks are available; ordinary simulation can sleep.'],['block','Block-ticking band','Block and entity eligibility are separate queries.'],['entity','Entity-ticking core','Small moving markers advance with the tick cursor.']].forEach(function(v){var row=el('div','mce-legend-row',undefined,side);el('i','mce-'+v[0],undefined,row);var t=el('div','',undefined,row);el('strong','',v[1],t);el('span','',v[2],t);});
    var f=facts(side,['Loaded shown','Block eligible','Entity eligible']);
    var tr=range(m.body,'World tick',0,40,1,tick,function(v){tick=v;draw();});
    note(m.body,'A player-only schematic: real loading and simulation tickets have independent levels, extra ticket sources, and readiness dependencies.');
    function draw(){g.replaceChildren();g.setAttribute('viewBox','0 0 420 420');var counts=[0,0,0];for(var z=-9;z<=9;z++)for(var x=-9;x<=9;x++){var d=Math.max(Math.abs(x-player),Math.abs(z)),status=d<=simulation?'entity':d<=simulation+1?'block':d<=view?'loaded':'absent',xx=11+(x+9)*21,yy=10+(z+9)*21;rect(g,xx,yy,19,19,'mce-chunk mce-'+status,{rx:1});if(d<=view)counts[0]++;if(d<=simulation+1)counts[1]++;if(d<=simulation)counts[2]++;
      if((x*7+z*13+100)%11===0&&status!=='absent'){var move=status==='entity'?Math.sin(tick*.35+x)*4:0;svg('circle',{cx:xx+9+move,cy:yy+9,r:2.5,'class':'mce-entity-marker'+(status==='entity'?' moving':'')},g);}}
      var px=11+(player+9)*21+9,py=10+9*21+9;svg('circle',{cx:px,cy:py,r:6,'class':'mce-player'},g);line(g,px-3,py,px+3,py,'mce-player-cross');line(g,px,py-3,px,py+3,'mce-player-cross');text(g,210,418,'one square = one chunk · amber = player','mce-small','middle');counts.forEach(function(v,i){f[i].textContent=v;});}
    m.reset.addEventListener('click',function(){view=6;simulation=3;player=0;tick=12;vr.set(view);sr.set(simulation);pr.set(player);tr.set(tick);draw();});watch(m.body,draw);
  }

  function schedulerFigure(){
    var m=mount('mc-scheduler','Appointments and random trials');if(!m)return;
    var mode='scheduled',tick=3,seed=17,trials=3,duplicate=false,sectionEligible=true,c=controls(m.body);
    var tab=tabs(c,'Tick mechanism',[['scheduled','Scheduled work'],['random','Random trials']],'scheduled',function(v){mode=v;draw();});
    var tr=range(c,'Tick cursor',0,10,1,tick,function(v){tick=v;draw();});
    var rr=range(c,'Trials per tick',1,8,1,trials,function(v){trials=v;draw();});var sectionWrap=el('div','',undefined,c),sectionTabs=tabs(sectionWrap,'Section random-tick eligibility',[[true,'Eligible section'],[false,'Skip section']],true,function(v){sectionEligible=v;draw();});
    var split=el('div','mce-split',undefined,m.body),g=plot(split,'Synthetic section showing scheduled positions or random position trials.'),side=el('div','',undefined,split),queue=el('div','mce-queue',undefined,side),state=el('p','mce-statement','',side),row=controls(side);
    var duplicateButton=button(row,'Try duplicate',function(){var candidate=events.find(function(e){return e.trigger>tick;});if(candidate){events=uniqueTicks(events.concat([Object.assign({},candidate)]));duplicate='deduplicated';}else duplicate='none';draw();});var seedButton=button(row,'New trial seed',function(){seed++;draw();});var f=facts(m.body,['Work executed','Positions sampled','Next due tick']);
    var events=[{position:10,type:'fluid',trigger:1,priority:3,order:2},{position:21,type:'block',trigger:3,priority:1,order:4},{position:42,type:'block',trigger:3,priority:1,order:3},{position:53,type:'fluid',trigger:5,priority:3,order:5},{position:28,type:'block',trigger:7,priority:3,order:6}];
    var budget=el('div','mce-budgets',undefined,m.body);[['BLOCK QUEUE','65,536'],['FLUID QUEUE','65,536']].forEach(function(v){var d=el('div','',undefined,budget);el('span','',v[0],d);el('strong','',v[1]+' / tick cap',d);el('i','',undefined,d);});
    note(m.body,'Synthetic 64-position section model. Real random trials sample a 4,096-position section; scheduled and random work are separate mechanisms.');
    function draw(){sectionWrap.hidden=mode!=='random';rr.input.closest('label').hidden=mode!=='random';duplicateButton.hidden=mode!=='scheduled';seedButton.hidden=mode!=='random';g.replaceChildren();g.setAttribute('viewBox','0 0 400 400');queue.replaceChildren();var trialsList=sectionEligible?randomTrials(seed,tick,trials,64):[],hits=new Map();trialsList.forEach(function(p){hits.set(p,(hits.get(p)||0)+1);});var last=sectionEligible?randomTrials(seed,Math.max(0,tick-1),trials,64).length:0,latest=new Set(trialsList.slice(last)),eligible=function(i){return sectionEligible&&(i%5===0||i%7===0);};
      for(var y=0;y<8;y++)for(var x=0;x<8;x++){var i=y*8+x,ev=events.find(function(e){return e.position===i;}),done=mode==='scheduled'?ev&&ev.trigger<=tick:hits.has(i)&&eligible(i);rect(g,18+x*45,18+y*45,42,42,'mce-sample-cell'+(done?' done':'')+(mode==='random'&&!eligible(i)?' inert':''),{rx:2});if(mode==='random'&&latest.has(i))rect(g,20+x*45,20+y*45,38,38,'mce-trial-outline',{rx:1});if(mode==='scheduled'&&ev){svg('circle',{cx:39+x*45,cy:39+y*45,r:8,'class':done?'mce-due-dot':'mce-pending-dot'},g);text(g,39+x*45,43+y*45,ev.trigger,'mce-on-dot','middle');}else if(mode==='random'&&hits.has(i))text(g,39+x*45,43+y*45,hits.get(i),'mce-sample-number','middle');}
      text(g,200,395,mode==='scheduled'?'circle number = trigger tick':'blue outline = trials in this tick','mce-small','middle');
      if(mode==='scheduled'){var table=el('table','mce-table',undefined,queue),head=el('tr','',undefined,el('thead','',undefined,table));['Due','Priority','Order','State'].forEach(function(v){el('th','',v,head);});var tb=el('tbody','',undefined,table);sortTicks(events).forEach(function(e){var r=el('tr',e.trigger<=tick?'mce-executed':'',undefined,tb);[e.trigger,e.priority,e.order,e.trigger<=tick?'ran':'queued'].forEach(function(v){el('td','',v,r);});});state.textContent=duplicate==='none'?'No pending event remains to duplicate.':duplicate?'Duplicate pending position + type: no extra event.':'Due work carries trigger time, priority, and sub-tick order.';f[0].textContent=events.filter(function(e){return e.trigger<=tick;}).length;f[1].textContent='—';f[2].textContent=(events.find(function(e){return e.trigger>tick;})||{}).trigger||'none';}
      else{el('div','mce-random-key','Repeated hits are allowed.',queue);var counts=Array.from(hits.entries()).sort(function(a,b){return b[1]-a[1];}).slice(0,5);counts.forEach(function(v){var p=el('div','mce-hit-row',undefined,queue);el('span','', 'position '+v[0],p);var bar=el('i','',undefined,p);bar.style.width=Math.max(8,v[1]*25)+'px';el('b','',v[1]+'×',p);});state.textContent=sectionEligible?'Only selected tickable positions run callbacks; grey cells ignore trials.':'No randomly ticking contents: skip this section and its position trials.';f[0].textContent=trialsList.filter(eligible).length;f[1].textContent=trialsList.length;f[2].textContent='random';}}
    m.reset.addEventListener('click',function(){mode='scheduled';tick=3;seed=17;trials=3;duplicate=false;sectionEligible=true;sectionTabs.set(true);tab.set(mode);tr.set(tick);rr.set(trials);draw();});watch(m.body,draw);
  }

  function collisionFigure(){
    var m=mount('mc-collision','A box meets a shape');if(!m)return;
    var shape='slab',dx=2.4,dy=-.4,step=.6,phase=3,c=controls(m.body);
    var st=tabs(c,'Obstacle shape',[['cube','Cube'],['slab','Slab'],['stairs','Stairs']],shape,function(v){shape=v;draw();});
    var xr=range(c,'Attempted x motion',0,4,.1,dx,function(v){dx=v;draw();},function(v){return v.toFixed(1);}),yr=range(c,'Attempted y motion',-1,2,.1,dy,function(v){dy=v;draw();},function(v){return v.toFixed(1);});
    var steps=tabs(c,'Step allowance',[[0,'No step'],[.6,'0.6 step'],[1.2,'1.2 step']],step,function(v){step=v;draw();});
    var g=plot(m.body,'Side-view AABB collision, showing attempted and resolved motion against a cube, slab, or stairs.');g.classList.add('mce-collision-plot');
    var pr=range(m.body,'Resolve the motion',0,3,1,phase,function(v){phase=v;draw();},function(v){return ['start','vertical','horizontal','final'][v];}),f=facts(m.body,['Requested movement','Resolved movement','Step candidate']);
    note(m.body,'A 2D AABB subset: clip Y before X. The game resolves a third axis and searches additional step candidates and shapes.');
    function obstacles(){var o=[{x1:-1,x2:9,y1:-1,y2:0}];if(shape==='cube')o.push({x1:3,x2:4,y1:0,y2:1});if(shape==='slab')o.push({x1:3,x2:4,y1:0,y2:.5});if(shape==='stairs')o.push({x1:3,x2:4,y1:0,y2:.5},{x1:4,x2:5,y1:0,y2:1});return o;}
    function draw(){g.replaceChildren();var compact=m.body.clientWidth<500,W=compact?420:720,scale=(W-50)/8,ox=25,box={x1:1,x2:1.6,y1:0,y2:1.8},obs=obstacles(),r=collisionModel(box,dx,dy,obs,step);
      // Fit both the requested ghost and every resolved step. The axis labels
      // and explanation occupy separate gutters below the complete motion.
      var topY=Math.max(2.4,box.y2+Math.max(0,dy),box.y2+r.step)+.35,bottomY=Math.min(-.25,dy)-.15,ground=40+topY*scale,plotBottom=40+(topY-bottomY)*scale,H=Math.ceil(plotBottom+58),sx=function(x){return ox+x*scale;},sy=function(y){return ground-y*scale;};g.setAttribute('viewBox','0 0 '+W+' '+H);for(var i=0;i<=8;i++){line(g,sx(i),40,sx(i),plotBottom,'mce-grid');text(g,sx(i),plotBottom+20,i,'mce-small','middle');}for(var j=Math.ceil(bottomY);j<=Math.floor(topY);j++)line(g,ox,sy(j),W-25,sy(j),'mce-grid');
      obs.forEach(function(o){var left=Math.max(0,o.x1),right=Math.min(8,o.x2),height=o.y2===0?.18:o.y2-o.y1;rect(g,sx(left),sy(o.y2),(right-left)*scale,height*scale,'mce-obstacle');});
      function drawBox(x,y,cls){rect(g,sx(box.x1+x),sy(box.y2+y),(box.x2-box.x1)*scale,(box.y2-box.y1)*scale,cls,{rx:2});}
      drawBox(0,0,'mce-start-box');drawBox(dx,dy,'mce-intended-box');line(g,sx(1.3),sy(.9),sx(1.3+dx),sy(.9+dy),'mce-intended-path');
      var path=r.path,idx=Math.min(phase,path.length-1);for(var k=1;k<=idx;k++)line(g,sx(1.3+path[k-1][0]),sy(.9+path[k-1][1]),sx(1.3+path[k][0]),sy(.9+path[k][1]),'mce-resolved-path');var position=phase===3?[r.x,r.y]:path[idx];drawBox(position[0],position[1],'mce-resolved-box');
      text(g,25,20,'Y → X'+(r.step?' → settle':''),'mce-small');text(g,W-25,20,'dashed = requested','mce-small','end');text(g,W-25,plotBottom+44,phase===3?(r.step?'Step candidate travels farther.':'Shapes clip the attempted motion.'):'Resolve one axis at a time.','mce-small','end');f[0].textContent=dx.toFixed(1)+', '+dy.toFixed(1);f[1].textContent=r.x.toFixed(1)+', '+r.y.toFixed(1);f[2].textContent=r.step?r.step.toFixed(1):'none';}
    m.reset.addEventListener('click',function(){shape='slab';dx=2.4;dy=-.4;step=.6;phase=3;st.set(shape);xr.set(dx);yr.set(dy);steps.set(step);pr.set(phase);draw();});watch(m.body,draw);
  }

  function redstoneFigure(){
    var m=mount('mc-redstone','Neighbor updates are not a clock');if(!m)return;
    var strength=15,delay=2,tick=2,cut=-1,c=controls(m.body);
    var sr=range(c,'Source power',0,15,1,strength,function(v){strength=v;draw();}),dr=range(c,'Repeater setting',1,4,1,delay,function(v){delay=v;draw();},function(v){return v+' × 2 game ticks';});
    var bt=tabs(c,'Wire connection',[[-1,'Connected'],[2,'Cut wire']],cut,function(v){cut=v;draw();});
    var g=plot(m.body,'A simple redstone wire line reaches equilibrium within the current update, while a repeater waits for a scheduled tick.');
    var tr=range(m.body,'Game tick',-1,10,1,tick,function(v){tick=v;draw();}),f=facts(m.body,['Repeater input','Scheduled activation','Output power']);
    note(m.body,'Straight-wire, sustained-input model. Wire levels are equilibrium values within an update; the unlocked repeater delay is setting × 2 game ticks.');
    function draw(){g.replaceChildren();var compact=m.body.clientWidth<500,W=compact?420:720,H=compact?280:300,cell=(W-40)/11,x0=20,y=75,model=redstoneModel(strength,delay,tick,cut);g.setAttribute('viewBox','0 0 '+W+' '+H);
      function wire(x,level,broke){var cx=x0+x*cell+cell/2;line(g,cx-cell/2,y,cx+cell/2,y,'mce-wire'+(level?' powered':''),{opacity:level?.3+level/22:1});if(broke){rect(g,cx-5,y-6,10,12,'mce-cut-gap');line(g,cx-5,y-5,cx+5,y+5,'mce-cut-mark');}else{svg('circle',{cx:cx,cy:y,r:compact?4:6,'class':'mce-dust'+(level?' powered':'')},g);}text(g,cx,y+27,level,'mce-power-number','middle');}
      rect(g,x0,y-16,cell,32,'mce-source'+(tick>=0&&strength?' powered':''),{rx:3});text(g,x0+cell/2,y+4,tick>=0?strength:0,'mce-source-label','middle');for(var i=0;i<4;i++)wire(i+1,model.left[i],cut===i);
      var rx=x0+5*cell;rect(g,rx+1,y-17,cell-2,34,'mce-repeater',{rx:2});svg('path',{d:'M'+(rx+cell*.28)+','+(y-9)+' L'+(rx+cell*.28)+','+(y+9)+' L'+(rx+cell*.74)+','+y+' Z','class':'mce-repeater-arrow'+(model.output?' powered':'')},g);text(g,rx+cell/2,y+27,'R','mce-power-number','middle');
      for(var j=0;j<4;j++)wire(j+6,model.right[j],false);var lx=x0+10*cell;rect(g,lx+3,y-14,cell-6,28,'mce-lamp'+(model.right[3]?' powered':''),{rx:2});
      text(g,x0,y-38,'source','mce-small');text(g,rx+cell/2,y-38,'repeater','mce-small','middle');text(g,lx+cell/2,y-38,'lamp','mce-small','middle');
      text(g,20,147,'INPUT','mce-kicker-svg');text(g,20,194,'OUTPUT','mce-kicker-svg');var tx=compact?72:100,span=W-tx-20,ts=span/11,willPower=wireLevels(strength,4,cut)[3]>0;for(var n=0;n<=10;n++){rect(g,tx+n*ts,132,ts-3,18,'mce-tick-cell'+(willPower?' high':''),{rx:1});rect(g,tx+n*ts,179,ts-3,18,'mce-tick-cell'+(willPower&&n>=model.due?' high':''),{rx:1});text(g,tx+n*ts+(ts-3)/2,221,n,'mce-small','middle');}var cursor=tx+Math.max(0,tick)*ts;line(g,cursor,122,cursor,229,'mce-cursor');line(g,tx+model.due*ts,169,tx+model.due*ts,199,'mce-due-line');text(g,W-20,H-15,'game ticks →','mce-small','end');f[0].textContent=model.input?'powered':'off';f[1].textContent=model.input?'tick '+model.due:'none';f[2].textContent=model.output;}
    m.reset.addEventListener('click',function(){strength=15;delay=2;tick=2;cut=-1;sr.set(strength);dr.set(delay);tr.set(tick);bt.set(cut);draw();});watch(m.body,draw);
  }
  function init(){activityFigure();schedulerFigure();collisionFigure();redstoneFigure();}
  document.addEventListener('minecraft:notebook-open', init);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
