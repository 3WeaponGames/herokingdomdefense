"use strict";
// Shared by the character authoring preview and the live renderer. Work on
// instance slots only; never edit shared skeleton/skin data or animation tracks.
function worldVertices(bone, output, offset, stride) {
  this._characterCompute.call(this, this._characterBone || bone, output, offset, stride);
}
function region(spine, texture, width, height) {
  var value = new spine.TextureAtlasRegion();
  value.texture = texture; value.u = value.v = 0; value.u2 = value.v2 = 1;
  value.width = value.originalWidth = width; value.height = value.originalHeight = height;
  value.offsetX = value.offsetY = 0; value.rotate = false;
  return value;
}
function createAttachment(spine, skeleton, part, asset, texture) {
  var attachment = new spine.RegionAttachment("character:" + part.id);
  attachment.setRegion(region(spine, texture, asset.width, asset.height));
  attachment.x = part.x || 0; attachment.y = part.y || 0;
  attachment.rotation = part.rotation || 0;
  attachment.scaleX = part.scaleX === undefined ? 1 : part.scaleX;
  attachment.scaleY = part.scaleY === undefined ? 1 : part.scaleY;
  attachment.width = asset.width; attachment.height = asset.height;
  var tint = /^#[a-f0-9]{6}$/i.test(part.tint) ? part.tint.slice(1) : "ffffff";
  attachment.color.set(parseInt(tint.slice(0, 2), 16) / 255, parseInt(tint.slice(2, 4), 16) / 255, parseInt(tint.slice(4, 6), 16) / 255, part.opacity === undefined ? 1 : part.opacity);
  attachment._characterBone = skeleton.findBone(part.bone);
  if (!attachment._characterBone) throw Error("Missing anchor bone: " + part.bone);
  attachment._characterCompute = spine.RegionAttachment.prototype.computeWorldVertices;
  attachment.computeWorldVertices = worldVertices;
  attachment.updateOffset();
  return attachment;
}
function sameOrder(a, b) { return a && a.length === b.length && a.every(function (slot, index) { return slot === b[index]; }); }
function restore(state) {
  if (!state) return;
  state.slots.forEach(function (record, slot) {
    if (slot.getAttachment() === record.applied) slot.setAttachment(record.original);
  });
  if (sameOrder(state.appliedOrder, state.skeleton.drawOrder)) state.skeleton.drawOrder = state.order.slice();
  state.slots.clear(); state.appliedOrder = null;
  if (state.colors) { state.colors.forEach(function (record, slot) { if (slot.color.a === record.applied) slot.color.a = record.original; }); state.colors.clear(); }
  if (state.skinColors) { state.skinColors.forEach(function (record, slot) {
    if (slot.color.r === record.applied[0] && slot.color.g === record.applied[1] && slot.color.b === record.applied[2]) {
      slot.color.r = record.original[0]; slot.color.g = record.original[1]; slot.color.b = record.original[2];
    }
  }); state.skinColors.clear(); }
}
function isFacialSlot(name) {
  return /(?:^|\/)(?:Eyes?(?:[_/]|$)|Ani_Eye(?:\/|$))/i.test(name);
}
var DEFAULT_SKIN_TINT = "#f3c89f";
function isSkinSlot(name) { return /(?:^|\/)Rider\/Body(?:\/Head)?$/.test(name); }
function skinTint(profile) {
  return profile && profile.base && /^character-maker\//.test(profile.base.source || "") ? profile.skinTint || DEFAULT_SKIN_TINT : null;
}
function prepare(spine, skeleton, parts, assets, textures, options) {
  var state = { skeleton: skeleton, slots: new Map(), colors: new Map(), entries: [], order: skeleton.drawOrder.slice(), appliedOrder: null,
    faceSlots: options && options.faceless ? skeleton.slots.filter(function (slot) { return isFacialSlot(slot.data.name); }) : [],
    skinColors: new Map(), skinSlots: options && options.skinTint ? skeleton.slots.filter(function (slot) { return isSkinSlot(slot.data.name); }) : [],
    skinTint: options && options.skinTint };
  parts.forEach(function (part) {
    var slot = skeleton.findSlot(part.slot), asset = assets[part.sprite], texture = textures[part.sprite];
    if (!slot || !asset || !texture) throw Error("Character part is unavailable: " + part.id);
    state.entries.push({ part: part, slot: slot, visibility: /^Rider\//.test(part.slot) ? skeleton.findSlot('Rider/Body') : null, attachment: createAttachment(spine, skeleton, part, asset, texture) });
  });
  return state;
}
function apply(state) {
  if (!state) return;
  var skeleton = state.skeleton;
  if (sameOrder(state.appliedOrder, skeleton.drawOrder)) skeleton.drawOrder = state.order.slice();
  else state.order = skeleton.drawOrder.slice();
  function replace(slot, attachment) {
      var old = state.slots.get(slot), current = slot.getAttachment();
      if (!old) { old = { original: current, applied: attachment }; state.slots.set(slot, old); }
      else { if (current !== old.applied) old.original = current; old.applied = attachment; }
      slot.setAttachment(attachment);
  }
  state.entries.forEach(function (entry) {
    replace(entry.slot, entry.attachment);
    if (entry.part.forceVisible) { var alpha = entry.visibility ? entry.visibility.color.a : 1, previous = state.colors.get(entry.slot); if (!previous || entry.slot.color.a !== previous.applied) previous = { original: entry.slot.color.a }; previous.applied = alpha; state.colors.set(entry.slot, previous); entry.slot.color.a = alpha; }
    (entry.part.hideSlots || []).forEach(function (name) { var slot = skeleton.findSlot(name); if (slot) replace(slot, null); });
    var at = skeleton.drawOrder.indexOf(entry.slot), offset = entry.part.order || 0;
    if (offset && at >= 0) { skeleton.drawOrder.splice(at, 1); skeleton.drawOrder.splice(Math.max(0, Math.min(skeleton.drawOrder.length, at + offset)), 0, entry.slot); }
  });
  (state.faceSlots || []).forEach(function (slot) { replace(slot, null); });
  (state.skinSlots || []).forEach(function (slot) {
    var record = state.skinColors.get(slot), color = slot.color;
    if (!record || color.r !== record.applied[0] || color.g !== record.applied[1] || color.b !== record.applied[2]) record = { original: [color.r, color.g, color.b] };
    record.applied = record.original.map(function (value, index) { return value * parseInt(state.skinTint.slice(1 + index * 2, 3 + index * 2), 16) / 255; });
    color.r = record.applied[0]; color.g = record.applied[1]; color.b = record.applied[2]; state.skinColors.set(slot, record);
  });
  state.appliedOrder = skeleton.drawOrder.slice();
}
function actorKey(actor, type) {
  if (type === "hero") return "hero:hero:default";
  var form = type === "enemy" && actor.spIdx !== undefined ? String(actor.spIdx + 1) : "default";
  return type + ":" + actor.cfg.ID + ":" + form;
}
exports.prepare = prepare; exports.apply = apply; exports.restore = restore;
exports.createAttachment = createAttachment; exports.actorKey = actorKey;
exports.isFacialSlot = isFacialSlot;
exports.isSkinSlot = isSkinSlot; exports.skinTint = skinTint; exports.DEFAULT_SKIN_TINT = DEFAULT_SKIN_TINT;
