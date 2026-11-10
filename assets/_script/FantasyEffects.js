"use strict";
// All visible particles are native Spine data. This helper owns only the
// independent ambient track; attacks keep the primary animation's clock.
var states = new WeakMap(), TRACK = 2;
function rendererOf(actor) { return actor && (actor.getSpAni ? actor.getSpAni() : actor.spAni); }
function metadata(renderer) { var json = renderer && renderer.skeletonData && renderer.skeletonData.skeletonJson; return json && json._fantasy && json._fantasy.effects; }
function animation(track) { var value = track && (track.getAnimation ? track.getAnimation() : track.animation); return value && (value.getName ? value.getName() : value.name); }
function stop(renderer) {
  var state = renderer && states.get(renderer); if (!state) return;
  var current = renderer.getCurrent && renderer.getCurrent(TRACK);
  if (animation(current) === state.name) renderer.clearTrack(TRACK);
  state.slots.forEach(function (name) { var slot = renderer.findSlot && renderer.findSlot(name), color = slot && (slot.getColor ? slot.getColor() : slot.color); if (color) color.a = 0; });
  states.delete(renderer);
}
function ambient(actor) {
  var renderer = rendererOf(actor), effect = metadata(renderer);
  if (!effect || !effect.ambientAnimation || !actor.node || actor._isPooled || actor.isDead && actor.isDead() || actor.node.activeInHierarchy === false) { stop(renderer); return; }
  var state = states.get(renderer), current = renderer.getCurrent && renderer.getCurrent(TRACK), generation = actor.node._combatGeneration;
  if (state && state.asset === renderer.skeletonData && state.generation === generation && animation(current) === effect.ambientAnimation) return;
  stop(renderer);
  if (renderer.findAnimation && !renderer.findAnimation(effect.ambientAnimation)) return;
  var entry = renderer.setAnimation(TRACK, effect.ambientAnimation, true); if (!entry) return;
  var json = renderer.skeletonData.skeletonJson, pack = json && json._fantasy && json._fantasy.pack, speed = pack === "fantasy-bosses" ? .65 : pack === "fantasy-monsters" ? .75 : 1;
  if (entry.setTimeScale) entry.setTimeScale(speed); else entry.timeScale = speed;
  if (entry.setMixDuration) entry.setMixDuration(0); else entry.mixDuration = 0;
  states.set(renderer, { asset: renderer.skeletonData, generation: generation, name: effect.ambientAnimation, slots: effect.ambientSlots || [] });
}
exports.ambient = ambient;
exports.reset = function (actor) { stop(rendererOf(actor)); };
exports.projectile = function (actor) { var effect = metadata(rendererOf(actor)); return effect && effect.projectile ? Object.assign({}, effect.projectile) : {}; };
