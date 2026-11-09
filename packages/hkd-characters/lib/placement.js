'use strict';
// Socket names come from the Character Maker rig. Never resize a weapon into
// an unrelated rectangle: the pack's native pixels, pivot and PPU define fit.
function role(asset){
  const name=asset.id||'',category=asset.category||'';
  if(/(?:^|\/)Mount\//i.test(name))return /_Down(?:$|_)/i.test(name)?'Mount_Down':'Mount';
  if(/\/Crossbow\//.test(name))return /_Down$/.test(name)?'Crossbow_Down':'Crossbow';
  if(/Helmet_Hair/.test(name))return'Hair_Helmet';
  for(const value of ['Helmet','Chest','Shield','Crossbow','Sword','Axe','Blunt','Spear','Staff','Wand','Gun','Bow','Hair','Beard','Eye'])
    if(new RegExp('(?:^|/)'+value+'(?:/|$)').test(category)||new RegExp('(?:^|/)'+value+'/').test(name))return value;
  return null;
}
function layerFor(rig,asset){const value=role(asset),roles={Helmet:'wqyl_lead_tou',Hair:'wqyl_lead_tou',Hair_Helmet:'wqyl_lead_tou',Beard:'wqyl_lead_tou',Eye:'wqyl_lead_tou',Chest:'wqyl_lead_shenti',Bow:'wqyl_lead_gong',Mount:'wqyl_lead_ma',Mount_Down:'wqyl_lead_ma'};
  if(roles[value]){const found=rig.layers.find(layer=>layer.name===roles[value]);if(found)return found;}
  // Mounted rigs draw the horse first. Equipment belongs to the rider even
  // when the horse is the first or currently selected preview layer.
  const rider=rig.layers.find(layer=>!layer.mount&&layer.json&&layer.json.slots.some(slot=>/^Rider\//.test(slot.name)));
  if(rider&&value!=='Mount'&&value!=='Mount_Down')return rider;
  return rig.layers.find(layer=>layer.uuid===rig.defaultLayer)||rig.layers.find(layer=>!layer.mount)||rig.layers[0];
}
function socket(layer,asset,skin){const value=role(asset);if(!value)return null;const exact=layer.json.slots.find(slot=>slot.name.split('/').pop()===value);if(exact)return exact;
  if(value==='Helmet'&&layer.name==='wqyl_lead_tou'){const active=layer.json.skins.find(s=>s.name===(skin||layer.skin)),names=active&&active.attachments||{};return layer.json.slots.find(slot=>/headgear/i.test(slot.name)&&names[slot.name])||layer.json.slots.find(slot=>/headgear/i.test(slot.name))||null;}
  return null;
}
function intended(asset){const scale=100/(asset.pixelsPerUnit||100),pivot=asset.pivot||{x:.5,y:.5};return{x:(.5-pivot.x)*asset.width*scale,y:(.5-pivot.y)*asset.height*scale,rotation:0,scaleX:scale,scaleY:scale};}
function compatible(slot){return !!slot&&/^Rider\//.test(slot.name);}
function fitAspect(width,height,availableWidth,availableHeight){const value=Math.min(availableWidth/width,availableHeight/height);return Math.max(.01,Math.min(20,value));}
module.exports={role,layerFor,socket,intended,compatible,fitAspect};
