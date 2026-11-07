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
  attachment.color.set(1, 1, 1, part.opacity === undefined ? 1 : part.opacity);
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
}
function prepare(spine, skeleton, parts, assets, textures) {
  var state = { skeleton: skeleton, slots: new Map(), entries: [], order: skeleton.drawOrder.slice(), appliedOrder: null };
  parts.forEach(function (part) {
    var slot = skeleton.findSlot(part.slot), asset = assets[part.sprite], texture = textures[part.sprite];
    if (!slot || !asset || !texture) throw Error("Character part is unavailable: " + part.id);
    state.entries.push({ part: part, slot: slot, attachment: createAttachment(spine, skeleton, part, asset, texture) });
  });
  return state;
}
function apply(state) {
  if (!state) return;
  var skeleton = state.skeleton;
  if (sameOrder(state.appliedOrder, skeleton.drawOrder)) skeleton.drawOrder = state.order.slice();
  else state.order = skeleton.drawOrder.slice();
  state.entries.forEach(function (entry) {
    function replace(slot, attachment) {
      var old = state.slots.get(slot), current = slot.getAttachment();
      if (!old) { old = { original: current, applied: attachment }; state.slots.set(slot, old); }
      else { if (current !== old.applied) old.original = current; old.applied = attachment; }
      slot.setAttachment(attachment);
    }
    replace(entry.slot, entry.attachment);
    (entry.part.hideSlots || []).forEach(function (name) { var slot = skeleton.findSlot(name); if (slot) replace(slot, null); });
    var at = skeleton.drawOrder.indexOf(entry.slot), offset = entry.part.order || 0;
    if (offset && at >= 0) { skeleton.drawOrder.splice(at, 1); skeleton.drawOrder.splice(Math.max(0, Math.min(skeleton.drawOrder.length, at + offset)), 0, entry.slot); }
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
