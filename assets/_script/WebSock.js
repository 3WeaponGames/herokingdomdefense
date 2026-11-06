Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WebSock = undefined;
var exp_WebSock = function () {
  function _ctor() {
    this._ws = null;
    this.onConnected = null;
    this.onMessage = null;
    this.onError = null;
    this.onClosed = null;
  }
  _ctor.prototype.connect = function (t) {
    var e = this;
    if (this._ws && this._ws.readyState === WebSocket.CONNECTING) {
      console.log("websocket connecting, wait for a moment...");
      return false;
    }
    var n = null;
    if (t.url) {
      n = t.url;
    } else {
      var i = t.ip;
      var a = t.port;
      n = t.protocol + "://" + i + ":" + a;
    }
    console.log("连接：" + n);
    this._ws = new WebSocket(n);
    this._ws.binaryType = t.binaryType ? t.binaryType : "arraybuffer";
    this._ws.onmessage = function (t) {
      e.onMessage(t.data);
    };
    this._ws.onopen = this.onConnected;
    this._ws.onerror = this.onError;
    this._ws.onclose = this.onClosed;
    return true;
  };
  _ctor.prototype.send = function (t) {
    return this._ws.readyState == WebSocket.OPEN && (this._ws.send(t), true);
  };
  _ctor.prototype.close = function (t, e) {
    this._ws.close(t, e);
  };
  return _ctor;
}();
exports.WebSock = exp_WebSock;