"use strict";
// An explicitly authored north-facing gate reuses its original atlas pages.
// Shared imported assets and legacy gates are never changed.
var Facing = require("GateFacing"), serial = 0;
function valid(value) { return !!value && (typeof cc === "undefined" || !cc.isValid || cc.isValid(value,true)); }
function liveComponent(value) { return valid(value)&&valid(value.node); }
function release(record) {
  if (liveComponent(record.component) && record.component.skeletonData === record.clone) record.component.skeletonData = record.source;
  if (record.clone.decRef) record.clone.decRef();
  else if (record.clone.destroy) record.clone.destroy();
  if (record.source.decRef) record.source.decRef();
}
function dispose(owner) {
  var state = owner && owner._gateFacingRuntime;
  if (!state) return;
  state.records.forEach(release);delete owner._gateFacingRuntime;
}
function apply(owner) {
  if (!owner) return;
  if (!Facing.valid(owner.wallFacing) || !Facing.reverse(owner.wallFacing)) { dispose(owner);return; }
  var state = owner._gateFacingRuntime || (owner._gateFacingRuntime = { records: [] });
  [owner.ndAniMain, owner.ndAniDown].forEach(function (component) {
    if (!liveComponent(component) || !component.skeletonData) return;
    var record = state.records.find(function (entry) { return entry.component === component; });
    if (record && component.skeletonData === record.clone) return;
    if (record) { release(record);state.records.splice(state.records.indexOf(record), 1); }
    var source = component.skeletonData, json = source.skeletonJson;
    if (!json) throw new Error("Outward gate mirroring requires its authored Spine JSON.");
    var mirrored = Facing.mirrorJson(json);
    if (mirrored === json) return;
    var clone = new sp.SkeletonData();
    clone.skeletonJson = mirrored;clone.atlasText = source.atlasText;
    clone.textures = (source.textures || []).slice();clone.textureNames = (source.textureNames || []).slice();clone.scale = source.scale;
    clone.name = (source.name || "Gate") + " outward";
    clone._uuid = (source._uuid || source.name || "gate") + "@outward:" + (++serial);
    if (clone.getRuntimeData && !clone.getRuntimeData()) { if (clone.destroy) clone.destroy();throw new Error("The mirrored gate animation could not be parsed."); }
    if (source.addRef) source.addRef();if (clone.addRef) clone.addRef();
    record = { component: component, source: source, clone: clone };state.records.push(record);
    component.skeletonData = clone;
  });
}
exports.apply = apply;
exports.dispose = dispose;
