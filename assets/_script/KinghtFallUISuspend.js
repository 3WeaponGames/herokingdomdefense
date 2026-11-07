var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
var cc__spreadArrays = __spreadArrays;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1Utils = require("Utils");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUISuspend = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndParent = null;
    e.ndItem = null;
    e.togCon = null;
    e.sprfBgList = [];
    e.ndTips = null;
    e.btnClose = null;
    e.btnNewGame = null;
    e.newGameCall = null;
    e.breakCall = null;
    e.posX = [[-145, -50, 50, 150], [-200, -100, 0, 100, 200]];
    e.posY = [-70, -80];
    e.proY = -1;
    e.tag = "";
    e.tagNode = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t, e, releasePause) {
    this.newGameCall = t;
    this.breakCall = e;
    this.releasePause = releasePause;
    this._pauseReleased = false;
  };
  _ctor.prototype.start = function () {
    var t = this;
    this.ndItem.active = false;
    this.ndTips.active = false;
    this.initItem();
    this.bindEvent();
    this.ndParent.node.on("scrolling", function (e) {
      -1 == t.proY && (t.proY = e.content.y);
      Math.abs(e.content.y - t.proY) > 10 && (t.ndTips.active = false);
    }, this);
    this.ndParent.node.on("scroll-ended", function () {
      t.proY = -1;
    }, this);
    for (var e = 0; e < this.togCon.toggleItems.length; e++) {
      this.togCon.toggleItems[e].node.on("toggle", this.showView, this);
    }
    this.togCon.toggleItems[$z1KinghtFallConfig.KinghtFallParameter.FollowMode - 1].isChecked = true;
  };
  _ctor.prototype.initItem = function () {
    var t = this;
    var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.buffList;
    var n = 0;
    var i = 0;
    var a = function (a) {
      var r = e[a];
      var s = cc.instantiate(o.ndItem);
      s.parent = o.ndParent.content;
      s.active = true;
      s.setPosition(o.posX[n % o.posX.length][i], o.posY[0] + n * o.posY[1]);
      if (++i >= o.posX[n % o.posX.length].length) {
        n++;
        i = 0;
      }
      s.getComponent(cc.Sprite).spriteFrame = o.sprfBgList[r.cfg.Quality - 1];
      o.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconBuff, r.cfg.Image, function (t) {
        s.getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = t;
      });
      s.on(cc.Node.EventType.TOUCH_END, function (e) {
        t.onClick(e, r);
      }, o);
    };
    var o = this;
    for (var r = 0; r < e.length; r++) {
      a(r);
    }
    this.ndParent.content.height = Math.abs(this.posY[0] + (n + 1) * this.posY[1]);
  };
  _ctor.prototype.onClick = function (t, e) {
    var n = t.currentTarget.convertToWorldSpaceAR(cc.v2(0, 50));
    var i = this.ndTips.parent.convertToNodeSpaceAR(n);
    this.ndTips.setPosition(i);
    this.ndTips.active = true;
    var a = [];
    for (var o = 0; o < e.cfg.Pamer.length; o++) {
      if (e.cfg.isPerecentage && e.cfg.isPerecentage[o]) {
        a.push(Math.ceil(1e4 * e.cfg.Pamer[o] / 100) + "%");
      } else {
        a.push("" + e.cfg.Pamer[o]);
      }
    }
    this.ndTips.getChildByName("ndLayout").getComponentInChildren(cc.RichText).string = require("LanguageMgr").LanguageMgr.getInstance().format("<b><outline color=#000000 width=4>{0}</outline></b>", [$z1Utils.Utils.StringFormat.apply($z1Utils.Utils, cc__spreadArrays([e.cfg.Describe], a))]);
  };
  _ctor.prototype.bindEvent = function () {
    var t = this;
    this.btnClose.on(cc.Node.EventType.TOUCH_END, this.resumeGame, this);
    this.btnNewGame.on(cc.Node.EventType.TOUCH_END, function () {
      if (t.breakCall() === false) return;
      t.closeUI();
    }, this);
  };
  _ctor.prototype.resumeGame = function () {
    if (this._pauseReleased || this.isclose) return;
    if (!this.releasePause) this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
    this.onClose();
    this.closeUI();
  };
  _ctor.prototype.onClose = function () {
    if (this._pauseReleased) return;
    this._pauseReleased = true;
    var release = this.releasePause;
    this.releasePause = null;
    if (release) release();
  };
  _ctor.prototype.onDestroy = function () {
    try { this.onClose(); }
    finally { t.prototype.onDestroy.call(this); }
  };
  _ctor.prototype.showView = function (t) {
    $z1AudioMgr.AudioMgr.getInstance().playAudioButtonClicked();
    if (t.isChecked && this.tag != t.node.name) {
      switch (t.node.name) {
        case "Toggle1":
          $z1KinghtFallUIGame.default.instance.changeFollowMode(1);
          break;
        case "Toggle2":
          $z1KinghtFallUIGame.default.instance.changeFollowMode(2);
      }
    }
  };
  cc__decorate([ccp_property(cc.ScrollView)], _ctor.prototype, "ndParent", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndItem", undefined);
  cc__decorate([ccp_property({
    type: cc.ToggleContainer,
    tooltip: "切换按钮组"
  })], _ctor.prototype, "togCon", undefined);
  cc__decorate([ccp_property([cc.SpriteFrame])], _ctor.prototype, "sprfBgList", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndTips", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "兑换码"
  })], _ctor.prototype, "btnNewGame", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUISuspend;
