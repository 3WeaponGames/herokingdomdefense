Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UIUtils = undefined;
var exp_UIUtils = function () {
  function _ctor() {}
  _ctor.rollNumLabelAtlas = function (t, e, n, i, a, o) {
    undefined === o && (o = 6);
    var r = n;
    var s = 10 * o;
    var l = 0;
    var c = r / s + 1;
    if (r <= s) {
      s = r;
      c = 1;
    } else {
      s += 1;
    }
    var h = function () {
      if (t) {
        if (l != r) {
          if ((l += c) > r) {
            c -= l - r;
            l = r;
          }
          var n = Number(e.string);
          var a = Math.floor(n + c).toFixed(0) + "";
          e.string = a;
        }
      } else if (l != r && ((l += c) > r && (c = 0, l = r), (n = Number(e.string)) > i)) {
        a = Math.floor(n - c).toFixed(0) + "";
        e.string = a;
      }
    };
    if (s > 0) {
      cc.tween(e.node).call(function () {
        h();
      }).delay(.05).union().repeat(s).call(function () {
        a();
      }).start();
    } else {
      a();
    }
  };
  _ctor.scheduleOnce = function (t, e, n) {
    cc.director.getScheduler().enableForTarget(e);
    cc.director.getScheduler().schedule(t, e, 1, 0, n, false);
  };
  _ctor.schedule = function (t, e, n) {
    cc.director.getScheduler().enableForTarget(e);
    cc.director.getScheduler().schedule(t, e, n, cc.macro.REPEAT_FOREVER, 0, false);
  };
  _ctor.unSchedule = function (t, e) {
    cc.director.getScheduler().enableForTarget(e);
    cc.director.getScheduler().isScheduled(t, e) && cc.director.getScheduler().unschedule(t, e);
  };
  return _ctor;
}();
exports.UIUtils = exp_UIUtils;