Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TimeUtils = undefined;
var exp_TimeUtils = function () {
  function _ctor() {}
  _ctor.GetTimeBySecond = function () {
    var t = new Date();
    return Math.floor(t.getTime() / 1e3);
  };
  _ctor.GetTimeByHours = function () {
    var t = new Date();
    var e = t.getHours();
    var n = Math.floor(e / 10).toString() + e % 10;
    var i = t.getMinutes();
    return n + ":" + (Math.floor(i / 10).toString() + i % 10);
  };
  _ctor.SecondToHours = function (t) {
    var e = t % 60;
    e = Math.floor(e / 10).toString() + e % 10;
    var n = Math.floor(t / 60) % 60;
    n = Math.floor(n / 10).toString() + n % 10;
    var i = Math.floor(t / 60 / 60);
    return (i = Math.floor(i / 10).toString() + i % 10) + ":" + n + ":" + e;
  };
  _ctor.FormatDate2 = function (t) {
    var e = new Date(t);
    var n = 10 > e.getMonth() + 1 ? "0" + (e.getMonth() + 1) : e.getMonth() + 1;
    var i = 10 > e.getDate() ? "0" + e.getDate() : e.getDate();
    return e.getFullYear() + "-" + n + "-" + i;
  };
  _ctor.FormatDate1 = function (t, e) {
    undefined === e && (e = "/");
    var n = new Date(t);
    return n.getFullYear() + e + (n.getUTCMonth() + 1) + e + n.getUTCDate();
  };
  _ctor.BeforeTime = function (t) {
    if (null == t) {
      return "";
    }
    var e = new Date();
    var n = Math.floor(e.getTime() / 1e3) - t;
    n <= 0 && (n = 1);
    if (Math.floor(n / 60 / 60 / 24) > 0) {
      return require("LanguageMgr").LanguageMgr.getInstance().t(Math.floor(n / 60 / 60 / 24) === 1 ? "[[loc:time.ago.days.one]]" : "[[loc:time.ago.days]]", [Math.floor(n / 60 / 60 / 24)]);
    } else {
      if (Math.floor(n / 60 / 60) > 0) {
        return require("LanguageMgr").LanguageMgr.getInstance().t(Math.floor(n / 60 / 60) === 1 ? "[[loc:time.ago.hours.one]]" : "[[loc:time.ago.hours]]", [Math.floor(n / 60 / 60)]);
      } else {
        if (Math.floor(n / 60) > 0) {
          return require("LanguageMgr").LanguageMgr.getInstance().t(Math.floor(n / 60) === 1 ? "[[loc:time.ago.minutes.one]]" : "[[loc:time.ago.minutes]]", [Math.floor(n / 60)]);
        } else {
          return require("LanguageMgr").LanguageMgr.getInstance().t(Math.floor(n) === 1 ? "[[loc:time.ago.seconds.one]]" : "[[loc:time.ago.seconds]]", [Math.floor(n)]);
        }
      }
    }
  };
  _ctor.compareIsToday = function (t) {
    var e = new Date(1e3 * t);
    var n = e.getFullYear();
    var i = e.getMonth();
    var a = e.getDate();
    var o = new Date(1e3 * this.GetTimeBySecond());
    var r = o.getFullYear();
    var s = o.getMonth();
    var l = o.getDate();
    return n == r && i == s && a == l;
  };
  _ctor.overDay = function (t) {
    var e = new Date(t);
    var n = new Date(this.dayStart());
    return Math.floor((n.getTime() - e.getTime()) / 864e5);
  };
  _ctor.getMothTotalDay = function (t) {
    var e = 30;
    if (2 == t) {
      e = 28;
    } else {
      1 != t && 3 != t && 5 != t && 7 != t && 8 != t && 10 != t && 12 != t || (e = 31);
    }
    return e;
  };
  _ctor.dayStart = function () {
    return new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  };
  _ctor.dayEnd = function () {
    return new Date(new Date().setHours(23, 59, 59, 0)).getTime();
  };
  _ctor.getDiffHours = function (t) {
    return new Date().getHours() - new Date(1e3 * t).getHours();
  };
  _ctor.getSplaceTime = function (t, e) {
    var n = new Date();
    if (n.getHours() >= t) {
      n.setHours(t + 24);
    } else {
      n.setHours(t);
    }
    n.setMinutes(e);
    n.setSeconds(0);
    return Number((n.getTime() / 1e3).toFixed(0));
  };
  _ctor.isLastDayOfMonth = function (t) {
    var e = false;
    var n = new Date(t);
    var i = n.getFullYear();
    var a = n.getMonth() + 1;
    var o = n.getDate();
    var r = i;
    var s = a++;
    if (a > 12) {
      s -= 12;
      r++;
    }
    var l = new Date(r, s, 1);
    o == new Date(l.getTime() - 864e5).getDate() && (e = true);
    return e;
  };
  return _ctor;
}();
exports.TimeUtils = exp_TimeUtils;
