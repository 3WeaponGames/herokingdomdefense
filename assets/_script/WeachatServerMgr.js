Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WeachatServerMgr = undefined;
var $z1Config = require("Config");
var $z1Appcfg = require("Appcfg");
var $z1EventMgr = require("EventMgr");
var $z1SfSendQueue = require("SfSendQueue");
var exp_WeachatServerMgr = function () {
  function _ctor(t, e, n) {
    this.url = null;
    this.appId = 3;
    this.platform = 0;
    this.isOpened = false;
    this.openIdKey = "igame_openId";
    this.uidKey = "USERID";
    this.isLoaded = false;
    this.canUpdate = true;
    this.isClear = false;
    this.isonHide = false;
    this.url = t;
    this.isOpened = n;
    this.appId = e;
  }
  _ctor.prototype.init = function (t, e) {
    var n = this;
    undefined === e && (e = true);
    if (this.isOpened) {
      this.getOpenId(function () {
        t && t();
      });
      if (!this.isonHide) {
        this.isonHide = true, wx.onHide(function () {
          if (!n.isClear) {
            console.log("进来了 onHide");
            $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.onHide);
          }
        });
      }
    } else {
      t && t();
    }
  };
  _ctor.prototype.getNeedSaveServer = function () {
    return this.isOpened;
  };
  _ctor.prototype.clearDataByKey = function (t, e) {
    if (this.isOpened) {
      this.isClear = true;
      t = (t = t.replace($z1Config.GameConfig.AppCacheName, "")).trim();
      this.saveData(t, "{}", e);
    } else {
      e && e();
    }
  };
  _ctor.prototype.getDataByKey = function (t) {
    if (this.isOpened) {
      return t = (t = t.replace($z1Config.GameConfig.AppCacheName, "")).trim(), this.data ? "undefined" == this.data[t] || "{}" == this.data[t] ? null : this.data[t] : null;
    } else {
      return null;
    }
  };
  _ctor.prototype.getOpenId = function (t, e) {
    undefined === e && (e = false);
    this.openId = window.openId;
    if (this.isOpened || e) {
      if (this.openId) {
        t && t(this.openId);
      } else {
        var n = this;
        var i = wx.getStorageSync(this.openIdKey);
        if (i) {
          this.openId = i;
          window.openId = this.openId;
          return void t(this.openId);
        }
        if (i = wx.getStorageSync("um_od")) {
          this.openId = i;
          window.openId = this.openId;
          return void t(this.openId);
        }
        wx.login({
          success: function (e) {
            if (e.code) {
              var i = {
                appId: n.appId,
                code: e.code,
                platform: n.platform
              };
              $z1SfSendQueue.SfTrackHttp.httpGet(n.url + "/getOpenId", i, function (e) {
                console.log(e);
                if (0 == e.code) {
                  n.openId = e.data.openid;
                  wx.setStorageSync(n.openIdKey, n.openId);
                  t && t(n.openId);
                } else {
                  t && t();
                }
              });
            } else {
              console.log("登录失败！" + e.errMsg);
              t && t();
            }
          },
          fail: function (e) {
            console.log("login登录失败=" + JSON.stringify(e));
            t && t();
          }
        });
      }
    } else {
      t && t(null);
    }
  };
  _ctor.prototype.loadData = function (t) {
    var e = this;
    if (this.isOpened) {
      var n = this;
      var i = wx.getAccountInfoSync();
      var a = {
        appId: n.appId,
        thirdId: n.openId,
        platform: n.platform,
        appGameId: i.miniProgram.appId
      };
      $z1SfSendQueue.SfTrackHttp.httpGet(n.url + "/loginData", a, function (i) {
        if (null != i) {
          if (0 == i.code) {
            $z1SfSendQueue.SfTrackHttp.TOKEN = i.token;
            e.data = i.data;
            t && t(i.data);
          } else if (-2 == i.code) {
            n.canUpdate = false;
            wx.showModal({
              confirmText: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:common.nativeOK]]"),
              cancelText: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:common.nativeBack]]"),
              title: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:ui.gad_uipause.title.8]]"),
              content: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.bytedanceservermgr.text.130]]"),
              success: function (t) {
                if (t.confirm) {
                  console.log("用户点击确定");
                } else {
                  t.cancel && console.log("用户点击取消");
                }
              }
            });
          } else {
            t && t(null);
          }
        } else {
          t && t(null);
        }
      });
    } else {
      t && t(null);
    }
  };
  _ctor.prototype.checkLogin = function (t) {
    if (this.isOpened) {
      if (this.openId && this.userId) {
        t();
      } else {
        this.getOpenId(function () {
          t();
        });
      }
    } else {
      t && t(null);
    }
  };
  _ctor.prototype.saveData = function (t, e, n) {
    var a = this;
    if (this.isOpened) {
      if (this.canUpdate) {
        t = (t = t.replace($z1Config.GameConfig.AppCacheName, "")).trim();
        var o = this;
        this.checkLogin(function () {
          var i = new $z1SfSendQueue.SendConfig();
          i.callback = function (t) {
            if (0 == t.code) {
              n && n(t.data);
            } else if (-10 == t.code) {
              a.isOpened = false;
              wx.showModal({
                confirmText: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:common.nativeOK]]"),
                cancelText: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:common.nativeBack]]"),
                title: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.bytedanceservermgr.text.177]]"),
                showCancel: false,
                content: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.bytedanceservermgr.text.179]]"),
                success: function (t) {
                  if (t.confirm) {
                    wx.exitMiniProgram({});
                  } else {
                    t.cancel && wx.exitMiniProgram({});
                  }
                }
              });
            } else {
              console.error(t);
              n && n(null);
            }
          };
          var s = {
            appId: o.appId,
            thirdId: o.openId,
            platform: o.platform,
            key: t,
            value: e
          };
          $z1SfSendQueue.SendQueue.enqueue(s, o.url + "/saveData", i);
        });
      } else {
        n && n(null);
      }
    } else {
      n && n(null);
    }
  };
  _ctor.prototype.clearAllData = function (t) {
    var e = {
      appId: this.appId,
      thirdId: this.openId,
      platform: this.platform
    };
    $z1SfSendQueue.SfTrackHttp.httpGet(this.url + "/remove", e, function (e) {
      if (null != e) {
        if (0 == e.code) {
          t && t(true);
          wx.restartMiniProgram({
            success: function () {}
          });
        } else {
          t && t(false);
        }
      } else {
        t && t(null);
      }
    });
  };
  return _ctor;
}();
exports.WeachatServerMgr = exp_WeachatServerMgr;