var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OpenAin = undefined;
var r;
var $z1EventMgr = require("EventMgr");
var $z1LanguageMgr = require("LanguageMgr");
var $z1PlatformManager = require("PlatformManager");
var $z1ResCacheMgr = require("ResCacheMgr");
var $z1ResourceMgr = require("ResourceMgr");
var $z1TweenMgr = require("TweenMgr");
var $z1UIMgr = require("UIMgr");
var $z1ArgsParseUtils = require("ArgsParseUtils");
var $z1BasePlatform = require("BasePlatform");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
(function (t) {
  t[t.None = 0] = "None";
  t[t.Pop = 1] = "Pop";
})(r = exports.OpenAin || (exports.OpenAin = {}));
cc.Enum(r);
var def_BaseUI = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.cache = false;
    e.openAniType = r.None;
    e.bgOpacity = 200;
    e.uid = "UINone";
    e.resArray = [];
    e.eventList = [];
    e.isclose = false;
    e.fromId = "UINone";
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {};
  _ctor.prototype.refreshUI = function () {};
  _ctor.prototype.init = function () {
    this.isclose = false;
  };
  _ctor.prototype.onOpen = function () {};
  _ctor.prototype.onClose = function () {};
  _ctor.prototype.onToggleHide = function () {};
  _ctor.prototype.onToggleShow = function () {};
  _ctor.prototype.addEvent = function (t, e) {
    $z1EventMgr.EventMgr.getInstance().on(t, this, e);
    var n = new Map();
    n.set(t, e);
    this.eventList.push(n);
  };
  _ctor.prototype.sendEvent = function (t, e, n, i, a, o) {
    $z1EventMgr.EventMgr.getInstance().emit(t, e, n, i, a, o);
  };
  _ctor.prototype.getUid = function () {
    return this.uid;
  };
  _ctor.prototype.onOpened = function () {
    this.isclose = false;
  };
  _ctor.prototype.setUid = function (t) {
    this.uid = t;
  };
  _ctor.prototype.openAni = function (t) {
    var e = this;
    if (this.openAniType == r.Pop) {
      this.node.active = true;
      var n = this.node.getChildByName("bg");
      if (n) {
        n.opacity = 0;
        cc.tween(n).to(.2, {
          opacity: this.bgOpacity
        }).start();
      }
      var i = this.node.getChildByName("root");
      if (i) {
        var a = i.scale;
        var o = $z1TweenMgr.TweenMgr.getInstance().getTween(i);
        var s = i.getComponent(cc.Widget);
        i.scale = 0;
        s && s.updateAlignment();
        $z1TweenMgr.TweenMgr.getInstance().popOpenAin(o, function () {
          i.scale != a && cc.tween(i).to(.15, {
            scale: a
          }).start();
          e.onOpen();
          t && t();
        });
      } else {
        this.node.active = true;
        this.onOpen();
        t && t();
      }
    } else {
      this.node.active = true;
      this.onOpen();
      t && t();
    }
  };
  _ctor.prototype.closeAni = function (t) {
    if (this.openAniType == r.None) {
      t();
    } else if (this.openAniType == r.Pop) {
      var e = this.node.getChildByName("bg");
      if (e) {
        e.opacity = this.bgOpacity;
        cc.tween(e).to(.4, {
          opacity: 0
        }).start();
      }
      var n = this.node.getChildByName("root");
      if (n) {
        var i = $z1TweenMgr.TweenMgr.getInstance().getTween(n);
        $z1TweenMgr.TweenMgr.getInstance().popCloseAin(i, function () {
          t();
        });
      } else {
        t();
      }
    }
  };
  _ctor.prototype.openUI = function (t, e, n, i, a, o) {
    $z1UIMgr.UIMgr.getInstance().openUI(t, this.uid, e, n, i, a, o);
  };
  _ctor.prototype.openUICallBack = function (t, e, n, i, a, o, r) {
    $z1UIMgr.UIMgr.getInstance().openUIOfCallback(t, this.uid, e, n, i, a, o, r);
  };
  _ctor.prototype.closeUI = function (t, e, n, i, a) {
    var o = this;
    if (this.eventList && this.eventList.length > 0) {
      for (var r = 0; r < this.eventList.length; r++) {
        this.eventList[r].forEach(function (t, e) {
          $z1EventMgr.EventMgr.getInstance().off(e, o, t);
        });
      }
    }
    this.isclose = true;
    this.release();
    this.scheduleOnce(function () {
      $z1UIMgr.UIMgr.getInstance().closeUI(o.node, t, e, n, i, a);
    });
  };
  _ctor.prototype.closeNotAni = function (t, e, n, i, a) {
    this.openAniType = r.None;
    this.closeUI(t, e, n, i, a);
  };
  _ctor.prototype.loadSpriteFrame = function () {
    var t = this;
    var e = $z1ArgsParseUtils.ArgsParseUtils._makeloadSpriteFrameResrgs.apply(this, arguments);
    var n = e.bundle;
    var i = e.path;
    var a = e.callback;
    var o = true;
    var r = e.saveKey;
    if (i.startsWith("http")) {
      if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE) {
        console.log("进来了头像：", i);
        cc.assetManager.loadRemote(i, {
          ext: ".head"
        }, function (e, n) {
          if (!t.isclose && !e) {
            console.log("头像下载成功：", i);
            var o = new cc.SpriteFrame(n);
            a(o);
          }
        });
      } else {
        cc.assetManager.loadRemote(i, function (e, n) {
          if (!t.isclose && !e) {
            var i = new cc.SpriteFrame(n);
            a(i);
          }
        });
      }
    } else {
      $z1ResourceMgr.ResourceMgr.getInstance().loadSpriteframe(n, i, function (e) {
        o && t.addRes(n, i, cc.SpriteFrame);
        t.isclose || a(e);
      }, o, e.cacheTme, r);
    }
  };
  _ctor.prototype.loadRemoteSpriteFrame = function (t, e, n, i) {
    var a = this;
    undefined === n && (n = true);
    undefined === i && (i = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadRemoteSpriteFrame(t, function (i) {
      n && a.addRes("", t, cc.SpriteFrame);
      a.isclose || e(i);
    }, n, i);
  };
  _ctor.prototype.loadPrefab = function (t, e, n, i, a) {
    var o = this;
    undefined === i && (i = true);
    undefined === a && (a = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes(t, e, cc.Prefab, function (a) {
      i && o.addRes(t, e, cc.Prefab);
      o.isclose || n(a);
    }, i, a);
  };
  _ctor.prototype.loadTexture2D = function (t, e, n, i, a) {
    var o = this;
    undefined === i && (i = true);
    undefined === a && (a = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes(t, e, cc.Texture2D, function (a) {
      i && o.addRes(t, e, cc.Texture2D);
      o.isclose || n(a);
    }, i, a);
  };
  _ctor.prototype.loadResFromBundle = function () {
    var t = this;
    var e = $z1ArgsParseUtils.ArgsParseUtils._makeLoadResArgs.apply(this, arguments);
    var n = e.bundle;
    var i = e.path;
    var a = e.callback;
    var o = true;
    var r = e.type;
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes(n, i, r, function (e) {
      o && t.addRes(n, i, r);
      t.isclose || a(e);
    }, o, e.cacheTme, e.saveKey);
  };
  _ctor.prototype.loadFromRes = function (t, e, n, i) {
    var a = this;
    undefined === i && (i = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadFromRes(t, e, function (i) {
      a.addRes("", t, e);
      a.isclose || n(i);
    });
  };
  _ctor.prototype.addRes = function (t, e, n) {
    if (this.resArray) {
      var i = $z1ResCacheMgr.ResCacheMgr.getInstance().isExistKey(t + "/" + e, n.name, this.resArray);
      if (-1 != i) {
        this.resArray[i].defCount || (this.resArray[i].defCount = 0);
        this.resArray[i].defCount++;
      } else {
        var a = new $z1ResourceMgr.ResCacheKey(t, e, n);
        this.resArray.push(a);
      }
    }
  };
  _ctor.prototype.release = function () {
    if (!this.cache && this.resArray) {
      $z1ResCacheMgr.ResCacheMgr.getInstance().refreshTime(this.resArray);
      this.resArray = [];
    }
  };
  _ctor.prototype.setListenerUI = function () {};
  _ctor.prototype.onDestroy = function () {
    var t = this;
    if (this.eventList && this.eventList.length > 0) {
      for (var e = 0; e < this.eventList.length; e++) {
        this.eventList[e].forEach(function (e, n) {
          $z1EventMgr.EventMgr.getInstance().off(n, t, e);
        });
      }
      this.eventList = null;
    }
    this.isclose = true;
    this.release();
  };
  _ctor.prototype.T = function (t) {
    return $z1LanguageMgr.LanguageMgr.getInstance().token(t);
  };
  _ctor.prototype.getImgstr = function (t) {
    return $z1LanguageMgr.LanguageMgr.getInstance().getImgstr(t);
  };
  cc__decorate([ccp_property({
    displayName: "是否需要缓存"
  })], _ctor.prototype, "cache", undefined);
  cc__decorate([ccp_property({
    type: r,
    tooltip: "注意：主节点下只需bg 和 root",
    displayName: "打开动画"
  })], _ctor.prototype, "openAniType", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_BaseUI;
