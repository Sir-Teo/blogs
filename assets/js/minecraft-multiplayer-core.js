/* Confirmed world + pending edits. An original readable multiplayer protocol. */
(function(root){
 'use strict';
 var Build=root.MinecraftBuildCore,Physics=root.MinecraftPlayCore;
 if(typeof module!=='undefined'&&module.exports){Build=require('./minecraft-build-core.js');Physics=require('./minecraft-play-core.js');}
 function pose(p){return {x:p.x,y:p.y,z:p.z,vy:p.vy||0,onGround:!!p.onGround,radius:.3,height:1.8,walked:p.walked||0};}
 function index(p){return (p[1]*16+p[2])*16+p[0];}
 function address(p){return Array.isArray(p)&&p.length===3&&p.every(Number.isInteger)&&p[0]>=0&&p[0]<16&&p[1]>=0&&p[1]<32&&p[2]>=0&&p[2]<16;}
 function commandMove(w,p,i){Physics.movePlayer(w,p,{dx:Math.sin(i.yaw)*i.forward+Math.cos(i.yaw)*i.side,dz:Math.cos(i.yaw)*i.forward-Math.sin(i.yaw)*i.side,jump:i.jump,sprint:i.sprint},.05);}
 function lerpAngle(a,b,t){var d=((b-a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;return a+d*t;}
 function interpolate(samples,time){
  if(!samples||!samples.length)return null;var a=samples[0],b=samples[samples.length-1];
  for(var n=1;n<samples.length;n++)if(samples[n].at>=time){a=samples[n-1];b=samples[n];break;}
  var t=b.at===a.at?1:Math.max(0,Math.min(1,(time-a.at)/(b.at-a.at))),p=Object.assign({},b.player);
  if(Math.hypot(b.player.x-a.player.x,b.player.y-a.player.y,b.player.z-a.player.z)>4)t=1;
  ['x','y','z','pitch'].forEach(function(k){p[k]=a.player[k]+(b.player[k]-a.player[k])*t;});p.yaw=lerpAngle(a.player.yaw,b.player.yaw,t);return p;
 }
 function Replica(){this.world=Build.volume(16,32,16);this.confirmed=new Uint16Array(8192);this.pending=new Map();this.history=[];this.tracks=new Map();this.players=[];this.player=null;this.id=null;this.revision=0;this.tick=0;this.inputSeq=0;this.actionSeq=0;this.lastAck=0;this.inventory={cobblestone:32,torch:8};this.accepted=0;this.rejected=0;this.ready=false;this.lastResult=null;}
 Replica.prototype.project=function(){var next=this.confirmed.slice();this.pending.forEach(function(a){next[index(a.position)]=a.typeValue;});var changed=false;for(var i=0;i<next.length;i++)if(next[i]!==this.world.data[i]){changed=true;break;}if(changed){this.world.data.set(next);this.world.version++;}return changed;};
 Replica.prototype.snapshot=function(m){
  if(!Array.isArray(m.dimensions)||m.dimensions.join(',')!=='16,32,16'||!Array.isArray(m.cells)||m.cells.length!==8192||!m.cells.every(function(t){return Number.isInteger(t)&&t>=0&&t<=9;})||!Number.isSafeInteger(m.revision)||m.revision<0)throw Error('The server sent an incompatible world.');
  this.confirmed.set(m.cells);this.revision=m.revision;this.pending.clear();this.history=[];this.project();
 };
 Replica.prototype.state=function(m,now){
  if(!Array.isArray(m.players)||!m.players.every(function(p){return p&&typeof p.id==='string'&&['x','y','z','yaw','pitch'].every(function(k){return Number.isFinite(p[k]);});}))throw Error('The server sent invalid player data.');
  if(Number.isFinite(m.tick)&&m.tick<this.tick)return;this.tick=m.tick||this.tick;
  var ids=new Set(),self=this;m.players.forEach(function(p){ids.add(p.id);var track=self.tracks.get(p.id)||[];track.push({at:now,player:Object.assign({},p)});if(track.length>16)track.shift();self.tracks.set(p.id,track);});this.tracks.forEach(function(v,k){if(!ids.has(k))self.tracks.delete(k);});this.players=m.players;
  var own=m.players.find(function(p){return p.id===self.id;});
  if(own){this.history=this.history.filter(function(i){return i.seq>own.inputSeq;});this.player=pose(own);this.history.forEach(function(i){commandMove(self.world,self.player,i);});this.inputSeq=Math.max(this.inputSeq,own.inputSeq||0);}
  if(m.inventory&&Number.isInteger(m.inventory.cobblestone)&&Number.isInteger(m.inventory.torch))this.inventory=Object.assign({},m.inventory);
 };
 Replica.prototype.welcome=function(m,now){if(m.protocol!==1)throw Error('The server protocol is not compatible with this build.');this.snapshot(m);this.id=m.playerId;this.room=m.room;this.token=m.token;this.hostId=m.hostId;this.actionSeq=m.actionSeq||0;this.state(m,now);var p=this.players.find(function(p){return p.id===m.playerId;});if(!p)throw Error('Your player was missing from the world.');this.yaw=p.yaw;this.pitch=p.pitch;this.ready=true;};
 Replica.prototype.input=function(intent){var m=Object.assign({type:'input',seq:++this.inputSeq},intent);this.history.push(m);if(this.history.length>160)this.history.shift();if(this.player)commandMove(this.world,this.player,m);return m;};
 Replica.prototype.predict=function(seq,position,typeValue){if(!address(position)||![0,8,9].includes(typeValue))return false;this.pending.set(seq,{position:position.slice(),typeValue:typeValue});return this.project();};
 Replica.prototype.block=function(m){if(!address(m.position)||!Number.isInteger(m.typeValue)||m.typeValue<0||m.typeValue>9||!Number.isSafeInteger(m.revision)||m.revision<this.revision)return false;this.confirmed[index(m.position)]=m.typeValue;this.revision=m.revision;return this.project();};
 Replica.prototype.ack=function(m){
  if(!Number.isSafeInteger(m.seq)||m.seq<=this.lastAck)return false;this.lastAck=m.seq;var changed=false,self=this;this.pending.forEach(function(v,k){if(k<=m.seq){self.pending.delete(k);changed=true;}});
  if(address(m.position)&&Number.isInteger(m.typeValue)&&m.typeValue>=0&&m.typeValue<=9&&m.revision>=this.revision){this.confirmed[index(m.position)]=m.typeValue;this.revision=m.revision;changed=true;}
  if(m.inventory)this.inventory=Object.assign({},m.inventory);if(m.kind==='break-finish'||m.kind==='place'){if(m.accepted&&m.changed)this.accepted++;else if(!m.accepted)this.rejected++;this.lastResult={seq:m.seq,accepted:m.accepted,reason:m.reason};}
  return changed?this.project():false;
 };
 Replica.prototype.remote=function(time){var self=this,out=[];this.tracks.forEach(function(track,id){if(id!==self.id){var p=interpolate(track,time);if(p){var last=track[track.length-1],previous=track[Math.max(0,track.length-2)];p.walking=Math.hypot(last.player.x-previous.player.x,last.player.z-previous.player.z)>.002;out.push(p);}}});return out;};
 var api={Replica:Replica,pose:pose,interpolate:interpolate,lerpAngle:lerpAngle,address:address,index:index};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MinecraftMultiplayerCore=api;
})(typeof window!=='undefined'?window:globalThis);
