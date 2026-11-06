Object.defineProperty(exports, "__esModule", {
  value: true
});
var i;
var $z1NetInterface = require("NetInterface");
var $z1NetManager = require("NetManager");
var $z1NetNode = require("NetNode");
var $z1WebSock = require("WebSock");
(function (t) {
  t[t.stoped = -1] = "stoped";
  t[t.started = 0] = "started";
})(i || (i = {}));
var def_SocketMgr = function () {
  function _ctor() {}
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.startSocket = function (t, e, n, l) {
    var c = this;
    undefined === l && (l = false);
    if (!this.netNode) {
      this.wsUrl = t;
      this.roomId = e;
      this.appId = n;
      var h = new $z1NetNode.NetNode();
      this.netNode = h;
      var g = new $z1WebSock.WebSock();
      h.init(g, new $z1NetInterface.DefStringProtocol(), null);
      h.setResponeHandler(0, function (t, e) {
        var n = e;
        c.onMsg(n);
      });
      h.setOnServerStatus(function (t) {
        t == i.stoped || i.started;
      });
      var u = this.wsUrl + "?roomId=" + this.roomId + "&appId=" + this.appId + "&test=" + (l ? "1" : "0");
      $z1NetManager.NetManager.getInstance().setNetNode(h);
      $z1NetManager.NetManager.getInstance().connect({
        url: u,
        autoReconnect: -1
      });
    }
  };
  _ctor.prototype.onMsg = function (t) {
    this.onmsgFun && this.onmsgFun(t);
  };
  _ctor.prototype.setOnMsg = function (t) {
    this.onmsgFun = t;
  };
  _ctor.prototype.sendMsg = function (t, e) {
    undefined === e && (e = true);
    var n = {
      data: e ? JSON.stringify(t) : t
    };
    var i = JSON.stringify(n);
    $z1NetManager.NetManager.getInstance().send(i);
  };
  return _ctor;
}();
exports.default = def_SocketMgr;