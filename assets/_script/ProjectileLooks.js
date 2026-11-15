"use strict";
// Presentation only. No target, attack, collider, or movement values are edited.
var catalog = null, loading = false, waiting = [], retryAfter = 0;
function load(callback) {
  if (catalog) { callback(catalog); return; }
  if (Date.now() < retryAfter || !cc.resources) return;
  waiting.push(callback);
  if (!loading) {
    loading = true;
    cc.resources.load("projectiles/catalog", cc.JsonAsset, function (error, asset) {
    loading = false;
    if (error || !asset || !asset.json) { retryAfter = Date.now() + 1000; waiting.length = 0; return; }
    catalog = asset.json;
    var callbacks = waiting; waiting = [];
    callbacks.forEach(function (ready) { ready(catalog); });
    });
  }
  return function () { var index = waiting.indexOf(callback); if (index >= 0) waiting.splice(index, 1); };
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
  var own=data.assignments[key]||{},assignment = Object.assign({}, /^tower:/.test(key) ? data.assignments.tower || {} : {}, own), result = Object.assign({}, assignment);
  var set = assignment.set && (data.sets || []).find(function (entry) { return entry.id === assignment.set; });
  if (set) ['flight', 'launch', 'impact'].forEach(function (role) { if (assignment[role] === undefined || own.set !== undefined && own[role] === undefined) result[role] = set[role] || ''; });
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
function selectSource(data,key,actor,settings,level,item){
  var result={};if(/^enemy:/.test(key)&&actor&&actor.cfg&&(actor.cfg.ID>=100000||actor.cfg.ProfileBaseID))require("./EnemyStageProfiles").referenceIds(actor.cfg,settings).reverse().forEach(function(id){Object.assign(result,select(data,"enemy:"+id,level,item));});
  return Object.assign(result,select(data,key,level,item));
}
function Bank(owner) { this.owner = owner; this.cache = Object.create(null); this.effects = []; this.pendingEffects = 0; this.pool = []; this.views = new Set(); this.launches = []; this.dead = false; }
Bank.prototype.get = function (descriptor, callback) {
  var bank = this, cached = this.cache[descriptor.id];
  if (bank.dead) { callback(null); return; }
  function cancel() { var index = cached.callbacks.indexOf(callback); if (index >= 0) cached.callbacks.splice(index, 1); }
  if (cached && cached.failedUntil) {
    if (Date.now() < cached.failedUntil) { callback(null); return; }
    delete this.cache[descriptor.id]; cached = null;
  }
  if (cached) { if (cached.frames) callback(cached); else { cached.callbacks.push(callback); return cancel; } return; }
  cached = this.cache[descriptor.id] = { callbacks: [callback] };
  function done(error, asset) {
    if (bank.dead) return;
    if (error || !asset) { cached.failedUntil = Date.now() + 1000; var failed = cached.callbacks; cached.callbacks = []; failed.forEach(function (ready) { ready(null); }); return; }
    if (asset.addRef) asset.addRef(); cached.asset = asset; cached.descriptor = descriptor;
    if (descriptor.visualPrefab) cached.frames = [];
    else if (descriptor.kind === "spine") cached.frames = [];
    else if (descriptor.kind === "flipbook") {
      cached.frames = [];
      for (var f = 0; f < descriptor.frames; f++) cached.frames.push(new cc.SpriteFrame(asset, cc.rect(f % descriptor.columns * descriptor.cell, Math.floor(f / descriptor.columns) * descriptor.cell, descriptor.cell, descriptor.cell)));
    } else cached.frames = [asset];
    var callbacks = cached.callbacks; cached.callbacks = []; callbacks.forEach(function (ready) { ready(cached); });
  }
  var type = descriptor.visualPrefab ? cc.Prefab : descriptor.kind === "spine" ? sp.SkeletonData : descriptor.kind === "flipbook" || descriptor.kind === "texture" ? cc.Texture2D : cc.SpriteFrame;
  var bundle = descriptor.visualPrefab && descriptor.visualPrefab.bundle || descriptor.bundle || "resources", resource = descriptor.visualPrefab && descriptor.visualPrefab.resource || descriptor.resource;
  if (bundle === "resources") cc.resources.load(resource, type, done);
  else {
    var loaded = cc.assetManager.getBundle(bundle);
    if (loaded) loaded.load(resource, type, done);
    else cc.assetManager.loadBundle(bundle, function (error, result) { if (bank.dead) return; if (error) done(error); else result.load(resource, type, done); });
  }
  return cancel;
};
function draw(node, clip, options) {
  var descriptor = clip.descriptor, renderer;
  if (node._projectilePrefab) { node._projectilePrefab.destroy(); node._projectilePrefab = null; }
  // One shared pool serves both sprite/flipbook and Spine effects. Retire the
  // other renderer before rebinding this checkout so old artwork cannot linger.
  var sprite = node.getComponent(cc.Sprite), skeleton = typeof sp !== "undefined" && node.getComponent(sp.Skeleton);
  if (valid(sprite)) sprite.enabled = !descriptor.visualPrefab && descriptor.kind !== "spine";
  if (valid(skeleton)) skeleton.enabled = !descriptor.visualPrefab && descriptor.kind === "spine";
  if (descriptor.visualPrefab) {
    var artwork = cc.instantiate(clip.asset);
    // Keep legacy visual-prefab colliders detached from gameplay geometry.
    if(cc.Collider)artwork.getComponentsInChildren(cc.Collider).forEach(function(collider){collider.enabled=false;});
    if(cc.PhysicsCollider)artwork.getComponentsInChildren(cc.PhysicsCollider).forEach(function(collider){collider.enabled=false;});
    artwork.setParent(node); artwork.setPosition(0, 0); node._projectilePrefab = artwork;
    (function group(branch){branch.group=node.group;(branch.children||[]).forEach(group);})(artwork);
    node.setScale(options.size / (descriptor.visualPrefab.width || 64));
    if (cc.ParticleSystem) artwork.getComponentsInChildren(cc.ParticleSystem).forEach(function (particle) { if (particle.resetSystem) particle.resetSystem(); });
    if (cc.MotionStreak) artwork.getComponentsInChildren(cc.MotionStreak).forEach(function (trail) { if (trail.reset) trail.reset(); });
    renderer = artwork;
  } else if (descriptor.kind === "spine") {
    renderer = node.getComponent(sp.Skeleton) || node.addComponent(sp.Skeleton); renderer.skeletonData = clip.asset;
    if (descriptor.skin) renderer.setSkin(descriptor.skin);
    renderer.setAnimation(0, descriptor.animation, true);
    node.setScale(options.size / (descriptor.width || 64));
  } else {
    var first=descriptor.loopFrames&&descriptor.loopFrames.length?descriptor.loopFrames[0]:0;
    renderer = node.getComponent(cc.Sprite) || node.addComponent(cc.Sprite); renderer.spriteFrame = clip.frames[first]; renderer.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    node.anchorX=descriptor.visualPivot?descriptor.visualPivot.x:.5;node.anchorY=descriptor.visualPivot?1-descriptor.visualPivot.y:.5;
    var source = clip.frames[first].getOriginalSize();
    var scale = options.size / Math.max(source.width, source.height);
    node.setContentSize(source.width * scale * (descriptor.visualScale || 1), source.height * scale * (descriptor.visualScale || 1));
  }
  node.angle = (options.rotation || 0) + (descriptor.rotation || 0);
  node.color = cc.color(options.tint || "#ffffff");
  return renderer;
}
Bank.prototype.effect = function (descriptor, parent, position, angle, options, guard) {
  if (this.dead || !descriptor || this.effects.length + this.pendingEffects >= 128 || !valid(parent)) return;
  var bank = this, settled = false; this.pendingEffects++;
  function settle() { if (settled) return false; settled = true; bank.pendingEffects = Math.max(0, bank.pendingEffects - 1); return true; }
  var cancel = this.get(descriptor, function (clip) {
    if (!settle()) return;
    if (!clip || bank.dead || !valid(parent) || !guard() || bank.effects.length >= 128) return;
    var node = bank.pool.pop();
    while (node && !valid(node)) node = bank.pool.pop();
    node = node || new cc.Node("Projectile effect"); node.active = true; node.setParent(parent); node.group = parent.group; node.setPosition(position); node.angle = 0; node.setScale(1);
    try {
      var renderer = draw(node, clip, options); node.angle += angle;
      bank.effects.push({ node: node, renderer: renderer, clip: clip, age: 0, epoch: bank.owner._combatEpoch });
    } catch (error) { node.destroy(); if (bank.cache[descriptor.id]) bank.cache[descriptor.id].failedUntil = Infinity; if (!bank.warned && cc.warn) cc.warn("Projectile effect unavailable.", error); bank.warned = true; }
  });
  return function () { if (settle() && cancel) cancel(); };
};
Bank.prototype.update = function (dt) {
  if (this.dead) return;
  // These are committed gameplay attacks, so a long authored delay must not
  // discard volleys at the visual-effect cap. Advance a snapshot in one pass;
  // callbacks can enqueue attacks, which begin advancing on the next tick.
  if (this.launches.length) {
    var pending = this.launches, remaining = []; this.launches = [];
    var p = 0;
    try {
      while (p < pending.length && !this.dead) {
        var launch = pending[p];
        if (launch.epoch !== this.owner._combatEpoch || !valid(launch.node) || launch.node !== launch.source.node ||
            launch.generation !== launch.node._combatGeneration || launch.time !== launch.source.time ||
            launch.cfg !== (launch.source.buildInfo && launch.source.buildInfo.cfg) || !launch.guard()) { p++; continue; }
        launch.remaining -= dt; p++;
        if (launch.remaining <= 0) launch.callback(); else remaining.push(launch);
      }
    } finally {
      // A failed release must not erase unrelated committed attacks. Retain
      // unvisited entries for the next update, just as the original queue did.
      if (!this.dead) {
        if (p < pending.length) remaining = remaining.concat(pending.slice(p));
        this.launches = this.launches.length ? remaining.concat(this.launches) : remaining;
      }
    }
    if (this.dead) return;
  }
  for (var i = this.effects.length - 1; i >= 0; i--) {
    var effect = this.effects[i], descriptor = effect.clip.descriptor; effect.age += dt;
    if (valid(effect.node) && effect.epoch === this.owner._combatEpoch && effect.age < (descriptor.duration || (descriptor.frames || 12) / (descriptor.fps || 24))) {
      if (descriptor.kind === "flipbook") effect.renderer.spriteFrame = effect.clip.frames[Math.min(descriptor.frames - 1, Math.floor(effect.age * descriptor.fps))];
      continue;
    }
    this.effects.splice(i, 1);
    if (valid(effect.node)) { effect.node.active = false; if (this.pool.length < 64) this.pool.push(effect.node); else effect.node.destroy(); }
  }
};
Bank.prototype.dispose = function () {
  this.dead = true;
  this.launches=[];
  this.views.forEach(function (view) { view.release(); }); this.views.clear();
  this.effects.forEach(function (effect) { if (valid(effect.node)) effect.node.destroy(); }); this.effects = [];
  this.pool.forEach(function (node) { if (valid(node)) node.destroy(); }); this.pool = [];
  Object.keys(this.cache).forEach(function (key) { var clip = this.cache[key]; clip.callbacks = []; if (clip.descriptor && clip.descriptor.kind === "flipbook") clip.frames.forEach(function (frame) { frame.destroy(); }); if (clip.asset && clip.asset.decRef) clip.asset.decRef(); }, this);
  this.cache = Object.create(null); this.owner = null;
  this.pendingEffects = 0;
};
function View(shot, bank) { this.shot = shot; this.bank = bank; this.serial = 0; this.original = []; this.node = null; this.age = 0; bank.views.add(this); }
View.prototype.reset = function () {
  this.serial++; this.age = 0;
  if (this.cancelCatalog) this.cancelCatalog(); this.cancelCatalog = null;
  if (this.cancelFlight) this.cancelFlight(); this.cancelFlight = null;
  if (this.cancelLaunch) this.cancelLaunch(); this.cancelLaunch = null;
  this.original.forEach(function (entry) { if (valid(entry.renderer)) entry.renderer.enabled = entry.enabled; }); this.original = [];
  if (valid(this.spriteNode)) this.spriteNode.active = false;
  if (valid(this.spineNode)) this.spineNode.active = false;
  if (valid(this.trailNode)) this.trailNode.active = false;
  this.node = null; this.clip = null; this.renderer = null; this.impactDescriptor = null;
  if (this.cancelItem) this.cancelItem(); this.cancelItem = null;
  if (this.cancelTrail) this.cancelTrail(); this.cancelTrail = null;
};
View.prototype.release = function () {
  this.reset();
  if (valid(this.spriteNode)) this.spriteNode.destroy();
  if (valid(this.spineNode)) this.spineNode.destroy();
  if (valid(this.trailNode)) this.trailNode.destroy();
  this.spriteNode = this.spineNode = null; this.bank.views.delete(this);
};
View.prototype.begin = function (key, sourceActor) {
  this.reset(); var view = this, serial = this.serial, shot = this.shot, bank = this.bank;
  var defaults = sourceActor ? require("FantasyEffects").projectile(sourceActor) : {};
  // The shooter can return to its pool while the catalog is loading. Retain
  // this release's presentation parent rather than reading its next life.
  var sourceProfile, settings, sourceCfg = sourceActor && sourceActor.cfg;
  if (/^enemy:/.test(key) && sourceCfg && (sourceCfg.ID >= 100000 || sourceCfg.ProfileBaseID)) {
    sourceProfile = {cfg: {ID: sourceCfg.ID, ProfileBaseID: sourceCfg.ProfileBaseID}};
    var config = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().data; settings = config && config.GameTools;
  }
  var parent = shot.node.parent, position = shot.node.getPosition(), angle = shot.node.angle, applied = false;
  function current() { return !bank.dead && serial === view.serial && valid(shot.node) && !!shot._shot; }
  function restoreTrails() {
    view.original.forEach(function (entry) { if (valid(entry.renderer) && cc.MotionStreak && entry.renderer instanceof cc.MotionStreak) entry.renderer.enabled = entry.enabled; });
  }
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
    var options=Object.assign({},defaults,selectSource(data,key,sourceProfile,settings,level,item)),descriptor = data.assets.find(function (asset) { return asset.id === options.flight; });
    if (key === "hero" && !options.flight && bank.owner.ctrPlay && bank.owner.ctrPlay.heroStyle === "mystic") {
      options.flight = "original:fireball"; descriptor = data.assets.find(function (asset) { return asset.id === options.flight; });
    }
    if (key === "hero" && !options.flight && (!bank.owner.ctrPlay || bank.owner.ctrPlay.heroStyle === "skirmisher")) {
      var items = require("HeroItemLooks"), icon = items.image && items.image(3, level);
      descriptor = icon && data.assets.find(function (asset) { return asset.sourcePart === icon.id; });
      if (descriptor) options.flight = descriptor.id;
    }
    if (!descriptor && !options.launch && !options.impact && options.trail === undefined) return;
    applied = true;
    if (key === "wall-defense") options.rotation = (options.rotation || 0) + 90;
    options.size = options.size || descriptor && descriptor.size || 48;
    view.options = options;
    view.impactDescriptor = data.assets.find(function (asset) { return asset.id === options.impact; });
    var launch = data.assets.find(function (asset) { return asset.id === options.launch; });
    view.cancelLaunch = bank.effect(launch, parent, position, angle, options, current);
    if ((options.trail !== undefined || descriptor && descriptor.visualPrefab) && cc.MotionStreak) {
      shot.node.getComponentsInChildren(cc.MotionStreak).forEach(function (renderer) { view.original.push({renderer:renderer,enabled:renderer.enabled});renderer.enabled=false; });
      var trail = (data.trails || []).find(function (entry) { return entry.id === options.trail; });
      if (trail) view.cancelTrail = bank.get(Object.assign({},trail,{kind:'texture'}),function (clip) {
        view.cancelTrail=null;if (!current()) return;if (!clip) { restoreTrails(); return; }
        var node=view.trailNode;if (!valid(node)) {node=view.trailNode=new cc.Node('Projectile trail');node.setParent(shot.node);}
        node.active=true;node.setPosition(0,0);node.group=shot.node.group;
        var renderer=node.getComponent(cc.MotionStreak)||node.addComponent(cc.MotionStreak);renderer.enabled=true;renderer.fadeTime=trail.lifetime;renderer.stroke=trail.width;renderer.minSeg=1;renderer.texture=clip.asset;renderer.color=cc.color(trail.color||'#ffffff');node.color=cc.color(trail.color||'#ffffff');node.opacity=trail.opacity===undefined?255:trail.opacity;if(cc.macro){renderer.srcBlendFactor=cc.macro.SRC_ALPHA;renderer.dstBlendFactor=trail.additive?cc.macro.ONE:cc.macro.ONE_MINUS_SRC_ALPHA;}if(renderer.reset)renderer.reset();
      });
    }
    if (!descriptor) return;
    view.cancelFlight = bank.get(descriptor, function (clip) {
      view.cancelFlight = null;
      if (!current()) return;
      if (!clip) { if (options.trail === undefined) restoreTrails(); return; }
      try {
        var field = descriptor.kind === "spine" ? "spineNode" : "spriteNode", node = view[field];
        if (!valid(node)) { node = view[field] = new cc.Node("Projectile artwork"); node.setParent(shot.node); }
        node.active = true; node.setPosition(0, 0); node.setScale(1); node.group = shot.node.group;
        view.renderer = draw(node, clip, options); view.node = node; view.clip = clip;
        if(options.trail!==undefined&&cc.MotionStreak)node.getComponentsInChildren(cc.MotionStreak).forEach(function(trail){trail.enabled=false;});
        // Hide only the authored renderers; leave every gameplay transform alone.
        var root = shot._towerBehavior ? shot.node : shot.bullet || shot.node;
        root.getComponentsInChildren(cc.RenderComponent).forEach(function (renderer) {
          var visualNode=renderer.node;while(visualNode&&visualNode!==shot.node){if(visualNode===node)return;visualNode=visualNode.parent;}
          if (renderer === view.renderer) return;
          if (renderer.node === shot._towerImpactNode) return;
          if(cc.MotionStreak && renderer instanceof cc.MotionStreak) return;
          view.original.push({ renderer: renderer, enabled: renderer.enabled }); renderer.enabled = false;
        });
      } catch (error) { visualError(view, error, descriptor); }
    });
  }
  this.cancelCatalog = load(function (data) { view.cancelCatalog = null; try { apply(data); } catch (error) { visualError(view, error); } });
};
View.prototype.step = function (dt) {
  this.age += dt;
  if (this.clip && this.clip.descriptor.kind === "flipbook" && valid(this.node)) {
    var descriptor = this.clip.descriptor;
    var sequence=descriptor.loopFrames;this.renderer.spriteFrame = this.clip.frames[sequence&&sequence.length?sequence[Math.floor(this.age*descriptor.fps)%sequence.length]:Math.floor(this.age * descriptor.fps) % descriptor.frames];
  }
};
View.prototype.impact = function () {
  if (valid(this.node)) this.node.active = false;
  var shot = this.shot, bank = this.bank, epoch = bank.owner._combatEpoch;
  bank.effect(this.impactDescriptor, shot.node.parent, shot.node.getPosition(), shot.node.angle, this.options || { size: 48 }, function () { return !bank.dead && bank.owner._combatEpoch === epoch; });
};
function prepare(shot, owner, key, sourceActor) {
  if (!owner._projectileLooks) owner._projectileLooks = new Bank(owner);
  if (!shot._projectileVisual || shot._projectileVisual.bank !== owner._projectileLooks) {
    if (shot._projectileVisual) shot._projectileVisual.release();
    shot._projectileVisual = new View(shot, owner._projectileLooks);
  }
  shot._launchProjectileLook = function () { try { shot._projectileVisual.begin(key, sourceActor); } catch (error) { visualError(shot._projectileVisual, error); } };
}
exports.prepare = prepare;
exports.select = select;
exports.selectSource = selectSource;
exports.Bank = Bank;
// Static buildings and wall cards have no Spine attack clock. Their explicit
// launch delay is advanced with this battle's own simulation delta and epoch.
exports.launchDelay=function(key){var choice=catalog&&select(catalog,key),value=choice&&choice.launchDelay;return typeof value==='number'&&isFinite(value)&&value>0&&value<=10?value:0;};
exports.queueLaunch=function(owner,key,source,callback,guard){
  var choice=catalog&&select(catalog,key),delay=choice&&choice.launchDelay;
  if(!(typeof delay==='number'&&isFinite(delay)&&delay>0&&delay<=10))return callback();
  if(!owner._projectileLooks)owner._projectileLooks=new Bank(owner);
  var bank=owner._projectileLooks;if(bank.dead)return;
  bank.launches.push({source:source,node:source.node,generation:source.node._combatGeneration,time:source.time,cfg:source.buildInfo&&source.buildInfo.cfg,remaining:delay,epoch:owner._combatEpoch,callback:callback,guard:guard});
};
exports.prime = function (data) { catalog=data;loading=false;retryAfter=0;var callbacks=waiting;waiting=[];callbacks.forEach(function(callback){callback(catalog);}); };
exports.release = function (shot) {
  var view = shot._projectileVisual;
  if (view) view.release();
  shot._projectileVisual = null; shot._launchProjectileLook = null;
};
