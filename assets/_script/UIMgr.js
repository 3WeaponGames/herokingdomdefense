Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UIMgr = undefined;
var $z1Config = require("Config");
var $z1BaseUI = require("BaseUI");
var $z1Appcfg = require("Appcfg");
var $z1EventMgr = require("EventMgr");
var $z1LogMgr = require("LogMgr");
var $z1ResourceMgr = require("ResourceMgr");
var c = function (t, e, n, i, a, o, r, s, l, owner, transition) {
  this.uid = t;
  this.callback = i;
  this.parent = n;
  this.fromId = e;
  this.param1 = a;
  this.param2 = o;
  this.param3 = r;
  this.param4 = s;
  this.param5 = l;
  this.owner = owner;
  this.transition = transition;
};
var exp_UIMgr = function () {
  function _ctor() {
    this.uistatck = new Map();
    this.uichace = new Map();
    this.orderMap = new Map();
    this.popStatck = [];
    this.logStatck = [];
    this.watingOpen = [];
    this.onlyShowOne = [];
    this.activityOne = [];
    this.layerNodeMap = new Map();
    this.otherUIConf = [];
    this.uiRoot = null;
    this.UIConf = {};
    this.isopening = false;
    this.touchTime = -1;
    this.leftNum = 0;
    this.rightNum = 0;
    this.isLeft = false;
  }
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.preLoadUI = function (t, e) {
    var n = this;
    var i = this.getUICnf(t);
    if (i) {
      if (this.uichace.has(t) || this.uistatck.has(t)) { e && e(); return; }
      this._preloadCallbacks = this._preloadCallbacks || new Map();
      if (this._preloadCallbacks.has(t)) { if (e) this._preloadCallbacks.get(t).push(e); return; }
      this._preloadCallbacks.set(t, e ? [e] : []);
      $z1ResourceMgr.ResourceMgr.getInstance().loadRes(i.bundleName, i.prefab, cc.Prefab, function (o) {
        var callbacks = n._preloadCallbacks.get(t) || [];
        n._preloadCallbacks.delete(t);
        if (!n.uichace.has(t) && !n.uistatck.has(t)) {
          var r = cc.instantiate(o);
          r.name = i.name;
          var s = r.getComponent($z1BaseUI.default);
          n.uichace.set(t, s);
        }
        var firstError = null;
        callbacks.forEach(function (callback) { try { callback(); } catch (error) { if (!firstError) firstError = error; console.error(error); } });
        if (firstError) throw firstError;
      });
    } else {
      $z1LogMgr.LogMgr.getInstance().error("ui没有配置：", t);
    }
  };
  _ctor.prototype.addLayerShowOne = function (t) {
    this.onlyShowOne.push(t);
  };
  _ctor.prototype.addLayerActivityOne = function (t) {
    this.activityOne.push(t);
  };
  _ctor.prototype.addUICnf = function (t) {
    this.otherUIConf.push(t);
  };
  _ctor.prototype.setConf = function (t) {
    this.UIConf = t;
  };
  _ctor.prototype.Init = function (t) {
    this.uiRoot = t;
    this.UIConf = $z1Config.UICF;
    this.touchTime = -1;
    this.addTipsNode();
  };
  _ctor.prototype.addBlockTouch = function (t) {
    cc.game.pause();
    var e = cc.director.getScene();
    this.blockNode = new cc.Node();
    this.blockNode.setPosition(0, 0);
    this.blockNode.height = cc.view.getVisibleSize().height + 1e5;
    this.blockNode.width = cc.view.getVisibleSize().width + 1e5;
    this.blockNode.parent = e;
    cc.game.addPersistRootNode(this.blockNode);
    this.blockNode.zIndex = cc.macro.MAX_ZINDEX;
    var n = this.blockNode.addComponent(cc.Sprite);
    n.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    var i = new cc.SpriteFrame();
    var a = new cc.Texture2D();
    i.setTexture(a);
    n.spriteFrame = i;
    var o = new cc.RenderTexture();
    o.initWithSize(556, 582);
    var r = o.readPixels();
    var s = o.readPixels(r, 0, 0, 278, 582);
    var l = new cc.RenderTexture();
    l.initWithData(s, cc.Texture2D.PixelFormat.RGB888, 278, 582);
    this.blockNode.getComponent(cc.Sprite).spriteFrame.setTexture(l);
    var c = new cc.Node();
    var h = c.addComponent(cc.Label);
    h.string = "[[loc:script.uimgr.text.104]]";
    h.fontSize = 34;
    c.y = .5 * cc.view.getVisibleSize().height;
    c.x = .5 * cc.view.getVisibleSize().width;
    c.parent = this.blockNode;
    this.blockNode.on(cc.Node.EventType.TOUCH_START, function () {
      t && window.open(t);
    });
    this.blockNode.name = "BLOCKNODE";
  };
  _ctor.prototype.addTipsNode = function () {
    var t = this;
    this.tipsNode && this.tipsNode.destroy();
    this.tipsNode = new cc.Node();
    this.tipsNode.height = cc.view.getVisibleSize().height;
    this.tipsNode.width = cc.view.getVisibleSize().width;
    var e = new cc.Node();
    var n = e.addComponent(cc.Label);
    n.string = "";
    n.fontSize = 30;
    e.parent = this.tipsNode;
    e.y = -(cc.view.getVisibleSize().height / 2 - 20);
    e.active = false;
    this.tipsNode.parent = this.uiRoot;
    this.tipsNode.zIndex = cc.macro.MAX_ZINDEX;
    this.tipsNode.on(cc.Node.EventType.TOUCH_START, function (n) {
      var i = n.getStartLocation();
      var a = false;
      if (i.x < 100) {
        a = true;
      } else {
        if (!(i.x > cc.view.getVisibleSize().width - 100)) {
          return;
        }
        a = false;
      }
      if (t.isLeft != a) {
        t.isLeft = a;
        if (new Date().getTime() - t.touchTime < 1e3) {
          if (t.isLeft) {
            t.leftNum++;
          } else {
            t.rightNum++;
          }
        } else if (t.isLeft) {
          t.leftNum = 0;
        } else {
          t.rightNum = 0;
        }
        if (t.leftNum + t.rightNum >= 30) {
          e.active = true, setTimeout(function () {
            e.active = false;
          }, 2e3);
        }
        t.touchTime = new Date().getTime();
      }
    });
    this.tipsNode._touchListener.setSwallowTouches(false);
  };
  _ctor.prototype.openUIOfParent = function (t, e, n, i, a, o, r, s) {
    this.open(t, e, n, i, a, o, r, s);
  };
  _ctor.prototype.openUIOfCallback = function (t, e, n, i, a, o, r, s) {
    this.open(t, e, this.uiRoot, n, i, a, o, r, s);
  };
  _ctor.prototype.openUIOfParentAndCallback = function (t, e, n, i, a, o, r, s, l, owner, transition) {
    this.open(t, e, n, i, a, o, r, s, l, owner, transition);
  };
  _ctor.prototype.openUI = function (t, e, n, i, a, o, r) {
    this.open(t, e, this.uiRoot, null, n, i, a, o, r);
  };
  // Opt-in ownership for callers whose lifetime can end while a prefab is loading.
  _ctor.prototype.openUIWithOwner = function (uid, from, callbacks, a, b, c, d, e) {
    var manager = this;
    var owner = { finished: false, cancelled: false, abort: null, retireRecovery: null,
      recoveryCancelAllowed: callbacks.recoveryCancelAllowed !== false };
    var parent = callbacks.parent;
    if (parent) {
      if (!parent._pendingUIOpens) parent._pendingUIOpens = new Set();
      parent._pendingUIOpens.add(owner);
    }
    owner.isCurrent = function () { return !owner.cancelled && (!callbacks.isCurrent || callbacks.isCurrent()); };
    owner.cancel = function () {
      if (owner.finished) return;
      owner.finished = owner.cancelled = true;
      if (parent) parent._pendingUIOpens.delete(owner);
      [manager.watingOpen, manager.popStatck, manager.logStatck].forEach(function (queue) {
        for (var index = queue.length - 1; index >= 0; index--) if (queue[index].owner === owner) queue.splice(index, 1);
      });
      var abort = owner.abort, retire = owner.retireRecovery;
      owner.abort = owner.retireRecovery = null;
      try { if (callbacks.onCancel) callbacks.onCancel(); }
      finally { try { if (retire) retire(); } finally { if (abort) abort(); } }
    };
    this.open(uid, from, this.uiRoot, function (node) {
      owner.finished = true;
      if (parent) parent._pendingUIOpens.delete(owner);
      owner.abort = owner.retireRecovery = null;
      if (callbacks.onOpened) callbacks.onOpened(node);
    }, a, b, c, d, e, owner);
    return owner;
  };
  _ctor.prototype.open = function (t, e, n, i, h, g, u, d, p, owner, transition) {
    var manager = this;
    if (owner && !owner.isCurrent()) { owner.cancel(); return; }
    if (transition === undefined) transition = this.captureOpenTransition();
    if (this.isopening) {
      this.watingOpen.push(new c(t, e, n, i, h, g, u, d, p, owner, transition));
      return;
    }
    this.isopening = true;
    var finished = false, inputReleased = false, inputOwned = false;
    var component = null, node = null, initialized = false;
    function finish(drain) {
      if (finished) return;
      finished = true;
      manager.isopening = false;
      if (drain !== false) manager.openWaiting();
    }
    function releaseInput() {
      if (inputReleased || !inputOwned) return;
      inputReleased = true;
      manager._openingInputCount = Math.max(0, (manager._openingInputCount || 0) - 1);
      if (component && component._releaseOpeningInput === releaseInput) component._releaseOpeningInput = null;
      $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, true, releaseInput);
    }
    if (owner) owner.abort = function () {
      // Shared asset loading may finish into the cache; only this open is retired.
      try { releaseInput(); }
      finally { if (!finished) finish(); else if (!manager.isopening) manager.openWaiting(); }
    };
    function offerRecovery(error) {
      var resource = $z1ResourceMgr.ResourceMgr.getInstance();
      function retry() {
        if ((!owner || owner.isCurrent()) && cc.isValid(n)) manager.open(t, e, n, i, h, g, u, d, p, owner, transition);
        else { if (owner) owner.cancel(); if (!manager.isopening) manager.openWaiting(); }
      }
      function cancel() {
        try { if (owner) owner.cancel(); }
        finally { try { manager.cancelOpenTransition(transition); } finally { if (!manager.isopening) manager.openWaiting(); } }
      }
      try {
        var retire = resource.showRuntimeRecovery(error, retry, cancel, null, owner && {
          retryOnly: !owner.recoveryCancelAllowed,
          isCurrent: function () { return owner.isCurrent() && cc.isValid(n); }
        });
        if (owner) owner.retireRecovery = retire;
      } catch (recoveryError) { cancel(); throw recoveryError; }
    }
    function fail(error) {
      try {
        if (!initialized && node) {
          if (component) {
            component.isclose = true;
            component._resourceGeneration = (component._resourceGeneration || 0) + 1;
            try { if (component.release) component.release(true); } catch (cleanupError) { console.error(cleanupError); }
          }
          if (manager.uistatck.get(t) === component) manager.uistatck.delete(t);
          manager.uichace.delete(t);
          manager.layerNodeMap.forEach(function (nodes) {
            var index = nodes.indexOf(node);
            if (index !== -1) nodes.splice(index, 1);
          });
          if (cc.isValid(node)) node.destroy();
        }
      } finally {
        try { releaseInput(); }
        finally {
          if (!initialized && owner && !owner.recoveryCancelAllowed && owner.isCurrent() && cc.isValid(n)) {
            finish(false); offerRecovery(error);
          } else {
            try { manager.cancelOpenTransition(transition); }
            finally { try { if (owner) owner.cancel(); } finally { finish(); } }
          }
        }
      }
      throw error;
    }
    try {
      var config = this.getUICnf(t);
      if (!config) { if (owner) owner.cancel(); finish(); return; }
      var request = new c(t, e, n, i, h, g, u, d, p, owner, transition);
      var closing = this.uistatck.get(t);
      if (closing && (closing._closing || closing.isclose) && !config.showMult) {
        this.watingOpen.push(request);
        finish(false);
        return;
      }
      if (!this.popCanShow(t, config, request)) { finish(); return; }
      var existing = this.uistatck.get(t);
      if (existing && !config.showMult) {
        try {
          // An owned request cannot take over an unrelated existing dialog.
          if (owner) owner.cancel();
          else existing.node.getComponent($z1BaseUI.default).refreshUI(t, e, i, h, g, u, d, p);
        }
        finally { finish(); }
        return;
      }
      this._openingInputCount = (this._openingInputCount || 0) + 1;
      inputOwned = true;
      $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, false, releaseInput);
      function show(prefab, cached) {
        try {
          if (owner && !owner.isCurrent()) {
            try { owner.cancel(); } finally { try { releaseInput(); } finally { finish(); } }
            return;
          }
          if (!cc.isValid(n)) {
            try { if (owner) owner.cancel(); }
            finally { try { releaseInput(); manager.cancelOpenTransition(transition); } finally { finish(); } }
            return;
          }
          node = cached ? cached.node : cc.instantiate(prefab);
          node.active = false;
          node.name = config.name;
          if (node.parent !== n) n.addChild(node);
          component = cached || node.getComponent($z1BaseUI.default);
          if (!component) throw new Error('UI prefab has no BaseUI component: ' + t);
          manager.uichace.delete(t);
          manager.uistatck.set(t, component);
          if (component.onOpened) component.onOpened();
          component._closing = false;
          component._releaseOpeningInput = releaseInput;
          component.setUid(t);
          component.fromId = e;
          component.layer = config.zIndex;
          if (component.init) component.init(h, g, u, d, p);
          if (owner && !owner.isCurrent()) {
            owner.cancel(); manager.closeUI(node); releaseInput(); finish(); return;
          }
          if (component.isclose) { if (owner) owner.cancel(); manager.closeUI(node); releaseInput(); finish(); return; }
          var order = manager.orderMap.has(component.layer) ? manager.orderMap.get(component.layer) + 1 : component.layer;
          manager.orderMap.set(component.layer, order);
          node.zIndex = order;
          node.x = node.y = 0;
          manager.updateMainUI(t, config);
          var nodes = manager.layerNodeMap.get(config.zIndex) || [];
          nodes.push(node);
          manager.layerNodeMap.set(config.zIndex, nodes);
          node.active = true;
          component.openAni(releaseInput);
          initialized = true;
          if (!component.isclose) {
            if (i) i(node);
            if (!component.isclose && cc.isValid(node)) $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.OpenUI, t, node);
          } else if (owner) owner.cancel();
          finish();
        } catch (error) { fail(error); }
      }
      var cached = this.uichace.get(t);
      if (cached) show(null, cached);
      else $z1ResourceMgr.ResourceMgr.getInstance().loadRes(config.bundleName, config.prefab, cc.Prefab, function (prefab) {
        show(prefab, null);
      }, { onError: function (error, retry, cancel) {
        var boundaryError;
        try { cancel(); } catch (issue) { boundaryError = issue; }
        try { releaseInput(); } catch (issue) { if (!boundaryError) boundaryError = issue; }
        finish(false);
        try { if (owner && !owner.isCurrent()) owner.cancel(); else offerRecovery(error); }
        finally { if (boundaryError) throw boundaryError; }
      } });
    } catch (error) { if (!finished) fail(error); else throw error; }
  };
  _ctor.prototype.getChildByName = function (t) {
    return this.uiRoot.getChildByName(t);
  };
  _ctor.prototype.captureOpenTransition = function () {
    var touch = this.uistatck.get($z1Config.UIID.UITouch);
    return touch ? { touch: touch, generation: touch._transitionGeneration || 0 } : null;
  };
  _ctor.prototype.cancelOpenTransition = function (transition) {
    var touch = this.uistatck.get($z1Config.UIID.UITouch);
    if (!touch || !touch.cancelTransition) return false;
    if (arguments.length && (!transition || transition.touch !== touch)) return false;
    return touch.cancelTransition(transition && transition.generation);
  };
  _ctor.prototype.openWaiting = function () {
    if (this.watingOpen.length > 0) {
      var t = this.watingOpen.shift();
      this.openUIOfParentAndCallback(t.uid, t.fromId, t.parent, t.callback, t.param1, t.param2, t.param3, t.param4, t.param5, t.owner, t.transition);
    }
  };
  _ctor.prototype.closeUI = function (t, e, n, i, l) {
    var manager = this;
    if (!t || !t.isValid) return;
    var component = t.getComponent($z1BaseUI.default);
    if (!component || component._closing) return;
    component._closing = true;
    component.isclose = true;
    component._resourceGeneration = (component._resourceGeneration || 0) + 1;
    var releaseError = null;
    try { if (component._releaseOpeningInput) component._releaseOpeningInput(); }
    catch (error) { releaseError = error; }
    try { if (component.cancelPendingOpens) component.cancelPendingOpens(); }
    catch (error) { if (!releaseError) releaseError = error; }
    if (component.offEvents) component.offEvents(false);
    var completed = false;
    function complete() {
      if (completed) return;
      completed = true;
      var uid = component.getUid(), config = manager.getUICnf(uid);
      var closeError = null;
      try { component.onClose(); }
      catch (error) { closeError = error; }
      finally {
        if (component.release) component.release(!component.cache);
        if (component.cache) {
          t.active = false;
          t.removeFromParent();
          manager.uichace.set(uid, component);
        } else t.destroy();
        if (manager.uistatck.get(uid) === component) manager.uistatck.delete(uid);
        if (config) {
          var nodes = manager.layerNodeMap.get(config.zIndex);
          var index = nodes ? nodes.indexOf(t) : -1;
          if (index !== -1) {
            nodes.splice(index, 1);
            manager.orderMap.set(component.layer, Math.max(component.layer, (manager.orderMap.get(component.layer) || component.layer) - 1));
          }
          try { $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.CloseUI, uid, e, n, i, l); }
          finally {
            var next = null;
            if (config.zIndex == $z1Appcfg.OrderLayer.pop && manager.popStatck.length) next = manager.popStatck.pop();
            else if (config.zIndex == $z1Appcfg.OrderLayer.Log && manager.logStatck.length) next = manager.logStatck.pop();
            else if (config.zIndex == $z1Appcfg.OrderLayer.main && nodes && nodes.length) nodes[nodes.length - 1].active = true;
            if (next) manager.open(next.uid, next.fromId, next.parent, next.callback, next.param1, next.param2, next.param3, next.param4, next.param5, next.owner, next.transition);
            manager.checkHomeShow();
            manager.openWaiting();
          }
        }
      }
      if (closeError) throw closeError;
    }
    try { if (t.active === false) complete(); else component.closeAni(complete); }
    catch (error) { complete(); throw error; }
    if (releaseError) throw releaseError;
  };
  _ctor.prototype.checkHomeShow = function () {};
  _ctor.prototype.checkOtherEmpty = function () {
    var t = this.layerNodeMap.get($z1Appcfg.OrderLayer.pop);
    var e = this.layerNodeMap.get($z1Appcfg.OrderLayer.pop2);
    return !(t && t.length > 0 || e && e.length > 0);
  };
  _ctor.prototype.updateMainUI = function () {};
  _ctor.prototype.popCanShow = function (t, e, n) {
    var i = this.layerNodeMap.get(e.zIndex);
    if (e.zIndex == $z1Appcfg.OrderLayer.pop) {
      if (i && i.length > 0) {
        for (var a = 0; a < this.popStatck.length; a++) {
          if (this.popStatck[a].uid == t) {
            if (n.owner) n.owner.cancel();
            return false;
          }
        }
        this.popStatck.push(n);
        return false;
      }
    } else if (e.zIndex == $z1Appcfg.OrderLayer.Log && i && i.length > 0) {
      this.logStatck.push(n);
      return false;
    }
    return true;
  };
  _ctor.prototype.closeById = function (t, e, n, i, a, o) {
    var r = this.uistatck.get(t);
    if (r) {
      if (r.node) {
        this.closeUI(r.node, e, n, i, a, o);
      } else {
        $z1LogMgr.LogMgr.getInstance().debug("关闭失败2");
      }
    } else {
      $z1LogMgr.LogMgr.getInstance().debug("关闭失败1");
    }
  };
  _ctor.prototype.getUIById = function (t) {
    var e = this.uistatck.get(t);
    if (e) {
      return e;
    }
    var config = this.getUICnf(t);
    if (!config || !this.uiRoot) return null;
    var n = this.uiRoot.getChildByName(config.name);
    if (n) {
      return n.getComponent($z1BaseUI.default);
    } else {
      return null;
    }
  };
  _ctor.prototype.getUIShowNum = function (t) {
    var e = 0;
    this.layerNodeMap.forEach(function (nodes) {
      nodes.forEach(function (node) {
        var component = cc.isValid(node) && node.getComponent($z1BaseUI.default);
        if (component && !component.isclose && component.getUid() == t) e++;
      });
    });
    if (!e) { var component = this.uistatck.get(t); if (component && !component.isclose) e = 1; }
    return e;
  };
  _ctor.prototype.getUIByIdWithNode = function (t, e) {
    var n = this.uistatck.get(t);
    if (n) {
      return n;
    }
    if (null == e) {
      return null;
    }
    var config = this.getUICnf(t);
    if (!config) return null;
    var i = e.getChildByName(config.name);
    if (i) {
      return i.getComponent($z1BaseUI.default);
    } else {
      return null;
    }
  };
  _ctor.prototype.getUICnf = function (t) {
    var e = this.UIConf[t];
    if (e) {
      return e;
    }
    for (var n = 0; n < this.otherUIConf.length; n++) {
      var i = this.otherUIConf[n][t];
      if (i) {
        return i;
      }
    }
    return null;
  };
  _ctor.instance = null;
  return _ctor;
}();
exports.UIMgr = exp_UIMgr;
