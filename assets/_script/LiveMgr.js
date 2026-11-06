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
      s.ongetToken(function (t, n) {
        var i = null;
        for (var a = 0; a < n.length; a++) {
          var o = n[a];
          if (-1 != o.indexOf("-token=")) {
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
    if (t) {
      $z1HttpMgr.HttpMgr.getInstance().httpPost({
        token: t,
        appId: this.appId
      }, function (n) {
        if (n) {
          var o = JSON.parse(n);
          if (o && 0 == o.code && o.data) {
            e.roomId = o.data.room_id;
            $z1SocketMgr.default.getInstance().startSocket(e.url2, e.roomId, e.appId);
            $z1SocketMgr.default.getInstance().setOnMsg(function (t) {
              e.onMsg(t);
            });
          } else if (e.count > 0) {
            setTimeout(function () {
              e.count--;
              e.startSocket(t);
            }, 1e3);
          } else {
            $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, "[[loc:script.livemgr.text.65]]");
          }
        } else if (e.count > 0) {
          setTimeout(function () {
            e.count--;
            e.startSocket(t);
          }, 1e3);
        } else {
          $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, "[[loc:script.livemgr.text.65]]");
        }
      }, this.roomUrl);
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