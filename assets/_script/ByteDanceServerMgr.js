function completeOnce(callback) {
  var completed = false;
  return function () { if (completed) return; completed = true; if (callback) callback.apply(null, arguments); };
}
function cloudError(response) {
  var error = new Error(response && (response.message || response.errMsg || response.msg) || "Cloud request failed");
  error.code = response && response.code; return error;
}
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ByteDanceServerMgr = undefined;
var $z1Config = require("Config");
var $z1Appcfg = require("Appcfg");
var $z1EventMgr = require("EventMgr");
var $z1SfSendQueue = require("SfSendQueue");
var exp_ByteDanceServerMgr = function () {
  function _ctor(t, e, n) {
    this.platform = 1;
    this.isOpened = false;
    this.openIdKey = "igame_openId";
    this.canUpdate = true;
    this.isClear = false;
    this.isLoaded = false;
    this.isneeduid = false;
    this.isonHide = false;
    this.url = t;
    this.isOpened = n;
    this.appId = e;
  }
  _ctor.prototype.init = function (t) {
    var e = this;
    if (this.isOpened) {
      this.getOpenId(function (id, error) {
        if (t) t(error);
      });
      if (!this.isonHide) {
        this.isonHide = true, tt.onHide(function () {
          e.isClear || $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.onHide);
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
    t = completeOnce(t);
    undefined === e && (e = false);
    if (this.isOpened || e) {
      this.openId = window.openId;
      if (this.openId) {
        t(this.openId);
      } else {
        var n = this;
        var i;
        try { i = localStorage.getItem(this.openIdKey) || localStorage.getItem("um_od"); }
        catch (error) { console.warn(error); }
        if (i) {
          this.openId = i;
          window.openId = this.openId;
          return void t(this.openId);
        }
        tt.login({
          force: false,
          success: function (e) {
            if (e.code) {
              var i = {
                appId: n.appId,
                code: e.code,
                platform: n.platform
              };
              $z1SfSendQueue.SfTrackHttp.httpGet(n.url + "/getOpenId", i, function (e) {
                if (e && 0 == e.code && e.data && e.data.openid) {
                  n.openId = e.data.openid;
                  window.openId = n.openId;
                  try { localStorage.setItem(n.openIdKey, n.openId); }
                  catch (error) { console.warn(error); }
                  t && t(n.openId);
                } else {
                  t(null, cloudError(e));
                }
              });
            } else {
              console.log("请求登录失败=" + e.errMsg);
              t(null, cloudError(e));
            }
          },
          fail: function (e) {
            console.log("login登录失败=" + JSON.stringify(e));
            t(null, cloudError(e));
          }
        });
      }
    } else {
      t && t(null);
    }
  };
  _ctor.prototype.loadData = function (t) {
    t = completeOnce(t);
    var e = this;
    if (this.isOpened) {
      var n = this;
      var i;
      try { i = tt.getLaunchOptionsSync() || {}; }
      catch (error) { t(null, error); return; }
      var a = {
        appId: n.appId,
        thirdId: n.openId,
        platform: n.platform
      };
      if (i.extra && i.extra.appId != null) a.appGameId = i.extra.appId;
      $z1SfSendQueue.SfTrackHttp.httpGet(n.url + "/loginData", a, function (i) {
        if (null != i) {
          if (0 == i.code) {
            $z1SfSendQueue.SfTrackHttp.TOKEN = i.token;
            e.data = i.data; e.canUpdate = true;
            t(i.data, null);
          } else if (-2 == i.code) {
            n.canUpdate = false;
            tt.showModal({
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
            t(null, cloudError(i));
          } else {
            t(null, cloudError(i));
          }
        } else {
          t(null, cloudError(i));
        }
      });
    } else {
      t && t(null);
    }
  };
  _ctor.prototype.checkLogin = function (t) {
    if (this.isOpened) {
      if (this.openId) {
        t();
      } else {
        this.getOpenId(function (id, error) {
          t(error || (!id ? cloudError(null) : null));
        });
      }
    } else {
      t && t(null);
    }
  };
  _ctor.prototype.saveData = function (t, e, n) {
    n = completeOnce(n);
    var a = this;
    if (this.isOpened) {
      if (this.canUpdate) {
        t = (t = t.replace($z1Config.GameConfig.AppCacheName, "")).trim();
        var o = this;
        this.checkLogin(function (error) {
          if (error) { n(null, error); return; }
          var i = new $z1SfSendQueue.SendConfig();
          i.callback = function (t) {
            if (0 == t.code) {
              n && n(t.data);
            } else if (-10 == t.code) {
              a.isOpened = false;
              tt.showModal({
                confirmText: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:common.nativeOK]]"),
                cancelText: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:common.nativeBack]]"),
                title: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.bytedanceservermgr.text.177]]"),
                showCancel: false,
                content: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.bytedanceservermgr.text.179]]"),
                success: function (t) {
                  if (t.confirm) {
                    tt.exitMiniProgram({});
                  } else {
                    t.cancel && tt.exitMiniProgram({});
                  }
                }
              });
              n(null, cloudError(t));
            } else {
              console.error(t);
              n(null, cloudError(t));
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
          tt.restartMiniProgramSync();
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
exports.ByteDanceServerMgr = exp_ByteDanceServerMgr;
