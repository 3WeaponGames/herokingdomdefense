var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SegBaseData = exports.SegData = undefined;
var $z1CacheUtils = require("CacheUtils");
var $z1ServerDataMgr = require("ServerDataMgr");
var $z1BaseData = require("BaseData");
var $z1EventMgr = require("EventMgr");
var $z1Utils = require("Utils");
exports.SegData = function () {
  this.maxNum = 0;
};
var exp_SegBaseData = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.len = 30;
    e.saveMap = new Map();
    e.timeMap = new Map();
    e.changleIndex = new Set();
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.getData = function () {
    var t = this;
    if (null == this.data) {
      $z1EventMgr.EventMgr.getInstance().on("CLEARDATA", this, function (e) {
        t.pause = e;
      });
      cc.game.on(cc.game.EVENT_HIDE, function () {
        t.saveMap.forEach(function (e, n) {
          var i = n;
          var a = null;
          if (0 == n) {
            (a = JSON.parse(JSON.stringify(t.data)))[t.ListName] = t.data[t.ListName].slice(i * t.len, (i + 1) * t.len);
          } else {
            (a = {
              list: t.data[t.ListName].slice(i * t.len, (i + 1) * t.len)
            })[t.savetimeKey] = t.timeMap.get(t.gameKey + i);
          }
          t.UpdateData2(a, e);
        });
      }, this);
      setInterval(function () {
        t.saveMap.forEach(function (e, n) {
          var i = n;
          var a = null;
          if (0 == n) {
            (a = JSON.parse(JSON.stringify(t.data)))[t.ListName] = t.data[t.ListName].slice(i * t.len, (i + 1) * t.len);
          } else {
            (a = {
              list: t.data[t.ListName].slice(i * t.len, (i + 1) * t.len)
            })[t.savetimeKey] = t.timeMap.get(t.gameKey + i);
          }
          t.UpdateData2(a, e);
        });
      }, 1e3);
      var e = function (n) {
        var i;
        var a = $z1ServerDataMgr.ServerdataMgr.getDataByKey(t.gameKey + n);
        if (0 == n) {
          if (a) {
            t.data = t.loaddata(a, t.gameKey + n, true);
            e(n + 1);
          } else {
            t.loadlocaldata();
          }
        } else if (a) {
          var o = t.loaddata(a, t.gameKey + n, false);
          if (!Array.isArray(o)) {
            t.timeMap.set(t.gameKey + n, o[t.savetimeKey]);
            o = o.list;
          }
          (i = t.data[t.ListName]).push.apply(i, o);
          e(n + 1);
        } else {
          t.initData(false);
        }
      };
      e(0);
      return this.data;
    }
    return this.data;
  };
  _ctor.prototype.loadlocaldata = function () {
    var t;
    var e = false;
    for (var n = 0;; n++) {
      var i = this.ecrypt ? $z1CacheUtils.CacheUtils.getDataDecrypt(this.gameKey + n, this.pwd) : $z1CacheUtils.CacheUtils.getData(this.gameKey + n);
      if (0 == n) {
        if (!i) {
          break;
        }
        this.data = $z1Utils.Utils.restoreObjectKeys(JSON.parse(i), this.aliseMap);
        e = true;
      } else {
        if (!i) {
          break;
        }
        var a = $z1Utils.Utils.restoreObjectKeys(JSON.parse(i), this.aliseMap);
        if (!Array.isArray(a)) {
          this.timeMap.set(this.gameKey + n, a[this.savetimeKey]);
          a = a.list;
        }
        (t = this.data[this.ListName]).push.apply(t, a);
      }
    }
    if (e) {
      this.initData(false);
    } else {
      this.data = this.createData();
      this.initData(true);
    }
  };
  _ctor.prototype.saveData = function (e) {
    var n = this;
    if (!this.pause) {
      if (e || 0 == e) {
        if (this.data[this.ListName]) {
          var i = Math.floor(this.data[this.ListName].length / this.len);
          var a = this.data.maxNum;
          var s = Math.max(a, i);
          if (a != s) {
            this.data.maxNum = s;
            this.changleIndex.add(0);
          }
          if (-1 == e) {
            for (var l = 0; l <= a; l++) {
              this.changleIndex.add(l);
            }
          } else {
            this.changleIndex.add(e);
          }
          this.changleIndex.forEach(function (t) {
            var e = t;
            var i = null;
            var a = n.timeMap.get(n.gameKey + e);
            if (0 == e) {
              (i = JSON.parse(JSON.stringify(n.data)))[n.ListName] = n.data[n.ListName].slice(e * n.len, (e + 1) * n.len);
              n.data[n.savetimeKey] = a || Number((new Date().getTime() / 1e3).toFixed(0));
            } else {
              (i = {
                list: n.data[n.ListName].slice(e * n.len, (e + 1) * n.len)
              })[n.savetimeKey] = a || Number((new Date().getTime() / 1e3).toFixed(0));
            }
            if (n.ecrypt) {
              $z1CacheUtils.CacheUtils.saveDataEncrypt(n.gameKey + e, JSON.stringify($z1Utils.Utils.renameObjectKeys(i, n.aliseMap)), n.pwd);
            } else {
              $z1CacheUtils.CacheUtils.saveData(n.gameKey + e, JSON.stringify($z1Utils.Utils.renameObjectKeys(i, n.aliseMap)));
            }
            $z1ServerDataMgr.ServerdataMgr.getNeedSaveServer() && n.UpdateData2(i, e);
          });
          this.changleIndex.clear();
        } else {
          t.prototype.saveData.call(this, -1);
        }
      } else {
        console.error("!!!!!!!!!!!!key的后缀不能为空!!!!!!");
      }
    }
  };
  _ctor.prototype.UpdateData2 = function (t, e) {
    undefined === e && (e = 0);
    var n = t[this.savetimeKey];
    var i = Number((new Date().getTime() / 1e3).toFixed(0));
    if (n && i - n < this.invertTime) {
      this.saveMap.set(e, e);
    } else {
      this.saveMap.delete(e);
      this.timeMap.set(this.gameKey + e, i);
      var a = JSON.stringify($z1Utils.Utils.renameObjectKeys(t, this.aliseMap));
      $z1ServerDataMgr.ServerdataMgr.saveData(this.gameKey + e, a, function () {});
    }
  };
  _ctor.prototype.clearData = function () {
    for (var t = 0; t < this.data.maxNum; t++) {
      localStorage.removeItem(this.gameKey + t);
    }
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.SegBaseData = exp_SegBaseData;