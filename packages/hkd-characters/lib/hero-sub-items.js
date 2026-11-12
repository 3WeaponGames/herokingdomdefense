'use strict';
// Empty sockets on the published hero horse. Their parents are the torso and
// the bone with the strongest influence over the head mesh, not the mane.
const sockets={
  body:{name:'Mount/Equipment/Sub_Item/Body',parent:'horse_s_3',x:16,y:-50,rotation:0},
  head:{name:'Mount/Equipment/Sub_Item/Head',parent:'horse_s_7',x:36,y:0,rotation:52}
};
function style(context){
  if(typeof context==='string')return context;
  if(!context)return null;
  if(context.style)return context.style;
  const base=context.base||context,fields=String(base.id||'').split(':');return base.type==='item'?fields[fields.length-1]:null;
}
function target(context){const value=style(context);return value==='fighter'||value==='bruiser'?sockets.body:value==='vanguard'?sockets.head:null;}
function ensure(rig){
  const root=rig.bones.find(bone=>!bone.parent),scaleX=.78/Math.abs(root.scaleX||1),scaleY=.78/Math.abs(root.scaleY||1);
  for(const socket of Object.values(sockets)){
    if(!rig.bones.some(bone=>bone.name===socket.parent))throw Error('Hero horse is missing '+socket.parent);
    if(!rig.bones.some(bone=>bone.name===socket.name))rig.bones.push({...socket,scaleX,scaleY});
    if(!rig.slots.some(slot=>slot.name===socket.name))rig.slots.push({name:socket.name,bone:socket.name,color:'ffffffff'});
  }
  return rig;
}
function isSocket(slot){return !!slot&&Object.values(sockets).some(socket=>socket.name===slot.name);}
module.exports={sockets,style,target,ensure,isSocket};
