Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FeedPlayableMgr = undefined;
function feedRequestSucceeded(value) {
  if (typeof value === "string") { try { value = JSON.parse(value); } catch (error) { return false; } }
  return !!value && value.code === 0;
}
var $z1BasePlatform = require("BasePlatform");
var $z1SfSendQueue = require("SfSendQueue");
var $z1TimeUtils = require("TimeUtils");
var $z1HttpMgr = require("HttpMgr");
var $z1PlatformManager = require("PlatformManager");
var exp_FeedPlayableMgr = function () {
  function _ctor() {
    this.url = "?";
    this.isInit = false;
    this.canSend = false;
    this.openIdKey = "igame_openId";
    this.umIdKey = "um_od";
    this.waitSend = [];
  }
  _ctor.prototype.init = function () {
    var t = this;
    if (this.isInit) return;
    if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE && typeof tt !== "undefined" && typeof tt.getSystemInfoSync === "function" && typeof tt.getLaunchOptionsSync === "function" && (this.systemInfo = tt.getSystemInfoSync(), this.systemInfo && ("Douyin" == this.systemInfo.appName || "douyin_lite" == this.systemInfo.appName))) {
      var e = tt.getLaunchOptionsSync();
      if (!e || !e.extra || !e.extra.appId) return;
      this.isInit = true;
      this._generation = (this._generation || 0) + 1;
      this.canSend = true;
      typeof tt.reportScene === "function" && tt.reportScene(7001, 100);
      this.appId = e.extra.appId;
      this._pollTimer = setInterval(function () {
        t.requestAny();
      }, 1e3);
    }
  };
  _ctor.prototype.dispose = function () {
    this._generation = (this._generation || 0) + 1;
    if (this._pollTimer != null) clearInterval(this._pollTimer);
    this._pollTimer = null;
    this.isInit = false;
    this.canSend = false;
    this.waitSend.length = 0;
  };
  _ctor.prototype.sendUserData = function (t, e, n) {
    var i = this;
    this.isInit || this.init();
    var generation = this._generation;
    this.canSend && this.getOpenId(function (id) {
      if (!id || !i.canSend || generation !== i._generation) return;
      i.checkFeedSubscribeStatus(t, function (n) {
        if (!i.canSend || generation !== i._generation) return;
        n || i.requestFeedSubscribe(t, e, function () {});
      });
      var a = {
        appId: i.appId,
        openId: i.openId,
        sceneId: t,
        contentIDs: e,
        time: n
      };
      $z1HttpMgr.HttpMgr.getInstance().httpPost(a, function (a) {
        if (!i.canSend || generation !== i._generation) return;
        feedRequestSucceeded(a) || i.waitSend.push({
          sceneId: t,
          contentIDs: e,
          time: n,
          reqTime: $z1TimeUtils.TimeUtils.GetTimeBySecond() + 2,
          status: true
        });
      }, i.url + "/addUserData", true);
    });
  };
  _ctor.prototype.getLaunchSceneId = function () {
    this.isInit || this.init();
    if (!this.canSend) {
      return -1;
    }
    var t = tt.getLaunchOptionsSync();
    var e = t && t.scene;
    if (e != null && String(e).slice(-4) === "3041" && t.query) {
      return t.query.feed_game_scene;
    } else {
      return -1;
    }
  };
  _ctor.prototype.requestFeedSubscribe = function (t, e, n) {
    if (typeof tt !== "undefined" && typeof tt.requestFeedSubscribe === "function") {
      this.isInit || this.init();
      if (this.canSend) {
        tt.requestFeedSubscribe({
          type: "play",
          scene: t,
          contentIDs: e,
          success: function () {
            n && n(true);
          },
          fail: function (t) {
            n && n(false);
            console.error("订阅失败：", JSON.stringify(t));
          },
          complete: function () {}
        });
      } else {
        n && n(false);
      }
    } else {
      n && n(false);
    }
  };
  _ctor.prototype.checkFeedSubscribeStatus = function (t, e) {
    if (typeof tt !== "undefined" && typeof tt.checkFeedSubscribeStatus === "function") {
      this.isInit || this.init();
      if (this.canSend) {
        tt.checkFeedSubscribeStatus({
          type: "play",
          scene: t,
          success: function (t) {
            e && e(t.status);
          },
          fail: function (t) {
            e && e(false);
            console.error("检查订阅失败：", JSON.stringify(t));
          },
          complete: function () {}
        });
      } else {
        e && e(false);
      }
    } else {
      e && e(false);
    }
  };
  _ctor.prototype.getOpenId = function (t) {
    this.openId = window.openId;
    if (this.openId) {
      t(this.openId);
    } else {
      var e = this;
      var n = localStorage.getItem(this.openIdKey);
      if (n) {
        this.openId = n;
        window.openId = this.openId;
        return void t(this.openId);
      }
      if (n = localStorage.getItem(this.umIdKey)) {
        this.openId = n;
        window.openId = this.openId;
        return void t(this.openId);
      }
      tt.login({
        force: false,
        success: function (n) {
          if (n.code) {
            var i = {
              appId: e.appId,
              code: n.code
            };
            $z1SfSendQueue.SfTrackHttp.httpGet(e.url + "/getOpenId", i, function (n) {
              if (n && 0 == n.code && n.data && n.data.openid) {
                e.openId = n.data.openid;
                localStorage.setItem(e.openIdKey, e.openId);
                t && t(e.openId);
              } else {
                t && t();
              }
            });
          } else {
            console.log("请求登录失败=" + n.errMsg);
            t && t();
          }
        },
        fail: function (e) {
          console.log("login登录失败=" + JSON.stringify(e));
          t && t();
        }
      });
    }
  };
  _ctor.prototype.requestAny = function () {
    if (!this.canSend) return;
    var generation = this._generation;
    if (0 != this.waitSend.length) {
      var t;
      var e = $z1TimeUtils.TimeUtils.GetTimeBySecond();
      var n = function (n) {
        var a = i.waitSend[n];
        if (0 == a.status) {
          i.waitSend.splice(n, 1);
          t = --n;
          return "continue";
        }
        if (!a.inFlight && e >= a.reqTime) {
          a.inFlight = true;
          a.reqTime = e + 5;
          var o = {
            appId: i.appId,
            openId: i.openId,
            sceneId: a.sceneId,
            contentIDs: a.contentIDs,
            time: a.time
          };
          $z1HttpMgr.HttpMgr.getInstance().httpPost(o, function (t) {
            if (!i.canSend || generation !== i._generation) return;
            a.inFlight = false;
            feedRequestSucceeded(t) && (a.status = false);
          }, i.url + "/addUserData", true);
        }
        t = n;
      };
      var i = this;
      for (var a = 0; a < this.waitSend.length; a++) {
        n(a);
        a = t;
      }
    }
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
exports.FeedPlayableMgr = exp_FeedPlayableMgr;
