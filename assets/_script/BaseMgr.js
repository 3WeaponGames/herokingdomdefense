Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1EventMgr = require("EventMgr");
var def_BaseMgr = function () {
  function _ctor() {
    this.resArray = [];
    this.eventList = [];
    this.isDestroy = false;
  }
  _ctor.prototype.addEvent = function (t, e) {
    $z1EventMgr.EventMgr.getInstance().on(t, this, e);
    var n = new Map();
    n.set(t, e);
    this.eventList.push(n);
  };
  _ctor.prototype.sendEvent = function (t, e, n, a, o, r) {
    $z1EventMgr.EventMgr.getInstance().emit(t, e, n, a, o, r);
  };
  _ctor.prototype.addRes = function () {};
  _ctor.prototype.release = function () {};
  _ctor.prototype.setListenerUI = function () {};
  _ctor.prototype.offEvents = function () {
    var t = this;
    if (this.eventList && this.eventList.length > 0) {
      for (var e = 0; e < this.eventList.length; e++) {
        this.eventList[e].forEach(function (e, n) {
          $z1EventMgr.EventMgr.getInstance().off(n, t, e);
        });
      }
      this.eventList = null;
    }
  };
  _ctor.prototype.onDestroy = function () {
    this.isDestroy = true;
    this.release();
  };
  return _ctor;
}();
exports.default = def_BaseMgr;