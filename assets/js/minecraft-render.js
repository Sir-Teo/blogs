/* Source-backed rendering mechanisms, isolated on original synthetic inputs.
 * Full-face shade arithmetic follows BlockModelLighter; geometry and timings
 * are teaching models, not a recreation of Minecraft's shaders or scheduler. */
(function(root){
  'use strict';
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function lerp(a,b,t){return a+(b-a)*t;}
  function blend(foreground, background, alpha){return foreground.map(function(v,i){return v*alpha+background[i]*(1-alpha);});}
  function composite(layers, background){return layers.reduce(function(c,l){return blend(l.color,c,l.alpha);},background.slice());}
  function cornerShade(sideA,sideB,diagonal,center,blockedA,blockedB){
    // Both side tests closed: the actual cubic path substitutes a side sample.
    var corner=blockedA&&blockedB?sideA:diagonal;
    return (sideA+sideB+corner+center)*.25;
  }
  function bilinear(c,u,v){return lerp(lerp(c[0],c[1],u),lerp(c[2],c[3],u),v);}
  function initialPipeline(){return {revision:2,displayed:1,job:2,phase:0,cancelled:0,cameraRevision:0,sortedCamera:0,resorting:false};}
  function pipelineAction(state,action){
    var s=Object.assign({},state);
    if(action==='edit'){if(s.phase<5)s.cancelled++;s.revision++;s.job=s.revision;s.phase=0;s.resorting=false;}
    if(action==='step'){
      if(s.resorting){s.sortedCamera=s.cameraRevision;s.resorting=false;}
      else if(s.phase<5){s.phase++;if(s.phase===5)s.displayed=s.job;}
    }
    if(action==='camera'){s.cameraRevision++;s.resorting=true;}
    return s;
  }
  var api={blend:blend,composite:composite,cornerShade:cornerShade,bilinear:bilinear,initialPipeline:initialPipeline,pipelineAction:pipelineAction};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MinecraftRender=api;
  if(typeof document==='undefined')return;
  function el(tag,cls,text,parent){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;if(parent)parent.appendChild(n);return n;}
  function mount(id,kicker){var f=document.getElementById(id);if (!f || f.dataset.story === 'true' || f.dataset.figureMounted || f.closest('details:not([open])')) return null; f.dataset.figureMounted = 'true';f.classList.add('mc-render','ready');var b=el('div','mr-body'),h=el('div','mr-head',undefined,b);f.insertBefore(b,f.querySelector('figcaption'));el('span','mr-kicker',kicker,h);var reset=el('button','btn','Reset',h);reset.type='button';return {body:b,reset:reset};}
  function button(parent,label,click){var b=el('button','btn',label,parent);b.type='button';b.addEventListener('click',click);return b;}
  function slider(parent,label,min,max,value,step,change,fmt){var l=el('label','mr-slider',undefined,parent);el('span','',label,l);var i=el('input','',undefined,l);i.type='range';i.min=min;i.max=max;i.step=step;i.value=value;i.setAttribute('aria-label',label);var o=el('output','',fmt?fmt(value):value,l);i.addEventListener('input',function(){o.textContent=fmt?fmt(+i.value):i.value;change(+i.value);});return {set:function(v){i.value=v;o.textContent=fmt?fmt(v):v;},input:i};}
  function tabs(parent,label,options,initial,change){var wrap=el('div','tabs',undefined,parent);wrap.setAttribute('role','group');wrap.setAttribute('aria-label',label);var bs=options.map(function(o){var b=el('button','',o[1],wrap);b.type='button';b.setAttribute('aria-pressed',String(o[0]===initial));b.addEventListener('click',function(){set(o[0]);change(o[0]);});return [o[0],b];});function set(v){bs.forEach(function(b){b[1].setAttribute('aria-pressed',String(b[0]===v));});}return {set:set};}
  function checks(parent,labels,values,change){return labels.map(function(label,i){var l=el('label','mr-check',undefined,parent),n=el('input','',undefined,l);n.type='checkbox';n.checked=values[i];n.setAttribute('aria-label',label);l.append(document.createTextNode(label));n.addEventListener('change',function(){change(i,n.checked);});return n;});}
  function stats(parent,labels){var row=el('div','mr-stats',undefined,parent);return labels.map(function(label){var d=el('div','',undefined,row);el('span','',label,d);return el('strong','',undefined,d);});}
  function note(parent,text){return el('p','mr-note',text,parent);}
  function paint(host,label,render){var wrap=el('div','mr-canvas-wrap',undefined,host),canvas=el('canvas','',undefined,wrap);canvas.setAttribute('role','img');canvas.setAttribute('aria-label',label);var resize=new ResizeObserver(draw);resize.observe(wrap);new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});function draw(){var w=Math.max(260,wrap.clientWidth),h=render.height?render.height(w):Math.max(270,w*.47),ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=w*ratio;canvas.height=h*ratio;canvas.style.height=h+'px';var ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);var css=getComputedStyle(document.documentElement),color=function(k,fallback){return css.getPropertyValue(k).trim()||fallback;};var p={bg:color('--bg','#fff'),ink:color('--fg','#111'),muted:color('--fg-3','#888'),line:color('--line-2','#ddd'),soft:color('--subtle','#f6f6f6'),blue:color('--accent','#2563eb'),dark:document.documentElement.dataset.theme==='dark'};ctx.fillStyle=p.bg;ctx.fillRect(0,0,w,h);ctx.font='11px '+getComputedStyle(document.body).fontFamily;render(ctx,w,h,p);}return {draw:draw,canvas:canvas};}
  function polygon(ctx,points,fill,stroke){ctx.beginPath();points.forEach(function(v,i){if(i)ctx.lineTo(v[0],v[1]);else ctx.moveTo(v[0],v[1]);});ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.7;ctx.stroke();}}
  function line(ctx,a,b,color,dash){ctx.strokeStyle=color;ctx.lineWidth=1;ctx.setLineDash(dash||[]);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();ctx.setLineDash([]);}
  function label(ctx,text,x,y,color,align){ctx.fillStyle=color;ctx.textAlign=align||'left';ctx.fillText(text,x,y);ctx.textAlign='left';}

  function occlusionFigure(){
    var m=mount('mc-occlusion','Light levels and corner shading are different');if(!m)return;
    var occupied=[true,true,false],mode='smooth',light=12,partial=false;
    var ctl=el('div','mr-controls',undefined,m.body),modeTabs=tabs(ctl,'Face shading',[['flat','Flat'],['smooth','Smooth corners']],'smooth',function(v){mode=v;draw();});
    var choices=checks(ctl,['Side A','Side B','Diagonal'],occupied,function(i,v){occupied[i]=v;draw();});
    var shapeCtl=el('div','mr-controls',undefined,m.body),shapes=tabs(shapeCtl,'Face extent',[[false,'Full face'],[true,'Inset face']],false,function(v){partial=v;draw();}),lr=slider(shapeCtl,'Block light',0,15,light,1,function(v){light=v;draw();});
    var canvas=paint(m.body,'An isometric face beside three optional neighboring blocks. Corner shading changes independently of its uniform block-light value.',render);
    var samples=el('div','mr-samples',undefined,m.body),sampleEls=['Side A','Side B','Corner used','Face center'].map(function(name){var d=el('div','mr-sample',undefined,samples);el('span','',name,d);var v=el('b','',undefined,d),bar=el('i','',undefined,d);return [v,bar];});
    var out=stats(m.body,['Stored light','Selected corner shade','Face geometry']),status=el('p','mr-status','',m.body);status.setAttribute('aria-live','polite');
    note(m.body,'Exact full-face four-sample averaging on synthetic shade inputs; inset geometry illustrates further weighting, not the complete shape/light implementation.');
    function values(){var a=occupied[0]?.2:1,b=occupied[1]?.2:1,d=occupied[2]?.2:1;return {a:a,b:b,d:occupied[0]&&occupied[1]?a:d,shade:cornerShade(a,b,d,1,occupied[0],occupied[1])};}
    function draw(){var v=values();[v.a,v.b,v.d,1].forEach(function(n,i){sampleEls[i][0].textContent=n.toFixed(2);sampleEls[i][1].style.width=n*100+'%';});out[0].textContent=light+' / 15';out[1].textContent=(mode==='flat'?1:partial?bilinear([v.shade,(v.b+3)/4,(v.a+3)/4,1],.25,.25):v.shade).toFixed(3);out[2].textContent=partial?'inset ¼–¾':'full square';status.textContent=occupied[0]&&occupied[1]?'Both side tests are closed: the diagonal sample is replaced by Side A before averaging.':'The selected corner averages Side A, Side B, its diagonal, and the face center.';canvas.draw();}
    function render(ctx,w,h,p){var v=values(),scale=Math.min(w*.19,140),cx=w*.5,cy=h*.58;function P(x,y,z){return [cx+(x-z)*scale,cy+(x+z)*scale*.48-y*scale*.9];}var neighbors=[[-1,0],[0,-1],[-1,-1]];function cube(x,z){polygon(ctx,[P(x,0,z),P(x+1,0,z),P(x+1,.7,z),P(x,.7,z)],'#657785',p.bg);polygon(ctx,[P(x,0,z),P(x,0,z+1),P(x,.7,z+1),P(x,.7,z)],'#7c8d96',p.bg);polygon(ctx,[P(x,.7,z),P(x+1,.7,z),P(x+1,.7,z+1),P(x,.7,z+1)],'#a3b1b5',p.bg);}
      for(var gx=-1;gx<=2;gx++)line(ctx,P(gx,0,-1),P(gx,0,2),p.line);for(var gz=-1;gz<=2;gz++)line(ctx,P(-1,0,gz),P(2,0,gz),p.line);
      neighbors.forEach(function(q,i){if(occupied[i])cube(q[0],q[1]);});
      var corners=[v.shade,(v.b+3)/4,(v.a+3)/4,1],lo=partial?.25:0,hi=partial?.75:1,n=96,texture=document.createElement('canvas');texture.width=n;texture.height=n;var tc=texture.getContext('2d'),im=tc.createImageData(n,n),base=p.dark?[168,185,178]:[163,183,172];
      for(var z=0;z<n;z++)for(var x=0;x<n;x++){var u=lerp(lo,hi,(x+.5)/n),vv=lerp(lo,hi,(z+.5)/n),shade=mode==='flat'?1:bilinear(corners,u,vv),brightness=(.20+light/15*.8)*shade,at=(z*n+x)*4;for(var channel=0;channel<3;channel++)im.data[at+channel]=Math.round(base[channel]*brightness);im.data[at+3]=255;}tc.putImageData(im,0,0);var o=P(lo,.015,lo),ux=P(hi,.015,lo),vz=P(lo,.015,hi);ctx.save();ctx.transform((ux[0]-o[0])/n,(ux[1]-o[1])/n,(vz[0]-o[0])/n,(vz[1]-o[1])/n,o[0],o[1]);ctx.drawImage(texture,0,0);ctx.restore();
      var outline=[P(lo,.02,lo),P(hi,.02,lo),P(hi,.02,hi),P(lo,.02,hi)];ctx.beginPath();outline.forEach(function(q,i){i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);});ctx.closePath();ctx.strokeStyle=p.blue;ctx.lineWidth=1.5;ctx.stroke();
      var corner=P(lo,.03,lo);ctx.beginPath();ctx.arc(corner[0],corner[1],5,0,Math.PI*2);ctx.fillStyle='#d39a49';ctx.fill();var ax=clamp(corner[0]+45,65,w-100),ay=corner[1]+34;line(ctx,corner,[ax-6,ay-4],'#c99048');label(ctx,'selected corner',ax,ay,p.ink);label(ctx,'same light field · different vertex shade',w*.5,h-13,p.muted,'center');
      ['A','B','diagonal'].forEach(function(name,i){var q=neighbors[i],pt=P(q[0]+.5,occupied[i]?.82:.03,q[1]+.5);label(ctx,name,pt[0],pt[1]-7,p.ink,'center');});}
    m.reset.addEventListener('click',function(){occupied=[true,true,false];choices.forEach(function(n,i){n.checked=occupied[i];});mode='smooth';partial=false;light=12;modeTabs.set(mode);shapes.set(partial);lr.set(light);draw();});draw();
  }

  function pipelineFigure(){
    var m=mount('mc-render-queue','A changed block does not instantly become a frame');if(!m)return;
    var state=initialPipeline(),ctl=el('div','mr-controls',undefined,m.body),edit=button(ctl,'Edit block',function(){state=pipelineAction(state,'edit');draw();}),step=button(ctl,'Advance work',function(){state=pipelineAction(state,'step');draw();}),cameraButton=button(ctl,'Move camera',function(){state=pipelineAction(state,'camera');draw();});
    var canvas=paint(m.body,'The current block-state revision beside the older displayed mesh. Advance compilation and GPU work to bring the displayed image up to date.',render),stages=el('div','mr-pipeline',undefined,m.body),phaseNames=['Queued','Compile','CPU mesh','Staged','GPU upload','Displayed'],ps=phaseNames.map(function(name,i){var d=el('div','mr-phase',undefined,stages);el('b','',String(i+1).padStart(2,'0'),d);el('span','',name,d);return d;});
    var memory=el('div','mr-memory',undefined,m.body);el('span','','Builder pool',memory);var packs=[el('i','mr-buffer',undefined,memory),el('i','mr-buffer',undefined,memory)],poolText=el('span','','',memory);
    var out=stats(m.body,['World revision','Displayed revision','Canceled jobs']),status=el('p','mr-status','',m.body);status.setAttribute('aria-live','polite');
    note(m.body,'Illustrative work ordering and two-pack pool; source paths separate cancellable compilation, staged uploads, buffer reuse, and transparency resort.');
    function draw(){ps.forEach(function(n,i){n.className='mr-phase'+(i===state.phase?' current':i<state.phase?' done':'');});var leased=state.phase===1||state.phase===2;packs[0].classList.toggle('busy',leased);poolText.textContent=leased?'1 free · 1 leased':'2 free';out[0].textContent='r'+state.revision;out[1].textContent='r'+state.displayed;out[2].textContent=state.cancelled;
      step.disabled=state.phase===5&&!state.resorting;step.textContent=state.resorting?'Resort transparency':'Advance work';status.textContent=state.resorting?'Camera changed: reorder translucent indices. The block data and opaque geometry stay the same.':state.phase===5?'The new GPU data is visible. Edit again to invalidate this derived mesh.':['New block state is ready; a section build is queued.','A builder pack is leased while section models are compiled.','CPU geometry is ready. Its existence does not prove it is on the GPU.','Mesh bytes are staged; the builder pack can return to the pool.','The upload is represented separately from compilation.'][state.phase];canvas.draw();}
    function render(ctx,w,h,p){var compact=w<500,two=w>480,sceneW=two?w*.43:w*.68,scale=Math.min(sceneW/10,40),origins=two?[[w*.24,h*.46],[w*.74,h*.46]]:[[w*.47,h*.29],[w*.47,h*.73]];function P(x,y,z,origin){return [origin[0]+(x-z)*scale,origin[1]+(x+z)*scale*.4-y*scale*.85];}
      function scene(rev,origin,title){var blocks=[];for(var z=0;z<4;z++)for(var x=0;x<5;x++)for(var y=0;y<2;y++){if(y===1&&x===2&&z===1&&rev%2===0)continue;blocks.push([x,y,z]);}blocks.sort(function(a,b){return a[0]+a[2]-b[0]-b[2]||a[1]-b[1];});blocks.forEach(function(q){var x=q[0],y=q[1],z=q[2],special=x===2&&z===1&&y===1;polygon(ctx,[P(x,y,z+1,origin),P(x+1,y,z+1,origin),P(x+1,y+1,z+1,origin),P(x,y+1,z+1,origin)],special?'#c69757':'#71838b',p.bg);polygon(ctx,[P(x+1,y,z,origin),P(x+1,y,z+1,origin),P(x+1,y+1,z+1,origin),P(x+1,y+1,z,origin)],special?'#a4773f':'#60737d',p.bg);polygon(ctx,[P(x,y+1,z,origin),P(x+1,y+1,z,origin),P(x+1,y+1,z+1,origin),P(x,y+1,z+1,origin)],special?'#dfb674':'#a6b8b0',p.bg);});label(ctx,title,origin[0],origin[1]-scale*2.3,p.muted,'center');label(ctx,'revision '+rev,origin[0],origin[1]+scale*4.1,p.ink,'center');}
      scene(state.revision,origins[0],'BLOCK STATE');scene(state.displayed,origins[1],'DISPLAYED MESH');if(state.resorting){ctx.strokeStyle=p.blue;ctx.setLineDash([3,4]);ctx.strokeRect(10,10,w-20,h-20);ctx.setLineDash([]);label(ctx,'camera changed · sort indices',w*.5,h-8,p.blue,'center');}}
    render.height=function(w){return w<500?420:320;};m.reset.addEventListener('click',function(){state=initialPipeline();draw();});draw();
  }

  function transparencyFigure(){
    var m=mount('mc-transparency','Same geometry, different draw order');if(!m)return;
    var angle=25,alpha=.55,correct=true,ctl=el('div','mr-controls',undefined,m.body),ar=slider(ctl,'Camera orbit',-160,160,angle,1,function(v){angle=v;draw();},function(v){return v+'°';}),br=slider(ctl,'Pane opacity',.1,.9,alpha,.05,function(v){alpha=v;draw();},function(v){return v.toFixed(2);}),modes=tabs(ctl,'Transparency ordering',[[true,'Back to front'],[false,'Reverse order']],true,function(v){correct=v;draw();});
    var canvas=paint(m.body,'Two translucent colored panes and an opaque marker, viewed as the camera rotates. Compare back-to-front alpha compositing with the reversed order.',render),order=el('div','mr-order',undefined,m.body),out=stats(m.body,['Farther pane','Overlap color','Block data']),eq=el('p','mr-equation','',m.body);note(m.body,'Standard source-over blending on original parallel panes; Minecraft’s quad sorting is more complex, but camera movement can reorder indices without changing blocks.');
    function state(){var rad=angle*Math.PI/180,c=Math.cos(rad),far=c>=0?'A':'B',near=far==='A'?'B':'A',ids=correct?[far,near]:[near,far],colors={A:[70,135,174],B:[211,156,79]},backgroundHex=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),bg=/^#[0-9a-f]{6}$/i.test(backgroundHex)?[1,3,5].map(function(i){return parseInt(backgroundHex.slice(i,i+2),16);}):document.documentElement.dataset.theme==='dark'?[14,14,15]:[255,255,255],rgb=composite(ids.map(function(id){return {color:colors[id],alpha:alpha};}),bg);return {rad:rad,far:far,near:near,ids:ids,colors:colors,bg:bg,rgb:rgb};}
    function draw(){var st=state();order.replaceChildren();el('span','','draw →',order);el('b','','opaque',order).style.setProperty('--swatch','var(--fg-3)');st.ids.forEach(function(id){el('span','','→',order);var b=el('b','','pane '+id,order);b.style.setProperty('--swatch',id==='A'?'var(--mr-blue)':'var(--mr-amber)');});out[0].textContent='Pane '+st.far;out[1].textContent='#'+st.rgb.map(function(v){return Math.round(v).toString(16).padStart(2,'0');}).join('');out[2].textContent='unchanged';eq.textContent='Cout = α × Cforeground + (1 − α) × Cbackground';canvas.draw();}
    function render(ctx,w,h,p){var st=state(),compact=w<500,side=compact?w*.75:w*.48,cx=compact?w*.5:w*.68,cy=compact?h*.78:h*.72,scale=Math.min(side/3.4,125),sin=Math.sin(st.rad),cos=Math.cos(st.rad);function P(x,y,z){return [cx+(x*cos-z*sin)*scale,cy-y*scale+(.20*x*sin+.20*z*cos)*scale];}
      var floor=[P(-1.65,0,-1.4),P(1.65,0,-1.4),P(1.65,0,1.4),P(-1.65,0,1.4)];polygon(ctx,floor,p.soft,p.line);
      // The marker is an opaque reference behind the planes. The pane-only
      // overlap color readout uses the flat background, not this marker.
      function marker(){polygon(ctx,[P(.35,0,-1.2),P(.72,0,-1.2),P(.72,1.25,-1.2),P(.35,1.25,-1.2)],p.dark?'#9ca6a8':'#6e7a7d',p.bg);}if(cos>=0)marker();
      st.ids.forEach(function(id){var z=id==='A'?-.5:.5,pts=[P(-1,0,z),P(1,0,z),P(1,1.65,z),P(-1,1.65,z)],rgb=st.colors[id];polygon(ctx,pts,'rgba('+rgb.join(',')+','+alpha+')','rgb('+rgb.join(',')+')');var top=P(id==='A'?-.85:.85,1.77,z);label(ctx,'pane '+id,top[0],top[1],p.ink,'center');});if(cos<0)marker();
      var ix=compact?w*.21:w*.19,iy=compact?52:h*.5,r=compact?31:65;ctx.strokeStyle=p.line;ctx.beginPath();ctx.ellipse(ix,iy,r,r*.62,0,0,Math.PI*2);ctx.stroke();var eye=[ix+Math.sin(st.rad)*r,iy+Math.cos(st.rad)*r*.62];line(ctx,[ix,iy],eye,p.blue);ctx.beginPath();ctx.arc(eye[0],eye[1],5,0,Math.PI*2);ctx.fillStyle=p.blue;ctx.fill();label(ctx,'camera',eye[0],eye[1]+18,p.muted,'center');['A','B'].forEach(function(id){var z=id==='A'?-.5:.5;line(ctx,[ix-r*.55,iy+z*r*.7],[ix+r*.55,iy+z*r*.7],id==='A'?'#497faa':'#c99048');label(ctx,id,ix+r*.7,iy+z*r*.7+4,p.ink);});if(!correct)label(ctx,'same quads · reversed blend',cx,h-14,'#c99048','center');}
    render.height=function(w){return w<500?300:350;};
    new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});m.reset.addEventListener('click',function(){angle=25;alpha=.55;correct=true;ar.set(angle);br.set(alpha);modes.set(true);draw();});draw();
  }
  function init(){occlusionFigure();pipelineFigure();transparencyFigure();}
  document.addEventListener('minecraft:notebook-open', init);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
