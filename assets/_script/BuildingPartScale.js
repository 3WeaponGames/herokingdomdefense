"use strict";
// Visual sizes only. Mount pivots, crop positions and combat geometry stay authored.
var keys = ["weapon", "farmBeds", "bombs", "scarecrows"], serial = 0;
function valid(n) { return typeof n === "number" && isFinite(n) && n >= .05 && n <= 10; }
function value(row, key) { var n = row && row.PartScale && row.PartScale[key]; return valid(n) ? n : 1; }
function available(row) {
  if (row && row.Appearance && row.Appearance.weapon) return [{key:"weapon",label:"Top mount"}];
  if (row && /^mf-/.test(row.Skin || "")) return [{key:"farmBeds",label:"Farm beds"}].concat(row.MillDefense ? [{key:row.MillDefense.kind === "bomb" ? "bombs" : "scarecrows",label:row.MillDefense.kind === "bomb" ? "Bombs" : "Scarecrows"}] : []);
  return [];
}
function kind(slot, attachment) {
  if (/^td__/.test(slot)) return "farmBeds";
  if (/^mill_addon_td__/.test(slot)) return /bomb/.test(attachment.path || attachment.name || "") ? "bombs" : "scarecrows";
  return null;
}
function resize(copy, base, factor, addon) {
  copy.scaleX = (typeof base.scaleX === "number" ? base.scaleX : 1) * factor;
  copy.scaleY = (typeof base.scaleY === "number" ? base.scaleY : 1) * factor;
  // Addons grow upward from their planted feet. Beds grow around their center.
  if (addon) copy.y = (base.y || 0) + (base.height || 0) * (typeof base.scaleY === "number" ? base.scaleY : 1) * (factor - 1) / 2;
  return copy;
}
function json(source, row) {
  if (!["farmBeds","bombs","scarecrows"].some(function(k){return value(row,k)!==1;})) return source;
  var result = JSON.parse(JSON.stringify(source));
  var skins = Array.isArray(result.skins) ? result.skins.map(function(s){return s.attachments;}) : Object.keys(result.skins || {}).map(function(k){return result.skins[k];});
  skins.forEach(function(skin){Object.keys(skin || {}).forEach(function(slot){Object.keys(skin[slot]).forEach(function(name){var a=skin[slot][name],k=kind(slot,a);if(k&&value(row,k)!==1)resize(a,Object.assign({},a),value(row,k),k!=="farmBeds");});});});
  return result;
}
function live(component) { return !!component && (typeof cc === "undefined" || !cc.isValid || cc.isValid(component)); }
function currentRig(state) {
  // Logical Cocos destruction is queued. Restore actual native borrowers even
  // after TO_DESTROY, and skip getters only after the captured rig really died.
  if(state.native && typeof __isObjectValid==="function")return __isObjectValid(state.skeleton);
  var component=state.component;
  return live(component) && (!component.node || live(component.node)) && component._skeleton===state.skeleton;
}
function dispose(state) {
  if(!state || state.disposed)return;
  if(currentRig(state))state.slots.forEach(function(slot){
    if(state.native && typeof __isObjectValid==="function" && !__isObjectValid(slot))return;
    var current=slot.getAttachment(),entry=state.copies.find(function(c){return c.copy===current;});
    if(entry)slot.setAttachment(entry.base);
  });
  // Slots only borrow native attachments. Never free their private Skin before
  // all current borrowers have restored; a throwing restore leaves this state
  // and source pin intact for retry, rather than freeing an installed copy.
  if(state.ownerData){state.ownerData.destroy();state.ownerData=state.ownerSkin=null;}
  if(state.sourcePinned){state.source.decRef();state.sourcePinned=false;}
  if(state.component && state.component._buildingPartScale===state)delete state.component._buildingPartScale;
  state.disposed=true;state.component=state.skeleton=state.source=null;state.slots=[];state.copies=[];
}
function ownNativeCopies(state) {
  if(state.ownerSkin)return state.ownerSkin;
  var source=state.source,data=null;
  if(!source || typeof source.addRef!=="function" || typeof source.decRef!=="function" || !source.atlasText || !source.textures || !source.textures.length || typeof sp==="undefined" || !sp.SkeletonData)throw Error("Native part sizes require their source SkeletonData");
  try{
    source.addRef();state.sourcePinned=true;
    data=state.ownerData=new sp.SkeletonData();data.name="Building part attachment owner";
    data._uuid=(source._uuid||source.uuid||"building")+"@part-scale:"+(++serial);
    // An unrendered private Skin supplies Spine's real attachment ownership.
    // The source is pinned because copied regions borrow its atlas objects.
    data.skeletonJson={skeleton:{spine:source.skeletonJson&&source.skeletonJson.skeleton&&source.skeletonJson.skeleton.spine||"3.8"},bones:[{name:"root"}],slots:[{name:"owner",bone:"root"}],skins:[{name:"default",attachments:{}}],animations:{}};
    data.atlasText=source.atlasText;data.textures=source.textures.slice();data.textureNames=(source.textureNames||[]).slice();data.scale=source.scale;
    var runtime=data.getRuntimeData(),skin=runtime&&runtime.findSkin("default");
    if(!skin || typeof skin.setAttachment!=="function")throw Error("Native part attachment ownership unavailable");
    state.ownerSkin=skin;return skin;
  }catch(error){dispose(state);throw error;}
}
function apply(component, row) {
  var skeleton = component && component._skeleton;if (!skeleton){dispose(component&&component._buildingPartScale);return;}
  var signature=keys.map(function(k){return value(row,k);}).join(":"),state=component._buildingPartScale;
  var native=!!(typeof cc!=="undefined"&&cc.sys&&cc.sys.isNative),source=component.skeletonData;
  if(native && !source){dispose(state);return;}
  if(state && (state.disposed || state.skeleton!==skeleton || state.source!==source))dispose(state);
  state=component._buildingPartScale;
  if(!state && native && signature==="1:1:1:1")return;
  if(!state || !native && state.signature!==signature)state=component._buildingPartScale={component:component,skeleton:skeleton,source:source,native:native,signature:signature,copies:[],slots:skeleton.slots.filter(function(s){return /^td__|^mill_addon_td__/.test(s.data.name);})};
  state.signature=signature;
  state.slots.forEach(function(slot){
    var current=slot.getAttachment();if(!current)return;
    var base=current._buildingPartScaleSource || current,k=kind(slot.data.name,base);if(!k)return;
    var factor=value(row,k);if(factor===1){if(current!==base)slot.setAttachment(base);return;}
    var entry=state.copies.find(function(c){return c.base===base;});
    if(!entry){
      // Native copies need a real Skin owner; JS wrapper reachability alone
      // does not delete them. Web retains its original independent JS clone.
      var nativeCopy=native&&typeof base.copy==="function",skin=nativeCopy&&ownNativeCopies(state);
      var copy=nativeCopy?base.copy():Object.assign(Object.create(Object.getPrototypeOf(base)),base);
      if(nativeCopy)skin.setAttachment(0,"copy:"+state.copies.length,copy);
      else{
        ["offset","uvs"].forEach(function(key){if(base[key])copy[key]=base[key].slice();});
        if(base.color)copy.color=Object.assign(Object.create(Object.getPrototypeOf(base.color)),base.color);
      }
      copy._buildingPartScaleSource=base;entry={base:base,copy:copy};state.copies.push(entry);
    }
    // A previously inactive skin can return after another factor was saved.
    // Pure scalar comparison avoids native geometry work on unchanged draws.
    if(entry.factor!==factor){resize(entry.copy,base,factor,k!=="farmBeds");if(entry.copy.updateOffset)entry.copy.updateOffset();entry.factor=factor;}
    if(current!==entry.copy)slot.setAttachment(entry.copy);
  });
  return state;
}
exports.keys=keys;exports.valid=valid;exports.value=value;exports.available=available;exports.json=json;exports.apply=apply;exports.dispose=dispose;
