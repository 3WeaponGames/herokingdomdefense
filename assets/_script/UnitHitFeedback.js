"use strict";
// Keep attack events on track zero. Locomotion waits for the faster reaction
// track to finish; repeated hits replace only that reaction.
var TRACK = 1;
var Feedback = cc.Class({
  extends: cc.Component,
  init: function (actor) { this.actor = actor; },
  play: function () {
    var actor = this.actor, renderer = actor && (actor.getSpAni ? actor.getSpAni() : actor.spAni);
    if (!renderer || !renderer.skeletonData || actor._isPooled || actor.isDead()) return;
    if (renderer.node && renderer.node.activeInHierarchy === false) return;
    if (!renderer.findAnimation || !renderer.findAnimation("hit")) return;
    if (this.renderer && this.renderer !== renderer) this.reset();
    // Two-color tint supplies the translucent white flash for assembled allies.
    // Monsters retain their own authored Hit / Hit_2 artwork and animation.
    renderer.useTint = true;
    var feedback = this, token = this.token = {};
    var entry = renderer.setAnimation(TRACK, "hit", false);
    actor._hitReactionPlaying = !!entry;
    if (entry) {
      var end = entry.getAnimationEnd ? entry.getAnimationEnd() : entry.animationEnd;
      if (entry.setMixDuration) entry.setMixDuration(0); else entry.mixDuration = 0;
      if (entry.setTrackEnd) entry.setTrackEnd(end); else entry.trackEnd = end;
      if (entry.setTimeScale) entry.setTimeScale(1.5); else entry.timeScale = 1.5;
      if (actor.rigidBody) actor.rigidBody.linearVelocity = cc.Vec2.ZERO;
      var finished = function () {
        if (feedback.token !== token) return;
        actor._hitReactionPlaying = false;
        feedback.entry = null;
      };
      if (renderer.setTrackCompleteListener) renderer.setTrackCompleteListener(entry, finished);
      if (renderer.setTrackDisposeListener) renderer.setTrackDisposeListener(entry, finished);
    }
    this.entry = entry;
    this.renderer = renderer;
  },
  update: function () {
    if (!this.entry || !this.renderer || !this.renderer.getCurrent) return;
    var entry = this.renderer.getCurrent(TRACK);
    var time = entry && (entry.getTrackTime ? entry.getTrackTime() : entry.trackTime);
    var end = entry && (entry.getAnimationEnd ? entry.getAnimationEnd() : entry.animationEnd);
    if (!entry || typeof time === "number" && typeof end === "number" && time >= end) {
      if (this.actor) this.actor._hitReactionPlaying = false;
      this.entry = null;
    }
  },
  reset: function () {
    var renderer = this.renderer;
    this.token = null;
    this.entry = null;
    if (this.actor) this.actor._hitReactionPlaying = false;
    this.renderer = null;
    if (renderer && cc.isValid(renderer, true)) {
      renderer.clearTrack(TRACK);
      // Runs only on death, pooling or reinitialization, never between attacks.
      renderer.setSlotsToSetupPose();
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
