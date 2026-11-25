"use strict";
// Keep attack events on track zero. Locomotion waits for the faster reaction
// track to finish; hits received during that reaction do not restart or queue it.
var TRACK = 1;
var statusDuration = .17;
var statusColors = {
  poison: { r: 65, g: 255, b: 83 },
  burn: { r: 255, g: 152, b: 44 },
  bleed: { r: 255, g: 38, b: 65 }
};
var tintedNodes = new WeakMap();
function sameColor(a, b) {
  return !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}
function baseColor(node) {
  var tint = tintedNodes.get(node), color = node.color;
  return tint && sameColor(color, tint.applied) ? tint.base : color;
}
function statusRenderer(actor) {
  var form = actor._opposingForm, hero = actor.ctrPlayAni;
  return form && form.renderer || (actor.getSpAni ? actor.getSpAni() : actor.spAni) ||
    hero && hero.spAniBody || actor.ndAniMain;
}
function statusNodes(actor, renderer) {
  var hero = actor.ctrPlayAni, art = actor._buildingAppearance, nodes;
  if (actor._opposingForm) nodes = [actor._opposingForm.node];
  else if (hero) nodes = [hero.spAniMa, hero.spAniBody, hero.spAniDrap, hero.spAniHead, hero.spAniBow, hero.spAniArrow, hero.spAniHand]
    .map(function (layer) { return layer && layer.node; });
  else if (art && art.sprite) nodes = [art.sprite.node, art.weaponSprite && art.weaponSprite.node];
  else if (actor.ndAniMain) nodes = [actor.ndAniMain].concat(actor.ndAniOther || []).map(function (layer) { return layer && layer.node; });
  else nodes = [renderer && renderer.node || actor.body];
  return Array.from(new Set(nodes.filter(function (node) {
    return cc.isValid(node, true) && node.activeInHierarchy !== false && node.color;
  })));
}
function paintStatus(status, progress) {
  progress = Math.max(0, Math.min(.999999, progress));
  // Simultaneous ticks share one hit clip. Show each color during its own part.
  var color = status.colors[Math.floor(progress * status.colors.length)];
  var strength = .35 * Math.min(1, (1 - progress) * 5);
  status.tints.forEach(function (tint) {
    var node = tint.node;
    if (!cc.isValid(node, true)) return;
    var current = node.color;
    if (!sameColor(current, tint.applied)) tint.base = current;
    var base = tint.base;
    function mix(key) { return Math.round(base[key] + (color[key] - base[key]) * strength); }
    tint.applied = cc.color(mix("r"), mix("g"), mix("b"), base.a);
    if (!sameColor(current, tint.applied)) node.color = tint.applied;
  });
}
function trackTime(entry) {
  return entry && (entry.getTrackTime ? entry.getTrackTime() : entry.trackTime);
}
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
  play: function (override) {
    if (!override && this.status && this.token) { this.update(); if (this.token) return; }
    var actor = this.actor, renderer = override || actor && (actor.getSpAni ? actor.getSpAni() : actor.spAni);
    if (!renderer || !renderer.skeletonData || actor._isPooled || actor.isDead && actor.isDead()) return;
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
    this.renderer = renderer; this.actorNode = actor.node; this.generation = generation; this.asset = asset;
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
  playStatus: function (kinds, current, ui) {
    var actor = this.actor, node = actor && actor.node;
    var colors = kinds.map(function (id) { return statusColors[id]; }).filter(Boolean);
    if (!colors.length || !current() || !cc.isValid(actor, true) || !cc.isValid(node, true) ||
        actor._isPooled || actor.isDead && actor.isDead()) return;
    var generation = node._combatGeneration;
    var renderer = statusRenderer(actor);
    var animated = cc.isValid(renderer, true) && renderer.skeletonData && renderer.timeScale !== 0 &&
      (!renderer.node || renderer.node.activeInHierarchy !== false) &&
      (!renderer.isAnimationCached || !renderer.isAnimationCached()) &&
      renderer.findAnimation && renderer.findAnimation("hit");
    this.update();
    if (this.token && (animated ? this.renderer !== renderer : this.renderer)) this.reset();
    if (animated) this.play(renderer);
    if (!current() || this.actor !== actor || actor.node !== node || !cc.isValid(node, true) ||
        node._combatGeneration !== generation || actor._isPooled || actor.isDead && actor.isDead()) return;
    if (!this.token) {
      this.renderer = null;
      this.token = {};
      this.actorNode = node;
      this.generation = generation;
      actor._hitReactionPlaying = true;
      if (actor.rigidBody) actor.rigidBody.linearVelocity = cc.Vec2.ZERO;
    }
    this.clearStatus();
    var entry = this.renderer && this.renderer.getCurrent && this.renderer.getCurrent(TRACK);
    var status = this.status = { colors: colors, current: current, ui: ui, model: renderer, elapsed: 0, start: trackTime(entry) || 0, tints: [] };
    actor._statusHitReaction = true;
    statusNodes(actor, renderer).forEach(function (node) {
      var tint = { node: node, base: baseColor(node) };
      status.tints.push(tint);
      tintedNodes.set(node, tint);
    });
    paintStatus(status, 0);
  },
  clearStatus: function () {
    var status = this.status;
    this.status = null;
    if (!status) return;
    if (this.actor) this.actor._statusHitReaction = false;
    status.tints.forEach(function (tint) {
      var node = tint.node;
      if (tintedNodes.get(node) !== tint) return;
      tintedNodes.delete(node);
      if (cc.isValid(node, true) && sameColor(node.color, tint.applied)) node.color = tint.base;
    });
  },
  finish: function (token) {
    if (this.token !== token) return;
    this.token = null;
    if (this.actor) this.actor._hitReactionPlaying = false;
    this.clearStatus();
    if (this.renderer && cc.isValid(this.renderer, true)) restoreDarkTint(this.renderer);
  },
  update: function (dt) {
    if (!this.token) return;
    var actor = this.actor, status = this.status;
    if (!actor || actor.node !== this.actorNode || !cc.isValid(actor.node, true) || actor._isPooled || actor.isDead && actor.isDead() ||
        this.generation !== actor.node._combatGeneration ||
        status && (!status.current() || actor.isDestroyed || status.model !== statusRenderer(actor))) { this.reset(); return; }
    if (!this.renderer) {
      if (!status || status.ui && status.ui.isPauset) return;
      if (dt > 0) status.elapsed += dt * (status.ui && status.ui.speed || 1);
      if (status.elapsed >= statusDuration) this.finish(this.token);
      else paintStatus(status, status.elapsed / statusDuration);
      return;
    }
    if (!cc.isValid(this.renderer, true) || this.asset !== this.renderer.skeletonData ||
        status && this.renderer.timeScale === 0) { this.reset(); return; }
    if (!this.renderer.getCurrent) return;
    var entry = this.renderer.getCurrent(TRACK);
    var animation = entry && (entry.getAnimation ? entry.getAnimation() : entry.animation);
    var name = animation && (animation.getName ? animation.getName() : animation.name);
    var time = trackTime(entry);
    var end = entry && (entry.getAnimationEnd ? entry.getAnimationEnd() : entry.animationEnd);
    if (!entry || name && name !== "hit" || typeof time === "number" && typeof end === "number" && time >= end) this.finish(this.token);
    else if (status && end > status.start && typeof time === "number") paintStatus(status, (time - status.start) / (end - status.start));
  },
  reset: function () {
    var renderer = this.renderer;
    this.token = null;
    if (this.actor) this.actor._hitReactionPlaying = false;
    this.clearStatus();
    this.renderer = null;
    this.actorNode = null; this.generation = null; this.asset = null;
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
exports.playStatus = function (actor, kinds, current, ui) {
  if (!actor || !actor.node || !actor.node.addComponent) return;
  var feedback = actor.node.getComponent(Feedback) || actor.node.addComponent(Feedback);
  feedback.init(actor);
  feedback.playStatus(kinds, current, ui);
};
exports.baseColor = baseColor;
exports.reset = function (actor) {
  var feedback = actor && actor.node && actor.node.getComponent && actor.node.getComponent(Feedback);
  if (feedback) feedback.reset();
};
exports.component = Feedback;
