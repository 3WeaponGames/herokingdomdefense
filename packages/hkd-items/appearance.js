'use strict';
const fs=require('fs'),path=require('path'),Tiers=require('../../assets/_script/EquipmentTiers');
const Mounts=require('../hkd-characters/lib/original-mounts'),Placement=require('../hkd-characters/lib/placement');
const read=(root,file,fallback)=>{const absolute=path.join(root,file);return fs.existsSync(absolute)?JSON.parse(fs.readFileSync(absolute,'utf8')):fallback;};
function mounts(){return Mounts.assets().filter(asset=>asset.mount==='hero-horse').map(asset=>{const result={...asset,heroMount:true,resource:asset.image.slice('assets/resources/'.length,-4)};delete result.mount;return result;});}
function icon(root,equipment,slot,level,style,parts){
  const data=read(root,'assets/resources/hero-items/catalog.json',{profiles:{},assignments:{}}),defaults=read(root,'assets/resources/hero-maker/catalog.json',{});
  const view=require('../../assets/_script/HeroWeapons').gear(style,slot,'upgrade'),custom=Tiers.profileId(data,equipment,slot,level,style),value=view&&view.icon&&!custom?view.icon:Tiers.icon(data,defaults,equipment,slot,level,style);
  if(value){const asset=(parts||[]).find(asset=>asset.id===value.id);return asset?{...asset,...value}:value.resource?{image:'assets/resources/'+value.resource+'.png',thumbnail:'assets/resources/'+value.resource+'.png',name:view&&view.name,...value}:value;}
  if(Number(slot)===6){const gear=equipment.find(row=>row.id===6),tier=Tiers.at(gear,level),profile=data.profiles[Tiers.profileId(data,equipment,slot,level,style)];return mounts().find(asset=>asset.skin===(profile&&Object.values(profile.skins||{})[0]||tier&&tier.skin));}
  return null;
}
// Recover the editable parts from the actual skin, retaining its authored fit.
// These are only a browsing seed; they are never written until the user edits.
function current(root,description,item,assets){
  const defaults=read(root,'assets/resources/hero-maker/catalog.json',{}),primary=defaults.icons&&defaults.icons[item.slot]||{},skin=([3,4,5].includes(item.slot)?(item.style||'skirmisher')+'_':'')+item.skin;
  const view=require('../../assets/_script/HeroWeapons').gear(item.style,item.slot,'upgrade'),main=assets.find(asset=>asset.id===(view&&view.kind==='offhand'&&view.icon||primary[skin]||{}).id),layer=description.layers.find(layer=>layer.uuid===description.defaultLayer),result=[];
  const candidates=[main,assets.find(asset=>asset.id==='Hero/Cape/'+item.skin),assets.find(asset=>asset.id==='HandLeft/Shield/FA_WP_Sub_Shield_012_Blue')].filter(Boolean);
  if(layer){const selected=layer.json.skins.find(skin=>skin.name===layer.skin);for(const slot of layer.json.slots){
    const attachment=Object.values(selected&&selected.attachments[slot.name]||{}).find(value=>/^part_/.test(value.path||''));if(!attachment)continue;
    const asset=candidates.find(asset=>{const socket=Placement.socket(layer,asset,layer.skin);return socket&&socket.name===slot.name&&asset.width===attachment.width&&asset.height===attachment.height;});if(!asset)continue;
    result.push({id:Placement.role(asset).toLowerCase(),sprite:asset.id,layer:layer.uuid,slot:slot.name,bone:slot.bone,x:attachment.x||0,y:attachment.y||0,rotation:attachment.rotation||0,scaleX:attachment.scaleX===undefined?1:attachment.scaleX,scaleY:attachment.scaleY===undefined?1:attachment.scaleY,opacity:1,order:0,hideSlots:[],forceVisible:item.slot!==3});
  }}
  const file=read(root,'assets/resources/characters/catalog.json',{profiles:{},assignments:{}}),base=file.profiles[file.assignments['hero:hero:default']];
  if(base)for(const part of base.parts||[])if(part.layer===description.defaultLayer){const at=result.findIndex(value=>value.slot===part.slot);if(at>=0)result.splice(at,1);result.push(JSON.parse(JSON.stringify(part)));}
  // The right-hand weapon is the primary icon, even when a shield draws first.
  result.sort((a,b)=>Number(b.sprite===main?.id)-Number(a.sprite===main?.id));
  return {parts:result,...(base&&base.models&&base.models[description.defaultLayer]?{models:{[description.defaultLayer]:base.models[description.defaultLayer]}}:{})};
}
module.exports={icon,current,mounts};
