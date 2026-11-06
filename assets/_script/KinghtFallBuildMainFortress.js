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
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallBuildMainFortress = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndShot = null;
    e.time = {};
    e.attRange = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.setLevel = function (e) {
    t.prototype.setLevel.call(this, e);
    var n = this.node.getComponent(cc.CircleCollider);
    n || (n = this.node.addComponent(cc.CircleCollider));
    this.time = {};
    if (this.buildInfo.cfg) {
      n.enabled = true;
      this.time[r.AttackTime] = 0;
      this.time[r.AttackSpeed] = this.buildInfo.cfg.Data[1];
      n.radius = this.buildInfo.cfg.Data[2];
    } else {
      n.enabled = false;
    }
  };
  _ctor.prototype.doTime = function (t) {
    this.time[r.AttackTime] += this.time[r.AttackSpeed] * t;
    this.time[r.AttackTime] >= 1 && this.doAttack();
  };
  _ctor.prototype.doAttack = function () {
    var t = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
    var e = -1;
    var n = null;
    this.node.getPosition(this.vec2_1);
    for (var i = 0; i < t.length; i++) {
      var a = t[i];
      if (!a.isDead()) {
        a.node.getPosition(this.vec2_2);
        cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
        var o = this.vec2_2.len();
        if (o < this.attRange && (-1 == e || o < e)) {
          e = o;
          n = a;
        }
      }
    }
    if (n) {
      this.time[r.AttackTime] = 0;
      $z1KinghtFallUIGame.default.instance.ctrGame.onShotBuild(this, n);
    }
  };
  _ctor.prototype.onAttacked = function (e) {
    if (!this.isDestroyed) {
      $z1KinghtFallUIGame.default.instance.ctrGame.gameTag[$z1KinghtFallEnum.KinghtFallEnumLevelChalType.NoAttack] = 1;
      return t.prototype.onAttacked.call(this, e);
    }
  };
  _ctor.prototype.onDead = function () {
    t.prototype.onDead.call(this);
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GameOver, false);
    $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1KinghtFallConfig.KinghtFallUIID.UIGame, $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.Game01), this.T(this.buildCfg.name)));
  };
  _ctor.prototype.getAttack = function () {
    var t = this.time[r.AttackNum];
    var e = 1;
    var n = this.getBuffList($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageCut);
    for (var i = 0; i < n.length; i++) {
      e -= n[i].data.subNum;
    }
    $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.MainFortDeterrence] && (e += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.MainFortDeterrence][0]);
    e < 0 && (e = 0);
    return t * e;
  };
  _ctor.prototype.startRoundGame = function () {
    t.prototype.startRoundGame.call(this);
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
      var g = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff34);
      g && (c += g.Pamer[0]);
      var p = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff46);
      p && (c += p.Pamer[0]);
      var f = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff56);
      f && (c += f.Pamer[0]);
      this.time[r.AttackNum] = this.buildInfo.cfg.Data[0] * c;
    }
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "发射节点"
  })], _ctor.prototype, "ndShot", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBuildBase.default);
exports.default = def_KinghtFallBuildMainFortress;
(function (t) {
  t.AttackTime = "AttackTime";
  t.AttackSpeed = "AttackSpeed";
  t.AttackNum = "AttackNum";
})(r || (r = {}));