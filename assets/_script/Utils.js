Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Utils = undefined;
var exp_Utils = function () {
  function _ctor() {}
  _ctor.formatStr = function (t) {
    var e = [];
    for (var n = 1; n < arguments.length; n++) {
      e[n - 1] = arguments[n];
    }
    return cc.js.formatStr(t, e);
  };
  _ctor.StringFormat = function (t) {
    var e = [];
    for (var n = 1; n < arguments.length; n++) {
      e[n - 1] = arguments[n];
    }
    return require("LanguageMgr").LanguageMgr.getInstance().formatToken(t, e);
  };
  _ctor.formatGold = function (t) {
    return (t + "").replace(/(\d{1,3})(?=(\d{3})+(?:$|\.))/g, "$1,");
  };
  _ctor.randomRang = function (t, e) {
    return Math.floor(Math.random() * (e - t)) + t;
  };
  _ctor.getRange = function (t, e) {
    var n = [];
    for (var i = t; i < e + 1; i++) {
      n.push(i);
    }
    return n;
  };
  _ctor.weight_rand = function (t) {
    var e;
    var n = 0;
    var i = false;
    var a = function (t, e) {
      var n = Math.min(t, e);
      var i = Math.max(t, e);
      var a = 1;
      if (0 === t || 0 === e) {
        return i;
      }
      for (var o = n; o >= 1; o--) {
        if (n % o == 0 && i % o == 0) {
          a = o;
          break;
        }
      }
      return a;
    };
    var o = new Array();
    for (var r = 0; r < t.length; r++) {
      if (undefined !== t[r].weight) {
        if (-1 !== t[r].weight.toString().indexOf("%")) {
          e = Math.floor(t[r].weight.toString().replace("%", ""));
          i = true;
        } else {
          e = Math.floor(100 * t[r].weight);
        }
      } else {
        e = 0;
      }
      o[r] = e;
      n = a(n, e);
    }
    var s = new Array();
    var l = 0;
    var c = 0;
    if (i) {
      for (r = 0; r < t.length; r++) {
        c = o[r];
        for (var h = 0; h < c && !(l >= 100); h++) {
          s.push(r);
          l++;
        }
      }
      for (; l < 100;) {
        s.push(t.length - 1);
        l++;
      }
    } else {
      for (r = 0; r < t.length; r++) {
        c = o[r] / n;
        for (h = 0; h < c; h++) {
          s.push(r);
        }
        l += c;
      }
    }
    return t[s[Math.floor(Math.random() * l)]];
  };
  _ctor.encrypt = function (t, e) {
    if (null == e || e.length <= 0) {
      return null;
    }
    var n = "";
    for (var i = 0; i < e.length; i++) {
      n += e.charCodeAt(i).toString();
    }
    var a = Math.floor(n.length / 5);
    var o = parseInt(n.charAt(a) + n.charAt(2 * a) + n.charAt(3 * a) + n.charAt(4 * a) + n.charAt(5 * a));
    var r = Math.ceil(e.length / 2);
    var s = Math.pow(2, 31) - 1;
    if (o < 2) {
      return null;
    }
    var l = Math.round(1e9 * Math.random()) % 1e8;
    for (n += l; n.length > 10;) {
      n = (parseInt(n.substring(0, 10)) + parseInt(n.substring(10, n.length))).toString();
    }
    n = (o * n + r) % s;
    var c = "";
    var h = "";
    for (i = 0; i < t.length; i++) {
      var g = (t.charCodeAt(i) ^ Math.floor(n / s * 255)) + "";
      h += (c = parseInt(g)) < 16 ? "0" + c.toString(16) : c.toString(16);
      n = (o * n + r) % s;
    }
    for (l = l.toString(16); l.length < 8;) {
      l = "0" + l;
    }
    return h + l;
  };
  _ctor.decrypt = function (t, e) {
    if (!(null == t || t.length < 8 || null == e || e.length <= 0)) {
      var n = "";
      for (var i = 0; i < e.length; i++) {
        n += e.charCodeAt(i).toString();
      }
      var a = Math.floor(n.length / 5);
      var o = parseInt(n.charAt(a) + n.charAt(2 * a) + n.charAt(3 * a) + n.charAt(4 * a) + n.charAt(5 * a));
      var r = Math.round(e.length / 2);
      var s = Math.pow(2, 31) - 1;
      var l = parseInt(t.substring(t.length - 8, t.length), 16);
      t = t.substring(0, t.length - 8);
      for (n += l; n.length > 10;) {
        n = (parseInt(n.substring(0, 10)) + parseInt(n.substring(10, n.length))).toString();
      }
      n = (o * n + r) % s;
      var c = "";
      var h = "";
      for (i = 0; i < t.length; i += 2) {
        c = parseInt((parseInt(t.substring(i, i + 2), 16) ^ Math.floor(n / s * 255)) + "");
        h += String.fromCharCode(c);
        n = (o * n + r) % s;
      }
      return h;
    }
  };
  _ctor.randomDiffIndex = function (t, e, n) {
    var i = this.randomRang(0, t);
    if (this.checkExist(i, n)) {
      this.randomDiffIndex(t, e, n);
    } else {
      n.push(i);
      n.length < e && this.randomDiffIndex(t, e, n);
    }
  };
  _ctor.checkExist = function (t, e) {
    for (var n = 0; n < e.length; n++) {
      if (e[n] == t) {
        return true;
      }
    }
    return false;
  };
  _ctor.mapToJson = function (t) {
    return this.MapTOJson(t);
  };
  _ctor.jsonToMap = function (t) {
    var e = JSON.parse(t);
    var n = new Map();
    var i = 0;
    for (var a = Object.keys(e); i < a.length; i++) {
      var o = a[i];
      n.set(Number(o), Number(e[o]));
    }
    return n;
  };
  _ctor.MapTOJson = function (t) {
    var e = "{";
    var n = 1;
    t.forEach(function (t, i, a) {
      if (a.size == n) {
        e += '"' + i + '":"' + t + '"';
      } else {
        e += '"' + i + '":"' + t + '",';
      }
      n++;
    });
    return e += "}";
  };
  _ctor.isCardID = function (t) {
    var e = 0;
    if (!/^\d{17}(\d|x)$/i.test(t)) {
      return -1;
    }
    t = t.replace(/x$/i, "a");
    if (null == {
      11: "北京",
      12: "天津",
      13: "河北",
      14: "山西",
      15: "内蒙古",
      21: "辽宁",
      22: "吉林",
      23: "黑龙江",
      31: "上海",
      32: "江苏",
      33: "浙江",
      34: "安徽",
      35: "福建",
      36: "江西",
      37: "山东",
      41: "河南",
      42: "湖北",
      43: "湖南",
      44: "广东",
      45: "广西",
      46: "海南",
      50: "重庆",
      51: "四川",
      52: "贵州",
      53: "云南",
      54: "西藏",
      61: "陕西",
      62: "甘肃",
      63: "青海",
      64: "宁夏",
      65: "新疆",
      71: "台湾",
      81: "香港",
      82: "澳门",
      91: "国外"
    }[parseInt(t.substr(0, 2))]) {
      return -2;
    }
    var n = t.substr(6, 4) + "-" + Number(t.substr(10, 2)) + "-" + Number(t.substr(12, 2));
    var i = new Date(n.replace(/-/g, "/"));
    if (n != i.getFullYear() + "-" + (i.getMonth() + 1) + "-" + i.getDate()) {
      return -3;
    }
    for (var a = 17; a >= 0; a--) {
      e += Math.pow(2, a) % 11 * parseInt(t.charAt(17 - a), 11);
    }
    if (e % 11 != 1) {
      return -4;
    } else {
      return 0;
    }
  };
  _ctor.checkAdult = function (t) {
    var e = parseInt(t.substring(6, 14)) + 18e4;
    var n = new Date();
    var i = n.getFullYear();
    var a = n.getMonth() + 1;
    var o = n.getDate();
    return parseInt(i + this.getFormatDate(a) + this.getFormatDate(o)) >= e;
  };
  _ctor.getFormatDate = function (t) {
    if (undefined === t || "" === t) {
      return "";
    }
    var e = t + "";
    e.length < 2 && (e = "0" + e);
    return e;
  };
  _ctor.guid = function () {
    function t() {
      return (65536 * (1 + Math.random()) | 0).toString(16).substring(1);
    }
    return t() + t() + "" + t() + t() + t() + t() + t() + t();
  };
  _ctor.getWebUrlParams = function (t) {
    var e = {};
    var n = t.split("?")[1];
    if (n) {
      var i = n.split("&");
      var a = 0;
      for (var o = i.length; a < o; a++) {
        var r = i[a].split("=");
        e[r[0]] = r[1];
      }
    }
    return e;
  };
  _ctor.saveJsonFile = function (t, e) {
    var n = new Blob([JSON.stringify(e)], {
      type: "application/json"
    });
    n = (n.slice || n.webkitSlice || n.mozSlice).call(n, 0, n.size, "application/octet-stream");
  };
  _ctor.renameObjectKeys = function (t, e) {
    var n = this;
    if ("object" != typeof t || null === t) {
      return t;
    }
    if (!e) {
      return t;
    }
    if (Array.isArray(t)) {
      return t.map(function (t) {
        return n.renameObjectKeys(t, e);
      });
    }
    var i = {};
    for (var a in t) {
      if (e[a]) {
        i[e[a]] = this.renameObjectKeys(t[a], e);
      } else {
        i[a] = this.renameObjectKeys(t[a], e);
      }
    }
    return i;
  };
  _ctor.restoreObjectKeys = function (t, e) {
    var n = this;
    if ("object" != typeof t || null === t) {
      return t;
    }
    if (!e) {
      return t;
    }
    if (Array.isArray(t)) {
      return t.map(function (t) {
        return n.restoreObjectKeys(t, e);
      });
    }
    var i = {};
    var a = function (n) {
      var a = Object.keys(e).find(function (t) {
        return e[t] === n;
      });
      if (a) {
        i[a] = o.restoreObjectKeys(t[n], e);
      } else {
        i[n] = o.restoreObjectKeys(t[n], e);
      }
    };
    var o = this;
    for (var r in t) {
      a(r);
    }
    return i;
  };
  return _ctor;
}();
exports.Utils = exp_Utils;
