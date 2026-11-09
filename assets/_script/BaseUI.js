var BattleSounds = require("BattleSounds");
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
var smoothScroll = require("SmoothScroll");
if (smoothScroll && smoothScroll.install) smoothScroll.install();
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
    e._resourceGeneration = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {};
  _ctor.prototype.refreshUI = function () {};
  _ctor.prototype.init = function () {
    this.onOpened();
  };
  _ctor.prototype.onOpen = function () {};
  _ctor.prototype.onClose = function () {};
  _ctor.prototype.onToggleHide = function () {};
  _ctor.prototype.onToggleShow = function () {};
  _ctor.prototype.addEvent = function (t, e) {
    if (this.isclose || !this.eventList) return;
    $z1EventMgr.EventMgr.getInstance().on(t, this, e);
    for (var index = 0; index < this.eventList.length; index++) {
      if (this.eventList[index].get(t) === e) return;
    }
    var n = new Map();
    n.set(t, e);
    this.eventList.push(n);
  };
  _ctor.prototype.offEvents = function (dispose) {
    var target = this;
    (this.eventList || []).forEach(function (bindings) {
      bindings.forEach(function (callback, name) {
        $z1EventMgr.EventMgr.getInstance().off(name, target, callback);
      });
    });
    if (dispose) this.eventList = null;
  };
  _ctor.prototype.sendEvent = function (t, e, n, i, a, o) {
    $z1EventMgr.EventMgr.getInstance().emit(t, e, n, i, a, o);
  };
  _ctor.prototype.getUid = function () {
    return this.uid;
  };
  _ctor.prototype.onOpened = function () {
    this.isclose = false;
    this._resourceGeneration++;
    this._decisionCompleted = false;
    this._decisionPending = false;
    if (BattleSounds.ui) BattleSounds.ui("ui-panel-open", this);
    var target = this;
    (this.eventList || []).forEach(function (bindings) {
      bindings.forEach(function (callback, name) {
        $z1EventMgr.EventMgr.getInstance().on(name, target, callback);
      });
    });
  };
  _ctor.prototype.finishDecision = function (callback, value, generation) {
    if (this.isclose || this._decisionCompleted || !cc.isValid(this) || generation !== undefined && generation !== this._resourceGeneration) return false;
    this._decisionCompleted = true;
    try {
      if (callback) callback(value);
      if (BattleSounds.ui && value !== false && (!Array.isArray(value) || value.length)) BattleSounds.ui("ui-selection-confirm", this);
    }
    finally { this.closeUI(); }
    return true;
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
          try { if (!e.isclose) e.onOpen(); }
          finally { t && t(); }
        });
      } else {
        this.node.active = true;
        try { if (!this.isclose) this.onOpen(); }
        finally { t && t(); }
      }
    } else {
      this.node.active = true;
      try { if (!this.isclose) this.onOpen(); }
      finally { t && t(); }
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
  _ctor.prototype.openRequiredUI = function (uid, onOpened, a, b, c, d, e) {
    return $z1UIMgr.UIMgr.getInstance().openUIWithOwner(uid, this.uid, {
      parent: this,
      recoveryCancelAllowed: false,
      isCurrent: this.resourceOptions(this._resourceGeneration).isCurrent,
      onOpened: onOpened
    }, a, b, c, d, e);
  };
  _ctor.prototype.cancelPendingOpens = function () {
    if (!this._pendingUIOpens || !this._pendingUIOpens.size) return;
    var firstError;
    Array.from(this._pendingUIOpens).forEach(function (owner) {
      try { owner.cancel(); } catch (error) { if (!firstError) firstError = error; }
    });
    if (firstError) throw firstError;
  };
  _ctor.prototype.closeUI = function (t, e, n, i, a) {
    var o = this;
    if (this.isclose) return;
    if (BattleSounds.ui) BattleSounds.ui("ui-panel-close", this, true);
    this.isclose = true;
    this._resourceGeneration++;
    var releaseError = null;
    try { if (this._releaseOpeningInput) this._releaseOpeningInput(); }
    catch (error) { releaseError = error; }
    try { this.cancelPendingOpens(); }
    catch (error) { if (!releaseError) releaseError = error; }
    this.offEvents(false);
    this.release();
    var generation = this._resourceGeneration;
    this.scheduleOnce(function () {
      if (o.isclose && generation === o._resourceGeneration) $z1UIMgr.UIMgr.getInstance().closeUI(o.node, t, e, n, i, a);
    });
    if (releaseError) throw releaseError;
  };
  _ctor.prototype.closeNotAni = function (t, e, n, i, a) {
    this.openAniType = r.None;
    this.closeUI(t, e, n, i, a);
  };
  _ctor.prototype.resourceOptions = function (generation) {
    var owner = this;
    return { isCurrent: function () { return !owner.isclose && generation === owner._resourceGeneration && cc.isValid(owner, true); } };
  };
  _ctor.prototype.loadSpriteFrame = function () {
    var t = this;
    var generation = this._resourceGeneration;
    var e = $z1ArgsParseUtils.ArgsParseUtils._makeloadSpriteFrameResrgs.apply(this, arguments);
    if (!e) return;
    var n = e.bundle;
    var i = e.path;
    var a = e.callback;
    var o = true;
    var r = e.saveKey;
    if (i.startsWith("http")) {
      this.loadRemoteSpriteFrame(i, a, true, e.cacheTme);
    } else {
      $z1ResourceMgr.ResourceMgr.getInstance().loadSpriteframe(n, i, function (e) {
        o && t.addRes(n, i, cc.SpriteFrame, e, generation);
        if (!t.isclose && generation === t._resourceGeneration && a) a(e);
      }, o, e.cacheTme, r, this.resourceOptions(generation));
    }
  };
  _ctor.prototype.loadRemoteSpriteFrame = function (t, e, n, i) {
    var a = this;
    var generation = this._resourceGeneration;
    undefined === n && (n = true);
    undefined === i && (i = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadRemoteSpriteFrame(t, function (i) {
      n && a.addRes("", t, cc.SpriteFrame, i, generation);
      if (!a.isclose && generation === a._resourceGeneration && e) e(i);
    }, n, i, this.resourceOptions(generation));
  };
  _ctor.prototype.loadPrefab = function (t, e, n, i, a) {
    var o = this;
    var generation = this._resourceGeneration;
    undefined === i && (i = true);
    undefined === a && (a = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes(t, e, cc.Prefab, function (a) {
      i && o.addRes(t, e, cc.Prefab, a, generation);
      if (!o.isclose && generation === o._resourceGeneration && n) n(a);
    }, i, a, this.resourceOptions(generation));
  };
  _ctor.prototype.loadTexture2D = function (t, e, n, i, a) {
    var o = this;
    var generation = this._resourceGeneration;
    undefined === i && (i = true);
    undefined === a && (a = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes(t, e, cc.Texture2D, function (a) {
      i && o.addRes(t, e, cc.Texture2D, a, generation);
      if (!o.isclose && generation === o._resourceGeneration && n) n(a);
    }, i, a, this.resourceOptions(generation));
  };
  _ctor.prototype.loadResFromBundle = function () {
    var t = this;
    var generation = this._resourceGeneration;
    var e = $z1ArgsParseUtils.ArgsParseUtils._makeLoadResArgs.apply(this, arguments);
    if (!e) return;
    var n = e.bundle;
    var i = e.path;
    var a = e.callback;
    var o = true;
    var r = e.type;
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes(n, i, r, function (e) {
      o && t.addRes(n, i, r, e, generation);
      if (!t.isclose && generation === t._resourceGeneration && a) a(e);
    }, o, e.cacheTme, e.saveKey, this.resourceOptions(generation));
  };
  _ctor.prototype.loadFromRes = function (t, e, n, i) {
    var a = this;
    var generation = this._resourceGeneration;
    undefined === i && (i = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes("resources", t, e, function (asset) {
      a.addRes("resources", t, e, asset, generation);
      if (!a.isclose && generation === a._resourceGeneration && n) n(asset);
    }, true, i, this.resourceOptions(generation));
  };
  _ctor.prototype.addRes = function (t, e, n, asset, generation) {
    if (this.isclose || generation !== undefined && generation !== this._resourceGeneration) {
      $z1ResCacheMgr.ResCacheMgr.getInstance().refreshTime([new $z1ResourceMgr.ResCacheKey(t, e, n, asset)]);
      return;
    }
    if (this.resArray) {
      var i = $z1ResCacheMgr.ResCacheMgr.getInstance().isExistKey(t + "/" + e, cc.js.getClassName(n), this.resArray, asset);
      if (-1 != i) {
        this.resArray[i].defCount || (this.resArray[i].defCount = 0);
        this.resArray[i].defCount++;
      } else {
        var a = new $z1ResourceMgr.ResCacheKey(t, e, n, asset);
        this.resArray.push(a);
      }
    }
  };
  _ctor.prototype.release = function (force) {
    if ((!this.cache || force) && this.resArray) {
      $z1ResCacheMgr.ResCacheMgr.getInstance().refreshTime(this.resArray);
      this.resArray = [];
    }
  };
  _ctor.prototype.setListenerUI = function () {};
  _ctor.prototype.onDestroy = function () {
    this.isclose = true;
    this._resourceGeneration++;
    this.offEvents(true);
    try { this.cancelPendingOpens(); }
    finally { try { if (this._releaseOpeningInput) this._releaseOpeningInput(); } finally { this.release(true); } }
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
