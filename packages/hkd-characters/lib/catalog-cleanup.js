'use strict';
const Catalog=require('./character-catalog'),Library=require('./unit-library'),Placement=require('./placement');
function prepare(root,input){
  const data=JSON.parse(JSON.stringify(input)),removed=Catalog.prune(data),maker=Library.describe(root,Catalog.maker,true).layers[0],assets=new Map(Library.load(root).parts.map(part=>[part.id,part])),changed=[];
  for(const [id,profile]of Object.entries(data.profiles)){
    if(Catalog.owner(data,id))continue;
    if(profile.base.type==='ally'&&profile.base.source!==Catalog.maker){
      const previous=new Set(profile.parts.map(part=>part.layer));profile.base.source=Catalog.maker;delete profile.base.currentModel;delete profile.base.model;
      for(const part of profile.parts){part.layer=maker.uuid;const socket=Placement.socket(maker,assets.get(part.sprite)||{id:part.sprite});if(!maker.json.slots.some(slot=>slot.name===part.slot)&&socket){part.slot=socket.name;part.bone=socket.bone;Object.assign(part,Placement.intended(assets.get(part.sprite)||{}));}part.hideSlots=part.hideSlots.filter(name=>maker.json.slots.some(slot=>slot.name===name));}
      for(const key of ['skins','models'])if(profile[key])for(const layer of previous)if(layer!==maker.uuid&&profile[key][layer]!==undefined){profile[key][maker.uuid]=profile[key][layer];delete profile[key][layer];}
      changed.push(id);
    }else if(profile.base.type==='enemy'&&!profile.base.currentModel){
      if(profile.base.source)profile.base.appearance=profile.base.source;delete profile.base.source;profile.base.currentModel=true;changed.push(id);
    }
    if(profile.base.mount&&!profile.mount){const horse=require('./mounts').describe(root,profile.base,true).layers.find(layer=>layer.mount),skin=profile.skins&&profile.skins[horse.uuid]||horse.skin,entry=require('./original-mounts').assets().find(asset=>asset.mount===profile.base.mount&&asset.skin===skin);if(entry){profile.mount=entry.id;changed.push(id);}}
  }
  return {data,removed,changed:[...new Set(changed)]};
}
module.exports={prepare};
