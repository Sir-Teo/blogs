/* The browser build's shared state, save format, and local edit authority. */
(function(root){
  'use strict';
  var TARGET=[8,7,7],SAVE_KEY='minecraft-browser-build-v1';
  function volume(w,h,d){
    var data=new Uint16Array(w*h*d);
    return {w:w,h:h,d:d,origin:[0,0,0],data:data,version:0,
      get:function(x,y,z){return x<0||x>=w||y<0||y>=h||z<0||z>=d?0:data[(y*d+z)*w+x];},
      set:function(x,y,z,type){if(![x,y,z,type].every(Number.isInteger)||x<0||x>=w||y<0||y>=h||z<0||z>=d||type<0||type>9)return false;var i=(y*d+z)*w+x;if(data[i]===type)return false;data[i]=type;this.version++;return true;}};
  }
  function createWorld(story){
    var base=story.scene(false,false),world=volume(16,32,16);
    world.data.set(base.data);
    for(var z=4;z<=12;z++)for(var x=3;x<=13;x++)world.set(x,5,z,1);
    world.set(5,6,7,1);
    for(var pz=1;pz<=3;pz++)for(var px=12;px<=14;px++){
      world.set(px,13,pz,1);world.set(px,14,pz,4);
      for(var py=15;py<world.h;py++)world.set(px,py,pz,0);
    }
    world.initial=world.data.slice();
    world.clear=function(){this.data.fill(0);this.version++;};
    world.generate=function(){this.data.set(this.initial);this.version++;};
    world.reset=world.generate;
    world.clear();return world;
  }
  function view(world,mode){
    var v=volume(world.w,world.h,world.d);
    if(mode==='cell')v.set(TARGET[0],TARGET[1],TARGET[2],world.get.apply(world,TARGET));
    else if(mode!=='empty'){
      v.data.set(world.data);
      for(var y=0;y<v.h;y++)for(var z=8;z<v.d;z++){var start=(y*v.d+z)*v.w;v.data.fill(0,start+8,start+v.w);}
    }
    return v;
  }
  function counts(world){
    var blocks=0,changes=0,states=new Set();
    for(var i=0;i<world.data.length;i++){var t=world.data[i];if(t)blocks++;if(world.initial&&t!==world.initial[i])changes++;states.add(t);}
    return {blocks:blocks,changes:changes,states:states.size,bytes:world.data.byteLength};
  }
  function encode(world,inventory,stage,poses){
    return JSON.stringify({format:'minecraft-browser-build',version:1,stage:stage,dimensions:[world.w,world.h,world.d],cells:Array.from(world.data),inventory:{cobblestone:inventory.cobblestone,torch:inventory.torch},poses:poses||[]});
  }
  function decode(text,world){
    if(typeof text!=='string'||text.length>1000000)throw Error('The saved world is not valid.');
    var value=JSON.parse(text);
    if(value.format!=='minecraft-browser-build'||value.version!==1||!Array.isArray(value.dimensions)||value.dimensions.join(',')!==[world.w,world.h,world.d].join(',')||!Array.isArray(value.cells)||value.cells.length!==world.data.length||!value.cells.every(function(t){return Number.isInteger(t)&&t>=0&&t<=9;})||!Number.isInteger(value.stage)||value.stage<2||value.stage>8)throw Error('This save is not compatible with this world.');
    if(!value.inventory||!['cobblestone','torch'].every(function(k){return Number.isInteger(value.inventory[k])&&value.inventory[k]>=0&&value.inventory[k]<=100000;}))throw Error('The saved inventory is not valid.');
    if(value.poses!==undefined&&(!Array.isArray(value.poses)||value.poses.length>4||!value.poses.every(function(p){return p&&typeof p.id==='string'&&p.player&&['x','y','z'].every(function(k){return Number.isFinite(p.player[k]);});})))throw Error('The saved viewpoints are not valid.');
    return value;
  }
  function authorize(world,player,action,inventory,core){
    function no(reason){return {ok:false,reason:reason};}
    if(!action||!Array.isArray(action.position)||action.position.length!==3||!action.position.every(Number.isInteger))return no('Invalid block address.');
    var p=action.position;
    if(p[0]<0||p[0]>=world.w||p[1]<=0||p[1]>=world.h||p[2]<0||p[2]>=world.d)return no('That cell is outside the editable world.');
    if(!action.camera||!['x','y','z','yaw','pitch'].every(function(k){return Number.isFinite(action.camera[k]);}))return no('Invalid viewpoint.');
    var camera=action.camera,cp=Math.cos(camera.pitch),hit=core.raycast(world,[camera.x,camera.y,camera.z],[Math.sin(camera.yaw)*cp,Math.sin(camera.pitch),Math.cos(camera.yaw)*cp],4.5);
    if(Math.hypot(camera.x-player.x,camera.y-player.y-1.62,camera.z-player.z)>.1)return no('The camera does not match the player.');
    if(!hit)return no('No block is within reach.');
    if(action.kind==='break'){
      if([hit.x,hit.y,hit.z].join(',')!==p.join(','))return no('The selected block is no longer in reach.');
      if(!Number.isFinite(action.seconds)||action.seconds<0||!['pickaxe','cobblestone','torch'].includes(action.tool))return no('Invalid mining progress.');
      if(core.miningProgress(action.seconds,hit.type,action.tool)<1)return no('Mining is not finished.');
      return {ok:true,position:p,type:0,previous:hit.type};
    }
    if(action.kind!=='place'||![8,9].includes(action.type))return no('Unknown edit.');
    if(hit.previous.join(',')!==p.join(',')||world.get.apply(world,p)!==0)return no('That space is no longer empty.');
    var item=action.type===8?'torch':'cobblestone';
    if(!(inventory[item]>0))return no('There are no '+item+' left.');
    if(action.type===8){if(!core.solid(world.get(p[0],p[1]-1,p[2])))return no('A torch needs a solid floor.');}
    else if(core.playerBox(player).x2>p[0]&&player.x-(player.radius||.3)<p[0]+1&&player.y+(player.height||1.8)>p[1]&&player.y<p[1]+1&&player.z+(player.radius||.3)>p[2]&&player.z-(player.radius||.3)<p[2]+1)return no('That block would overlap the player.');
    return {ok:true,position:p,type:action.type,previous:0};
  }
  var api={volume:volume,createWorld:createWorld,view:view,counts:counts,encode:encode,decode:decode,authorize:authorize,target:TARGET,saveKey:SAVE_KEY};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MinecraftBuildCore=api;
})(typeof window!=='undefined'?window:globalThis);
