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
var c = function (t, e, n, i, a, o, r, s, l) {
  this.uid = t;
  this.callback = i;
  this.parent = n;
  this.fromId = e;
  this.param1 = a;
  this.param2 = o;
  this.param3 = r;
  this.param4 = s;
  this.param5 = l;
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
      $z1ResourceMgr.ResourceMgr.getInstance().loadRes(i.bundleName, i.prefab, cc.Prefab, function (o) {
        var r = cc.instantiate(o);
        r.name = i.name;
        var s = r.getComponent($z1BaseUI.default);
        n.uichace.set(t, s);
        e && e();
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
    h.fontSize = 20;
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
    n.fontSize = 20;
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
  _ctor.prototype.openUIOfParentAndCallback = function (t, e, n, i, a, o, r, s, l) {
    this.open(t, e, n, i, a, o, r, s, l);
  };
  _ctor.prototype.openUI = function (t, e, n, i, a, o, r) {
    this.open(t, e, this.uiRoot, null, n, i, a, o, r);
  };
  _ctor.prototype.open = function (t, e, n, i, h, g, u, d, p) {
    var f = this;
    if (this.isopening) {
      var m = new c(t, e, n, i, h, g, u, d, p);
      this.watingOpen.push(m);
    } else {
      this.isopening = true;
      var y = this.getUICnf(t);
      if (null == y) {
        $z1LogMgr.LogMgr.getInstance().debug(t + "不存在");
        return void (this.isopening = false);
      }
      var v = new c(t, e, n, i, h, g, u, d, p);
      if (this.popCanShow(t, y, v)) {
        if (this.uistatck.get(t) && !y.showMult) {
          $z1LogMgr.LogMgr.getInstance().debug(t + "已经存在");
          this.uistatck.get(t).node.getComponent($z1BaseUI.default).refreshUI(t, e, i, h, g, u, d, p);
          return void (this.isopening = false);
        }
        $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, false);
        var _ = this.uichace.get(t);
        if (_) {
          this.uistatck.set(t, _);
          _.init && _.init(h, g, u, d, p);
          this.uichace.delete(t);
          var I = n.getChildByName(y.name);
          if (null == I) {
            (I = _.node).active = false;
            I.name = y.name;
            n.addChild(I);
          }
          I.x = 0;
          I.y = 0;
          I.active = false;
          _.layer = y.zIndex;
          var b = y.zIndex;
          this.orderMap.has(_.layer) && (b = this.orderMap.get(_.layer) + 1);
          this.orderMap.set(_.layer, b);
          I.zIndex = b;
          _.setUid(t);
          _.fromId = e;
          this.updateMainUI(t, y);
          var F = this.layerNodeMap.get(y.zIndex);
          if (F) {
            F.push(I);
          } else {
            var P = [];
            P.push(I);
            this.layerNodeMap.set(y.zIndex, P);
          }
          _.openAni(function () {
            $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, true);
          });
          i && i(I);
          $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.OpenUI, t, I);
          this.isopening = false;
          this.openWaiting();
          I.active = true;
        } else {
          $z1ResourceMgr.ResourceMgr.getInstance().loadRes(y.bundleName, y.prefab, cc.Prefab, function (s) {
            var l = cc.instantiate(s);
            l.active = false;
            l.name = y.name;
            n.addChild(l);
            var c = l.getComponent($z1BaseUI.default);
            f.uistatck.set(t, c);
            c.init && c.init(h, g, u, d, p);
            c.setUid(t);
            c.fromId = e;
            c.layer = y.zIndex;
            var m = y.zIndex;
            f.orderMap.has(c.layer) && (m = f.orderMap.get(c.layer) + 1);
            f.orderMap.set(c.layer, m);
            l.zIndex = m;
            l.x = 0;
            l.y = 0;
            f.updateMainUI(t, y);
            var v = f.layerNodeMap.get(y.zIndex);
            if (v) {
              v.push(l);
            } else {
              var _ = [];
              _.push(l);
              f.layerNodeMap.set(y.zIndex, _);
            }
            c.openAni(function () {
              $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, true);
            });
            i && i(l);
            $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.OpenUI, t, l);
            f.isopening = false;
            f.openWaiting();
            l.active = true;
          });
        }
      } else {
        this.isopening = false;
      }
    }
  };
  _ctor.prototype.getChildByName = function (t) {
    return this.uiRoot.getChildByName(t);
  };
  _ctor.prototype.openWaiting = function () {
    if (this.watingOpen.length > 0) {
      var t = this.watingOpen.pop();
      this.openUIOfParentAndCallback(t.uid, t.fromId, t.parent, t.callback, t.param1, t.param2, t.param3, t.param4, t.param5);
    }
  };
  _ctor.prototype.closeUI = function (t, e, n, i, l) {
    var c = this;
    if (null != t && t.isValid) {
      var h = t.getComponent($z1BaseUI.default);
      h.closeAni(function () {
        var a = h.getUid();
        var s = c.getUICnf(a);
        h.onClose();
        if (h.cache) {
          t.removeFromParent();
          c.uichace.set(a, h);
        } else {
          t.destroy();
        }
        c.uistatck.delete(a);
        if (null != s) {
          var g = c.layerNodeMap.get(s.zIndex);
          if (g) {
            for (var u = 0; u < g.length; u++) {
              if (g[u].name == t.name) {
                g = g.splice(u, 1);
                break;
              }
            }
          }
          var d = h.layer;
          c.orderMap.has(h.layer) && (d = c.orderMap.get(h.layer) - 1) < h.layer && (d = h.layer);
          c.orderMap.set(h.layer, d);
          $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.CloseUI, a, e, n, i, l);
          if (s.zIndex == $z1Appcfg.OrderLayer.pop) {
            if (c.popStatck.length > 0) {
              var p = c.popStatck.pop();
              c.openUIOfCallback(p.uid, p.fromId, p.callback, p.param1, p.param2, p.param3, p.param4, p.param5);
            }
          } else if (s.zIndex == $z1Appcfg.OrderLayer.main) {
            var f = c.layerNodeMap.get(s.zIndex);
            f && f.length > 0 && (f[f.length - 1].active = true);
          } else if (s.zIndex == $z1Appcfg.OrderLayer.Log && c.logStatck.length > 0) {
            p = c.logStatck.pop();
            c.openUIOfCallback(p.uid, p.fromId, p.callback, p.param1, p.param2, p.param3, p.param4, p.param5);
          }
          c.checkHomeShow();
        }
      });
    } else {
      $z1LogMgr.LogMgr.getInstance().debug("关闭失败");
    }
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
    var n = this.uiRoot.getChildByName(this.getUICnf(t).name);
    if (n) {
      return n.getComponent($z1BaseUI.default);
    } else {
      return null;
    }
  };
  _ctor.prototype.getUIShowNum = function (t) {
    var e = 0;
    this.uistatck.forEach(function (n, i) {
      i == t && e++;
    });
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
    var i = e.getChildByName(this.getUICnf(t).name);
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