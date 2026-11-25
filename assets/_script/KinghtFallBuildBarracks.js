var BattleSounds = require("BattleSounds");
var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallSoldierBase = require("KinghtFallSoldierBase");
var $z1KinghtFallBuildBase = require("KinghtFallBuildBase");
var Navigation = require("KinghtFallNavigation");
var RelicBattle = require("RelicBattle");
var RelicRuntime = require("RelicRuntime");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallBuildBarracks = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndPro = null;
    e.ndBotnNodeList = null;
    e.ndVideoSoldier = null;
    e.squadSpawnPosition = null;
    e.stratAge = 0;
    e.time = {};
    e.enemyList = [];
    e.waitEnemy = [];
    e._rosterRequests = {};
    e._rosterSignature = null;
    e._newSoldiers = new WeakSet();
    e._soldierRallyPosts = [];
    e._spawnRetryTime = 0;
    e.standTimeMax = 1.5;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    // Older map prefabs still use this node as an alternate squad exit.
    if (this.ndVideoSoldier) this.ndVideoSoldier.active = false;
    t.prototype.start.call(this);
    this.stratAge = $z1Utils.Utils.randomRang(1, 360);
    this.ndPro.active = false;
  };
  _ctor.prototype.setLevel = function (e) {
    t.prototype.setLevel.call(this, e);
    if (this.ndVideoSoldier) this.ndVideoSoldier.active = false;
    if(this.buildInfo.cfg&&this.buildInfo.cfg.AdUnitPosition||this._adUnitPosition)require("BuildingSpawnPositions").applyAd(this);
    this.time = {};
    this.ndPro.active = false;
    if (this.buildInfo.cfg) {
      Navigation.invalidate($z1KinghtFallUIGame.default.instance.ctrGame);
      this.time[r.Reborn] = 0;
      this.time[r.RebornMax] = RelicBattle.replacementInterval(RelicRuntime.current(), this.buildInfo.cfg.Data[2]);
      this.initSoldier();
      this.waitEnemy = [];
    } else {
      this._rosterSignature = null;
      this._rosterRequests = {};
    }
  };
  _ctor.prototype.onUpgradeCommitted = function () {
    if (BattleSounds.effect) BattleSounds.effect("barracks-squad-spawn", this);
    if (cc.resources) require("UnitVoices").announce(this);
  };
  _ctor.prototype.getPos = function (t, initialPost) {
    var game = $z1KinghtFallUIGame.default.instance.ctrGame, unit = this.enemyList[t];
    var e = Math.max(1, this._soldierCount(game));
    var i = (this.stratAge + 360 * t / e) * Math.PI / 180;
    var a = cc.v2(Math.cos(i), Math.sin(i)).multiplyScalar(20);
    var anchor = Navigation.positionOf(this.ndBotnNodeList, game);
    var positions = this.buildInfo.cfg.SpawnPosition || this.buildInfo.cfg.SpawnPositions ? require("BuildingSpawnPositions") : null;
    var squad = positions && positions.anchor(this.buildInfo.cfg);
    if (squad) {
      var squadWorld = this.node.convertToWorldSpaceAR(cc.v2(squad.x, squad.y));
      anchor = game.ndMain.convertToNodeSpaceAR(squadWorld);
      // Use one authored area and distinct, body-sized preferred posts. The
      // same standing search as rallying handles terrain and nearby actors.
      var bodyRadius = unit ? Navigation.get(game).radius(unit, true) : 12;
      for (var memberIndex = 0; memberIndex < this.enemyList.length; memberIndex++) {
        var member = this.enemyList[memberIndex];
        if (member) bodyRadius = Math.max(bodyRadius, Navigation.get(game).radius(member, true));
      }
      var spread = e > 1 ? (bodyRadius * 2 + 6) / (2 * Math.sin(Math.PI / e)) : 0;
      a = cc.v2(Math.cos(-Math.PI / 2 + 2 * Math.PI * t / e) * spread, Math.sin(-Math.PI / 2 + 2 * Math.PI * t / e) * spread);
      var anchorKey = anchor.x + ":" + anchor.y + ":" + e;
      if (this._spawnAnchorKey !== anchorKey) { this._spawnAnchorKey = anchorKey; this._spawnPosts = []; }
    }
    var preferred = cc.v2(anchor.x + a.x, anchor.y + a.y);
    var custom = !squad && positions && positions.get(this.buildInfo.cfg,t);
    if(custom){var world=this.node.convertToWorldSpaceAR(cc.v2(custom.x,custom.y));preferred=game.ndMain.convertToNodeSpaceAR(world);anchor=preferred;}
    if (!unit) return preferred;
    unit._spawnBodyRadius = Math.max(unit._spawnBodyRadius || 0, Navigation.get(game).radius(unit, true));
    if (!this._spawnPosts) this._spawnPosts = [];
    if (squad || custom) {
      var destination = unit.getDeploymentDestination(game, initialPost);
      var exit = Navigation.spawnOutsideBarracks(unit, game, this, anchor, destination);
      if (exit !== undefined) {
        delete this._spawnPosts[t];
        return exit && cc.v2(exit.x, exit.y);
      }
    }
    var position = Navigation.findStandingPoint(unit, game, anchor, custom ? preferred : this._spawnPosts[t] || preferred);
    if(!position&&!custom&&!squad&&this.ndVideoSoldier&&this.ndVideoSoldier.convertToWorldSpaceAR){
      // Older map templates can leave their formation marker inside a cliff
      // after the barracks is moved. The legacy marker is a second authored
      // exit and uses the same terrain and crowd checks.
      var doorway=Navigation.positionOf(this.ndVideoSoldier,game);
      position=Navigation.findStandingPoint(unit,game,doorway,cc.v2(doorway.x+a.x,doorway.y+a.y));
    }
    if (!position) {
      // A blocked authored exit still produces a living soldier. Keep the
      // spawn on the map and let shared navigation walk out of its existing
      // overlap, rather than hiding the roster slot until terrain disappears.
      var navigation = Navigation.get(game), bounds = navigation.grid.bounds;
      var paddingX = Math.min(unit._spawnBodyRadius, (bounds.maxX - bounds.minX) / 2);
      var paddingY = Math.min(unit._spawnBodyRadius, (bounds.maxY - bounds.minY) / 2);
      position = {
        x: Math.max(bounds.minX + paddingX, Math.min(bounds.maxX - paddingX, preferred.x)),
        y: Math.max(bounds.minY + paddingY, Math.min(bounds.maxY - paddingY, preferred.y))
      };
    }
    this._spawnPosts[t] = { x: position.x, y: position.y };
    return cc.v2(position.x, position.y);
  };
  _ctor.prototype._placeSoldier = function (unit, index) {
    var owner = this, ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame, data = game && game.gameData, epoch = game && game._combatEpoch;
    var node = this.node, generation = node._combatGeneration, info = this.buildInfo, roster = this.enemyList, unitNode = unit.node, unitGeneration = unitNode._combatGeneration;
    function current() { return cc.isValid(owner, true) && owner.node === node && cc.isValid(node, true) && node._combatGeneration === generation && owner.buildInfo === info && owner.enemyList === roster && roster[index] === unit && !owner.isDestroyed &&
      unit.node === unitNode && cc.isValid(unitNode, true) && unitNode._combatGeneration === unitGeneration && !unit._isPooled && $z1KinghtFallUIGame.default.instance === ui && ui.ctrGame === game && game.gameData === data && game._combatEpoch === epoch; }
    var initialPost = this._newSoldiers.has(unit) && this.squadSpawnPosition && require("BuildingSpawnPositions").destination(info.cfg, this);
    if (initialPost) initialPost = game.ndMain.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(initialPost.x, initialPost.y)));
    var position = this.getPos(index, initialPost);
    if (!position) {
      // Keep the owned roster slot without putting a body inside terrain or
      // reporting a combat death. A later retry can use newly cleared ground.
      unit._spawnPending = true;
      Navigation.reset(unit);
      unit.node.active = false;
      if (!current()) return false;
      if (unit.rigidBody) unit.rigidBody.active = false;
      unit.hp = 0;
      unit.state = $z1KinghtFallSoldierBase.KinghtFallSoldierStatus.Dead;
      return false;
    }
    unit.node.setPosition(position);
    if (!current()) return false;
    var lease = { generation: unitGeneration }, renewed = unit.setNew(lease, { initialPost: initialPost || null });
    if (renewed === false) return false;
    unitGeneration = lease.generation;
    if (!current()) return false;
    this._newSoldiers.delete(unit);
    Navigation.prepareTerrainExit(unit, game, true);
    unit._spawnPending = false;
    this.waitEnemy = this.waitEnemy.filter(function (waiting) { return waiting !== unit; });
    return true;
  };
  _ctor.prototype.addDie = function (t) {
    this.time[r.Reborn] >= this.time[r.RebornMax] && (this.time[r.Reborn] = 0);
    if (this.waitEnemy.indexOf(t) < 0) this.waitEnemy.push(t);
    this.ndPro.active = this.getIsWork();
  };
  _ctor.prototype.doTime = function (t) {
    this._rosterRetryTime = Math.max(0, (this._rosterRetryTime || 0) - t);
    if (this._rosterRetryTime === 0 && this.buildInfo && this.buildInfo.cfg && this.getIsWork()) {
      this._rosterRetryTime = .25;
      var game = $z1KinghtFallUIGame.default.instance.ctrGame;
      var count = this._soldierCount(game);
      for (var slot = 0; slot < count; slot++) if (!this.enemyList[slot]) this._requestSoldier(slot, game);
    }
    this._spawnRetryTime = Math.max(0, (this._spawnRetryTime || 0) - t);
    var retryReady = this._spawnRetryTime === 0;
    if (retryReady) {
      for (var pendingIndex = 0; pendingIndex < this.enemyList.length; pendingIndex++) {
        var pending = this.enemyList[pendingIndex];
        if (pending && pending._spawnPending && this.waitEnemy.indexOf(pending) < 0 && !this._placeSoldier(pending, pendingIndex)) this._spawnRetryTime = .25;
      }
    }
    if (this.waitEnemy.length > 0 && (this.ndPro.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = this.time[r.Reborn] / this.time[r.RebornMax], this.time[r.Reborn] += t, this.time[r.Reborn] >= this.time[r.RebornMax]) && retryReady) {
      var n = this.waitEnemy[0], found = false;
      for (var i = 0; i < this.enemyList.length; i++) {
        var a = this.enemyList[i];
        if (a && a.uuid == n.uuid) {
          found = true;
          if (this._placeSoldier(n, i)) this.time[r.Reborn] = 0;
          else { this.time[r.Reborn] = this.time[r.RebornMax]; this._spawnRetryTime = .25; }
          break;
        }
      }
      if (!found) this.waitEnemy.shift();
      0 == this.waitEnemy.length && (this.ndPro.active = false);
    }
  };
  _ctor.prototype.reset = function (e) {
    if (e) { this._soldierRallyPosts = []; this._spawnPosts = []; }
    this._rosterSignature = null;
    this._rosterRequests = {};
    this._spawnRetryTime = 0;
    t.prototype.reset.call(this, e);
    if (e) {
      for (var n = 0; n < this.enemyList.length; n++) {
        var i = this.enemyList[n];
        $z1KinghtFallUIGame.default.instance.ctrGame.gameData.delSoldier(i);
      }
      this.enemyList = [];
    }
    this.waitEnemy = [];
    if (this.ndVideoSoldier) this.ndVideoSoldier.active = false;
    this.initBuffData();
  };
  _ctor.prototype.initBuffData = function () {
    t.prototype.initBuffData.call(this);
    if (this.buildInfo && this.buildInfo.cfg) {
      for (var e = 0; e < this.enemyList.length; e++) {
        var n = this.enemyList[e];
        null == n || n.initBuffData();
      }
      this.initSoldier();
    }
  };
  _ctor.prototype.onDead = function () {
    t.prototype.onDead.call(this);
    this.ndPro.active = false;
    $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1KinghtFallConfig.KinghtFallUIID.UIGame, $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.Game01), this.T(this.buildCfg.name)));
  };
  _ctor.prototype.startRoundGame = function () {
    this.buildInfo.initBuffData();
  };
  _ctor.prototype.endRoundGame = function () {
    t.prototype.endRoundGame.call(this);
    var waiting = this.waitEnemy.slice();
    for (var e = 0; e < waiting.length; e++) {
      var n = waiting[e];
      for (var i = 0; i < this.enemyList.length; i++) {
        var a = this.enemyList[i];
        if (a && a.uuid == n.uuid) {
          if (!this._placeSoldier(n, i)) this._spawnRetryTime = .25;
          break;
        }
      }
    }
    this.ndPro.active = false;
    this.waitEnemy = this.waitEnemy.filter(function (unit) { return unit._spawnPending; });
    if (this.waitEnemy.length) this.time[r.Reborn] = this.time[r.RebornMax];
  };
  _ctor.prototype._soldierCount = function (game) {
    var e = this.buildInfo.cfg.Data[0];
    var n = game.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff23);
    n && (e += n.Pamer[0]);
    game.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff43) && e--;
    return Math.max(0, e);
  };
  _ctor.prototype._requestSoldier = function (index, game) {
    var owner = this, id = this.buildInfo.cfg.Data[1], pending = this._rosterRequests[index];
    if (this.enemyList[index] || pending && pending.id === id && pending.game === game && pending.data === game.gameData && pending.epoch === game._combatEpoch) return;
    // addSoldier drops obsolete prefab callbacks at an epoch boundary. Replace
    // that retired request instead of leaving its roster slot pending forever.
    var request = { id: id, game: game, data: game.gameData, epoch: game._combatEpoch };
    this._rosterRequests[index] = request;
    game.addSoldier(id, function (unit) {
      var current = owner._rosterRequests[index] === request;
      if (current) delete owner._rosterRequests[index];
      var ui = $z1KinghtFallUIGame.default.instance;
      if (!current || !cc.isValid(owner, true) || !cc.isValid(owner.node, true) || owner.isDestroyed || !ui || ui.ctrGame !== game ||
          game.gameData !== request.data || game._combatEpoch !== request.epoch || !owner.buildInfo.cfg ||
          owner.buildInfo.cfg.Data[1] !== id || index >= owner._soldierCount(game) || owner.enemyList[index]) {
        request.data.delSoldier(unit);
        return;
      }
      var roster = owner.enemyList, info = owner.buildInfo, node = owner.node, generation = node._combatGeneration, unitNode = unit.node, unitGeneration = unitNode._combatGeneration;
      owner.enemyList[index] = unit;
      owner._newSoldiers.add(unit);
      unit.setParent(owner);
      if (unit.initBuffData() === false || !cc.isValid(owner, true) || owner.node !== node || !cc.isValid(node, true) || node._combatGeneration !== generation || owner.buildInfo !== info || owner.enemyList !== roster || roster[index] !== unit || owner.isDestroyed ||
          unit.node !== unitNode || !cc.isValid(unitNode, true) || unitNode._combatGeneration !== unitGeneration || unit._isPooled || game.gameData !== request.data || game._combatEpoch !== request.epoch || $z1KinghtFallUIGame.default.instance !== ui || ui.ctrGame !== game) return;
      owner._placeSoldier(unit, index);
    });
  };
  _ctor.prototype.initSoldier = function () {
    var t = this;
    var game = $z1KinghtFallUIGame.default.instance.ctrGame;
    var data = game.gameData, epoch = game._combatEpoch, node = this.node, generation = node._combatGeneration, info = this.buildInfo, cfg = info.cfg, roster = this.enemyList;
    function current() { return cc.isValid(t, true) && t.node === node && cc.isValid(node, true) && node._combatGeneration === generation && t.buildInfo === info && info.cfg === cfg && t.enemyList === roster && !t.isDestroyed &&
      $z1KinghtFallUIGame.default.instance.ctrGame === game && game.gameData === data && game._combatEpoch === epoch; }
    var e = this._soldierCount(game);
    var signature = this.buildInfo.cfg.Data[1] + ":" + e;
    if (signature !== this._rosterSignature) {
      this._rosterSignature = signature;
      this._rosterRequests = {};
    }
    var i = Math.max(e, this.enemyList.length);
    var a = function (n) {
      var i = o.enemyList[n];
      if (i && (n >= e || i.cfg.ID != o.buildInfo.cfg.Data[1])) {
        i && $z1KinghtFallUIGame.default.instance.ctrGame.gameData.delSoldier(i);
        if (!current()) return false;
        o.enemyList[n] = null;
      }
      if (n < e) {
        if (o.enemyList[n]) {
          if (i.isDead() || i._spawnPending) { if (o._placeSoldier(i, n) === false && !current()) return false; }
          else {
            if (i.setNew() === false || !current()) return false;
            Navigation.prepareTerrainExit(i, game, true);
          }
        } else {
          o._requestSoldier(n, game);
          if (!current()) return false;
        }
      }
    };
    var o = this;
    for (var r = 0; r < i; r++) {
      if (a(r) === false) return;
    }
  };
  _ctor.prototype.getSave = function () {
    var save = {
      point: this.ID,
      level: this.index,
      data: 0
    };
    if (this._freeInitialBuild && this.index === 0) save.freeInitialBuild = true;
    if (this._soldierRallyPosts && this._soldierRallyPosts.some(Boolean)) save.rallyPosts = this._soldierRallyPosts.map(function (point) { return point ? { x: point.x, y: point.y } : null; });
    return save;
  };
  _ctor.prototype.getSoldierRallyPoint = function (unit) {
    var point = this._soldierRallyPosts && this._soldierRallyPosts[this.enemyList.indexOf(unit)];
    return point ? { x: point.x, y: point.y } : null;
  };
  _ctor.prototype.setSoldierRallyPoint = function (unit, point) {
    var index = this.enemyList.indexOf(unit);
    if (index < 0 || !isFinite(point.x) || !isFinite(point.y)) return;
    if (!this._soldierRallyPosts) this._soldierRallyPosts = [];
    this._soldierRallyPosts[index] = { x: point.x, y: point.y };
  };
  _ctor.prototype.setSave = function (t) {
    this._soldierRallyPosts = t && Array.isArray(t.rallyPosts) ? t.rallyPosts.map(function (point) {
      return point && typeof point.x === "number" && typeof point.y === "number" && isFinite(point.x) && isFinite(point.y) ? { x: point.x, y: point.y } : null;
    }) : [];
    $z1KinghtFallBuildBase.default.prototype.setSave.call(this, t);
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "复活进度条"
  })], _ctor.prototype, "ndPro", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "出生点"
  })], _ctor.prototype, "ndBotnNodeList", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "Legacy alternate squad exit"
  })], _ctor.prototype, "ndVideoSoldier", undefined);
  cc__decorate([ccp_property({ type: cc.Vec2, tooltip: "Initial squad destination in the original building frame." })], _ctor.prototype, "squadSpawnPosition", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBuildBase.default);
exports.default = def_KinghtFallBuildBarracks;
(function (t) {
  t.Reborn = "Reborn";
  t.RebornMax = "RebornMax";
})(r || (r = {}));
