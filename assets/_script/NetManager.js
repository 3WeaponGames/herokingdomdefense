Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NetManager = undefined;
var exp_NetManager = function () {
  function _ctor() {
    this._channels = {};
  }
  _ctor.getInstance = function () {
    null == this._instance && (this._instance = new _ctor());
    return this._instance;
  };
  _ctor.prototype.setNetNode = function (t, e) {
    undefined === e && (e = 0);
    this._channels[e] = t;
  };
  _ctor.prototype.removeNetNode = function (t) {
    delete this._channels[t];
  };
  _ctor.prototype.connect = function (t, e) {
    undefined === e && (e = 0);
    return !!this._channels[e] && this._channels[e].connect(t);
  };
  _ctor.prototype.send = function (t, e, n) {
    undefined === e && (e = false);
    undefined === n && (n = 0);
    var i = this._channels[n];
    return !!i && i.send(t, e);
  };
  _ctor.prototype.request = function (t, e, n, i, a, o) {
    undefined === i && (i = true);
    undefined === a && (a = false);
    undefined === o && (o = 0);
    var r = this._channels[o];
    r && r.request(t, e, n, i, a);
  };
  _ctor.prototype.requestUnique = function (t, e, n, i, a, o) {
    undefined === i && (i = true);
    undefined === a && (a = false);
    undefined === o && (o = 0);
    var r = this._channels[o];
    return !!r && r.requestUnique(t, e, n, i, a);
  };
  _ctor.prototype.close = function (t, e, n) {
    undefined === n && (n = 0);
    if (this._channels[n]) {
      return this._channels[n].closeSocket(t, e);
    }
  };
  _ctor._instance = null;
  return _ctor;
}();
exports.NetManager = exp_NetManager;