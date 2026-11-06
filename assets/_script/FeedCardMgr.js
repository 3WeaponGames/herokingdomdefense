Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TaskData = exports.FeedCardMgr = undefined;
var $z1BasePlatform = require("BasePlatform");
var $z1PlatformManager = require("PlatformManager");
var exp_FeedCardMgr = function () {
  function _ctor() {
    this.url = "?";
    this.isInit = false;
    this.platformId = -1;
    this.type = -1;
    this.bytebroadside = ["021036", "021001", "011004", "101001", "021003", "061001", "061004"];
    this.datas = [];
  }
  _ctor.prototype.init = function () {
    if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE) {
      this.initDy();
      this.type = 1;
    }
  };
  _ctor.prototype.initDy = function () {
    this.isInit = true;
    this.systemInfo = tt.getSystemInfoSync();
    this.launchOptions = tt.getLaunchOptionsSync();
    if (window.openId) {
      this.uid = window.openId;
    } else {
      var t = localStorage.getItem(r.openId);
      t && (this.uid = t);
    }
    if (this.launchOptions) {
      var e = this.launchOptions.extra;
      e && (this.appId = e.appId);
    }
    null != this.systemInfo && ("Douyin" != this.systemInfo.appName && "douyin_lite" != this.systemInfo.appName || ("douyin_lite" == this.systemInfo.appName ? this.platformId = 2 : this.platformId = 1));
  };
  _ctor.prototype.login = function (t) {
    this.uid = localStorage.getItem(r.openId);
    if ("" != this.uid && this.uid) {
      t && t();
    } else {
      this.getOpenId(function () {
        t && t();
      });
    }
  };
  _ctor.prototype.getIsBytebroadside = function () {
    if (1 != this.type) {
      return false;
    }
    this.isInit || this.init();
    for (var t = 0; t < this.bytebroadside.length; t++) {
      if (this.launchOptions.scene == this.bytebroadside[t]) {
        return true;
      }
    }
    return false;
  };
  _ctor.prototype.checkCanSend = function () {
    return 1 == this.type && (this.isInit || this.init(), -1 != this.platformId);
  };
  _ctor.prototype.getLaunchCardId = function () {
    if (1 != this.type) {
      return -1;
    }
    this.isInit || this.init();
    if (this.launchOptions) {
      if (1 == this.platformId) {
        if (this.launchOptions.scene + "" != "023040") {
          return -1;
        }
      } else if (2 == this.platformId && this.launchOptions.scene + "" != "103040") {
        return -1;
      }
      if (this.launchOptions.query.card_id) {
        return this.launchOptions.query.card_id;
      } else {
        return -1;
      }
    }
    return -1;
  };
  _ctor.prototype.getLaunchFromFeedcard = function () {
    this.isInit || this.init();
    if (this.launchOptions) {
      if (1 == this.platformId) {
        if (this.launchOptions.scene + "" == "023040") {
          return true;
        }
      } else if (2 == this.platformId && this.launchOptions.scene + "" == "103040") {
        return true;
      }
    }
    return false;
  };
  _ctor.prototype.getTaskTarget = function (t) {
    var e = this;
    this.iLog("获取需要完成的任务目标");
    if (1 == this.type) {
      this.isInit || this.init();
      if (!this.checkCanSend()) {
        console.error("不是对应的平台");
        return void (t && t(null));
      }
      var n = {
        appId: this.appId
      };
      this.ttRequest(this.url + "/appCfg", n, function (n) {
        if (!n.data) {
          console.error(n.errMsg);
          return void (t && t(null));
        }
        var i = JSON.parse(n.data);
        if (0 == i.code) {
          e.taskdatas = i.data;
          var a = e.getTaskData();
          t && t(a);
        } else {
          console.error(n.data);
          t && t(null);
        }
      });
    } else {
      t && t(null);
    }
  };
  _ctor.prototype.sendTask = function (t, e) {
    var n = this;
    this.iLog("开始发送任务");
    if (1 == this.type) {
      this.isInit || this.init();
      if (this.getIsSend(t)) {
        return console.error("已经发送过了"), void (e && e(true));
      } else {
        if (this.checkCanSend()) {
          return void this.getOpenId(function () {
            var i = {
              appId: n.appId,
              openId: n.openId,
              cardId: t,
              platformId: n.platformId
            };
            n.ttRequest(n.url + "/addUser", i, function (i) {
              if (!i.data) {
                console.error(i.errMsg);
                return void (e && e(false));
              }
              var a = JSON.parse(i.data);
              if (0 == a.code) {
                n.iLog("发送任务成功：", t);
                localStorage.setItem(r.uid_key, a.data);
                n.uid = a.data;
                n.addTaskCardId(t);
                e && e(true);
              } else {
                console.error(i.data);
                e && e(false);
              }
            });
          });
        } else {
          return console.error("不是对应的平台"), void (e && e(false));
        }
      }
    }
    e && e(null);
  };
  _ctor.prototype.getTaskData = function () {
    if (this.datas.length > 0) {
      return this.datas;
    }
    for (var t = 0; t < this.taskdatas.length; t++) {
      var e = this.taskdatas[t];
      -1 != e.platform.indexOf(this.platformId + "") && this.datas.push(e);
    }
    return this.datas;
  };
  _ctor.prototype.getTaskDataById = function (t) {
    for (var e = 0; e < this.taskdatas.length; e++) {
      var n = this.taskdatas[e];
      if (n.id == t) {
        return n;
      }
    }
    return null;
  };
  _ctor.prototype.getTaskDataConditions = function (t) {
    for (var e = 0; e < this.taskdatas.length; e++) {
      var n = this.taskdatas[e];
      if (n.conditions == t) {
        return n;
      }
    }
    return null;
  };
  _ctor.prototype.getOpenId = function (t) {
    var e = this;
    var n = this;
    var i = localStorage.getItem(r.openId);
    if (i) {
      return this.openId = i, void (t && t(this.openId));
    } else {
      if (this.uid) {
        return this.openId = this.uid, void (t && t(this.openId));
      } else {
        return void tt.login({
          force: false,
          success: function (i) {
            if (i.code) {
              var a = localStorage.getItem(r.openId);
              n.openId = a;
              if (a && "" != a) {
                t && t(n.openId);
              } else {
                var o = {
                  code: i.code,
                  appId: e.appId
                };
                n.ttRequest(n.url + "/getOpenId", o, function (e) {
                  if (!e.data) {
                    console.error(e.errMsg);
                    return void (t && t(null));
                  }
                  var i = JSON.parse(e.data);
                  if (0 == i.code) {
                    n.openId = i.data.openid;
                    localStorage.setItem(r.openId, n.openId);
                    t && t(n.openId);
                  } else {
                    console.error(e.data);
                    t && t(null);
                  }
                });
              }
            } else {
              t && t(null);
            }
          },
          fail: function (e) {
            console.error(e.errMsg);
            t && t(false);
          }
        });
      }
    }
  };
  _ctor.prototype.ttRequest = function (t, e, n) {
    tt.request({
      url: t,
      data: e,
      header: {
        "content-type": "application/json"
      },
      dataType: "JSON",
      responseType: "text",
      success: function (t) {
        n(t);
      },
      fail: function (t) {
        n(t);
      }
    });
  };
  _ctor.prototype.wxRequest = function (t, e, n) {
    wx.request({
      url: t,
      data: e,
      header: {
        "content-type": "application/json"
      },
      dataType: "JSON",
      responseType: "text",
      success: function (t) {
        n(t);
      },
      fail: function (t) {
        n(t);
      }
    });
  };
  _ctor.prototype.getIsSend = function (t) {
    var e = localStorage.getItem(r.taskSend);
    if (e) {
      var n = e.split("_");
      if (n[0] == this.getTimeDay() && n[1] && -1 != n[1].indexOf(t + "")) {
        return true;
      }
    }
    return false;
  };
  _ctor.prototype.addTaskCardId = function (t) {
    var e = localStorage.getItem(r.taskSend);
    if (null == e) {
      localStorage.setItem(r.taskSend, this.getTimeDay() + "_" + t);
    } else {
      var n = e.split("_");
      localStorage.setItem(r.taskSend, this.getTimeDay() + "_" + n[1] + "," + t);
    }
  };
  _ctor.prototype.iLog = function () {
    var t = [];
    for (var e = 0; e < arguments.length; e++) {
      t[e] = arguments[e];
    }
    console.log("SF_FeedCard_subject:", t);
  };
  _ctor.prototype.getTimeDay = function () {
    var t = new Date();
    var e = t.getFullYear();
    var n = t.getMonth() + 1;
    var i = t.getDate();
    var a = n + "";
    var o = i + "";
    n >= 1 && n <= 9 && (a = "0" + n);
    i >= 0 && i <= 9 && (o = "0" + i);
    return e + "-" + a + "-" + o;
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
exports.FeedCardMgr = exp_FeedCardMgr;
exports.TaskData = function () {};
var r = function () {
  function t() {}
  t.openId = "igame_openId";
  t.uid_key = "igame_server_uid";
  t.taskSend = "igame_task";
  return t;
}();