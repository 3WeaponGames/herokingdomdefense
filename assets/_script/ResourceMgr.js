Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ResourceMgr = exports.BundleCache = exports.ResCacheKey = exports.ResCache = undefined;
var $z1BasePlatform = require("BasePlatform");
var $z1ArgsParseUtils = require("ArgsParseUtils");
var $z1TimeUtils = require("TimeUtils");
var $z1LogMgr = require("LogMgr");
var $z1PlatformManager = require("PlatformManager");
var $z1PoolMgr = require("PoolMgr");
var $z1ResCacheMgr = require("ResCacheMgr");
var exp_ResCache = function () {
  function _ctor(t, e, n, i, a, r) {
    this.releaseTime = n;
    this.cacheTime = i;
    this.asset = r;
    this.type = cc.js.getClassName(a);
    this.cachekey = t + "/" + e;
    this.defCount = 0;
    this.lifeTime = 3;
    this.createTime = $z1TimeUtils.TimeUtils.GetTimeBySecond();
    this.canRelease = true;
  }
  _ctor.prototype.setLifeTime = function (t) {
    this.lifeTime = t;
  };
  return _ctor;
}();
exports.ResCache = exp_ResCache;
exports.ResCacheKey = function (t, e, n) {
  this.defCount = 0;
  this.type = cc.js.getClassName(n);
  this.cachekey = t + "/" + e;
  this.defCount = 1;
};
exports.BundleCache = function (t, e, n) {
  this.bundleName = t;
  this.dateTime = e;
  this.cacheTime = n;
};
var exp_ResourceMgr = function () {
  function t() {}
  t.getInstance = function () {
    null == this.instance && (this.instance = new t());
    return this.instance;
  };
  t.prototype.getBundle = function (t) {
    return cc.assetManager.getBundle(t);
  };
  t.prototype.loadBundle = function (t, e) {
    var n = cc.assetManager.getBundle(t);
    if (null == n) {
      cc.assetManager.loadBundle(t, function (n, i) {
        if (n) {
          $z1LogMgr.LogMgr.getInstance().error(t + "bundle load error :" + n);
        } else {
          $z1LogMgr.LogMgr.getInstance().debug("加载bundle:" + t);
          e(i);
        }
      });
    } else {
      e(n);
    }
  };
  t.prototype.preloadFromBundle = function (t, e, n) {
    t.preload(e, cc.Asset, function (t, e) {
      n && n(t, e);
    });
  };
  t.prototype.preload = function (t, e) {
    var n = cc.assetManager.getBundle(t);
    if (n) {
      e && n.preload(e);
    } else {
      cc.assetManager.loadBundle(t, function (t, n) {
        t || e && n.preload(e);
      });
    }
  };
  t.prototype.getNode = function (e, n, i, a) {
    var o = $z1PoolMgr.PoolMgr.getInstance().getNode(e);
    if (o && o.isValid) {
      a && a(o);
    } else {
      t.instance.loadRes(n, i, cc.Prefab, function (t) {
        var n = cc.instantiate(t.data);
        $z1PoolMgr.PoolMgr.getInstance().checkHasPool(e) || $z1PoolMgr.PoolMgr.getInstance().creatrePool(e, cc.instantiate(n), 1);
        a && a(n);
      });
    }
  };
  t.prototype.relLoadBundle = function (t, e) {
    var n = function (n) {
      var a = t[n];
      i.loadBundle(a, function (t) {
        if (e) {
          var i = e.get(n);
          t.load(i);
        }
      });
    };
    var i = this;
    for (var a = 0; a < t.length; a++) {
      n(a);
    }
  };
  t.prototype.loadFromRes = function (t, e, n) {
    this.loadRes("resources", t, e, n);
  };
  t.prototype.loadDirFrom = function (t, e) {
    this.loadDir("resources", t, e);
  };
  t.prototype.loadSpriteframe = function () {
    var e = $z1ArgsParseUtils.ArgsParseUtils._makeloadSpriteFrameResrgs.apply(this, arguments);
    var n = e.bundle;
    var i = e.path;
    var s = e.callback;
    var l = e.saveKey;
    var g = $z1TimeUtils.TimeUtils.GetTimeBySecond() + 86400;
    var u = $z1ResCacheMgr.ResCacheMgr.getInstance().getAssets(n, i, cc.SpriteFrame);
    if (u && u.asset) {
      u.asset.addRef();
      u.releaseTime = g;
      return void s(u.asset);
    }
    var d = cc.assetManager.getBundle(n);
    var p = new exp_ResCache(n, i, g, e.cacheTme, cc.SpriteFrame);
    if (null == d) {
      t.getInstance().loadBundle(n, function (t) {
        t.load(i, cc.SpriteFrame, function (t, a) {
          if (t) {
            $z1LogMgr.LogMgr.getInstance().error("loadres error path:" + i + "  error:", t.message);
          } else {
            a.addRef();
            p.asset = a;
            $z1ResCacheMgr.ResCacheMgr.getInstance().addAssets(p, e.autoRelese);
            l && $z1ResCacheMgr.ResCacheMgr.getInstance().addAssetKeyToMap(l, n, i, cc.SpriteFrame);
            s && s(a);
          }
        });
      });
    } else {
      d.load(i, cc.SpriteFrame, function (t, a) {
        if (t) {
          $z1LogMgr.LogMgr.getInstance().error("loadres error path:" + i + "  error:" + t);
        } else {
          a.addRef();
          p.asset = a;
          $z1ResCacheMgr.ResCacheMgr.getInstance().addAssets(p, e.autoRelese);
          l && $z1ResCacheMgr.ResCacheMgr.getInstance().addAssetKeyToMap(l, n, i, cc.SpriteFrame);
          s && s(a);
        }
      });
    }
  };
  t.prototype.loadRemoteSpriteFrame = function (t, e, n, a) {
    undefined === n && (n = false);
    undefined === a && (a = 10);
    var r = $z1TimeUtils.TimeUtils.GetTimeBySecond() + 86400;
    var l = $z1ResCacheMgr.ResCacheMgr.getInstance().getAssets("", t, cc.Texture2D);
    if (l && l.asset) {
      l.asset.addRef();
      l.releaseTime = r;
      return void e(l.asset);
    }
    var g = new exp_ResCache("", t, r, a, cc.Texture2D);
    if (t.startsWith("http")) {
      if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE) {
        cc.assetManager.loadRemote(t, {
          ext: ".head"
        }, function (t, i) {
          if (!t) {
            i.addRef();
            g.asset = i;
            $z1ResCacheMgr.ResCacheMgr.getInstance().addAssets(g, n);
            var a = new cc.SpriteFrame(i);
            e(a);
          }
        });
      } else {
        cc.assetManager.loadRemote(t, function (t, i) {
          if (!t) {
            i.addRef();
            g.asset = i;
            $z1ResCacheMgr.ResCacheMgr.getInstance().addAssets(g, n);
            var a = new cc.SpriteFrame(i);
            e(a);
          }
        });
      }
    }
  };
  t.prototype.loadRes = function () {
    var e = $z1ArgsParseUtils.ArgsParseUtils._makeLoadResArgs.apply(this, arguments);
    var n = e.bundle;
    var i = e.path;
    var s = e.type;
    var l = e.callback;
    var g = e.saveKey;
    if ("cc.Asset" != cc.js.getClassName(s)) {
      var u = $z1TimeUtils.TimeUtils.GetTimeBySecond() + 86400;
      var d = $z1ResCacheMgr.ResCacheMgr.getInstance().getAssets(n, i, s);
      if (d && d.asset) {
        d.asset.addRef();
        d.releaseTime = u;
        return void l(d.asset);
      }
      var p = cc.assetManager.getBundle(n);
      var f = new exp_ResCache(n, i, u, e.cacheTme, s);
      if (null == p) {
        t.getInstance().loadBundle(n, function (t) {
          t.load(i, s, function (t, a) {
            if (t) {
              $z1LogMgr.LogMgr.getInstance().error("loadres error path:" + i + "  error:", t.message);
            } else {
              a.addRef();
              f.asset = a;
              $z1ResCacheMgr.ResCacheMgr.getInstance().addAssets(f, e.autoRelese);
              g && $z1ResCacheMgr.ResCacheMgr.getInstance().addAssetKeyToMap(g, n, i, s);
              l && l(a);
            }
          });
        });
      } else {
        p.load(i, s, function (t, a) {
          if (t) {
            $z1LogMgr.LogMgr.getInstance().error("loadres error path:" + i + "  error:" + t);
          } else {
            a.addRef();
            f.asset = a;
            $z1ResCacheMgr.ResCacheMgr.getInstance().addAssets(f, e.autoRelese);
            g && $z1ResCacheMgr.ResCacheMgr.getInstance().addAssetKeyToMap(g, n, i, s);
            l && l(a);
          }
        });
      }
    } else {
      console.error("请传入具体资源类型，不能是基类asset,路径:", n + "/" + i);
    }
  };
  t.prototype.loadDir = function (t, e, n) {
    var i = cc.assetManager.getBundle(t);
    if (null == i) {
      cc.assetManager.loadBundle(t, function (t, i) {
        i.loadDir(e, cc.Asset, function (t, i) {
          if (t) {
            $z1LogMgr.LogMgr.getInstance().error("loadres error path:" + e + "  error:" + t);
          } else {
            n && n(i);
          }
        });
      });
    } else {
      i.loadDir(e, cc.Asset, function (t, i) {
        if (t) {
          $z1LogMgr.LogMgr.getInstance().error("loadres error path:" + e + "  error:" + t);
        } else {
          n && n(i);
        }
      });
    }
  };
  t.prototype.releaseByBundle = function (t, e) {
    t.release(e);
  };
  t.prototype.releaseByBname = function (t, e) {
    var n = cc.assetManager.getBundle(t);
    n && n.release(e);
  };
  t.prototype.releaseBundle = function (t) {
    var e = cc.assetManager.getBundle(t);
    e && cc.assetManager.removeBundle(e);
  };
  t.instance = null;
  return t;
}();
exports.ResourceMgr = exp_ResourceMgr;