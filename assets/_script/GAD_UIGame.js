var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BasePlatform = require("BasePlatform");
var $z1BaseUI = require("BaseUI");
var $z1PlatformSetting = require("PlatformSetting");
var $z1AudioMgr = require("AudioMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1GAD_Configs = require("GAD_Configs");
var $z1GAD_Bullet = require("GAD_Bullet");
var $z1GAD_Cards = require("GAD_Cards");
var $z1GAD_Door = require("GAD_Door");
var $z1GAD_Enermy = require("GAD_Enermy");
var $z1GADGameEnumData = require("GADGameEnumData");
var $z1GAD_DataMgr = require("GAD_DataMgr");
var $z1GAD_PlayerMgr = require("GAD_PlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_UIGame = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndCardGroup = null;
    e.prefabDoor = null;
    e.prefabEnemy = null;
    e.prefabBullet = null;
    e.ndBulletRoot = null;
    e.roleRoot = null;
    e.ndFence = null;
    e.gmNode = null;
    e._cardCtrl = null;
    e._bullets = [];
    e._waveRoles = [];
    e._curWave = 0;
    e._waveDistance = 300;
    e._doorScaleWidth = 20;
    e._roadWidth = 700;
    e._fenceLine = -300;
    e._isEditor = false;
    return e;
  }
  var n;
  cc__extends(_ctor, t);
  n = _ctor;
  _ctor.prototype.onLoad = function () {
    this._waveLevelCfgs = $z1GAD_DataMgr.default.getInstance().getWaveCfgs($z1GAD_PlayerMgr.default.getInstance().getLevel());
    n.script = this;
    "1" == $z1GAD_DataMgr.default.getInstance().getUrlParam("isEditor") && (this._isEditor = true);
  };
  _ctor.prototype.setGmNode = function () {
    ($z1SdkMgr.SdkMgr.getInstance().getCheckVersion($z1PlatformSetting.SwitchID.ShenHe_ABD) || $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.EDITOR || $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.WEB_LINK) && (this.gmNode.active = true);
  };
  _ctor.prototype.start = function () {
    var t = this;
    this._cardCtrl = this.ndCardGroup.getComponent($z1GAD_Cards.default);
    this.initEvents();
    this._waveDistance = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.roundDistance, 300);
    this._doorScaleWidth = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.width, 20);
    this._roadWidth = Math.min(2 * $z1GAD_Configs.GADConfig.WallWidth, cc.winSize.width);
    this.scheduleOnce(function () {
      t._fenceLine = .5 * -cc.winSize.height + $z1GAD_Configs.GADConfig.BottomHeight;
      t.ndFence.y = t._fenceLine;
      $z1GAD_PlayerMgr.default.getInstance().setState($z1GAD_Configs.emGADGameState.Game);
      t.buildWave();
    });
  };
  _ctor.prototype.initEvents = function () {
    var t = this;
    this.addEvent($z1GAD_Configs.emGADEventName.GAD_Shoot_Bullet, this.onShootBullet);
    this.addEvent($z1GAD_Configs.emGADEventName.GAD_AddBuff, this.addBuff);
    this.addEvent($z1GAD_Configs.emGADEventName.GAD_Player_Die, function () {
      t.openResultView(1, false);
    });
    this.addEvent($z1GAD_Configs.emGADEventName.GAD_Setting_Back, function () {
      t.openResultView(0, false);
    });
    this.addEvent($z1GAD_Configs.emGADEventName.GAD_Bubble_Buf, function (e) {
      if (e) {
        $z1AudioMgr.AudioMgr.getInstance().playEffect($z1GAD_Configs.GAD_AudioId.reward);
        $z1GAD_PlayerMgr.default.getInstance().setState($z1GAD_Configs.emGADGameState.Pause);
        t.openUI($z1GAD_Configs.GAD_UIID.UILottery, e);
      }
    });
    this.node.on(cc.Node.EventType.TOUCH_START, function () {});
    this.node.on(cc.Node.EventType.TOUCH_MOVE, function (e) {
      if ($z1GAD_PlayerMgr.default.getInstance().getState() == $z1GAD_Configs.emGADGameState.Game) {
        var n = e.getDeltaX();
        t.ndCardGroup.x += n;
        t._cardCtrl.updateEdgePos();
      }
    });
  };
  _ctor.prototype.update = function (t) {
    if ($z1GAD_PlayerMgr.default.getInstance().getState() == $z1GAD_Configs.emGADGameState.Game) {
      t = Math.min(t, .02);
      this._cardCtrl.updateCD(t);
      var e = [];
      var n = [];
      for (var i = 0; i < this._waveRoles.length; i++) {
        (C = this._waveRoles[i]).updatePos(t);
        var a = C.getRoleType();
        a == $z1GAD_Configs.emGADRoleType.Door && n.push(C);
        if (a == $z1GAD_Configs.emGADRoleType.Enemy) {
          if (C.node.y <= this._fenceLine) {
            var o = C;
            this._cardCtrl.enermyHit(o.getAtkPower());
            o.onDie();
            this._waveRoles.splice(i, 1);
            i--;
          }
        } else {
          a == $z1GAD_Configs.emGADRoleType.Door && C.node.y <= this._cardCtrl.node.y && e.push(C);
        }
      }
      if (e.length > 0) {
        var r;
        var s;
        var l = false;
        var c = 1e5;
        var h = null;
        var g = this._cardCtrl.node.x;
        for (i = 0; i < e.length; i++) {
          if (g >= (r = e[i]).node.x - .5 * r.getSize().width && g <= r.node.x + .5 * r.getSize().width) {
            (s = r.node.convertToWorldSpaceAR(cc.Vec2.ZERO)).y += .5 * r.node.height;
            this._cardCtrl.addBuff(r.getBufType(), r.getValue());
            this.sendEvent($z1GAD_Configs.emGADEventName.GAD_Show_Buff_Tip, r.getBufType(), s);
            this._cardCtrl.addColliderGroupID(r.getGroupID());
            var u = r.getGroupID();
            l = true;
            for (var d = 0; d < n.length; d++) {
              if (n[d].getGroupID() == u && (m = this._waveRoles.indexOf(n[d])) >= 0) {
                this._waveRoles.splice(m, 1);
                n[d].onDie();
              }
            }
          } else {
            var f = Math.abs(g - r.node.x);
            if (f < c) {
              c = f;
              h = r;
            }
          }
          if (l) {
            break;
          }
        }
        if (!l && h) {
          (s = (r = h).node.convertToWorldSpaceAR(cc.Vec2.ZERO)).y += .5 * r.node.height;
          this._cardCtrl.addBuff(r.getBufType(), r.getValue());
          this.sendEvent($z1GAD_Configs.emGADEventName.GAD_Show_Buff_Tip, r.getBufType(), s);
          this._cardCtrl.addColliderGroupID(r.getGroupID());
          u = r.getGroupID();
          for (d = 0; d < n.length; d++) {
            var m;
            if (n[d].getGroupID() == u && (m = this._waveRoles.indexOf(n[d])) >= 0) {
              this._waveRoles.splice(m, 1);
              n[d].onDie();
            }
          }
        }
      }
      var y = [];
      var v = function (t) {
        var e = 0;
        for (var n = 0; n < y.length; n++) {
          y[n] == t && e++;
        }
        return e;
      };
      var _ = [];
      for (i = 0; i < this._bullets.length; i++) {
        var I = this._bullets[i];
        if (I.checkAutoDie()) {
          I.onDie();
          this._bullets.splice(i, 1);
          i--;
        } else if (I.isUseful) {
          var F = I.getWorldColldierRect();
          for (var P = 0; P < this._waveRoles.length; P++) {
            var C;
            if ((C = this._waveRoles[P]).isUseful) {
              var A = C.getScaleSize();
              var D = C.getRoleType() == $z1GAD_Configs.emGADRoleType.Enemy ? $z1GAD_Configs.GADConfig.EnemyFixedWidth : A.width;
              var M = C.getWorldColliderRectWithFixed(D, A.height);
              if (F.intersects(M)) {
                var T = v(C.getTagID());
                y.push(C.getTagID());
                var w = C.bulletHited(I, I.getAtkDamage(), T);
                if (C.isDie) {
                  this._waveRoles.splice(P, 1);
                  P--;
                }
                if (w > 0) {
                  this.sendEvent($z1GAD_Configs.emGADEventName.GAD_Show_Hit_Effect, I.node.convertToWorldSpaceAR(cc.Vec2.ZERO), C.getRoleType(), I.getHitEffectName());
                  I.removeFromScreen();
                  this._bullets.splice(i, 1);
                  i--;
                  if (C.getRoleType() == $z1GAD_Configs.emGADRoleType.Door) {
                    for (var k = 0; k < this._waveRoles.length; k++) {
                      if (this._waveRoles[k].getGroupID() == C.getGroupID() && this._waveRoles[k].getTagID() != C.getTagID()) {
                        var S = C;
                        var K = this._waveRoles[k];
                        var B = S.getScaleWidth(this._doorScaleWidth);
                        var E = K.getScaleWidth(-this._doorScaleWidth);
                        if (B > 0 && E > 0) {
                          var N = Math.min(B, E);
                          S.scaleWidth(N);
                          K.scaleWidth(-N);
                        }
                        break;
                      }
                    }
                    _.push(I.getGroupID());
                  }
                  break;
                }
              }
            }
          }
        }
      }
      for (i = 0; i < this._bullets.length; i++) {
        if (_.indexOf(this._bullets[i].getGroupID()) >= 0) {
          this.sendEvent($z1GAD_Configs.emGADEventName.GAD_Show_Hit_Effect, this._bullets[i].node.convertToWorldSpaceAR(cc.Vec2.ZERO), $z1GAD_Configs.emGADRoleType.Door);
          this._bullets[i].removeFromScreen();
          this._bullets.splice(i, 1);
          i--;
        }
      }
      this.buildWave();
    }
  };
  _ctor.prototype.gmAddBuff = function (t, e) {
    var n = e.split(",")[0];
    var i = Number(e.split(",")[1]);
    this._cardCtrl.addBuff(n, i);
  };
  _ctor.prototype.addBuff = function (t, e) {
    this._cardCtrl.addBuff(t, e);
    var n = this.ndCardGroup.convertToWorldSpaceAR(cc.Vec2.ZERO);
    this.sendEvent($z1GAD_Configs.emGADEventName.GAD_Show_Buff_Tip, t, n);
  };
  _ctor.prototype.needBuildWave = function () {
    return 0 == this._waveRoles.length || this._waveRoles[this._waveRoles.length - 1].node.y <= .5 * cc.winSize.height;
  };
  _ctor.prototype.openResultView = function (t, e) {
    if ($z1GAD_PlayerMgr.default.getInstance().getState() != $z1GAD_Configs.emGADGameState.Over) {
      $z1GAD_PlayerMgr.default.getInstance().setState($z1GAD_Configs.emGADGameState.Over);
      this.scheduleOnce(function () {
        $z1UIMgr.UIMgr.getInstance().openUI($z1GAD_Configs.GAD_UIID.UIResult, $z1Config.UIID.UINONE, e);
      }, t);
    }
  };
  _ctor.prototype.buildWave = function () {
    var t = this._waveLevelCfgs;
    if (this._curWave >= t.length) {
      console.log("this._curWave:" + this._curWave + " waveCfgs.length:" + t.length);
      return void (0 == this._waveRoles.length && this.openResultView(0, true));
    }
    for (; this.needBuildWave();) {
      var e = t[this._curWave];
      var n = $z1GAD_PlayerMgr.default.getInstance().getGroupID();
      this._isEditor && this.sendEvent($z1GAD_Configs.emGADEventName.GAD_Show_Wave_Num, this._curWave + 1);
      var i = e.roundDistance ? e.roundDistance : this._waveDistance;
      var a = this._cardCtrl.node.y + i;
      this._waveRoles.length > 0 && (a = this._waveRoles[this._waveRoles.length - 1].node.y + i);
      this._curWave > 0 && a < .5 * cc.winSize.height && (a = .5 * cc.winSize.height);
      var o = [];
      for (var r = 1; r < 8; r++) {
        e["position" + r] && o.push(e["position" + r]);
      }
      var s = this._roadWidth / o.length;
      var l = .5 * -this._roadWidth;
      for (r = 0; r < o.length; r++) {
        var c = o[r];
        if (c) {
          var h = l + .5 * s + s * r;
          var g = c.split("|");
          g = g[$z1Utils.Utils.randomRang(0, g.length)].split(",");
          if ($z1GAD_DataMgr.default.getInstance().isBuffType(g[0])) {
            var d = cc.instantiate(this.prefabDoor);
            d.parent = this.roleRoot;
            d.setPosition(h, a);
            var f = d.getComponent($z1GAD_Door.default);
            f.init(g[0], Number(g[1]));
            f.setGroupID(n);
            f.resetSize(s);
            this._waveRoles.push(f);
          } else {
            var m = cc.instantiate(this.prefabEnemy);
            m.parent = this.roleRoot;
            m.setPosition(h, a);
            var _ = m.getComponent($z1GAD_Enermy.default);
            _.init(g[0], g[1], e.randomBuff, o.length >= 4);
            _.setGroupID(n);
            this._waveRoles.push(_);
          }
        }
      }
      this._curWave++;
      if (this._curWave >= t.length) {
        return;
      }
    }
  };
  _ctor.prototype.onShootBullet = function (t, e, n) {
    var i = cc.instantiate(this.prefabBullet);
    i.parent = this.ndBulletRoot;
    var a = this.ndBulletRoot.convertToNodeSpaceAR(e);
    a.y += 50;
    i.setPosition(a);
    var o = i.getComponent($z1GAD_Bullet.default);
    o.setGroupID(t);
    var r = Math.round(this._cardCtrl.getAtkDamage());
    o.init(n.getCardCfg(), r);
    this._bullets.push(o);
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndCardGroup", undefined);
  cc__decorate([ccp_property(cc.Prefab)], _ctor.prototype, "prefabDoor", undefined);
  cc__decorate([ccp_property(cc.Prefab)], _ctor.prototype, "prefabEnemy", undefined);
  cc__decorate([ccp_property(cc.Prefab)], _ctor.prototype, "prefabBullet", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndBulletRoot", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "roleRoot", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndFence", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "gmNode", undefined);
  return n = cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_GAD_UIGame;