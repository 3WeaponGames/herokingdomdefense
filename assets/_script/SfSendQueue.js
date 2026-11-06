Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SfTrackHttp = exports.SfTrackUtils = exports.SfTrackHttpTask = exports.SendConfig = exports.SendQueue = exports.SfTrackSendQueue = undefined;
var exp_SfTrackSendQueue = function () {
  function _ctor() {
    this.isRunning = false;
    this.items = [];
    this.isRunning = false;
  }
  _ctor.prototype.enqueue = function (t, e, n, i, r) {
    var s = this;
    undefined === i && (i = true);
    var l = this;
    var c = new exp_SfTrackHttpTask(t, e, n.maxRetries, function (t) {
      l.isRunning = false;
      exp_SfTrackUtils.isFunction(n.callback) && n.callback(t);
      l._runNext();
    }, r);
    if (true === i) {
      this.items.push(c);
      setTimeout(function () {
        s._runNext();
      }, 500);
    } else {
      c.run();
    }
  };
  _ctor.prototype._dequeue = function () {
    return this.items.shift();
  };
  _ctor.prototype._runNext = function () {
    if (this.items.length > 0 && !this.isRunning) {
      this.isRunning = true;
      if ("HttpTask" !== this.items[0].taClassName) {
        this._dequeue().run();
      } else {
        var t = this.items.splice(0, this.items.length);
        var e = t[0];
        var n = e.data;
        var i = e.callback;
        for (var o = 1; o < t.length; o++) {
          var r = t[o];
          var s = r.data;
          if (-1 != e.serverUrl.indexOf("saveData") && e.serverUrl === r.serverUrl && n.key && s.key && n.key == s.key) {
            if (e.createtime < r.createtime) {
              n = s, e = r;
            }
          } else {
            this.items.push(r);
          }
        }
        new exp_SfTrackHttpTask(n, e.serverUrl, e.tryCount, i).run();
      }
    }
  };
  return _ctor;
}();
exports.SfTrackSendQueue = exp_SfTrackSendQueue;
exports.SendQueue = new exp_SfTrackSendQueue();
exports.SendConfig = function () {
  this.maxRetries = 5;
};
var exp_SfTrackHttpTask = function () {
  function t(t, e, n, i, a) {
    this.tryCount = 0;
    this.createtime = 0;
    this.taClassName = "HttpTask";
    this.data = t;
    this.serverUrl = e;
    this.callback = i;
    this.tryCount = n || 1;
    this.createtime = new Date().getTime();
    a && (this.taClassName = a);
  }
  t.prototype.run = function () {
    var t = this;
    exp_SfTrackHttp.httpPost(this.serverUrl, this.data, function (e) {
      if (e) {
        t.onSuccess(e);
      } else {
        t.onFailed();
      }
    });
  };
  t.prototype.onSuccess = function (t) {
    this.callback && this.callback(t);
  };
  t.prototype.onFailed = function () {
    var t = this;
    if (--this.tryCount > 0) {
      setTimeout(function () {
        t.run();
      }, 1e3);
    } else {
      this.callback({
        code: -3,
        msg: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.sfsendqueue.text.98]]")
      });
    }
  };
  return t;
}();
exports.SfTrackHttpTask = exp_SfTrackHttpTask;
var exp_SfTrackUtils = function () {
  function t() {}
  t.is = function (t, e) {
    return Object.prototype.toString.call(t) === "[object " + e + "]";
  };
  t.isNumber = function (t) {
    return this.is(t, "Number");
  };
  t.isFunction = function (t) {
    return this.is(t, "Function");
  };
  t.createUUID = function () {
    return this.getRandomStr(10) + Date.now() + this.getRandomStr(7) + this.UUID_SUFFIX;
  };
  t.getRandomStr = function (t) {
    var e = "";
    var n = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
    for (var i = 0; i < t; i++) {
      e += n[Math.round(Math.random() * (n.length - 1))];
    }
    return e;
  };
  t.UUID_SUFFIX = "ud";
  return t;
}();
exports.SfTrackUtils = exp_SfTrackUtils;
var exp_SfTrackHttp = function () {
  function t() {}
  t.httpGet = function (t, e, n) {
    var i = this.xhrM ? this.xhrM : this.xhrM = new XMLHttpRequest();
    if (e) {
      var a = "";
      Object.keys(e).forEach(function (t) {
        a += t + "=" + encodeURIComponent(e[t]) + "&";
      });
      "" !== a && (t = t + "?" + (a = a.substr(0, a.lastIndexOf("&"))));
    }
    i.open("GET", t, true);
    i.setRequestHeader("Access-Control-Allow-Origin", "*");
    i.setRequestHeader("Access-Control-Allow-Methods", "GET, POST");
    i.setRequestHeader("Access-Control-Allow-Headers", "x-requested-with,content-type");
    i.setRequestHeader("Content-Type", "application/json");
    i.setRequestHeader("Connection", "keep-alive");
    i.setRequestHeader("Accept-Encoding", "gzip, deflate, br, compress, zstd");
    i.onreadystatechange = function () {
      if (4 === i.readyState) {
        if (i.status >= 200 && i.status < 300) {
          var t = i.responseText;
          try {
            if (n && t) {
              n(JSON.parse(t));
            } else {
              n && n({
                code: -1
              });
            }
          } catch (e) {
            n && n({
              code: -1,
              msg: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.sfsendqueue.text.164]]")
            });
          }
        } else {
          n({
            code: -1
          });
        }
      }
    };
    i.ontimeout = function () {
      n && n({
        code: -1
      });
    };
    i.onerror = function () {
      n && n({
        code: -1
      });
    };
    i.send();
  };
  t.httpPost = function (t, e, n) {
    var i;
    undefined === e && (e = null);
    i = JSON.stringify(e);
    var a = t;
    var o = this.xhrM ? this.xhrM : this.xhrM = new XMLHttpRequest();
    o.timeout = 7e3;
    o.open("POST", a, true);
    o.setRequestHeader("Access-Control-Allow-Origin", "*");
    o.setRequestHeader("Access-Control-Allow-Methods", "GET, POST");
    o.setRequestHeader("Access-Control-Allow-Headers", "x-requested-with,content-type");
    o.setRequestHeader("Content-Type", "application/json");
    o.setRequestHeader("Token", this.TOKEN);
    o.setRequestHeader("Connection", "keep-alive");
    o.setRequestHeader("Accept-Encoding", "gzip");
    o.onreadystatechange = function () {
      if (4 === o.readyState) {
        if (o.status >= 200 && o.status < 400) {
          var t = o.responseText;
          try {
            if (n && t) {
              n(JSON.parse(t));
            } else {
              n && n({
                code: 0
              });
            }
          } catch (e) {
            n && n({
              code: 0,
              msg: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.sfsendqueue.text.164]]")
            });
          }
        } else {
          n && n && n({
            code: -1,
            msg: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.sfsendqueue.text.98]]")
          });
        }
      }
    };
    o.ontimeout = function () {
      n && n({
        code: -1,
        msg: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.sfsendqueue.text.230]]")
      });
    };
    o.onerror = function () {
      n && n({
        code: -1,
        msg: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.sfsendqueue.text.236]]")
      });
    };
    if (i) {
      o.send(i);
    } else {
      o.send();
    }
  };
  return t;
}();
exports.SfTrackHttp = exp_SfTrackHttp;