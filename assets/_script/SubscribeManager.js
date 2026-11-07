Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SubscribeManager = undefined;
var $z1BasePlatform = require("BasePlatform");
var $z1PlatformManager = require("PlatformManager");
function readResponse(value) {
  try {
    var result = typeof value === "string" ? JSON.parse(value) : value;
    if (result && result.code == null && result.data != null) result = typeof result.data === "string" ? JSON.parse(result.data) : result.data;
    return result && typeof result === "object" && result.code != null ? result : { code: -1, data: null };
  } catch (_) { return { code: -1, data: null }; }
}
function request(host, url, data, callback) {
  var done = false;
  function finish(value) { if (!done) { done = true; callback && callback(value || {}); } }
  if (!host || typeof host.request !== "function") return finish({});
  try { host.request({ url: url, data: data, header: { "content-type": "application/json" }, dataType: "JSON", responseType: "text", success: finish, fail: finish }); }
  catch (error) { if (done) throw error; finish({}); }
}
var exp_SubscribeManager = function () {
  function _ctor() {
    this.isInit = false;
    this.openIdSaveKey = "igame_openId";
    this.platformId = -1;
    this.type = -1;
    this.dyUrl = null;
    this.wxUrl = null;
  }
  _ctor.prototype.openSubscribeWithTime = function (t, e, n) {
    if (!this.checkCanSend()) {
      console.error("sf_subscribe: 不是对应的平台");
      return void (n && n(null));
    }
    this.iLog("开始订阅");
    if (1 == this.type) {
      this.dysendServer(e, t, n);
    } else {
      2 == this.type && this.wxsendServer(e, t, n);
    }
  };
  _ctor.prototype.openSubscribe = function (t, e) {
    if (!this.checkCanSend()) {
      console.error("sf_subscribe: 不是对应的平台");
      return void (e && e(null));
    }
    this.iLog("开始订阅");
    if (1 == this.type) {
      this.dysendServer(t, null, e);
    } else {
      2 == this.type && this.wxsendServer(t, null, e);
    }
  };
  _ctor.prototype.openSubscribeWechatVersion = function (t) {
    if (!this.checkCanSend()) {
      console.error("sf_subscribe: 不是对应的平台");
      return void (t && t(null));
    }
    if (2 != this.type) {
      console.error("只有微信才需要调用");
      return void (t && t(null));
    }
    var e = wx.getSystemInfoSync().SDKVersion;
    if (typeof e !== "string" || this.compareVersion(e, "2.32.1") < 0 || typeof wx.requestSubscribeSystemMessage !== "function") return void (t && t(null));
    wx.requestSubscribeSystemMessage({
      msgTypeList: ["SYS_MSG_TYPE_WHATS_NEW"],
      success: function (e) {
        t && t(e);
      },
      fail: function () {
        t && t(null);
      }
    });
  };
  _ctor.prototype.addInfo = function (t, e, n) {
    var i = this;
    if (!this.checkCanSend()) {
      console.error("sf_subscribe: 不是对应的平台");
      return void (n && n(null));
    }
    var a = localStorage.getItem("subscribe_" + t);
    if (a && a == e + "") {
      n && n("success");
    } else {
      this.getOpenId(function (openId) {
        if (!openId) return void (n && n(null));
        var a = {
          appId: i.appId,
          openId: i.openId,
          info: JSON.stringify({
            k: t,
            v: e
          })
        };
        if (1 == i.type) {
          i.ttRequest(i.dyUrl + "/addInfo", a, function (i) {
            if (!i.data) {
              console.error(i.errMsg);
              return void (n && n(null));
            }
            var a = readResponse(i);
            if (0 == a.code) {
              localStorage.setItem("subscribe_" + t, e + "");
              n && n(a.data);
            } else {
              console.error(a);
              n && n(null);
            }
          });
        } else {
          2 == i.type && i.wxRequest(i.wxUrl + "/addInfo", a, function (i) {
            if (!i.data) {
              console.error(i.errMsg);
              return void (n && n(null));
            }
            var a = readResponse(i);
            if (0 == a.code) {
              wx.setStorageSync("subscribe_" + t, e + "");
              n && n(a.data);
            } else {
              console.error(a);
              n && n(null);
            }
          });
        }
      });
    }
  };
  _ctor.prototype.openWXSubscribeSystem = function (t, e) {
    if (this.checkCanSend()) {
      if (2 != this.type) {
        return console.error("只有微信才有系统订阅"), void (e && e(null));
      } else {
        return this.iLog("开始订阅"), void this.wxsendServer(t, null, e, true);
      }
    } else {
      return console.error("sf_subscribe: 不是对应的平台"), void (e && e(null));
    }
  };
  _ctor.prototype.wxsendServer = function (t, e, n, i) {
    var a = this;
    if (typeof wx === "undefined" || typeof wx[i ? "requestSubscribeSystemMessage" : "requestSubscribeMessage"] !== "function") return void (n && n(null));
    if (i) {
      wx.requestSubscribeSystemMessage({
        msgTypeList: t,
        success: function (e) {
          var i = [];
          for (var a = 0; a < t.length; a++) {
            e[t[a]] && "accept" == e[t[a]] && i.push(t[a]);
          }
          if (i.length <= 0) {
            n && n(null);
          } else {
            n && n(i);
          }
        },
        fail: function (t) {
          console.error(t);
          n && n(null);
        }
      });
    } else {
      var o = function (t) {
        var i = {
          appId: a.appId,
          openId: a.openId,
          tmplIds: t,
          time: null
        };
        var o = a.wxUrl + "/addUserSubject";
        if (e) {
          i.time = e;
          o = a.wxUrl + "/addTimeSubject";
        }
        a.wxRequest(o, i, function (e) {
          if (!e.data) {
            console.error(e.errMsg);
            return void (n && n(null));
          }
          var i = readResponse(e);
          if (200 == i.code) {
            n && n(t);
          } else {
            console.error(JSON.stringify(i));
            n && n(null);
          }
        });
      };
      wx.requestSubscribeMessage({
        tmplIds: t,
        success: function (e) {
          var i = [];
          for (var r = 0; r < t.length; r++) {
            e[t[r]] && "accept" == e[t[r]] && i.push(t[r]);
          }
          if (i.length <= 0) {
            n && n(null);
          } else {
            a.getOpenId(function (openId) {
              if (!openId) return void (n && n(null));
              o(i);
            });
          }
        },
        fail: function (t) {
          console.error(t);
          n && n(null);
        }
      });
    }
  };
  _ctor.prototype.dysendServer = function (t, e, n) {
    var i = this;
    if (typeof tt === "undefined" || typeof tt.requestSubscribeMessage !== "function") return void (n && n(null));
    tt.requestSubscribeMessage({
      tmplIds: t,
      success: function (a) {
        var o = [];
        for (var r = 0; r < t.length; r++) {
          a[t[r]] && "accept" == a[t[r]] && o.push(t[r]);
        }
        if (o.length <= 0) {
          n && n(null);
        } else {
          i.getOpenId(function (openId) {
            if (!openId) return void (n && n(null));
            var t = {
              appId: i.appId,
              openId: i.openId,
              tmplIds: o,
              time: null
            };
            var a = i.dyUrl + "/addUserSubject";
            if (e) {
              t.time = e;
              a = i.dyUrl + "/addTimeSubject";
            }
            i.ttRequest(a, t, function (t) {
              if (!t.data) {
                console.error(t.errMsg);
                return void (n && n(null));
              }
              var e = readResponse(t);
              if (200 == e.code) {
                n && n(o);
              } else {
                console.error(JSON.stringify(e));
                n && n(null);
              }
            });
          });
        }
      },
      fail: function (t) {
        console.error(t);
        n && n(null);
      }
    });
  };
  _ctor.prototype.checkCanSend = function () {
    if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT) {
      this.type = 2;
    } else {
      $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE && (this.type = 1);
    }
    var t = false;
    if (1 == this.type) {
      if (typeof tt === "undefined" || typeof tt.getSystemInfoSync !== "function" || typeof tt.getLaunchOptionsSync !== "function") return false;
      this.isInit || this.initDy();
      if (-1 == this.platformId) {
        return false;
      }
      t = true;
    } else if (2 == this.type) {
      if (typeof wx === "undefined" || typeof wx.getAccountInfoSync !== "function") return false;
      this.isInit || this.initWx();
      t = true;
    }
    return t;
  };
  _ctor.prototype.compareVersion = function (t, e) {
    t = t.split(".");
    e = e.split(".");
    for (var n = Math.max(t.length, e.length); t.length < n;) {
      t.push("0");
    }
    for (; e.length < n;) {
      e.push("0");
    }
    for (var i = 0; i < n; i++) {
      var a = parseInt(t[i]);
      var o = parseInt(e[i]);
      if (a > o) {
        return 1;
      }
      if (a < o) {
        return -1;
      }
    }
    return 0;
  };
  _ctor.prototype.initDy = function () {
    this.isInit = true;
    this.systemInfo = tt.getSystemInfoSync();
    this.launchOptions = tt.getLaunchOptionsSync();
    if (window.openId) {
      this.uid = window.openId;
    } else {
      var t = localStorage.getItem(this.openIdSaveKey);
      t && (this.openId = t);
    }
    if (this.launchOptions) {
      var e = this.launchOptions.extra;
      e && (this.appId = e.appId);
    }
    null != this.systemInfo && ("Douyin" != this.systemInfo.appName && "douyin_lite" != this.systemInfo.appName || ("douyin_lite" == this.systemInfo.appName ? this.platformId = 2 : this.platformId = 1));
  };
  _ctor.prototype.initWx = function () {
    this.isInit = true;
    if (window.openId) {
      this.openId = window.openId;
    } else {
      var t = wx.getStorageSync(this.openIdSaveKey);
      t && (this.openId = t);
    }
    var e = wx.getAccountInfoSync().miniProgram;
    e && (this.appId = e.appId);
  };
  _ctor.prototype.getOpenId = function (t) {
    var e = this;
    var n = this;
    if (this.openId) {
      t && t(this.openId);
    } else if (2 != this.type) {
      if (this.type !== 1 || typeof tt === "undefined" || typeof tt.login !== "function") return void (t && t(null));
      tt.login({
        force: false,
        success: function (i) {
          if (i && i.code) {
            var a = {
              code: i.code,
              appId: e.appId
            };
            e.ttRequest(e.dyUrl + "/getOpenId", a, function (i) {
              if (!i.data) {
                console.error(i.errMsg);
                return void (t && t(null));
              }
              var a = readResponse(i);
              if (0 == a.code && a.data && a.data.openid) {
                n.openId = a.data.openid;
                localStorage.setItem(e.openIdSaveKey, e.openId);
                t && t(n.openId);
              } else {
                console.error(i.data);
                t && t(null);
              }
            });
          } else {
            t && t(null);
          }
        },
        fail: function (e) {
          console.error(e.errMsg);
          t && t(false);
        }
      });
    } else {
      if (typeof wx === "undefined" || typeof wx.login !== "function") return void (t && t(null));
      wx.login({
        success: function (n) {
          if (n && n.code) {
            var i = {
              appId: e.appId,
              code: n.code,
              platform: 1
            };
            e.wxRequest(e.wxUrl + "/getOpenId", i, function (n) {
              n = readResponse(n);
              if (0 == n.code && typeof n.data === "string" && n.data) {
                e.openId = n.data;
                wx.setStorageSync(e.openIdSaveKey, e.openId);
                t && t(e.openId);
              } else {
                e.iLog("获取openId失败:" + JSON.stringify(n));
                t && t(null);
              }
            });
          } else {
            t && t(null);
          }
        },
        fail: function (n) {
          e.iLog("登录失败:" + JSON.stringify(n));
          t && t(null);
        }
      });
    }
  };
  _ctor.prototype.ttRequest = function (t, e, n) {
    request(typeof tt === "undefined" ? null : tt, t, e, n);
  };
  _ctor.prototype.wxRequest = function (t, e, n) {
    request(typeof wx === "undefined" ? null : wx, t, e, n);
  };
  _ctor.prototype.iLog = function () {
    var t = [];
    for (var e = 0; e < arguments.length; e++) {
      t[e] = arguments[e];
    }
    console.log("SF_subscribe:", t);
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
exports.SubscribeManager = exp_SubscribeManager;
