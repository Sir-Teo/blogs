/* An original teaching landscape, reused throughout the narrative.
 * Geometry and timing are synthetic. Packing and source-backed boundaries
 * are documented in the notebook. No game resources are distributed. */
(function (root) {
  'use strict';
  var TARGET=[8,7,7], OFFSET=[192,0,128], DIRS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  var QUADS=[[[1,0,0],[1,0,1],[1,1,1],[1,1,0]],[[0,0,1],[0,0,0],[0,1,0],[0,1,1]],[[0,1,0],[1,1,0],[1,1,1],[0,1,1]],[[0,0,1],[1,0,1],[1,0,0],[0,0,0]],[[1,0,1],[0,0,1],[0,1,1],[1,1,1]],[[0,0,0],[1,0,0],[1,1,0],[0,1,0]]];
  var MATERIALS={1:[151,164,171],2:[157,137,113],3:[132,163,145],4:[115,166,185],5:[157,134,96],6:[98,144,119],7:[224,174,101],8:[161,123,70],10:[255,214,128]};
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function mix(a,b,t){return a+(b-a)*t;}
  function height(x,z){return 14+2.3*Math.sin(x*.23)+1.4*Math.cos(z*.29)+.7*Math.sin((x+z)*.4);}
  function density(x,y,z){var terrain=height(x,z)-y,cave=(Math.pow((x-8)/5.7,2)+Math.pow((y-6.4)/3.8,2)+Math.pow((z-8)/5.7,2)-1)*4;var d=Math.min(terrain,cave);if(Math.abs(x-8)<.52&&z>=3&&z<=12&&y>=3&&y<=11)d=Math.max(d,.65);return d;}
  function volume(w,h,d,origin){var data=new Uint8Array(w*h*d);return {w:w,h:h,d:d,data:data,origin:origin||[0,0,0],get:function(x,y,z){return x<0||x>=w||y<0||y>=h||z<0||z>=d?0:data[(y*d+z)*w+x];},set:function(x,y,z,m){if(x>=0&&x<w&&y>=0&&y<h&&z>=0&&z<d)data[(y*d+z)*w+x]=m;}};}
  function scene(removed,cut){var v=volume(16,26,16);for(var y=0;y<21;y++)for(var z=0;z<16;z++)for(var x=0;x<16;x++){if(density(x,y,z)>0){var h=height(x,z),m=y>=Math.floor(h)?3:y>=h-2?2:1;v.set(x,y,z,m);}}
    [[3,3],[4,12]].forEach(function(p){var y=Math.floor(height(p[0],p[1]))+1;for(var i=0;i<4;i++)v.set(p[0],y+i,p[1],5);for(var yy=y+2;yy<y+6;yy++)for(var xx=p[0]-2;xx<=p[0]+2;xx++)for(var zz=p[1]-2;zz<=p[1]+2;zz++)if(Math.abs(xx-p[0])+Math.abs(zz-p[1])+Math.abs(yy-y-3)<5)v.set(xx,yy,zz,6);});
    if(cut)for(var yy=0;yy<v.h;yy++)for(var zz=8;zz<16;zz++)for(var xx=8;xx<16;xx++)v.set(xx,yy,zz,0);v.set(TARGET[0],TARGET[1],TARGET[2],removed?0:7);return v;}
  function neighborhood(removed){var full=scene(removed,false),v=volume(7,10,7,[5,3,4]);for(var y=0;y<v.h;y++)for(var z=0;z<v.d;z++)for(var x=0;x<v.w;x++)v.set(x,y,z,full.get(x+5,y+3,z+4));for(var y2=0;y2<v.h;y2++)for(var z2=4;z2<v.d;z2++)for(var x2=3;x2<v.w;x2++)v.set(x2,y2,z2,0);return v;}
  function faces(v,all){var out=[],blocks=0;for(var y=0;y<v.h;y++)for(var z=0;z<v.d;z++)for(var x=0;x<v.w;x++){var m=v.get(x,y,z);if(!m||m===8)continue;blocks++;for(var i=0;i<6;i++){var d=DIRS[i],neighbor=v.get(x+d[0],y+d[1],z+d[2]);if(all||!neighbor||neighbor===8)out.push({x:x,y:y,z:z,m:m,side:i});}}return {faces:out,blocks:blocks,count:out.length};}
  function lightField(removed){var v=scene(removed,false),light=new Uint8Array(v.data.length),distance=new Int16Array(v.data.length);distance.fill(-1);var queue=[],start=[5,7,7],index=function(x,y,z){return (y*v.d+z)*v.w+x;},si=index.apply(null,start);light[si]=14;distance[si]=0;queue.push(start);for(var head=0;head<queue.length;head++){var p=queue[head],at=index.apply(null,p),level=light[at];if(level<=1)continue;DIRS.forEach(function(d){var x=p[0]+d[0],y=p[1]+d[1],z=p[2]+d[2];if(x<0||x>=v.w||y<0||y>=v.h||z<0||z>=v.d||v.get(x,y,z))return;var n=index(x,y,z);if(light[n]<level-1){light[n]=level-1;distance[n]=distance[at]+1;queue.push([x,y,z]);}});}return {values:light,distance:distance,get:function(x,y,z,wave){if(x<0||x>=v.w||y<0||y>=v.h||z<0||z>=v.d)return 0;var n=index(x,y,z);return wave!=null&&distance[n]>wave?0:light[n];}};}
  function packedSelection(states,empty){var bits=states===1?0:Math.max(4,Math.ceil(Math.log2(states))),per=bits?Math.floor(64/bits):0,index=TARGET[1]*256+TARGET[2]*16+TARGET[0],word=bits?Math.floor(index/per):0,slot=bits?index%per:0,ids=[],value=0n;for(var i=0;i<per;i++){var id=(word*per+i)%states;if(i===slot)id=empty?0:6;ids.push(id);value|=BigInt(id)<<BigInt(i*bits);}return {index:index,bits:bits,per:per,word:word,slot:slot,ids:ids,value:value,bytes:bits?Math.ceil(4096/per)*8:0,padding:bits?64-per*bits:0};}
  function breakState(t,rejected){return {clientRemoved:t>.04&&!(rejected&&t>=.92),serverRemoved:!rejected&&t>=.46,stateArrived:t>=.78,acknowledged:t>=.92,phase:t<.04?'intact':t<.4?'request':t<.5?'validate':t<.78?'return':t<.92?'state':'settled'};}
  var api={target:TARGET,offset:OFFSET,density:density,scene:scene,neighborhood:neighborhood,faces:faces,lightField:lightField,packedSelection:packedSelection,breakState:breakState};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MinecraftStory=api;if(typeof document==='undefined')return;
  var NS='http://www.w3.org/2000/svg',listeners=[],painters=[],removed=false,liveWorld=null,worlds={},meshes=new WeakMap(),lights={},reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function world(r,cut,small){var key=String(r)+String(cut)+String(small);if(!worlds[key]){if(!liveWorld)worlds[key]=small?neighborhood(r):scene(r,cut);else{var v=volume(small?7:liveWorld.w,small?10:liveWorld.h,small?7:liveWorld.d,small?[5,3,4]:[0,0,0]);for(var y=0;y<v.h;y++)for(var z=0;z<v.d;z++)for(var x=0;x<v.w;x++)v.set(x,y,z,liveWorld.get(x+v.origin[0],y+v.origin[1],z+v.origin[2]));if(r!==removed)v.set(TARGET[0]-v.origin[0],TARGET[1]-v.origin[1],TARGET[2]-v.origin[2],r?0:7);if(cut||small)for(var yy=0;yy<v.h;yy++)for(var zz=small?4:8;zz<v.d;zz++)for(var xx=small?3:8;xx<v.w;xx++)v.set(xx,yy,zz,0);worlds[key]=v;}}return worlds[key];}
  function mesh(v){if(!meshes.has(v))meshes.set(v,faces(v,false));return meshes.get(v);}
  function light(r){if(!lights[r]){if(liveWorld&&root.MinecraftPlayCore){var v=world(r,false,false),field=root.MinecraftPlayCore.computeLighting(v);lights[r]={get:function(x,y,z,wave){var level=field.sample(x,y,z)[0];return wave!=null&&14-level>wave?0:level;}};}else lights[r]=lightField(r);}return lights[r];}
  function announceChange(){worlds={};lights={};meshes=new WeakMap();listeners.forEach(function(fn){fn();});}
  function changeRemoved(value){var type=value?0:7;if(removed===value&&(!liveWorld||liveWorld.get.apply(null,TARGET)===type))return;removed=value;if(liveWorld)liveWorld.set(TARGET[0],TARGET[1],TARGET[2],type);announceChange();}
  api.live={attach:function(v){liveWorld=v;removed=v.get.apply(null,TARGET)===0;announceChange();},changed:function(){if(liveWorld)removed=liveWorld.get.apply(null,TARGET)===0;announceChange();},subscribe:function(fn){listeners.push(fn);return function(){listeners=listeners.filter(function(f){return f!==fn;});};},isRemoved:function(){return removed;},overview:function(ctx,w,h,opts){opts=opts||{};return drawWorld(ctx,{x:0,y:0,w:w,h:h},world(removed,true,false),colorTokens(),{angle:opts.angle||42,label:'same cell',target:opts.target,light:opts.lit?light(removed):null,guideHeight:opts.guideHeight,monochrome:opts.monochrome});}};
  function el(tag,attrs,parent){var n=document.createElement(tag);Object.keys(attrs||{}).forEach(function(k){if(k==='text')n.textContent=attrs[k];else n.setAttribute(k,attrs[k]);});if(parent)parent.appendChild(n);return n;}
  function svg(tag,attrs,parent){var n=document.createElementNS(NS,tag);Object.keys(attrs||{}).forEach(function(k){if(k==='text')n.textContent=attrs[k];else n.setAttribute(k,attrs[k]);});if(parent)parent.appendChild(n);return n;}
  function mount(id){var f=document.getElementById(id);if(!f||f.dataset.story!=='true'||f.dataset.gameplay)return null;var b=el('div',{class:'ms'});f.insertBefore(b,f.querySelector('figcaption'));f.classList.add('ready');return {body:b,fig:f};}
  function controls(b){return el('div',{class:'ms-controls'},b);}
  function action(parent,label,fn){var b=el('button',{type:'button',class:'ms-action',text:label},parent);b.addEventListener('click',fn);return b;}
  function range(parent,label,min,max,step,value,fn){
    var l=el('label',{},parent);
    el('span',{text:label},l);
    var input=el('input',{type:'range',min:min,max:max,step:step,value:value,'aria-label':label},l);
    var output=el('output',{class:'ms-range-value','aria-hidden':'true'},l);
    function sync(v){
      input.value=v;
      var progress=(+input.value-min)/(max-min)*100;
      input.style.setProperty('--ms-progress',progress+'%');
      output.textContent=max===1?Math.round(progress)+'%':String(+input.value);
      input.setAttribute('aria-valuetext',output.textContent);
    }
    input.addEventListener('input',function(){sync(+input.value);fn(+input.value);});
    sync(value);
    return {input:input,sync:sync,set:function(v){sync(v);fn(v);}};
  }
  function reading(parent){return el('p',{class:'ms-reading','aria-live':'polite'},parent);}
  function setMetrics(readout,items){
    readout.classList.add('ms-metrics');
    readout.replaceChildren();
    items.forEach(function(item){
      var cell=el('span',{},readout);
      el('b',{text:item[0]},cell);
      el('small',{text:item[1]},cell);
    });
  }
  function colorTokens(){var st=getComputedStyle(document.documentElement);return {bg:(st.getPropertyValue('--mc-panel')||st.getPropertyValue('--bg')).trim(),fg:st.getPropertyValue('--fg').trim(),secondary:st.getPropertyValue('--fg-2').trim(),muted:st.getPropertyValue('--fg-3').trim(),line:st.getPropertyValue('--line-2').trim(),blue:st.getPropertyValue('--accent').trim(),amber:(st.getPropertyValue('--mc-amber')||'#c18b43').trim(),dark:document.documentElement.dataset.theme==='dark'};}
  function paint(parent,label,ratio,render){var stage=el('div',{class:'ms-stage'},parent),c=el('canvas',{role:'img','aria-label':label},stage);var pending=false;function draw(){var w=stage.clientWidth;if(!w)return;var h=typeof ratio==='function'?ratio(w):w*ratio,dpr=Math.min(devicePixelRatio||1,2.5);c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.style.height=h+'px';var ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.font='12px '+getComputedStyle(document.body).fontFamily;render(ctx,w,h,colorTokens());}function schedule(){if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;draw();});}new ResizeObserver(schedule).observe(stage);painters.push(schedule);return {canvas:c,stage:stage,draw:schedule,now:draw};}
  function line(ctx,a,b,color,width,dash){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.strokeStyle=color;ctx.lineWidth=width||1;ctx.setLineDash(dash||[]);ctx.stroke();ctx.setLineDash([]);}
  function text(ctx,t,x,y,color,align){ctx.fillStyle=color;ctx.textAlign=align||'left';ctx.fillText(t,x,y);ctx.textAlign='left';}
  function dot(ctx,p,r,color){ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  function plotLabel(ctx,label,x,y,p,align){
    ctx.save();ctx.font='10px '+getComputedStyle(document.documentElement).getPropertyValue('--mono');
    text(ctx,label,x,y,p.secondary,align);ctx.restore();
  }
  function arrow(ctx,a,b,color){
    line(ctx,a,b,color,1);
    var angle=Math.atan2(b[1]-a[1],b[0]-a[0]),size=4;
    line(ctx,b,[b[0]-Math.cos(angle-.55)*size,b[1]-Math.sin(angle-.55)*size],color,1);
    line(ctx,b,[b[0]-Math.cos(angle+.55)*size,b[1]-Math.sin(angle+.55)*size],color,1);
  }
  function densitySlice(ctx,box,p){
    var cell=Math.min((box.w-34)/16,(box.h-65)/21),gx=box.x+(box.w-16*cell)/2+7,gy=box.y+26;
    for(var y=0;y<=20;y++)for(var x=0;x<16;x++){
      var d=density(x,y,7),strength=clamp(Math.abs(d)/5,0,1),rgb=d>0?(p.dark?[224,178,106]:[174,135,72]):(p.dark?[102,161,189]:[119,163,183]);
      ctx.fillStyle='rgba('+rgb.join(',')+','+(.2+strength*.64)+')';
      ctx.fillRect(gx+x*cell,gy+(20-y)*cell,cell-.45,cell-.45);
    }
    // Trace the zero boundary of the same samples shown by the landscape.
    ctx.save();ctx.globalAlpha=.6;
    for(var y=0;y<=20;y++)for(var x=0;x<16;x++){
      var solid=density(x,y,7)>0,px=gx+x*cell,py=gy+(20-y)*cell;
      if(x<15&&solid!==(density(x+1,y,7)>0))line(ctx,[px+cell,py],[px+cell,py+cell],p.fg,.8);
      if(y<20&&solid!==(density(x,y+1,7)>0))line(ctx,[px,py],[px+cell,py],p.fg,.8);
    }
    ctx.restore();
    var target=[gx+8.5*cell,gy+13.5*cell];
    ctx.strokeStyle=p.amber;ctx.lineWidth=1.5;ctx.strokeRect(gx+8*cell-1,gy+13*cell-1,cell+2,cell+2);
    [0,8,15].forEach(function(x){plotLabel(ctx,String(x),gx+(x+.5)*cell,gy+21*cell+16,p,'center');});
    [0,8,16].forEach(function(y){plotLabel(ctx,String(y),gx-7,gy+(20.5-y)*cell+3,p,'right');});
    plotLabel(ctx,'y',gx-7,gy-9,p,'right');plotLabel(ctx,'x',gx+16*cell+11,gy+21*cell+16,p);
    plotLabel(ctx,'Slice / z = 7',box.x+box.w/2,box.y+8,p,'center');
    return target;
  }
  function drawWorld(ctx,box,v,p,opts){opts=opts||{};var yaw=(opts.angle==null?42:opts.angle)*Math.PI/180,cy=Math.cos(yaw),sy=Math.sin(yaw),sp=Math.sin(.49),cp=Math.cos(.49),gap=opts.gap||0,ex=opts.explode||0,geometry=mesh(v),occupied=opts.guideHeight||1;geometry.faces.forEach(function(f){occupied=Math.max(occupied,f.y+1);});function yy(y){return y+(y>=16?gap:0);}function raw(x,y,z){return [x*cy-z*sy,(x*sy+z*cy)*sp-y*cp];}var corners=[];[-1,v.w+1].forEach(function(x){[-.5,occupied+gap+1].forEach(function(y){[-1,v.d+1].forEach(function(z){corners.push(raw(x,y,z));});});});var xs=corners.map(function(q){return q[0];}),ys=corners.map(function(q){return q[1];}),minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys),scale=Math.min((box.w-32)/(maxX-minX),(box.h-34)/(maxY-minY)),ox=box.x+box.w/2-(minX+maxX)*scale/2,oy=box.y+box.h/2-(minY+maxY)*scale/2+6;function P(x,y,z){var q=raw(x,y,z);return [ox+q[0]*scale,oy+q[1]*scale];}ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.clip();var floor=P(v.w/2,-.5,v.d/2);ctx.save();ctx.translate(floor[0],floor[1]);ctx.scale(1,.25);var shadow=ctx.createRadialGradient(0,0,0,0,0,scale*v.w*.65);shadow.addColorStop(0,p.dark?'rgba(0,0,0,.22)':'rgba(50,64,60,.09)');shadow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=shadow;ctx.beginPath();ctx.arc(0,0,scale*v.w*.65,0,Math.PI*2);ctx.fill();ctx.restore();
    if(v.w>=16){
      ctx.save();ctx.globalAlpha=opts.guideHeight?.75:.48;
      for(var grid=0;grid<=v.w;grid+=opts.guideHeight?1:4){
        line(ctx,P(grid,0,0),P(grid,0,v.d),p.line,.65);
        line(ctx,P(0,0,grid),P(v.w,0,grid),p.line,.65);
      }
      ctx.restore();
    }
    if(opts.guideHeight){
      ctx.save();ctx.globalAlpha=.7;
      var top=opts.guideHeight;
      for(var g=0;g<=16;g+=4){
        line(ctx,P(0,g,0),P(16,g,0),p.line,.7);
        line(ctx,P(0,g,0),P(0,g,16),p.line,.7);
        line(ctx,P(g,0,0),P(g,top,0),p.line,.7);
        line(ctx,P(0,0,g),P(0,top,g),p.line,.7);
      }
      line(ctx,P(16,0,0),P(16,top,0),p.line,.7);
      line(ctx,P(0,0,16),P(0,top,16),p.line,.7);
      line(ctx,P(0,top,0),P(16,top,0),p.line,.7);
      line(ctx,P(0,top,0),P(0,top,16),p.line,.7);
      ctx.restore();
      ctx.save();ctx.globalAlpha=.8;
      [[16,0,0],[0,top,0],[0,0,16]].forEach(function(end){line(ctx,P(0,0,0),P.apply(null,end),p.muted,.9);});
      ctx.restore();
      var xEnd=P(16,0,0),yEnd=P(0,top,0),zEnd=P(0,0,16),origin=P(0,0,0);
      plotLabel(ctx,'x · 16',xEnd[0],xEnd[1]+18,p,'center');
      plotLabel(ctx,'y · '+top,yEnd[0]+10,yEnd[1]+4,p);
      plotLabel(ctx,'z · 16',zEnd[0],zEnd[1]+18,p,'center');
      plotLabel(ctx,'0',origin[0],origin[1]+14,p,'center');
    }
    var visibleGeometry=geometry.faces.slice();
    for(var torchY=0;torchY<v.h;torchY++)for(var torchZ=0;torchZ<v.d;torchZ++)for(var torchX=0;torchX<v.w;torchX++)if(v.get(torchX,torchY,torchZ)===8){
      for(var part=0;part<2;part++)for(var side=0;side<6;side++)visibleGeometry.push({x:torchX,y:torchY,z:torchZ,m:part?10:8,side:side,torch:part?[.38,.52,.38,.24,.20,.24]:[.44,0,.44,.12,.60,.12]});
    }
    var normals=[sy*cp,-sy*cp,sp,-sp,cy*cp,-cy*cp],arr=visibleGeometry.filter(function(f){return normals[f.side]>.001;}).map(function(f){return {f:f,depth:(f.x+.5)*sy*cp+(f.z+.5)*cy*cp+(yy(f.y)+.5)*sp};});arr.sort(function(a,b){return a.depth-b.depth;});var morph=opts.morph==null?1:opts.morph;
    if(morph<.8){var dots=[];for(var y=0;y<v.h;y++)for(var z=0;z<v.d;z++)for(var x=0;x<v.w;x++){var material=v.get(x,y,z),sample=density(x+v.origin[0],y+v.origin[1],z+v.origin[2]);if(!material&&(sample>=0||y>=12||(x>=8&&z>=8)))continue;if((material===5||material===6)&&sample<=0)continue;dots.push({x:x,y:y,z:z,d:x*sy*cp+z*cy*cp+yy(y)*sp});}dots.sort(function(a,b){return a.d-b.d;});ctx.globalAlpha=(1-morph)*(p.dark?.94:.7);dots.forEach(function(q){var pos=P(q.x+.5,yy(q.y)+.5,q.z+.5),d=density(q.x+v.origin[0],q.y+v.origin[1],q.z+v.origin[2]),tone=clamp(d/5,0,1),c=d<0?[96,151,184]:[mix(195,169,tone),mix(171,128,tone),mix(126,74,tone)];dot(ctx,pos,Math.max(.8,scale*.07),'rgb('+c.map(Math.round).join(',')+')');});ctx.globalAlpha=1;}
    arr.forEach(function(o){var f=o.f,q=QUADS[f.side].map(function(c){var d=DIRS[f.side],b=f.torch;return b?P(f.x+b[0]+c[0]*b[3],yy(f.y)+b[1]+c[1]*b[4],f.z+b[2]+c[2]*b[5]):P(f.x+c[0]+d[0]*ex,yy(f.y)+c[1]+d[1]*ex,f.z+c[2]+d[2]*ex);}),mat=opts.monochrome&&f.m!==7?MATERIALS[1]:(MATERIALS[f.m]||MATERIALS[1]),shade=f.side===2?1.05:f.side===0?.75:.9,variation=1+(((f.x*13+f.y*7+f.z*11)%9)-4)*.006,rgb=mat.map(function(c){return clamp(c*shade*variation,0,255);});if(opts.light){var d=DIRS[f.side],level=opts.light.get(f.x+v.origin[0]+d[0],f.y+v.origin[1]+d[1],f.z+v.origin[2]+d[2],opts.wave),underground=f.y+v.origin[1]<12;if(underground){var b=.28+level/14*.72;rgb=rgb.map(function(c,i){return c*b+(i===0?level*2.1:i===1?level*.9:0);});}}ctx.globalAlpha=clamp(morph,0,1)*((f.m===5||f.m===6)?clamp((morph-.7)/.3,0,1):1);ctx.beginPath();q.forEach(function(point,i){i?ctx.lineTo(point[0],point[1]):ctx.moveTo(point[0],point[1]);});ctx.closePath();ctx.fillStyle='rgb('+rgb.map(function(c){return Math.round(clamp(c,0,255));}).join(',')+')';ctx.fill();ctx.strokeStyle=opts.wire?p.blue:'rgba(25,42,35,.075)';ctx.lineWidth=opts.wire?.65:.35;ctx.stroke();});ctx.globalAlpha=1;
    if(opts.section){var y=16;var ring=[[0,y,0],[v.w,y,0],[v.w,y,v.d],[0,y,v.d]];for(var i=0;i<4;i++)line(ctx,P.apply(null,ring[i]),P.apply(null,ring[(i+1)%4]),p.blue,1,[3,4]);}
    var tx=TARGET[0]-v.origin[0]+.5,ty=TARGET[1]-v.origin[1]+.5,tz=TARGET[2]-v.origin[2]+.5,tp=P(tx,yy(ty),tz);if(opts.target!==false){dot(ctx,tp,Math.max(2.5,scale*.11),p.amber);if(opts.label){ctx.save();ctx.font='11px '+getComputedStyle(document.body).fontFamily;var labelWidth=ctx.measureText(opts.label).width+12,lx=clamp(tp[0]+26,box.x+10,box.x+box.w-labelWidth-10),ly=clamp(tp[1]-44,box.y+36,box.y+box.h-34);line(ctx,tp,[lx+4,ly+18],p.amber,1);ctx.fillStyle=p.bg;ctx.fillRect(lx,ly,labelWidth,21);text(ctx,opts.label,lx+6,ly+14,p.fg);ctx.restore();}}ctx.restore();return {P:P,target:tp,scale:scale};
  }
  api.drawWorld=function(ctx,w,h,v,options){return drawWorld(ctx,{x:0,y:0,w:w,h:h},v,colorTokens(),options||{});};
  if(document.querySelector('[data-minecraft-build]'))return;
  function animate(duration,fn,done){if(reduced){fn(1);if(done)done();return;}var start=performance.now();function frame(now){var t=clamp((now-start)/duration,0,1);fn(t);if(t<1)requestAnimationFrame(frame);else if(done)done();}requestAnimationFrame(frame);}
  function hero(){var m=mount('mc-world');if(!m)return;var inside=true,angle=42;var art=paint(m.body,'The same hillside and amber block used throughout the article. Drag or use left and right arrows to rotate.',function(w){return w<500?w*1.08:w*.7;},function(ctx,w,h,p){drawWorld(ctx,{x:0,y:0,w:w,h:h},world(removed,inside),p,{angle:angle,target:inside,label:inside?'our block':null});});var c=controls(m.body),b=action(c,'Show the surface',function(){inside=!inside;b.textContent=inside?'Show the surface':'Look inside';b.setAttribute('aria-pressed',String(inside));art.draw();});b.setAttribute('aria-pressed','true');el('span',{class:'ms-hint',text:'Drag to turn'},c);art.canvas.setAttribute('tabindex','0');var down=null;art.canvas.addEventListener('pointerdown',function(e){down={x:e.clientX,a:angle};art.canvas.setPointerCapture(e.pointerId);});art.canvas.addEventListener('pointermove',function(e){if(down){angle=clamp(down.a+(e.clientX-down.x)*.22,18,75);art.draw();}});art.canvas.addEventListener('pointerup',function(){down=null;});art.canvas.addEventListener('pointercancel',function(){down=null;});art.canvas.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();angle=clamp(angle+(e.key==='ArrowRight'?5:-5),18,75);art.draw();}});listeners.push(art.draw);art.draw();}
  function terrain(){
    var m=mount('mc-density');if(!m)return;
    var t=.35,generated=scene(false,true);
    var art=paint(m.body,'The same density field as a three-dimensional landscape and a labeled x-y cross-section at z equals seven. Amber is positive density; blue is non-positive. The outlined sample is our block.',function(w){return w<600?300:390;},function(ctx,w,h,p){
      var compact=w<600,split=w*.55;
      plotLabel(ctx,'The hillside',split/2,27,p,'center');
      drawWorld(ctx,{x:0,y:35,w:split,h:h-49},generated,p,{morph:t,label:compact?null:'+0.65 · solid'});
      var target=densitySlice(ctx,{x:split+2,y:28,w:w-split-13,h:h-42},p);
      if(!compact){
        line(ctx,[target[0]+5,target[1]],[w-43,target[1]],p.amber,.8);
        text(ctx,'+0.65',w-35,target[1]-7,p.amber,'right');
      }
    });
    var c=controls(m.body);
    range(c,'Field → blocks',0,1,.01,t,function(v){t=v;art.draw();});
    var r=reading(m.body);
    setMetrics(r,[['+0.65','Our density sample'],['> 0','Solid · amber samples'],['≤ 0','Air or fluid · blue samples']]);
    art.draw();
  }
  function storage(){
    var m=mount('mc-palette');if(!m)return;
    var states=16,layout=el('div',{class:'ms-storage-layout'},m.body);
    var art=paint(layout,'Our section pulled away from the hillside; the amber block keeps the same address.',function(w){return Math.max(290,w*.96);},function(ctx,w,h,p){
      drawWorld(ctx,{x:0,y:0,w:w,h:h},world(removed,true),p,{gap:4,section:true,label:'section 0'});
    });
    var data=el('div',{class:'ms-storage-data'},layout);
    el('p',{class:'ms-memory-label',text:'LOCAL PALETTE / amber marks our state'},data);
    var palette=el('div',{class:'ms-memory'},data);
    var wordLabel=el('p',{class:'ms-memory-label'},data);
    var word=svg('svg',{class:'ms-word',viewBox:'0 0 400 82',role:'img','aria-label':'One 64-bit word. The amber group contains our block’s palette index.'},data);
    var detail=el('div',{class:'ms-entry-detail',role:'group'},data),entryLabel=el('span',{},detail),bits=el('div',{class:'ms-entry-bits','aria-hidden':'true'},detail);
    var packed=el('p',{class:'ms-packed-value'},data),r=reading(data),ctl=controls(m.body);
    var toggle=action(ctl,'Add a seventeenth state elsewhere',function(){states=states===16?17:16;draw();});
    function draw(){
      var st=packedSelection(states,removed);
      palette.replaceChildren();
      for(var i=0;i<states;i++)el('span',{class:i===(removed?0:6)?'ms-picked':i===16?'ms-new':'',text:i},palette);
      wordLabel.textContent='64-BIT WORD '+st.word+' / '+st.per+' entries';
      word.replaceChildren();
      var wordWidth=Math.max(260,data.clientWidth),unit=wordWidth/64;
      word.setAttribute('viewBox','0 0 '+wordWidth+' 82');
      for(var i=0;i<st.per;i++){
        var x=i*st.bits*unit,picked=i===st.slot;
        svg('rect',{x:x+1,y:8,width:st.bits*unit-2,height:31,rx:1,fill:picked?'var(--th-amber-soft)':'var(--subtle)',stroke:picked?'var(--mc-amber)':'var(--line)','stroke-width':1},word);
        svg('text',{x:x+st.bits*unit/2,y:29,'text-anchor':'middle',class:picked?'ms-word-selected':'',text:st.ids[i]},word);
        if(picked){
          svg('path',{d:'M '+(x+st.bits*unit/2)+' 42 v 7',stroke:'var(--mc-amber)',fill:'none'},word);
          svg('text',{x:x+st.bits*unit/2,y:61,'text-anchor':'middle',class:'ms-word-selected',text:'↓'},word);
        }
      }
      if(st.padding){
        svg('rect',{x:wordWidth-st.padding*unit+1,y:8,width:st.padding*unit-2,height:31,fill:'var(--line)'},word);
        svg('text',{x:wordWidth-2,y:64,'text-anchor':'end',text:'4 spare bits'},word);
      }
      var binary=st.ids[st.slot].toString(2).padStart(st.bits,'0');
      entryLabel.textContent='Entry '+st.slot+' → palette '+st.ids[st.slot];
      detail.setAttribute('aria-label','Entry '+st.slot+' stores palette index '+st.ids[st.slot]+', binary '+binary+'.');
      bits.replaceChildren();binary.split('').forEach(function(bit){el('span',{text:bit},bits);});
      packed.textContent='0x'+st.value.toString(16).padStart(16,'0');
      setMetrics(r,[[st.index.toLocaleString(),'Block index'],[st.bits+' bits','Per entry · '+states+' states'],[st.bytes.toLocaleString()+' B','Section data']]);
      toggle.textContent=states===16?'Add a seventeenth state elsewhere':'Back to sixteen states';
      m.fig.dataset.states=states;art.draw();
    }
    var wordWidthSeen=0;
    new ResizeObserver(function(){if(Math.abs(wordWidthSeen-data.clientWidth)>1){wordWidthSeen=data.clientWidth;draw();}}).observe(data);
    listeners.push(draw);draw();
  }
  function surface(){
    var m=mount('mc-mesh');if(!m)return;
    var amount=.25;
    var art=paint(m.body,'The whole hillside beside a close view of the same cave wall. The slider separates the exposed unit faces in the detail; buried faces are omitted.',function(w){return w<600?280:380;},function(ctx,w,h,p){
      var split=w*.53,compact=w<600;
      plotLabel(ctx,'Whole hillside',split/2,27,p,'center');
      plotLabel(ctx,'Exposed wall faces',split+(w-split)/2,27,p,'center');
      drawWorld(ctx,{x:0,y:35,w:split,h:h-45},world(removed,true),p,{target:true});
      drawWorld(ctx,{x:split,y:42,w:w-split,h:h-60},world(removed,true,true),p,{explode:amount*.8,wire:amount>.08,label:compact?null:'our block'});
    });
    var c=controls(m.body),r=reading(m.body);
    range(c,'Separate the faces',0,1,.01,amount,function(v){amount=v;art.draw();});
    function update(){
      var v=world(removed,true),mm=mesh(v),possible=mm.blocks*6;
      setMetrics(r,[[possible.toLocaleString(),'Possible cube faces'],[mm.count.toLocaleString(),'Exposed faces'],[(100*(1-mm.count/possible)).toFixed(1)+'%','Faces omitted']]);
      art.draw();
    }
    listeners.push(update);update();
  }
  function breaking(){
    var m=mount('mc-network');if(!m)return;
    var t=0,rejected=false,playing=false;
    var art=paint(m.body,'Predicted client and authoritative server views of the same wall. Three separate tracks show the outgoing action request, returning block state, and returning sequence acknowledgment.',function(w){return w<600?345:390;},function(ctx,w,h,p){
      var s=breakState(t,rejected),compact=w<600,bw=w*.47,modelHeight=compact?179:230;
      var left={x:0,y:35,w:bw,h:modelHeight},right={x:w-bw,y:35,w:bw,h:modelHeight};
      plotLabel(ctx,'Your client',left.x+left.w/2,23,p,'center');
      plotLabel(ctx,'Server',right.x+right.w/2,23,p,'center');
      drawWorld(ctx,left,world(s.clientRemoved,true,true),p,{target:true});
      drawWorld(ctx,right,world(s.serverRemoved,true,true),p,{target:true});
      var baseline=compact?229:280;
      ctx.save();ctx.font='11px '+getComputedStyle(document.body).fontFamily;
      text(ctx,s.clientRemoved?(s.acknowledged?'air confirmed':'predicted air'):'stone present',left.x+left.w/2,baseline-7,s.clientRemoved?p.amber:p.muted,'center');
      text(ctx,s.serverRemoved?'air confirmed':'stone present',right.x+right.w/2,baseline-7,s.serverRemoved?p.amber:p.muted,'center');
      ctx.restore();
      var a=compact?Math.max(104,w*.38):w*.28,b=compact?w-20:w*.76;
      function track(name,row,begin,end,back,hollow,color){
        var y=baseline+15+row*31,started=t>=begin&&t>0,done=t>=end,from=back?b:a,to=back?a:b;
        plotLabel(ctx,name,compact?14:30,y+3,p);
        arrow(ctx,[from,y],[to,y],started?color:p.line);
        if(started){
          var x=mix(from,to,clamp((t-begin)/(end-begin),0,1));
          if(hollow){ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=p.bg;ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();}
          else dot(ctx,[x,y],4,color);
          if(done)dot(ctx,[from,y],1.6,color);
        }
      }
      track('Request',0,.02,.4,false,false,p.blue);
      track('Block state',1,.5,.78,true,false,p.amber);
      track('Sequence ack',2,.57,.92,true,true,p.blue);
    });
    var c=controls(m.body),r=reading(m.body);
    var scrub=range(c,'The round trip',0,1,.01,t,function(v){if(playing)return;t=v;update();});
    var play=action(c,'Break block',function(){
      if(playing)return;
      playing=true;play.disabled=true;test.disabled=true;scrub.input.disabled=true;changeRemoved(false);
      animate(1700,function(v){t=v;scrub.sync(t);describe();art.draw();},function(){
        playing=false;play.disabled=false;test.disabled=false;scrub.input.disabled=false;update();
      });
    });
    var test=action(c,'Try rejection',function(){
      rejected=!rejected;t=0;test.textContent=rejected?'Try acceptance':'Try rejection';scrub.sync(0);changeRemoved(false);update();
    });
    function describe(){
      var phase=breakState(t,rejected).phase;
      var descriptions={intact:'Both copies start with the same stone block.',request:'The client predicts air and sends the action request.',validate:rejected?'The server refuses the edit.':'The server validates the edit against its own world.',return:'Block state and the sequence acknowledgment return separately.',state:'State received; the prediction is still awaiting acknowledgment.',settled:rejected?'The server keeps the stone. The client restores it.':'Both copies agree: the block is air.'};
      if(r.textContent!==descriptions[phase])r.textContent=descriptions[phase];
      m.fig.dataset.phase=phase;m.fig.dataset.outcome=rejected?'rejected':'accepted';
    }
    function update(){
      changeRemoved(t>=.92&&!rejected);
      play.textContent=t>=.92?'Replay the break':'Break block';describe();art.draw();
    }
    m.fig.storyAction=function(name){
      if(name==='reject'){rejected=true;test.textContent='Try acceptance';t=0;scrub.sync(0);update();play.click();}
      else if(name==='break')play.click();
    };
    update();
  }
  function lighting(){var m=mount('mc-light');if(!m)return;var wave=14;var art=paint(m.body,'The same cave lit by a torch: remove our wall block to open a shorter route into the right chamber.',function(w){return w<500?w*1.05:w*.68;},function(ctx,w,h,p){var v=world(removed,true),lf=light(removed),pr=drawWorld(ctx,{x:0,y:0,w:w,h:h},v,p,{light:lf,wave:wave,target:!removed});var torch=pr.P(5.5,7.5,7.5);var glow=ctx.createRadialGradient(torch[0],torch[1],1,torch[0],torch[1],24);glow.addColorStop(0,'rgba(255,202,108,.55)');glow.addColorStop(1,'rgba(255,202,108,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(torch[0],torch[1],24,0,Math.PI*2);ctx.fill();dot(ctx,torch,3,'#ffd393');});var c=controls(m.body),b=action(c,'Remove the wall block',function(){wave=14;rr.input.value=14;changeRemoved(!removed);});var rr=range(c,'Light spreads',0,14,1,wave,function(v){wave=v;draw();}),r=reading(m.body);function draw(){b.textContent=removed?'Put the block back':'Remove the wall block';var val=light(removed).get(10,7,7,wave);r.textContent='Light in the other chamber: '+val+' / 15';m.fig.dataset.light=val;m.fig.dataset.removed=String(removed);art.draw();}listeners.push(draw);m.fig.storyAction=function(){wave=14;rr.input.value=14;if(!removed)changeRemoved(true);else draw();};draw();}
  function frame(){
    var m=mount('mc-render-queue');if(!m)return;
    var step=0;
    var art=paint(m.body,'The changed block data beside the displayed mesh. The same amber position is air in the data immediately; the display keeps its stone until the new mesh is compiled, uploaded, and selected.',function(w){return w<600?220:290;},function(ctx,w,h,p){
      var bw=w*.48,compact=w<600,rects=[{x:0,y:36,w:bw,h:h-(compact?64:46)},{x:w-bw,y:36,w:bw,h:h-(compact?64:46)}];
      plotLabel(ctx,'World data',rects[0].w/2,23,p,'center');
      plotLabel(ctx,'Displayed mesh',rects[1].x+rects[1].w/2,23,p,'center');
      drawWorld(ctx,rects[0],world(true,true,true),p,{light:light(true),target:true,label:compact?null:'air'});
      drawWorld(ctx,rects[1],world(step>=3,true,true),p,{light:light(step>=3),target:true,label:compact?null:step>=3?'air':'stone'});
      if(compact){
        text(ctx,'air',rects[0].w/2,h-11,p.amber,'center');
        text(ctx,step>=3?'air':'stone',rects[1].x+rects[1].w/2,h-11,step>=3?p.amber:p.muted,'center');
      }
    });
    var timeline=el('ol',{class:'ms-pipeline','aria-label':'Mesh rebuild progress'},m.body);
    var labels=['Changed','Compiled','Uploaded','Displayed'];
    var phases=labels.map(function(label){
      var item=el('li',{},timeline);
      el('span',{text:label},item);
      return item;
    });
    var c=controls(m.body),b=action(c,'Compile the section',function(){step=(step+1)%4;draw();}),r=reading(m.body);
    function draw(){
      b.textContent=['Compile the section','Upload the buffers','Show the next frame','Replay the rebuild'][step];
      r.textContent=['New state; the old mesh is still on screen.','The CPU mesh is ready. The GPU still has the old version.','New buffers are uploaded; the next frame can use them.','The hole and its changed light are visible.'][step];
      phases.forEach(function(item,i){
        item.classList.toggle('done',i<step);
        if(i===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
      });
      m.fig.dataset.stage=String(step);art.draw();
    }
    m.fig.storyAction=function(){step=0;draw();};draw();
  }
  function saving(){
    var m=mount('mc-region');if(!m)return;
    var progress=0,playing=false,payloadBytes=9600,recordBytes=payloadBytes+5,sectorBytes=4096,sectors=Math.ceil(recordBytes/sectorBytes),padding=sectors*sectorBytes-recordBytes;
    var art=paint(m.body,'Chunk twelve, eight selects row eight, column twelve in the region directory, slot 268. Its location entry starts at byte 1,072. A 9,600-byte illustrative payload plus its five-byte header occupies three 4-KiB sectors and leaves 2,683 bytes unused.',function(w){return w<600?480:350;},function(ctx,w,h,p){
      var compact=w<600,gs=compact?Math.min(w-84,200):232,gx=compact?(w-gs)/2:44,gy=compact?42:61,cell=gs/32;
      ctx.font='11px '+getComputedStyle(document.body).fontFamily;
      text(ctx,'r.0.0.mca',gx,gy-20,p.fg);
      for(var z=0;z<32;z++)for(var x=0;x<32;x++){
        ctx.fillStyle=((x*7+z*3)%11<6?p.line:(p.dark?'#252d22':'#e4e9df'));
        ctx.fillRect(gx+x*cell,gy+z*cell,cell-.8,cell-.8);
      }
      ctx.save();ctx.globalAlpha=.18;ctx.fillStyle=p.amber;
      ctx.fillRect(gx,gy+8*cell,gs,cell);
      ctx.fillRect(gx+12*cell,gy,cell,gs);ctx.restore();
      ctx.fillStyle=p.amber;ctx.fillRect(gx+12*cell,gy+8*cell,cell-.8,cell-.8);
      var selected=[gx+12.5*cell,gy+8.5*cell],highlight=Object.assign({},p,{muted:p.amber});
      ctx.strokeStyle=p.amber;ctx.lineWidth=1.2;ctx.strokeRect(gx+12*cell-1,gy+8*cell-1,cell+1.2,cell+1.2);
      [0,12,31].forEach(function(x){plotLabel(ctx,String(x),gx+(x+.5)*cell,gy+gs+16,x===12?highlight:p,'center');});
      [0,8,31].forEach(function(z){plotLabel(ctx,String(z),gx-8,gy+(z+.5)*cell+3,z===8?highlight:p,'right');});
      plotLabel(ctx,'z',gx-8,gy-9,p,'right');plotLabel(ctx,'x',gx+gs+13,gy+gs+16,p);
      var dx=compact?20:w*.45,dy=compact?298:94,dw=compact?w-40:w*.5;
      line(ctx,selected,[dx,dy+16],p.line,1,[3,4]);
      text(ctx,'slot 268 · chunk (12, 8)',dx,dy-18,p.fg);
      var byteWidth=(dw-9)/4;
      for(var i=0;i<4;i++){
        ctx.fillStyle=i===3?(progress>.2?(p.dark?'#78592d':'#e2c391'):p.line):(p.dark?'#2a3326':'#e0e6da');
        ctx.fillRect(dx+i*(byteWidth+3),dy,byteWidth,32);
      }
      text(ctx,'sector offset / 24 bits',dx,dy+49,p.muted);
      text(ctx,'0x03',dx+3*(byteWidth+3)+byteWidth/2,dy+21,p.fg,'center');
      text(ctx,'count / 8 bits',dx+3*(byteWidth+3)+byteWidth/2,dy+49,p.muted,'center');
      text(ctx,'Location entry at byte 1,072',dx,dy+73,p.muted);
      var sy=dy+102,sw=(dw-12)/3;
      for(var i=0;i<3;i++){
        var sx=dx+i*(sw+6),used=Math.min(sectorBytes,Math.max(0,recordBytes-i*sectorBytes));
        ctx.fillStyle=p.dark?'#2a3326':'#e0e6da';ctx.fillRect(sx,sy,sw,36);
        ctx.fillStyle=progress>.5?(p.dark?'#526b48':'#afc4a6'):(p.dark?'#384331':'#cad6c3');
        ctx.fillRect(sx,sy,sw*used/sectorBytes,36);
        text(ctx,'4 KiB',sx+sw/2,sy+23,p.fg,'center');
      }
      ctx.fillStyle=p.dark?'#526b48':'#afc4a6';ctx.fillRect(dx,sy+53,7,7);
      text(ctx,'record data',dx+13,sy+60,p.muted);
      var keyX=dx+dw*.59;
      ctx.fillStyle=p.dark?'#2a3326':'#e0e6da';ctx.fillRect(keyX,sy+53,7,7);
      text(ctx,'tail padding',keyX+13,sy+60,p.muted);
      if(progress>0&&progress<1){
        var end=[dx+dw*.875,dy+16],q=[mix(selected[0],end[0],Math.min(1,progress*2)),mix(selected[1],end[1],Math.min(1,progress*2))];
        dot(ctx,q,4,p.amber);
      }
    });
    var c=controls(m.body),b=action(c,'Save the changed chunk',function(){
      if(playing)return;playing=true;b.disabled=true;
      animate(1100,function(t){progress=t;art.draw();},function(){
        playing=false;b.disabled=false;b.textContent='Replay the save';
        status.textContent='Saved. The block keeps the same address.';m.fig.dataset.saved='true';
      });
    });
    var status=el('span',{class:'ms-save-status',role:'status',text:'Palette → compression → sector allocation'},c);
    var r=reading(m.body);
    setMetrics(r,[[recordBytes.toLocaleString()+' B','Record · payload + 5 B'],['12 KiB','Allocated · 3 × 4 KiB'],[padding.toLocaleString()+' B','Unused tail padding']]);
    m.fig.dataset.saved='false';art.draw();
  }
  function polishNotebook(){
    var setups={
      'mc-aquifer':{group:'mf-controls',controls:['.tabs[aria-label="Substance view"]','input[aria-label="Sample y"]','input[aria-label="Cave density"]'],extra:'.mf-branch',stats:'.mf-stats',secondary:[0,1]},
      'mc-redstone':{group:'mce-controls',controls:['input[aria-label="Source power"]','.tabs[aria-label="Wire connection"]'],stats:'.mce-facts',secondary:[0]},
      'mc-transparency':{group:'mr-controls',controls:['input[aria-label="Pane opacity"]'],stats:'.mr-stats',secondary:[2],extra:'.mr-equation'}
    };
    document.querySelectorAll('.mc-notebook-featured figure[data-figure-mounted="true"]').forEach(function(fig){
      if(fig.dataset.notebookPolished)return;
      var setup=setups[fig.id],body=fig.querySelector(':scope > div');if(!setup||!body)return;
      fig.dataset.notebookPolished='true';
      var options=el('details',{class:'mc-notebook-options'},body);
      el('summary',{text:'More controls & model notes'},options);
      var controls=el('div',{class:setup.group+' mc-notebook-setup'},options),parents=[];
      setup.controls.forEach(function(selector){
        var node=fig.querySelector(selector);if(!node)return;
        if(node.tagName==='INPUT')node=node.closest('label');
        parents.push(node.parentElement);controls.appendChild(node);
      });
      parents.forEach(function(parent){if(!parent.children.length)parent.remove();});
      var head=body.querySelector('.mf-head, .mce-head, .mr-head'),primaryControls=Array.from(body.children).find(function(node){return node.classList.contains(setup.group);});
      if(head&&primaryControls){
        var reset=head.querySelector('button');
        if(reset){reset.classList.add('mc-notebook-reset');primaryControls.appendChild(reset);}
        head.remove();
      }
      var primary=fig.querySelector(setup.stats);
      if(primary){
        var cells=Array.from(primary.children),secondary=el(primary.tagName.toLowerCase(),{class:'mc-notebook-secondary-stats'},options);
        setup.secondary.forEach(function(i){secondary.appendChild(cells[i]);});
        primary.classList.add('mc-notebook-primary-stats');
        if(primary.children.length===1)primary.classList.add('mc-notebook-single-stat');
      }
      if(setup.extra){var extra=fig.querySelector(setup.extra);if(extra)options.appendChild(extra);}
      fig.querySelectorAll('.mf-note, .mce-note, .mr-note').forEach(function(note){options.appendChild(note);});
    });
  }
  function revealNotebookTarget(){
    var id;try{id=decodeURIComponent(location.hash.slice(1));}catch(ignore){return;}
    var target=document.getElementById(id);
    if(!target||!target.closest('.mc-notebook'))return;
    var parents=[],node=target.tagName==='DETAILS'?target:target.parentElement;
    while(node){if(node.tagName==='DETAILS')parents.push(node);node=node.parentElement;}
    parents.reverse().forEach(function(details){details.open=true;});
    requestAnimationFrame(function(){target.scrollIntoView({block:'start'});});
  }
  function styleRange(input){
    var min=+(input.min||0),max=+(input.max||100);
    input.style.setProperty('--ms-progress',(max>min?clamp((+input.value-min)/(max-min)*100,0,100):0)+'%');
  }
  function styleRanges(){document.querySelectorAll('.post-minecraft input[type="range"]').forEach(styleRange);}
  function init(){
    document.querySelectorAll('.post-minecraft figure.fig').forEach(function(f,i){
      var caption=f.querySelector('figcaption');if(caption)caption.dataset.figureNumber=String(i+1);
    });
    hero();terrain();storage();surface();breaking();lighting();frame();saving();styleRanges();
    document.addEventListener('input',function(e){if(e.target.matches('.post-minecraft input[type="range"]'))styleRange(e.target);});
    document.addEventListener('click',function(e){
      if(e.target.closest('.post-minecraft button'))requestAnimationFrame(styleRanges);
      var a=e.target.closest('a[data-story-action]');if(!a)return;
      var f=document.querySelector(a.getAttribute('href'));if(f&&f.storyAction)f.storyAction(a.dataset.storyAction);
    });
    document.addEventListener('minecraft:notebook-open',function(){polishNotebook();styleRanges();});
    document.addEventListener('toggle',function(e){
      if(e.target.matches('details')&&e.target.open){
        var notebook=e.target.closest('.mc-notebook');
        if(notebook&&e.target.classList.contains('mc-notebook-topic')){
          notebook.querySelectorAll('.mc-notebook-topic').forEach(function(topic){if(topic!==e.target)topic.open=false;});
          if(e.target.classList.contains('mc-notebook-featured'))notebook.querySelector('.mc-notebook-index').open=false;
        }
        if(notebook&&e.target.classList.contains('mc-notebook-index'))notebook.querySelectorAll('.mc-notebook-featured').forEach(function(topic){topic.open=false;});
        document.dispatchEvent(new Event('minecraft:notebook-open'));
      }
    },true);
    window.addEventListener('hashchange',revealNotebookTarget);
    revealNotebookTarget();
  }
  new MutationObserver(function(){painters.forEach(function(fn){fn();});}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
