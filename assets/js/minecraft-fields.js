/* Source-backed mathematical subsets with explicitly synthetic spatial inputs.
 * No Minecraft assets. See the methods appendix for each figure's boundary. */
(function (root) {
  'use strict';
  var NAMES = ['Temperature','Humidity','Continentalness','Erosion','Depth','Weirdness'];
  var REGIONS = [
    {name:'Lowland', color:'#789b91', ranges:[[-.3,.6],[-.6,.5],[-.3,.6],[.1,1],[-.2,.3],[-.4,.4]], offset:.04},
    {name:'Cold ridge', color:'#789eb8', ranges:[[-1,-.3],[-.6,.5],[.1,1],[-1,-.2],[-.2,.3],[-.6,.6]], offset:.02},
    {name:'Wet basin', color:'#729fbc', ranges:[[-.1,1],[.4,1],[-1,.1],[.2,1],[-.2,.3],[-.4,.4]], offset:.03},
    {name:'Deep cave', color:'#a18bb5', ranges:[[-1,1],[-1,1],[-1,1],[-1,1],[-1,-.45],[-1,1]], offset:.13},
    {name:'Strange plateau', color:'#c29b67', ranges:[[-.1,.9],[-.7,.5],[.4,1],[-.8,.2],[-.1,.5],[.55,1]], offset:.03}
  ];
  function clamp(v,a,b) { return Math.max(a,Math.min(b,v)); }
  function quantize(v) { return Math.trunc(v*10000); }
  function intervalDistance(value, interval) { return value<interval[0]?interval[0]-value:value>interval[1]?value-interval[1]:0; }
  function climateFitness(point, region) {
    var sum=quantize(region.offset)*quantize(region.offset);
    for(var i=0;i<6;i++){var d=intervalDistance(quantize(point[i]),region.ranges[i].map(quantize));sum+=d*d;}
    return sum;
  }
  function biomeAt(point, regions) {
    regions=regions||REGIONS; var winner=0,best=Infinity,scores=[];
    regions.forEach(function(r,i){var score=climateFitness(point,r);scores.push(score);if(score<best){best=score;winner=i;}});
    return {index:winner,name:regions[winner].name,score:best,scores:scores};
  }
  function globalSubstance(y,density,seaLevel) {
    if(density>0)return 'stone';
    return y<Math.min(-54,seaLevel)?'lava':y<seaLevel?'water':'air';
  }
  function densityIndex(x,y,z,sx,sy) { return y+(x+z*sx)*sy; }
  function skyField(width,height,roofY,openingCenter,openingWidth) {
    var solid=new Uint8Array(width*height),direct=new Uint8Array(width*height),light=new Uint8Array(width*height),lowest=new Int16Array(width),queue=[];
    var start=Math.floor(openingCenter-openingWidth/2);
    for(var x=0;x<width;x++) {
      var roof=!(x>=start&&x<start+openingWidth);
      if(roof)solid[roofY*width+x]=1;
      lowest[x]=roof?roofY+1:0;
      for(var y=height-1;y>=0;y--){if(solid[y*width+x])break;var i=y*width+x;direct[i]=15;light[i]=15;queue.push(i);}
    }
    for(var head=0;head<queue.length;head++) {
      var i=queue[head],v=light[i],xx=i%width,yy=Math.floor(i/width);
      if(v<=1)continue;
      [[xx-1,yy],[xx+1,yy],[xx,yy-1],[xx,yy+1]].forEach(function(p){if(p[0]<0||p[0]>=width||p[1]<0||p[1]>=height)return;var j=p[1]*width+p[0];if(!solid[j]&&light[j]<v-1){light[j]=v-1;queue.push(j);}});
    }
    return {solid:solid,direct:direct,light:light,lowest:lowest};
  }
  var api={climateFitness:climateFitness,intervalDistance:intervalDistance,biomeAt:biomeAt,regions:REGIONS,globalSubstance:globalSubstance,densityIndex:densityIndex,skyField:skyField};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MinecraftFields=api;
  if(typeof document==='undefined')return;
  var NS='http://www.w3.org/2000/svg',redraws=[];
  function el(tag,cls,text,parent){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;if(parent)parent.appendChild(n);return n;}
  function svg(tag,attrs,parent){var n=document.createElementNS(NS,tag);Object.keys(attrs||{}).forEach(function(k){n.setAttribute(k,attrs[k]);});if(parent)parent.appendChild(n);return n;}
  function text(parent,x,y,t,cls,anchor){var n=svg('text',{x:x,y:y,'class':cls||'','text-anchor':anchor||'start'},parent);n.textContent=t;return n;}
  function line(parent,x1,y1,x2,y2,cls){return svg('line',{x1:x1,y1:y1,x2:x2,y2:y2,'class':cls||'mf-edge'},parent);}
  function mount(id,title){var fig=document.getElementById(id);if (!fig || fig.dataset.story === 'true' || fig.dataset.figureMounted || fig.closest('details:not([open])')) return null; fig.dataset.figureMounted = 'true';fig.classList.add('mc-fields','ready');var b=el('div','mf-body');fig.insertBefore(b,fig.querySelector('figcaption'));var h=el('div','mf-head',undefined,b);el('span','mf-kicker',title,h);var reset=el('button','btn','Reset',h);reset.type='button';return {body:b,reset:reset};}
  function tabs(parent,label,options,value,change){var group=el('div','tabs',undefined,parent);group.setAttribute('role','group');group.setAttribute('aria-label',label);var buttons=options.map(function(o){var b=el('button','',o[1],group);b.type='button';b.setAttribute('aria-pressed',String(o[0]===value));b.addEventListener('click',function(){set(o[0]);change(o[0]);});return [o[0],b];});function set(v){buttons.forEach(function(b){b[1].setAttribute('aria-pressed',String(b[0]===v));});}return {set:set};}
  function slider(parent,label,min,max,step,value,change,format){var l=el('label','mf-slider',undefined,parent);el('span','',label,l);var o=el('output','',format?format(value):value,l),i=el('input','',undefined,l);i.type='range';i.min=min;i.max=max;i.step=step;i.value=value;i.setAttribute('aria-label',label);i.addEventListener('input',function(){o.value=format?format(+i.value):i.value;change(+i.value);});return {input:i,set:function(v){i.value=v;o.value=format?format(v):v;}};}
  function stats(parent,names){var row=el('div','mf-stats',undefined,parent);return names.map(function(name){var d=el('div','mf-stat',undefined,row);el('span','',name,d);return el('strong','',undefined,d);});}
  function note(parent,t){return el('p','mf-note',t,parent);}
  function css(n,node){return getComputedStyle(node||document.documentElement).getPropertyValue(n).trim();}
  function canvas(parent,label){var c=el('canvas','mf-canvas',undefined,parent);c.setAttribute('role','img');c.setAttribute('aria-label',label);return c;}
  function prepare(c,w,h){var dpr=Math.min(devicePixelRatio||1,2);c.width=w*dpr;c.height=h*dpr;c.style.height=h+'px';var ctx=c.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);ctx.font='12px '+getComputedStyle(document.body).fontFamily;return ctx;}
  function resize(b,draw){redraws.push(draw);new ResizeObserver(draw).observe(b);}
  function legend(parent,items){var key=el('div','mf-legend',undefined,parent);items.forEach(function(a){var n=el('span','',undefined,key),i=el('i','',undefined,n);i.style.setProperty('--mf-color',a[0]);n.appendChild(document.createTextNode(a[1]));});return key;}

  function biomesFigure(){
    var m=mount('mc-biomes','Six coordinates choose a biome');if(!m)return;
    var point=[.15,.1,.3,.4,0,0],stage=el('div','mf-stage',undefined,m.body),c=canvas(stage,'Synthetic climate regions; drag the sample or use six sliders to inspect interval-distance fitness.'),ranking=el('div','mf-ranking',undefined,m.body);
    var ranks=REGIONS.map(function(r){var d=el('div','mf-rank',undefined,ranking);d.style.setProperty('--mf-region',r.color);el('strong','',r.name,d);return {el:d,score:el('span','',undefined,d)};});
    var six=el('div','mf-six',undefined,m.body),sliders=NAMES.map(function(n,i){return slider(six,n,-1,1,.01,point[i],function(v){point[i]=v;draw();},function(v){return v.toFixed(2);});});
    var output=stats(m.body,['Selected region','Fitness · normalized','Dimensions tested']);
    note(m.body,'Exact six-interval squared-distance rule on synthetic parameter regions; the game searches its real entries with an R-tree.');
    function draw(){var w=m.body.clientWidth||700,h=w<500?310:360,ctx=prepare(c,w,h),left=39,top=18,pw=w-left-17,ph=h-48,n=64;
      for(var yy=0;yy<n;yy++)for(var xx=0;xx<n;xx++){var q=point.slice();q[0]=-1+(xx+.5)/n*2;q[1]=1-(yy+.5)/n*2;var winner=biomeAt(q).index;ctx.fillStyle=REGIONS[winner].color;ctx.globalAlpha=.24;ctx.fillRect(left+xx*pw/n,top+yy*ph/n,pw/n+.4,ph/n+.4);}ctx.globalAlpha=1;
      REGIONS.forEach(function(r,i){if(i===3)return;var a=r.ranges[0],b=r.ranges[1];ctx.strokeStyle=r.color;ctx.lineWidth=1.3;ctx.strokeRect(left+(a[0]+1)/2*pw,top+(1-b[1])/2*ph,(a[1]-a[0])/2*pw,(b[1]-b[0])/2*ph);});
      ctx.fillStyle=css('--fg-3');ctx.font='11px '+getComputedStyle(document.body).fontFamily;ctx.fillText('humidity',left,11);ctx.fillText('−1',left-10,h-12);ctx.fillText('+1',left+pw-15,h-12);ctx.fillText('temperature →',Math.max(left+45,left+pw/2-35),h-12);ctx.fillText('+1',7,top+8);ctx.fillText('−1',7,top+ph);
      var sx=left+(point[0]+1)/2*pw,sy=top+(1-point[1])/2*ph;ctx.setLineDash([3,4]);ctx.strokeStyle=css('--fg-3');ctx.beginPath();ctx.moveTo(sx,top);ctx.lineTo(sx,top+ph);ctx.moveTo(left,sy);ctx.lineTo(left+pw,sy);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(sx,sy,6,0,Math.PI*2);ctx.fillStyle=css('--bg');ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle=css('--accent');ctx.stroke();
      var result=biomeAt(point);ranks.forEach(function(r,i){r.el.classList.toggle('active',i===result.index);r.score.textContent=(result.scores[i]/1e8).toFixed(3);});output[0].textContent=result.name;output[1].textContent=(result.score/1e8).toFixed(4);output[2].textContent='6 + offset';}
    function aim(e){var r=c.getBoundingClientRect(),h=r.height;point[0]=clamp((e.clientX-r.left-39)/(r.width-56)*2-1,-1,1);point[1]=clamp(1-(e.clientY-r.top-18)/(h-48)*2,-1,1);sliders[0].set(point[0]);sliders[1].set(point[1]);draw();}
    c.addEventListener('pointerdown',function(e){c.setPointerCapture(e.pointerId);aim(e);});c.addEventListener('pointermove',function(e){if(e.buttons)aim(e);});m.reset.addEventListener('click',function(){point=[.15,.1,.3,.4,0,0];sliders.forEach(function(s,i){s.set(point[i]);});draw();});resize(m.body,draw);draw();
  }

  function samplersFigure(){
    var m=mount('mc-samplers','A resource graph becomes sampled values');if(!m)return;
    var mode='resource',selected=4,index=29;var ctl=el('div','mf-controls',undefined,m.body),view=tabs(ctl,'Density implementation view',[['resource','Resource graph'],['compiler','Compile samplers'],['buffer','Volume buffer']],mode,function(v){mode=v;selected=v==='resource'?4:0;draw();});
    var graph=svg('svg',{'class':'mf-svg',role:'group','aria-label':'Density expression graph, sampler rewrite operations, or float-buffer layout.'},m.body),detail=el('div','mf-detail',undefined,m.body),strip=el('div','mf-byte-strip',undefined,m.body),control=el('div','mf-controls',undefined,m.body),cursor=slider(control,'Sample index',0,63,1,index,function(v){index=v;draw();});
    var out=stats(m.body,['Selected operation','Input representation','Output representation']);
    var details=[
      ['Terrain + caves','Named references supply sloped terrain, entrances, spaghetti, pillars, and vertical gradients.'],
      ['Blend density','This branch can blend new terrain with existing terrain context.'],
      ['Multiply by 0.64','The constant scales this branch before interpolation.'],
      ['Interpolate','The resource declares 4 × 8 × 4 cells; eight corners supply interior samples.'],
      ['Squeeze','After interpolation: clamp c to [−1,1], then c/2 − c³/24.'],
      ['Minimum with noodles','Noodle-cave density joins outside the interpolated branch.'],
      ['Add beardifier','The structure-related term is added after the minimum.']
    ];
    var compiler=[['Resolve references','Inline the referenced function graph before sampler creation.'],['Prepare shared caches','Reuse prepared caches for matching density inputs.'],['Slice uniform axes','Rewrite functions whose result is uniform along particular axes.'],['Create sampler objects','Compile the optimized graph into reusable density samplers.'],['Bind context + buffers','Bind seed, blending, structures, and pooled float-buffer context.']];
    note(m.body,'Expression order and memory indexing come from 26.3; the displayed 4³ buffer is a miniature illustration.');
    function button(x,y,w,h,label,i,active){var g=svg('g',{role:'button',tabindex:0,'aria-label':label,'aria-pressed':String(active)},graph);svg('rect',{x:x,y:y,width:w,height:h,rx:4,'class':'mf-node'+(active?' selected':'')},g);text(g,x+w/2,y+h/2+4,label,active?'mf-selected-text':'','middle');function choose(){selected=i;draw();var next=graph.querySelector('[aria-pressed="true"]');if(next&&next.focus)next.focus();}g.addEventListener('click',choose);g.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});}
    function draw(){while(graph.firstChild)graph.removeChild(graph.firstChild);strip.replaceChildren();var w=Math.max(280,m.body.clientWidth||700),compact=w<500;cursor.input.parentNode.style.display=mode==='buffer'?'grid':'none';strip.style.display=mode==='buffer'?'grid':'none';
      if(mode==='resource'){var h=compact?402:398;graph.setAttribute('viewBox','0 0 '+w+' '+h);var cx=w*.43,nw=compact?155:205,nx=cx-nw/2,ys=[15,65,115,165,215,275,335],labels=['Terrain + caves','blend_density','× 0.64','interpolated · 4 × 8 × 4','squeeze','min','+ beardifier'];
        for(var i=0;i<6;i++)line(graph,cx,ys[i]+34,cx,ys[i+1],i<selected?'mf-active-edge':'mf-edge');
        labels.forEach(function(l,i){button(nx,ys[i],nw,34,l,i,selected===i);});var bx=compact?w-57:w-100;line(graph,bx,292,cx+nw/2,292,selected>=5?'mf-active-edge':'mf-edge');text(graph,bx,276,'noodle','mf-small','middle');text(graph,cx,390,'final density D','mf-small','middle');detail.innerHTML='';var strong=el('strong','',details[selected][0]+'. ',detail);detail.appendChild(document.createTextNode(details[selected][1]));out[0].textContent=details[selected][0];out[1].textContent='registry functions';out[2].textContent='density graph';
      }else if(mode==='compiler'){graph.setAttribute('viewBox','0 0 '+w+' 350');var bw=Math.min(290,w-32),left=(w-bw)/2;compiler.forEach(function(item,i){if(i)line(graph,w/2,12+(i-1)*62+38,w/2,12+i*62,i<=selected?'mf-active-edge':'mf-edge');button(left,12+i*62,bw,38,item[0],i,selected===i);});detail.innerHTML='';el('strong','',compiler[selected][0]+'. ',detail);detail.appendChild(document.createTextNode(compiler[selected][1]));out[0].textContent='rewrite '+(selected+1)+' / 5';out[1].textContent='function graph';out[2].textContent='sampler objects';
      }else {graph.setAttribute('viewBox','0 0 '+w+' 275');var size=Math.min(32,(w-60)/12),ox=w/2-3*size,oy=210;function project(x,y,z){return [ox+(x-z)*size*.75,y*-size+(x+z)*size*.26+oy];}var x=Math.floor(index/4)%4,y=index%4,z=Math.floor(index/16);for(var zz=0;zz<4;zz++)for(var xx=0;xx<4;xx++)for(var yy=0;yy<4;yy++){var p=project(xx,yy,zz),hit=xx===x&&yy===y&&zz===z;svg('circle',{cx:p[0],cy:p[1],r:hit?6:2.8,fill:hit?'var(--accent)':'var(--line-2)'},graph);}var p=project(x,y,z);text(graph,p[0]+13,p[1]-9,'('+x+', '+y+', '+z+')','mf-selected-text');text(graph,w/2,258,'index = y + (x + z × 4) × 4','mf-small','middle');for(var k=0;k<64;k++){var cell=el('span',k===index?'active':'',k,strip);cell.title='density buffer index '+k;}detail.textContent='Y is contiguous in a density volume. Block-state sections use a different layout: x changes fastest.';out[0].textContent='float['+index+']';out[1].textContent='4 × 4 × 4 samples';out[2].textContent='y → x → z';}
    }
    m.reset.addEventListener('click',function(){mode='resource';selected=4;index=29;cursor.set(index);view.set(mode);draw();});resize(m.body,draw);draw();
  }

  function aquiferFigure(){
    var m=mount('mc-aquifer','Negative density still needs a substance');if(!m)return;
    var mode='substance',sea=63,y=36,density=-.25;var controls=el('div','mf-controls',undefined,m.body),view=tabs(controls,'Substance view',[['substance','Substance'],['density','Density sign']],mode,function(v){mode=v;draw();});var c=canvas(m.body,'Synthetic vertical cave through the exact global-fluid-picker subset: air above sea level, water below it, lava below minus 54, and stone for positive density.');
    var substanceKey=legend(m.body,[['var(--mf-stone)','Stone'],['var(--mf-water)','Water'],['var(--mf-lava)','Lava'],['var(--subtle)','Air']]);
    var sliders=el('div','mf-controls',undefined,m.body),sr=slider(sliders,'Sea level',0,90,1,sea,function(v){sea=v;draw();}),yr=slider(sliders,'Sample y',-64,99,1,y,function(v){y=v;draw();}),dr=slider(sliders,'Cave density',-1,1,.05,density,function(v){density=v;draw();},function(v){return v.toFixed(2);});var out=stats(m.body,['Density decision','Global fluid test','Chosen state']);
    var branches=el('div','mf-branch',undefined,m.body);[['1 · Density','D > 0 requests default solid.'],['2 · Global picker','For D ≤ 0, compare y with fluid levels.'],['3 · Full aquifer','Adds local centers and pressure barriers.']].forEach(function(a){var d=el('div','',undefined,branches);el('strong','',a[0],d);d.appendChild(document.createTextNode(a[1]));});
    note(m.body,'Exact aquifers-disabled/global-picker subset on a synthetic cave; vanilla local aquifer pressure is outside this model.');
    function draw(){substanceKey.style.display=mode==='density'?'none':'flex';var w=m.body.clientWidth||700,h=w<500?330:360,ctx=prepare(c,w,h),left=37,top=15,pw=w-left-10,ph=h-36,nx=54,ny=82,ch=ph/ny,cw=pw/nx;
      for(var iy=0;iy<ny;iy++)for(var x=0;x<nx;x++){var wy=99-iy*2,center=27+4*Math.sin(wy*.065),hole=Math.abs(x-center)<8+2*Math.cos(wy*.12),d=hole?density:.8,kind=globalSubstance(wy,d,sea);ctx.fillStyle=mode==='density'?(d>0?'#a7b2ae':'#9abbd0'):kind==='stone'?css('--mf-stone',m.body):kind==='water'?css('--mf-water',m.body):kind==='lava'?css('--mf-lava',m.body):css('--subtle');ctx.fillRect(left+x*cw,top+iy*ch,cw+.3,ch+.3);}
      function sy(v){return top+(99-v)/164*ph;}ctx.fillStyle=css('--fg-3');ctx.font='11px '+getComputedStyle(document.body).fontFamily;[99,63,0,-54,-64].forEach(function(v){ctx.fillText(String(v),v<0?4:11,clamp(sy(v)+4,10,h-4));});ctx.setLineDash([4,4]);ctx.strokeStyle=css('--bg');ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,sy(sea));ctx.lineTo(left+pw,sy(sea));ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle=css('--fg');ctx.beginPath();ctx.moveTo(left,sy(y));ctx.lineTo(left+pw,sy(y));ctx.stroke();var sx=left+(27+4*Math.sin(y*.065))*cw;ctx.beginPath();ctx.arc(sx,sy(y),5,0,Math.PI*2);ctx.fillStyle=css('--bg');ctx.fill();ctx.stroke();var kind=globalSubstance(y,density,sea);out[0].textContent=density>0?'D > 0 · solid':'D ≤ 0 · query fluid';out[1].textContent=y<Math.min(-54,sea)?'y < −54':y<sea?'y < '+sea:'y ≥ '+sea;out[2].textContent=kind;Array.from(branches.children).forEach(function(n,i){n.classList.toggle('active',i===(density>0?0:1));});}
    m.reset.addEventListener('click',function(){mode='substance';sea=63;y=36;density=-.25;view.set(mode);sr.set(sea);yr.set(y);dr.set(density);draw();});resize(m.body,draw);draw();
  }

  function skylightFigure(){
    var m=mount('mc-skylight','The open sky is a column of sources');if(!m)return;
    var mode='combined',opening=3,center=12,column=12,numbers=false,width=25,height=17,roofY=11;var controls=el('div','mf-controls',undefined,m.body),view=tabs(controls,'Sky light display',[['combined','Sky field'],['direct','Direct sources'],['spread','Sideways light']],mode,function(v){mode=v;draw();});var label=el('label','check',undefined,controls),check=el('input','',undefined,label);check.type='checkbox';label.appendChild(document.createTextNode('Values'));check.addEventListener('change',function(){numbers=check.checked;draw();});var c=canvas(m.body,'Roof slice with direct sky columns at level 15, a movable opening, and attenuated lateral light beneath the roof.');
    var ctl=el('div','mf-controls',undefined,m.body),op=slider(ctl,'Roof opening',0,11,1,opening,function(v){opening=v;draw();}),cp=slider(ctl,'Opening center',5,19,1,center,function(v){center=v;draw();}),xp=slider(ctl,'Inspect column',0,24,1,column,function(v){column=v;draw();});var out=stats(m.body,['Lowest source y','Direct below roof','Cell at y = 4']);
    note(m.body,'Two-dimensional full-cube model: direct sky cells stay at 15; indirect light attenuates, with no real shape/storage-border optimizations.');
    function draw(){var w=m.body.clientWidth||700,h=w<500?290:350,ctx=prepare(c,w,h),left=28,top=17,cellW=(w-left-10)/width,cellH=(h-45)/height,result=skyField(width,height,roofY,center,opening);
      for(var y=0;y<height;y++)for(var x=0;x<width;x++){var i=y*width+x,yy=top+(height-1-y)*cellH,v=result.light[i],isSource=result.direct[i]>0;if(result.solid[i])ctx.fillStyle=css('--mf-stone',m.body);else if(mode==='direct')ctx.fillStyle=isSource?'#a8c9df':css('--subtle');else if(mode==='spread')ctx.fillStyle=isSource?css('--subtle'):'hsl(209 38% '+(15+v*4)+'%)';else ctx.fillStyle='hsl(209 38% '+(15+v*4)+'%)';ctx.fillRect(left+x*cellW,yy,cellW-.7,cellH-.7);if(numbers&&!result.solid[i]&&(w>500||x%2===0)){ctx.fillStyle=v>8?'#27424f':'#c8dbe3';ctx.font=(w<500?'8px':'10px')+' '+getComputedStyle(document.body).fontFamily;ctx.textAlign='center';ctx.fillText(mode==='direct'?String(result.direct[i]):String(v),left+(x+.5)*cellW,yy+cellH*.67);}}
      ctx.textAlign='left';ctx.fillStyle=css('--fg-3');ctx.font='11px '+getComputedStyle(document.body).fontFamily;ctx.fillText('y',7,12);ctx.fillText('16',3,top+10);ctx.fillText('0',10,h-27);ctx.fillText('roof · y = 11',left,h-5);ctx.fillText('column '+column,Math.max(left+130,w-90),h-5);ctx.strokeStyle=css('--accent');ctx.lineWidth=2;ctx.strokeRect(left+column*cellW-1,top-1,cellW+1,cellH*height+1);var low=result.lowest[column];out[0].textContent=String(low);out[1].textContent=low===0?'15 through column':'blocked by roof';out[2].textContent=result.light[4*width+column]+' / 15';}
    m.reset.addEventListener('click',function(){mode='combined';opening=3;center=12;column=12;numbers=false;check.checked=false;view.set(mode);op.set(opening);cp.set(center);xp.set(column);draw();});resize(m.body,draw);draw();
  }
  new MutationObserver(function(){redraws.forEach(function(f){f();});}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  function init(){biomesFigure();samplersFigure();aquiferFigure();skylightFigure();}
  document.addEventListener('minecraft:notebook-open', init);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
