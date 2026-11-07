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
    for (var e = this.temporaryCache.length - 1; e >= 0; e--) {
      var n = this.temporaryCache[e];
      if (!n || !cc.isValid(n.asset) || n.asset.refCount <= 0) {
        if (n && n.releaseDependency) n.releaseDependency();
        this.temporaryCache.splice(e, 1);
        continue;
      }
      if (t - n.releaseTime >= n.cacheTime && n.defCount > 0) {
        var i = n.defCount;
        // Each closed owner contributes release credits exactly once. A live
        // owner may still hold the same asset after those credits are consumed.
        n.defCount = 0;
        for (var a = 0; a < i; a++) {
          n.asset.decRef();
          if (n.asset.refCount <= 0) {
            if (n.releaseDependency) n.releaseDependency();
            this.temporaryCache.splice(e, 1);
            break;
          }
        }
      }
    }
  };
  _ctor.prototype.refreshTime = function (t) {
    var e = $z1TimeUtils.TimeUtils.GetTimeBySecond();
    for (var n = 0; n < t.length; n++) {
      for (var i = 0; i < this.temporaryCache.length; i++) {
        var a = t[n];
        var o = this.temporaryCache[i];
        if (a.cachekey == o.cachekey && a.type == o.type && (!a.asset || a.asset === o.asset)) {
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
      var i = this.isExistKey(t.cachekey, t.type, n, t.asset);
      if (-1 == i) {
        n.push(t);
      } else {
        // A cache hit or concurrent load must not erase pending owner releases.
        n[i].cacheTime = Math.max(n[i].cacheTime, t.cacheTime);
      }
    }
  };
  _ctor.prototype.addAssetKeyToMap = function (t, e, n, i, asset) {
    var a = this.permanentCacheKeyMap.get(t);
    var o = new $z1ResourceMgr.ResCacheKey(e, n, i, asset);
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
    this.permanentCacheKeyMap.delete(t);
    if (e && e.length > 0) {
      for (var n = 0; n < e.length; n++) {
        for (var i = 0; i < this.permanentCache.length; i++) {
          var a = this.permanentCache[i];
          if (a && a.cachekey == e[n].cachekey && a.type == e[n].type && (!e[n].asset || e[n].asset === a.asset)) {
            a.asset.decRef();
            if (a.asset.refCount <= 0) {
              if (a.releaseDependency) a.releaseDependency();
              this.permanentCache.splice(i, 1);
              i--;
            }
            break;
          }
        }
      }
    }
  };
  _ctor.prototype.getAssets = function (bundle, path, type, temporary) {
    var key = bundle + "/" + path;
    var name = cc.js.getClassName(type);
    var first = temporary ? this.temporaryCache : this.permanentCache;
    var second = temporary ? this.permanentCache : this.temporaryCache;
    for (var group = 0; group < 2; group++) {
      var entries = group ? second : first;
      for (var i = entries.length - 1; i >= 0; i--) {
        var entry = entries[i];
        if (entry.cachekey === key && entry.type === name && cc.isValid(entry.asset) && !(entry.asset.refCount <= 0)) return entry;
      }
    }
    return null;
  };
  _ctor.prototype.isExistKey = function (t, e, n, asset) {
    for (var i = 0; i < n.length; i++) {
      var a = n[i];
      if (a && a.cachekey == t && a.type == e && (!asset || a.asset === asset)) {
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
