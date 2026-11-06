Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WechatPayMgr = exports.WXPayInfo = undefined;
var $z1HttpMgr = require("HttpMgr");
exports.WXPayInfo = function () {};
var exp_WechatPayMgr = function () {
  function _ctor() {
    this.openIdKey = "payopenkey";
    this.payUrl = null;
    this.reqtime = 0;
    this.isCallback = false;
    this.isPaying = false;
  }
  _ctor.prototype.startPayItem = function (t, e, n, a) {
    var o = this;
    undefined === a && (a = 1);
    if (this.isPaying) {
      wx.showToast({
        title: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.wechatpaymgr.text.20]]"),
        icon: "error",
        duration: 2e3
      });
      return void n(false, require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.wechatpaymgr.text.20]]"));
    }
    this.isPaying = true;
    this.reqtime = 0;
    this.isCallback = false;
    this.getAppId();
    this.getOpenId(function (r) {
      if (!r) {
        wx.showToast({
          title: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.wechatpaymgr.text.33]]"),
          icon: "error",
          duration: 2e3
        });
        return void n(false, require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.wechatpaymgr.text.33]]"));
      }
      var s = {
        appid: o.appId,
        openid: o.openId,
        productId: t,
        goodsPrice: e,
        buyQuantity: a
      };
      $z1HttpMgr.HttpMgr.getInstance().httpPost(s, function (t) {
        var e = JSON.parse(t);
        if (e && 0 == e.code) {
          wx.requestMidasPaymentGameItem({
            signData: e.data.signData,
            paySig: e.data.paySig,
            signature: e.data.signature,
            success: function () {
              var t = JSON.parse(e.data.signData);
              o.isPaying = false;
              o.paySuccess(t.outTradeNo, n);
            },
            fail: function (t, e) {
              wx.showToast({
                title: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.wechatpaymgr.text.60]]"),
                icon: "error",
                duration: 2e3
              });
              o.isPaying = false;
              console.error(e + " 支付失败:", JSON.stringify(t));
              n && n(false, require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.wechatpaymgr.text.66]]") + JSON.stringify(t));
            }
          });
        } else {
          o.isPaying = false;
          wx.showToast({
            title: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.wechatpaymgr.text.60]]"),
            icon: "error",
            duration: 2e3
          });
          n && n(false, require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.wechatpaymgr.text.66]]") + t);
        }
      }, o.payUrl + "genOrder", true);
    });
  };
  _ctor.prototype.queryOrder = function (t) {
    var e = this;
    this.appId || this.getAppId();
    var n = function () {
      var n = {
        appId: e.appId,
        openId: e.openId
      };
      $z1HttpMgr.HttpMgr.getInstance().httpPost(n, function (e) {
        if (e && e.startsWith("{")) {
          var n = JSON.parse(e);
          if (0 == n.code) {
            var i = new Array();
            var a = n.data;
            for (var o = 0; o < a.length; o++) {
              var r = a[o];
              var s = false;
              for (var l = 0; l < i.length; l++) {
                var c = i[l];
                if (c.productId == r.payid) {
                  s = true;
                  c.num++;
                  break;
                }
              }
              s || i.push({
                productId: r.payid,
                num: 1
              });
            }
            t && t(i);
          } else {
            wx.showToast({
              title: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:payment.queryFailed]]"),
              icon: 0 == n ? "success" : "error",
              duration: 2e3
            });
            t && t([]);
          }
        }
      }, e.payUrl + "queryAllOrder");
    };
    if (this.openId) {
      n();
    } else {
      var a = wx.getStorageSync(this.openIdKey);
      var o = wx.getStorageSync("igame_openId");
      var r = wx.getStorageSync("um_od");
      if (a || o || r) {
        if (a) {
          this.openId = a;
        } else if (o) {
          this.openId = o;
        } else {
          r && (this.openId = r);
        }
        if (this.openId) {
          n();
        } else {
          this.getOpenId(function () {
            n();
          });
        }
      } else {
        this.getOpenId(function () {
          n();
        });
      }
    }
  };
  _ctor.prototype.paySuccess = function (t, e) {
    var n = this;
    wx.showLoading({
      title: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.wechatpaymgr.text.154]]"),
      mask: true
    });
    var i = {
      orderid: t,
      appId: this.appId
    };
    this.invert = setInterval(function () {
      if (n.isCallback) {
        n.isPaying = false;
      } else {
        n.requestOrder(i, function (t) {
          if (n.isCallback) {
            n.isPaying = false;
          } else {
            n.isCallback = true;
            if (1 != t.code) {
              wx.hideLoading(), setTimeout(function () {
                wx.showToast({
                  title: require("LanguageMgr").LanguageMgr.getInstance().T(0 == t.code ? "[[loc:payment.completed]]" : -6 == t.code ? "[[loc:script.wechatpaymgr.text.194]]" : "[[loc:payment.unconfirmed]]"),
                  icon: 0 == t ? "success" : "error",
                  duration: 2e3
                });
              }, 100), 0 == t.code && e && e(true, "success");
            }
          }
        });
      }
    }, 2e3);
  };
  _ctor.prototype.requestOrder = function (t, e) {
    var n = this;
    this.reqtime += 1;
    $z1HttpMgr.HttpMgr.getInstance().httpPost(t, function (i) {
      var a = JSON.parse(i);
      if (1 == a.code) {
        if (n.reqtime >= 120) {
          clearInterval(n.invert);
          e({
            code: -6,
            msg: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.wechatpaymgr.text.194]]")
          });
        } else {
          n.requestOrder(t, e);
        }
      } else {
        clearInterval(n.invert);
        e(a);
      }
    }, this.payUrl + "queryOrder");
  };
  _ctor.prototype.getAppId = function () {
    var t = wx.getAccountInfoSync().miniProgram;
    if (t) {
      return this.appId = t.appId, this.appId;
    } else {
      return null;
    }
  };
  _ctor.prototype.getOpenId = function (t) {
    var e = this;
    var n = wx.getStorageSync(this.openIdKey);
    if (n || this.openId) {
      $z1HttpMgr.HttpMgr.getInstance().httpPost({
        appId: this.appId,
        openId: n || this.openId
      }, function (i) {
        if (i && i.startsWith("{")) {
          if (-1 == JSON.parse(i).data) {
            e.login(t);
          } else {
            t && t(n || e.openId);
          }
        }
      }, this.payUrl + "checkSessionKey");
    } else {
      this.login(t);
    }
  };
  _ctor.prototype.loginByKey = function (t) {
    var e = this;
    this.appId || this.getAppId();
    wx.login({
      success: function (n) {
        if (n && n.code) {
          var a = {
            appId: e.appId,
            code: n.code
          };
          $z1HttpMgr.HttpMgr.getInstance().httpPost(a, function (n) {
            var i = JSON.parse(n);
            if (i) {
              if (0 == i.code) {
                e.openId = i.data.openid;
                var a = i.data.key;
                wx.setStorageSync("igame_openId", e.openId);
                wx.setStorageSync("um_od", e.openId);
                t && t(e.openId, a);
              } else {
                t && t(null, null);
              }
            } else {
              setTimeout(function () {
                e.login(t);
              }, 1e3);
            }
          }, e.payUrl + "getOpenIdByKey");
        } else {
          e.iLog("登录失败:" + n.errMsg);
        }
      },
      fail: function () {
        t && t(null, null);
      }
    });
  };
  _ctor.prototype.login = function (t) {
    var e = this;
    wx.login({
      success: function (n) {
        if (n && n.code) {
          var a = {
            appId: e.appId,
            code: n.code
          };
          $z1HttpMgr.HttpMgr.getInstance().httpPost(a, function (n) {
            var i = JSON.parse(n);
            if (i) {
              if (0 == i.code) {
                e.openId = i.data;
                wx.setStorageSync("igame_openId", e.openId);
                wx.setStorageSync("um_od", e.openId);
                t && t(e.openId);
              } else {
                t && t(null);
              }
            } else {
              setTimeout(function () {
                e.login(t);
              }, 1e3);
            }
          }, e.payUrl + "getOpenId");
        } else {
          e.iLog("登录失败:" + n.errMsg);
        }
      },
      fail: function () {
        t && t(null);
      }
    });
  };
  _ctor.prototype.iLog = function () {
    var t = [];
    for (var e = 0; e < arguments.length; e++) {
      t[e] = arguments[e];
    }
    console.log("SF_WxPay:", t);
  };
  Object.defineProperty(_ctor, "instance", {
    get: function () {
      this._instance || (this._instance = new _ctor());
      return this._instance;
    },
    enumerable: false,
    configurable: true
  });
  return _ctor;
}();
exports.WechatPayMgr = exp_WechatPayMgr;