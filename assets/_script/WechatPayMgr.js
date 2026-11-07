Object.defineProperty(exports, "__esModule", { value: true });
exports.WechatPayMgr = exports.WXPayInfo = undefined;
var $z1HttpMgr = require("HttpMgr");
exports.WXPayInfo = function () {};
function once(callback) {
  var called = false;
  return function () { if (!called) { called = true; callback && callback.apply(null, arguments); } };
}
function response(value) {
  try { var result = typeof value === "string" ? JSON.parse(value) : value; return result && typeof result === "object" && result.code != null ? result : null; }
  catch (_) { return null; }
}
function sdk() { return typeof wx !== "undefined" ? wx : null; }
function text(key) { return require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:" + key + "]]"); }
function toast(key, success) {
  var host = sdk();
  host && host.showToast && host.showToast({ title: text(key), icon: success ? "success" : "error", duration: 2000 });
}
function diagnostic(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}
var exp_WechatPayMgr = function () {
  function _ctor() {
    this.openIdKey = "payopenkey"; this.payUrl = null; this.reqtime = 0;
    this.isCallback = false; this.isPaying = false; this._payment = null;
  }
  _ctor.prototype._beginPayment = function (callback) {
    if (this.isPaying) { toast("script.wechatpaymgr.text.20"); callback && callback(false, text("script.wechatpaymgr.text.20")); return null; }
    var manager = this;
    var request = { done: false, callback: once(callback), pollTimer: null, deadline: null, loading: false, inFlight: false };
    this._payment = request; this.isPaying = true; this.isCallback = false; this.reqtime = 0;
    // Bound login, host payment and verification together; retain the prior 120 x 2s verification limit.
    request.deadline = setTimeout(function () { manager._finishPayment(request, false, text("script.wechatpaymgr.text.194"), "script.wechatpaymgr.text.194"); }, 240000);
    return request;
  };
  _ctor.prototype._finishPayment = function (request, success, message, toastKey) {
    if (!request || request.done || this._payment !== request) return;
    request.done = true; clearTimeout(request.deadline); clearTimeout(request.pollTimer);
    this._payment = null; this.isPaying = false; this.isCallback = true;
    var host = sdk();
    try {
      request.loading && host && host.hideLoading && host.hideLoading();
      toastKey && toast(toastKey, success);
    }
    finally { request.callback(success, message); }
  };
  _ctor.prototype.startPayItem = function (productId, price, callback, quantity) {
    var manager = this, request = this._beginPayment(callback);
    if (!request) return;
    var host = sdk();
    function active() { return !request.done && manager._payment === request; }
    function fail(details, key) { manager._finishPayment(request, false, text("script.wechatpaymgr.text.66") + diagnostic(details), key || "script.wechatpaymgr.text.60"); }
    if (!host || typeof host.requestMidasPaymentGameItem !== "function") return fail();
    try {
      this.getAppId();
      this.getOpenId(function (openId) {
        if (!active()) return;
        if (!openId) return manager._finishPayment(request, false, text("script.wechatpaymgr.text.33"), "script.wechatpaymgr.text.33");
        manager.openId = openId;
        $z1HttpMgr.HttpMgr.getInstance().httpPost({ appid: manager.appId, openid: openId, productId: productId, goodsPrice: price, buyQuantity: quantity === undefined ? 1 : quantity }, once(function (raw) {
          if (!active()) return;
          var result = response(raw), signed;
          try { signed = result && result.data && JSON.parse(result.data.signData); } catch (_) {}
          if (!result || result.code != 0 || !signed || !signed.outTradeNo || typeof result.data.paySig !== "string" || typeof result.data.signature !== "string") return fail(raw);
          var settled = false;
          try {
            host.requestMidasPaymentGameItem({ signData: result.data.signData, paySig: result.data.paySig, signature: result.data.signature,
              success: function () { if (!settled && active()) { settled = true; manager.paySuccess(signed.outTradeNo, callback, request); } },
              fail: function (error) { if (!settled) { settled = true; fail(error); } }
            });
          } catch (error) { if (request.done) throw error; fail(); }
        }), manager.payUrl + "genOrder", true);
      });
    } catch (error) { if (request.done) throw error; fail(); }
  };
  _ctor.prototype.paySuccess = function (orderId, callback, request) {
    var manager = this; request = request || this._beginPayment(callback);
    if (!request || request.done || this._payment !== request) return;
    var host = sdk(); request.loading = true;
    host && host.showLoading && host.showLoading({ title: text("script.wechatpaymgr.text.154"), mask: true });
    function poll() {
      if (request.done || manager._payment !== request || request.inFlight) return;
      request.inFlight = true;
      manager.requestOrder({ orderid: orderId, appId: manager.appId }, function (result) {
        if (request.done || manager._payment !== request) return;
        request.inFlight = false;
        if (result.code == 1 && manager.reqtime < 120) request.pollTimer = setTimeout(poll, 2000);
        else {
          var key = result.code == 0 ? "payment.completed" : result.code == 1 || result.code == -6 ? "script.wechatpaymgr.text.194" : "payment.unconfirmed";
          manager._finishPayment(request, result.code == 0, result.code == 0 ? "success" : text(key), key);
        }
      });
    }
    request.pollTimer = setTimeout(poll, 2000);
  };
  _ctor.prototype.requestOrder = function (order, callback) {
    var finish = once(callback); this.reqtime++;
    try { $z1HttpMgr.HttpMgr.getInstance().httpPost(order, function (raw) { finish(response(raw) || { code: -1, msg: "Invalid order response" }); }, this.payUrl + "queryOrder"); }
    catch (_) { finish({ code: -1, msg: "Order request failed" }); }
  };
  _ctor.prototype.queryOrder = function (callback) {
    var manager = this, finish = once(callback); this.appId || this.getAppId();
    function fail() { toast("payment.queryFailed"); finish([]); }
    function query(openId) {
      if (!openId) return fail();
      try { $z1HttpMgr.HttpMgr.getInstance().httpPost({ appId: manager.appId, openId: openId }, function (raw) {
        var result = response(raw), items = [];
        if (!result || result.code != 0 || !Array.isArray(result.data)) return fail();
        result.data.forEach(function (row) {
          if (!row || row.payid == null) return;
          var item = items.filter(function (item) { return item.productId == row.payid; })[0];
          if (item) item.num++; else items.push({ productId: row.payid, num: 1 });
        });
        finish(items);
      }, manager.payUrl + "queryAllOrder"); } catch (_) { fail(); }
    }
    if (this.openId) query(this.openId); else this.getOpenId(query);
  };
  _ctor.prototype.getAppId = function () {
    var host = sdk(), account = host && host.getAccountInfoSync && host.getAccountInfoSync();
    this.appId = account && account.miniProgram && account.miniProgram.appId || null; return this.appId;
  };
  _ctor.prototype.getOpenId = function (callback) {
    var manager = this, finish = once(callback), host = sdk(); if (!host) return finish(null);
    var cached = this.openId;
    if (!cached && host.getStorageSync) {
      [this.openIdKey, "igame_openId", "um_od"].some(function (key) {
        try { cached = host.getStorageSync(key); } catch (_) {}
        return !!cached;
      });
    }
    if (!cached) return this.login(finish);
    try { $z1HttpMgr.HttpMgr.getInstance().httpPost({ appId: this.appId, openId: cached }, once(function (raw) {
      var result = response(raw);
      if (result && result.code == 0 && result.data != null && result.data != -1) { manager.openId = cached; finish(cached); }
      else if (result && result.data == -1) manager.login(finish);
      else finish(null);
    }), this.payUrl + "checkSessionKey"); } catch (_) { finish(null); }
  };
  _ctor.prototype._login = function (byKey, callback) {
    var manager = this, finish = once(callback), host = sdk();
    if (!host || typeof host.login !== "function") return finish(null, null);
    var hostSettled = false;
    try { host.login({ success: function (login) {
      if (hostSettled) return; hostSettled = true;
      if (!login || !login.code) return finish(null, null);
      try { $z1HttpMgr.HttpMgr.getInstance().httpPost({ appId: manager.appId, code: login.code }, once(function (raw) {
        var result = response(raw), identity = result && result.code == 0 && (byKey ? result.data && result.data.openid : result.data);
        if (typeof identity !== "string" || !identity) return finish(null, null);
        manager.openId = identity;
        ["igame_openId", "um_od"].forEach(function (key) {
          try { if (host.setStorageSync) host.setStorageSync(key, identity); } catch (_) {}
        });
        finish(identity, byKey ? result.data.key : undefined);
      }), manager.payUrl + (byKey ? "getOpenIdByKey" : "getOpenId")); } catch (_) { finish(null, null); }
    }, fail: function () { if (!hostSettled) { hostSettled = true; finish(null, null); } } }); } catch (_) { finish(null, null); }
  };
  _ctor.prototype.loginByKey = function (callback) { this.appId || this.getAppId(); this._login(true, callback); };
  _ctor.prototype.login = function (callback) { this._login(false, callback); };
  _ctor.prototype.iLog = function () { console.log("SF_WxPay:", Array.prototype.slice.call(arguments)); };
  Object.defineProperty(_ctor, "instance", { get: function () { this._instance || (this._instance = new _ctor()); return this._instance; }, enumerable: false, configurable: true });
  return _ctor;
}();
exports.WechatPayMgr = exp_WechatPayMgr;
