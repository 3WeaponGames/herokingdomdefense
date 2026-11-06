Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventMgr = exports.Listener = undefined;
var exp_Listener = function () {
  function _ctor(t, e) {
    this.mListener = e;
    this.mtarget = t;
  }
  Object.defineProperty(_ctor.prototype, "listener", {
    get: function () {
      return this.mListener;
    },
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(_ctor.prototype, "target", {
    get: function () {
      return this.mtarget;
    },
    enumerable: false,
    configurable: true
  });
  return _ctor;
}();
exports.Listener = exp_Listener;
var exp_EventMgr = function () {
  function t() {
    this.global_event_list = new Array();
  }
  t.getInstance = function () {
    null == this.instance && (this.instance = new t());
    return this.instance;
  };
  t.prototype.getEventNum = function (t) {
    if (this.global_event_list[t]) {
      return this.global_event_list[t].length;
    } else {
      return 0;
    }
  };
  t.prototype.on = function (t, e, n, a) {
    undefined === a && (a = false);
    if (null != t && null != n) {
      null == this.global_event_list[t] && (this.global_event_list[t] = new Array());
      if (!a && this.global_event_list[t]) {
        for (var o = 0; o < this.global_event_list[t].length; o++) {
          if (this.global_event_list[t][o].listener == n && this.global_event_list[t][o].target == e) {
            return;
          }
        }
      }
      var r = new exp_Listener(e, n);
      this.global_event_list[t].push(r);
    } else {
      console.error("RegistEvent Error");
    }
  };
  t.prototype.off = function (t, e, n) {
    if (null != t && null != n && null != this.global_event_list[t]) {
      for (var i = 0; i < this.global_event_list[t].length; i++) {
        this.global_event_list[t][i].listener == n && this.global_event_list[t][i].target == e && this.global_event_list[t].splice(i, 1);
      }
    }
  };
  t.prototype.removeAll = function () {
    this.global_event_list = new Array();
  };
  t.prototype.emit = function (t, e, n, i, a, o, r) {
    if (null != t) {
      if (null != this.global_event_list[t]) {
        for (var s = 0; s < this.global_event_list[t].length; s++) {
          var l = this.global_event_list[t][s];
          l && l.listener.call(l.target, e, n, i, a, o, r);
        }
      }
    } else {
      console.error("FireEvent Error");
    }
  };
  t.instance = null;
  return t;
}();
exports.EventMgr = exp_EventMgr;