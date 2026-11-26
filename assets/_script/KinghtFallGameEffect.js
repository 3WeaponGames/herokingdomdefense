var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1PoolMgr = require("PoolMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var EquipmentTiers = require("EquipmentTiers"), warnedAttackClip = false;
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
function live(value) { return !!value && (!cc.isValid || cc.isValid(value, true)); }
function effectScope(owner, parent) {
  var ui = $z1KinghtFallUIGame.default && $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame;
  return { owner: owner, node: owner.node, resources: owner._resourceGeneration, version: owner._effectVersion,
    overlay: owner.ui, parent: parent, ui: ui, dispatcher: ui && ui.ctrEffect, game: game, data: game && game.gameData,
    epoch: game && game._combatEpoch, status: game && game.gameStatus };
}
function scopeCurrent(scope) {
  var owner = scope.owner, ui = $z1KinghtFallUIGame.default && $z1KinghtFallUIGame.default.instance, game = scope.game;
  return live(owner) && !owner.isDestroy && owner.enabled !== false && owner.node === scope.node && live(scope.node) &&
    owner._resourceGeneration === scope.resources && owner._effectVersion === scope.version && owner.ui === scope.overlay && live(scope.parent) &&
    scope.node.activeInHierarchy !== false && scope.parent.activeInHierarchy !== false && ui === scope.ui &&
    (!ui || live(ui) && !ui.isclose && (!ui.node || live(ui.node) && ui.node.activeInHierarchy !== false) && ui.ctrGame === game && ui.ctrEffect === scope.dispatcher && (!scope.dispatcher || scope.dispatcher === owner)) &&
    (!game || live(game) && (!game.node || live(game.node)) && game.gameData === scope.data && game._combatEpoch === scope.epoch && game.gameStatus === scope.status);
}
function paused(scope) { return !!(scope.ui && scope.ui.isPauset); }
function playback(scope) { var speed = scope.ui && scope.ui.speed; return typeof speed === "number" && isFinite(speed) && speed >= 0 ? speed : 1; }
function releaseEffect(record) {
  var owner = record.scope.owner;
  if (!owner._spatialEffects || !owner._spatialEffects.delete(record) || record.node._gameEffectLease !== record) return;
  delete record.node._gameEffectLease;
  if (live(record.skeleton)) { record.skeleton.setCompleteListener(null); record.skeleton.paused = record.wasPaused; record.skeleton.timeScale = record.timeScale; }
  if (live(record.node)) { record.node.active = false; $z1PoolMgr.PoolMgr.getInstance().freeNode(record.pool, record.node); }
}
function clearEffects(owner) {
  owner._effectVersion = (owner._effectVersion || 0) + 1;
  if (owner._spatialEffects) owner._spatialEffects.forEach(releaseEffect);
}
function spatialEffect(owner, position, prefab, pool, parent, options) {
  var scope = effectScope(owner, parent), point = { x: position.x, y: position.y }, manager = $z1PoolMgr.PoolMgr.getInstance();
  if (!scopeCurrent(scope)) return;
  function start(node) {
    if (!scopeCurrent(scope) || !live(node)) { if (live(node)) manager.freeNode(pool, node); return; }
    var prior = node._gameEffectLease;
    if (prior) {
      if (prior.scope.owner._spatialEffects) prior.scope.owner._spatialEffects.delete(prior);
      if (live(prior.skeleton)) { prior.skeleton.setCompleteListener(null); prior.skeleton.paused = prior.wasPaused; prior.skeleton.timeScale = prior.timeScale; }
    }
    delete node._gameEffectLease;
    var skeleton = node.getComponentInChildren(sp.Skeleton);
    if (!live(skeleton)) { node.active = false; manager.freeNode(pool, node); return; }
    var rate = skeleton.timeScale;
    var record = { scope: scope, node: node, skeleton: skeleton, pool: pool, remaining: options.duration, wasPaused: !!skeleton.paused, timeScale: typeof rate === "number" && isFinite(rate) ? rate : 1 };
    owner._spatialEffects = owner._spatialEffects || new Set(); owner._spatialEffects.add(record); node._gameEffectLease = record;
    function current(attached) {
      if (!owner._spatialEffects.has(record) || node._gameEffectLease !== record) return false;
      if (!scopeCurrent(scope) || !live(node) || !live(skeleton) || attached && node.parent !== scope.parent) { releaseEffect(record); return false; }
      return true;
    }
    if (!current(false)) return;
    skeleton.setCompleteListener(null);
    if (!current(false)) return;
    // Native Spine initializes during activation. Place and lease the cold
    // prefab first; findAnimation otherwise reports valid authored clips absent.
    node.active = false;
    if (!current(false)) return;
    node.setParent(scope.parent);
    if (!current(true)) return;
    node.setPosition(point);
    if (!current(true)) return;
    if (options.scale !== undefined) { node.scale = options.scale; if (!current(true)) return; }
    node.active = true;
    if (!current(true)) return;
    function supports(name) { return current(true) && (!skeleton.findAnimation || !!skeleton.findAnimation(name)); }
    var clip = Object.prototype.hasOwnProperty.call(options, "clip") ? options.clip : skeleton.defaultAnimation;
    if (options.impact && typeof clip === "string" && clip.indexOf("jian_") === 0 && !supports(clip)) {
      var skin = EquipmentTiers.legacySkin(clip.slice(5), function (name) { return supports("jian_" + name); }); clip = skin && "jian_" + skin;
    }
    var supported = !!clip && supports(clip);
    if (!current(true)) return;
    if (!supported) {
      releaseEffect(record);
      if (!warnedAttackClip && cc.warn) cc.warn("Attack impact animation unavailable; skipping the missing visual.", clip);
      warnedAttackClip = true; return;
    }
    skeleton.paused = paused(scope) || record.wasPaused;
    if (!current(true)) return;
    skeleton.timeScale = record.timeScale * playback(scope);
    if (!current(true)) return;
    skeleton.setAnimation(0, clip, !!options.loop);
    if (!current(true)) return;
    if (options.impact) skeleton.node.name = clip;
    if (!current(true)) return;
    if (options.duration === undefined) skeleton.setCompleteListener(function () { releaseEffect(record); });
  }
  var node = manager.getNode(pool);
  if (node) return start(node);
  var bundle = $z1KinghtFallConfig.KinghtFallBundelName.Effect;
  if (options.impact) {
    // Use the stage's prepared impact prefab and grow its pool with demand.
    // Reserving spare copies during the first hit blocks the combat frame.
    var warmup = scope.ui && scope.ui._stageAssets;
    var prepared = warmup && warmup.assets[bundle + "/" + prefab + ":prefab"];
    if (live(prepared)) return start(manager.getNodeFromPrefab(pool, prepared, 0));
  }
  owner.loadPrefab(bundle, prefab, function (asset) {
    // The same controller may serve another map before this load completes.
    if (scopeCurrent(scope)) start(manager.getNodeFromPrefab(pool, asset, options.impact ? 0 : 10));
  });
}
var def_KinghtFallGameEffect = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndDam = null;
    e.labList = [];
    e._effectVersion = 0;
    e._spatialEffects = new Set();
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.initData = function (t) {
    clearEffects(this);
    this.ui = t;
    this.loadEffect($z1KinghtFallConfig.KinghtFallPrefabName.EffectEnemyDead);
    this.ndDam.active = false;
  };
  _ctor.prototype.loadEffect = function (t) {
    this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Effect, t, function () {});
  };
  _ctor.prototype.showDamageNum = function (t, e, n) {
    undefined === n && (n = false);
  };
  _ctor.prototype.onMonsterAttack = function (t, e) {
    if (!e) return;
    spatialEffect(this, t, $z1KinghtFallConfig.KinghtFallPrefabName.EffectEnemyAttack, $z1KinghtFallConfig.KinghtFallPoolName.EnemyAttack, this.node, {clip:e,impact:true});
  };
  _ctor.prototype.onSoldierDead = function (t, e) {
    spatialEffect(this, t, $z1KinghtFallConfig.KinghtFallPrefabName.EffectEnemyDead, $z1KinghtFallConfig.KinghtFallPoolName.EnemyDead, this.node, {scale:e});
  };
  _ctor.prototype.onMoveTrack = function (t, e, n) {
    var ui = $z1KinghtFallUIGame.default && $z1KinghtFallUIGame.default.instance;
    spatialEffect(this, t, e, n, ui && ui.ctrGame && ui.ctrGame.ndTrack, {loop:true,duration:2});
  };
  _ctor.prototype.onAttack = function (t, e, n) {
    spatialEffect(this, t, e, n, this.ui, {});
  };
  _ctor.prototype.onAttack2 = function (t, e, n, i) {
    spatialEffect(this, t, e, n, this.ui, {clip:i});
  };
  _ctor.prototype.update = function (dt) {
    if (!this._spatialEffects) return;
    this._spatialEffects.forEach(function (record) {
      if (!scopeCurrent(record.scope) || record.node._gameEffectLease !== record || !live(record.node) || record.node.parent !== record.scope.parent || !live(record.skeleton)) { releaseEffect(record); return; }
      var stopped = paused(record.scope), frozen = stopped || record.wasPaused, speed = playback(record.scope), rate = record.timeScale * speed;
      if (record.skeleton.paused !== frozen) record.skeleton.paused = frozen;
      if (record.skeleton.timeScale !== rate) record.skeleton.timeScale = rate;
      if (!stopped && record.remaining !== undefined && dt > 0 && isFinite(dt)) { record.remaining -= dt * speed; if (record.remaining <= 1e-9) releaseEffect(record); }
    });
  };
  _ctor.prototype.onDisable = function () { clearEffects(this); if (t.prototype.onDisable) t.prototype.onDisable.call(this); };
  _ctor.prototype.onDestroy = function () { clearEffects(this); if (t.prototype.onDestroy) t.prototype.onDestroy.call(this); };
  _ctor.prototype.onBuff = function (t, e, n) {
    var i = $z1PoolMgr.PoolMgr.getInstance().getNode(e);
    if (i) {
      n(i);
    } else {
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Effect, t, function (t) {
        i = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab(e, t, 10);
        n(i);
      });
    }
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "伤害数字"
  })], _ctor.prototype, "ndDam", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_KinghtFallGameEffect;
