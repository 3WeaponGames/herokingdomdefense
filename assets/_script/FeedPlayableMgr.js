Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FeedPlayableMgr = undefined;
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
    this.isInit = true;
    if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE && (this.systemInfo = tt.getSystemInfoSync(), "Douyin" == this.systemInfo.appName || "douyin_lite" == this.systemInfo.appName)) {
      var e = tt.getLaunchOptionsSync();
      this.canSend = true;
      tt.reportScene(7001, 100);
      this.appId = e.extra.appId;
      setInterval(function () {
        t.requestAny();
      }, 1e3);
    }
  };
  _ctor.prototype.sendUserData = function (t, e, n) {
    var i = this;
    this.isInit || this.init();
    this.canSend && this.getOpenId(function () {
      i.checkFeedSubscribeStatus(t, function (n) {
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
        a && a.startsWith("{") && 0 == JSON.parse(a).code || i.waitSend.push({
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
    var e = t.scene;
    if (e && e.endsWith("3041")) {
      return t.query.feed_game_scene;
    } else {
      return -1;
    }
  };
  _ctor.prototype.requestFeedSubscribe = function (t, e, n) {
    if (tt.requestFeedSubscribe) {
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
        n(true);
      }
    } else {
      n(true);
    }
  };
  _ctor.prototype.checkFeedSubscribeStatus = function (t, e) {
    if (tt.checkFeedSubscribeStatus) {
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
        e(true);
      }
    } else {
      e(true);
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
              if (0 == n.code) {
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
        if (e >= a.reqTime) {
          a.reqTime = e + 5;
          var o = {
            appId: i.appId,
            openId: i.openId,
            sceneId: a.sceneId,
            contentIDs: a.contentIDs,
            time: a.time
          };
          $z1HttpMgr.HttpMgr.getInstance().httpPost(o, function (t) {
            t && t.startsWith("{") && 0 == JSON.parse(t).code && (a.status = false);
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