"use strict";
var Core = require("CharacterPartsCore");
var library = null, looks = null, loading = false, retryAt = 0, failures = {}, textureJobs = {}, profileKeys = new WeakMap();
var nativePartsNotice = false;
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
  function failed(error) {
    job.retryAt = Date.now() + 1000;
    if (error && !failures["texture:" + id]) {
      failures["texture:" + id] = true;
      if (typeof cc.warn === "function") cc.warn("Character texture " + id + ": " + (error.message || error));
    }
  }
  try {
    cc.resources.load(entry.resource, cc.Texture2D, function (error, image) {
      if (error || !image) { failed(error); return; }
      // This callback runs after lateUpdate's setup try/catch has returned.
      try {
        var adapter = new sp.SkeletonTexture({ width: image.width, height: image.height });
        adapter.setRealTexture(image); job.texture = adapter;
      } catch (issue) { failed(issue); }
    });
  } catch (issue) { failed(issue); }
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
      if (model.tinted && model.color) node.color = model.color;
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
    var renderers = visuals(actor, this.team);
    var heroBaked = this.team === "hero" ? require("HeroBakedLooks") : null;
    if (heroBaked) heroBaked.apply(renderers, profile);
    if (!profile) { if (this.models.length) this.clear(); return; }
    // Saved imported units are baked into normal Spine assets for web and
    // native play. Their equipped parts must not be overlaid a second time.
    if (this.team !== "hero" && renderers.some(function (renderer) { return renderer.skeletonData && (profile.baked && renderer.skeletonData.uuid === profile.baked.uuid || renderer.skeletonData.skeletonJson && renderer.skeletonData.skeletonJson._unitLook === id); })) {
      if (this.models.length) this.clear();
      return;
    }
    // JSB has neither SkeletonTexture nor the JS attachment vertex hook used
    // by Core. Keep native attachments intact; skins/model overrides still work.
    var nativeParts = !!(cc.sys && cc.sys.isNative) || renderers.some(function (renderer) { return !!renderer._nativeSkeleton; });
    if (nativeParts && renderers.some(function (renderer) { return renderer.skeletonData && !renderer._skeleton; })) return;
    if (nativeParts && profile.parts.length && !profile.bakedLayers && !nativePartsNotice) {
      nativePartsNotice = true;
      if (typeof cc.log === "function") cc.log("Native Spine retains original character attachments; custom part fitting requires the web Spine runtime.");
    }
    var fittedParts = nativeParts ? [] : profile.parts.filter(function (part) { return !heroBaked || !renderers.some(function (renderer) { return heroBaked.originalId(renderer) === part.layer && (heroBaked.baked(renderer) || profile.bakedLayers && profile.bakedLayers[part.layer]); }); });
    var signature = id + ":" + profileKey(profile) + ":" + nativeParts + ":" + renderers.map(function (renderer) { return renderer.uuid + ":" + (renderer.skeletonData && renderer.skeletonData.uuid); }).join("|");
    if (this.signature !== signature || this.states.some(function (state) { return !renderers.some(function (renderer) { return renderer._skeleton === state.skeleton; }); })) {
      this.clear();
      var textures = {}, ready = true;
      fittedParts.forEach(function (part) { textures[part.sprite] = texture(part.sprite); if (!textures[part.sprite]) ready = false; });
      fittedParts.forEach(function (part) { if (!renderers.some(function (renderer) { return renderer.skeletonData && renderer.skeletonData.uuid === part.layer && renderer._skeleton; })) ready = false; });
      if (!ready) return;
      try {
        var pending = [], models = [];
        renderers.forEach(function (renderer) {
          var node = renderer.node;
          models.push({ renderer: renderer, scaleX: Math.abs(node.scaleX), scaleY: node.scaleY, x: node.x || 0, y: node.y || 0, angle: node.angle || 0, opacity: node.opacity === undefined ? 255 : node.opacity, color: node.color && node.color.clone ? node.color.clone() : node.color, skin: renderer._skeleton && renderer._skeleton.skin && renderer._skeleton.skin.name });
          var parts = fittedParts.filter(function (part) { return renderer.skeletonData && part.layer === renderer.skeletonData.uuid; });
          if ((parts.length || (profile.faceless || Core.skinTint(profile)) && !nativeParts) && renderer._skeleton) pending.push(Core.prepare(sp.spine, renderer._skeleton, parts, library, textures, { faceless: !!profile.faceless, skinTint: Core.skinTint(profile) }));
        });
        this.states = pending; this.models = models; this.signature = signature;
      } catch (error) { this.clear(); if (!failures[id]) { failures[id] = true; cc.warn("Character look " + id + ": " + error.message); } return; }
    }
    this.models.forEach(function (model) {
      var node = model.renderer.node, scale = profile.scale || 1;
      node.scaleX = (node.scaleX < 0 ? -1 : 1) * model.scaleX * scale; node.scaleY = model.scaleY * scale;
      var layerId = heroBaked ? heroBaked.originalId(model.renderer) : model.renderer.skeletonData && model.renderer.skeletonData.uuid;
      var transform = profile.models && profile.models[layerId];
      if (transform) {
        if (transform.tint) { node.color = cc.color(transform.tint); model.tinted = true; }
        node.x = model.x + (transform.x || 0); node.y = model.y + (transform.y || 0);
        node.angle = model.angle + (transform.rotation || 0); node.opacity = model.opacity * (transform.opacity === undefined ? 1 : transform.opacity);
        node.scaleX *= transform.scaleX === undefined ? 1 : transform.scaleX; node.scaleY *= transform.scaleY === undefined ? 1 : transform.scaleY; model.transformed = true;
      }
      var skin = profile.skins && profile.skins[layerId];
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
