'use strict';
// A new, independently editable blue-tier skin starts with the green outfit.
// Keep existing skin identifiers, meshes, animation clocks and saved fits.
const order=['lv1','lv2','lv_blue','lv3','lv4'];
const clone=value=>JSON.parse(JSON.stringify(value));
function ensure(rig){
  const names=new Set(rig.skins.map(skin=>skin.name)),skins=[];
  for(const skin of rig.skins){
    skins.push(skin);
    if(!/(?:^|_)lv2$/.test(skin.name))continue;
    const name=skin.name.replace(/lv2$/,'lv_blue');
    if(!names.has(name)){skins.push({...clone(skin),name});names.add(name);}
    for(const animation of Object.values(rig.animations||{}))if(animation.deform&&animation.deform[skin.name]&&!animation.deform[name])animation.deform[name]=clone(animation.deform[skin.name]);
  }
  rig.skins=skins;
  rig._equipmentTiers={...(rig._equipmentTiers||{}),...Object.fromEntries(order.map((skin,index)=>[skin,index+1]))};
  return rig;
}
function icons(catalog){
  for(const variants of Object.values(catalog))for(const [name,value]of Object.entries(variants))if(/(?:^|_)lv2$/.test(name)&&!variants[name.replace(/lv2$/,'lv_blue')])variants[name.replace(/lv2$/,'lv_blue')]=clone(value);
  return catalog;
}
module.exports={ensure,icons,order};
