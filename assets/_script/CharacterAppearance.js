"use strict";
var Core = require("CharacterPartsCore");
var UnitLevelStats = require("UnitLevelStats");
var library = null, looks = null, loading = false, retryAt = 0, failures = {}, textureJobs = {}, profileKeys = new WeakMap();
var nativePartsNotice = false;
var bakedJobs = {};
var looksLoading = false, looksCallbacks = [];
function allyLevel(actor) { return UnitLevelStats.level(actor); }
function validAnimationSpeed(value) { return typeof value === "number" && isFinite(value) && value >= 0 && value <= 2; }
function animationSpeed(actor, team) {
  var speeds = looks && looks.unitAnimationSpeeds;
  if (!speeds || !actor || team !== "hero" && !actor.cfg) return undefined;
  var level = team === "ally" && allyLevel(actor), scoped = level && speeds["ally:" + actor.cfg.ID + ":level:" + level];
  if (validAnimationSpeed(scoped)) return scoped;
  var shared = speeds[Core.actorKey(actor, team)];
  return validAnimationSpeed(shared) ? shared : undefined;
}
function preload(done) {
  if (looks || !cc.resources) { if (done) done(); return; }
  if (done) looksCallbacks.push(done);
  if (looksLoading) return;
  looksLoading = true;
  function finish(issue, asset) {
    looksLoading = false;
    if (!issue && asset) { looks = asset.json; retryAt = 0; }
    else retryAt = Date.now() + 1000;
    var callbacks = looksCallbacks; looksCallbacks = [];
    callbacks.forEach(function (callback) { callback(issue); });
  }
  try { cc.resources.load("characters/catalog", cc.JsonAsset, finish); }
  catch (issue) { finish(issue); }
}
function assignedLook(data, actor, team) {
  var key = Core.actorKey(actor, team), level = team === "ally" && allyLevel(actor);
  var exact = level && data.assignments["ally:" + actor.cfg.ID + ":level:" + level];
  var id = exact && data.profiles[exact] ? exact : data.assignments[key];
  return { id: id, profile: id && data.profiles[id] };
}
function bakedAsset(resource) {
  var job = bakedJobs[resource];
  if (!job || job.retryAt && Date.now() >= job.retryAt) {
    job = bakedJobs[resource] = {};
    try {
      cc.resources.load(resource, sp.SkeletonData, function (error, asset) {
        if (error || !asset) job.retryAt = Date.now() + 1000;
        else job.asset = asset;
      });
    } catch (error) { job.retryAt = Date.now() + 1000; }
  }
  return job.asset;
}
function trackValue(track, name) {
  var getter = "get" + name.charAt(0).toUpperCase() + name.slice(1);
  return track && (typeof track[getter] === "function" ? track[getter]() : track[name]);
}
function setTrackValue(track, name, value) {
  if (!track || value === undefined) return;
  var setter = "set" + name.charAt(0).toUpperCase() + name.slice(1);
  if (typeof track[setter] === "function") track[setter](value);
  else track[name] = value;
}
function switchAllyRig(component, actor, renderers, profile) {
  var ready = true;
  renderers.forEach(function (renderer) {
    if (!renderer.skeletonData) return;
    var records = component.bakedModels || (component.bakedModels = []);
    var record = records.filter(function (value) { return value.renderer === renderer; })[0];
    var baked = profile && profile.baked, target;
    if (baked && renderer.skeletonData.uuid === baked.uuid) return;
    if (baked && baked.resource) {
      target = bakedAsset(baked.resource);
      if (!target) { ready = false; return; }
    } else if (record) target = record.original;
    else return;
    if (renderer.skeletonData === target) return;
    // A rig change replaces track entries. Wait for gameplay callbacks and the
    // separate hit-reaction track to finish rather than replaying or losing one.
    var track = renderer.getCurrent && renderer.getCurrent(0), animation = trackValue(track, "animation");
    var name = animation && (animation.name || typeof animation.getName === "function" && animation.getName());
    var loop = trackValue(track, "loop");
    if (!track) { name = renderer.animation; loop = renderer.loop; }
    if (actor._isPooled || actor._hitReactionPlaying || actor.isDead && actor.isDead() ||
        actor.time && actor.time.Attack === -1 || !/^(idle|move|walk|run)$/.test(name || "") || loop === false) {
      ready = false; return;
    }
    if (renderer.getCurrent && renderer.getCurrent(1)) { ready = false; return; }
    if (!record) {
      record = { renderer: renderer, original: renderer.skeletonData, defaultSkin: renderer.defaultSkin, defaultAnimation: renderer.defaultAnimation,
        skin: renderer._skeleton && renderer._skeleton.skin && renderer._skeleton.skin.name || renderer.defaultSkin };
      records.push(record);
    }
    var time = trackValue(track, "trackTime"), speed = trackValue(track, "timeScale");
    component.clear();
    renderer.skeletonData = target;
    record.applied = target;
    var skin = target === record.original ? record.skin : "default";
    if (skin) renderer.setSkin(skin);
    renderer.defaultSkin = target === record.original ? record.defaultSkin : "default";
    renderer.defaultAnimation = record.defaultAnimation;
    if (name) {
      var resumed = renderer.setAnimation(0, name, loop !== false);
      setTrackValue(resumed, "trackTime", time);
      setTrackValue(resumed, "timeScale", speed);
    }
  });
  return ready;
}
function restoreAllyRigs(component) {
  (component.bakedModels || []).forEach(function (record) {
    var renderer = record.renderer;
    if (!cc.isValid(renderer, true) || !cc.isValid(renderer.node, true) || renderer.skeletonData !== record.applied) return;
    renderer.skeletonData = record.original;
    if (record.skin) renderer.setSkin(record.skin);
    renderer.defaultSkin = record.defaultSkin; renderer.defaultAnimation = record.defaultAnimation;
  });
  component.bakedModels = [];
}
function profileKey(profile) {
  if (!profileKeys.has(profile)) profileKeys.set(profile, JSON.stringify(profile));
  return profileKeys.get(profile);
}
function load() {
  if (loading || library && looks || Date.now() < retryAt) return;
  loading = true;
  function loadLooks() {
    preload(function (issue) {
      loading = false;
      if (issue) { retryAt = Date.now() + 1000; return; }
      retryAt = 0;
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
function makerRider(appearance) {
  var actor=appearance.owner,controller=appearance.team==='hero'&&actor&&actor.ctrPlayAni,data=controller&&controller.spAniBody&&controller.spAniBody.skeletonData;
  return data&&data.skeletonJson&&data.skeletonJson._heroMaker?require("HeroMakerRider"):null;
}
var Appearance = cc.Class({
  extends: cc.Component,
  init: function (actor, type) { this.clear(); restoreAllyRigs(this); this.owner = actor; this.team = type; load(); },
  clear: function () {
    var maker=makerRider(this);if(maker)maker.removeFollow(this.owner.ctrPlayAni);
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
    var effectData = this.team === "enemy" && actor.spAni && actor.spAni.skeletonData && actor.spAni.skeletonData.skeletonJson;
    var hasAmbient = effectData && effectData._fantasy && effectData._fantasy.effects && effectData._fantasy.effects.ambientAnimation;
    if (hasAmbient || this.fantasyAmbient) { require("FantasyEffects").ambient(actor, require("GameToolsOverrides").animationPlayback(actor, this.team)); this.fantasyAmbient = !!hasAmbient; }
    var hasFantasyPlayback = effectData && effectData._fantasy && ["fantasy-bosses", "fantasy-monsters"].indexOf(effectData._fantasy.pack) >= 0;
    var customPlayback = animationSpeed(actor, this.team) !== undefined;
    if (hasFantasyPlayback || this.fantasyPlayback || customPlayback || this.customPlayback) { require("GameToolsOverrides").applyAnimationPlayback(actor, this.team); this.fantasyPlayback = !!hasFantasyPlayback; this.customPlayback = customPlayback; }
    var maker=makerRider(this);if(maker)maker.removeFollow(actor.ctrPlayAni);
    try {
    if (!looks || !library) load();
    if (!looks || !library || !actor.cfg && this.team !== "hero") return;
    var selected = assignedLook(looks, actor, this.team), id = selected.id, profile = selected.profile;
    if (this.team === "hero") profile = require("HeroItemLooks").current(profile);
    var renderers = visuals(actor, this.team);
    if (this.team === "ally" && !switchAllyRig(this, actor, renderers, profile)) return;
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
    } finally { if(maker)maker.follow(actor.ctrPlayAni); }
  },
  onDisable: function () { if(this.fantasyAmbient)require("FantasyEffects").reset(this.owner);this.fantasyAmbient=false;this.clear(); restoreAllyRigs(this); },
  onDestroy: function () { if(this.fantasyAmbient)require("FantasyEffects").reset(this.owner);this.fantasyAmbient=false;this.clear(); restoreAllyRigs(this); this.owner = null; }
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
exports.allyLevel = allyLevel; exports.assignedLook = assignedLook;
exports.animationSpeed = animationSpeed; exports.preload = preload;
