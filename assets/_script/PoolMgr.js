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
    this._nodes = new cc.NodePool();
  }
  _ctor.prototype.init = function (t, e) {
    this._node = t;
    this._isReady = true;
    for (var n = 0; n < e; n++) {
      var i = cc.instantiate(t);
      this._createCount++;
      this._nodes.put(i);
    }
  };
  _ctor.prototype.getNode = function () {
    if (this._nodes.size() > 0) {
      return this._nodes.get();
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
      if (this._warterMark < this._nodes.size()) {
        this._createCount--;
        t.destroy();
      } else {
        t.removeFromParent();
        this._nodes.put(t);
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
    for (var t = 0; t < this._nodes.size(); t++) {
      var e = this._nodes.get(t);
      e && e.destroy();
    }
    this._nodes.clear();
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
  t.prototype.creatrePool = function (t, e, n) {
    undefined === n && (n = 1);
    if (this.poolMap.has(t)) {
      var a = this.poolMap.get(t);
      a.destory();
      a = null;
    }
    var o = new exp_PoolNode();
    e && o.init(e, n);
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