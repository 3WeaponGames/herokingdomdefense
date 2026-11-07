var i;
var a;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NetNode = exports.NetNodeState = exports.NetTipsType = undefined;
(function (t) {
  t[t.Connecting = 0] = "Connecting";
  t[t.ReConnecting = 1] = "ReConnecting";
  t[t.Requesting = 2] = "Requesting";
})(i = exports.NetTipsType || (exports.NetTipsType = {}));
(function (t) {
  t[t.Closed = 0] = "Closed";
  t[t.Connecting = 1] = "Connecting";
  t[t.Checking = 2] = "Checking";
  t[t.Working = 3] = "Working";
})(a = exports.NetNodeState || (exports.NetNodeState = {}));
var exp_NetNode = function () {
  function _ctor() {
    this._connectOptions = null;
    this._autoReconnect = 0;
    this._isSocketInit = false;
    this._isSocketOpen = false;
    this._state = a.Closed;
    this._socket = null;
    this._networkTips = null;
    this._protocolHelper = null;
    this._connectedCallback = null;
    this._disconnectCallback = null;
    this._callbackExecuter = null;
    this._fixtime = 1500;
    this._needFixSeedHeard = true;
    this._fixSeedTimer = null;
    this._SeedTimer = null;
    this._keepAliveTimer = null;
    this._receiveMsgTimer = null;
    this._reconnectTimer = null;
    this._heartTime = 1e3;
    this._receiveTime = 6e6;
    this._reconnetTimeOut = 1e3;
    this._requests = Array();
    this._listener = {};
  }
  _ctor.prototype.init = function (t, e, n, i) {
    undefined === n && (n = null);
    undefined === i && (i = null);
    console.log("NetNode init socket");
    this._socket = t;
    this._protocolHelper = e;
    this._networkTips = n;
    this._callbackExecuter = i || function (t, e) {
      t.callback.call(t.target, 0, e);
    };
  };
  _ctor.prototype.setOnServerStatus = function (t) {
    this.onServerStatus = t;
  };
  _ctor.prototype.connect = function (t) {
    if (!this._socket || this._state !== a.Closed) return false;
    if (this._reconnectTimer !== null) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (!this._isSocketInit) this.initSocket();
    this._state = a.Connecting; this._intentionalClose = false;
    this._connectionGeneration = (this._connectionGeneration || 0) + 1;
    var accepted;
    try { accepted = this._socket.connect(t); } catch (error) { this.onError(error); }
    if (!accepted) { this._state = a.Closed; this._isSocketOpen = false; this.updateNetTips(i.Connecting, false); return false; }
    if (this._connectOptions === null) this._autoReconnect = t.autoReconnect || 0;
    this._connectOptions = t; this.updateNetTips(i.Connecting, true); return true;
  };
  _ctor.prototype.initSocket = function () {
    var t = this;
    this._socket.onConnected = function (e) {
      t.onConnected(e);
    };
    this._socket.onMessage = function (e) {
      t.onMessage(e);
    };
    this._socket.onError = function (e) {
      t.onError(e);
    };
    this._socket.onClosed = function (e) {
      t.onClosed(e);
    };
    this._isSocketInit = true;
  };
  _ctor.prototype.updateNetTips = function (t, e) {
    if (this._networkTips) {
      if (t == i.Requesting) {
        this._networkTips.requestTips(e);
      } else if (t == i.Connecting) {
        this._networkTips.connectTips(e);
      } else {
        t == i.ReConnecting && this._networkTips.reconnectTips(e);
      }
    }
  };
  _ctor.prototype.onConnected = function () {
    var t = this;
    if (this._intentionalClose) return;
    var generation = this._connectionGeneration;
    this.onServerStatus && this.onServerStatus(0);
    if (this._intentionalClose || generation !== this._connectionGeneration) return;
    console.log("NetNode onConnected!");
    this._isSocketOpen = true;
    if (null !== this._connectedCallback) {
      this._state = a.Checking;
      this._connectedCallback(function () {
        if (!t._intentionalClose && generation === t._connectionGeneration && t._state === a.Checking) t.onChecked();
      });
    } else {
      this.onChecked();
    }
    console.log("NetNode onConnected! state =" + this._state);
    if (this._intentionalClose || generation !== this._connectionGeneration || !this._isSocketOpen) return;
    if (this._SeedTimer !== null) clearInterval(this._SeedTimer);
    this._SeedTimer = setInterval(function () {
      t._needFixSeedHeard && t.send(t._protocolHelper.getHearbeat());
    }, this._fixtime);
  };
  _ctor.prototype.onChecked = function () {
    console.log("NetNode onChecked!");
    this._state = a.Working;
    this.updateNetTips(i.Connecting, false);
    this.updateNetTips(i.ReConnecting, false);
    console.log("NetNode flush " + this._requests.length + " request");
    if (this._requests.length > 0) {
      for (var t = 0; t < this._requests.length;) {
        var e = this._requests[t];
        if (!this._socket.send(e.buffer)) break;
        if (null == e.rspObject || e.rspCmd <= 0) {
          this._requests.splice(t, 1);
        } else {
          ++t;
        }
      }
      this.updateNetTips(i.Requesting, this._requests.length > 0);
    }
  };
  _ctor.prototype.onMessage = function (t) {
    if (this._intentionalClose) return;
    if (this._protocolHelper.checkPackage(t)) {
      this.resetReceiveMsgTimer();
      this.resetFixSeedMsgTimer();
      var e = this._protocolHelper.getPackageId(t);
      console.log("NetNode onMessage rspCmd = " + e);
      if (this._requests.length > 0) {
        for (var n in this._requests) {
          var a = this._requests[n];
          if (a.rspCmd == e) {
            console.log("NetNode execute request rspcmd " + e);
            this._requests.splice(parseInt(n), 1);
            this._callbackExecuter(a.rspObject, t);
            break;
          }
        }
        console.log("NetNode still has " + this._requests.length + " request watting");
        0 == this._requests.length && this.updateNetTips(i.Requesting, false);
      }
      var o = this._listener[e];
      if (null != o) {
        var r = 0;
        for (var s = o.slice(); r < s.length; r++) {
          var l = s[r];
          if (this._listener[e] !== o || o.indexOf(l) < 0) continue;
          console.log("NetNode execute listener cmd " + e);
          this._callbackExecuter(l, t);
        }
      }
    } else {
      console.error("NetNode checkHead Error");
    }
  };
  _ctor.prototype.onError = function (t) {
    console.error(t);
    this.onServerStatus && this.onServerStatus(-1);
  };
  _ctor.prototype.onClosed = function () {
    var t = this;
    var generation = this._connectionGeneration;
    this.clearTimer();
    this._isSocketOpen = false;
    this._state = a.Closed;
    this.onServerStatus && this.onServerStatus(-1);
    if (generation !== this._connectionGeneration || this._intentionalClose) return;
    console.log("socket closed......");
    var reconnect = !this._disconnectCallback || this._disconnectCallback();
    if (generation !== this._connectionGeneration || this._intentionalClose) return;
    if (reconnect) {
      if (this.isAutoReconnect()) {
        this.updateNetTips(i.ReConnecting, true);
        if (generation !== this._connectionGeneration || this._intentionalClose || !this.isAutoReconnect()) return;
        this._reconnectTimer = setTimeout(function () {
          if (generation !== t._connectionGeneration || t._intentionalClose || !t.isAutoReconnect()) return;
          t._reconnectTimer = null;
          // onClosed already owns the closed socket; closing it again can invoke
          // another status callback and replace this connection mid-retry.
          t._autoReconnect > 0 && (t._autoReconnect -= 1);
          t.connect(t._connectOptions);
        }, this._reconnetTimeOut);
      } else {
        this._state = a.Closed;
      }
    } else {
      console.log("disconnect return!");
    }
  };
  _ctor.prototype.close = function (t, e) {
    this._intentionalClose = true;
    this._connectionGeneration = (this._connectionGeneration || 0) + 1;
    this._isSocketOpen = false;
    this._autoReconnect = 0;
    this._connectOptions = null;
    this._state = a.Closed;
    this.clearTimer();
    this._listener = {};
    this._requests.length = 0;
    if (this._networkTips) {
      this._networkTips.connectTips(false);
      this._networkTips.reconnectTips(false);
      this._networkTips.requestTips(false);
    }
    if (this._socket) {
      this._socket.close(t, e);
    } else {
      this._state = a.Closed;
    }
  };
  _ctor.prototype.closeSocket = function (t, e) {
    this._socket && this._socket.close(t, e);
  };
  _ctor.prototype.send = function (t, e) {
    undefined === e && (e = false);
    if (this._state == a.Working || e) {
      return console.log("socket send ..."), this._socket.send(t);
    } else {
      if (this._state == a.Checking || this._state == a.Connecting) {
        return this._requests.push({
          buffer: t,
          rspCmd: 0,
          rspObject: null
        }), console.log("NetNode socket is busy, push to send buffer, current state is " + this._state), true;
      } else {
        return console.error("NetNode request error! current state is " + this._state), false;
      }
    }
  };
  _ctor.prototype.request = function (t, e, n, o, r) {
    undefined === o && (o = true);
    undefined === r && (r = false);
    (this._state == a.Working || r) && this._socket.send(t);
    console.log("NetNode request with timeout for " + e);
    this._requests.push({
      buffer: t,
      rspCmd: e,
      rspObject: n
    });
    o && this.updateNetTips(i.Requesting, true);
  };
  _ctor.prototype.requestUnique = function (t, e, n, i, a) {
    undefined === i && (i = true);
    undefined === a && (a = false);
    for (var o = 0; o < this._requests.length; ++o) {
      if (this._requests[o].rspCmd == e) {
        console.log("NetNode requestUnique faile for " + e);
        return false;
      }
    }
    this.request(t, e, n, i, a);
    return true;
  };
  _ctor.prototype.setResponeHandler = function (t, e, n) {
    if (null == e) {
      return console.error("NetNode setResponeHandler error " + t), false;
    } else {
      return this._listener[t] = [{
        target: n,
        callback: e
      }], true;
    }
  };
  _ctor.prototype.addResponeHandler = function (t, e, n) {
    if (null == e) {
      console.error("NetNode addResponeHandler error " + t);
      return false;
    }
    var i = {
      target: n,
      callback: e
    };
    if (null == this._listener[t]) {
      this._listener[t] = [i];
    } else {
      -1 == this.getNetListenersIndex(t, i) && this._listener[t].push(i);
    }
    return true;
  };
  _ctor.prototype.removeResponeHandler = function (t, e, n) {
    if (null != this._listener[t] && null != e) {
      var i = this.getNetListenersIndex(t, {
        target: n,
        callback: e
      });
      -1 != i && this._listener[t].splice(i, 1);
    }
  };
  _ctor.prototype.cleanListeners = function (t) {
    undefined === t && (t = -1);
    if (-1 == t) {
      this._listener = {};
    } else {
      this._listener[t] = null;
    }
  };
  _ctor.prototype.getNetListenersIndex = function (t, e) {
    var n = -1;
    for (var i = 0; i < this._listener[t].length; i++) {
      var a = this._listener[t][i];
      if (a.callback == e.callback && a.target == e.target) {
        n = i;
        break;
      }
    }
    return n;
  };
  _ctor.prototype.resetFixSeedMsgTimer = function () {
    var t = this;
    this._needFixSeedHeard = false;
    null !== this._fixSeedTimer && clearTimeout(this._fixSeedTimer);
    this._fixSeedTimer = setTimeout(function () {
      t._needFixSeedHeard = true;
    }, this._fixtime);
  };
  _ctor.prototype.resetReceiveMsgTimer = function () {
    var t = this;
    null !== this._receiveMsgTimer && clearTimeout(this._receiveMsgTimer);
    this._receiveMsgTimer = setTimeout(function () {
      console.warn("NetNode recvieMsgTimer close socket!");
      t._socket.close();
    }, this._receiveTime);
  };
  _ctor.prototype.resetHearbeatTimer = function () {
    var t = this;
    null !== this._keepAliveTimer && clearTimeout(this._keepAliveTimer);
    this._keepAliveTimer = setTimeout(function () {
      console.log("NetNode keepAliveTimer send Hearbeat");
      t.send(t._protocolHelper.getHearbeat());
    }, this._heartTime);
  };
  _ctor.prototype.clearTimer = function () {
    null !== this._SeedTimer && clearInterval(this._SeedTimer);
    null !== this._fixSeedTimer && clearTimeout(this._fixSeedTimer);
    null !== this._receiveMsgTimer && clearTimeout(this._receiveMsgTimer);
    null !== this._keepAliveTimer && clearTimeout(this._keepAliveTimer);
    null !== this._reconnectTimer && clearTimeout(this._reconnectTimer);
    this._SeedTimer = this._fixSeedTimer = this._receiveMsgTimer = this._keepAliveTimer = this._reconnectTimer = null;
    this._needFixSeedHeard = true;
  };
  _ctor.prototype.isAutoReconnect = function () {
    return 0 != this._autoReconnect;
  };
  _ctor.prototype.rejectReconnect = function () {
    this._autoReconnect = 0;
    this.clearTimer();
  };
  return _ctor;
}();
exports.NetNode = exp_NetNode;
