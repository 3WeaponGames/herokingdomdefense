"use strict";
// Native module registration gives each post its own front ground vertex.
var Assembly=require("./WallAssembly");
function multiply(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function point(m,x,y){return{x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]};}
function contacts(json,skinName,world,animation){
 var kit=json&&json.wallKit;if(!kit)return[];var skin=Array.isArray(json.skins)?json.skins.find(function(s){return s.name===skinName;}):null;if(!skin)return[];
 var matrices={},bones={};json.bones.forEach(function(b){bones[b.name]=b;});
 function bone(name){if(matrices[name])return matrices[name];var b=bones[name];if(!b)return[1,0,0,1,0,0];var x=((b.rotation||0)+(b.shearX||0))*Math.PI/180,y=((b.rotation||0)+90+(b.shearY||0))*Math.PI/180,m=[Math.cos(x)*(b.scaleX===undefined?1:b.scaleX),Math.sin(x)*(b.scaleX===undefined?1:b.scaleX),Math.cos(y)*(b.scaleY===undefined?1:b.scaleY),Math.sin(y)*(b.scaleY===undefined?1:b.scaleY),b.x||0,b.y||0];return matrices[name]=b.parent?multiply(bone(b.parent),m):m;}
 var slots=json.animations&&json.animations[animation]&&json.animations[animation].slots||{},result=[];
 json.slots.forEach(function(slot){if(!/^rts_wall_part_\d+$/.test(slot.name))return;var frames=slots[slot.name]&&slots[slot.name].attachment,name=frames&&frames.length?frames[frames.length-1].name:slot.attachment,a=skin.attachments[slot.name]&&skin.attachments[slot.name][name];if(!a)return;var match=/^rts_wall_(post|top|right|corner)_([123])(?:_body)?$/.exec(a.path||name);if(!match)return;var size=kit.sizes["rts_wall_"+match[1]+"_"+match[2]],p=Assembly.groundProfile(match[1],Number(match[2]),size)[1],angle=(a.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),m=multiply(world,bone(slot.bone)),sx=a.scaleX===undefined?1:a.scaleX,sy=a.scaleY===undefined?1:a.scaleY;
  function image(x,y){var u=(x/size[0]-.5)*a.width*sx,v=(.5-y/size[1])*a.height*sy;return point(m,(a.x||0)+c*u-s*v,(a.y||0)+s*u+c*v);}
  var foot=image(p.x,p.y),corners=[image(0,0),image(size[0],0),image(size[0],size[1]),image(0,size[1])];foot.height=Math.max(1,Math.max.apply(null,corners.map(function(p){return p.y;}))-foot.y);foot.slot=slot.name;result.push(foot);
 });return result;
}
exports.contacts=contacts;
// Door images need a separate silhouette: a nearby post's floor can sit above
// the upper leaf, and a closed pair can overlap a post in the same image column.
// Read slot indices from the detached/native rig, retaining its authored pose.
exports.leafSlots=function(json){
 if(!json||!json.wallDoor||!json.wallDoor.gate)return[];
 return (json.slots||[]).map(function(slot,index){return{name:slot.name,index:index};}).filter(function(slot){return /^rts_wall_leaf_(pair|near|far)$/.test(slot.name);});
};
exports.casterSlots=function(json){
 if(!json)return[];
 return (json.slots||[]).map(function(slot,index){return{name:slot.name,index:index,post:/^rts_wall_part_\d+$/.test(slot.name)};}).filter(function(slot){return json.wallKit&&slot.post||json.wallDoor&&json.wallDoor.gate&&/^rts_wall_leaf_(pair|near|far)$/.test(slot.name);});
};
