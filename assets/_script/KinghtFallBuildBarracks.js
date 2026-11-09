var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1PlatformSetting = require("PlatformSetting");
var $z1SdkMgr = require("SdkMgr");
var TestMode = require("TestMode").TestMode;
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
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
    e.stratAge = 0;
    e.VideoTimes = 0;
    e.isIn = false;
    e.time = {};
    e.enemyList = [];
    e.waitEnemy = [];
    e._rosterRequests = {};
    e._rosterSignature = null;
    e._soldierRallyPosts = [];
    e.keepTime = 0;
    e.standTimeMax = 1.5;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    t.prototype.start.call(this);
    this.stratAge = $z1Utils.Utils.randomRang(1, 360);
    this.ndPro.active = false;
    this.init();
  };
  _ctor.prototype.setLevel = function (e) {
    t.prototype.setLevel.call(this, e);
    this.time = {};
    this.ndPro.active = false;
    if (this.buildInfo.cfg) {
      this.time[r.Reborn] = 0;
      this.time[r.RebornMax] = RelicBattle.replacementInterval(RelicRuntime.current(), this.buildInfo.cfg.Data[2]);
      this.initSoldier();
      this.waitEnemy = [];
    } else {
      this._rosterSignature = null;
      this._rosterRequests = {};
    }
  };
  _ctor.prototype.getPos = function (t) {
    var e = this.buildInfo.cfg.Data[0];
    var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff23);
    n && (e += n.Pamer[0]);
    $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff43) && e--;
    e += this.VideoTimes;
    var i = (this.stratAge + 360 * t / e) * Math.PI / 180;
    var a = cc.v2(Math.cos(i), Math.sin(i)).multiplyScalar(20);
    var game = $z1KinghtFallUIGame.default.instance.ctrGame, unit = this.enemyList[t];
    var anchor = Navigation.positionOf(this.ndBotnNodeList, game);
    var preferred = cc.v2(anchor.x + a.x, anchor.y + a.y);
    if (!unit) return preferred;
    unit._spawnBodyRadius = Math.max(unit._spawnBodyRadius || 0, Navigation.get(game).radius(unit));
    if (!this._spawnPosts) this._spawnPosts = [];
    var position = Navigation.findStandingPoint(unit, game, anchor, this._spawnPosts[t] || preferred);
    if (!position) return preferred;
    this._spawnPosts[t] = { x: position.x, y: position.y };
    return cc.v2(position.x, position.y);
  };
  _ctor.prototype.addDie = function (t) {
    this.time[r.Reborn] >= this.time[r.RebornMax] && (this.time[r.Reborn] = 0);
    this.waitEnemy.push(t);
    this.ndPro.active = this.getIsWork();
  };
  _ctor.prototype.doTime = function (t) {
    var e = this;
    var bypassAdLimits = TestMode.getInstance().shouldBypassAdLimits();
    if (this._testAdLimitBypass !== bypassAdLimits) {
      this._testAdLimitBypass = bypassAdLimits;
      this.ndVideoSoldier.active = this.canAddVideoSoldier() && $z1KinghtFallUIGame.default.instance.ctrGame.gameStatus == $z1KinghtFallModle.KinghtFallGameStage.Prepare;
    }
    if (this.waitEnemy.length > 0 && (this.ndPro.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = this.time[r.Reborn] / this.time[r.RebornMax], this.time[r.Reborn] += t, this.time[r.Reborn] >= this.time[r.RebornMax])) {
      this.time[r.Reborn] = 0;
      var n = this.waitEnemy.shift();
      for (var i = 0; i < this.enemyList.length; i++) {
        var a = this.enemyList[i];
        if (a && a.uuid == n.uuid) {
          n.node.setPosition(this.getPos(i));
          n.setNew();
          break;
        }
      }
      0 == this.waitEnemy.length && (this.ndPro.active = false);
    }
    if (this.canAddVideoSoldier() && $z1KinghtFallUIGame.default.instance.ctrGame.gameStatus == $z1KinghtFallModle.KinghtFallGameStage.Prepare) {
      $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay.node.getPosition(this.vec2_1);
      if (this.getInClick(this.vec2_1, t)) {
        this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, true);
        var o = function (t) {
          e.init();
          e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
          if (t) {
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.map_add_soldier);
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_map_add_soldier_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
            e.VideoTimes++;
            e.ndVideoSoldier.active = e.canAddVideoSoldier();
            $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom04));
            e.initBuffData();
          }
        };
        if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
          var h = 0;
          switch (this.buildInfo.cfg.Data[1]) {
            case 90001:
            case 90002:
              h = 1;
              break;
            case 90003:
              h = 3;
              break;
            case 90004:
              h = 4;
          }
          $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, h, function (t) {
            o(t);
          });
        } else {
          $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
            o(true);
          }, function () {
            o(false);
          }, "battle.barracks.extraSoldier");
        }
      }
      this.ndVideoSoldier.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = this.keepTime / this.standTimeMax;
    }
  };
  _ctor.prototype.reset = function (e) {
    if (e) { this._soldierRallyPosts = []; this._spawnPosts = []; }
    this._rosterSignature = null;
    this._rosterRequests = {};
    t.prototype.reset.call(this, e);
    if (e) {
      for (var n = 0; n < this.enemyList.length; n++) {
        var i = this.enemyList[n];
        $z1KinghtFallUIGame.default.instance.ctrGame.gameData.delSoldier(i);
      }
      this.enemyList = [];
      this.VideoTimes = 0;
    }
    this.waitEnemy = [];
    this.ndVideoSoldier.active = this.canAddVideoSoldier();
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
    this.ndVideoSoldier.active = false;
  };
  _ctor.prototype.endRoundGame = function () {
    t.prototype.endRoundGame.call(this);
    for (var e = 0; e < this.waitEnemy.length; e++) {
      var n = this.waitEnemy[e];
      for (var i = 0; i < this.enemyList.length; i++) {
        var a = this.enemyList[i];
        if (a && a.uuid == n.uuid) {
          n.node.setPosition(this.getPos(i));
          n.setNew();
          break;
        }
      }
    }
    this.ndPro.active = false;
    this.waitEnemy = [];
    this.ndVideoSoldier.active = this.canAddVideoSoldier();
  };
  _ctor.prototype.init = function () {
    this.keepTime = 0;
    this.ndVideoSoldier.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = 0;
    this.ndVideoSoldier.active = this.canAddVideoSoldier();
  };
  _ctor.prototype.canAddVideoSoldier = function () {
    return (TestMode.getInstance().shouldBypassAdLimits() || this.VideoTimes < 3) && !$z1SdkMgr.SdkMgr.getInstance().getCheckVersion($z1PlatformSetting.SwitchID.ShenHe);
  };
  _ctor.prototype.getInClick = function (t, e) {
    var n = cc.v2(this.node.x + this.ndVideoSoldier.position.x, this.node.y + this.ndVideoSoldier.position.y);
    if (t.x >= n.x - this.ndVideoSoldier.width * this.ndVideoSoldier.anchorX && t.x <= n.x + this.ndVideoSoldier.width * (1 - this.ndVideoSoldier.anchorX) && t.y >= n.y - this.ndVideoSoldier.height * this.ndVideoSoldier.anchorY && t.y <= n.y + this.ndVideoSoldier.height * (1 - this.ndVideoSoldier.anchorY)) {
      return !this.isIn && (this.keepTime += e, this.keepTime >= this.standTimeMax && (this.isIn = true, this.keepTime = 0, this.ndVideoSoldier.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = 0, true));
    } else {
      return this.isIn = false, this.keepTime -= e, this.keepTime < 0 && (this.keepTime = 0), false;
    }
  };
  _ctor.prototype.initSoldier = function () {
    var t = this;
    var e = this.buildInfo.cfg.Data[0];
    var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff23);
    n && (e += n.Pamer[0]);
    $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff43) && e--;
    e += this.VideoTimes;
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
        o.enemyList[n] = null;
      }
      if (n < e) {
        if (o.enemyList[n]) {
          i.isDead() && i.node.setPosition(o.getPos(n));
          i.setNew();
        } else {
          if (o._rosterRequests[n]) return;
          var request = { id: o.buildInfo.cfg.Data[1] };
          o._rosterRequests[n] = request;
          $z1KinghtFallUIGame.default.instance.ctrGame.addSoldier(o.buildInfo.cfg.Data[1], function (e) {
            var current = t._rosterRequests[n] === request;
            if (current) delete t._rosterRequests[n];
            if (!current || !cc.isValid(t, true) || !cc.isValid(t.node, true) ||
                !t.buildInfo.cfg || t.buildInfo.cfg.Data[1] !== request.id || t.enemyList[n]) {
              $z1KinghtFallUIGame.default.instance.ctrGame.gameData.delSoldier(e);
            } else {
              t.enemyList[n] = e;
              e.setParent(t);
              e.node.setPosition(t.getPos(n));
              e.setNew();
              e.initBuffData();
            }
          });
        }
      }
    };
    var o = this;
    for (var r = 0; r < i; r++) {
      a(r);
    }
    if (this.ndVideoSoldier.SolID != this.buildInfo.cfg.Data[1]) {
      this.ndVideoSoldier.SolID = this.buildInfo.cfg.Data[1];
      var s = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(this.buildInfo.cfg.Data[1], "ally");
      var previewRequest = this._appearancePreviewRequest = { id: this.buildInfo.cfg.Data[1] };
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Enemy, "Play" + s.prefab, function (e) {
        if (t._appearancePreviewRequest !== previewRequest || !cc.isValid(t, true) || !cc.isValid(t.node, true) ||
            !cc.isValid(t.ndVideoSoldier, true) || !t.buildInfo.cfg || t.buildInfo.cfg.Data[1] !== previewRequest.id) return;
        var n = e.data.getComponent($z1KinghtFallSoldierBase.default);
        var i = t.ndVideoSoldier.getChildByName("spAni").getComponent(sp.Skeleton);
        i.skeletonData = n.spAni.skeletonData;
        i.setSkin(n.spAni.defaultSkin);
        i.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Idle, true);
        // A presentation actor shares the barracks level but never joins the
        // gameplay roster, so the offer matches the troops it will produce.
        require("CharacterAppearance").bind({ node: i.node, spAni: i, cfg: s, outBuild: t }, "ally");
      });
    }
  };
  _ctor.prototype.getSave = function () {
    var save = {
      point: this.ID,
      level: this.index,
      data: this.VideoTimes
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
    this.VideoTimes = t && typeof t.data === "number" && isFinite(t.data) ? Math.max(0, Math.floor(t.data)) : 0;
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
    tooltip: "视频小兵"
  })], _ctor.prototype, "ndVideoSoldier", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBuildBase.default);
exports.default = def_KinghtFallBuildBarracks;
(function (t) {
  t.Reborn = "Reborn";
  t.RebornMax = "RebornMax";
})(r || (r = {}));
