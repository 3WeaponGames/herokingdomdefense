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
    var next;
    try { next = new WebSocket(n); } catch (error) { if (this.onError) this.onError(error); return false; }
    var previous = this._ws;
    this._ws = next;
    if (previous) {
      previous.onmessage = previous.onopen = previous.onerror = previous.onclose = null;
      try { previous.close(); } catch (ignored) {}
    }
    next.binaryType = t.binaryType ? t.binaryType : "arraybuffer";
    next.onmessage = function (event) { if (e._ws === next && e.onMessage) e.onMessage(event.data); };
    next.onopen = function (event) { if (e._ws === next && e.onConnected) e.onConnected(event); };
    next.onerror = function (event) { if (e._ws === next && e.onError) e.onError(event); };
    next.onclose = function (event) { if (e._ws === next) { e._ws = null; if (e.onClosed) e.onClosed(event); } };
    return true;
  };
  _ctor.prototype.send = function (t) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try { this._ws.send(t); return true; } catch (error) { if (this.onError) this.onError(error); return false; }
  };
  _ctor.prototype.close = function (t, e) {
    if (this._ws) this._ws.close(t, e);
  };
  return _ctor;
}();
exports.WebSock = exp_WebSock;
