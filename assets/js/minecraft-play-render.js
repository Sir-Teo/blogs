/* Original first-person voxel renderer for the Minecraft explainer.
 * All texture pixels are generated here; no game art, shaders, or assets. */
(function (root) {
  'use strict';
  var DIRS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  var CUBE=[[[1,0,0],[1,0,1],[1,1,1],[1,1,0]],[[0,0,1],[0,0,0],[0,1,0],[0,1,1]],[[0,1,0],[1,1,0],[1,1,1],[0,1,1]],[[0,0,1],[1,0,1],[1,0,0],[0,0,0]],[[1,0,1],[0,0,1],[0,1,1],[1,1,1]],[[0,0,0],[1,0,0],[1,1,0],[0,1,0]]];
  var UV=[[0,1],[1,1],[1,0],[0,0]],TRI=[0,1,2,0,2,3];
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function noise(x,y,seed){var n=Math.imul(x+seed*17,374761393)+Math.imul(y+seed*31,668265263);n=Math.imul(n^n>>>13,1274126177);return ((n^n>>>16)>>>0)/4294967295;}
  function identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
  function multiply(a,b){var out=new Float32Array(16);for(var col=0;col<4;col++)for(var row=0;row<4;row++)for(var k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k];return out;}
  function viewProjection(camera,aspect){var fov=(camera.fov||70)*Math.PI/180,f=1/Math.tan(fov/2),near=.045,far=90,proj=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);var yaw=camera.yaw||0,pitch=camera.pitch||0,sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch),right=[cy,0,-sy],up=[-sy*sp,cp,-cy*sp],forward=[sy*cp,sp,cy*cp],x=camera.x,y=camera.y,z=camera.z;var view=new Float32Array([right[0],up[0],-forward[0],0,right[1],up[1],-forward[1],0,right[2],up[2],-forward[2],0,-right[0]*x-right[1]*y-right[2]*z,-up[0]*x-up[1]*y-up[2]*z,forward[0]*x+forward[1]*y+forward[2]*z,1]);return multiply(proj,view);}
  function tileFor(type,side){if(type===3)return side===2?0:side===3?2:1;if(type===2)return 2;if(type===5)return side===2||side===3?5:4;if(type===6)return 6;if(type===4)return 19;if(type===9)return 20;return 3;}
  function createAtlas(){var c=document.createElement('canvas');c.width=128;c.height=64;var ctx=c.getContext('2d'),im=ctx.createImageData(128,64);
    function pixel(tile,x,y,r,g,b,a){var at=((Math.floor(tile/8)*16+y)*128+(tile%8)*16+x)*4;im.data[at]=r;im.data[at+1]=g;im.data[at+2]=b;im.data[at+3]=a==null?255:a;}
    for(var tile=0;tile<32;tile++)for(var y=0;y<16;y++)for(var x=0;x<16;x++){
      var n=noise(x,y,tile),grain=(n-.5)*25,r=255,g=255,b=255,a=255;
      if(tile===0){var coarse=noise(Math.floor(x/3),Math.floor(y/3),41)*12;r=76+grain+coarse;g=118+grain+coarse;b=48+grain*.7;}
      else if(tile===1||tile===2){r=114+grain;g=82+grain*.75;b=53+grain*.6;if(tile===1&&y<3+Math.floor(noise(x,1,13)*3)){r=75+grain;g=116+grain;b=46+grain*.6;}else if(noise(x,y,22)>.89){r+=21;g+=18;b+=15;}}
      else if(tile===3){var patch=noise(Math.floor(x/4),Math.floor(y/3),87),vein=(x+Math.floor(y/4)*3)%11===0&&noise(x,y,70)>.55?-19:0;r=126+grain+patch*9+vein;g=127+grain+patch*9+vein;b=126+grain+patch*9+vein;}
      else if(tile===4){var band=(x%5<2?-22:8)+Math.floor(noise(x,Math.floor(y/4),5)*13);r=103+band+grain*.45;g=78+band*.72+grain*.3;b=46+band*.45+grain*.2;}
      else if(tile===5){var ring=Math.floor(Math.max(Math.abs(x-7.5),Math.abs(y-7.5)))%3;r=154+grain-(ring===0?28:0);g=121+grain*.7-(ring===0?23:0);b=73+grain*.5-(ring===0?16:0);}
      else if(tile===6){var cluster=noise(Math.floor(x/3),Math.floor(y/3),31);r=41+grain*.6+cluster*14;g=84+grain+cluster*20;b=36+grain*.6+cluster*9;a=noise(x,y,72)<.13?0:255;}
      else if(tile===7){r=112+grain;g=76+grain*.7;b=36+grain*.3;}
      else if(tile>=8&&tile<=17){r=27;g=24;b=21;a=0;}
      else if(tile===18){var dx=Math.abs(x-7.5),flameWidth=3+(15-y)*.21,edge=dx/flameWidth;r=255;g=clamp(210-edge*115+grain,70,245);b=clamp(90-edge*120,0,140);a=dx<flameWidth&&y>1+noise(x,y,7)*4?Math.round((1-edge*.2)*255):0;}
      else if(tile===19){r=48+grain*.3;g=101+grain*.4;b=151+grain*.6;}
      else if(tile===20){var seeds=[[3,3],[10,1],[15,5],[7,8],[1,12],[12,13]],best=Infinity,second=Infinity,rock=0,rx=0,ry=0;for(var si=0;si<seeds.length;si++)for(var wx=-16;wx<=16;wx+=16)for(var wy=-16;wy<=16;wy+=16){var dx=x-seeds[si][0]-wx,dy=y-seeds[si][1]-wy,dist=Math.sqrt(dx*dx+dy*dy);if(dist<best){second=best;best=dist;rock=si;rx=dx;ry=dy;}else if(dist<second)second=dist;}var mortar=second-best<.85,tone=mortar?61:99+noise(rock,2,57)*31+(rx+ry<0?9:-8);r=tone+grain*.45;g=tone+grain*.45;b=tone+grain*.45;}
      else if(tile>=21&&tile<=24){var cloth=tile===21?((x%8===0||y%8===0)?-8:0):tile===23?(x%7===0?-12:0):tile===24?(x%3===0?-14:0):0;r=g=b=clamp(235+grain*.7+cloth,190,255);}
      pixel(tile,x,y,r,g,b,a);
    }
    ctx.putImageData(im,0,0);
    // Deterministic fracture paths, progressively joined, on transparent tiles.
    var paths=[[[8,8],[9,5],[8,1]],[[8,8],[5,9],[1,8]],[[8,8],[10,10],[12,15]],[[9,5],[12,4],[15,5]],[[5,9],[5,13],[3,15]],[[8,8],[5,5],[3,2]],[[10,10],[14,9],[15,10]],[[5,5],[2,5],[0,3]],[[9,5],[11,1],[12,0]],[[5,13],[8,13],[9,15]]];
    for(var stage=0;stage<10;stage++){ctx.save();ctx.translate((8+stage)%8*16,Math.floor((8+stage)/8)*16);ctx.strokeStyle='rgba(25,21,18,.9)';ctx.lineWidth=1;ctx.lineCap='square';for(var j=0;j<=stage;j++){var path=paths[j];ctx.beginPath();path.forEach(function(p,i){i?ctx.lineTo(p[0]+.5,p[1]+.5):ctx.moveTo(p[0]+.5,p[1]+.5);});ctx.stroke();}ctx.restore();}
    return c;
  }
  var atlasSource=null;
  function create(canvas,options){
    options=options||{};
    var gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true})||canvas.getContext('experimental-webgl',{alpha:false,antialias:true});
    if(!gl)return {available:false,message:'WebGL is unavailable',draw:function(){},rebuild:function(){},dispose:function(){}};
    var VERT='attribute vec3 aPosition; attribute vec2 aUV; attribute vec3 aColor; uniform mat4 uVP; varying vec2 vUV; varying vec3 vColor; varying vec3 vPosition; void main(){vUV=aUV;vColor=aColor;vPosition=aPosition;gl_Position=uVP*vec4(aPosition,1.0);}';
    var FRAG='precision mediump float; varying vec2 vUV; varying vec3 vColor; varying vec3 vPosition; uniform sampler2D uTexture; uniform vec3 uCamera; uniform vec3 uFogColor; uniform float uFog; uniform float uTime; void main(){vec4 tex=texture2D(uTexture,vUV);if(tex.a<0.15)discard;vec3 c=pow(max(tex.rgb*vColor,vec3(0.0)),vec3(0.86));float fire=step(2.0,floor(vUV.x*8.0))*step(floor(vUV.x*8.0),2.0)*step(2.0,floor((1.0-vUV.y)*4.0))*step(floor((1.0-vUV.y)*4.0),2.0);c*=1.0+fire*0.07*sin(uTime*11.0+vUV.y*20.0);float d=distance(vPosition,uCamera);float fog=smoothstep(15.0,58.0,d)*uFog;gl_FragColor=vec4(mix(c,uFogColor,fog),tex.a);}';
    var LINE_VERT='attribute vec3 aPosition;uniform mat4 uVP;void main(){gl_Position=uVP*vec4(aPosition,1.0);}';
    var LINE_FRAG='precision mediump float;uniform vec4 uColor;void main(){gl_FragColor=uColor;}';
    function shader(type,src){var sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){var error=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw Error('Voxel shader: '+error);}return sh;}
    function program(vs,fs){var p=gl.createProgram(),v=shader(gl.VERTEX_SHADER,vs),f=shader(gl.FRAGMENT_SHADER,fs);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('Voxel shader link: '+gl.getProgramInfoLog(p));return p;}
    var prog=program(VERT,FRAG),lineProg=program(LINE_VERT,LINE_FRAG),worldBuffer=gl.createBuffer(),dynamicBuffer=gl.createBuffer(),lineBuffer=gl.createBuffer(),texture=gl.createTexture(),atlas=atlasSource||(atlasSource=createAtlas()),count=0,lastWorld=null,lastVersion=null,lastLighting=null,disposed=false;
    var attr={pos:gl.getAttribLocation(prog,'aPosition'),uv:gl.getAttribLocation(prog,'aUV'),color:gl.getAttribLocation(prog,'aColor')},uniform={vp:gl.getUniformLocation(prog,'uVP'),texture:gl.getUniformLocation(prog,'uTexture'),camera:gl.getUniformLocation(prog,'uCamera'),fogColor:gl.getUniformLocation(prog,'uFogColor'),fog:gl.getUniformLocation(prog,'uFog'),time:gl.getUniformLocation(prog,'uTime')},lineAttr=gl.getAttribLocation(lineProg,'aPosition'),lineVP=gl.getUniformLocation(lineProg,'uVP'),lineColor=gl.getUniformLocation(lineProg,'uColor');
    gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    function uv(tile,u,v){return [(tile%8+(u*.998+.001))/8,1-(Math.floor(tile/8)+(v*.998+.001))/4];}
    function quad(out,points,tile,colors){TRI.forEach(function(i){var t=uv(tile,UV[i][0],UV[i][1]),c=Array.isArray(colors[0])?colors[i]:colors;out.push(points[i][0],points[i][1],points[i][2],t[0],t[1],c[0],c[1],c[2]);});}
    function cube(out,x,y,z,sx,sy,sz,tile,color){CUBE.forEach(function(q){quad(out,q.map(function(c){return [x+c[0]*sx,y+c[1]*sy,z+c[2]*sz];}),tile,color);});}
    function opaque(world,x,y,z){var t=world.get(x,y,z);return t!==0&&t!==8&&t!==4;}
    function sample(l,x,y,z){if(l&&l.sample)return l.sample(x,y,z);return [4,y>12?15:0];}
    function faceColors(world,l,x,y,z,side){var normal=DIRS[side],base=[x+normal[0],y+normal[1],z+normal[2]],axes=[];for(var a=0;a<3;a++)if(!normal[a])axes.push(a);var s0=sample(l,base[0],base[1],base[2]),direction=side===2?1:side===3?.57:side<2?.81:.73;
      return CUBE[side].map(function(c){var da=c[axes[0]]?1:-1,db=c[axes[1]]?1:-1,p1=base.slice(),p2=base.slice(),pc=base.slice();p1[axes[0]]+=da;p2[axes[1]]+=db;pc[axes[0]]+=da;pc[axes[1]]+=db;var a=opaque(world,p1[0],p1[1],p1[2])?1:0,b=opaque(world,p2[0],p2[1],p2[2])?1:0,k=opaque(world,pc[0],pc[1],pc[2])?1:0,ao=.57+.143*(a&&b?0:3-a-b-k),values=[s0];[p1,p2,pc].forEach(function(p){values.push(opaque(world,p[0],p[1],p[2])?s0:sample(l,p[0],p[1],p[2]));});var block=values.reduce(function(sum,v){return sum+(v[0]||0);},0)/56,sky=values.reduce(function(sum,v){return sum+(v[1]||0);},0)/60;return [Math.min(1.35,.27+sky*.83*direction+block*.91),Math.min(1.24,.27+sky*.86*direction+block*.72),Math.min(1.17,.28+sky*.92*direction+block*.49)].map(function(v){return v*ao;});});
    }
    function rebuild(world,lighting){if(disposed)return;var data=[];for(var y=0;y<world.h;y++)for(var z=0;z<world.d;z++)for(var x=0;x<world.w;x++){var type=world.get(x,y,z);if(!type)continue;if(type===8){if(options.lighting===false)continue;cube(data,x+.4375,y,z+.4375,.125,.625,.125,7,[1,.86,.65]);quad(data,[[x+.28,y+.52,z+.5],[x+.72,y+.52,z+.5],[x+.72,y+1,z+.5],[x+.28,y+1,z+.5]],18,[1.4,1.3,1]);quad(data,[[x+.5,y+.52,z+.28],[x+.5,y+.52,z+.72],[x+.5,y+1,z+.72],[x+.5,y+1,z+.28]],18,[1.4,1.3,1]);continue;}for(var side=0;side<6;side++){var d=DIRS[side],other=world.get(x+d[0],y+d[1],z+d[2]);if(other&&other!==8&&!(type!==4&&other===4))continue;quad(data,CUBE[side].map(function(c){return [x+c[0],y+c[1],z+c[2]];}),tileFor(type,side),faceColors(world,lighting,x,y,z,side));}}
      count=data.length/8;gl.bindBuffer(gl.ARRAY_BUFFER,worldBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);lastWorld=world;lastVersion=world.version;lastLighting=lighting;
    }
    function attributes(buffer){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(attr.pos);gl.enableVertexAttribArray(attr.uv);gl.enableVertexAttribArray(attr.color);gl.vertexAttribPointer(attr.pos,3,gl.FLOAT,false,32,0);gl.vertexAttribPointer(attr.uv,2,gl.FLOAT,false,32,12);gl.vertexAttribPointer(attr.color,3,gl.FLOAT,false,32,20);}
    function drawData(data){gl.bindBuffer(gl.ARRAY_BUFFER,dynamicBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);attributes(dynamicBuffer);gl.drawArrays(gl.TRIANGLES,0,data.length/8);}
    function outline(hit,vp,reference){if(!hit)return;var x=hit.x-.002,y=hit.y-.002,z=hit.z-.002,s=1.004,points=[];for(var a=0;a<8;a++){var p=[x+(a&1?s:0),y+(a&2?s:0),z+(a&4?s:0)];for(var bit=1;bit<=4;bit*=2)if(!(a&bit)){var b=a|bit;points.push(p[0],p[1],p[2],x+(b&1?s:0),y+(b&2?s:0),z+(b&4?s:0));}}gl.useProgram(lineProg);gl.bindBuffer(gl.ARRAY_BUFFER,lineBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(lineAttr);gl.vertexAttribPointer(lineAttr,3,gl.FLOAT,false,12,0);gl.uniformMatrix4fv(lineVP,false,vp);gl.uniform4f(lineColor,reference?1:.91,reference?.77:.94,reference?.32:.98,.9);gl.lineWidth(1);gl.drawArrays(gl.LINES,0,points.length/3);}
    function hudRect(out,x,y,w,h,color){quad(out,[[x,y,0],[x+w,y,0],[x+w,y+h,0],[x,y+h,0]],31,color);}
    function heldTool(interaction,width,height){var out=[],swing=interaction.swing||0,time=interaction.time||0,phase=Math.sin(swing*Math.PI),aspect=width/height,baseX=.75-phase*.22,baseY=-.72+phase*.13,bob=Math.sin(time*6)*(interaction.walking?.009:0);baseY+=bob;
      function P(x,y,z){var angle=-.72+phase*.8,c=Math.cos(angle),s=Math.sin(angle),scale=.54,depth=z||0;return [baseX+((x*c-y*s)+depth*.7)*scale/aspect,baseY+(x*s+y*c+depth*.45)*scale,0];}
      function rect(x,y,w,h,color,tile){quad(out,[P(x,y),P(x+w,y),P(x+w,y+h),P(x,y+h)],tile==null?31:tile,color);}
      var tool=interaction.tool||'pickaxe';
      if(tool==='pickaxe'){
        // A shallow extrusion gives the original tool a readable edge and bevel.
        function prism(x,y,w,h,color,tile){
          var depth=.065,tileIndex=tile==null?31:tile;
          quad(out,[P(x+w,y),P(x+w,y+h),P(x+w,y+h,depth),P(x+w,y,depth)],tileIndex,color.map(function(v){return v*.57;}));
          quad(out,[P(x,y+h),P(x+w,y+h),P(x+w,y+h,depth),P(x,y+h,depth)],tileIndex,color.map(function(v){return Math.min(1,v*1.2);}));
          quad(out,[P(x,y),P(x+w,y),P(x+w,y+h),P(x,y+h)],tileIndex,color);
        }
        prism(-.065,-.50,.13,1.02,[1,.94,.86],7);
        rect(-.035,-.48,.025,.96,[.53,.38,.20]);
        prism(-.4,.35,.8,.16,[.66,.73,.75]);
        prism(-.49,.18,.16,.28,[.69,.76,.78]);
        prism(-.54,.07,.13,.16,[.63,.70,.73]);
        prism(.32,.17,.14,.28,[.58,.65,.68]);
        prism(.38,.07,.13,.16,[.53,.60,.63]);
        rect(-.39,.46,.78,.035,[.9,.95,.96]);
      }
      else if(tool==='stone'||tool==='cobblestone'){var heldTile=tool==='cobblestone'||interaction.placeType===9?20:3;function B(x,y,z){return [baseX+(x-z)*.40/aspect,baseY+(x+z)*.18+y*.43,0];}quad(out,[B(-.5,-.2,.5),B(.5,-.2,.5),B(.5,.8,.5),B(-.5,.8,.5)],heldTile,[.7,.72,.73]);quad(out,[B(.5,-.2,-.5),B(.5,-.2,.5),B(.5,.8,.5),B(.5,.8,-.5)],heldTile,[.84,.86,.87]);quad(out,[B(-.5,.8,-.5),B(.5,.8,-.5),B(.5,.8,.5),B(-.5,.8,.5)],heldTile,[1,1,1]);}
      else if(tool==='torch'){rect(-.07,-.4,.14,.78,[.85,.68,.4],7);rect(-.16,.33,.32,.38,[1.3,1.15,.8],18);}
      else {rect(-.15,-.43,.3,.7,[.69,.47,.32]);rect(-.15,-.1,.3,.14,[.77,.54,.37]);}
      return out;
    }
    function drawPlayers(players,lighting){
      var actors=[],shirts=[[.34,.63,.60],[.38,.55,.83],[.73,.45,.36],[.65,.49,.77],[.77,.63,.30],[.46,.66,.38],[.71,.48,.61],[.40,.65,.72]];
      players.forEach(function(p){
        var levels=sample(lighting,Math.floor(p.x),Math.floor(p.y+1),Math.floor(p.z)),b=levels[0]/14,s=levels[1]/15,illum=[Math.min(1.35,.27+s*.83+b*.91),Math.min(1.24,.27+s*.86+b*.72),Math.min(1.17,.28+s*.92+b*.49)];
        var start=actors.length,shirt=shirts[(p.color||0)%shirts.length],skin=[.88,.70,.51],hair=[.34,.25,.18],pants=[.30,.35,.45],phase=p.walking?Math.sin((p.x+p.z)*6)*.35:0;
        cube(actors,p.x-.23,p.y+.68,p.z-.145,.46,.66,.29,21,shirt);
        cube(actors,p.x-.225,p.y+1.34,p.z-.225,.45,.45,.45,22,skin);
        cube(actors,p.x-.23,p.y+1.69,p.z-.23,.46,.11,.46,24,hair);
        cube(actors,p.x-.15,p.y+1.58,p.z+.227,.09,.055,.006,31,[.94,.94,.88]);
        cube(actors,p.x+.06,p.y+1.58,p.z+.227,.09,.055,.006,31,[.94,.94,.88]);
        cube(actors,p.x-.105,p.y+1.58,p.z+.235,.035,.05,.006,31,[.18,.22,.24]);
        cube(actors,p.x+.075,p.y+1.58,p.z+.235,.035,.05,.006,31,[.18,.22,.24]);
        cube(actors,p.x-.025,p.y+1.50,p.z+.228,.05,.065,.045,22,[.72,.53,.36]);
        cube(actors,p.x-.07,p.y+1.445,p.z+.229,.14,.025,.008,31,[.39,.28,.21]);
        function limb(x,y,z,w,h,d,tile,color,swing,pivot){
          var begin=actors.length;cube(actors,x,y,z,w,h,d,tile,color);
          for(var i=begin;i<actors.length;i+=8){var dy=actors[i+1]-pivot,dz=actors[i+2]-p.z;actors[i+1]=pivot+dy*Math.cos(swing)-dz*Math.sin(swing);actors[i+2]=p.z+dy*Math.sin(swing)+dz*Math.cos(swing);}
        }
        limb(p.x-.21,p.y,p.z-.12,.18,.70,.24,23,pants,phase,p.y+.70);
        limb(p.x+.03,p.y,p.z-.12,.18,.70,.24,23,pants,-phase,p.y+.70);
        limb(p.x-.35,p.y+.74,p.z-.11,.12,.54,.22,21,shirt,-phase,p.y+1.28);
        limb(p.x+.23,p.y+.74,p.z-.11,.12,.54,.22,21,shirt,phase,p.y+1.28);
        limb(p.x-.35,p.y+.69,p.z-.11,.12,.23,.22,22,skin,-phase,p.y+1.28);
        limb(p.x+.23,p.y+.69,p.z-.11,.12,.23,.22,22,skin,phase,p.y+1.28);
        for(var at=start;at<actors.length;at+=8){var dx=actors[at]-p.x,dz=actors[at+2]-p.z,co=Math.cos(p.yaw||0),si=Math.sin(p.yaw||0),shade=[.74,.82,1,.62,.87,.72][Math.floor((at-start)/48)%6];actors[at]=p.x+dx*co+dz*si;actors[at+2]=p.z-dx*si+dz*co;actors[at+5]*=shade*illum[0];actors[at+6]*=shade*illum[1];actors[at+7]*=shade*illum[2];}
      });
      drawData(actors);
    }
    function draw(world,camera,interaction,lighting){if(disposed)return;interaction=interaction||{};if(world!==lastWorld||world.version!==lastVersion||lighting!==lastLighting)rebuild(world,lighting);var width=canvas.width||1,height=canvas.height||1,vp=viewProjection(camera,width/height),sky=sample(lighting,Math.floor(camera.x),Math.floor(camera.y),Math.floor(camera.z))[1]||0,open=sky/15,fog=[.09+open*.44,.095+open*.62,.11+open*.72];gl.viewport(0,0,width,height);gl.clearColor(fog[0],fog[1],fog[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.CULL_FACE);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.useProgram(prog);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(uniform.texture,0);gl.uniform3f(uniform.camera,camera.x,camera.y,camera.z);gl.uniform3fv(uniform.fogColor,fog);gl.uniform1f(uniform.fog,1);gl.uniform1f(uniform.time,interaction.time||0);gl.uniformMatrix4fv(uniform.vp,false,vp);attributes(worldBuffer);gl.drawArrays(gl.TRIANGLES,0,count);
      if(interaction.players&&interaction.players.length)drawPlayers(interaction.players,lighting);
      var hit=interaction.hit;if(hit&&interaction.mining>0){var cracks=[],stage=clamp(Math.floor(interaction.mining*10),0,9);CUBE.forEach(function(q){quad(cracks,q.map(function(c){return [hit.x-.002+c[0]*1.004,hit.y-.002+c[1]*1.004,hit.z-.002+c[2]*1.004];}),8+stage,[1,1,1]);});gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);drawData(cracks);gl.disable(gl.BLEND);}
      if(interaction.particles&&interaction.particles.length){var bits=[];interaction.particles.slice(0,60).forEach(function(p,i){var size=p.size||.035,age=p.age||0;if(age>.7)return;var tint=Array.isArray(p.color)?p.color.map(function(v){return v>1?v/255:v;}):[.75,.75,.75];cube(bits,p.x-size,p.y-size,p.z-size,size*2,size*2,size*2,tileFor(p.type||1,0),tint);});if(bits.length)drawData(bits);}
      outline(hit,vp,hit&&world.get(hit.x,hit.y,hit.z)===7);
      // Hands, tool, and reticle are camera-space rendering, without DOM HUD.
      gl.useProgram(prog);gl.disable(gl.DEPTH_TEST);gl.uniformMatrix4fv(uniform.vp,false,identity());gl.uniform1f(uniform.fog,0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);if(interaction.tools!==false)drawData(heldTool(interaction,width,height));var cross=[],pixel=2/(canvas.clientHeight||height),wide=width/height;hudRect(cross,-8*pixel/wide,-1.3*pixel,16*pixel/wide,2.6*pixel,[.12,.13,.14]);hudRect(cross,-1.3*pixel/wide,-8*pixel,2.6*pixel/wide,16*pixel,[.12,.13,.14]);hudRect(cross,-6*pixel/wide,-.48*pixel,12*pixel/wide,.96*pixel,[.96,.97,.98]);hudRect(cross,-.48*pixel/wide,-6*pixel,.96*pixel/wide,12*pixel,[.96,.97,.98]);if(interaction.reticle!==false)drawData(cross);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);
    }
    function dispose(){if(disposed)return;disposed=true;[worldBuffer,dynamicBuffer,lineBuffer].forEach(function(b){gl.deleteBuffer(b);});gl.deleteTexture(texture);gl.deleteProgram(prog);gl.deleteProgram(lineProg);}
    return {available:true,draw:draw,rebuild:rebuild,dispose:dispose,atlas:atlas,get triangleCount(){return count/3;}};
  }
  var api={create:create,viewProjection:viewProjection,tileFor:tileFor};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MinecraftPlayRender=api;
})(typeof window!=='undefined'?window:globalThis);
