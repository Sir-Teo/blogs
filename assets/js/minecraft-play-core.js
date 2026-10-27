/* Pure models used by the playable cave. Source-backed mining arithmetic,
 * full-cube selection/collision, and recomputed voxel light. Movement is tuned
 * for this illustration rather than a port of Minecraft's complete physics. */
(function (root) {
  'use strict';
  var EPS = 1e-7, DIRECTIONS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function clamp(v,a,b) { return Math.max(a,Math.min(b,v)); }
  function solid(type) { return type !== 0 && type !== 8 && type != null; }
  function inWorld(w,x,y,z) { return x>=0&&x<w.w&&y>=0&&y<w.h&&z>=0&&z<w.d; }
  function at(w,x,y,z) { return inWorld(w,x,y,z) ? (w.get(x,y,z)||0) : 0; }
  function collisionAt(w,x,y,z) {
    if(x<0||x>=w.w||z<0||z>=w.d||y<0)return true;
    return y<w.h&&solid(w.get(x,y,z));
  }
  function validVector(a) { return Array.isArray(a)&&a.length===3&&a.every(finite); }

  // The narrow upright torch remains selectable without acting as a cube wall.
  function rayBox(origin,dir,min,max,reach) {
    var near=-Infinity,far=Infinity,normal=[0,0,0];
    for(var a=0;a<3;a++) {
      if(Math.abs(dir[a])<EPS) { if(origin[a]<min[a]||origin[a]>max[a])return null; continue; }
      var first=(min[a]-origin[a])/dir[a],last=(max[a]-origin[a])/dir[a],sign=-1;
      if(first>last){var swap=first;first=last;last=swap;sign=1;}
      if(first>near){near=first;normal=[0,0,0];normal[a]=sign;}
      far=Math.min(far,last);if(near>far)return null;
    }
    if(far<0||near>reach)return null;
    return {distance:Math.max(0,near),normal:near<0?[0,0,0]:normal};
  }

  function raycast(world, origin, direction, maxDistance) {
    if(!world||!validVector(origin)||!validVector(direction))return null;
    maxDistance=maxDistance===undefined?4.5:maxDistance;
    if(!finite(maxDistance)||maxDistance<0)return null;
    var length=Math.hypot(direction[0],direction[1],direction[2]);if(length<EPS)return null;
    var dir=direction.map(function(v){return v/length;}),cell=origin.map(Math.floor),step=dir.map(function(v){return v<0?-1:v>0?1:0;});
    var delta=dir.map(function(v){return Math.abs(v)<EPS?Infinity:Math.abs(1/v);}),next=dir.map(function(v,i){return step[i]===0?Infinity:((step[i]>0?cell[i]+1:cell[i])-origin[i])/v;});
    var normal=[0,0,0],distance=0,previous=cell.slice();
    // A reach-limited ray cannot cross more than ~3*reach grid planes; the
    // extra margin handles origins on a plane and small floating-point errors.
    var limit=Math.min(10000,Math.ceil(maxDistance*3)+12);
    for(var n=0;n<limit&&distance<=maxDistance+EPS;n++) {
      var type=at(world,cell[0],cell[1],cell[2]),hit=null;
      if(type===8)hit=rayBox(origin,dir,[cell[0]+.35,cell[1],cell[2]+.35],[cell[0]+.65,cell[1]+.72,cell[2]+.65],maxDistance);
      else if(solid(type))hit={distance:distance,normal:normal.slice()};
      if(hit&&hit.distance<=maxDistance+EPS) {
        var before=[cell[0]+hit.normal[0],cell[1]+hit.normal[1],cell[2]+hit.normal[2]];
        if(hit.distance===0&&hit.normal.every(function(v){return v===0;}))before=previous.slice();
        return {x:cell[0],y:cell[1],z:cell[2],normal:hit.normal,previous:before,distance:hit.distance,point:origin.map(function(v,i){return v+dir[i]*hit.distance;}),type:type};
      }
      var axis=next[0]<next[1]?(next[0]<next[2]?0:2):(next[1]<next[2]?1:2);
      previous=cell.slice();distance=next[axis];if(!finite(distance))break;
      cell[axis]+=step[axis];next[axis]+=delta[axis];normal=[0,0,0];normal[axis]=-step[axis];
    }
    return null;
  }

  function playerBox(player) {
    var radius=finite(player.radius)?player.radius:.3,height=finite(player.height)?player.height:1.8;
    return {x1:player.x-radius,x2:player.x+radius,y1:player.y,y2:player.y+height,z1:player.z-radius,z2:player.z+radius};
  }
  function collides(world, box) {
    if('x' in box)box=playerBox(box);
    for(var y=Math.floor(box.y1+EPS);y<=Math.floor(box.y2-EPS);y++)
      for(var z=Math.floor(box.z1+EPS);z<=Math.floor(box.z2-EPS);z++)
        for(var x=Math.floor(box.x1+EPS);x<=Math.floor(box.x2-EPS);x++)
          if(collisionAt(world,x,y,z))return true;
    return false;
  }
  function clipAxis(world, box, axis, amount) {
    if(!finite(amount)||amount===0)return 0;
    var a=axis==='x'?'x':axis==='z'?'z':'y',others=['x','y','z'].filter(function(v){return v!==a;}),lo={x:box.x1,y:box.y1,z:box.z1},hi={x:box.x2,y:box.y2,z:box.z2};
    if(amount<0)lo[a]+=amount;else hi[a]+=amount;
    for(var y=Math.floor(lo.y+EPS);y<=Math.floor(hi.y-EPS);y++)
      for(var z=Math.floor(lo.z+EPS);z<=Math.floor(hi.z-EPS);z++)
        for(var x=Math.floor(lo.x+EPS);x<=Math.floor(hi.x-EPS);x++) {
          if(!collisionAt(world,x,y,z))continue;
          var pos={x:x,y:y,z:z};
          if(others.some(function(o){return box[o+'2']<=pos[o]+EPS||box[o+'1']>=pos[o]+1-EPS;}))continue;
          if(amount>0&&box[a+'2']<=pos[a]+EPS)amount=Math.min(amount,Math.max(0,pos[a]-box[a+'2']));
          if(amount<0&&box[a+'1']>=pos[a]+1-EPS)amount=Math.max(amount,Math.min(0,pos[a]+1-box[a+'1']));
        }
    return amount;
  }
  function depenetratePlayer(world, player) {
    if(!collides(world,player))return false;
    var y0=player.y;
    for(var dy=.1;dy<=3.001;dy+=.1){player.y=y0+dy;if(!collides(world,player)){player.vy=0;return true;}}
    player.y=y0;
    var x0=player.x,z0=player.z,offsets=[[.7,0],[-.7,0],[0,.7],[0,-.7],[.7,.7],[-.7,-.7]];
    for(var i=0;i<offsets.length;i++){player.x=x0+offsets[i][0];player.z=z0+offsets[i][1];if(!collides(world,player)){player.vy=0;return true;}}
    player.x=x0;player.z=z0;return false;
  }
  function movePlayer(world, player, input, dt) {
    if(!world||!player||![player.x,player.y,player.z].every(finite))return player;
    input=input||{};dt=finite(dt)?clamp(dt,0,.05):0;
    if(!finite(player.radius))player.radius=.3;if(!finite(player.height))player.height=1.8;
    if(!finite(player.vy))player.vy=0;if(!dt)return player;
    depenetratePlayer(world,player);
    var startX=player.x,startZ=player.z,dx=finite(input.dx)?input.dx:0,dz=finite(input.dz)?input.dz:0,len=Math.hypot(dx,dz);
    if(len>1){dx/=len;dz/=len;}
    var speed=input.sprint?5.6:4.3;dx*=speed*dt;dz*=speed*dt;
    if(input.jump&&player.onGround){player.vy=7;player.onGround=false;}
    var requestedY=player.vy*dt-10*dt*dt;player.vy=Math.max(-30,player.vy-20*dt);
    var dy=clipAxis(world,playerBox(player),'y',requestedY);player.y+=dy;
    player.onGround=requestedY<0&&Math.abs(dy-requestedY)>EPS;
    if(Math.abs(dy-requestedY)>EPS)player.vy=0;
    // Matches the inspected high-level order: vertical first, then the larger
    // horizontal component. Full-game stepping, fluids and drag are omitted.
    var order=Math.abs(dx)>=Math.abs(dz)?['x','z']:['z','x'];
    order.forEach(function(axis){var requested=axis==='x'?dx:dz,actual=clipAxis(world,playerBox(player),axis,requested);player[axis]+=actual;});
    player.walked=(player.walked||0)+Math.hypot(player.x-startX,player.z-startZ);
    return player;
  }

  function computeLighting(world, sources) {
    var w=world.w,h=world.h,d=world.d,total=w*h*d,block=new Uint8Array(total),sky=new Uint8Array(total),index=function(x,y,z){return (y*d+z)*w+x;},opaque=new Uint8Array(total),emit=[];
    for(var y=0;y<h;y++)for(var z=0;z<d;z++)for(var x=0;x<w;x++){var t=at(world,x,y,z),i=index(x,y,z);opaque[i]=solid(t)?1:0;if(t===8)emit.push([x,y,z,14]);}
    if(Array.isArray(sources))emit=emit.concat(sources);
    var queue=[];
    emit.forEach(function(s){var x=Math.floor(s[0]),y=Math.floor(s[1]),z=Math.floor(s[2]),level=clamp(Math.floor(s[3]===undefined?14:s[3]),0,15);if(!inWorld(world,x,y,z)||!finite(level)||!level)return;var i=index(x,y,z);if(level>block[i]){block[i]=level;queue.push(i);}});
    function spread(values,work){for(var head=0;head<work.length;head++){var i=work[head],level=values[i];if(level<=1)continue;var x=i%w,z=Math.floor(i/w)%d,y=Math.floor(i/(w*d));for(var a=0;a<6;a++){var off=DIRECTIONS[a],xx=x+off[0],yy=y+off[1],zz=z+off[2];if(xx<0||xx>=w||yy<0||yy>=h||zz<0||zz>=d)continue;var n=index(xx,yy,zz);if(!opaque[n]&&values[n]<level-1){values[n]=level-1;work.push(n);}}}}
    spread(block,queue);queue=[];
    for(var zz=0;zz<d;zz++)for(var xx=0;xx<w;xx++)for(var yy=h-1;yy>=0;yy--){var i=index(xx,yy,zz);if(opaque[i])break;sky[i]=15;queue.push(i);}
    spread(sky,queue);
    return {block:block,sky:sky,sample:function(x,y,z){x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);if(!inWorld(world,x,y,z))return [0,y<0?0:15];var n=index(x,y,z);return [block[n],sky[n]];}};
  }

  var HARDNESS={stone:1.5,cobblestone:2,dirt:.5,grass:.6,log:2,leaves:.2,torch:0};
  var MATERIAL_NAMES={1:'stone',2:'dirt',3:'grass',5:'log',6:'leaves',7:'stone',8:'torch',9:'cobblestone'};
  function miningProgress(seconds, material, tool) {
    if(!finite(seconds)||seconds<0)return 0;
    var name=typeof material==='number'?MATERIAL_NAMES[material]:String(material||'').toLowerCase();
    if(name==='reference'||name==='reference_stone')name='stone';
    if(!Object.prototype.hasOwnProperty.call(HARDNESS,name))return 0;
    var hardness=HARDNESS[name];if(hardness===0)return 1;
    var pick=tool==='pickaxe'||tool==='iron_pickaxe',needsPick=name==='stone'||name==='cobblestone',speed=pick&&needsPick?6:1,correct=!needsPick||pick,divisor=correct?30:100;
    // Ordinary grounded, unenchanted, dry mining at the default 20 Hz target.
    var ticks=Math.floor(seconds*20+1e-7);
    return clamp(ticks*speed/hardness/divisor,0,1);
  }
  var api={solid:solid,raycast:raycast,playerBox:playerBox,collides:collides,clipAxis:clipAxis,depenetratePlayer:depenetratePlayer,movePlayer:movePlayer,computeLighting:computeLighting,miningProgress:miningProgress};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.MinecraftPlayCore=api;
})(typeof window!=='undefined'?window:globalThis);
