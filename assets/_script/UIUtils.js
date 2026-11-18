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
    var initial = Number(e.string);
    if (r <= s) {
      s = r;
      c = 1;
    } else {
      s += 1;
    }
    var h = function () {
      if (l < r) {
        l = Math.min(r, l + c);
        // Interpolate from the original value; reading a rounded label every
        // step loses fractions and can leave the counter short of its target.
        var value = t ? initial + l : initial - l;
        if (!t && i !== undefined) value = Math.max(i, value);
        e.string = Math.floor(value).toFixed(0);
      }
    };
    if (s > 0) {
      cc.tween(e.node).call(function () {
        h();
      }).delay(.05).union().repeat(s).call(function () {
        a && a();
      }).start();
    } else {
      a && a();
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
