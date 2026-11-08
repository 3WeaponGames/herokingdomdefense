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
var $z1KinghtFallInterface = require("KinghtFallInterface");
var $z1KinghtFallBuildBase = require("KinghtFallBuildBase");
var TowerCombat = require("TowerCombat");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallBuildBartizan = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndShot = null;
    e.time = {};
    e.attRange = 0;
    e._towerAimTarget = null;
    e._towerAimNode = null;
    e._towerAimGeneration = null;
    e._towerAimScan = 0;
    e._towerAimInitialized = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.setLevel = function (e) {
    t.prototype.setLevel.call(this, e);
    var n = this.node.getComponent(cc.CircleCollider);
    n || (n = this.node.addComponent(cc.CircleCollider));
    this.time = {};
    this.clearAimTarget();
    if (this.buildInfo.cfg) {
      n.enabled = true;
      this.time[r.AttackTime] = 0;
      this.time[r.AttackSpeed] = this.buildInfo.cfg.Data[1];
      this.time[r.Invincible] = -1;
      n.radius = this.buildInfo.cfg.Data[2];
    } else {
      n.enabled = false;
    }
  };
  _ctor.prototype.doTime = function (t) {
    if (this.isDestroyed) return;
    if (-1 != this.time[r.Invincible]) {
      this.time[r.Invincible] -= t;
      if (this.time[r.Invincible] < 0) {
        this.time[r.Invincible] = -1, this.onDead();
        return;
      }
    }
    var artwork = require("BuildingAppearance");
    if (artwork.step) artwork.step(this, t);
    this.updateAimTarget(t);
    this.time[r.AttackTime] += this.time[r.AttackSpeed] * t;
    var appearance = this.buildInfo && this.buildInfo.cfg && this.buildInfo.cfg.Appearance;
    var tracking = appearance && appearance.weapon && appearance.weapon.sprite;
    // A ready weapon with no opponents should keep its bounded acquisition
    // cadence instead of scanning the entire empty roster every frame.
    this.time[r.AttackTime] >= 1 && (!tracking || this._towerAimTarget) && this.doAttack();
  };
  _ctor.prototype.doAttack = function () {
    if (this.isDestroyed) return;
    var artwork = require("BuildingAppearance");
    var appearance = this.buildInfo && this.buildInfo.cfg && this.buildInfo.cfg.Appearance;
    if (appearance && appearance.weapon && appearance.weapon.sprite && artwork.ready && !artwork.ready(this)) return;
    var t = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
    this.node.getPosition(this.vec2_1);
    var n = TowerCombat.choose(t, this.vec2_1, this.attRange, this.getTowerSettings(), this.node.parent);
    if (n) {
      this.cacheAimTarget(n);
      // Commit the exact firing target before onShotBuild samples the barrel
      // muzzle. Tracking between shots can keep a different cached target.
      if (artwork.aim) artwork.aim(this, n);
      this.time[r.AttackTime] = 0;
      $z1KinghtFallUIGame.default.instance.ctrGame.onShotBuild(this, n);
      if (artwork.fire) artwork.fire(this);
    }
  };
  _ctor.prototype.clearAimTarget = function () {
    this._towerAimTarget = null; this._towerAimNode = null; this._towerAimGeneration = null;
    this._towerAimScan = 0; this._towerAimInitialized = false;
  };
  _ctor.prototype.cacheAimTarget = function (target) {
    this._towerAimTarget = target || null; this._towerAimNode = target && target.node;
    this._towerAimGeneration = target && target.node._combatGeneration;
    this._towerAimScan = .25; this._towerAimInitialized = true;
  };
  _ctor.prototype.aimTargetIsLive = function () {
    var target = this._towerAimTarget;
    if (!target || !TowerCombat.live(target) || target.node !== this._towerAimNode || target.node._combatGeneration !== this._towerAimGeneration) return false;
    var position = TowerCombat.point(target.node, this.node.parent), origin = this.node.getPosition();
    var dx = position.x - origin.x, dy = position.y - origin.y;
    return this.attRange > 0 && dx * dx + dy * dy < this.attRange * this.attRange;
  };
  _ctor.prototype.updateAimTarget = function (dt) {
    var appearance = this.buildInfo && this.buildInfo.cfg && this.buildInfo.cfg.Appearance;
    if (!appearance || !appearance.weapon || !appearance.weapon.sprite || this.isDestroyed) return;
    this._towerAimScan -= dt;
    var expired = !!this._towerAimTarget && !this.aimTargetIsLive();
    if (!this._towerAimInitialized || expired || this._towerAimScan <= 0) {
      var game = $z1KinghtFallUIGame.default.instance.ctrGame;
      var target = TowerCombat.choose(game.gameData.getEnemyList(), this.node.getPosition(), this.attRange, this.getTowerSettings(), this.node.parent);
      this.cacheAimTarget(target);
    }
    var artwork = require("BuildingAppearance");
    if (this._towerAimTarget && artwork.aim) artwork.aim(this, this._towerAimTarget);
    else if (artwork.idle) artwork.idle(this);
  };
  _ctor.prototype.getTowerSettings = function () {
    return TowerCombat.settings(this.buildInfo && this.buildInfo.cfg);
  };
  _ctor.prototype.getAttack = function () {
    var t = this.time[r.AttackNum];
    var e = 1;
    var n = this.getBuffList($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageCut);
    for (var i = 0; i < n.length; i++) {
      e -= n[i].data.subNum;
    }
    $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.FatalArrow] && (e += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.FatalArrow][0]);
    e < 0 && (e = 0);
    return t * e;
  };
  _ctor.prototype.onAttacked = function (t) {
    if (!(this.isDestroyed || this.time[r.Invincible] >= 0)) {
      this.buildInfo.hp -= t;
      if (this.buildInfo.hp <= 0 && -1 == this.time[r.Invincible]) {
        var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff05);
        if (e) {
          this.time[r.Invincible] = e.Pamer[0];
          this.buildInfo.hp = 1;
        }
      }
      this.buildInfo.hp <= 0 && this.onDead();
      this.ctrHp && this.ctrHp.setHp(this.buildInfo.hp, this.buildInfo.hpMax);
      return t;
    }
  };
  _ctor.prototype.reset = function (e) {
    t.prototype.reset.call(this, e);
    this.clearAimTarget();
    this.time[r.Invincible] = -1;
  };
  _ctor.prototype.startRoundGame = function () {
    t.prototype.startRoundGame.call(this);
    this.clearAimTarget();
    if (this.buildInfo.cfg) {
      var e = 1;
      var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff30);
      n && (e += n.Pamer[0]);
      var i = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff51);
      i && (e += i.Pamer[0]);
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.talentAdd[$z1KinghtFallEnum.KinghtFallEnumTalentCfg.TalenType08];
      if (a) {
        for (var o = 0; o < a.length; o++) {
          e += a[o][0];
        }
      }
      $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.VisionSight] && (e += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.VisionSight][0]);
      this.attRange = this.buildInfo.cfg.Data[2] * e;
      this.node.getComponent(cc.CircleCollider).radius = this.attRange;
      var s = 1;
      var l = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.talentAdd[$z1KinghtFallEnum.KinghtFallEnumTalentCfg.TalenType07];
      if (l) {
        for (o = 0; o < l.length; o++) {
          s += l[o][0];
        }
      }
      this.time[r.AttackSpeed] = this.buildInfo.cfg.Data[1] * s;
      var c = 1;
      var h = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.talentAdd[$z1KinghtFallEnum.KinghtFallEnumTalentCfg.TalenType06];
      if (h) {
        for (o = 0; o < h.length; o++) {
          c += h[o][0];
        }
      }
      var g = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff46);
      g && (c += g.Pamer[0]);
      this.time[r.AttackNum] = this.buildInfo.cfg.Data[0] * c;
    }
  };
  _ctor.prototype.onDead = function () {
    this.clearAimTarget();
    t.prototype.onDead.call(this);
    $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1KinghtFallConfig.KinghtFallUIID.UIGame, $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.Game01), this.T(this.buildCfg.name)));
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "发射节点"
  })], _ctor.prototype, "ndShot", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBuildBase.default);
exports.default = def_KinghtFallBuildBartizan;
(function (t) {
  t.AttackTime = "AttackTime";
  t.AttackNum = "AttackNum";
  t.AttackSpeed = "AttackSpeed";
  t.Invincible = "Invincible";
})(r || (r = {}));
