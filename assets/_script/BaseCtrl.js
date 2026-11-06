var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1EventMgr = require("EventMgr");
var $z1LanguageMgr = require("LanguageMgr");
var $z1ResCacheMgr = require("ResCacheMgr");
var $z1ResourceMgr = require("ResourceMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_BaseCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.cache = false;
    e.resArray = [];
    e.eventList = [];
    e.isDestroy = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {};
  _ctor.prototype.addEvent = function (t, e) {
    $z1EventMgr.EventMgr.getInstance().on(t, this, e);
    var n = new Map();
    n.set(t, e);
    this.eventList.push(n);
  };
  _ctor.prototype.sendEvent = function (t, e, n, i, a, o) {
    $z1EventMgr.EventMgr.getInstance().emit(t, e, n, i, a, o);
  };
  _ctor.prototype.loadSpriteFrame = function (t, e, n, i, a) {
    var o = this;
    undefined === i && (i = true);
    undefined === a && (a = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadSpriteframe(t, e, function (a) {
      i && o.addRes(t, e, cc.SpriteFrame);
      o.isDestroy || n(a);
    }, i, a);
  };
  _ctor.prototype.loadRemoteSpriteFrame = function (t, e, n, i) {
    var a = this;
    undefined === n && (n = true);
    undefined === i && (i = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadRemoteSpriteFrame(t, function (i) {
      n && a.addRes("", t, cc.SpriteFrame);
      a.isDestroy || e(i);
    }, n, i);
  };
  _ctor.prototype.loadPrefab = function (t, e, n, i, a) {
    var o = this;
    undefined === i && (i = true);
    undefined === a && (a = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes(t, e, cc.Prefab, function (a) {
      i && o.addRes(t, e, cc.Prefab);
      o.isDestroy || n(a);
    }, i, a);
  };
  _ctor.prototype.loadTexture2D = function (t, e, n, i, a) {
    var o = this;
    undefined === i && (i = true);
    undefined === a && (a = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes(t, e, cc.Texture2D, function (a) {
      i && o.addRes(t, e, cc.Texture2D);
      o.isDestroy || n(a);
    }, i, a);
  };
  _ctor.prototype.loadResFromBundle = function (t, e, n, i, a, o) {
    var r = this;
    undefined === a && (a = true);
    undefined === o && (o = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes(t, e, n, function (o) {
      a && r.addRes(t, e, n);
      r.isDestroy || i(o);
    }, a, o);
  };
  _ctor.prototype.loadFromRes = function (t, e, n, i) {
    var a = this;
    undefined === i && (i = 10);
    $z1ResourceMgr.ResourceMgr.getInstance().loadFromRes(t, e, function (i) {
      a.addRes("", t, e);
      a.isDestroy || n(i);
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
    this.isDestroy = true;
    this.release();
  };
  _ctor.prototype.T = function (t) {
    return $z1LanguageMgr.LanguageMgr.getInstance().token(t);
  };
  _ctor.prototype.getImgstr = function (t) {
    return $z1LanguageMgr.LanguageMgr.getInstance().getImgstr(t);
  };
  cc__decorate([ccp_property({
    displayName: "是否需要缓存资源"
  })], _ctor.prototype, "cache", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_BaseCtrl;
