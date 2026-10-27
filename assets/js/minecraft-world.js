/* Original teaching scenes for the Minecraft article. No game assets.
   Orthographic software renderer; voxel models are illustrations, not worldgen ports. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var TAU = Math.PI * 2;
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function svg(tag, attrs, parent) { var n = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); }); if (parent) parent.appendChild(n); return n; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function mount(id) { var fig = document.getElementById(id); if (!fig || fig.dataset.story === 'true' || fig.dataset.figureMounted || fig.closest('details:not([open])')) return null; fig.dataset.figureMounted = 'true'; fig.dataset.spatialReady = 'true'; fig.classList.add('mc-world', 'ready'); var body = el('div', 'mc-spatial'); fig.insertBefore(body, fig.querySelector('figcaption')); return body; }
  function slider(label, lo, hi, step, initial, format, change) { var wrap = el('label', 'mc-spatial-slider'); var name = el('span', '', label), input = el('input'), out = el('output'); input.type = 'range'; input.min = lo; input.max = hi; input.step = step; input.value = initial; out.textContent = format(initial); wrap.append(name, input, out); input.addEventListener('input', function () { out.textContent = format(+input.value); change(+input.value); }); return { el: wrap, input: input, output: out, set:function(v){input.value=v;out.textContent=format(v);} }; }
  function tabs(label, choices, initial, change) { var wrap = el('div', 'tabs'); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', label); wrap.set=function(value){wrap.querySelectorAll('button').forEach(function(v){v.setAttribute('aria-pressed',String(v.dataset.value===value));});}; choices.forEach(function (o) { var b = el('button', '', o[1]); b.type = 'button'; b.dataset.value = o[0]; b.setAttribute('aria-pressed', String(o[0] === initial)); b.addEventListener('click', function () { wrap.set(o[0]); change(o[0]); }); wrap.appendChild(b); }); return wrap; }
  function button(label, change) { var b = el('button', 'btn', label); b.type = 'button'; b.addEventListener('click', change); return b; }
  function palette() { var css = getComputedStyle(document.documentElement), dark = document.documentElement.dataset.theme === 'dark'; return { bg: css.getPropertyValue('--bg').trim() || '#fff', ink: css.getPropertyValue('--fg').trim() || '#111', muted: css.getPropertyValue('--fg-2').trim() || '#555', line: css.getPropertyValue('--line-2').trim() || '#ddd', blue: dark ? '#86b1ff' : '#2563eb', amber: dark ? '#ffc068' : '#cc862f', dark: dark }; }
  var MATERIALS = {
    1: ['#a9b1b7', '#77848f', '#89959e'], 2: ['#b59e83', '#8e7963', '#a08a70'],
    3: ['#8ba995', '#688676', '#759682'], 4: ['#83b4c5', '#5e96ad', '#6da6bc'],
    5: ['#b49a77', '#857355', '#9a8565'], 6: ['#6e9985', '#47715e', '#588770'],
    7: ['#ffd08a', '#cc8e3d', '#e7ac59']
  };
  function volume(w, h, d) { var a = new Uint8Array(w * h * d); return { w: w, h: h, d: d, data: a, get: function (x, y, z) { return x < 0 || x >= w || y < 0 || y >= h || z < 0 || z >= d ? 0 : a[(y * d + z) * w + x]; }, set: function (x, y, z, v) { if (x >= 0 && x < w && y >= 0 && y < h && z >= 0 && z < d) a[(y * d + z) * w + x] = v; } }; }
  function makeWorld(cutaway, layers) {
    var v = volume(20, 31, 20);
    for (var x = 0; x < v.w; x++) for (var z = 0; z < v.d; z++) {
      var h = Math.floor(17.2 + 2.1 * Math.sin(x * 0.21) + 1.4 * Math.cos(z * 0.29) + Math.sin((x + z) * 0.24));
      for (var y = 0; y <= h; y++) {
        var cave = y > 3 && y < 13 && Math.pow((z - 10 - 1.4 * Math.sin(x * 0.34)) / 3.2, 2) + Math.pow((y - 8.5) / 3.2, 2) < 1;
        if (!cave) v.set(x, y, z, layers ? (y >= 16 ? 3 : 1) : y === h ? 3 : y > h - 3 ? 2 : 1);
      }
      if (h < 17) for (var wy = h + 1; wy <= 17; wy++) v.set(x, wy, z, 4);
    }
    [[4, 5], [12, 3], [4, 15]].forEach(function (p) {
      var sy = 30; while (sy && !v.get(p[0], sy, p[1])) sy--;
      for (var y = sy + 1; y < sy + 5; y++) v.set(p[0], y, p[1], 5);
      for (var yy = sy + 3; yy <= sy + 6; yy++) for (var xx = p[0] - 2; xx <= p[0] + 2; xx++) for (var zz = p[1] - 2; zz <= p[1] + 2; zz++) if (Math.abs(xx - p[0]) + Math.abs(zz - p[1]) + Math.abs(yy - sy - 4) < 5) v.set(xx, yy, zz, 6);
    });
    if (cutaway) for (var x = 10; x < 20; x++) for (var z = 10; z < 20; z++) for (var y = 0; y < 31; y++) v.set(x, y, z, 0);
    v.set(10, 12, 9, 7);
    return v;
  }
  var DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  var CORNERS = [
    [[1,0,0],[1,0,1],[1,1,1],[1,1,0]], [[0,0,1],[0,0,0],[0,1,0],[0,1,1]],
    [[0,1,0],[1,1,0],[1,1,1],[0,1,1]], [[0,0,1],[1,0,1],[1,0,0],[0,0,0]],
    [[1,0,1],[0,0,1],[0,1,1],[1,1,1]], [[0,0,0],[1,0,0],[1,1,0],[0,1,0]]
  ];
  function meshFaces(v, exposed) {
    var faces = [], blocks = 0;
    for (var y = 0; y < v.h; y++) for (var z = 0; z < v.d; z++) for (var x = 0; x < v.w; x++) { var m = v.get(x, y, z); if (!m) continue; blocks++;
      DIRS.forEach(function (dir, i) { var other = v.get(x + dir[0], y + dir[1], z + dir[2]); if (!exposed || !other || (m !== 4 && other === 4)) faces.push({ x: x, y: y, z: z, m: m, face: i }); });
    }
    return { faces: faces, blocks: blocks, count: faces.length };
  }
  function createRenderer(host, options) {
    options = options || {};
    var canvas = el('canvas', 'mc-voxel-canvas'); canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', options.label || 'An original isometric voxel teaching model'); host.appendChild(canvas);
    var ctx = canvas.getContext('2d'), W = 800, H = options.height || 540, state;
    function draw(s) {
      state = s; var dpr = Math.min(window.devicePixelRatio || 1, 2.5), box = host.getBoundingClientRect(); W = Math.max(280, box.width || 800); H = W * (W<520&&options.mobileRatio?options.mobileRatio:options.ratio||0.68); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0,0,W,H);
      var p = palette(), v = s.volume, yaw = (s.orbit == null ? 42 : s.orbit) * Math.PI / 180, pitch = 0.48, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), gap = s.gap || 0;
      function Y(y) { return y + Math.floor(Math.min(y, v.h - 0.001) / 16) * gap; }
      function raw(x,y,z) { return [x * cy - z * sy, (x * sy + z * cy) * sp - y * cp]; }
      var suppliedMesh=s.mesh||meshFaces(v,true),occupiedHeight=1;suppliedMesh.faces.forEach(function(f){occupiedHeight=Math.max(occupiedHeight,f.y+1);});
      var projected = []; [0, v.w].forEach(function (x) { [0, occupiedHeight + Math.floor((occupiedHeight-0.001) / 16) * gap].forEach(function (y) { [0,v.d].forEach(function (z) { projected.push(raw(x,y,z)); }); }); });
      var minX = Math.min.apply(null, projected.map(function (p) { return p[0]; })), maxX = Math.max.apply(null, projected.map(function (p) { return p[0]; })), minY = Math.min.apply(null, projected.map(function (p) { return p[1]; })), maxY = Math.max.apply(null, projected.map(function (p) { return p[1]; }));
      var sc = Math.min((W - 68) / (maxX - minX), (H - 65) / (maxY - minY)), ox = W / 2 - (minX + maxX) * sc / 2, oy = H / 2 - (minY + maxY) * sc / 2 + 4;
      function proj(x,y,z) { var q = raw(x,y,z); return [ox + q[0] * sc, oy + q[1] * sc]; }
      function line(a,b,color,dash,width) { ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.strokeStyle = color; ctx.lineWidth = width || 1; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); }
      var floorSize = Math.max(v.w, v.d), floorY = 0;
      for (var i = -2; i <= floorSize + 2; i += 2) { line(proj(i,floorY,-2),proj(i,floorY,floorSize+2),p.line,[],0.5); line(proj(-2,floorY,i),proj(floorSize+2,floorY,i),p.line,[],0.5); }
      var normals = [sy*cp,-sy*cp,sp,-sp,cy*cp,-cy*cp];
      var faces = suppliedMesh.faces.filter(function (f) { return normals[f.face] > 0.001; });
      faces = faces.map(function (f) { var c = CORNERS[f.face], fy = f.y + Math.floor(f.y / 16) * gap, ex = s.explode || 0; var q = c.map(function (r) { var dir = DIRS[f.face]; return [f.x+r[0]+dir[0]*ex,fy+r[1]+dir[1]*ex,f.z+r[2]+dir[2]*ex]; }); return { f:f, q:q, depth: (f.x+0.5)*sy*cp+(f.z+0.5)*cy*cp+(fy+0.5)*sp + ex }; });
      faces.sort(function (a,b) { return a.depth-b.depth; });
      faces.forEach(function (entry) {
        var f=entry.f, q=entry.q.map(function (v) { return proj(v[0],v[1],v[2]); });
        ctx.beginPath(); q.forEach(function (p,i) { if (!i) ctx.moveTo(p[0],p[1]); else ctx.lineTo(p[0],p[1]); }); ctx.closePath();
        var colors=MATERIALS[f.m] || MATERIALS[1], index=f.face===2?0:(f.face===0||f.face===1)?1:2;
        ctx.fillStyle=colors[index]; ctx.fill(); ctx.strokeStyle = s.wire ? p.ink : 'rgba(20,35,38,0.11)'; ctx.lineWidth = s.wire ? 0.7 : 0.38; ctx.stroke();
      });
      if (s.boundaries) {
        var by = 16;
        [0,gap].forEach(function(g) { var corners=[[0,by+g,0],[v.w,by+g,0],[v.w,by+g,v.d],[0,by+g,v.d]]; for(var i=0;i<4;i++) line(proj.apply(null,corners[i]),proj.apply(null,corners[(i+1)%4]),p.blue,[4,4],1); });
        var a=W<520?proj(0,16+gap,v.d):proj(v.w,16+gap,0); ctx.font='11px '+getComputedStyle(document.body).fontFamily; ctx.fillStyle=p.blue; ctx.textAlign='left'; ctx.fillText('y = 16',clamp(a[0]+(W<520?-45:8),5,W-58),a[1]-7);
      }
      ctx.font = '11px '+getComputedStyle(document.body).fontFamily; ctx.fillStyle=p.muted;
      var a=proj(v.w+1,0,0), b=proj(0,0,v.d+1); ctx.textAlign='center'; ctx.fillText('x',clamp(a[0],12,W-12),clamp(a[1]+15,15,H-7)); ctx.fillText('z',clamp(b[0],12,W-12),clamp(b[1]+15,15,H-7));
      if (s.annotation) { var q=proj(s.annotation.x,Y(s.annotation.y),s.annotation.z), label=W<520?'Reference block':s.annotation.text,labelWidth=ctx.measureText(label).width,tx=clamp(q[0]+52,24,W-labelWidth-12),ty=clamp(q[1]-48,30,H-30); line(q,[tx,ty+5],p.amber,[],1); ctx.beginPath(); ctx.arc(q[0],q[1],3,0,TAU); ctx.fillStyle=p.amber; ctx.fill(); ctx.textAlign='left'; ctx.fillStyle=p.bg;ctx.fillRect(tx+2,ty-3,labelWidth+9,16);ctx.fillStyle=p.ink; ctx.fillText(label,tx+6,ty+8); }
      ctx.textAlign='left'; ctx.font='10px '+getComputedStyle(document.body).fontFamily; ctx.fillStyle=p.muted; ctx.fillText('ORIGINAL TEACHING MODEL',10,18);
    }
    var resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { if(state) draw(state); }) : null; if(resize) resize.observe(host);
    var obs = new MutationObserver(function () { if(state) draw(state); }); obs.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    return { canvas:canvas, draw:draw, destroy:function(){ if(resize) resize.disconnect();obs.disconnect(); } };
  }
  function worldFigure() {
    var body=mount('mc-world'); if(!body)return;
    var state={cut:true,layers:false,orbit:42,gap:2}, controls=el('div','mc-spatial-controls'), stage=el('div','mc-voxel-stage'), detail=el('div','mc-spatial-detail'), facts=el('div','mc-spatial-facts'); detail.setAttribute('aria-live','polite');
    var view=tabs('World view',[['cut','Cut into the world'],['whole','Whole terrain'],['sections','Section boundary']],'cut',function(v){state.cut=v!=='whole';state.layers=v==='sections';update();});
    var orbit=slider('Orbit',15,345,1,42,function(v){return v+'°';},function(v){state.orbit=v;draw();});
    var gap=slider('Separate sections',0,10,0.1,2,function(v){return Number(v).toFixed(1)+' blocks';},function(v){state.gap=v;draw();});
    controls.append(view,orbit.el,gap.el,button('Reset',function(){state={cut:true,layers:false,orbit:42,gap:2};view.set('cut');orbit.set(42);gap.set(2);update();})); body.append(controls,stage,facts,detail); var renderer=createRenderer(stage,{ratio:0.72,mobileRatio:1.0,label:'Isometric cutaway of synthetic terrain, exposing a cave and the boundary between vertical 16-block sections.'}), v, mesh;
    function draw(){renderer.draw({volume:v,mesh:mesh,orbit:state.orbit,gap:state.gap,boundaries:true,annotation:state.cut?{x:10.5,y:12.8,z:9.5,text:'One block, many systems'}:null});}
    function update(){v=makeWorld(state.cut,state.layers);mesh=meshFaces(v,true);facts.innerHTML='';[['Stored blocks',mesh.blocks.toLocaleString()],['Section height','16 blocks'],['Scene footprint','20 × 20 blocks']].forEach(function(f){var d=el('div');d.append(el('span','',f[0]),el('strong','',f[1]));facts.appendChild(d);});detail.textContent=state.layers?'The dashed blue plane is y = 16. The separation is an illustration; real sections remain adjacent in world coordinates.':'Move the orbit to look inside. The cutaway removes the nearest quarter; the amber block is the thread through this article.';draw();} update();
  }
  function makeMeshVolume(n, preset) { var v=volume(n,n,n);for(var y=0;y<n;y++)for(var z=0;z<n;z++)for(var x=0;x<n;x++){var tunnel=preset==='tunnel'&&Math.pow(y-(n-1)/2,2)+Math.pow(z-(n-1)/2,2)<Math.pow(n*0.27,2);if(!tunnel)v.set(x,y,z,y===n-1?3:1);}return v; }
  function meshFigure() {
    var body=mount('mc-mesh');if(!body)return;
    var s={n:8,preset:'solid',mode:'exposed',explode:0,orbit:42},controls=el('div','mc-spatial-controls'), stage=el('div','mc-voxel-stage'), facts=el('div','mc-spatial-facts'), note=el('div','mc-spatial-detail');note.setAttribute('aria-live','polite');
    var shape=tabs('Geometry',[['solid','Solid cube'],['tunnel','Bore a tunnel']],'solid',function(v){s.preset=v;update();}),method=tabs('Meshing method',[['all','All cube faces'],['exposed','Hidden faces removed']],'exposed',function(v){s.mode=v;update();});controls.append(shape,method);
    var n=slider('Cube edge',2,14,1,8,function(v){return v+' blocks';},function(v){s.n=v;update();}),explode=slider('Open the faces',0,0.45,0.01,0,function(v){return Math.round(v/0.45*100)+'%';},function(v){s.explode=v;draw();});controls.append(n.el,explode.el,button('Reset',function(){s={n:8,preset:'solid',mode:'exposed',explode:0,orbit:42};shape.set('solid');method.set('exposed');n.set(8);explode.set(0);update();}));body.append(controls,stage,facts,note);
    var renderer=createRenderer(stage,{ratio:0.62,label:'A cube or tunneled voxel volume showing all emitted cube faces or only exposed faces.'}),v,chosen;
    function draw(){renderer.draw({volume:v,mesh:chosen,orbit:s.orbit,explode:s.explode,wire:true});}
    function update(){v=makeMeshVolume(s.n,s.preset);var all=meshFaces(v,false),exposed=meshFaces(v,true);chosen=s.mode==='all'?all:exposed;facts.innerHTML='';[['Solid blocks',all.blocks.toLocaleString()],['Quads emitted',chosen.count.toLocaleString()],['Faces removed',Math.round((1-exposed.count/all.count)*100)+'%']].forEach(function(f){var d=el('div');d.append(el('span','',f[0]),el('strong','',f[1]));facts.appendChild(d);});note.textContent=s.mode==='all'?'All six faces are emitted for every occupied voxel, including faces buried against other blocks. The diagram itself uses normal camera visibility.':'Only a solid–air boundary emits a quad. This is hidden-face removal; neighboring quads are not merged. '+(s.preset==='solid'?'For this solid cube: 6 × '+s.n+'³ = '+all.count+' versus 6 × '+s.n+'² = '+exposed.count+'.':'The tunnel adds internal exposed surface, so the outer-cube formula no longer describes the mesh.');draw();}update();
  }
  function traceRay2D(grid,origin,direction,maxSteps) {
    var x=Math.floor(origin[0]),z=Math.floor(origin[1]),dx=direction[0],dz=direction[1],sx=dx<0?-1:1,sz=dz<0?-1:1,deltaX=dx===0?Infinity:Math.abs(1/dx),deltaZ=dz===0?Infinity:Math.abs(1/dz),tx=dx===0?Infinity:((sx>0?x+1:x)-origin[0])/dx,tz=dz===0?Infinity:((sz>0?z+1:z)-origin[1])/dz,steps=[],t=0,axis='start';
    for(var i=0;i<(maxSteps||100);i++) {if(x<0||z<0||z>=grid.length||x>=grid[0].length)break;var hit=!!grid[z][x];steps.push({x:x,z:z,t:t,tMaxX:tx,tMaxZ:tz,axis:axis,hit:hit});if(hit)break;if(tx<tz){t=tx;tx+=deltaX;x+=sx;axis='x';}else{t=tz;tz+=deltaZ;z+=sz;axis='z';}}
    return steps;
  }
  function rayFigure() {
    var body=mount('mc-ray');if(!body)return;
    var cols=14,rows=9,grid=Array.from({length:rows},function(){return new Uint8Array(cols);});for(var z=1;z<8;z++)if(z!==4)grid[z][10]=1;for(var z=2;z<6;z++)grid[z][6]=1;for(var x=7;x<12;x++)grid[8][x]=1;
    var controls=el('div','mc-spatial-controls'),graphic=svg('svg',{viewBox:'0 0 760 500',class:'mc-ray-grid',role:'img','aria-label':'A two-dimensional grid ray traversal; use the angle and step sliders to inspect visited cells.'}),status=el('div','mc-spatial-detail'),facts=el('div','mc-spatial-facts'),origin=[1.5,5.5],angle=-22,step=50,path=[];
    var aim=slider('Aim angle',-75,40,0.5,angle,function(v){return Number(v).toFixed(1)+'°';},function(v){angle=v;update();}),scrub=slider('Visited cell',0,15,1,0,function(v){return String(v+1);},function(v){step=v;draw();});
    controls.append(aim.el,scrub.el,button('Show the hit',function(){step=path.length-1;syncStep();draw();}),button('Reset',function(){angle=-22;aim.set(angle);update();}));body.append(controls,graphic,facts,status);status.setAttribute('aria-live','polite');
    var OX=30,OY=27,C=50,viewW=760,viewH=500,mobile=false;
    function syncStep(){step=clamp(step,0,path.length-1);scrub.input.max=Math.max(0,path.length-1);scrub.input.value=step;scrub.output.textContent=(step+1)+' / '+path.length;}
    function update(){var rad=angle*Math.PI/180;path=traceRay2D(grid,origin,[Math.cos(rad),Math.sin(rad)],100);step=path.length-1;syncStep();draw();}
    function txt(x,y,value,attrs){var t=svg('text',Object.assign({x:x,y:y},attrs||{}),graphic);t.textContent=value;return t;}
    function draw(){mobile=graphic.getBoundingClientRect().width<520;viewW=mobile?420:760;viewH=mobile?290:500;C=mobile?26:50;OX=mobile?24:30;OY=mobile?24:27;graphic.setAttribute('viewBox','0 0 '+viewW+' '+viewH);var p=palette(),rad=angle*Math.PI/180,dir=[Math.cos(rad),Math.sin(rad)],cur=path[step];while(graphic.firstChild)graphic.removeChild(graphic.firstChild);
      for(var z=0;z<rows;z++)for(var x=0;x<cols;x++){svg('rect',{x:OX+x*C,y:OY+z*C,width:C,height:C,fill:grid[z][x]?(p.dark?'#586370':'#a9b1b7'):p.bg,stroke:p.line,'stroke-width':0.7},graphic);}
      path.slice(0,step+1).forEach(function(cell,i){svg('rect',{x:OX+cell.x*C+2,y:OY+cell.z*C+2,width:C-4,height:C-4,fill:cell.hit?p.amber:p.blue,opacity:cell===cur?0.32:0.10,rx:3},graphic);txt(OX+cell.x*C+7,OY+cell.z*C+15,String(i+1),{fill:p.muted,'font-size':11});});
      var last=path[path.length-1],endT=last.hit?last.t:Math.min(last.tMaxX,last.tMaxZ),end=[origin[0]+dir[0]*endT,origin[1]+dir[1]*endT];
      svg('line',{x1:OX+origin[0]*C,y1:OY+origin[1]*C,x2:OX+end[0]*C,y2:OY+end[1]*C,stroke:p.ink,'stroke-width':1.5},graphic);
      path.slice(1,step+1).forEach(function(cell){svg('circle',{cx:OX+(origin[0]+dir[0]*cell.t)*C,cy:OY+(origin[1]+dir[1]*cell.t)*C,r:3,fill:p.blue},graphic);});
      svg('circle',{cx:OX+origin[0]*C,cy:OY+origin[1]*C,r:6,fill:p.ink},graphic);txt(OX+origin[0]*C,OY+origin[1]*C+22,'eye',{'text-anchor':'middle',fill:p.ink,'font-size':12});
      if(last.hit)svg('circle',{cx:OX+end[0]*C,cy:OY+end[1]*C,r:6,fill:p.amber,stroke:p.bg,'stroke-width':2},graphic);
      if(!mobile){for(var x=0;x<cols;x++)txt(OX+(x+0.5)*C,17,String(x),{'text-anchor':'middle',fill:p.muted,'font-size':10});for(var z=0;z<rows;z++)txt(17,OY+(z+0.5)*C+4,String(z),{'text-anchor':'middle',fill:p.muted,'font-size':10});}
      if(cur){facts.innerHTML='';[['Current cell','('+cur.x+', '+cur.z+')'],['Next x boundary',Number.isFinite(cur.tMaxX)?cur.tMaxX.toFixed(3):'∞'],['Next z boundary',Number.isFinite(cur.tMaxZ)?cur.tMaxZ.toFixed(3):'∞']].forEach(function(f){var d=el('div');d.append(el('span','',f[0]),el('strong','',f[1]));facts.appendChild(d);});status.textContent=cur.hit?'Hit the first occupied cell. This figure stops at a full-cell boundary; the game also intersects the block’s actual shape.':'Next, cross the '+(cur.tMaxX<cur.tMaxZ?'x':'z')+' boundary: choose the smaller tMax, then add that axis’s tDelta. Click the grid to aim, or use the angle slider.';}
    }
    function aimAt(e){var r=graphic.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*viewW,y=(e.clientY-r.top)/r.height*viewH,deg=Math.atan2((y-OY)/C-origin[1],(x-OX)/C-origin[0])*180/Math.PI;angle=clamp(deg,-75,40);aim.input.value=angle;aim.output.textContent=angle.toFixed(1)+'°';update();}
    graphic.addEventListener('pointerdown',function(e){aimAt(e);if(e.pointerType==='mouse')graphic.setPointerCapture(e.pointerId);});
    graphic.addEventListener('pointermove',function(e){if(e.pointerType==='mouse'&&e.buttons===1)aimAt(e);});
    var observer=new MutationObserver(draw);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});if(typeof ResizeObserver!=='undefined')new ResizeObserver(function(){if((graphic.getBoundingClientRect().width<520)!==mobile)draw();}).observe(graphic);update();
  }
  window.MinecraftWorld={volume:volume,makeWorld:makeWorld,makeMeshVolume:makeMeshVolume,meshFaces:meshFaces,createRenderer:createRenderer,traceRay2D:traceRay2D};
  function init(){worldFigure();meshFigure();rayFigure();}
  document.addEventListener('minecraft:notebook-open', init);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
