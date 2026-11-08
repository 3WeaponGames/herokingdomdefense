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
  if (!owner || !owner.cfg || !target || !target.cfg) return false;
  if (owner.cfg.CounterType === undefined) return !!owner.cfg.Suppressed && owner.cfg.Suppressed == target.cfg.ID;
  if (!owner.cfg.CounterType) return false;
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
function attack(owner, type, callback) {
  applyAttackPlayback(owner, type);
  var settings = config();
  var key = keyFor(owner, type);
  var item = settings && settings.timings && settings.timings[key];
  if (item === undefined) item = settings && settings.timingDefaults && settings.timingDefaults[key];
  var delay = item && item.attack;
  // A missing timing must retain call order, RNG order, and the original stack.
  if (typeof delay !== "number" || !isFinite(delay) || delay <= 0 || delay > 10) return callback.call(owner);
  cancel(owner);
  var skeleton = owner.getSpAni ? owner.getSpAni() : owner.spAni || (owner.ctrPlayAni && owner.ctrPlayAni.spAniBody);
  var track = skeleton && skeleton.getCurrent ? skeleton.getCurrent(0) : null;
  pending.push({ owner: owner, type: type, key: key, time: owner.time, remaining: delay / attackPlayback(owner, type), callback: callback, skeleton: skeleton, track: track });
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
    if (entry.track && skeleton && skeleton.getCurrent) {
      var current = skeleton.getCurrent(0), previous = entry.track;
      var duration = previous.animation && previous.animation.duration;
      // A replaced animation cancels its pending effect. Natural completion is
      // allowed to cross the marker on the next simulation step.
      if (current && current.animation && current.animation.name !== "attack" &&
          typeof previous.trackTime === "number" && typeof duration === "number" && previous.trackTime + 1e-7 < duration) {
        cancel(owner); continue;
      }
    }
    // UIGame supplies dt * game speed; skeleton.timeScale already uses that
    // same speed. Multiplying again would advance hit markers twice as fast.
    var effectDelta = dt, control = owner._relicControl;
    if (entry.type === "enemy" && control && control.generation === owner.node._combatGeneration) {
      if (control.freeze > 0) effectDelta = Math.max(0, dt - control.freeze);
      else if (control.duration > 0 && control.slow > 0) effectDelta -= Math.min(dt, control.duration) * control.slow;
    }
    entry.remaining -= effectDelta;
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
function attackPlayback(owner, type) {
  var settings = config(), value = settings && settings.animationSpeeds && settings.animationSpeeds[keyFor(owner, type)];
  return typeof value === "number" && isFinite(value) && value >= .1 && value <= 4 ? value : 1;
}
function applyAttackPlayback(owner, type) {
  var speed = attackPlayback(owner, type); if (speed === 1) return;
  var layers = owner.ctrPlayAni;
  var renderers = layers ? [layers.spAniBody, layers.spAniDrap, layers.spAniHead, layers.spAniBow, layers.spAniArrow, layers.spAniHand] : [owner.getSpAni ? owner.getSpAni() : owner.spAni];
  renderers.forEach(function (renderer) {
    var track = renderer && renderer.getCurrent && renderer.getCurrent(0);
    var animation = track && (track.animation || track.getAnimation && track.getAnimation());
    var name = animation && (animation.name || animation.getName && animation.getName());
    if (name !== "attack") return;
    // Native TrackEntry exposes setters; the browser Spine runtime exposes fields.
    if (typeof track.setTimeScale === "function") track.setTimeScale(speed); else track.timeScale = speed;
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
exports.applyAttackPlayback = applyAttackPlayback;
