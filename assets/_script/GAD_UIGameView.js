var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1BasePlatform = require("BasePlatform");
var $z1PlatformSetting = require("PlatformSetting");
var $z1AudioMgr = require("AudioMgr");
var $z1PoolMgr = require("PoolMgr");
var $z1UIMgr = require("UIMgr");
var $z1Config = require("Config");
var $z1GAD_Configs = require("GAD_Configs");
var $z1GAD_BuffTips = require("GAD_BuffTips");
var $z1GAD_App = require("GAD_App");
var $z1GAD_DataMgr = require("GAD_DataMgr");
var $z1GAD_PlayerMgr = require("GAD_PlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_UIGameView = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndTipRoot = null;
    e.ndWarn = null;
    e.sprBgSup = null;
    e.btnPause = null;
    e.hitEffect = null;
    e.ndBuffImg = null;
    e.doorHitEffctRoot = null;
    e.spBack = null;
    e.labTip = null;
    e.lblWave = null;
    e.btnExit = null;
    e.ndLayer = null;
    e.tipPools = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    var t = this;
    $z1PoolMgr.PoolMgr.getInstance().creatrePool("pbt_hit_effect", this.hitEffect, 5);
    $z1PoolMgr.PoolMgr.getInstance().creatrePool("pbt_buff_img", this.ndBuffImg, 2);
    this._hitPool = $z1PoolMgr.PoolMgr.getInstance().poolMap.get("pbt_hit_effect");
    this._buffPool = $z1PoolMgr.PoolMgr.getInstance().poolMap.get("pbt_buff_img");
    this._hitPool.setWaterMark(256);
    this.labTip.node.active = $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.WEB_LINK;
    this.labTip.string = require("LanguageMgr").LanguageMgr.getInstance().t("[[loc:mode.unlock]]", [$z1GAD_App.default.instance.lockNum]);
    if ("1" == $z1GAD_DataMgr.default.getInstance().getUrlParam("isEditor")) {
      this.lblWave.node.active = true;
      this.addEvent($z1GAD_Configs.emGADEventName.GAD_Show_Wave_Num, function (e) {
        t.lblWave.string = require("LanguageMgr").LanguageMgr.getInstance().t("[[loc:script.kinghtfalltextconfig.homebattle02.15]]", [e]);
      });
    } else {
      this.lblWave.node.active = false;
    }
  };
  _ctor.prototype.start = function () {
    this.addEvent($z1GAD_Configs.emGADEventName.GAD_Show_Hit_Text, this.onShowHitText);
    this.addEvent($z1GAD_Configs.emGADEventName.GAD_Show_Warn, this.playWarn);
    this.addEvent($z1GAD_Configs.emGADEventName.GAD_Show_Hit_Effect, this.showHitEffect);
    this.addEvent($z1GAD_Configs.emGADEventName.GAD_Show_Buff_Tip, this.showBuffTip);
    this.addEvent($z1GAD_Configs.emGADEventName.GAD_WebPause, this.webPause);
    this.ndWarn.scale = Math.max(cc.winSize.width / this.ndWarn.width, cc.winSize.height / this.ndWarn.height);
    this.btnPause.on(cc.Node.EventType.TOUCH_END, this.webPause, this);
    this.ndLayer.active = false;
  };
  _ctor.prototype.webPause = function (event) {
    if (event && event.stopPropagation) event.stopPropagation();
    var game = require("GAD_UIGame").default.script;
    if (!game || game.isclose || !cc.isValid(game, true) || this._pauseDialog ||
        game._decisionNode && cc.isValid(game._decisionNode, true) || game._pendingUIOpens && game._pendingUIOpens.size) return;
    var player = $z1GAD_PlayerMgr.default.getInstance();
    if (player.getState() != $z1GAD_Configs.emGADGameState.Game) return;
    var view = this, generation = game._resourceGeneration, dialog = this._pauseDialog = {};
    dialog.isCurrent = function () {
      return view._pauseDialog === dialog && require("GAD_UIGame").default.script === game &&
        !game.isclose && cc.isValid(game, true) && cc.isValid(view, true) &&
        game._resourceGeneration === generation && player.getState() === $z1GAD_Configs.emGADGameState.Pause;
    };
    function release(resume) {
      var current = dialog.isCurrent();
      if (view._pauseDialog !== dialog) return;
      view._pauseDialog = null;
      if (game._decisionNode === dialog.node) game._decisionNode = null;
      if (resume && current) player.setState($z1GAD_Configs.emGADGameState.Game);
    }
    player.setState($z1GAD_Configs.emGADGameState.Pause);
    var cards = game._cardCtrl, language = require("LanguageMgr").LanguageMgr.getInstance();
    var stats = [
      { label: "pause.damage", value: language.formatNumber(Math.round(cards.getAtkDamage()), "battle") },
      { label: "pause.attackSpeed", value: language.format("pause.speedMultiplier", [Math.round(cards.getCDParam() * 100) / 100]) },
      { label: "pause.projectiles", value: String(cards._cards.length + cards._extraProjectiles) },
      { label: "pause.wallHealth", value: language.format("pause.healthValue", [language.formatNumber(Math.floor(cards.hp), "battle"), language.formatNumber(Math.floor(cards.maxHp), "battle")]) }
    ];
    dialog.request = $z1UIMgr.UIMgr.getInstance().openUIWithOwner($z1GAD_Configs.GAD_UIID.UIPause, game.uid || $z1Config.UIID.UINONE, {
      parent: game,
      recoveryCancelAllowed: true,
      isCurrent: dialog.isCurrent,
      onCancel: function () { release(true); },
      onOpened: function (node) { dialog.node = node; game._decisionNode = node; }
    }, function () {
      return dialog.isCurrent() && game.restartPausedRun();
    }, function () {
      if (!dialog.isCurrent()) return false;
      release(false);
      view.sendEvent($z1GAD_Configs.emGADEventName.GAD_Setting_Back);
    }, function () { release(true); }, stats, { mode: "wallDefense", stageTitle: function () {
      return language.t("lobby.wallDefense") + " · " + language.t("script.kinghtfalltextconfig.homebattle02.15", [Math.max(1, game._curWave)]);
    } });
  };
  _ctor.prototype.onShowHitText = function (t, e) {
    var n;
    var i = this;
    (n = this.tipPools.length > 0 ? this.tipPools.pop() : cc.instantiate(this.ndTipRoot.children[0])).parent = this.ndTipRoot;
    n.active = true;
    n.getComponent(cc.Label).string = (t > 0 ? "+" : "") + require("LanguageMgr").LanguageMgr.getInstance().formatNumber(t, "battle");
    n.color = t > 0 ? cc.color().fromHEX("#0bff16") : cc.color().fromHEX("#ff4e49");
    var a = this.ndTipRoot.convertToNodeSpaceAR(cc.v2(e.x, e.y));
    n.setPosition(a.x, a.y);
    n.opacity = 255;
    cc.tween(n).by(.3, {
      y: 80
    }).to(.1, {
      opacity: 0
    }).call(function () {
      n.removeFromParent();
      i.tipPools.push(n);
    }).start();
  };
  _ctor.prototype.playWarn = function () {
    var t = this;
    cc.Tween.stopAllByTarget(this.ndWarn);
    this.onScreenShake();
    this.ndWarn.active = true;
    cc.tween(this.ndWarn).to(.3, {
      opacity: 0
    }).to(.3, {
      opacity: 255
    }).union().repeatForever().start();
    cc.tween(this.ndWarn).delay(2).call(function () {
      cc.Tween.stopAllByTarget(t.ndWarn);
      t.ndWarn.active = false;
    }).start();
  };
  _ctor.prototype.showHitEffect = function (t) {
    var e = this.node.convertToNodeSpaceAR(t);
    var pool = this._hitPool;
    var n = pool && pool.getNode();
    if (!n) return;
    $z1GAD_Configs.emGADRoleType.Door;
    n.parent = this.node;
    n.setPosition(e);
    n.active = true;
    var skeleton = n.getComponent(sp.Skeleton);
    skeleton.enableBatch = true;
    if (sp.Skeleton.AnimationCacheMode && skeleton.setAnimationCacheMode && !skeleton.isAnimationCached()) skeleton.setAnimationCacheMode(sp.Skeleton.AnimationCacheMode.SHARED_CACHE);
    skeleton.setAnimation(0, "jian_1", false);
    var animation = skeleton.findAnimation && skeleton.findAnimation("jian_1");
    this.scheduleOnce(function () {
      n.active = false;
      pool.freeNode(n);
    }, animation && animation.duration > 0 ? animation.duration : .5);
  };
  _ctor.prototype.showBuffTip = function (t, e) {
    $z1AudioMgr.AudioMgr.getInstance().playEffect($z1GAD_Configs.GAD_AudioId.buff);
    this.sendEvent($z1GAD_Configs.emGADEventName.GAD_BuffAnimation);
    var pool = this._buffPool;
    var n = pool && pool.getNode();
    if (!n) return;
    n.parent = this.node;
    var i = this.node.convertToNodeSpaceAR(e);
    n.setPosition(i);
    n.getComponent($z1GAD_BuffTips.default).show(t, pool);
  };
  _ctor.prototype.onScreenShake = function () {
    cc.Tween.stopAllByTarget(this.sprBgSup);
    cc.tween(this.sprBgSup).set({
      position: cc.v3(0, 0)
    }).by(.05, {
      position: cc.v3(-5, -5)
    }).by(.05, {
      position: cc.v3(10, 5)
    }).by(.05, {
      position: cc.v3(-10, 0)
    }).by(.05, {
      position: cc.v3(10, -5)
    }).by(.05, {
      position: cc.v3(-5, 5)
    }).set({
      position: cc.v3(0, 0)
    }).start();
  };
  _ctor.prototype.onDestroy = function () {
    var dialog = this._pauseDialog;
    this._pauseDialog = null;
    if (dialog && dialog.request) dialog.request.cancel();
    var pools = $z1PoolMgr.PoolMgr.getInstance();
    if (pools.poolMap.get("pbt_hit_effect") === this._hitPool) pools.clearPool("pbt_hit_effect");
    if (pools.poolMap.get("pbt_buff_img") === this._buffPool) pools.clearPool("pbt_buff_img");
    this.tipPools.forEach(function (node) { if (cc.isValid(node, true)) node.destroy(); });
    this.tipPools.length = 0;
    t.prototype.onDestroy.call(this);
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndTipRoot", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndWarn", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "sprBgSup", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnPause", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "hitEffect", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndBuffImg", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "doorHitEffctRoot", undefined);
  cc__decorate([ccp_property(cc.Sprite)], _ctor.prototype, "spBack", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "labTip", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "lblWave", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnExit", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndLayer", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_GAD_UIGameView;
