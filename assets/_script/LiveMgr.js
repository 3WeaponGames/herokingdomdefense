Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1Config = require("Config");
var $z1SocketMgr = require("SocketMgr");
var $z1HttpMgr = require("HttpMgr");
var $z1UIMgr = require("UIMgr");
var s = globalThis.electronAPI;
var def_LiveMgr = function () {
  function _ctor() {
    this.url2 = null;
    this.roomUrl = null;
    this.count = 60;
    this.appId = "tte23b94867d0dbf4510";
  }
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.init = function (t) {
    var e = this;
    undefined === t && (t = false);
    if (s && !t) {
      if (this._tokenListenerInstalled) return;
      this._tokenListenerInstalled = true;
      s.ongetToken(function (t, n) {
        var i = null;
        for (var a = 0; Array.isArray(n) && a < n.length; a++) {
          var o = n[a];
          if (typeof o === "string" && -1 != o.indexOf("-token=")) {
            i = o.replace("-token=", "");
            break;
          }
        }
        e.startSocket(i);
      });
      s.getToken();
    } else {
      this.roomId = "xlh1234567891011121314";
      $z1SocketMgr.default.getInstance().startSocket(this.url2, this.roomId, this.appId, true);
      $z1SocketMgr.default.getInstance().setOnMsg(function (t) {
        e.onMsg(t);
      });
    }
  };
  _ctor.prototype.startSocket = function (t) {
    var e = this;
    var request = { token: t, remaining: 60, timer: null };
    if (this._roomRequest && this._roomRequest.timer != null) clearTimeout(this._roomRequest.timer);
    this._roomRequest = request;
    this.count = 60;
    if (t) {
      function attempt() {
        if (e._roomRequest !== request) return;
        var settled = false;
        $z1HttpMgr.HttpMgr.getInstance().httpPost({
          token: t,
          appId: e.appId
        }, function (n) {
          if (settled || e._roomRequest !== request) return;
          settled = true;
          var o = null;
          try { o = typeof n === "string" ? JSON.parse(n) : n; } catch (_) {}
          if (o && 0 == o.code && o.data && o.data.room_id) {
            e.roomId = o.data.room_id;
            $z1SocketMgr.default.getInstance().startSocket(e.url2, e.roomId, e.appId);
            $z1SocketMgr.default.getInstance().setOnMsg(function (t) {
              e.onMsg(t);
            });
          } else if (request.remaining > 0) {
            request.timer = setTimeout(function () {
              request.remaining--;
              e.count = request.remaining;
              attempt();
            }, 1e3);
          } else {
            $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, "[[loc:script.livemgr.text.65]]");
          }
        }, e.roomUrl);
      }
      attempt();
    } else {
      $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, "[[loc:script.livemgr.text.77]]");
    }
  };
  _ctor.prototype.sendTestMsg = function () {
    this.roomId;
    this.appId;
  };
  _ctor.prototype.onMsg = function (t) {
    console.log("接收到消息：", t);
  };
  return _ctor;
}();
exports.default = def_LiveMgr;
