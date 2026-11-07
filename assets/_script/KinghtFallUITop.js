var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1Utils = require("Utils");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUITop = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndGold = null;
    e.ndDiamond = null;
    e.ndPower = null;
    e.goldLayout = null;
    e.toolLayout = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    this.userData = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData();
  };
  _ctor.prototype.onEnable = function () {
    this.initView();
  };
  _ctor.prototype.start = function () {
    this.initEventListener();
    this.initBtnListener();
    this.onRefreshPower();
    this.schedule(this.onRefreshPower, 1);
    this.diamondLayout = cc.instantiate(this.goldLayout);
    this.diamondLayout.setParent(this.goldLayout.parent);
  };
  _ctor.prototype.initEventListener = function () {
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.RefreshGold, this.onRefreshGold);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.AniGold, this.onAniGold);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.RefreshDiamond, this.onRefreshDiamond);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.AniDiamond, this.onAniDiamond);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.RefreshPower, this.onRefreshPower);
  };
  _ctor.prototype.initBtnListener = function () {
    var t = this;
    this.ndGold.on(cc.Node.EventType.TOUCH_END, function () {
      t.openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddCurrency, $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin);
    }, this);
    this.ndDiamond.on(cc.Node.EventType.TOUCH_END, function () {
      t.openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddCurrency, $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Diamond);
    }, this);
    this.ndPower.on(cc.Node.EventType.TOUCH_END, function () {
      t.openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddStrength);
    }, this);
  };
  _ctor.prototype.initView = function () {
    this.ndGold.getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.userData.getGoldNum());
    this.ndDiamond.getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.userData.getDiamondNum());
    this.onRefreshPower();
  };
  _ctor.prototype.onRefreshPower = function () {
    var t = this.userData.getPowerNum();
    var timer = this.ndPower.getChildByName("labTime");
    if (timer) timer.active = false;
    if (t < this.userData.maxPower) {
      var n = Date.now() - this.userData.getPowerUpdateTime();
      var i = Math.floor(n / this.userData.powerRecoveryTime);
      if (i >= 1) {
        this.userData.addPowerNum(i, i * this.userData.powerRecoveryTime);
        return void this.onRefreshPower();
      }
    }
    this.ndPower.getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(t);
  };
  _ctor.prototype.onRefreshGold = function () {
    this.ndGold.getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.userData.getGoldNum());
  };
  _ctor.prototype.onRefreshDiamond = function () {
    this.ndDiamond.getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.userData.getDiamondNum());
  };
  _ctor.prototype.onAniGold = function (t) {
    $z1AudioMgr.AudioMgr.getInstance().playEffect($z1KinghtFallConfig.KinghtFallAudioId.gold_reward);
    this.flyGoldAni(this.ndGold, this.goldLayout, t);
  };
  _ctor.prototype.onAniDiamond = function (t) {
    $z1AudioMgr.AudioMgr.getInstance().playEffect($z1KinghtFallConfig.KinghtFallAudioId.gold_reward);
    this.flyGoldAni(this.ndDiamond, this.diamondLayout, t);
  };
  _ctor.prototype.flyGoldAni = function (t, e, n) {
    var i = 0;
    var a = 0;
    var o = t.getChildByName("sprIcon").getComponent(cc.Sprite);
    if (n) {
      var r = e.parent.convertToNodeSpaceAR(n);
      e.setPosition(r);
    } else {
      e.setPosition(0, 0);
    }
    var s = t.convertToWorldSpaceAR(t.getChildByName("sprIcon").getPosition());
    var c = e.convertToNodeSpaceAR(s);
    var h = function (n) {
      var r = e.children[n];
      r.active = true;
      r.getComponent(cc.Sprite).spriteFrame = o.spriteFrame;
      cc.Tween.stopAllByTarget(r);
      var s = $z1Utils.Utils.randomRang(18, 30);
      var h = cc.v3();
      cc.Vec2.random(h, $z1Utils.Utils.randomRang(50, 150));
      cc.tween(r).set({
        position: cc.Vec3.ZERO,
        scale: .5
      }).delay(i).show().to(.2, {
        position: h
      }).to(.03, {
        scale: s / 10
      }).to(.02, {
        scale: 1
      }).delay(.2).delay(i).call(function () {
        cc.tween(r).to(i + .05, {
          position: cc.v3(c.x, c.y, 0)
        }).hide().call(function () {
          cc.tween(t.getChildByName("sprIcon")).to(.05, {
            scale: 1.5
          }).to(.1, {
            scale: 1
          }).start();
          ++a >= e.children.length - 1 && (a = 0);
        }).start();
      }).start();
      i += .04;
    };
    for (var g = 0; g < e.children.length; g++) {
      h(g);
    }
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "金币节点"
  })], _ctor.prototype, "ndGold", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "钻石节点"
  })], _ctor.prototype, "ndDiamond", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "体力节点"
  })], _ctor.prototype, "ndPower", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "体力节点"
  })], _ctor.prototype, "goldLayout", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "体力节点"
  })], _ctor.prototype, "toolLayout", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUITop;
