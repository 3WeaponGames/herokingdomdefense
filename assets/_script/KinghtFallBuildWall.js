var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallInterface = require("KinghtFallInterface");
var $z1KinghtFallBuildBase = require("KinghtFallBuildBase");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallBuildWall = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndAniEffect = null;
    e.polyPoints = [];
    e.isOpen = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    t.prototype.start.call(this);
    var e = this.node.getComponent(cc.PolygonCollider);
    this.polyPoints = [];
    if (e) {
      for (var n = 0; n < e.points.length; n++) {
        var i = e.points[n];
        this.polyPoints.push(this.node.convertToWorldSpaceAR(i));
      }
    }
    this.ndAniEffect.node.active = false;
  };
  _ctor.prototype.setLevel = function (e) {
    t.prototype.setLevel.call(this, e);
    this.ndAniEffect.node.active = false;
    this.isOpen = false;
  };
  _ctor.prototype.setLight = function (t) {
    var e = this;
    if (this.buildCfg.enumValue != $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None) {
      this.ndLockList.forEach(function (n, i) {
        var a;
        n.active = !t && i == ((null === (a = e.buildInfo) || undefined === a ? undefined : a.cfg) ? e.buildInfo.cfg.level : 0) && e.canLock && e.buildInfo.canUpgrade;
        n.getChildByName("sprPro") && (n.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = 0);
      });
      if (this.canLock && 0 != this.index) {
        if (this.isDestroyed) {
          this.isDestroyed = false, this.doUpgreadAni();
        } else if (t) {
          if (this.isOpen) {
            this.ndAniMain.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.fade_in, false), this.ndAniMain.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.open_night, false), this.ndAniDown && (this.ndAniDown.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.fade_in, false), this.ndAniDown.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.open_night, false)), this.ndAniOther.forEach(function (t) {
              t.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.fade_in, false);
              t.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.open_night, false);
            });
          } else {
            this.ndAniMain.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.fade_in, false), this.ndAniMain.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle_night, true), this.ndAniDown && (this.ndAniDown.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.fade_in, false), this.ndAniDown.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle_night, true)), this.ndAniOther.forEach(function (t) {
              t.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.fade_in, false);
              t.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle_night, true);
            });
          }
        } else if (this.isOpen) {
          this.ndAniMain.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.open, false), this.ndAniDown && this.ndAniDown.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.open, false), this.ndAniOther.forEach(function (t) {
            t.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.open, false);
          });
        } else {
          this.ndAniMain.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, true), this.ndAniDown && this.ndAniDown.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, true), this.ndAniOther.forEach(function (t) {
            t.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, true);
          });
        }
      }
    }
  };
  _ctor.prototype.doTime = function () {
    var t;
    var e = this;
    var n = false;
    var i = $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay.getWpos();
    cc.Intersection.pointInPolygon(i, this.polyPoints) && (n = true);
    if (!n) {
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getSoldierList();
      for (var o = 0; o < a.length; o++) {
        var r = a[o];
        if (!r.isDead() && cc.Intersection.pointInPolygon(r.getWpos(), this.polyPoints)) {
          n = true;
          break;
        }
      }
    }
    if (n && this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
      t.enabled = false;
      cc.Tween.stopAllByTarget(t);
    }), n != this.isOpen) {
      this.isOpen = n;
      if (this.isOpen) {
        t = $z1KinghtFallUIGame.default.instance.ctrGame.gameStatus == $z1KinghtFallModle.KinghtFallGameStage.Prepare ? $z1KinghtFallBuildBase.KinghtFallBuildAniName.open : $z1KinghtFallBuildBase.KinghtFallBuildAniName.open_night, this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
          t.enabled = false;
          cc.Tween.stopAllByTarget(t);
        });
      } else {
        t = $z1KinghtFallUIGame.default.instance.ctrGame.gameStatus == $z1KinghtFallModle.KinghtFallGameStage.Prepare ? $z1KinghtFallBuildBase.KinghtFallBuildAniName.shut : $z1KinghtFallBuildBase.KinghtFallBuildAniName.shut_night, this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
          t.enabled = t.tag == e.index;
          t.enabled && cc.tween(t).to(.1, {}, {
            onUpdate: function (n, i) {
              var a = [];
              for (var o = 0; o < e.colPoint[t.uuid].length; o++) {
                a.push(cc.v2(e.colPoint[t.uuid][o].x * i, e.colPoint[t.uuid][o].y * i));
              }
              n.points = a;
              n.apply();
            }
          }).start();
        });
      }
      if (this.ndAniMain.animation == $z1KinghtFallBuildBase.KinghtFallBuildAniName.create || this.ndAniMain.animation == $z1KinghtFallBuildBase.KinghtFallBuildAniName.upgrade) {
        this.ndAniMain.addAnimation(0, t, false), this.ndAniDown.addAnimation(0, t, false);
      } else {
        this.ndAniMain.setAnimation(0, t, false), this.ndAniDown.setAnimation(0, t, false);
      }
    }
  };
  _ctor.prototype.doUpgreadAni = function () {
    var t = this;
    if (1 == this.index) {
      this.ndAniMain.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.create, false);
      this.ndAniMain.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
      this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
        e.enabled = e.tag == t.index;
      });
      if (this.ndAniDown) {
        this.ndAniDown.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.create, false), this.ndAniDown.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
      }
      this.ndAniOther.forEach(function (e) {
        e.node.active = true;
        e.setSkin(t.buildInfo.cfg.Skin);
        e.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.create, false);
        e.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
        e.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
          e.enabled = e.tag == t.index;
        });
      });
    } else {
      this.ndAniMain.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.upgrade, false);
      this.ndAniMain.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
      if (this.ndAniDown) {
        this.ndAniDown.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.upgrade, false), this.ndAniDown.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
      }
      this.ndAniOther.forEach(function (e) {
        e.node.active = true;
        e.setSkin(t.buildInfo.cfg.Skin);
        e.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.upgrade, false);
        e.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
        e.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
          e.enabled = e.tag == t.index;
        });
      });
    }
  };
  _ctor.prototype.onAttacked = function (t) {
    var e = this;
    if (!this.isDestroyed) {
      this.buildInfo.hp -= t;
      if (this.buildInfo.hp <= 0) {
        this.onDead();
        this.ndAniEffect.node.active = true;
        var n = this.ndAniEffect.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.destroy, false);
        this.ndAniEffect.setTrackCompleteListener(n, function () {
          e.ndAniEffect.node.active = false;
        });
      }
      this.ctrHp.setHp(this.buildInfo.hp, this.buildInfo.hpMax);
      return t;
    }
  };
  _ctor.prototype.onDead = function () {
    t.prototype.onDead.call(this);
    var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff06);
    if (e) {
      var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
      for (var i = 0; i < n.length; i++) {
        n[i].addBuff($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageCut, {
          subNum: e.Pamer[0],
          time: 3
        });
      }
    }
    $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1KinghtFallConfig.KinghtFallUIID.UIGame, $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.Game01), this.T(this.buildCfg.name)));
  };
  _ctor.prototype.onChangeSpeed = function () {
    var t = $z1KinghtFallUIGame.default.instance.speed;
    this.ndAniMain.timeScale = t;
    this.ndAniDown && (this.ndAniDown.timeScale = t);
    this.ndAniOther.forEach(function (e) {
      e.timeScale = t;
    });
    this.ndAniEffect.timeScale = t;
  };
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "建筑其他部分"
  })], _ctor.prototype, "ndAniEffect", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBuildBase.default);
exports.default = def_KinghtFallBuildWall;