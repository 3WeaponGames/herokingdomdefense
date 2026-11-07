"use strict";
var Core = require("CharacterPartsCore");
var library = null, looks = null, loading = false, retryAt = 0, failures = {}, textureJobs = {}, profileKeys = new WeakMap();
function profileKey(profile) {
  if (!profileKeys.has(profile)) profileKeys.set(profile, JSON.stringify(profile));
  return profileKeys.get(profile);
}
function load() {
  if (loading || library && looks || Date.now() < retryAt) return;
  loading = true;
  function loadLooks() {
    cc.resources.load("characters/catalog", cc.JsonAsset, function (issue, data) {
      loading = false;
      if (issue) { retryAt = Date.now() + 1000; return; }
      looks = data.json; retryAt = 0;
    });
  }
  if (library) { loadLooks(); return; }
  cc.resources.load("character-parts/catalog", cc.JsonAsset, function (error, asset) {
    if (error) { loading = false; retryAt = Date.now() + 1000; return; }
    library = {}; asset.json.parts.forEach(function (part) { library[part.id] = part; });
    loadLooks();
  });
}
function texture(id) {
  var job = textureJobs[id];
  if (job && (!job.retryAt || Date.now() < job.retryAt)) return job.texture;
  var entry = library && library[id]; if (!entry) return null;
  job = textureJobs[id] = {};
  cc.resources.load(entry.resource, cc.Texture2D, function (error, image) {
    if (error || !image) { job.retryAt = Date.now() + 1000; return; }
    var adapter = new sp.SkeletonTexture({ width: image.width, height: image.height });
    adapter.setRealTexture(image); job.texture = adapter;
  });
  return null;
}
function visuals(actor, type) {
  if (type !== "hero") return [actor.getSpAni ? actor.getSpAni() : actor.spAni].filter(Boolean);
  var animation = actor.ctrPlayAni;
  return ["spAniMa", "spAniBody", "spAniDrap", "spAniHead", "spAniBow", "spAniArrow", "spAniHand"].map(function (key) { return animation[key]; }).filter(Boolean);
}
var Appearance = cc.Class({
  extends: cc.Component,
  init: function (actor, type) { this.clear(); this.owner = actor; this.team = type; load(); },
  clear: function () {
    (this.states || []).forEach(Core.restore);
    (this.models || []).forEach(function (model) {
      if (!cc.isValid(model.renderer.node)) return;
      var node = model.renderer.node;
      node.scaleX = (node.scaleX < 0 ? -1 : 1) * model.scaleX; node.scaleY = model.scaleY;
      if (model.transformed) { node.x = model.x; node.y = model.y; node.angle = model.angle; node.opacity = model.opacity; }
      if (model.appliedSkin && model.renderer._skeleton && model.renderer._skeleton.skin && model.renderer._skeleton.skin.name === model.appliedSkin && model.skin) model.renderer.setSkin(model.skin);
    });
    this.states = []; this.models = []; this.signature = "";
  },
  lateUpdate: function () {
    var actor = this.owner;
    if (!actor || !actor.node.activeInHierarchy) return;
    if (!looks || !library) load();
    if (!looks || !library || !actor.cfg && this.team !== "hero") return;
    var key = Core.actorKey(actor, this.team), id = looks.assignments[key], profile = id && looks.profiles[id];
    if (this.team === "hero") profile = require("HeroItemLooks").current(profile);
    if (!profile) { if (this.models.length) this.clear(); return; }
    var renderers = visuals(actor, this.team);
    var signature = id + ":" + profileKey(profile) + ":" + renderers.map(function (renderer) { return renderer.uuid + ":" + (renderer.skeletonData && renderer.skeletonData.uuid); }).join("|");
    if (this.signature !== signature || this.states.some(function (state) { return !renderers.some(function (renderer) { return renderer._skeleton === state.skeleton; }); })) {
      this.clear();
      var textures = {}, ready = true;
      profile.parts.forEach(function (part) { textures[part.sprite] = texture(part.sprite); if (!textures[part.sprite]) ready = false; });
      profile.parts.forEach(function (part) { if (!renderers.some(function (renderer) { return renderer.skeletonData && renderer.skeletonData.uuid === part.layer && renderer._skeleton; })) ready = false; });
      if (!ready) return;
      try {
        var pending = [], models = [];
        renderers.forEach(function (renderer) {
          var node = renderer.node;
          models.push({ renderer: renderer, scaleX: Math.abs(node.scaleX), scaleY: node.scaleY, x: node.x || 0, y: node.y || 0, angle: node.angle || 0, opacity: node.opacity === undefined ? 255 : node.opacity, skin: renderer._skeleton && renderer._skeleton.skin && renderer._skeleton.skin.name });
          var parts = profile.parts.filter(function (part) { return renderer.skeletonData && part.layer === renderer.skeletonData.uuid; });
          if (parts.length && renderer._skeleton) pending.push(Core.prepare(sp.spine, renderer._skeleton, parts, library, textures));
        });
        this.states = pending; this.models = models; this.signature = signature;
      } catch (error) { this.clear(); if (!failures[id]) { failures[id] = true; cc.warn("Character look " + id + ": " + error.message); } return; }
    }
    this.models.forEach(function (model) {
      var node = model.renderer.node, scale = profile.scale || 1;
      node.scaleX = (node.scaleX < 0 ? -1 : 1) * model.scaleX * scale; node.scaleY = model.scaleY * scale;
      var transform = profile.models && model.renderer.skeletonData && profile.models[model.renderer.skeletonData.uuid];
      if (transform) {
        node.x = model.x + (transform.x || 0); node.y = model.y + (transform.y || 0);
        node.angle = model.angle + (transform.rotation || 0); node.opacity = model.opacity * (transform.opacity === undefined ? 1 : transform.opacity);
        node.scaleX *= transform.scaleX === undefined ? 1 : transform.scaleX; node.scaleY *= transform.scaleY === undefined ? 1 : transform.scaleY; model.transformed = true;
      }
      var skin = profile.skins && model.renderer.skeletonData && profile.skins[model.renderer.skeletonData.uuid];
      var current = model.renderer._skeleton && model.renderer._skeleton.skin && model.renderer._skeleton.skin.name;
      if (skin && current !== skin) { model.skin = current; model.renderer.setSkin(skin); model.renderer.setSlotsToSetupPose(); model.appliedSkin = skin; }
    });
    this.states.forEach(Core.apply);
  },
  onDisable: function () { this.clear(); },
  onDestroy: function () { this.clear(); this.owner = null; }
});
exports.bind = function (actor, type) {
  if (!actor || !actor.node || !actor.node.addComponent || !cc.resources) return;
  var appearance = actor.node.getComponent(Appearance) || actor.node.addComponent(Appearance);
  appearance.init(actor, type); return appearance;
};
exports.reset = function (actor) {
  if (!actor || !actor.node || !actor.node.getComponent) return;
  var appearance = actor.node.getComponent(Appearance); if (appearance) appearance.clear();
};
exports.component = Appearance;
