"use strict";
// Presentation only. No target, attack, collider, or movement values are edited.
var catalog = null, loading = false, waiting = [], retryAfter = 0;
function load(callback) {
  if (catalog) { callback(catalog); return; }
  waiting.push(callback);
  if (loading || Date.now() < retryAfter || !cc.resources) return;
  loading = true;
  cc.resources.load("projectiles/catalog", cc.JsonAsset, function (error, asset) {
    loading = false;
    if (error || !asset || !asset.json) { retryAfter = Date.now() + 1000; waiting.length = 0; return; }
    catalog = asset.json;
    var callbacks = waiting; waiting = [];
    callbacks.forEach(function (ready) { ready(catalog); });
  });
}
function valid(node) { return node && cc.isValid(node, true); }
function visualError(view, error, descriptor) {
  if (descriptor) {
    var cached = view.bank.cache[descriptor.id] || { callbacks: [] };
    cached.failedUntil = Infinity; view.bank.cache[descriptor.id] = cached;
  }
  view.reset();
  if (!view.bank.warned) { view.bank.warned = true; if (cc.warn) cc.warn("Projectile artwork unavailable; retaining authored visuals.", error); }
}
function select(data, key, level, item) {
  var assignment = data.assignments[key] || {}, result = Object.assign({}, assignment);
  if (key === "hero" && !result.flight && item) {
    var parts = item.parts || [];
    for (var i = parts.length - 1; i >= 0; i--) {
      var match = data.assets.find(function (asset) { return asset.sourcePart === parts[i].sprite; });
      if (match) { result.flight = match.id; if (!result.tint && parts[i].tint) result.tint = parts[i].tint; break; }
    }
    if (!result.flight && item.skins && item.skins[data.heroArrowLayer]) {
      var skin = "hero-skin:" + item.skins[data.heroArrowLayer];
      if (data.assets.some(function (asset) { return asset.id === skin; })) result.flight = skin;
    }
  }
  return result;
}
function Bank(owner) { this.owner = owner; this.cache = Object.create(null); this.effects = []; this.pool = []; this.views = new Set(); this.dead = false; }
Bank.prototype.get = function (descriptor, callback) {
  var bank = this, cached = this.cache[descriptor.id];
  if (cached && cached.failedUntil) {
    if (Date.now() < cached.failedUntil) { callback(null); return; }
    delete this.cache[descriptor.id]; cached = null;
  }
  if (cached) { if (cached.frames) callback(cached); else cached.callbacks.push(callback); return; }
  cached = this.cache[descriptor.id] = { callbacks: [callback] };
  function done(error, asset) {
    if (bank.dead) return;
    if (error || !asset) { cached.failedUntil = Date.now() + 1000; var failed = cached.callbacks; cached.callbacks = []; failed.forEach(function (ready) { ready(null); }); return; }
    if (asset.addRef) asset.addRef(); cached.asset = asset; cached.descriptor = descriptor;
    if (descriptor.kind === "spine") cached.frames = [];
    else if (descriptor.kind === "flipbook") {
      cached.frames = [];
      for (var f = 0; f < descriptor.frames; f++) cached.frames.push(new cc.SpriteFrame(asset, cc.rect(f % descriptor.columns * descriptor.cell, Math.floor(f / descriptor.columns) * descriptor.cell, descriptor.cell, descriptor.cell)));
    } else cached.frames = [asset];
    var callbacks = cached.callbacks; cached.callbacks = []; callbacks.forEach(function (ready) { ready(cached); });
  }
  var type = descriptor.kind === "spine" ? sp.SkeletonData : descriptor.kind === "flipbook" ? cc.Texture2D : cc.SpriteFrame;
  var bundle = descriptor.bundle || "resources";
  if (bundle === "resources") cc.resources.load(descriptor.resource, type, done);
  else {
    var loaded = cc.assetManager.getBundle(bundle);
    if (loaded) loaded.load(descriptor.resource, type, done);
    else cc.assetManager.loadBundle(bundle, function (error, result) { if (bank.dead) return; if (error) done(error); else result.load(descriptor.resource, type, done); });
  }
};
function draw(node, clip, options) {
  var descriptor = clip.descriptor, renderer;
  if (descriptor.kind === "spine") {
    renderer = node.getComponent(sp.Skeleton) || node.addComponent(sp.Skeleton); renderer.skeletonData = clip.asset;
    if (descriptor.skin) renderer.setSkin(descriptor.skin);
    renderer.setAnimation(0, descriptor.animation, true);
    node.setScale(options.size / (descriptor.width || 64));
  } else {
    renderer = node.getComponent(cc.Sprite) || node.addComponent(cc.Sprite); renderer.spriteFrame = clip.frames[0]; renderer.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    var source = clip.frames[0].getOriginalSize();
    var scale = options.size / Math.max(source.width, source.height);
    node.setContentSize(source.width * scale, source.height * scale);
  }
  node.angle = (options.rotation || 0) + (descriptor.rotation || 0);
  node.color = cc.color(options.tint || "#ffffff");
  return renderer;
}
Bank.prototype.effect = function (descriptor, parent, position, angle, options, guard) {
  if (!descriptor || this.effects.length >= 128 || !valid(parent)) return;
  var bank = this;
  this.get(descriptor, function (clip) {
    if (!clip || bank.dead || !valid(parent) || !guard() || bank.effects.length >= 128) return;
    var node = bank.pool.pop() || new cc.Node("Projectile effect"); node.active = true; node.setParent(parent); node.group = parent.group; node.setPosition(position); node.angle = 0; node.setScale(1);
    try {
      var renderer = draw(node, clip, options); node.angle += angle;
      bank.effects.push({ node: node, renderer: renderer, clip: clip, age: 0, epoch: bank.owner._combatEpoch });
    } catch (error) { node.destroy(); if (bank.cache[descriptor.id]) bank.cache[descriptor.id].failedUntil = Infinity; if (!bank.warned && cc.warn) cc.warn("Projectile effect unavailable.", error); bank.warned = true; }
  });
};
Bank.prototype.update = function (dt) {
  for (var i = this.effects.length - 1; i >= 0; i--) {
    var effect = this.effects[i], descriptor = effect.clip.descriptor; effect.age += dt;
    if (valid(effect.node) && effect.epoch === this.owner._combatEpoch && effect.age < (descriptor.frames || 12) / (descriptor.fps || 24)) {
      if (descriptor.kind === "flipbook") effect.renderer.spriteFrame = effect.clip.frames[Math.min(descriptor.frames - 1, Math.floor(effect.age * descriptor.fps))];
      continue;
    }
    this.effects.splice(i, 1);
    if (valid(effect.node)) { effect.node.active = false; if (this.pool.length < 64) this.pool.push(effect.node); else effect.node.destroy(); }
  }
};
Bank.prototype.dispose = function () {
  this.dead = true;
  this.views.forEach(function (view) { view.release(); }); this.views.clear();
  this.effects.forEach(function (effect) { if (valid(effect.node)) effect.node.destroy(); }); this.effects = [];
  this.pool.forEach(function (node) { if (valid(node)) node.destroy(); }); this.pool = [];
  Object.keys(this.cache).forEach(function (key) { var clip = this.cache[key]; if (clip.descriptor && clip.descriptor.kind === "flipbook") clip.frames.forEach(function (frame) { frame.destroy(); }); if (clip.asset && clip.asset.decRef) clip.asset.decRef(); }, this);
  this.cache = Object.create(null); this.owner = null;
};
function View(shot, bank) { this.shot = shot; this.bank = bank; this.serial = 0; this.original = []; this.node = null; this.age = 0; bank.views.add(this); }
View.prototype.reset = function () {
  this.serial++; this.age = 0;
  this.original.forEach(function (entry) { if (valid(entry.renderer)) entry.renderer.enabled = entry.enabled; }); this.original = [];
  if (valid(this.spriteNode)) this.spriteNode.active = false;
  if (valid(this.spineNode)) this.spineNode.active = false;
  this.node = null; this.clip = null; this.renderer = null; this.impactDescriptor = null;
  if (this.cancelItem) this.cancelItem(); this.cancelItem = null;
};
View.prototype.release = function () {
  this.reset();
  if (valid(this.spriteNode)) this.spriteNode.destroy();
  if (valid(this.spineNode)) this.spineNode.destroy();
  this.spriteNode = this.spineNode = null; this.bank.views.delete(this);
};
View.prototype.begin = function (key) {
  this.reset(); var view = this, serial = this.serial, shot = this.shot, bank = this.bank;
  var parent = shot.node.parent, position = shot.node.getPosition(), angle = shot.node.angle, applied = false;
  function current() { return !bank.dead && serial === view.serial && valid(shot.node) && !!shot._shot; }
  function apply(data) {
    if (!current() || applied) return;
    var level, item;
    if (key === "hero") {
      level = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(3);
      item = require("HeroItemLooks").item(3, level);
      if (!item) {
        view.cancelItem = require("HeroItemLooks").whenReady(function () { view.cancelItem = null; try { apply(data); } catch (error) { visualError(view, error); } });
        if (view.cancelItem) return;
      }
    }
    var options = select(data, key, level, item), descriptor = data.assets.find(function (asset) { return asset.id === options.flight; });
    if (key === "hero" && !options.flight && bank.owner.ctrPlay && bank.owner.ctrPlay.heroStyle === "mystic") {
      options.flight = "original:fireball"; descriptor = data.assets.find(function (asset) { return asset.id === options.flight; });
    }
    if (!descriptor && !options.launch && !options.impact) return;
    applied = true;
    if (key === "wall-defense") options.rotation = (options.rotation || 0) + 90;
    options.size = options.size || descriptor && descriptor.size || 48;
    view.options = options;
    view.impactDescriptor = data.assets.find(function (asset) { return asset.id === options.impact; });
    var launch = data.assets.find(function (asset) { return asset.id === options.launch; });
    bank.effect(launch, parent, position, angle, options, current);
    if (!descriptor) return;
    bank.get(descriptor, function (clip) {
      if (!clip || !current()) return;
      try {
        var field = descriptor.kind === "spine" ? "spineNode" : "spriteNode", node = view[field];
        if (!valid(node)) { node = view[field] = new cc.Node("Projectile artwork"); node.setParent(shot.node); }
        node.active = true; node.setPosition(0, 0); node.setScale(1); node.group = shot.node.group;
        view.renderer = draw(node, clip, options); view.node = node; view.clip = clip;
        // Hide only the authored renderers; leave every gameplay transform alone.
        var root = shot._towerBehavior ? shot.node : shot.bullet || shot.node;
        root.getComponentsInChildren(cc.RenderComponent).forEach(function (renderer) {
          if (renderer === view.renderer) return;
          if (renderer.node === shot._towerImpactNode || cc.MotionStreak && renderer instanceof cc.MotionStreak) return;
          view.original.push({ renderer: renderer, enabled: renderer.enabled }); renderer.enabled = false;
        });
      } catch (error) { visualError(view, error, descriptor); }
    });
  }
  load(function (data) { try { apply(data); } catch (error) { visualError(view, error); } });
};
View.prototype.step = function (dt) {
  this.age += dt;
  if (this.clip && this.clip.descriptor.kind === "flipbook" && valid(this.node)) {
    var descriptor = this.clip.descriptor;
    this.renderer.spriteFrame = this.clip.frames[Math.floor(this.age * descriptor.fps) % descriptor.frames];
  }
};
View.prototype.impact = function () {
  if (valid(this.node)) this.node.active = false;
  var shot = this.shot, bank = this.bank, epoch = bank.owner._combatEpoch;
  bank.effect(this.impactDescriptor, shot.node.parent, shot.node.getPosition(), shot.node.angle, this.options || { size: 48 }, function () { return !bank.dead && bank.owner._combatEpoch === epoch; });
};
function prepare(shot, owner, key) {
  if (!owner._projectileLooks) owner._projectileLooks = new Bank(owner);
  if (!shot._projectileVisual || shot._projectileVisual.bank !== owner._projectileLooks) {
    if (shot._projectileVisual) shot._projectileVisual.release();
    shot._projectileVisual = new View(shot, owner._projectileLooks);
  }
  shot._launchProjectileLook = function () { try { shot._projectileVisual.begin(key); } catch (error) { visualError(shot._projectileVisual, error); } };
}
exports.prepare = prepare;
exports.select = select;
exports.Bank = Bank;
exports.release = function (shot) {
  var view = shot._projectileVisual;
  if (view) view.release();
  shot._projectileVisual = null; shot._launchProjectileLook = null;
};
