this && this.__spreadArrays;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LogMgr = undefined;
var exp_LogMgr = function () {
  function _ctor() {}
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.debug = function () {};
  _ctor.prototype.info = function (t) {
    var e = [];
    for (var n = 1; n < arguments.length; n++) {
      e[n - 1] = arguments[n];
    }
  };
  _ctor.prototype.error = function (t, e) {
    console.error(t, e);
  };
  _ctor.instance = null;
  return _ctor;
}();
exports.LogMgr = exp_LogMgr;