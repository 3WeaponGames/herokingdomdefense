"use strict";
// Keep attack events on track zero. Locomotion waits for the faster reaction
// track to finish; hits received during that reaction do not restart or queue it.
var TRACK = 1;
function restoreDarkTint(renderer) {
  function restore(slot) {
    if (!slot) return;
    var dark = slot.getDarkColor ? slot.getDarkColor() : slot.darkColor;
    if (!dark) return;
    var data = slot.getData ? slot.getData() : slot.data;
    var setup = data && (data.getDarkColor ? data.getDarkColor() : data.darkColor);
    dark.r = setup ? setup.r : 0; dark.g = setup ? setup.g : 0; dark.b = setup ? setup.b : 0;
    if (setup) dark.a = setup.a;
  }
  if (renderer._skeleton && renderer._skeleton.slots) renderer._skeleton.slots.forEach(restore);
  else {
    // Creator 2.4's native Slot::setToSetupPose restores light colour and
    // attachments, but leaves dark colour behind. Its bound Color properties
    // write to the actual native slot; no engine patch or node tint is needed.
    var json = renderer.skeletonData && renderer.skeletonData.skeletonJson;
    if (json && json.slots && renderer.findSlot) json.slots.forEach(function (slot) {
      if (slot.dark !== undefined) restore(renderer.findSlot(slot.name));
    });
  }
}
var Feedback = cc.Class({
  extends: cc.Component,
  init: function (actor) { if (this.actor && this.actor !== actor) this.reset(); this.actor = actor; },
  play: function () {
    var actor = this.actor, renderer = actor && (actor.getSpAni ? actor.getSpAni() : actor.spAni);
    if (!renderer || !renderer.skeletonData || actor._isPooled || actor.isDead()) return;
    if (renderer.node && renderer.node.activeInHierarchy === false) return;
    if (!renderer.findAnimation || !renderer.findAnimation("hit")) return;
    var generation = actor.node._combatGeneration, asset = renderer.skeletonData;
    if (this.renderer && (this.renderer !== renderer || this.generation !== generation || this.asset !== asset)) this.reset();
    // Read only the current native wrapper. A retained TrackEntry may already
    // have been disposed or recycled, and wrapper identity is not stable.
    if (this.token) { this.update(); if (this.token) return; }
    // Two-color tint supplies the translucent white flash for assembled allies.
    // Monsters retain their own authored Hit / Hit_2 artwork and animation.
    if (renderer.useTint !== true) renderer.useTint = true;
    var feedback = this, token = this.token = {};
    this.renderer = renderer; this.generation = generation; this.asset = asset;
    var entry = renderer.setAnimation(TRACK, "hit", false);
    actor._hitReactionPlaying = !!entry;
    if (entry) {
      var end = entry.getAnimationEnd ? entry.getAnimationEnd() : entry.animationEnd;
      if (entry.setMixDuration) entry.setMixDuration(0); else entry.mixDuration = 0;
      if (entry.setTrackEnd) entry.setTrackEnd(end); else entry.trackEnd = end;
      if (entry.setTimeScale) entry.setTimeScale(1.5); else entry.timeScale = 1.5;
      if (actor.rigidBody) actor.rigidBody.linearVelocity = cc.Vec2.ZERO;
      var finished = function () {
        if (feedback.token !== token || feedback.actor !== actor || !cc.isValid(actor, true) || !actor.node || !cc.isValid(actor.node, true) ||
            actor.node._combatGeneration !== generation || !cc.isValid(renderer, true) || renderer.skeletonData !== asset) return;
        feedback.finish(token);
      };
      if (renderer.setTrackCompleteListener) renderer.setTrackCompleteListener(entry, finished);
      if (renderer.setTrackDisposeListener) renderer.setTrackDisposeListener(entry, finished);
    } else this.token = null;
  },
  finish: function (token) {
    if (this.token !== token) return;
    this.token = null;
    if (this.actor) this.actor._hitReactionPlaying = false;
    if (this.renderer && cc.isValid(this.renderer, true)) restoreDarkTint(this.renderer);
  },
  update: function () {
    if (!this.token || !this.renderer) return;
    var actor = this.actor;
    if (!actor || !actor.node || actor._isPooled || actor.isDead() || this.generation !== actor.node._combatGeneration ||
        !cc.isValid(this.renderer, true) || this.asset !== this.renderer.skeletonData) { this.reset(); return; }
    if (!this.renderer.getCurrent) return;
    var entry = this.renderer.getCurrent(TRACK);
    var animation = entry && (entry.getAnimation ? entry.getAnimation() : entry.animation);
    var name = animation && (animation.getName ? animation.getName() : animation.name);
    var time = entry && (entry.getTrackTime ? entry.getTrackTime() : entry.trackTime);
    var end = entry && (entry.getAnimationEnd ? entry.getAnimationEnd() : entry.animationEnd);
    if (!entry || name && name !== "hit" || typeof time === "number" && typeof end === "number" && time >= end) this.finish(this.token);
  },
  reset: function () {
    var renderer = this.renderer;
    this.token = null;
    if (this.actor) this.actor._hitReactionPlaying = false;
    this.renderer = null;
    this.generation = null; this.asset = null;
    if (renderer && cc.isValid(renderer, true)) {
      renderer.clearTrack(TRACK);
      // Runs only on death, pooling or reinitialization, never between attacks.
      renderer.setSlotsToSetupPose();
      restoreDarkTint(renderer);
    }
  },
  onDisable: function () { this.reset(); },
  onDestroy: function () { this.reset(); this.actor = null; }
});
exports.play = function (actor) {
  if (!actor || !actor.node || !actor.node.addComponent) return;
  var feedback = actor.node.getComponent(Feedback) || actor.node.addComponent(Feedback);
  feedback.init(actor); feedback.play();
};
exports.reset = function (actor) {
  var feedback = actor && actor.node && actor.node.getComponent && actor.node.getComponent(Feedback);
  if (feedback) feedback.reset();
};
exports.component = Feedback;
