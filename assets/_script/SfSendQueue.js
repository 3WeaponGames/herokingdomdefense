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
    n = n || {};
    var c = new exp_SfTrackHttpTask(t, e, n.maxRetries, n.callback, r);
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
      var self = this, task = this._dequeue(), callbacks = [task.callback];
      if (task.taClassName === "HttpTask" && task.serverUrl.indexOf("saveData") >= 0) {
        this.items = this.items.filter(function (candidate) {
          var a = task.data, b = candidate.data;
          if (candidate.taClassName === "HttpTask" && task.serverUrl === candidate.serverUrl && a && b && a.key && a.key === b.key && a.appId === b.appId && a.thirdId === b.thirdId && a.platform === b.platform) {
            callbacks.push(candidate.callback); task = candidate; return false;
          }
          return true;
        });
      }
      task.callback = function (result) {
        try { callbacks.forEach(function (callback) { if (typeof callback === "function") { try { callback(result); } catch (error) { console.error(error); } } }); }
        finally { self.isRunning = false; self._runNext(); }
      };
      task.run();
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
    if (this.completed) return;
    exp_SfTrackHttp.httpPost(this.serverUrl, this.data, function (e) {
      if (e && e.code !== -1 && e.code !== -3) {
        t.onSuccess(e);
      } else {
        t.onFailed();
      }
    });
  };
  t.prototype.onSuccess = function (t) {
    if (this.completed) return;
    this.completed = true;
    this.callback && this.callback(t);
  };
  t.prototype.onFailed = function () {
    var t = this;
    if (--this.tryCount > 0) {
      setTimeout(function () {
        t.run();
      }, 1e3);
    } else {
      this.onSuccess({
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
  function Http() {}
  function request(method, url, data, callback) {
    var xhr, complete = false;
    function finish(value) { if (complete) return; complete = true; if (callback) callback(value); }
    function failure() { finish({ code: -1 }); }
    try {
      var payload = method === "POST" ? JSON.stringify(data == null ? null : data) : null;
      if (method === "GET" && data) {
        var query = Object.keys(data).map(function (key) { return encodeURIComponent(key) + "=" + encodeURIComponent(data[key]); }).join("&");
        if (query) url += (url.indexOf("?") < 0 ? "?" : "&") + query;
      }
      xhr = new XMLHttpRequest(); xhr.open(method, url, true); xhr.timeout = 7000;
      xhr.setRequestHeader("Content-Type", "application/json");
      if (method === "POST" && Http.TOKEN != null) xhr.setRequestHeader("Token", Http.TOKEN);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4 || complete) return;
        if (xhr.status < 200 || xhr.status >= (method === "GET" ? 300 : 400)) { failure(); return; }
        var response;
        try { response = xhr.responseText ? JSON.parse(xhr.responseText) : { code: -1 }; }
        catch (error) { failure(); return; }
        // Consumer exceptions must not be mistaken for JSON failures or call twice.
        finish(response);
      };
      xhr.onerror = xhr.ontimeout = xhr.onabort = failure;
      xhr.send(payload);
    } catch (error) { if (complete) throw error; failure(); }
  }
  Http.httpGet = function (url, data, callback) { request("GET", url, data, callback); };
  Http.httpPost = function (url, data, callback) { request("POST", url, data, callback); };
  return Http;
}();
exports.SfTrackHttp = exp_SfTrackHttp;
