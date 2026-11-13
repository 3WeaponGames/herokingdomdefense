"use strict";
// Visual sizes only. Mount pivots, crop positions and combat geometry stay authored.
var keys = ["weapon", "farmBeds", "bombs", "scarecrows"];
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
function apply(component, row) {
  var skeleton = component && component._skeleton;if (!skeleton) return;
  var signature=keys.map(function(k){return value(row,k);}).join(":"),state=component._buildingPartScale;
  if(!state || state.skeleton!==skeleton || state.signature!==signature)state=component._buildingPartScale={skeleton:skeleton,signature:signature,copies:[],slots:skeleton.slots.filter(function(s){return /^td__|^mill_addon_td__/.test(s.data.name);})};
  state.slots.forEach(function(slot){
    var current=slot.getAttachment();if(!current)return;
    var base=current._buildingPartScaleSource || current,k=kind(slot.data.name,base);if(!k)return;
    var factor=value(row,k);if(factor===1){if(current!==base)slot.setAttachment(base);return;}
    var entry=state.copies.find(function(c){return c.base===base;});
    if(!entry){
      var copy=Object.assign(Object.create(Object.getPrototypeOf(base)),base);
      ["offset","uvs"].forEach(function(key){if(base[key])copy[key]=base[key].slice();});
      if(base.color)copy.color=Object.assign(Object.create(Object.getPrototypeOf(base.color)),base.color);
      copy._buildingPartScaleSource=base;resize(copy,base,factor,k!=="farmBeds");if(copy.updateOffset)copy.updateOffset();
      entry={base:base,copy:copy};state.copies.push(entry);
    }
    if(current!==entry.copy)slot.setAttachment(entry.copy);
  });
}
exports.keys=keys;exports.valid=valid;exports.value=value;exports.available=available;exports.json=json;exports.apply=apply;
