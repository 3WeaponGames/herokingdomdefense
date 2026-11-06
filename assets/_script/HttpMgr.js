Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.HttpMgr = undefined;
var $z1BasePlatform = require("BasePlatform");
var $z1PlatformSetting = require("PlatformSetting");
var exp_HttpMgr = function () {
  function _ctor() {}
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.httpGet = function (t, e, n) {
    var o = new XMLHttpRequest();
    if (e) {
      var r = "";
      Object.keys(e).forEach(function (t) {
        r += t + "=" + encodeURIComponent(e[t]) + "&";
      });
      "" !== r && (t = t + "?" + (r = r.substr(0, r.lastIndexOf("&"))));
    }
    o.open("GET", t, true);
    o.setRequestHeader("Access-Control-Allow-Origin", "*");
    o.setRequestHeader("Access-Control-Allow-Methods", "GET, POST");
    o.setRequestHeader("Access-Control-Allow-Headers", "x-requested-with,content-type");
    o.setRequestHeader("Content-Type", "application/json");
    $z1PlatformSetting.PlatformSetting.currentPlatform != $z1BasePlatform.Platform.KuaiShou && o.setRequestHeader("Accept-Encoding", "gzip");
    o.onreadystatechange = function () {
      if (4 === o.readyState) {
        var t = o.responseText;
        if (o.status >= 200 && o.status < 300) {
          o.statusText;
          n(true, t);
        } else {
          n(false, "");
        }
      }
    };
    o.ontimeout = function () {
      n && n(null);
    };
    o.onerror = function () {
      n && n(null);
    };
    o.send();
  };
  _ctor.prototype.httpPost = function (e, n, o, r) {
    undefined === e && (e = null);
    var s = null;
    if (e) {
      if (r) {
        s = JSON.stringify(e);
      } else {
        s = "";
        Object.keys(e).forEach(function (t) {
          s += t + "=" + encodeURIComponent(e[t]) + "&";
        });
        "" !== s && (s = s.substr(0, s.lastIndexOf("&")));
      }
    }
    var l = o;
    var c = new XMLHttpRequest();
    c.timeout = 7e3;
    c.open("POST", l, true);
    c.setRequestHeader("Access-Control-Allow-Origin", "*");
    c.setRequestHeader("Access-Control-Allow-Methods", "GET, POST");
    c.setRequestHeader("Access-Control-Allow-Headers", "x-requested-with,content-type");
    if (r) {
      c.setRequestHeader("Content-Type", "application/json");
    } else {
      c.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    }
    if ($z1PlatformSetting.PlatformSetting.currentPlatform != $z1BasePlatform.Platform.KuaiShou) {
      c.setRequestHeader("Connection", "close");
      c.setRequestHeader("Accept-Encoding", "gzip");
    }
    c.onreadystatechange = function () {
      if (4 === c.readyState) {
        if (c.status >= 200 && c.status < 400) {
          var e = c.responseText;
          _ctor.isPass(e) && n && n(e);
        } else {
          n && n(null);
        }
      }
    };
    c.ontimeout = function () {
      n && n(null);
    };
    c.onerror = function () {
      n && n(null);
    };
    if (s) {
      c.send(s);
    } else {
      c.send();
    }
  };
  _ctor.isPass = function () {
    return true;
  };
  return _ctor;
}();
exports.HttpMgr = exp_HttpMgr;