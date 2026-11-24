"use strict";

var FightingTypeDamage = require("./FightingTypeDamage");
// Saved combat settings, animation defaults and per-unit authoring overrides. No configuration
// is created or loaded here. Without either, retain the synchronous legacy path.
var pending = new Map();
function valid(value) { return !!value && (!cc.isValid || cc.isValid(value, true)); }
function sameOwner(entry) {
  return !!entry && valid(entry.owner) && entry.owner.node === entry.node && valid(entry.node) &&
    entry.node._combatGeneration === entry.generation && entry.owner.time === entry.time;
}
function sameBattle(entry) {
  var game = entry.game;
  return !game || valid(game) && (!entry.gameNode || game.node === entry.gameNode && valid(entry.gameNode) && entry.gameNode.activeInHierarchy !== false) &&
    game.gameData === entry.gameData && game._combatEpoch === entry.epoch;
}
function config() {
  var data = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().data;
  return data && data.GameTools;
}
function keyFor(owner, type) {
  if (type === "hero") return "hero:hero:default";
  var id=type==="enemy"&&owner.cfg.ProfileBaseID||owner.cfg.ID;
  var form = type === "enemy" && id<100000 && owner.spIdx !== undefined ? String(owner.spIdx+1) : "default";
  if(type === "enemy" && owner.cfg.ProfileBaseID && id>=90010&&id<=90012)form=String(id-90009);
  return type + ":" + id + ":" + form;
}
function roleFor(owner, side, settings) {
  if (side === "hero") return owner.heroStyle;
  if (!side || !owner.cfg || !settings) return undefined;
  return side === "enemy" && owner.cfg.FightingType || (settings.unitTypeAssignments || {})[keyFor(owner, side)];
}
function roleOf(owner, settings) {
  var side = owner.heroStyle ? "hero" : owner.navigationTeam === "friendly" ? "ally" : owner.navigationTeam === "enemy" ? "enemy" : null;
  return roleFor(owner, side, settings);
}
function counters(owner, target) {
  if (!owner || !target || !target.cfg && !target.heroStyle) return false;
  var settings = config();
  var targetRole = roleOf(target, settings);
  if (owner.cfg && owner.cfg.OverrideCounterType === true && typeof owner.cfg.CounterType === "string") {
    return !!owner.cfg.CounterType && owner.cfg.CounterType === targetRole;
  }
  var counter = FightingTypeDamage.counterType(settings && settings.unitTypes, roleOf(owner, settings));
  if (counter !== undefined) return counter === targetRole;
  if (!owner.cfg) return false;
  var legacy = owner.cfg.CounterType;
  if (legacy === undefined) return !!(owner.cfg.Suppressed && target.cfg && owner.cfg.Suppressed == target.cfg.ID);
  return !!legacy && legacy === targetRole;
}
// Used by hit paths that have no legacy per-unit bonus. Projectiles may pass the
// source role captured at release.
function typeCounterDamage(owner, target, amount, releasedRole) {
  if (!(amount > 0) || !owner || !target) return amount;
  var settings = config();
  var counter = FightingTypeDamage.counterType(settings && settings.unitTypes, releasedRole || roleOf(owner, settings));
  if (!counter || counter !== roleOf(target, settings)) return amount;
  var parameter = require("KinghtFallEnum").KinghtFallEnumParameterCfg.RestrainedArms;
  return amount * Number(require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getParamsCfgById(parameter));
}
function damageTaken(owner, side, amount) {
  if (!(amount > 0) || !owner || side !== "hero" && !owner.cfg) return amount;
  var settings = config();
  if (!settings) return amount;
  var role = roleFor(owner, side, settings);
  var type = (settings.unitTypes || {})[role];
  if (!type || type.damageTaken === undefined) return amount;
  return amount * FightingTypeDamage.multiplier(type.damageTaken);
}
function cancel(owner, queue) {
  queue = queue || pending;
  var entry = queue.get(owner);
  if (!entry) return;
  queue.delete(owner);
  // Only a delayed attack can be pending. Cancelling one must not
  // strand the original melee cooldown at its "waiting for effect" sentinel.
  if (sameOwner(entry) && entry.time && entry.time.Attack === -1) entry.time.Attack = 0;
}
function isPending(owner) {
  return pending.has(owner);
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
// This view is used only while polling an already captured delayed hit.
// Capture still uses animationInfo() for its full authored queue boundary.
function animationPosition(track) {
  var animation = trackValue(track, "animation");
  var name = animation && (animation.name || animation.getName && animation.getName());
  var time = trackValue(track, "trackTime");
  return {name:name,time:typeof time==="number"?time:0};
}
function attack(owner, type, callback, queue) {
  queue = queue || pending;
  var relative = applyAttackPlayback(owner, type);
  var settings = config();
  var key = keyFor(owner, type);
  var item = settings && settings.timings && settings.timings[key];
  if (item === undefined || item && item.inherit === true && !Object.prototype.hasOwnProperty.call(item, "attack")) item = settings && settings.timingDefaults && settings.timingDefaults[key];
  var delay = item && item.attack;
  var speed = attackPlayback(owner, type, relative);
  // A missing timing must retain call order, RNG order, and the original stack.
  var validDelay = typeof delay === "number" && isFinite(delay) && delay > 0 && delay <= 10;
  if (!validDelay && speed > 0) return callback.call(owner);
  cancel(owner, queue);
  if (!valid(owner) || !valid(owner.node)) return;
  var skeleton = owner.getSpAni ? owner.getSpAni() : owner.spAni || (owner.ctrPlayAni && owner.ctrPlayAni.spAniBody);
  if (!valid(skeleton)) skeleton = null;
  var track = skeleton && skeleton.getCurrent ? skeleton.getCurrent(0) : null;
  var info = animationInfo(track);
  var game = owner._combatGame;
  // Keep the outstanding authored time in source seconds. Per-level playback
  // can change during this windup, including entering/leaving whole-unit mode.
  queue.set(owner, { owner: owner, node: owner.node, generation: owner.node._combatGeneration, type: type, key: key, time: owner.time, remaining: validDelay ? delay : 0, callback: callback, skeleton: skeleton,
    game: game, gameNode: game && game.node, gameData: game && game.gameData, epoch: game && game._combatEpoch,
    animation: info.name, animationEnd: info.end, animationTime: info.time,
    // Browser TrackEntry objects survive disposal. JSB wrappers may point at
    // freed native entries, so native interruption checks use captured values.
    browserTrack: !(cc.sys && cc.sys.isNative) ? track : null });
}
function tick(dt, fighting) {
  // The caller only needs a post-callback scope check when there was work.
  if (!pending.size) return false;
  if (!fighting) { clear(); return true; }
  return tickAttacks(dt, pending);
}
function tickAttacks(dt, queue) {
  if (!(dt > 0) || !isFinite(dt)) return false;
  // Iterate a snapshot: callbacks may start/cancel other attacks.
  var work = Array.from(queue.values());
  for (var i = 0; i < work.length; i++) {
    var entry = work[i], owner = entry.owner;
    if (queue.get(owner) !== entry) continue;
    var live = sameOwner(entry) && sameBattle(entry) && entry.node.activeInHierarchy !== false && entry.node.active !== false && !owner._isPooled &&
      (!owner.isDead || !owner.isDead()) && (entry.type === "hero" || owner.cfg) && keyFor(owner, entry.type) === entry.key;
    if (!live) { cancel(owner, queue); continue; }
    var skeleton = entry.skeleton;
    if (skeleton && (!valid(skeleton) || skeleton !== (owner.getSpAni ? owner.getSpAni() : owner.spAni || (owner.ctrPlayAni && owner.ctrPlayAni.spAniBody)))) { cancel(owner, queue); continue; }
    var relative = applyAttackPlayback(owner, entry.type);
    var control = owner._relicControl;
    if (control && control.node && control.node !== owner.node) control = null;
    // RelicCombat releases its pause later in this frame, after this scheduler.
    // Count the unfrozen remainder now; an independently paused renderer stays
    // stopped. Normal freeze application has already cancelled old attacks.
    var relicPause = entry.type === "enemy" && control && control.generation === owner.node._combatGeneration &&
      (owner._relicPausedRenderers || []).some(function (record) { return record.renderer === skeleton && !record.wasPaused; });
    if (skeleton && skeleton.paused && !relicPause) continue;
    // UIGame supplies dt * game speed; skeleton.timeScale already uses that
    // same speed. Multiplying again would advance hit markers twice as fast.
    var effectDelta = dt;
    if (entry.type === "enemy" && control && control.generation === owner.node._combatGeneration) {
      if (control.freeze > 0) effectDelta = Math.max(0, dt - control.freeze);
      else if (control.duration > 0 && control.slow > 0) effectDelta -= Math.min(dt, control.duration) * control.slow;
    }
    var playback = attackPlayback(owner, entry.type, relative);
    if (!(playback > 0)) continue;
    entry.animationTime += effectDelta * playback;
    if (entry.animation && skeleton && skeleton.getCurrent) {
      var current = skeleton.getCurrent(0), info = animationPosition(current);
      if (info.name === entry.animation) entry.animationTime = Math.max(entry.animationTime, info.time);
      else {
        var observed = entry.browserTrack && trackValue(entry.browserTrack, "trackTime");
        var time = Math.max(entry.animationTime, typeof observed === "number" ? observed : 0);
        // Named fighting-style attacks are still attacks. Only replacing that
        // queued clip before its natural queue point cancels the pending hit.
        if (typeof entry.animationEnd === "number" && time + 1e-7 < entry.animationEnd) { cancel(owner, queue); continue; }
      }
    }
    entry.remaining -= effectDelta * playback;
    if (entry.remaining <= 1e-9) {
      queue.delete(owner);
      entry.callback.call(owner);
      // The hero's original hit callback leaves Attack at -1 when every target
      // has left range. A delayed release must still finish that attack so the
      // hero can acquire another target rather than remaining stuck forever.
      if (sameOwner(entry) && entry.time && entry.time.Attack === -1 && !queue.has(owner)) entry.time.Attack = 0;
    }
  }
  return true;
}
function clear() { while (pending.size) cancel(pending.keys().next().value); }
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
  var renderer = valid(owner) && (owner.getSpAni ? owner.getSpAni() : owner.spAni), json = valid(renderer) && renderer.skeletonData && renderer.skeletonData.skeletonJson;
  var pack = type === "enemy" && json && json._fantasy && json._fantasy.pack;
  return pack === "fantasy-bosses" ? .25 : pack === "fantasy-monsters" ? .35 : 1;
}
function unitAnimationSpeed(owner, type) {
  // Character data is preloaded before gameplay; this read never creates settings.
  if (!cc.resources) return undefined;
  return require("CharacterAppearance").animationSpeed(owner, type);
}
function animationPlayback(owner, type, relative) {
  if (arguments.length < 3) relative = unitAnimationSpeed(owner, type);
  var baseline = defaultPlayback(owner, type);
  if (relative !== undefined && type === "enemy") {
    // Native baked assets can omit skeletonJson while the unit record retains
    // its source package. Explicit saved playback must use that same baseline.
    var renderer = valid(owner) && (owner.getSpAni ? owner.getSpAni() : owner.spAni), json = valid(renderer) && renderer.skeletonData && renderer.skeletonData.skeletonJson;
    var pack = json && json._fantasy && json._fantasy.pack || owner.cfg && owner.cfg.MonsterPack;
    baseline = pack === "fantasy-bosses" ? .25 : pack === "fantasy-monsters" ? .35 : baseline;
  }
  return relative === undefined ? baseline : baseline * relative;
}
function attackPlayback(owner, type, relative) {
  if (arguments.length < 3) relative = unitAnimationSpeed(owner, type);
  if (relative !== undefined) return animationPlayback(owner, type, relative);
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
  return applyPlayback(owner, type, false);
}
function applyPlayback(owner, type, all) {
  if (!valid(owner)) return;
  var layers = owner.ctrPlayAni, relative = unitAnimationSpeed(owner, type), custom = relative !== undefined;
  if (layers && layers.spAniBody && !valid(layers.spAniBody)) return;
  var renderers = layers ? [layers.spAniBody, layers.spAniDrap, layers.spAniHead, layers.spAniBow, layers.spAniArrow, layers.spAniHand].concat(all ? [layers.spAniMa] : []) : [owner.getSpAni ? owner.getSpAni() : owner.spAni];
  renderers.forEach(function (renderer) {
    if (!valid(renderer)) return;
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
    var speed = custom ? animationPlayback(owner, type, relative) : track === hit && track !== primary ? 1 : attack ? attackPlayback(owner, type, relative) : defaultPlayback(owner, type);
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
  return relative;
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
exports.projectileSpeed=function(owner,type,authoredSpeed){
  var settings=config(),table=settings&&settings.projectileSpeeds,value=table&&table[keyFor(owner,type)];
  if(table&&value===undefined&&type==='enemy'&&owner.cfg&&(owner.cfg.ID>=100000||owner.cfg.ProfileBaseID)){
    var ids=require("./EnemyStageProfiles").referenceIds(owner.cfg,settings);
    for(var i=0;i<ids.length;i++){
      var id=ids[i],key='enemy:'+id+':'+(id>=90010&&id<=90012?String(id-90009):'default');
      if(table[key]!==undefined){value=table[key];break;}
    }
  }
  return typeof value==='number'&&isFinite(value)&&value>=1&&value<=20000?value:authoredSpeed;
};
exports.attack = attack;
exports.tick = tick;
exports.tickAttacks = tickAttacks;
exports.cancel = cancel;
exports.clear = clear;
exports.isPending = isPending;
exports.keyFor = keyFor;
exports.counters = counters;
exports.typeCounterDamage = typeCounterDamage;
exports.damageTaken = damageTaken;
exports.perkEnabled = perkEnabled;
exports.parameter = parameter;
exports.facing = facing;
exports.applyModel = applyModel;
exports.attackPlayback = attackPlayback;
exports.animationPlayback = animationPlayback;
exports.applyAttackPlayback = applyAttackPlayback;
exports.applyAnimationPlayback = function (owner, type) { applyPlayback(owner, type, true); };
