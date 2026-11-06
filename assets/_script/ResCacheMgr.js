var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ResCacheMgr = undefined;
var $z1BaseMgr = require("BaseMgr");
var $z1TimeUtils = require("TimeUtils");
var $z1UIUtils = require("UIUtils");
var $z1ResourceMgr = require("ResourceMgr");
var exp_ResCacheMgr = function (t) {
  function _ctor() {
    var e = t.call(this) || this;
    e.temporaryCache = [];
    e.permanentCache = [];
    e.isStartDecRef = false;
    e.assetsLifeTime = 5;
    e.permanentCacheKeyMap = new Map();
    e.depsdeps = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.init = function () {
    this.startDecRef();
  };
  _ctor.prototype.startDecRef = function () {
    if (!this.isStartDecRef) {
      this.isStartDecRef = true;
      $z1UIUtils.UIUtils.schedule(this.autoRelease, this, 1);
    }
  };
  _ctor.prototype.autoRelease = function () {
    var t = $z1TimeUtils.TimeUtils.GetTimeBySecond();
    for (var e = 0; e < this.temporaryCache.length; e++) {
      var n = this.temporaryCache[e];
      if (n && t - n.releaseTime >= n.cacheTime) {
        if (n.defCount <= 0) {
          continue;
        }
        var i = n.defCount;
        for (var a = 0; a < i; a++) {
          n.asset.decRef();
          if (n.asset.refCount <= 0) {
            this.temporaryCache.splice(e, 1);
            e--;
            n.defCount = 0;
            break;
          }
        }
        n.asset.refCount > 0 && (n.releaseTime = $z1TimeUtils.TimeUtils.GetTimeBySecond() + 86400);
      } else if (n && 0 == n.asset.refCount) {
        this.temporaryCache.splice(e, 1);
        e--;
        n.defCount = 0;
      }
    }
  };
  _ctor.prototype.refreshTime = function (t) {
    var e = $z1TimeUtils.TimeUtils.GetTimeBySecond();
    for (var n = 0; n < t.length; n++) {
      for (var i = 0; i < this.temporaryCache.length; i++) {
        var a = t[n];
        var o = this.temporaryCache[i];
        if (a.cachekey == o.cachekey && a.type == o.type) {
          this.temporaryCache[i].releaseTime = e;
          this.temporaryCache[i].defCount += a.defCount;
          this.temporaryCache[i].canRelease = false;
          break;
        }
      }
    }
  };
  _ctor.prototype.addAssets = function (t, e) {
    if (t && t.asset) {
      var n = e ? this.temporaryCache : this.permanentCache;
      var i = this.isExistKey(t.cachekey, t.type, n);
      if (-1 == i) {
        n.push(t);
      } else {
        n[i] = t;
      }
    }
  };
  _ctor.prototype.addAssetKeyToMap = function (t, e, n, i) {
    var a = this.permanentCacheKeyMap.get(t);
    var o = new $z1ResourceMgr.ResCacheKey(e, n, i);
    if (a && a.length > 0) {
      a.push(o);
    } else {
      var r = [];
      r.push(o);
      this.permanentCacheKeyMap.set(t, r);
    }
  };
  _ctor.prototype.releaseAssetsFromMap = function (t) {
    var e = this.permanentCacheKeyMap.get(t);
    if (e && e.length > 0) {
      for (var n = 0; n < e.length; n++) {
        for (var i = 0; i < this.permanentCache.length; i++) {
          var a = this.permanentCache[i];
          if (a && a.cachekey == e[n].cachekey && a.type == e[n].type) {
            a.asset.decRef();
            if (a.asset.refCount <= 0) {
              this.permanentCache.splice(i, 1);
              i--;
            }
            break;
          }
        }
      }
    }
  };
  _ctor.prototype.getAssets = function () {
    return null;
  };
  _ctor.prototype.isExistKey = function (t, e, n) {
    for (var i = 0; i < n.length; i++) {
      var a = n[i];
      if (a && a.cachekey == t && a.type == e) {
        return i;
      }
    }
    return -1;
  };
  _ctor.prototype.visitAsset = function (t, e) {
    if (t._uuid) {
      e.push(t._uuid);
    } else if (t instanceof cc.SpriteFrame) {
      var n;
      var i = t;
      if (i._original) {
        (n = i._original._texture) && e.push(n._uuid);
      } else {
        (n = i.getTexture()) && e.push(n._uuid);
      }
    }
  };
  _ctor.prototype.visitComponent = function (t, e) {
    var n = Object.getOwnPropertyNames(t);
    for (var i = 0; i < n.length; i++) {
      var a = n[i];
      if ("node" !== a && "__eventTargets" !== a) {
        var o = t[a];
        if (o instanceof cc.NodePool) {
          this.visitNodePool(o, e);
        } else if ("object" == typeof o && o) {
          if (Array.isArray(o)) {
            for (var r = 0; r < o.length; r++) {
              (l = o[r]) instanceof cc.Asset && this.visitAsset(l, e);
            }
          } else if (o.constructor && o.constructor !== Object) {
            o instanceof cc.Asset && this.visitAsset(o, e);
          } else {
            var s = Object.getOwnPropertyNames(o);
            for (r = 0; r < s.length; r++) {
              var l;
              (l = o[s[r]]) instanceof cc.Asset && this.visitAsset(l, e);
            }
          }
        }
      }
    }
  };
  _ctor.prototype.visitNode = function (t, e) {
    for (var n = 0; n < t._components.length; n++) {
      this.visitComponent(t._components[n], e);
    }
    for (n = 0; n < t._children.length; n++) {
      this.visitNode(t._children[n], e);
    }
  };
  _ctor.prototype.visitNodePool = function (t, e) {
    var n = t._pool;
    for (var i = 0; i < n.length; i++) {
      var a = n[i];
      this.visitNode(a, e);
    }
  };
  _ctor.instance = null;
  return _ctor;
}($z1BaseMgr.default);
exports.ResCacheMgr = exp_ResCacheMgr;