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
    return cc.js.formatStr.apply(cc.js, [t].concat(e));
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
    if (!Array.isArray(t) || !t.length) return undefined;
    var percent = t.some(function (item) { return item && typeof item.weight === "string" && item.weight.indexOf("%") !== -1; });
    var weights = t.map(function (item) {
      var raw = item && item.weight;
      var value = typeof raw === "string" && raw.indexOf("%") !== -1 ? Number(raw.replace("%", "")) : Number(raw);
      if (!isFinite(value) || value <= 0) return 0;
      return percent ? Math.floor(typeof raw === "string" && raw.indexOf("%") !== -1 ? value : 100 * value) : value;
    });
    // Percent mode has always capped the ordered entries at 100 and assigned
    // the unclaimed remainder to the final entry. Numeric mode is relative.
    var total = 100;
    if (!percent) {
      var maximum = 0;
      for (var k = 0; k < weights.length; k++) maximum = Math.max(maximum, weights[k]);
      if (!maximum) return undefined;
      total = 0;
      for (k = 0; k < weights.length; k++) total += weights[k] /= maximum;
    }
    var draw = Math.random() * total;
    var last;
    for (var index = 0; index < weights.length; index++) {
      if (weights[index] > 0) last = t[index];
      if (draw < weights[index]) return t[index];
      draw -= weights[index];
    }
    return percent ? t[t.length - 1] : last;
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
    if (!Number.isInteger(t) || t < 0 || !Number.isInteger(e) || e < 0 || e > t) throw new RangeError("Invalid unique-index count");
    if (n.length >= e) return;
    var available = [];
    for (var i = 0; i < t; i++) if (!this.checkExist(i, n)) available.push(i);
    if (available.length < e - n.length) throw new RangeError("Not enough unique indices");
    while (n.length < e) {
      var index = this.randomRang(0, available.length);
      n.push(available[index]);
      available[index] = available[available.length - 1];
      available.pop();
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
    var entries = [];
    t.forEach(function (value, key) {
      entries.push(JSON.stringify(String(key)) + ":" + JSON.stringify(String(value)));
    });
    return "{" + entries.join(",") + "}";
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
    var url = String(t).split("#")[0];
    var queryIndex = url.indexOf("?");
    var n = queryIndex < 0 ? "" : url.slice(queryIndex + 1);
    function decode(value) {
      value = value.replace(/\+/g, " ");
      try { return decodeURIComponent(value); } catch (_) { return value; }
    }
    if (n) {
      var i = n.split("&");
      var a = 0;
      for (var o = i.length; a < o; a++) {
        if (!i[a]) continue;
        var split = i[a].indexOf("=");
        var key = decode(split < 0 ? i[a] : i[a].slice(0, split));
        var value = split < 0 ? undefined : decode(i[a].slice(split + 1));
        Object.defineProperty(e, key, { value: value, enumerable: true, writable: true, configurable: true });
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
    Object.keys(t).forEach(function (a) {
      var key = Object.prototype.hasOwnProperty.call(e, a) ? e[a] : a;
      Object.defineProperty(i, key, { value: n.renameObjectKeys(t[a], e), enumerable: true, writable: true, configurable: true });
    });
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
        return String(e[t]) === n;
      });
      Object.defineProperty(i, a === undefined ? n : a, { value: o.restoreObjectKeys(t[n], e), enumerable: true, writable: true, configurable: true });
    };
    var o = this;
    Object.keys(t).forEach(a);
    return i;
  };
  return _ctor;
}();
exports.Utils = exp_Utils;
