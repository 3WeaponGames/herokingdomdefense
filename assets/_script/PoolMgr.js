Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PoolMgr = exports.PoolNode = undefined;
var exp_PoolNode = function () {
  function _ctor() {
    this._isReady = false;
    this._createCount = 0;
    this._warterMark = 50;
    this._node = null;
    this._ownsTemplate = false;
    this._nodes = new cc.NodePool();
    this._returned = new WeakSet();
  }
  _ctor.prototype.init = function (t, e, ownsTemplate) {
    this._node = t;
    this._ownsTemplate = ownsTemplate === undefined ? t instanceof cc.Node && !t.parent : !!ownsTemplate;
    this._isReady = true;
    for (var n = 0; n < e; n++) {
      var i = cc.instantiate(t);
      this._createCount++;
      this._nodes.put(i);
      this._returned.add(i);
    }
  };
  _ctor.prototype.getNode = function () {
    if (this._nodes.size() > 0) {
      var node = this._nodes.get();
      if (node) this._returned.delete(node);
      return node;
    } else {
      if (this._node && cc.isValid(this._node)) {
        return this._createCount++, cc.instantiate(this._node);
      } else {
        return null;
      }
    }
  };
  _ctor.prototype.freeNode = function (t) {
    if (t && cc.isValid(t)) {
      if (this._returned.has(t)) return;
      if (this._nodes.size() >= this._warterMark || !this._isReady) {
        this._createCount--;
        t.destroy();
      } else {
        t.removeFromParent();
        this._nodes.put(t);
        this._returned.add(t);
      }
    } else {
      this._createCount--;
    }
  };
  _ctor.prototype.setWaterMark = function (t) {
    this._warterMark = t;
  };
  _ctor.prototype.destory = function () {
    this._createCount -= this._nodes.size();
    this._nodes.clear();
    if (this._ownsTemplate && cc.isValid(this._node)) this._node.destroy();
    this._node = null;
    this._isReady = false;
    this._returned = new WeakSet();
  };
  return _ctor;
}();
exports.PoolNode = exp_PoolNode;
var exp_PoolMgr = function () {
  function t() {
    this.poolMap = new Map();
  }
  t.getInstance = function () {
    null == this.instance && (this.instance = new t());
    return this.instance;
  };
  t.prototype.creatrePool = function (t, e, n, ownsTemplate) {
    undefined === n && (n = 1);
    if (this.poolMap.has(t)) {
      var a = this.poolMap.get(t);
      a.destory();
      a = null;
    }
    var o = new exp_PoolNode();
    e && o.init(e, n, ownsTemplate);
    this.poolMap.set(t, o);
  };
  t.prototype.getNode = function (t) {
    if (!this.poolMap.has(t)) {
      return null;
    }
    var e = this.poolMap.get(t).getNode();
    if (cc.isValid(e)) {
      return e;
    } else {
      return null;
    }
  };
  t.prototype.checkHasPool = function (t) {
    return this.poolMap.has(t);
  };
  t.prototype.getNodeFromPrefab = function (key, prefab, warmCount) {
    // Another load callback can fill this pool before the prefab is delivered.
    var node = this.getNode(key);
    if (node) return node;
    this.creatrePool(key, cc.instantiate(prefab), warmCount, true);
    return cc.instantiate(prefab);
  };
  t.prototype.freeNode = function (t, e) {
    if (this.poolMap.has(t)) {
      this.poolMap.get(t).freeNode(e);
    } else {
      e.destroy();
    }
  };
  t.prototype.clearPool = function (t) {
    if (t) {
      var e = this.poolMap.get(t);
      e && cc.isValid(e) && e.destory();
      this.poolMap.delete(t);
    } else {
      this.poolMap.forEach(function (t) {
        t && cc.isValid(t) && t.destory();
      });
      this.poolMap.clear();
    }
  };
  t.instance = null;
  return t;
}();
exports.PoolMgr = exp_PoolMgr;
