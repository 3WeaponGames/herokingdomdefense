var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1Utils = require("Utils");
var $z1GAD_Configs = require("GAD_Configs");
var $z1GAD_DataMgr = require("GAD_DataMgr");
var $z1GAD_PlayerMgr = require("GAD_PlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_UILottery = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.buffSpArr = [];
    e.uuidMap = new Map();
    e._callFunc = null;
    e.tempArr = [];
    e.startPosArr = [];
    e.canTouch = false;
    e.selectNum = 1;
    e.showTime = 2;
    e.nodeLayer = null;
    e.allTime = 1;
    e.closeTime = 1.5;
    e.shutTime = .3;
    e.inChange = false;
    e.changeNum = 20;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this.tempArr = t.split("|");
    this.canTouch = false;
    this.shuffleArray(this.tempArr);
    this.initView();
    this.doAnimation();
  };
  _ctor.prototype.initView = function () {
    var t = this;
    var e = this.itemNode.x;
    var n = this.itemNode.y;
    var i = this.itemNode.parent;
    this.nodeLayer = i;
    this.itemNode.removeFromParent();
    var a = this.itemNode.width + 30;
    var o = function (o) {
      var s = cc.instantiate(r.itemNode);
      s.parent = i;
      var l = new cc.Vec2(o * a + e, n);
      s.setPosition(l);
      r.startPosArr.push(l);
      var c = o + 1;
      var g = r.tempArr[c];
      var u = g.split(",")[0];
      var d = g.split(",")[1];
      var p = $z1GAD_DataMgr.default.getInstance().getBuffTypeCfg(u);
      r.uuidMap[s.uuid] = p;
      r.initItemView(s, p, Number(d));
      s.on(cc.Node.EventType.TOUCH_END, function () {
        t.onTouchEnd(s, p, s.uuid, Number(d));
      });
    };
    var r = this;
    for (var s = -1; s <= 1; s++) {
      o(s);
    }
  };
  _ctor.prototype.onTouchEnd = function (t, e, n, i) {
    var a = this;
    if (!(!this.canTouch || this.selectNum <= 0)) {
      this.selectNum--;
      this.openAnimation(t, e);
      this.scheduleOnce(function () {
        for (var t in a.nodeLayer.children) {
          var o = a.nodeLayer.children[t];
          o.uuid != n && a.openAnimation(o, a.uuidMap[o.uuid]);
        }
        a.scheduleOnce(function () {
          a.sendEvent($z1GAD_Configs.emGADEventName.GAD_AddBuff, e.buffType, i);
          $z1GAD_PlayerMgr.default.getInstance().setState($z1GAD_Configs.emGADGameState.Game);
          a.closeUI();
        }, a.closeTime);
      }, this.allTime);
    }
  };
  _ctor.prototype.openAnimation = function (t, e, n) {
    undefined === n && (n = false);
    $z1AudioMgr.AudioMgr.getInstance().playEffect($z1GAD_Configs.GAD_AudioId.open);
    var i = t.getChildByName("buffSp").getComponent(sp.Skeleton);
    var a = t.getChildByName("buffIcon");
    if ("red" == e.color) {
      i.setSkin("red");
    } else {
      i.setSkin("blue");
    }
    i.setAnimation(0, "open", false);
    i.setCompleteListener(function () {
      i.node.active = false;
      a.active = true;
    });
  };
  _ctor.prototype.initItemView = function (t, e, n) {
    var i = t.getChildByName("buffIcon");
    var a = i.getChildByName("itemName").getComponent(cc.Label);
    var o = i.getChildByName("itemNum").getComponent(cc.Label);
    var r = i.getChildByName("itemIcon").getComponent(cc.Sprite);
    this.loadSpriteFrame($z1GAD_Configs.emGADBundles.imgs, "buff/" + e.buffIcon, function (t) {
      r.spriteFrame = t;
    });
    if ("blue" == e.color) {
      i.getComponent(cc.Sprite).spriteFrame = this.buffSpArr[0];
    } else {
      i.getComponent(cc.Sprite).spriteFrame = this.buffSpArr[1];
    }
    a.string = e.buffLabel;
    o.string = $z1Utils.Utils.StringFormat(e.buffValue, n);
  };
  _ctor.prototype.doAnimation = function () {
    var t = this;
    var e = function (e) {
      var i = n.nodeLayer.children[e];
      var a = n.uuidMap[i.uuid];
      n.scheduleOnce(function () {
        t.shutAnimation(i, a);
      }, n.showTime);
    };
    var n = this;
    for (var i in this.nodeLayer.children) {
      e(i);
    }
  };
  _ctor.prototype.shutAnimation = function (t, e) {
    var n = this;
    t.getChildByName("buffIcon").active = false;
    var i = t.getChildByName("buffSp");
    i.active = true;
    if ("red" == e.color) {
      i.getComponent(sp.Skeleton).setSkin("red");
      i.getComponent(sp.Skeleton).setAnimation(0, "shut", false);
    } else {
      i.getComponent(sp.Skeleton).setSkin("blue");
      i.getComponent(sp.Skeleton).setAnimation(0, "shut", false);
    }
    i.getComponent(sp.Skeleton).setCompleteListener(function () {
      n.changePosAnimation();
    });
  };
  _ctor.prototype.changePosAnimation = function () {
    if (!this.inChange) {
      this.inChange = true;
      this.swapCards();
    }
  };
  _ctor.prototype.swapCards = function () {
    var t = this;
    if (this.changeNum <= 0) {
      this.scheduleOnce(function () {
        t.standPos();
      }, .05);
    } else {
      var e = this.nodeLayer.children;
      var n = [0, 1, 2];
      var i = (n = this.shuffleArray(n))[0];
      var a = n[1];
      var o = e[i];
      var r = o.position;
      var s = e[a];
      var l = s.position;
      var c = .01 * this.changeNum;
      cc.tween(o).to(c, {
        position: l
      }).start();
      cc.tween(s).to(c, {
        position: r
      }).call(function () {
        t.changeNum--;
        t.swapCards();
      }).start();
    }
  };
  _ctor.prototype.standPos = function () {
    var t = this;
    this.shuffleArray(this.startPosArr);
    for (var e in this.nodeLayer.children) {
      var n = this.nodeLayer.children[e];
      n.setPosition(this.startPosArr[0]);
      cc.tween(n).delay(.1).to(.1, {
        position: new cc.Vec3(this.startPosArr[e].x, this.startPosArr[e].y, 0)
      }).call(function () {
        t.canTouch = true;
      }).start();
    }
  };
  _ctor.prototype.shuffleArray = function (t) {
    var e;
    for (var n = t.length - 1; n > 0; n--) {
      var i = Math.floor(Math.random() * (n + 1));
      e = [t[i], t[n]];
      t[n] = e[0];
      t[i] = e[1];
    }
    return t.slice(0, 3);
  };
  _ctor.prototype.onLoad = function () {};
  _ctor.prototype.start = function () {};
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "itemNode", undefined);
  cc__decorate([ccp_property(cc.SpriteFrame)], _ctor.prototype, "buffSpArr", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_GAD_UILottery;