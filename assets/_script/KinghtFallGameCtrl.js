var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1PoolMgr = require("PoolMgr");
var $z1SdkMgr = require("SdkMgr");
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
var $z1KinghtFallPathInfo = require("KinghtFallPathInfo");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallBulletBuild = require("KinghtFallBulletBuild");
var $z1KinghtFallBulletEnemy = require("KinghtFallBulletEnemy");
var $z1KinghtFallBulletPlay = require("KinghtFallBulletPlay");
var $z1KinghtFallBulletSoldier = require("KinghtFallBulletSoldier");
var $z1KinghtFallEnemyBase = require("KinghtFallEnemyBase");
var $z1KinghtFallGameCtrlData = require("KinghtFallGameCtrlData");
var $z1KinghtFallGamePlayCtrl = require("KinghtFallGamePlayCtrl");
var $z1KinghtFallInterface = require("KinghtFallInterface");
var $z1KinghtFallSoldierBase = require("KinghtFallSoldierBase");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallGameCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.camera = null;
    e.ctrPlay = null;
    e.buildBullet = null;
    e.ndAggFlag = null;
    e.gameData = null;
    e.mapSize = cc.size(1500, 2668);
    e.moveSize = cc.size(1500, 2668);
    e.ndBg = null;
    e.ndDown = null;
    e.ndPath = null;
    e.ndTrack = null;
    e.ndMain = null;
    e.ndUI = null;
    e.gameStatus = $z1KinghtFallModle.KinghtFallGameStage.Prepare;
    e.gameTag = [];
    e.moveDir = cc.v2(0, 0);
    e.vec2_1 = new cc.Vec2();
    e.vec2_2 = new cc.Vec2();
    e.isAgg = false;
    e.pathIndex = 0;
    e.ndPlayArr1 = [];
    e.ndPlayArr2 = [];
    e.ndEnemyArr = [];
    e.ndBuildArr1 = [];
    e.ndBuildArr2 = [];
    e.ndSoldArr = [];
    e.dropList = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.initData = function (t) {
    this.gameData = new $z1KinghtFallGameCtrlData.default(this, t);
    this.ctrPlay.initData();
    this.buildBullet.node.active = false;
    this.ndAggFlag.active = false;
  };
  _ctor.prototype.initMap = function (t) {
    this.moveSize = t.getContentSize();
    this.ndBg = t.getChildByName("ndBg");
    this.mapSize = this.ndBg.getContentSize();
    this.ndDown = t.getChildByName("ndDown");
    this.ndPath = t.getChildByName("ndPath");
    this.ndTrack = t.getChildByName("ndTrack");
    this.ndMain = t.getChildByName("ndMain");
    this.ndUI = t.getChildByName("ndUI");
    this.ctrPlay.node.setParent(this.ndMain);
    this.ctrPlay.node.setPosition(this.ndPath.getChildByName("ndStar").position);
    this.ctrPlay.ndRange.setParent(this.ndUI);
    this.ndAggFlag.setParent(this.ndMain);
    this.gameData.initMap();
  };
  _ctor.prototype.onRestart = function (t) {
    t && (this.gameData.buffList = []);
    this.gameData.onRestart(t);
    this.cleanMap();
    this.moveDir = cc.v2(0, 0);
    this.ctrPlay.onRestart(t);
    this.ctrPlay.node.setPosition(this.ndPath.getChildByName("ndStar").position);
    this.gameStatus = $z1KinghtFallModle.KinghtFallGameStage.Prepare;
    this.isAgg = false;
    this.ctrPlay.ndAgg.active = this.isAgg;
    this.ndAggFlag.active = false;
  };
  _ctor.prototype.moveFun = function (t) {
    if (t) {
      cc.Vec2.normalize(this.moveDir, t);
    } else {
      this.moveDir = cc.v2(0, 0);
    }
  };
  _ctor.prototype.onLateUpdate = function () {
    this.ctrPlay.node.getPosition(this.vec2_1);
    this.ctrPlay.node.getPosition(this.vec2_2);
    this.ctrPlay.node.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.vec2_1.y);
    this.vec2_1.x = cc.misc.clampf(this.vec2_1.x, -this.moveSize.width / 2, this.moveSize.width / 2);
    this.vec2_1.y = cc.misc.clampf(this.vec2_1.y, -this.moveSize.height / 2, this.moveSize.height / 2);
    this.ctrPlay.node.setPosition(this.vec2_1);
    this.ctrPlay.ndRange.setPosition(this.vec2_1);
    this.vec2_2.x = cc.misc.clampf(this.vec2_2.x, -this.mapSize.width / 2 + cc.winSize.width / 2, this.mapSize.width / 2 - cc.winSize.width / 2);
    this.vec2_2.y = cc.misc.clampf(this.vec2_2.y, -this.mapSize.height / 2 + cc.winSize.height / 2, this.mapSize.height / 2 - cc.winSize.height / 2);
    this.camera.node.setPosition(this.vec2_2);
  };
  _ctor.prototype.onUpdate = function (t) {
    switch (this.gameStatus) {
      case $z1KinghtFallModle.KinghtFallGameStage.Prepare:
        var e = this.gameData.getBulidList();
        for (var n = 0; n < e.length; n++) {
          if (-1 != (l = e[n]).getSell()) {
            var i = l.getLockPoint();
            if (i) {
              var a = cc.Intersection.pointInPolygon(this.ctrPlay.getWpos(), i);
              if (a) {
                if (this.upBulid && l.uuid == this.upBulid.uuid) {
                  l.doUpgrade(t, false);
                } else {
                  l.doUpgrade(t, a);
                }
              } else {
                this.upBulid && l.uuid == this.upBulid.uuid && (this.upBulid = null);
                l.doUpgrade(t, a);
              }
            } else {
              l.doUpgrade(t, false);
            }
          } else {
            l.doUpgrade(t, false);
          }
        }
        this.onCommerce(t);
        break;
      case $z1KinghtFallModle.KinghtFallGameStage.Fight:
        this.gameData.onUpdata(t);
        this.ctrPlay.onUpdata(t);
        this.ndPlayArr2.forEach(function (e) {
          null == e || e.onUpdate(t);
        });
        this.ndEnemyArr.forEach(function (e) {
          null == e || e.onUpdate(t);
        });
        this.ndSoldArr.forEach(function (e) {
          null == e || e.onUpdate(t);
        });
        this.ndBuildArr2.forEach(function (e) {
          null == e || e.onUpdate(t);
        });
    }
    this.ctrPlay.doMove(this.moveDir, t);
    var o = this.gameData.getBulidList();
    for (n = 0; n < o.length; n++) {
      (l = o[n]).onUpdate(t);
    }
    var r = this.gameData.getSoldierList();
    for (var s = 0; s < r.length; s++) {
      (l = r[s]).onUpdate(t);
    }
    if (this.isAgg && (this.ctrPlay.node.getPosition(this.vec2_1), cc.Vec2.subtract(this.vec2_2, this.vec2_1, this.pathList[this.pathList.length - 1].pos), this.vec2_2.mag() > 20 && this.addPathNode(), this.pathList.length >= 1e3)) {
      e = this.gameData.getSoldierList();
      for (s = 0; s < e.length; s++) {
        var l;
        (l = e[s]).setPath(this.pathList, true);
      }
      this.pathList.slice(0, 500);
    }
  };
  _ctor.prototype.onCommerce = function (t) {
    var e = this;
    this.ctrPlay.node.getPosition(this.vec2_1);
    if (this.gameData.appearBusinessPoints && this.gameData.appearBusinessPoints.getInClick(this.vec2_1, t)) {
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, true);
      var n = function (t) {
        e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
        if (t) {
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.map_coin);
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_map_coin_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
          e.gameData.appearBusinessPoints.node.active = false;
          e.gameData.coin += e.gameData.appearBusinessPoints.coinNum;
          $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, $z1Utils.Utils.StringFormat(e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom01), e.gameData.appearBusinessPoints.coinNum));
          $z1KinghtFallUIGame.default.instance.initView();
          var n = $z1KinghtFallUIGame.default.instance.ndCoin;
          var i = cc.v2(n.position.x + n.children[0].x, n.position.y + n.children[0].y);
          var a = e.gameData.appearBusinessPoints.node.convertToWorldSpaceAR(cc.v2(0, 0));
          var o = e.camera.getWorldToScreenPoint(a);
          var r = $z1KinghtFallUIGame.default.instance.ctrUI.node.convertToNodeSpaceAR(o);
          var s = function () {
            var t = cc.instantiate(n.children[0]);
            t.active = true;
            t.scale = .5;
            t.setParent($z1KinghtFallUIGame.default.instance.ctrUI.node);
            var e = cc.v2();
            cc.Vec2.random(e, 40);
            cc.tween(t).set({
              position: cc.v3(r.x, r.y, 0)
            }).by(.2, {
              position: cc.v3(e.x, e.y, 0)
            }).to(1, {
              position: cc.v3(i.x, i.y, 0),
              scale: 1
            }).call(function () {
              t.destroy();
            }).start();
          };
          for (var l = 0; l < 10; l++) {
            s();
          }
          e.gameData.appearBusinessPoints = null;
        } else {
          e.gameData.appearBusinessPoints.init(1);
        }
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 7, function (t) {
          n(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          n(true);
        }, function () {
          n(false);
        });
      }
    }
    if (!this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] && this.gameData.weaponBusinessPoints.getInClick(this.vec2_1, t)) {
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, true);
      var i = function (t) {
        e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
        if (t) {
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.map_weapon);
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_map_weapon_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] = 1;
          e.gameData.weaponBusinessPoints.node.active = false;
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Attack] = .5;
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.AttackSpeed] = .5;
          $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom02));
          e.ctrPlay.ctrPlayAni.setBus(1);
          e.saveGame();
        } else {
          e.gameData.weaponBusinessPoints.init(1);
        }
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 6, function (t) {
          i(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          i(true);
        }, function () {
          i(false);
        });
      }
    }
    if (1 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] && $z1KinghtFallModle.KinghtFallSwitch.isMapShopSecondOpen() && this.gameData.weaponBusinessPoints.getInClick(this.vec2_1, t)) {
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, true);
      var a = function (t) {
        e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
        if (t) {
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.arrow2);
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_arrow2_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] = 2;
          e.gameData.weaponBusinessPoints.node.active = false;
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Attack] = 1;
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.AttackSpeed] = 1;
          $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom02));
          e.ctrPlay.ctrPlayAni.setBus(3);
          e.saveGame();
        } else {
          e.gameData.weaponBusinessPoints.init(2);
        }
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 9, function (t) {
          a(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          a(true);
        }, function () {
          a(false);
        });
      }
    }
    if (!this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] && this.gameData.horseBusinessPoints.getInClick(this.vec2_1, t)) {
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, true);
      var o = function (t) {
        e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
        if (t) {
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.map_horse);
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_map_horse_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] = 1;
          e.gameData.horseBusinessPoints.node.active = false;
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Speed] = .5;
          $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom03));
          e.ctrPlay.ctrPlayAni.setBus(2);
          e.saveGame();
        } else {
          e.gameData.horseBusinessPoints.init(1);
        }
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 5, function (t) {
          o(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          o(true);
        }, function () {
          o(false);
        });
      }
    }
    if (1 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] && $z1KinghtFallModle.KinghtFallSwitch.isMapShopSecondOpen() && this.gameData.horseBusinessPoints.getInClick(this.vec2_1, t)) {
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, true);
      var r = function (t) {
        e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
        if (t) {
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.horse2);
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_horse2_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] = 2;
          e.gameData.horseBusinessPoints.node.active = false;
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Speed] = 1;
          $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom03));
          e.ctrPlay.ctrPlayAni.setBus(4);
          e.saveGame();
        } else {
          e.gameData.horseBusinessPoints.init(2);
        }
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 8, function (t) {
          r(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          r(true);
        }, function () {
          r(false);
        });
      }
    }
  };
  _ctor.prototype.changeAge = function () {
    if (this.isAgg) {
      var t = this.gameData.getSoldierList();
      for (var e = 0; e < t.length; e++) {
        t[e].setPath(this.pathList, false);
      }
    }
    this.isAgg = !this.isAgg;
    if (this.isAgg) {
      this.ndAggFlag.Flag = 0;
      this.pathIndex = 0;
      this.pathList = [];
      this.addPathNode();
    }
    switch ($z1KinghtFallConfig.KinghtFallParameter.FollowMode) {
      case 1:
        if (this.ndAggFlag.Flag) {
          this.ndAggFlag.active = true;
          this.ndAggFlag.setPosition(this.pathList[0].pos);
          this.ndAggFlag.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.pathList[0].pos.y);
          var n = this.ndAggFlag.getComponent(sp.Skeleton);
          n.setAnimation(0, "click", false);
          n.addAnimation(0, "idle", true);
        }
        break;
      case 2:
        this.ctrPlay.ndAgg.active = this.isAgg;
        this.ndAggFlag.active = false;
    }
  };
  _ctor.prototype.addPathNode = function () {
    this.ctrPlay.node.getPosition(this.vec2_1);
    this.pathList.push({
      index: this.pathIndex++,
      pos: this.vec2_1.clone()
    });
    var t = this.gameData.getSoldierList();
    for (var e = 0; e < t.length; e++) {
      var n = t[e];
      n.node.getPosition(this.vec2_2);
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      switch ($z1KinghtFallConfig.KinghtFallParameter.FollowMode) {
        case 1:
          n.startAgg(this.pathList[this.pathList.length - 1]) && this.ndAggFlag.Flag++;
          break;
        case 2:
          this.vec2_2.mag() < $z1KinghtFallConfig.KinghtFallParameter.FollowRange && n.startAgg(this.pathList[this.pathList.length - 1]);
      }
    }
  };
  _ctor.prototype.onPauseGame = function () {
    this.ctrPlay.setPause(true);
    var t = this.gameData.getEnemyList();
    for (var e = 0; e < t.length; e++) {
      t[e].setPause(true);
    }
    var n = this.gameData.getSoldierList();
    for (e = 0; e < n.length; e++) {
      n[e].setPause(true);
    }
  };
  _ctor.prototype.onResumeGame = function () {
    this.ctrPlay.setPause(false);
    var t = this.gameData.getEnemyList();
    for (var e = 0; e < t.length; e++) {
      t[e].setPause(false);
    }
    var n = this.gameData.getSoldierList();
    for (e = 0; e < n.length; e++) {
      n[e].setPause(false);
    }
  };
  _ctor.prototype.endRoundGame = function () {
    this.moveDir = cc.v2(0, 0);
    var t = this.gameData.endRoundGame();
    var e = $z1KinghtFallUIGame.default.instance.ndCoin;
    var n = cc.v2(e.position.x + e.children[0].x, e.position.y + e.children[0].y);
    var i = t[0].node.convertToWorldSpaceAR(t[0].ndHp.getPosition());
    var a = this.camera.getWorldToScreenPoint(i);
    var o = $z1KinghtFallUIGame.default.instance.ctrUI.node.convertToNodeSpaceAR(a);
    var r = function () {
      var t = cc.instantiate(e.children[0]);
      t.active = true;
      t.scale = .5;
      t.setParent($z1KinghtFallUIGame.default.instance.ctrUI.node);
      var i = cc.v2();
      cc.Vec2.random(i, 40);
      cc.tween(t).set({
        position: cc.v3(o.x, o.y, 0)
      }).by(.2, {
        position: cc.v3(i.x, i.y, 0)
      }).to(1, {
        position: cc.v3(n.x, n.y, 0),
        scale: 1
      }).call(function () {
        t.destroy();
      }).start();
    };
    for (var s = 0; s < 10; s++) {
      r();
    }
    var l = function (i) {
      var a = t[i];
      var o = a.node.convertToWorldSpaceAR(a.ndHp.getPosition());
      var r = c.camera.getWorldToScreenPoint(o);
      var s = $z1KinghtFallUIGame.default.instance.ctrUI.node.convertToNodeSpaceAR(r);
      var l = cc.instantiate(e.children[0]);
      l.active = true;
      l.scale = .5;
      l.setParent($z1KinghtFallUIGame.default.instance.ctrUI.node);
      cc.tween(l).set({
        position: cc.v3(s.x, s.y, 0)
      }).to(1, {
        position: cc.v3(n.x, n.y, 0),
        scale: 1
      }).call(function () {
        l.destroy();
      }).start();
    };
    var c = this;
    for (s = 1; s < t.length; s++) {
      l(s);
    }
    this.cleanMap();
  };
  _ctor.prototype.cleanMap = function () {
    for (var t = 0; t < this.ndPlayArr2.length; t++) {
      this.ndPlayArr2[t].node.active = false;
      this.ndPlayArr1.push(this.ndPlayArr2[t].node);
    }
    this.ndPlayArr2 = [];
    this.ndEnemyArr.forEach(function (t) {
      t.freeNode(false);
    });
    this.ndEnemyArr = [];
    this.ndSoldArr.forEach(function (t) {
      t.freeNode(false);
    });
    this.ndSoldArr = [];
    for (t = 0; t < this.ndBuildArr2.length; t++) {
      this.ndBuildArr2[t].node.active = false;
      this.ndBuildArr1.push(this.ndBuildArr2[t].node);
    }
    this.ndBuildArr2 = [];
  };
  _ctor.prototype.addEnemy = function (t, e) {
    var n = this;
    if (-1 != t) {
      var i = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(t);
      var a = $z1KinghtFallConfig.KinghtFallPoolName.Enemy + "_" + i.ID;
      var o = function (i) {
        i.setParent(n.ndMain);
        i.active = true;
        var a = n.ndPath.getChildByName("ndEnemy" + e);
        i.setPosition(a.position);
        var o = i.getComponent($z1KinghtFallEnemyBase.default);
        o.initData(t, e);
        n.gameData.addEnemy(o);
      };
      var r = $z1PoolMgr.PoolMgr.getInstance().getNode(a);
      if (r) {
        o(r);
      } else {
        this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Enemy, i.prefab, function (t) {
          r = cc.instantiate(t);
          $z1PoolMgr.PoolMgr.getInstance().creatrePool(a, cc.instantiate(t), 10);
          o(r);
        });
      }
    }
  };
  _ctor.prototype.addSoldier = function (t, e) {
    var n = this;
    var i = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(t);
    var a = $z1KinghtFallConfig.KinghtFallPoolName.Soldier + "_" + i.ID;
    var o = function (i) {
      i.setParent(n.ndMain);
      i.active = true;
      var a = i.getComponent($z1KinghtFallSoldierBase.default);
      a.initData(t);
      n.gameData.addSoldier(a);
      e(a);
    };
    var r = $z1PoolMgr.PoolMgr.getInstance().getNode(a);
    if (r) {
      o(r);
    } else {
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Enemy, "Play" + i.prefab, function (t) {
        r = cc.instantiate(t);
        $z1PoolMgr.PoolMgr.getInstance().creatrePool(a, cc.instantiate(t), 1);
        o(r);
      });
    }
  };
  _ctor.prototype.setPath = function (t) {
    var e;
    var n = {
      bornIndex: t,
      pathList: [],
      nodeIndex: 0
    };
    var i = [];
    var a = this.gameData.getBulidList();
    for (var o = 0; o < a.length; o++) {
      (l = a[o]).getIsLock() && i.push(l.ID);
    }
    var r = this.ndPath.getComponentsInChildren($z1KinghtFallPathInfo.default);
    var s = [];
    for (o = 0; o < r.length; o++) {
      var l;
      if ((l = r[o]).ndLockList.includes(t)) {
        if (0 == l.ndBuildList.length) {
          s.push(l.node);
        } else {
          for (var c = 0; c < i.length; c++) {
            if (l.ndBuildList.includes(i[c])) {
              s.push(l.node);
              break;
            }
          }
        }
      }
    }
    (e = n.pathList).push.apply(e, s[$z1Utils.Utils.randomRang(0, s.length)].children);
    return n;
  };
  _ctor.prototype.onPlayAttack = function (t) {
    var e = this;
    var n = this.ndPlayArr1.shift();
    n || (n = cc.instantiate(this.ctrPlay.ctrArr.node)).setParent(this.ndUI);
    n.setSiblingIndex(0);
    n.active = true;
    var i = this.ctrPlay.getAttWpos();
    var a = this.ndUI.convertToNodeSpaceAR(i);
    n.setPosition(a);
    var o = n.getComponent($z1KinghtFallBulletPlay.default);
    o.setSkin(this.ctrPlay.ctrPlayAni.arrName);
    this.ndPlayArr2.push(o);
    var r = this.ctrPlay.getAttack(t);
    var s = this.ctrPlay.crit >= Math.random();
    s && (r *= this.ctrPlay.critDam);
    o.setTag(a, t.node, function () {
      if (cc.isValid(t) && cc.isValid(t.node)) {
        if (!$z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getGuideTips(2)) {
          $z1KinghtFallUIGame.default.instance.ctrUI.setGuide(null);
          $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setGuideTips(2);
        }
        $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(t.node.getPosition(), r, s);
        $z1KinghtFallUIGame.default.instance.ctrEffect.onMonsterAttack(t.node.getPosition(), "jian_" + e.ctrPlay.ctrPlayAni.arrName);
        n.active = false;
        t.onAttacked(r);
        var i = e.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff08);
        i && t.isDead() && e.ctrPlay.addHpPro(i.Pamer[0]);
        var a = e.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff15);
        a && t.addBuff($z1KinghtFallInterface.KinghtFallEnemyBuffType.MoveSpeed, {
          subNum: a.Pamer[0],
          time: 1
        });
      }
    });
  };
  _ctor.prototype.freeBullet = function (t) {
    for (var e = 0; e < this.ndPlayArr2.length; e++) {
      if (this.ndPlayArr2[e].uuid == t.uuid) {
        this.ndPlayArr2.splice(e, 1);
        break;
      }
    }
    t.node.active = false;
    this.ndPlayArr1.push(t.node);
  };
  _ctor.prototype.onShotEnemy = function (t) {
    var e = t.getBullet();
    e.setParent(this.ndUI);
    e.setSiblingIndex(0);
    e.active = true;
    var n = t.getAttWpos();
    var i = this.ndUI.convertToNodeSpaceAR(n);
    e.setPosition(i);
    var a = e.getComponent($z1KinghtFallBulletEnemy.default);
    this.ndEnemyArr.push(a);
    return {
      ctr: a,
      pos: i
    };
  };
  _ctor.prototype.freeEnemyBullet = function (t) {
    for (var e = 0; e < this.ndEnemyArr.length; e++) {
      if (this.ndEnemyArr[e].uuid == t.uuid) {
        this.ndEnemyArr.splice(e, 1);
        break;
      }
    }
  };
  _ctor.prototype.onShotBuild = function (t, e) {
    var n = this.ndBuildArr1.shift();
    n || (n = cc.instantiate(this.buildBullet.node)).setParent(this.ndUI);
    n.setSiblingIndex(0);
    n.active = true;
    var i = t.getAttPos();
    n.setPosition(i);
    var a = n.getComponent($z1KinghtFallBulletBuild.default);
    this.ndBuildArr2.push(a);
    var o = t.getAttack();
    a.setTag(i, e.node, function () {
      if (cc.isValid(e) && cc.isValid(e.node)) {
        $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(e.node.getPosition(), o);
        $z1KinghtFallUIGame.default.instance.ctrEffect.onMonsterAttack(e.node.getPosition(), "jian_lv1");
        n.active = false;
        e.onAttacked(o);
      }
    });
  };
  _ctor.prototype.freeBuildBullet = function (t) {
    for (var e = 0; e < this.ndBuildArr2.length; e++) {
      if (this.ndBuildArr2[e].uuid == t.uuid) {
        this.ndBuildArr2.splice(e, 1);
        break;
      }
    }
    t.node.active = false;
    this.ndBuildArr1.push(t.node);
  };
  _ctor.prototype.onShotSoldier = function (t) {
    var e = t.getBullet();
    e.setParent(this.ndUI);
    e.setSiblingIndex(0);
    e.active = true;
    var n = t.getAttWpos();
    var i = this.ndUI.convertToNodeSpaceAR(n);
    e.setPosition(i);
    var a = e.getComponent($z1KinghtFallBulletSoldier.default);
    this.ndSoldArr.push(a);
    return {
      ctr: a,
      pos: i
    };
  };
  _ctor.prototype.freeSoldierBullet = function (t) {
    for (var e = 0; e < this.ndSoldArr.length; e++) {
      if (this.ndSoldArr[e].uuid == t.uuid) {
        this.ndSoldArr.splice(e, 1);
        break;
      }
    }
  };
  _ctor.prototype.onDropItem = function (t) {
    this.dropList.push({
      ndItem: null,
      type: t
    });
  };
  _ctor.prototype.onChangeSpeed = function () {
    this.ctrPlay.ctrPlayAni.onChangeSpeed();
    this.gameData.onChangeSpeed();
  };
  _ctor.prototype.loadGame = function () {
    var t = this;
    if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().hasSave(this.gameData.levelCfg.Level)) {
      this.gameData.setRound();
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().getBuffList().forEach(function (e) {
        t.gameData.addGameBuff(e);
      });
      var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().getBuildInfoList();
      var n = this.gameData.getBulidList();
      for (var i = 0; i < n.length; i++) {
        var a = n[i];
        for (var o = 0; o < e.length; o++) {
          var r = e[o];
          a.ID == r.point && a.setSave(r);
        }
      }
      this.gameData.businessAdd = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().getBusinessList();
      if (1 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon]) {
        this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Attack] = .5;
        this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.AttackSpeed] = .5;
        this.ctrPlay.ctrPlayAni.setBus(1);
      }
      if (2 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] && $z1KinghtFallModle.KinghtFallSwitch.isMapShopSecondOpen()) {
        this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Attack] = 1;
        this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.AttackSpeed] = 1;
        this.ctrPlay.ctrPlayAni.setBus(3);
      }
      if (1 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse]) {
        this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Speed] = .5;
        this.ctrPlay.ctrPlayAni.setBus(2);
      }
      if (2 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] && $z1KinghtFallModle.KinghtFallSwitch.isMapShopSecondOpen()) {
        this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Speed] = 1;
        this.ctrPlay.ctrPlayAni.setBus(4);
      }
      var s = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().getTaskInfo();
      if (s) {
        this.gameData.taskInfo.index = s.index;
        this.gameData.taskInfo.list = s.list;
        this.gameData.taskInfo.stage = s.stage;
      }
      return true;
    }
    return false;
  };
  _ctor.prototype.saveGame = function () {
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().setLevelInfo(this.gameData.levelCfg.Level, this.gameData.round, this.gameData.coin);
    var t = [];
    this.gameData.buffList.forEach(function (e) {
      t.push(e.id);
    });
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().setBuffList(t);
    var e = [];
    this.gameData.getBulidList().forEach(function (t) {
      e.push(t.getSave());
    });
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().setBuildInfoList(e);
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().setBusinessList(this.gameData.businessAdd);
    var n = {
      index: this.gameData.taskInfo.index,
      list: this.gameData.taskInfo.list,
      stage: this.gameData.taskInfo.stage
    };
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().setTaskInfo(n);
  };
  cc__decorate([ccp_property({
    type: cc.Camera,
    tooltip: "摄像机"
  })], _ctor.prototype, "camera", undefined);
  cc__decorate([ccp_property({
    type: $z1KinghtFallGamePlayCtrl.default,
    tooltip: "玩家"
  })], _ctor.prototype, "ctrPlay", undefined);
  cc__decorate([ccp_property({
    type: $z1KinghtFallBulletBuild.default,
    tooltip: "建筑箭头"
  })], _ctor.prototype, "buildBullet", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "召唤棋子"
  })], _ctor.prototype, "ndAggFlag", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_KinghtFallGameCtrl;