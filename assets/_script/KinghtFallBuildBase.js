var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallBuildAniName = undefined;
var r;
var $z1AudioMgr = require("AudioMgr");
var $z1EventMgr = require("EventMgr");
var $z1UIMgr = require("UIMgr");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallItemHp = require("KinghtFallItemHp");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallInterface = require("KinghtFallInterface");
var $z1KinghtFallBuildInfo = require("KinghtFallBuildInfo");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallBuildBase = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ID = 0;
    e.ndMove = [];
    e.ndHp = null;
    e.ndLockList = [null];
    e.ndAniMain = null;
    e.ndAniDown = null;
    e.ndAniOther = [];
    e.isBig = true;
    e.canLock = false;
    e.buildInfo = null;
    e.isDestroyed = false;
    e.ctrHp = null;
    e.ndCoin = null;
    e.colPoint = {};
    e.standTimeMax = 1.5;
    e.showAni = false;
    e.vec2_1 = new cc.Vec2();
    e.vec2_2 = new cc.Vec2();
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    var t = this;
    this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
      var n = [];
      e.points.forEach(function (t) {
        n.push(t.clone());
      });
      t.colPoint[e.uuid] = n;
    });
    this.ndAniOther.forEach(function (e) {
      e.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
        var n = [];
        e.points.forEach(function (t) {
          n.push(t.clone());
        });
        t.colPoint[e.uuid] = n;
      });
    });
  };
  _ctor.prototype.start = function () {
    var t;
    var e = this;
    null === (t = this.ndMove) || undefined === t || t.forEach(function (t, n) {
      t.active = false;
      t.name = e.node.name + "_" + n;
    });
  };
  _ctor.prototype.initData = function (t) {
    var e = this;
    1 == this.ID && (t = $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter);
    this.buildCfg = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBuildCfgById(t);
    if (this.buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None) {
      return this.hide(), false;
    } else {
      return this.index = 0, this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconMap, $z1KinghtFallConfig.KinghtFallPrefabName.ItemHp, function (t) {
        var n = cc.instantiate(t);
        n.parent = $z1KinghtFallUIGame.default.instance.ctrGame.ndUI;
        var i = e.node.convertToWorldSpaceAR(e.ndHp.position);
        var a = $z1KinghtFallUIGame.default.instance.ctrGame.ndUI.convertToNodeSpaceAR(i);
        n.setPosition(a);
        n.setScale(e.ndHp.scale);
        n.active = true;
        e.ctrHp = n.getComponent($z1KinghtFallItemHp.default);
        e.ctrHp.setType($z1KinghtFallModle.KinghtFallGameArmy.Friend);
        e.upHpView();
      }), this.ndCoin = cc.instantiate($z1KinghtFallUIGame.default.instance.ndBuildCoin), true;
    }
  };
  _ctor.prototype.upData = function () {
    if (this.buildCfg.enumValue != $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None) {
      this.canLock = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.canLock(this.ID);
      if (this.canLock) {
        $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAddTime[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.CovenantOfPatriarchs] == this.ID && 0 == this.getLevel() && (this.index = 1), this.setLevel(this.index);
      } else {
        this.hide();
      }
      this.upHpView();
    }
  };
  _ctor.prototype.hide = function () {
    this.ndLockList.forEach(function (t) {
      t.active = false;
      t.getChildByName("sprPro") && (t.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = 0);
    });
    this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
      t.enabled = false;
    });
    this.ndAniMain.node.active = false;
    this.ndAniDown && (this.ndAniDown.node.active = false);
    this.ndAniOther.forEach(function (t) {
      t.node.active = false;
      t.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
        t.enabled = false;
      });
    });
  };
  _ctor.prototype.getLevel = function () {
    if (this.buildInfo && this.buildInfo.cfg) {
      return this.buildInfo.cfg.level;
    } else {
      return 0;
    }
  };
  _ctor.prototype.setLevel = function (t) {
    var e;
    var n = this;
    this.index = t;
    this.buildInfo = new $z1KinghtFallBuildInfo.KinghtFallBuildInfo(this.buildCfg.enumValue, this.buildCfg.levelList[this.index - 1]);
    if (0 == this.index) {
      this.hide();
    } else {
      this.ndAniMain.node.active = true;
      this.ndAniMain.setSkin(this.buildInfo.cfg.Skin);
      this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
        t.enabled = t.tag == n.index;
        t.enabled && (e = t);
      });
      if (e) {
        cc.Tween.stopAllByTarget(e), cc.tween(e).to(.2, {}, {
          onUpdate: function (t, i) {
            var a = [];
            for (var o = 0; o < n.colPoint[e.uuid].length; o++) {
              a.push(cc.v2(n.colPoint[e.uuid][o].x * i, n.colPoint[e.uuid][o].y * i));
            }
            t.points = a;
            t.apply();
          }
        }).start();
      }
      if (this.ndAniDown) {
        this.ndAniDown.node.active = true, this.ndAniDown.setSkin(this.buildInfo.cfg.Skin);
      }
      this.ndAniOther.forEach(function (t) {
        var e;
        t.node.active = true;
        t.setSkin(n.buildInfo.cfg.Skin);
        t.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
          t.enabled = t.tag == n.index;
          t.enabled && (e = t);
          if (e) {
            cc.Tween.stopAllByTarget(e);
            cc.tween(e).to(.2, {}, {
              onUpdate: function (t, i) {
                var a = [];
                for (var o = 0; o < n.colPoint[e.uuid].length; o++) {
                  a.push(cc.v2(n.colPoint[e.uuid][o].x * i, n.colPoint[e.uuid][o].y * i));
                }
                t.points = a;
                t.apply();
              }
            }).start();
          }
        });
      });
    }
    this.ndCoin.active = false;
    this.ndCoin.getChildByName("labNum").getComponent(cc.Label).string = "" + this.getSell();
    this.ndLockList.forEach(function (t, e) {
      var i;
      t.getChildByName("sprPro") && (t.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = 0);
      if (e == ((null === (i = n.buildInfo) || undefined === i ? undefined : i.cfg) ? n.buildInfo.cfg.level : 0) && n.buildInfo.canUpgrade) {
        t.active = true;
        if (!(t.show || n.buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter)) {
          t.show = true, cc.tween(t).set({
            scale: .01
          }).to(.2, {
            scale: 1.2
          }).to(.05, {
            scale: 1
          }).start();
        }
        n.ndCoin.scaleX = t.parent.scaleX;
        n.ndCoin.setParent(t);
        n.ndCoin.setPosition(cc.Vec2.ZERO);
        n.ndCoin.active = true;
      } else {
        t.show = false;
        t.active = false;
      }
    });
  };
  _ctor.prototype.doUpgreadAni = function () {
    var t = this;
    if (1 == this.index) {
      this.ndAniMain.setAnimation(0, r.create, false);
      this.ndAniMain.addAnimation(0, r.idle, true);
      this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
        e.enabled = e.tag == t.index;
      });
      if (this.ndAniDown) {
        this.ndAniDown.setAnimation(0, r.create, false), this.ndAniDown.addAnimation(0, r.idle, true);
      }
      this.ndAniOther.forEach(function (e) {
        e.node.active = true;
        e.setAnimation(0, r.create, false);
        e.addAnimation(0, r.idle, true);
        e.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
          e.enabled = e.tag == t.index;
        });
      });
    } else {
      this.ndAniMain.setAnimation(0, r.upgrade, false);
      this.ndAniMain.addAnimation(0, r.idle, true);
      if (this.ndAniDown) {
        this.ndAniDown.setAnimation(0, r.upgrade, false), this.ndAniDown.addAnimation(0, r.idle, true);
      }
      this.ndAniOther.forEach(function (e) {
        e.node.active = true;
        e.setAnimation(0, r.upgrade, false);
        e.addAnimation(0, r.idle, true);
        e.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
          e.enabled = e.tag == t.index;
        });
      });
    }
  };
  _ctor.prototype.getWposPhyCol = function () {
    return this.getWposPhyCol2().map(function (part) { return part.points; });
  };
  _ctor.prototype.getWposPhyCol2 = function () {
    if (this.isDestroyed) {
      this._combatFootprints = null;
      return [];
    }
    // Every enemy observes the same geometry during one game update. Avoid
    // transforming every building vertex again for every target/attack scan.
    // Standalone callers have no managed frame and always get fresh geometry.
    var ui = $z1KinghtFallUIGame.default.instance;
    var game = ui && ui.ctrGame;
    var navigation = game && game._navigation;
    var frame = navigation && navigation._frameManaged ? navigation._frameId : null;
    var cached = this._combatFootprints;
    if (frame !== null && cached && cached.navigation === navigation && cached.frame === frame && cached.level === this.index) return cached.parts;
    var t = [];
    var e = this.node.getComponents(cc.PhysicsPolygonCollider);
    for (var n = 0; n < e.length; n++) {
      if ((s = e[n]).tag == this.index) {
        var i = [];
        for (var a = 0; a < s.points.length; a++) {
          var o = s.points[a];
          i.push(this.node.convertToWorldSpaceAR(o));
        }
        t.push({
          tagNode: this.node,
          points: i
        });
      }
    }
    for (var r = 0; r < this.ndAniOther.length; r++) {
      var s;
      e = (s = this.ndAniOther[r].node).getComponents(cc.PhysicsPolygonCollider);
      for (n = 0; n < e.length; n++) {
        var l = e[n];
        if (l.tag == this.index) {
          i = [];
          for (a = 0; a < l.points.length; a++) {
            o = l.points[a];
            i.push(s.convertToWorldSpaceAR(o));
          }
          t.push({
            tagNode: s,
            points: i
          });
        }
      }
    }
    if (frame !== null) this._combatFootprints = { navigation: navigation, frame: frame, level: this.index, parts: t };
    return t;
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
          this.doUpgreadAni();
        } else if (t) {
          this.ndAniMain.setAnimation(0, r.fade_in, false), this.ndAniMain.addAnimation(0, r.idle_night, true), this.ndAniDown && (this.ndAniDown.setAnimation(0, r.fade_in, false), this.ndAniDown.addAnimation(0, r.idle_night, true)), this.ndAniOther.forEach(function (t) {
            t.setAnimation(0, r.fade_in, false);
            t.addAnimation(0, r.idle_night, true);
          });
        } else {
          this.ndAniMain.setAnimation(0, r.idle, true), this.ndAniDown && this.ndAniDown.setAnimation(0, r.idle, true), this.ndAniOther.forEach(function (t) {
            t.setAnimation(0, r.idle, true);
          });
        }
      }
    }
  };
  _ctor.prototype.getLockPoint = function () {
    if (this.buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None) {
      return null;
    }
    if (!this.isDestroyed && this.canLock && this.buildInfo.canUpgrade) {
      var t = this.ndLockList[this.getLevel()];
      var e = t.getComponent(cc.PolygonCollider);
      e || console.error("### 未找到锁定点", this.ID, this.ndLockList, this.index);
      var n = [];
      for (var i = 0; i < e.points.length; i++) {
        n.push(t.convertToWorldSpaceAR(cc.v2(e.points[i].x / t.scaleX, e.points[i].y / t.scaleY)));
      }
      return n;
    }
    return null;
  };
  _ctor.prototype.startRoundGame = function () {
    this.buildInfo.initBuffData();
  };
  _ctor.prototype.doUpgrade = function (t, e) {
    var n;
    var i = this;
    if (this.buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None || !this.buildInfo) {
      return false;
    }
    if (e) {
      this.buildInfo.standTime += t;
      if (this.buildInfo.standTime >= this.standTimeMax) {
        this.buildInfo.standTime = this.standTimeMax;
        $z1KinghtFallUIGame.default.instance.ctrGame.upBulid = this;
        var a = function (t) {
          $z1KinghtFallUIGame.default.instance.initView();
          i.index = t;
          i.buildInfo = new $z1KinghtFallBuildInfo.KinghtFallBuildInfo(i.buildCfg.enumValue, i.buildCfg.levelList[i.index - 1]);
          $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.BuildingLevelUp);
          i.doUpgreadAni();
          i.scheduleOnce(function () {
            $z1KinghtFallUIGame.default.instance.canStart = true;
          }, .5);
          $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.buliding);
          var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskInfo();
          if (e.type == $z1KinghtFallEnum.KinghtFallEnumTaskEnum.BuildLevel) {
            e.num = Math.max(e.num, i.buildInfo.cfg.level);
            $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().setTaskInfo(e);
          }
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.lv_building_X_Y, $z1KinghtFallUIGame.default.instance.ctrGame.gameData.levelCfg.Level + "_" + i.buildCfg.enumValue);
          $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
          if (1 == i.getLevel()) {
            switch (i.buildCfg.enumValue) {
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse:
                i.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 7);
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.BuildHome);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.ArrowTower:
                i.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 8);
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.BuildTower);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Wall:
                i.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 9);
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.BuildWall);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Mill:
                i.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 10);
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.BuildMill);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks:
                i.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 11);
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.BuildBarracks);
            }
          } else {
            switch (i.buildCfg.enumValue) {
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse:
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.UpgradeHome);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.ArrowTower:
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.UpgradeTower);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Wall:
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.UpgradeWall);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Mill:
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.UpgradeMill);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks:
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.UpgradeBarracks);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter:
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.UpgradeCastle);
            }
          }
          switch (i.buildCfg.enumValue) {
            case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse:
              $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_X, "house");
              break;
            case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.ArrowTower:
              $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_X, "arrwo");
              break;
            case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Wall:
              $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_X, "wall");
              break;
            case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Mill:
              $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_X, "mill");
              break;
            case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks:
              $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_X, "camp");
              break;
            case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter:
              $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_X, "home");
          }
        };
        if ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.coin >= this.getSell()) {
          $z1KinghtFallUIGame.default.instance.canStart = false;
          $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.GamePause, true);
          $z1KinghtFallUIGame.default.instance.ctrGame.gameData.coin -= this.getSell();
          if (this.buildInfo.cfg && this.buildInfo.cfg.BranchBuild.length > 1) {
            $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIBuildSel, $z1KinghtFallConfig.KinghtFallUIID.UIGame, this, a);
          } else {
            a(this.buildInfo.cfg ? this.buildInfo.cfg.BranchBuild[0] : 1);
          }
        } else {
          this.buildInfo.standTime = 0;
          $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.cuo);
          $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1KinghtFallConfig.KinghtFallUIID.UIGame, $z1KinghtFallTextConfig.KinghtFallTextConfig.Game03);
          $z1KinghtFallUIGame.default.instance.aniBtnAddCoin();
        }
      }
    } else {
      if (0 == this.buildInfo.standTime) {
        return;
      }
      this.buildInfo.standTime -= t;
      this.buildInfo.standTime < 0 && (this.buildInfo.standTime = 0);
    }
    var o = this.ndLockList[this.getLevel()];
    o.getChildByName("sprPro") && (o.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = this.buildInfo.standTime / this.standTimeMax);
    var r = null === (n = o.getChildByName("spAni")) || undefined === n ? undefined : n.getComponent(sp.Skeleton);
    if (r) {
      if (this.showAni) {
        if (!e) {
          this.showAni = false, r.node.active = false;
        }
      } else if (e) {
        this.showAni = true, r.node.active = true, r.setAnimation(0, r.defaultAnimation, false), r.setCompleteListener(function () {
          r.setCompleteListener(null);
          r.node.active = false;
        });
      }
    }
  };
  _ctor.prototype.upSellView = function () {
    if (this.buildCfg.enumValue != $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None && this.buildInfo) {
      var t = this.ndLockList[this.getLevel()];
      if ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.coin < this.getSell()) {
        t.color = new cc.Color().fromHEX("#db0000");
      } else {
        t.color = cc.Color.WHITE;
      }
    }
  };
  _ctor.prototype.onBuffUpgrade = function () {
    var t;
    if (!(this.buildInfo.cfg && !this.buildInfo.cfg.BranchBuild)) {
      t = this.buildInfo.cfg ? this.buildInfo.cfg.BranchBuild[0] : 1;
      this.index = t;
      $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.BuildingLevelUp);
      this.doUpgreadAni();
      $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.buliding);
    }
  };
  _ctor.prototype.getSell = function () {
    if (this.buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None || !this.canLock) {
      return -1;
    }
    if (!this.buildInfo || !this.buildInfo.canUpgrade) {
      return -1;
    }
    var t = this.buildInfo.cfg ? this.buildInfo.cfg.BuildSliverCost : this.buildCfg.lockCose;
    var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff09);
    e && (t -= e.Pamer[0]);
    var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff47);
    if (n) {
      switch (this.buildCfg.enumValue) {
        case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse:
          t -= n.Pamer[0];
          break;
        case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks:
          t += n.Pamer[1];
      }
    }
    $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SaveToken] && $z1KinghtFallUIGame.default.instance.ctrGame.gameData.round < $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SaveToken][0] && t--;
    return Math.max(t, 0);
  };
  _ctor.prototype.upHpView = function () {
    if (this.ctrHp) {
      if (this.canLock && this.buildInfo.cfg) {
        this.ctrHp.setHp(this.buildInfo.hp, this.buildInfo.hpMax);
      } else {
        this.ctrHp.setHp(0, 1);
      }
    }
  };
  _ctor.prototype.getIsLock = function () {
    return this.buildCfg.enumValue != $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None && 0 != this.index;
  };
  _ctor.prototype.getIsWork = function () {
    return this.buildCfg.enumValue != $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None && 0 != this.index && !this.isDestroyed;
  };
  _ctor.prototype.onAttacked = function (t) {
    if (!this.isDestroyed) {
      this.buildInfo.hp -= t;
      this.buildInfo.hp <= 0 && this.onDead();
      this.ctrHp.setHp(this.buildInfo.hp, this.buildInfo.hpMax);
      return t;
    }
  };
  _ctor.prototype.onDead = function () {
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.destory);
    this.delAllBuff();
    this.isDestroyed = true;
    this.ndAniMain.setAnimation(0, r.destroy, false);
    this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
      t.enabled = false;
    });
    this.ndAniDown && this.ndAniDown.setAnimation(0, r.destroy, false);
    this.ndAniOther.forEach(function (t) {
      t.node.active = true;
      t.setAnimation(0, r.destroy, false);
      t.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
        t.enabled = false;
      });
    });
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.MapUpdate);
  };
  _ctor.prototype.onUpdate = function (t) {
    if (this.getIsWork()) {
      for (var e = 0; e < this.debuffInfo.length; e++) {
        var n = this.debuffInfo[e];
        if (-1 != n.time) {
          n.time += t;
          if (n.time >= n.timeMax) {
            this.delBuffIdx(e), e--;
          }
        }
      }
      this.doTime(t);
    }
  };
  _ctor.prototype.doTime = function () {};
  _ctor.prototype.getAttPos = function () {
    return this.node.getPosition();
  };
  _ctor.prototype.getAttack = function () {
    return 0;
  };
  _ctor.prototype.reset = function (t) {
    if (t) {
      this.index = 0;
      this.setLevel(this.index);
    }
    this.isDestroyed = false;
    this.delAllBuff();
  };
  _ctor.prototype.initBuffData = function () {
    this.ndCoin.getChildByName("labNum").getComponent(cc.Label).string = "" + this.getSell();
  };
  _ctor.prototype.onChangeSpeed = function () {
    var t = $z1KinghtFallUIGame.default.instance.speed;
    this.ndAniMain.timeScale = t;
    this.ndAniDown && (this.ndAniDown.timeScale = t);
    this.ndAniOther.forEach(function (e) {
      e.timeScale = t;
    });
  };
  _ctor.prototype.endRoundGame = function () {
    this.isDestroyed = false;
  };
  _ctor.prototype.getSave = function () {
    return {
      point: this.ID,
      level: this.index
    };
  };
  _ctor.prototype.setSave = function (t) {
    var level = t && t.level;
    level = typeof level === "number" && isFinite(level) ? Math.floor(level) : 0;
    this.setLevel(Math.max(0, Math.min(this.buildCfg.levelList.length, level)));
  };
  _ctor.prototype.getMoveToPos = function (t, e) {
    if (!this.ndMove || 0 == this.ndMove.length) {
      return null;
    }
    var n = -1;
    var i = null;
    var a = null;
    for (var o = 0; o < this.ndMove.length; o++) {
      var r = this.ndMove[o];
      if (r) {
        var s = false;
        for (var l = 0; l < e.length; l++) {
          if (e[l].uuid == r.uuid) {
            s = true;
            break;
          }
        }
        if (!s) {
          var c = this.node.convertToWorldSpaceAR(r.getPosition());
          var h = cc.Vec2.distance(t, c);
          if (-1 == n || h < n) {
            n = h;
            a = c;
            i = r;
          }
        }
      }
    }
    if (i) {
      return {
        node: i,
        pos: a
      };
    } else {
      return null;
    }
  };
  cc__decorate([ccp_property({
    type: cc.Integer,
    tooltip: "点位id"
  })], _ctor.prototype, "ID", undefined);
  cc__decorate([ccp_property({
    type: [cc.Node],
    tooltip: "碰到就要移动的点"
  })], _ctor.prototype, "ndMove", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "血条"
  })], _ctor.prototype, "ndHp", undefined);
  cc__decorate([ccp_property({
    type: [cc.Node],
    tooltip: "解锁/升级"
  })], _ctor.prototype, "ndLockList", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "建筑主体"
  })], _ctor.prototype, "ndAniMain", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "建筑地板部分"
  })], _ctor.prototype, "ndAniDown", undefined);
  cc__decorate([ccp_property({
    type: [sp.Skeleton],
    tooltip: "建筑其他部分"
  })], _ctor.prototype, "ndAniOther", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallInterface.KinghtFallInterface);
exports.default = def_KinghtFallBuildBase;
(function (t) {
  t.create = "create";
  t.destroy = "destroy";
  t.idle = "idle";
  t.idle_night = "idle_night";
  t.fade_in = "Fade_in";
  t.upgrade = "upgrade";
  t.open = "open";
  t.open_night = "open_night";
  t.shut = "shut";
  t.shut_night = "shut_night";
})(r = exports.KinghtFallBuildAniName || (exports.KinghtFallBuildAniName = {}));
