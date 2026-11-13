var cc__decorate = __decorate;
var cc__spreadArrays = __spreadArrays;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallSwitch = exports.KinghtFallSoldierAniEnum = exports.KinghtFallPlayAniEnum = exports.KinghtFallGameArmy = exports.KinghtFallGameStage = exports.KinghtFallRewardItem = undefined;
var $z1Appcfg = require("Appcfg");
var $z1AudioMgr = require("AudioMgr");
var $z1EventMgr = require("EventMgr");
var $z1ResourceMgr = require("ResourceMgr");
var $z1UIMgr = require("UIMgr");
require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallMissionData = require("KinghtFallMissionData");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallModle = function () {
  function _ctor() {
    this.isLoad = false;
  }
  var e;
  e = _ctor;
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new e());
    return this.instance;
  };
  _ctor.prototype.preload = function (t) {
    var e = this;
    if (this.isLoad) {
      t && t();
    } else {
      cc.director.getPhysicsManager().enabled = true;
      cc.director.getPhysicsManager().gravity = cc.v2(0, 0);
      // Combat ranges and gate triggers use explicit geometry queries. There
      // are no onCollision callbacks or consumers of Collider.world here;
      // checking every pair of range circles duplicates that work quadratically.
      // Physical bodies continue to collide through the PhysicsManager above.
      cc.director.getCollisionManager().enabled = false;
      cc.director.getCollisionManager().enabledDebugDraw = false;
      $z1UIMgr.UIMgr.getInstance().addUICnf($z1KinghtFallConfig.KinghtFallUICF);
      $z1AudioMgr.AudioMgr.getInstance().addAdConf($z1KinghtFallConfig.KinghtFallAudioCF);
      $z1AudioMgr.AudioMgr.getInstance().setButtonNomalAudio($z1KinghtFallConfig.KinghtFallAudioId.button_click);
      $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().preload(function () {
        $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.Loading, $z1Appcfg.LoadingProcess.ResCfg);
        $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().preload(function () {
          $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.Loading, $z1Appcfg.LoadingProcess.AudioCfg);
          require("CharacterAppearance").preload(function () {
            require("BuildingAssetWarmup").preload(function () {
            e.isLoad = true;
            t && t();
            $z1ResourceMgr.ResourceMgr.getInstance().loadBundle($z1KinghtFallConfig.KinghtFallBundelName.EnemyAni, function () {
              $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.Loading, $z1Appcfg.LoadingProcess.OtherCfg);
              $z1ResourceMgr.ResourceMgr.getInstance().loadBundle($z1KinghtFallConfig.KinghtFallBundelName.IconMap, function () {
                $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.Loading, $z1Appcfg.LoadingProcess.EndLoading);
              });
            });
            });
          });
        });
      });
    }
  };
  _ctor.prototype.numberFomat = function (t) {
    return require("LanguageMgr").LanguageMgr.getInstance().formatNumber(t);
  };
  _ctor.prototype.rollNumLabelAtlas2 = function (t, e, n, i, a, o) {
    undefined === a && (a = 1);
    var r = n - e;
    if (0 != r) {
      var s = 20 * a;
      var l = 0;
      var c = r / s;
      if (Math.abs(c) < 1) {
        s = Math.abs(r);
        c = r / Math.abs(r);
      }
      if (s > 0) {
        var h = 0;
        cc.Tween.stopAllByTarget(t.node);
        cc.tween(t.node).call(function () {
          l += c;
          t.string = Math.floor(e + l).toFixed(0);
          o && o(h++, e + l);
        }).delay(.05).union().repeat(s).call(function () {
          i();
        }).start();
      } else {
        i && i();
      }
    } else {
      i && i();
    }
  };
  _ctor.prototype.SecondToHours = function (t) {
    var e = t % 60;
    e = Math.floor(e / 10).toString() + e % 10;
    var n = Math.floor(t / 60);
    return (n = Math.floor(n / 10).toString() + n % 10) + ":" + e;
  };
  _ctor.prototype.compareIsToday = function (t) {
    var e = new Date(t);
    var n = e.getFullYear();
    var i = e.getMonth();
    var a = e.getDate();
    var o = new Date();
    var r = o.getFullYear();
    var s = o.getMonth();
    var l = o.getDate();
    return n == r && i == s && a == l;
  };
  _ctor.prototype.showRedPerson = function () {
    var t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getEquipCfgList();
    var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getGoldNum();
    var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage();
    var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxOrder();
    for (var a = 0; a < t.length; a++) {
      var o = t[a];
      var r = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(o.id);
      if (!(r >= o.levelInfo.length)) {
        var s = true;
        o.Unlock && (s = o.Unlock[0] < n || !(o.Unlock[0] > n) && o.Unlock[1] < i);
        if (s && e >= o.levelInfo[r - 1].GoldCost) {
          return true;
        }
      }
    }
    return false;
  };
  _ctor.prototype.showRedTanlent = function () {
    var t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTalentLevelCfg();
    var e = [];
    var n = function (t) {
      var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalentLevel(t.ID);
      if (n && n.isLock) {
        return 1;
      }
      if (1 == t.Level) {
        return 2;
      }
      var i = e[t.Level - 2];
      var a = false;
      for (var o = 0; o < i.cfgList.length; o++) {
        var r = i.cfgList[o];
        var s = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalentLevel(r.ID);
        if (s && s.isLock) {
          a = true;
          break;
        }
      }
      if (a) {
        var l = e[t.Level - 1];
        if (l.cfgList.length > 1) {
          for (o = 0; o < l.cfgList.length; o++) {
            r = l.cfgList[o];
            var c = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalentLevel(r.ID);
            if (c && c.isLock) {
              return 3;
            }
          }
        }
        return 2;
      }
      return 4;
    };
    var i = function (e) {
      var n = [];
      for (var i = 0; i < t.length; i++) {
        t[i].Level == e && n.push(t[i]);
      }
      return n;
    };
    for (var a = 1;; a++) {
      var o = i(a);
      if (0 == o.length) {
        break;
      }
      var r = {
        level: a,
        cfgList: o
      };
      e.push(r);
    }
    var s = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getGoldNum();
    for (var l = 0; l < e.length; l++) {
      var c = e[l];
      for (var h = 0; h < c.cfgList.length; h++) {
        if (2 == n(c.cfgList[h]) && s >= c.cfgList[h].GoldCost) {
          return true;
        }
      }
    }
    return false;
  };
  _ctor.prototype.showRedFight = function () {
    var t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getAchievementCfg();
    for (var e = 0; e < t.length; e++) {
      var n = t[e];
      if (o = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getAchInfoByType(n.Type)) {
        if (o.reward.includes(n.ID)) {
          ;
        } else if (o.num >= n.Argument) {
          return true;
        }
      }
    }
    t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getPassCfg();
    var i = 0;
    for (var a = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getAchPoint(); a >= t[i].LevelCost && (a -= t[i].LevelCost, t[++i]);) {
      ;
    }
    for (e = 0; e < t.length; e++) {
      n = t[e];
      var o = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getAchReward(n.ID);
      if (i >= n.ID && !((1 & o) > 0)) {
        return true;
      }
    }
    t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getOnlineRewardCfg();
    var r = Math.floor($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getOnlineTime() / 60);
    for (e = 0; e < t.length; e++) {
      if (r >= t[e].condition && !$z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getOnlineTimeReward(t[e].id)) {
        return true;
      }
    }
    switch ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getSignReward()) {
      case 0:
        return true;
    }
    var missions = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData();
    if (missions.hasQuestReward) return missions.hasQuestReward();
    if (2 == (o = missions.getTaskInfo()).stage) {
      return false;
    }
    var s = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTaskCfgById(o.id);
    var l = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage();
    var c = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxOrder();
    var h = 0;
    switch (s.MissionType) {
      case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.LevelComplete:
        if (l > s.Argument[0]) {
          return true;
        }
        break;
      case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.LevelWaveComplete:
        if (l > s.Argument[0] || l == s.Argument[0] && c >= s.Argument[1]) {
          return true;
        }
        break;
      case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.EquipUpCount:
        o.num = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.EquipUp);
        if (o.num >= s.Argument[0]) {
          return true;
        }
        break;
      case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.EquipLevel:
        var f = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getEquipCfgList();
        for (e = 0; e < f.length; e++) {
          n = f[e];
          var m = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(n.id);
          h = Math.max(h, m);
        }
        if (o.num >= s.Argument[0]) {
          return true;
        }
        break;
      case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.UnlockTalentCount:
        o.num = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.TalentUp);
        if (o.num >= s.Argument[0]) {
          return true;
        }
        break;
      case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.UnlockBuffTalent:
        t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfg();
        for (e = 0; e < t.length; e++) {
          n = t[e];
          $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel(n.ID) && h++;
        }
        if (o.num >= s.Argument[0]) {
          return true;
        }
        break;
      case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.TreasureLevel:
        o.num = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.TreasureUp);
        if (o.num >= s.Argument[0]) {
          return true;
        }
        break;
      default:
        h = o.num;
        if (o.num >= s.Argument[0]) {
          return true;
        }
    }
    return false;
  };
  _ctor.prototype.showRedTreasure = function () {
    var t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfg();
    var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getGoldNum();
    for (var n = 0; n < t.length; n++) {
      var i = t[n];
      var a = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel(i.ID);
      if (a && i.levelInfo[a.level - 1].GoldCost <= e && i.levelInfo[a.level - 1].PieceCost <= a.frame) {
        return true;
      }
    }
    return false;
  };
  _ctor.prototype.twBreatheRedPoint = function (t) {
    cc.Tween.stopAllByTarget(t);
    cc.tween(t).set({
      scale: 1
    }).to(.5, {
      scale: 1.1
    }).to(.5, {
      scale: 1
    }).union().repeatForever().start();
  };
  _ctor.prototype.randomArray = function (t, e) {
    var n = [];
    var i = cc__spreadArrays(t);
    for (var o = 0; o < e; o++) {
      var r = Math.floor(Math.random() * i.length);
      n.push(i[r]);
      i.splice(r, 1);
      if (0 == i.length) {
        break;
      }
    }
    return n;
  };
  return e = cc__decorate([ccp_ccclass], _ctor);
}();
exports.default = def_KinghtFallModle;
exports.KinghtFallRewardItem = function () {};
(function (t) {
  t[t.Prepare = 0] = "Prepare";
  t[t.Transition = 1] = "Transition";
  t[t.Fight = 2] = "Fight";
  t[t.FightEnd = 3] = "FightEnd";
  t[t.End = 4] = "End";
})(exports.KinghtFallGameStage || (exports.KinghtFallGameStage = {}));
(function (t) {
  t[t.None = 0] = "None";
  t[t.Friend = 1] = "Friend";
  t[t.Enemy = 2] = "Enemy";
})(exports.KinghtFallGameArmy || (exports.KinghtFallGameArmy = {}));
(function (t) {
  t.Attack = "attack";
  t.Idle = "idle";
  t.Move = "move";
  t.Die = "wqyl_lead_die";
  t.DieKeep = "wqyl_lead_die_idle";
  t.Rise = "wqyl_lead_rise";
  t.LevelUp = "wqyl_lead_up";
})(exports.KinghtFallPlayAniEnum || (exports.KinghtFallPlayAniEnum = {}));
(function (t) {
  t.Attack = "attack";
  t.Idle = "idle";
  t.Move = "move";
  t.Die = "die";
})(exports.KinghtFallSoldierAniEnum || (exports.KinghtFallSoldierAniEnum = {}));
var exp_KinghtFallSwitch = function () {
  function t() {}
  t.isMapShopOpen = function () {
    return false;
  };
  t.isMapShopSecondOpen = function () {
    return true;
  };
  return t;
}();
exports.KinghtFallSwitch = exp_KinghtFallSwitch;
