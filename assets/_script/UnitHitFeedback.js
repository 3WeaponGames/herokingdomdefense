"use strict";
// Reactions use a separate Spine track. Movement, attack events and their
// approved timing continue on track zero, including during repeated hits.
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
    var entry = renderer.setAnimation(TRACK, "hit", false);
    if (entry) {
      var end = entry.getAnimationEnd ? entry.getAnimationEnd() : entry.animationEnd;
      if (entry.setMixDuration) entry.setMixDuration(0); else entry.mixDuration = 0;
      if (entry.setTrackEnd) entry.setTrackEnd(end); else entry.trackEnd = end;
    }
    this.renderer = renderer;
  },
  reset: function () {
    var renderer = this.renderer;
    this.renderer = null;
    if (renderer && cc.isValid(renderer)) {
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
