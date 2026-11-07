var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1PoolMgr = require("PoolMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1UIMgr = require("UIMgr");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallUtilLayout = require("KinghtFallUtilLayout");
var $z1KinghtFallItemGood = require("KinghtFallItemGood");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIGameEnd = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.spAni = null;
    e.ndReward = null;
    e.btnBreak = null;
    e.btnNewGame = null;
    e.btnVideo = null;
    e.isWin = false;
    e.getSkillList = [];
    e.index = 0;
    e.canAni = false;
    e.time = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.lateUpdate = function () {
    require("BattleResultTitle").sync(this, this.spAni, this.btnBreak, this.isWin);
  };
  _ctor.prototype.init = function (e) {
    t.prototype.init.call(this);
    this.isWin = e;
  };
  _ctor.prototype.start = function () {
    var t = this;
    this.initData();
    var controller = $z1KinghtFallUIGame.default.instance.ctrGame;
    this.settlement = controller._battleSettlement || $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().beginSettlement(this.getSkillList, controller.gameData.levelCfg.Level, this.challengeMask, this.isWin);
    controller._battleSettlement = this.settlement;
    if (this.isWin && cc.view) require("StageStarPresentation").showResult(this, controller.gameData.levelCfg, this.settlement.challengeMask);
    this.finished = false;
    this.adPending = false;
    this.ndReward.init(this.getSkillList.length);
    this.initBtnView(false);
    this.initBtnEvent();
    $z1AudioMgr.AudioMgr.getInstance().stopMusic($z1KinghtFallConfig.KinghtFallParameter.BGMusic);
    if (this.isWin) {
      $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.game_success);
      var e = this.spAni.setAnimation(0, "victory_appear", false);
      this.spAni.addAnimation(0, "victory_idle", true);
      this.spAni.setTrackCompleteListener(e, function () {
        t.canAni = true;
      });
    } else {
      $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.game_fail);
      e = this.spAni.setAnimation(0, "fail_appear", false);
      this.spAni.addAnimation(0, "fail_idle", true);
      this.spAni.setTrackCompleteListener(e, function () {
        t.canAni = true;
      });
    }
  };
  _ctor.prototype.initData = function () {
    var t;
    var e = this;
    var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.levelCfg;
    var i = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.round;
    this.getSkillList = [];
    this.challengeMask = 0;
    var a = function (t, n) {
      var i = true;
      for (var a = 0; a < e.getSkillList.length; a++) {
        var o = e.getSkillList[a];
        if (o.id == t) {
          o.num += n;
          i = false;
          break;
        }
      }
      if (i) {
        var r = new $z1KinghtFallModle.KinghtFallRewardItem();
        r.id = t;
        r.num = n;
        e.getSkillList.push(r);
      }
    };
    for (var o = 0; o < i; o++) {
      var r = n.WaveCfg[o];
      for (var s = 0; s < r.WaveReward.length; s++) {
        var l = r.WaveReward[s];
        var c = l[1];
        if (l[0] == $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin) {
          var h = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel($z1KinghtFallEnum.KinghtFallEnumTreasureEnum.EmblemOfWealth);
          if (h) {
            var g = null === (t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfgById($z1KinghtFallEnum.KinghtFallEnumTreasureEnum.EmblemOfWealth).levelInfo[h.level - 1]) || undefined === t ? undefined : t.param;
            g && (c += Math.floor(c * g[0]));
          }
        }
        a(l[0], c);
      }
    }
    if (this.isWin) {
      var u = 0;
      var d = $z1KinghtFallUIGame.default.instance.ctrGame.gameTag;
      for (var p = $z1KinghtFallEnum.KinghtFallEnumLevelChalType.Pass; p < $z1KinghtFallEnum.KinghtFallEnumLevelChalType.MAX; p++) {
        1 != d[p] && (u += 1 << p - 1);
      }
      this.challengeMask = u;
    }
  };
  _ctor.prototype.update = function (t) {
    if (this.canAni && (this.time -= t, this.time <= 0)) {
      if (this.index == this.getSkillList.length) {
        this.canAni = false;
        return void this.initBtnView(true);
      }
      var e = this.getSkillList[this.index];
      this.time = this.aniNormal(e, this.index);
      this.index++;
      this.index == this.getSkillList.length && (this.time = 1);
    }
  };
  _ctor.prototype.initBtnView = function (t) {
    if (t) {
      this.btnBreak.active = true;
      this.btnBreak.x = this.isWin ? -this.btnVideo.x : 0;
      this.btnVideo.active = this.isWin;
      this.btnNewGame.active = false;
    } else {
      this.btnBreak.active = false;
      this.btnVideo.active = false;
      this.btnNewGame.active = false;
    }
  };
  _ctor.prototype.aniNormal = function (t, e) {
    var n = this;
    var i = function (i) {
      i.setParent(n.ndReward.node);
      var a = n.ndReward.getPos(e);
      i.setPosition(a);
      i.active = true;
      i.setScale(1);
      i.getComponent($z1KinghtFallItemGood.default).initView(t);
      cc.tween(i).set({
        opacity: 0
      }).to(.3, {
        opacity: 255
      }).start();
    };
    var a = $z1PoolMgr.PoolMgr.getInstance().getNode($z1KinghtFallConfig.KinghtFallPoolName.ItemGood);
    if (a) {
      i(a);
    } else {
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconGood, $z1KinghtFallConfig.KinghtFallPrefabName.ItemGood, function (t) {
        a = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab($z1KinghtFallConfig.KinghtFallPoolName.ItemGood, t, 10);
        i(a);
      });
    }
    return .15;
  };
  _ctor.prototype.initBtnEvent = function () {
    var t = this;
    this.btnBreak.on(cc.Node.EventType.TOUCH_END, function () {
      if (t.finished || t.adPending) return;
      t.finished = true;
      $z1UIMgr.UIMgr.getInstance().closeById(t.fromId);
      t.closeUI();
    }, this);
    this.btnVideo.on(cc.Node.EventType.TOUCH_END, function () {
      if (t.finished || t.adPending) return;
      t.adPending = true;
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        if (t.finished) return;
        if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().settleBattle(t.settlement, 2) === false) {
          t.adPending = false;
          return;
        }
        t.finished = true;
        t.adPending = false;
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.win_double);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_win_double_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        $z1UIMgr.UIMgr.getInstance().closeById(t.fromId);
        t.closeUI();
      }, function () { t.adPending = false; }, "battle.victory.double");
    }, this);
    this.btnNewGame.on(cc.Node.EventType.TOUCH_END, function () {
      if (!$z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().readyForNewBattle()) return;
      var e = parseInt($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.StaminaCost));
      if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().subPowerNum(e)) {
        t.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GameRestart, true);
        t.closeUI();
      } else {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddStrength, $z1Config.UIID.UINONE);
      }
    }, this);
  };
  cc__decorate([ccp_property(sp.Skeleton)], _ctor.prototype, "spAni", undefined);
  cc__decorate([ccp_property($z1KinghtFallUtilLayout.KinghtFallUtilLayout)], _ctor.prototype, "ndReward", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "兑换码"
  })], _ctor.prototype, "btnBreak", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "兑换码"
  })], _ctor.prototype, "btnNewGame", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "兑换码"
  })], _ctor.prototype, "btnVideo", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIGameEnd;
