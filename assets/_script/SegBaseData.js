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
    e.segmentRecords = new Map();
    e._segmentRequests = new Map();
    e._segmentRetries = new Map();
    e._segmentRevisions = new Map();
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
        if (t.clearPending) return void t.clearData();
        if (t.localSavePending) t.saveData(-1);
        t.saveMap.forEach(function (e, n) {
          var i = n;
          var a = null;
          if (0 == n) {
            (a = JSON.parse(JSON.stringify(t.data)))[t.ListName] = t.data[t.ListName].slice(i * t.len, (i + 1) * t.len);
          } else {
            var previous = t.segmentRecords.get(i);
            a = previous && !Array.isArray(previous) ? Object.assign({}, previous) : {};
            a.list = t.data[t.ListName].slice(i * t.len, (i + 1) * t.len);
            a[t.savetimeKey] = t.data[t.savetimeKey];
          }
          t.UpdateData2(a, e, true);
        });
      }, this);
      setInterval(function () {
        if (t.clearPending) return void t.clearData();
        if (t.localSavePending) t.saveData(-1);
        t.saveMap.forEach(function (e, n) {
          var i = n;
          var a = null;
          if (0 == n) {
            (a = JSON.parse(JSON.stringify(t.data)))[t.ListName] = t.data[t.ListName].slice(i * t.len, (i + 1) * t.len);
          } else {
            var previous = t.segmentRecords.get(i);
            a = previous && !Array.isArray(previous) ? Object.assign({}, previous) : {};
            a.list = t.data[t.ListName].slice(i * t.len, (i + 1) * t.len);
            a[t.savetimeKey] = t.data[t.savetimeKey];
          }
          t.UpdateData2(a, e);
        });
      }, 1e3);
      this.loadlocaldata(true);
      return this.data;
    }
    return this.data;
  };
  _ctor.prototype.readSegment = function (raw, key, source, index) {
    if (!raw) return null;
    var value = this.readSaveRecord(raw, key, source, source === "local" && this.ecrypt);
    if (!value) return null;
    var list = index === 0 ? value[this.ListName] : Array.isArray(value) ? value : value.list;
    if (!Array.isArray(list) || index === 0 && (Array.isArray(value) || value.maxNum !== undefined && (!Number.isInteger(value.maxNum) || value.maxNum < 0))) {
      this.preserveSaveRecord(raw, key, source);
      return null;
    }
    return value;
  };
  _ctor.prototype.loadlocaldata = function (includeServer) {
    this.invalidateCloudSaves();
    this._segmentRequests.clear();
    this._segmentRetries.clear();
    this._segmentRevisions.clear();
    this.saveMap.clear();
    this.timeMap.clear();
    this.segmentRecords.clear();
    var found = false, limit = Infinity;
    for (var index = 0; index <= limit; index++) {
      var key = this.gameKey + index, localRaw, serverRaw;
      try { localRaw = $z1CacheUtils.CacheUtils.getData(key); } catch (error) { this.saveBlockedByRecovery = true; }
      if (includeServer) serverRaw = $z1ServerDataMgr.ServerdataMgr.getDataByKey(key);
      if (!localRaw && !serverRaw) {
        if (found && isFinite(limit) && index < limit) this.saveBlockedByRecovery = true;
        break;
      }
      var local = this.readSegment(localRaw, key, "local", index);
      var server = this.readSegment(serverRaw, key, "server", index);
      var localTime = local && local[this.savetimeKey], serverTime = server && server[this.savetimeKey];
      var chosen = local && server && localTime && serverTime && localTime >= serverTime ? local : server || local;
      if (!chosen) { this.saveBlockedByRecovery = true; break; }
      this.segmentRecords.set(index, chosen);
      if (index === 0) {
        this.data = chosen;
        // Do not append tail entries to the list parsed from the first chunk.
        this.data[this.ListName] = chosen[this.ListName].slice();
        found = true;
        limit = Number.isInteger(chosen.maxNum) ? chosen.maxNum : Infinity;
      } else {
        var list = Array.isArray(chosen) ? chosen : chosen.list;
        Array.prototype.push.apply(this.data[this.ListName], list);
      }
      if (server) this.timeMap.set(key, server[this.savetimeKey]);
    }
    if (!found) this.data = this.createData();
    else if (!Number.isInteger(this.data.maxNum)) this.data.maxNum = Math.max(0, this.segmentRecords.size - 1);
    this.initData(!found);
  };
  _ctor.prototype.saveData = function (e) {
    var n = this;
    if (this.deferSave) return true;
    if (this.pause || this.saveBlockedByRecovery || this.clearPending) { this.reportSaveFailure(); return false; }
    if (!this.pause) {
      if (e === undefined) e = -1;
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
            for (var l = 0; l <= s; l++) {
              this.changleIndex.add(l);
            }
          } else {
            this.changleIndex.add(e);
          }
          var success = true, pendingCloud = [];
          this.data[this.savetimeKey] = Number((new Date().getTime() / 1e3).toFixed(0));
          this.changleIndex.forEach(function (t) {
            var e = t;
            var i = null;
            if (0 == e) {
              (i = JSON.parse(JSON.stringify(n.data)))[n.ListName] = n.data[n.ListName].slice(e * n.len, (e + 1) * n.len);
            } else {
              var previous = n.segmentRecords.get(e);
              i = previous && !Array.isArray(previous) ? Object.assign({}, previous) : {};
              i.list = n.data[n.ListName].slice(e * n.len, (e + 1) * n.len);
              i[n.savetimeKey] = n.data[n.savetimeKey];
            }
            var saved = false;
            try {
            if (n.ecrypt) {
              saved = $z1CacheUtils.CacheUtils.saveDataEncrypt(n.gameKey + e, JSON.stringify($z1Utils.Utils.renameObjectKeys(i, n.aliseMap)), n.pwd);
            } else {
              saved = $z1CacheUtils.CacheUtils.saveData(n.gameKey + e, JSON.stringify($z1Utils.Utils.renameObjectKeys(i, n.aliseMap)));
            }
            } catch (error) { saved = false; }
            if (saved === false) { success = false; return; }
            n.segmentRecords.set(e, i);
            n._segmentRevisions.set(e, (n._segmentRevisions.get(e) || 0) + 1);
            n.changleIndex.delete(e);
            if ($z1ServerDataMgr.ServerdataMgr.getNeedSaveServer()) {
              n.saveMap.set(e, e);
              pendingCloud.push({ data: i, index: e });
            }
          });
          if (!success) { this.reportSaveFailure(); return false; }
          this.localSavePending = false;
          pendingCloud.forEach(function (entry) { n.UpdateData2(entry.data, entry.index); });
          if (this.saveFailureReported) { this.saveFailureReported = false; $z1EventMgr.EventMgr.getInstance().emit("SaveRecovered", { key: this.gameKey }); }
          return true;
        } else {
          return t.prototype.saveData.call(this, -1);
        }
      } else {
        console.error("!!!!!!!!!!!!key的后缀不能为空!!!!!!");
      }
    }
  };
  _ctor.prototype.UpdateData2 = function (t, e, force) {
    undefined === e && (e = 0);
    if (this.pause || this.saveBlockedByRecovery || this.localSavePending || this.deferSave || this.clearPending) return;
    if (!$z1ServerDataMgr.ServerdataMgr.getNeedSaveServer()) return;
    this.saveMap.set(e, e);
    if (this._segmentRequests.has(e)) return;
    var n = this.timeMap.get(this.gameKey + e);
    var i = Number((new Date().getTime() / 1e3).toFixed(0));
    if (i < (this._segmentRetries.get(e) || 0)) return;
    if (!force && n && i - n < this.invertTime) {
      this.saveMap.set(e, e);
    } else {
      this.saveMap.delete(e);
      this.timeMap.set(this.gameKey + e, i);
      var a = JSON.stringify($z1Utils.Utils.renameObjectKeys(t, this.aliseMap));
      var self = this, request = { generation: this._cloudGeneration, revision: this._segmentRevisions.get(e), data: this.data };
      this._segmentRequests.set(e, request);
      function finish(value, error) {
        if (self._segmentRequests.get(e) !== request || self._cloudGeneration !== request.generation) return;
        self._segmentRequests.delete(e);
        if (error || value === false) {
          self.saveMap.set(e, e);
          self._segmentRetries.set(e, Number((Date.now() / 1e3).toFixed(0)) + Math.max(1, self.invertTime));
        } else {
          self._segmentRetries.delete(e);
          if (self._segmentRevisions.get(e) !== request.revision) self.saveMap.set(e, e);
        }
      }
      try { $z1ServerDataMgr.ServerdataMgr.saveData(this.gameKey + e, a, finish); }
      catch (error) { finish(null, error); }
    }
  };
  _ctor.prototype.clearData = function () {
    this.invalidateCloudSaves();
    this._segmentRequests.clear();
    this._segmentRetries.clear();
    this._segmentRevisions.clear();
    this.saveMap.clear();
    var success = true;
    for (var t = 0; t <= this.data.maxNum; t++) {
      if ($z1CacheUtils.CacheUtils.removeData(this.gameKey + t) === false) success = false;
    }
    this.clearPending = !success;
    if (!success) { this.reportSaveFailure(); return false; }
    this.localSavePending = false;
    this.saveMap.clear();
    this.changleIndex.clear();
    this.segmentRecords.clear();
    if (this.saveFailureReported) { this.saveFailureReported = false; $z1EventMgr.EventMgr.getInstance().emit("SaveRecovered", { key: this.gameKey }); }
    return true;
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.SegBaseData = exp_SegBaseData;
