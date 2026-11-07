var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TimeByKey = exports.TrackData = undefined;
var $z1BaseData = require("BaseData");
var $z1BasePlatform = require("BasePlatform");
var $z1Appcfg = require("Appcfg");
var $z1AppManager = require("AppManager");
var $z1PlatformManager = require("PlatformManager");
var $z1TimeUtils = require("TimeUtils");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var p = function () {
  this.abName = null;
  this.dynamicAbName = null;
  this.isGet = false;
  this.versionName = null;
  this.appStore = 0;
  this.needConvert = 0;
  this.day = 1;
  this.listTime = {};
};
var exp_TrackData = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.aliseMap = {
      abName: "a",
      dynamicAbName: "b",
      isGet: "c",
      versionName: "d",
      appStore: "e",
      needConvert: "f",
      daytime: "g",
      day: "h"
    };
    e.protoId = 4;
    e.ecrypt = false;
    e.gameKey = $z1Config.GameConfig.AppCacheName + "trackdata";
    e.eventCF = {};
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.createData = function () {
    this.data = new p();
    this.data.versionName = this.getVersionConf();
    this.saveData();
    return this.data;
  };
  _ctor.prototype.initData = function (t) {
    if (t || !this.data.daytime) {
      this.data.daytime = new Date().getTime();
      this.data.day = 1;
    } else {
      this.setCurentDay();
    }
    this.eventCF = $z1GameTrackDataEvent.EventCF;
    this.convertData();
  };
  _ctor.prototype.convertData = function () {
    if (this.data.needConvert != null && this.data.needConvert !== 0 && this.data.needConvert !== "0") return;
    var data = this.data;
    var events = Object.keys(this.eventCF).map(function (key) { return this.eventCF[key]; }, this).filter(function (event) { return event.alias; });
    events.sort(function (a, b) { return (b.eventKey + b.eventValue).length - (a.eventKey + a.eventValue).length; });
    Object.keys(data).forEach(function (key) {
      for (var index = 0; index < events.length; index++) {
        var event = events[index];
        var prefix = event.eventKey + event.eventValue;
        if (key.indexOf(prefix) !== 0) continue;
        var suffix = key.slice(prefix.length);
        // Numbered guide events are exact keys; parameterized events use an
        // underscore at their boundary, including an authored trailing '_'.
        if (suffix && suffix.charAt(0) !== "_" && prefix.charAt(prefix.length - 1) !== "_") continue;
        var alias = event.alias + (suffix && suffix.charAt(0) !== "_" ? "_" : "") + suffix;
        if (!Object.prototype.hasOwnProperty.call(data, alias)) data[alias] = data[key];
        delete data[key];
        break;
      }
    });
    this.data.needConvert = 1;
    this.saveData();
  };
  _ctor.prototype.getVersionName = function () {
    if (this.data.versionName) {
      return this.data.versionName;
    } else {
      return this.getVersionConf();
    }
  };
  _ctor.prototype.getVersionConf = function () {
    var t = $z1AppManager.IAppManager.getUMConf();
    var e = $z1AppManager.IAppManager.getSwitchVersion(t);
    e || (e = "1.0.0");
    return String(e);
  };
  _ctor.prototype.getSdkAbName = function (t) {
    var e = this;
    this.data.isGet = false;
    if (null != this.data.abName && this.data.isGet) {
      t && t(this.data.abName);
    } else {
      this.requestAbName(function (n) {
        e.data.isGet = true;
        e.data.abName = null == n ? "C" : n;
        t && t(e.data.abName);
        e.saveData();
      });
    }
  };
  _ctor.prototype.setToAppStore = function () {
    this.data.appStore = 1;
    this.saveData();
  };
  _ctor.prototype.getToAppStore = function () {
    return 1 == this.data.appStore;
  };
  _ctor.prototype.getAbType = function () {
    if (this.data.abName) {
      return this.data.abName;
    } else {
      return "C";
    }
  };
  _ctor.prototype.getDynamicAbType = function () {
    if (this.data.dynamicAbName) {
      return this.data.dynamicAbName;
    } else {
      return "C";
    }
  };
  _ctor.prototype.requestAbName = function (t) {
    var e = this;
    var n = $z1AppManager.IAppManager.getABTestType();
    n == $z1Appcfg.ABTestType.NO_AB && (this.abTestUser = "C");
    var i = function (t) {
      var n = ["C"];
      var i = null;
      if (1 == t) {
        n = ["A", "B", "D"];
      } else if (2 == t) {
        n = ["A"];
      } else if (3 == t) {
        n = ["B"];
      } else if (4 == t) {
        n = ["D"];
      } else if (5 == t) {
        n = ["A", "B"];
      } else if (6 == t) {
        n = ["A", "D"];
      } else if (7 == t) {
        n = ["B", "D"];
      } else if (8 == t) {
        n = ["A"];
        i = ["A"];
      } else if (9 == t) {
        n = ["B"];
        i = ["B"];
      } else if (10 == t) {
        n = ["D"];
        i = ["D"];
      } else {
        n = ["C"];
      }
      if (null == e.data.abName) {
        var a = n[Math.floor(Math.random() * n.length)];
        e.abTestUser = a;
        e.data.dynamicAbName = a;
      } else {
        if (i) {
          e.data.dynamicAbName = i[Math.floor(Math.random() * i.length)];
        } else {
          null == e.data.dynamicAbName && (e.data.dynamicAbName = e.data.abName);
        }
        e.abTestUser = e.data.abName;
      }
    };
    if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.EDITOR) {
      var a = $z1Utils.Utils.getWebUrlParams(window.location.href).abType;
      if (a && a.length > 0) {
        this.abTestUser = a;
        this.data.dynamicAbName = a;
        return void (t && t(this.abTestUser));
      }
      i($z1Utils.Utils.randomRang(1, 11));
    }
    if (n == $z1Appcfg.ABTestType.A_fixed) {
      this.abTestUser = "A";
    } else if (n == $z1Appcfg.ABTestType.B_fixed) {
      this.abTestUser = "B";
    } else {
      n == $z1Appcfg.ABTestType.D_fixed && (this.abTestUser = "D");
    }
    if (this.abTestUser) {
      t && t(this.abTestUser);
    } else {
      var o = $z1AppManager.IAppManager.getABDConf();
      if (!o) {
        console.log("没有ab配置");
        this.abTestUser = "C";
        null != this.data.abName && (this.abTestUser = this.data.abName);
        return void (t && t(this.abTestUser));
      }
      var h = $z1AppManager.IAppManager.getABVersion(o.switchId);
      if (null == h) {
        this.abTestUser = "C";
        null != this.data.abName && (this.abTestUser = this.data.abName);
      } else {
        i(h);
      }
      t && t(this.abTestUser);
    }
  };
  _ctor.prototype.youmengTrack = function (t, e, n) {
    var i;
    var a = this.eventCF[t];
    var o = true;
    var r = a.eventValue;
    e && (r += e);
    n && (r = r + "_" + n);
    if (a.alias) {
      i = a.alias;
      if (!a.saveKey) {
        e && (i += "_" + e), n && (i += "_" + n);
      }
    }
    if (!a.condition || !this.data[a.condition]) {
      if (a.preEvent && !e) {
        if (!this.data[a.preEvent]) {
          return;
        }
      } else if (a.preEvent && e && !this.data[a.preEvent + e]) {
        return;
      }
      if (a.onlyOne) {
        this.data[a.eventKey + r] && (o = false);
        i && this.data[i] && (o = false);
      }
      if (o && a.saveKey) {
        if (this.data[a.eventKey + a.eventValue]) {
          return;
        }
        if (i && this.data[i.replace(e, "")]) {
          return;
        }
      }
      if (t == $z1GameTrackDataEvent.TrackId.dau) {
        var s = this.data[a.eventKey + a.eventValue];
        if (s) {
          var l = Number(s);
          if ($z1TimeUtils.TimeUtils.compareIsToday(l)) {
            return;
          }
          o = true;
        } else {
          o = true;
        }
      }
      if (o) {
        if (a.maxNum) {
          if (i) {
            null == (g = this.data[i.replace(e, "")]) && (g = 0);
            if (g >= a.maxNum + 1) {
              return;
            }
            g += 1;
            this.data[i] = 1;
            this.data[i.replace(e, "")] = g;
          } else {
            var g;
            var u = this.data[a.eventKey + a.eventValue];
            if (u) {
              u++;
            } else {
              u = 1;
            }
            if (g = this.data[a.eventKey + r]) {
              g++;
            } else {
              g = 1;
            }
            if (u >= a.maxNum + 1) {
              return;
            }
            if (a.saveKey) {
              this.data[a.eventKey + a.eventValue] = u;
            } else {
              this.data[a.eventKey + a.eventValue] = u;
              this.data[a.eventKey + r] = g;
            }
          }
          this.saveData();
        } else if (a.onlyOne) {
          if (i) {
            this.data[i] = 1;
          } else if (a.saveKey) {
            this.data[a.eventKey + a.eventValue] = 1;
          } else {
            this.data[a.eventKey + r] = 1;
          }
          t == $z1GameTrackDataEvent.TrackId.dau && (this.data[a.eventKey + a.eventValue] = $z1TimeUtils.TimeUtils.GetTimeBySecond());
          this.saveData();
        }
        if (!this.data.abName) {
          this.data.abName = "C";
          this.saveData();
        }
        var p = a.eventKey;
        "videoday" == a.eventKey && (p += this.getCrunetDay());
        $z1PlatformManager.PlatformManager.getInstance().youmengTrack(p, "user" + this.data.abName, this.getVersionName() + "_" + r, a.info);
      }
    }
  };
  _ctor.prototype.getCrunetDay = function () {
    if (this.data.day < 8) {
      return this.data.day + "";
    } else {
      if (this.data.day >= 8 && this.data.day <= 10) {
        return "8_10";
      } else {
        if (this.data.day >= 11 && this.data.day <= 15) {
          return "11_15";
        } else {
          return "16_30";
        }
      }
    }
  };
  _ctor.prototype.setCurentDay = function () {
    this.data.daytime || (this.data.daytime = new Date().getTime());
    var t = Math.max(1, $z1TimeUtils.TimeUtils.overDay(this.data.daytime) + 1);
    this.data.day = t;
    this.saveData();
  };
  _ctor.prototype.getTimeByKey = function (t) {
    this.data.listTime[t] || (this.data.listTime[t] = 0);
    return this.data.listTime[t];
  };
  _ctor.prototype.setTimeByKey = function (t, e) {
    this.data.listTime[t] = e;
    this.saveData();
  };
  _ctor.prototype.addTimeByKey = function (t) {
    this.data.listTime[t] || (this.data.listTime[t] = 0);
    this.data.listTime[t]++;
    this.saveData();
    return this.data.listTime[t];
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.TrackData = exp_TrackData;
(function (t) {
  t.ONLINE_TIME = "online_time";
  t.ADD_DESKTOP = "add_desktop";
})(exports.TimeByKey || (exports.TimeByKey = {}));
