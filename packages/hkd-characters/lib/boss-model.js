'use strict';
const clone=value=>JSON.parse(JSON.stringify(value));
function metadata(rig){return rig&&rig._fantasy||null;}
function validate(rig,settings){
  if(settings===undefined)return;
  const meta=metadata(rig);if(!meta||!settings||typeof settings!=='object'||Array.isArray(settings))throw Error('Choose a customizable Fantasy model.');
  for(const [name,part]of Object.entries(settings.slots||{})){
    const slot=meta.slots[name];if(!slot||!part||typeof part!=='object'||Array.isArray(part))throw Error('This model does not have that customizable part.');
    if(part.variant!==undefined&&!slot.variants.includes(part.variant))throw Error('Choose an outfit made for this part.');
    if(part.tint!==undefined&&!/^#[a-f0-9]{6}$/i.test(part.tint))throw Error('Choose a valid part color.');
    if(part.visible!==undefined&&typeof part.visible!=='boolean')throw Error('Part visibility must be enabled or disabled.');
    for(const key of ['x','y','rotation','scaleX','scaleY'])if(part[key]!==undefined){const value=part[key],scale=/scale/.test(key);if(typeof value!=='number'||!Number.isFinite(value)||(scale&&(value<.01||value>20))||(!scale&&Math.abs(value)>4096))throw Error('Part transform is outside the supported range.');}
  }
  if(settings.expression!==undefined&&(!Number.isInteger(settings.expression)||!(meta.expressions||[]).some(group=>group.field==='Head'&&group.states[settings.expression])))throw Error('Choose an expression supplied with this model.');
}
function apply(rig,settings){
  validate(rig,settings);if(!settings)return rig;
  const skin=rig.skins.find(skin=>skin.name==='default')||rig.skins[0];
  for(const [name,part]of Object.entries(settings.slots||{})){
    const emitter=rig.bones.find(bone=>bone.name==='__fx/emitter'),slot=rig.slots.find(slot=>slot.name===name),original=slot&&skin.attachments[name]&&skin.attachments[name][slot.attachment];
    const origin=emitter&&slot&&emitter.parent===slot.bone&&original?{x:emitter.x||0,y:emitter.y||0,attachment:clone(original)}:null;
    if(part.variant){const source=rig.skins.find(skin=>skin.name===part.variant);if(source&&source.attachments[name])skin.attachments[name]=clone(source.attachments[name]);}
    if(origin){const next=skin.attachments[name][slot.attachment]||Object.values(skin.attachments[name])[0],sx=part.scaleX===undefined?1:part.scaleX,sy=part.scaleY===undefined?1:part.scaleY,angle=(part.rotation||0)*Math.PI/180,dx=(origin.x-(original.x||0))*next.width/original.width*sx,dy=(origin.y-(original.y||0))*next.height/original.height*sy;emitter.x=(next.x||0)*sx+(part.x||0)+dx*Math.cos(angle)-dy*Math.sin(angle);emitter.y=(next.y||0)*sy+(part.y||0)+dx*Math.sin(angle)+dy*Math.cos(angle);emitter.scaleX*=sx;emitter.scaleY*=sy;emitter.rotation=(emitter.rotation||0)+(part.rotation||0);if(part.visible===false)for(const animation of Object.values(rig.animations))for(const [target,track]of Object.entries(animation.slots||{}))if(target.startsWith('__fx/attack-'))for(const frame of track.color||[])frame.color=frame.color.slice(0,6)+'00';}
    for(const attachment of Object.values(skin.attachments[name]||{})){
      const sx=part.scaleX===undefined?1:part.scaleX,sy=part.scaleY===undefined?1:part.scaleY;
      attachment.x=(attachment.x||0)*sx+(part.x||0);attachment.y=(attachment.y||0)*sy+(part.y||0);attachment.scaleX=(attachment.scaleX===undefined?1:attachment.scaleX)*sx;attachment.scaleY=(attachment.scaleY===undefined?1:attachment.scaleY)*sy;attachment.rotation=(attachment.rotation||0)+(part.rotation||0);
      const color=attachment.color||'ffffffff',tint=part.tint||'#ffffff';attachment.color=[0,2,4].map(at=>Math.round(parseInt(color.slice(at,at+2),16)*parseInt(tint.slice(at+1,at+3),16)/255).toString(16).padStart(2,'0')).join('')+(part.visible===false?'00':color.slice(6,8));
    }
  }
  if(settings.expression!==undefined)for(const group of rig._fantasy.expressions||[]){
    if(group.field==='Wheel')continue;const name=group.states[settings.expression];if(!name)continue;
    const slot=rig.slots.find(slot=>slot.name===group.slot);if(slot)slot.attachment=name;
    for(const animation of Object.values(rig.animations)){const slots=animation.slots||(animation.slots={}),track=slots[group.slot]||(slots[group.slot]={});track.attachment=[{time:0,name}];}
  }
  return rig;
}
module.exports={metadata,validate,apply};
