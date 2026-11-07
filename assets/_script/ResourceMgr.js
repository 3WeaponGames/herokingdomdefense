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
exports.ResCacheKey = function (t, e, n, asset) {
  this.defCount = 0;
  this.type = cc.js.getClassName(n);
  this.cachekey = t + "/" + e;
  this.defCount = 1;
  this.asset = asset;
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
  // Loading handles startup failures. After startup, every request still has an
  // asset-free recovery path; do not leave a success-only continuation stranded.
  t.prototype.loadWithRecovery = function (name, operation, complete, onError, isCurrent) {
    var manager = this;
    var finished = false;
    var active = false;
    var timer = null;
    var cancel = function () {
      finished = true;
      active = false;
      clearTimeout(timer);
    };
    var retry = function () {
      if (finished || active) return;
      if (isCurrent && !isCurrent()) { cancel(); return; }
      active = true;
      var settled = false;
      timer = setTimeout(function () { done(new Error("Asset request timed out: " + name)); }, 30000);
      function done(error, asset) {
        if (settled || finished) return;
        settled = true;
        active = false;
        clearTimeout(timer);
        if (error || !asset) {
          if (isCurrent && !isCurrent()) { cancel(); return; }
          error = error || new Error("Asset request returned no asset: " + name);
          $z1LogMgr.LogMgr.getInstance().error("Asset load failed: " + name, error);
          if (manager.loadErrorHandler) manager.loadErrorHandler(error, retry);
          else if (onError) onError(error, retry, cancel);
          else manager.showRuntimeRecovery(error, retry, null, cancel);
        } else {
          finished = true;
          complete && complete(asset);
        }
      }
      try { operation(done); }
      catch (error) { if (settled) throw error; done(error); }
    };
    retry();
    return { retry: retry, cancel: cancel };
  };
  t.prototype.loadBundle = function (t, e, onError, isCurrent) {
    var n = cc.assetManager.getBundle(t);
    if (null == n) {
      return this.loadWithRecovery(t, function (done) { cc.assetManager.loadBundle(t, done); }, e, onError, isCurrent);
    } else {
      e && e(n);
    }
  };
  // This overlay uses built-in labels/graphics, so a missing prefab cannot prevent
  // recovery. Multiple simultaneous failures share one prompt and one pause owner.
  t.prototype.showRuntimeRecovery = function (error, retry, cancel, abandon, options) {
    var manager = this;
    this.runtimeFailures = this.runtimeFailures || [];
    if (!this.runtimeFailures.some(function (entry) { return entry.retry === retry; })) {
      this.runtimeFailures.push({ retry: retry, cancel: cancel, abandon: abandon,
        retryOnly: !!(options && options.retryOnly), isCurrent: options && options.isCurrent });
    }
    function retire() { manager.removeRuntimeRecovery(retry); }
    if (this.runtimeRecoveryNode && cc.isValid(this.runtimeRecoveryNode)) {
      this.refreshRuntimeRecovery();
      return retire;
    }
    var root = require("UIMgr").UIMgr.getInstance().uiRoot || cc.Canvas.instance && cc.Canvas.instance.node;
    if (!root || !cc.isValid(root)) throw new Error("Resource recovery needs an active UI root: " + error.message);
    var size = cc.winSize;
    var node = new cc.Node("ResourceRecovery");
    node.setContentSize(size.width, size.height);
    node.parent = root;
    node.zIndex = cc.macro.MAX_ZINDEX;
    node.addComponent(cc.BlockInputEvents);
    var background = node.addComponent(cc.Graphics);
    background.fillColor = new cc.Color(15, 22, 33, 245);
    background.rect(-size.width / 2, -size.height / 2, size.width, size.height);
    background.fill();
    var width = Math.min(620, size.width - 64);
    function label(name, key, y, height, fontSize) {
      var child = new cc.Node(name);
      child.parent = node;
      child.y = y;
      child.setContentSize(width, height);
      var text = child.addComponent(cc.Label);
      text.fontSize = fontSize;
      text.lineHeight = fontSize + 8;
      text.enableWrapText = true;
      text.overflow = cc.Label.Overflow.RESIZE_HEIGHT;
      text.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
      text.verticalAlign = cc.Label.VerticalAlign.CENTER;
      text.string = manager.runtimeRecoveryText(key);
      return text;
    }
    label("Message", "loading.runtimeFailed", 120, 180, 30);
    function button(name, key, y, action) {
      var text = label(name, key, y, 72, 30);
      text.overflow = cc.Label.Overflow.CLAMP;
      text.enableWrapText = false;
      text.node.height = 72;
      var surface = new cc.Node(name + "Background");
      surface.parent = node;
      surface.y = y;
      surface.setSiblingIndex(text.node.getSiblingIndex());
      var graphics = surface.addComponent(cc.Graphics);
      graphics.fillColor = new cc.Color(46, 85, 130, 255);
      graphics.roundRect(-width / 2, -40, width, 80, 12);
      graphics.fill();
      text.node.on(cc.Node.EventType.TOUCH_END, function (event) { event.stopPropagation(); action(); });
      if (name === "Cancel") manager.runtimeCancelSurface = surface;
      return text;
    }
    button("Retry", "loading.retry", -55, function () { manager.resolveRuntimeRecovery(true); });
    this.runtimeCancelLabel = button("Cancel", this.runtimeFailures.every(function (entry) { return !!entry.cancel; }) ? "loading.cancel" : "loading.reload", -160, function () { manager.resolveRuntimeRecovery(false); });
    this.runtimeRecoveryNode = node;
    this.refreshRuntimeRecovery();
    this.runtimePausedDirector = !cc.director.isPaused();
    if (this.runtimePausedDirector) cc.director.pause();
    return retire;
  };
  t.prototype.refreshRuntimeRecovery = function () {
    if (!this.runtimeCancelLabel) return;
    var entries = this.runtimeFailures || [];
    var canLeave = !entries.some(function (entry) { return entry.retryOnly; });
    this.runtimeCancelLabel.string = this.runtimeRecoveryText(entries.every(function (entry) { return !!entry.cancel; }) ? "loading.cancel" : "loading.reload");
    this.runtimeCancelLabel.node.active = canLeave;
    if (this.runtimeCancelSurface) this.runtimeCancelSurface.active = canLeave;
  };
  t.prototype.removeRuntimeRecovery = function (retry) {
    var entries = this.runtimeFailures || [];
    var index = entries.findIndex(function (entry) { return entry.retry === retry; });
    if (index < 0) return;
    entries.splice(index, 1);
    if (entries.length) this.refreshRuntimeRecovery();
    else this.closeRuntimeRecovery();
  };
  t.prototype.runtimeRecoveryText = function (key) {
    return require("LanguageMgr").LanguageMgr.getInstance().t(key);
  };
  t.prototype.closeRuntimeRecovery = function () {
    if (this.runtimeRecoveryNode && cc.isValid(this.runtimeRecoveryNode)) this.runtimeRecoveryNode.destroy();
    this.runtimeRecoveryNode = null;
    this.runtimeCancelLabel = null;
    this.runtimeCancelSurface = null;
    if (this.runtimePausedDirector) cc.director.resume();
    this.runtimePausedDirector = false;
  };
  t.prototype.resolveRuntimeRecovery = function (retry) {
    var manager = this, current = this.runtimeFailures || [], firstError = null;
    current.slice().forEach(function (entry) {
      if (!entry.isCurrent || entry.isCurrent()) return;
      manager.removeRuntimeRecovery(entry.retry);
      try { if (entry.cancel) entry.cancel(); }
      catch (error) { if (!firstError) firstError = error; }
    });
    // A required decision must remain available to the current battle. Its
    // owner can retire it explicitly when that battle closes or resets.
    if (!retry && current.some(function (entry) { return entry.retryOnly; })) {
      if (firstError) throw firstError;
      return false;
    }
    var failures = current.splice(0);
    this.closeRuntimeRecovery();
    if (!retry && failures.some(function (entry) { return !entry.cancel; })) {
      failures.forEach(function (entry) { if (entry.abandon) { try { entry.abandon(); } catch (error) { console.error(error); } } });
      // Browser restart only resets the scene in Creator 2.4, leaving game
      // singletons alive. A page reload resets those managers as well. Native
      // Creator overrides game.restart() with a complete JavaScript VM restart.
      if (typeof window !== "undefined" && window.location && typeof window.location.reload === "function") window.location.reload();
      else cc.game.restart();
      return;
    }
    failures.forEach(function (entry) {
      try { (retry ? entry.retry : entry.cancel)(); }
      catch (error) { if (!firstError) firstError = error; console.error(error); }
    });
    if (firstError) throw firstError;
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
        var pool = $z1PoolMgr.PoolMgr.getInstance();
        if (!pool.checkHasPool(e)) pool.creatrePool(e, t, 1, false);
        var node = pool.getNode(e);
        a && a(node);
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
    var args = Array.prototype.slice.call(arguments);
    var options = args.length && args[args.length - 1];
    if (options && typeof options === "object") args.pop(); else options = null;
    var e = $z1ArgsParseUtils.ArgsParseUtils._makeloadSpriteFrameResrgs.apply(this, args);
    if (e) this.loadRes(e.bundle, e.path, cc.SpriteFrame, e.callback, e.autoRelese, e.cacheTme, e.saveKey, options || {});
  };
  t.prototype.loadRemoteSpriteFrame = function (t, e, n, a, options) {
    undefined === n && (n = false);
    undefined === a && (a = 10);
    var r = $z1TimeUtils.TimeUtils.GetTimeBySecond();
    var cache = $z1ResCacheMgr.ResCacheMgr.getInstance();
    var l = cache.getAssets("", t, cc.SpriteFrame, n);
    if (l && l.asset) {
      l.asset.addRef();
      var hit = new exp_ResCache("", t, r, a, cc.SpriteFrame, l.asset);
      hit.releaseDependency = l.releaseDependency;
      cache.addAssets(hit, n);
      return void (e && e(l.asset));
    }
    var remoteOptions = $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE ? { ext: ".head" } : {};
    return this.loadWithRecovery(t, function (done) { cc.assetManager.loadRemote(t, remoteOptions, done); }, function (texture) {
      var frame = new cc.SpriteFrame(texture);
      // Runtime SpriteFrames do not have a serialized texture dependency in
      // Creator's asset graph. Keep one texture reference for the frame's life.
      texture.addRef();
      frame.addRef();
      var entry = new exp_ResCache("", t, r, a, cc.SpriteFrame, frame);
      var released = false;
      entry.releaseDependency = function () {
        if (released) return;
        released = true;
        texture.decRef();
      };
      cache.addAssets(entry, n);
      e && e(frame);
    }, options && options.onError, options && options.isCurrent);
  };
  t.prototype.loadRes = function () {
    var args = Array.prototype.slice.call(arguments);
    var options = args.length && args[args.length - 1];
    if (options && typeof options === "object") args.pop(); else options = null;
    var e = $z1ArgsParseUtils.ArgsParseUtils._makeLoadResArgs.apply(this, args);
    if (!e) return;
    // Optional trailing options preserve all existing positional callers.
    var onError = options && typeof options === "object" && options.onError;
    var isCurrent = options && options.isCurrent;
    var n = e.bundle;
    var i = e.path;
    var s = e.type;
    var l = e.callback;
    var g = e.saveKey;
    if ("cc.Asset" != cc.js.getClassName(s)) {
      var u = $z1TimeUtils.TimeUtils.GetTimeBySecond();
      var cache = $z1ResCacheMgr.ResCacheMgr.getInstance();
      var d = cache.getAssets(n, i, s, e.autoRelese);
      if (d && d.asset) {
        d.asset.addRef();
        cache.addAssets(new exp_ResCache(n, i, u, e.cacheTme, s, d.asset), e.autoRelese);
        if (g && !e.autoRelese) cache.addAssetKeyToMap(g, n, i, s, d.asset);
        return void (l && l(d.asset));
      }
      var f = new exp_ResCache(n, i, u, e.cacheTme, s);
      var manager = this;
      this.loadBundle(n, function (bundle) {
        manager.loadWithRecovery(n + "/" + i, function (done) { bundle.load(i, s, done); }, function (a) {
            a.addRef();
            f.asset = a;
            $z1ResCacheMgr.ResCacheMgr.getInstance().addAssets(f, e.autoRelese);
            g && !e.autoRelese && $z1ResCacheMgr.ResCacheMgr.getInstance().addAssetKeyToMap(g, n, i, s, a);
            l && l(a);
        }, onError, isCurrent);
      }, onError, isCurrent);
    } else {
      console.error("请传入具体资源类型，不能是基类asset,路径:", n + "/" + i);
    }
  };
  t.prototype.loadDir = function (t, e, n, onError) {
    var manager = this;
    this.loadBundle(t, function (bundle) {
      manager.loadWithRecovery(t + "/" + e, function (done) { bundle.loadDir(e, cc.Asset, done); }, n, onError);
    }, onError);
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
