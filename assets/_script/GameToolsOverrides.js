"use strict";

// Saved animation defaults and per-unit authoring overrides. No configuration
// is created or loaded here. Without either, retain the synchronous legacy path.
var pending = [];
function config() {
  var data = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().data;
  return data && data.GameTools;
}
function keyFor(owner, type) {
  if (type === "hero") return "hero:hero:default";
  var form = type === "enemy" && owner.spIdx !== undefined ? String(owner.spIdx + 1) : "default";
  return type + ":" + owner.cfg.ID + ":" + form;
}
function counters(owner, target) {
  if (!owner || !owner.cfg || !target || !target.cfg && !target.heroStyle) return false;
  if (owner.cfg.CounterType === undefined) return !!(owner.cfg.Suppressed && target.cfg && owner.cfg.Suppressed == target.cfg.ID);
  if (!owner.cfg.CounterType) return false;
  if (target.heroStyle) return owner.cfg.CounterType === target.heroStyle;
  var settings = config(), side = target.navigationTeam === "friendly" ? "ally" : target.navigationTeam === "enemy" ? "enemy" : null;
  if (!settings || !side) return false;
  var assignments = settings.unitTypeAssignments || {};
  return assignments[keyFor(target, side)] === owner.cfg.CounterType;
}
function cancel(owner) {
  var removed = false;
  for (var i = pending.length - 1; i >= 0; i--) if (pending[i].owner === owner) { pending.splice(i, 1); removed = true; }
  // Only a delayed attack can be pending. Cancelling one must not
  // strand the original melee cooldown at its "waiting for effect" sentinel.
  if (removed && owner && owner.time && owner.time.Attack === -1) owner.time.Attack = 0;
}
function isPending(owner) {
  for (var i = 0; i < pending.length; i++) if (pending[i].owner === owner) return true;
  return false;
}
function trackValue(track, key) {
  var getter = "get" + key.charAt(0).toUpperCase() + key.slice(1);
  return track && (typeof track[getter] === "function" ? track[getter]() : track[key]);
}
function animationInfo(track) {
  var animation = trackValue(track, "animation"), next = trackValue(track, "next");
  var name = animation && (animation.name || animation.getName && animation.getName());
  var duration = trackValue(track, "animationEnd");
  if (typeof duration !== "number") duration = animation && (animation.duration || animation.getDuration && animation.getDuration());
  var delay = trackValue(next, "delay"), time = trackValue(track, "trackTime");
  return {name:name,end:typeof delay==="number"&&delay>=0?delay:duration,time:typeof time==="number"?time:0};
}
function attack(owner, type, callback) {
  applyAttackPlayback(owner, type);
  var settings = config();
  var key = keyFor(owner, type);
  var item = settings && settings.timings && settings.timings[key];
  if (item === undefined) item = settings && settings.timingDefaults && settings.timingDefaults[key];
  var delay = item && item.attack;
  var speed = attackPlayback(owner, type), sourceClock = unitAnimationSpeed(owner, type) !== undefined;
  // A missing timing must retain call order, RNG order, and the original stack.
  var validDelay = typeof delay === "number" && isFinite(delay) && delay > 0 && delay <= 10;
  if (!validDelay && speed > 0) return callback.call(owner);
  cancel(owner);
  var skeleton = owner.getSpAni ? owner.getSpAni() : owner.spAni || (owner.ctrPlayAni && owner.ctrPlayAni.spAniBody);
  var track = skeleton && skeleton.getCurrent ? skeleton.getCurrent(0) : null;
  var info = animationInfo(track);
  pending.push({ owner: owner, type: type, key: key, time: owner.time, remaining: validDelay ? sourceClock ? delay : delay / speed : 0, sourceClock: sourceClock, callback: callback, skeleton: skeleton,
    animation: info.name, animationEnd: info.end, animationTime: info.time,
    // Browser TrackEntry objects survive disposal. JSB wrappers may point at
    // freed native entries, so native interruption checks use captured values.
    browserTrack: !(cc.sys && cc.sys.isNative) ? track : null });
}
function tick(dt, fighting) {
  if (!pending.length) return;
  if (!fighting) { clear(); return; }
  if (!(dt > 0) || !isFinite(dt)) return;
  // Iterate a snapshot: callbacks may start/cancel other attacks.
  var work = pending.slice();
  for (var i = 0; i < work.length; i++) {
    var entry = work[i], owner = entry.owner;
    if (pending.indexOf(entry) < 0) continue;
    var valid = owner && owner.node && cc.isValid(owner) && cc.isValid(owner.node) &&
      owner.node.activeInHierarchy !== false && owner.node.active !== false &&
      (!owner.isDead || !owner.isDead()) && owner.time === entry.time && keyFor(owner, entry.type) === entry.key;
    if (!valid) { cancel(owner); continue; }
    var skeleton = entry.skeleton;
    if (skeleton && skeleton.paused) continue;
    // UIGame supplies dt * game speed; skeleton.timeScale already uses that
    // same speed. Multiplying again would advance hit markers twice as fast.
    var effectDelta = dt, control = owner._relicControl;
    if (entry.type === "enemy" && control && control.generation === owner.node._combatGeneration) {
      if (control.freeze > 0) effectDelta = Math.max(0, dt - control.freeze);
      else if (control.duration > 0 && control.slow > 0) effectDelta -= Math.min(dt, control.duration) * control.slow;
    }
    var playback = entry.sourceClock ? attackPlayback(owner, entry.type) : 1;
    if (!(playback > 0)) continue;
    entry.animationTime += effectDelta * attackPlayback(owner, entry.type);
    if (entry.animation && skeleton && skeleton.getCurrent) {
      var current = skeleton.getCurrent(0), info = animationInfo(current);
      if (info.name === entry.animation) entry.animationTime = Math.max(entry.animationTime, info.time);
      else {
        var observed = entry.browserTrack && trackValue(entry.browserTrack, "trackTime");
        var time = Math.max(entry.animationTime, typeof observed === "number" ? observed : 0);
        // Named fighting-style attacks are still attacks. Only replacing that
        // queued clip before its natural queue point cancels the pending hit.
        if (typeof entry.animationEnd === "number" && time + 1e-7 < entry.animationEnd) { cancel(owner); continue; }
      }
    }
    entry.remaining -= effectDelta * playback;
    if (entry.remaining <= 1e-9) {
      pending.splice(pending.indexOf(entry), 1);
      entry.callback.call(owner);
      // The hero's original hit callback leaves Attack at -1 when every target
      // has left range. A delayed release must still finish that attack so the
      // hero can acquire another target rather than remaining stuck forever.
      if (owner.time === entry.time && owner.time.Attack === -1 && !isPending(owner)) owner.time.Attack = 0;
    }
  }
}
function clear() { while (pending.length) cancel(pending[0].owner); }
function perkEnabled(id) {
  var settings = config(), value = settings && settings.perks && settings.perks[id];
  return value !== false && !(value && value.enabled === false);
}
function parameter(name, fallback) {
  var settings = config(), value = settings && settings.parameters && settings.parameters[name];
  return typeof value === "number" && isFinite(value) ? value : fallback;
}
function facing(owner, type, left) {
  var settings = config(), item = settings && settings.visuals && settings.visuals[keyFor(owner, type)];
  return (left ? -1 : 1) * (item && item.mirrorX === true ? -1 : 1);
}
function validPlayback(value) { return typeof value === "number" && isFinite(value) && value >= .1 && value <= 4; }
function defaultPlayback(owner, type) {
  var renderer = owner && (owner.getSpAni ? owner.getSpAni() : owner.spAni), json = renderer && renderer.skeletonData && renderer.skeletonData.skeletonJson;
  var pack = type === "enemy" && json && json._fantasy && json._fantasy.pack;
  return pack === "fantasy-bosses" ? .25 : pack === "fantasy-monsters" ? .35 : 1;
}
function unitAnimationSpeed(owner, type) {
  // Character data is preloaded before gameplay; this read never creates settings.
  if (!cc.resources) return undefined;
  return require("CharacterAppearance").animationSpeed(owner, type);
}
function animationPlayback(owner, type) {
  var relative = unitAnimationSpeed(owner, type), baseline = defaultPlayback(owner, type);
  if (relative !== undefined && type === "enemy") {
    // Native baked assets can omit skeletonJson while the unit record retains
    // its source package. Explicit saved playback must use that same baseline.
    var renderer = owner && (owner.getSpAni ? owner.getSpAni() : owner.spAni), json = renderer && renderer.skeletonData && renderer.skeletonData.skeletonJson;
    var pack = json && json._fantasy && json._fantasy.pack || owner.cfg && owner.cfg.MonsterPack;
    baseline = pack === "fantasy-bosses" ? .25 : pack === "fantasy-monsters" ? .35 : baseline;
  }
  return relative === undefined ? baseline : baseline * relative;
}
function attackPlayback(owner, type) {
  if (unitAnimationSpeed(owner, type) !== undefined) return animationPlayback(owner, type);
  var settings = config(), speeds = settings && settings.animationSpeeds;
  if (type === "ally" && speeds) {
    // Match the authored Barracks level used by unit stats and appearances.
    // Branch identifiers are independent of the level and may be sparse.
    var build = owner && owner.outBuild, row = build && build.buildInfo && build.buildInfo.cfg;
    var level = row && row.level;
    if (level === undefined && build && typeof build.getLevel === "function") level = build.getLevel();
    if (typeof level === "number" && isFinite(level) && level > 0 && Math.floor(level) === level) {
      var scoped = speeds["ally:" + owner.cfg.ID + ":level:" + level];
      if (validPlayback(scoped)) return scoped;
    }
  }
  var value = speeds && speeds[keyFor(owner, type)];
  return validPlayback(value) ? value : defaultPlayback(owner, type);
}
var playbackTracks = new WeakMap();
function applyAttackPlayback(owner, type) {
  applyPlayback(owner, type, false);
}
function applyPlayback(owner, type, all) {
  var layers = owner.ctrPlayAni, custom = unitAnimationSpeed(owner, type) !== undefined;
  var renderers = layers ? [layers.spAniBody, layers.spAniDrap, layers.spAniHead, layers.spAniBow, layers.spAniArrow, layers.spAniHand].concat(all ? [layers.spAniMa] : []) : [owner.getSpAni ? owner.getSpAni() : owner.spAni];
  renderers.forEach(function (renderer) {
    if (layers) {
      var rider = require("HeroMakerRider");
      if (rider.ownsAttackClock && rider.ownsAttackClock(layers, renderer)) return;
    }
    var primary = renderer && renderer.getCurrent && renderer.getCurrent(0), hit = all && renderer && renderer.getCurrent && renderer.getCurrent(1), tracks = [primary];
    if (hit && hit !== primary && (custom || playbackTracks.has(hit))) tracks.push(hit);
    tracks.forEach(function (track) {
    if (!track) return;
    var animation = track && (track.animation || track.getAnimation && track.getAnimation());
    var name = animation && (animation.name || animation.getName && animation.getName());
    var attack = /^attack(?:_|$)/.test(name);
    if (!all && !attack) return;
    var speed = custom ? animationPlayback(owner, type) : track === hit && track !== primary ? 1 : attack ? attackPlayback(owner, type) : defaultPlayback(owner, type);
    // An inherited 1x level must clear this helper's previous override on a
    // retained/native track, while untouched authored tracks keep their speed.
    if (speed === 1 && !custom && !playbackTracks.has(track)) return;
    if (!playbackTracks.has(track)) {
      var original = typeof track.getTimeScale === "function" ? track.getTimeScale() : track.timeScale;
      playbackTracks.set(track, typeof original === "number" && isFinite(original) && original > 0 ? original : 1);
    }
    var applied = speed === 1 && !custom ? playbackTracks.get(track) : speed;
    // Native TrackEntry exposes setters; the browser Spine runtime exposes fields.
    if (typeof track.setTimeScale === "function") track.setTimeScale(applied); else track.timeScale = applied;
    if (speed === 1 && !custom) playbackTracks.delete(track);
    });
  });
}
var visualNodes = new WeakMap();
function applyModel(owner, type, node, left) {
  var settings = config(), item = settings && settings.visuals && settings.visuals[keyFor(owner, type)] || {};
  var base = visualNodes.get(node);
  if (!Object.keys(item).length && !base) { node.scaleX = (left ? -1 : 1) * node.scaleY; return; }
  if (!base) { base = { x: node.x || 0, y: node.y || 0, scale: Math.abs(node.scaleY), angle: node.angle || 0, color: node.color && node.color.clone ? node.color.clone() : node.color }; visualNodes.set(node, base); }
  node.x = base.x + (item.x || 0); node.y = base.y + (item.y || 0);
  node.scaleX = base.scale * (item.scaleX === undefined ? 1 : item.scaleX) * facing(owner, type, left);
  node.scaleY = base.scale * (item.scaleY === undefined ? 1 : item.scaleY);
  node.angle = base.angle + (item.rotation || 0);
  if (cc.color) node.color = item.tint ? cc.color(item.tint) : base.color;
}
exports.attack = attack;
exports.tick = tick;
exports.cancel = cancel;
exports.clear = clear;
exports.isPending = isPending;
exports.keyFor = keyFor;
exports.counters = counters;
exports.perkEnabled = perkEnabled;
exports.parameter = parameter;
exports.facing = facing;
exports.applyModel = applyModel;
exports.attackPlayback = attackPlayback;
exports.animationPlayback = animationPlayback;
exports.applyAttackPlayback = applyAttackPlayback;
exports.applyAnimationPlayback = function (owner, type) { applyPlayback(owner, type, true); };
