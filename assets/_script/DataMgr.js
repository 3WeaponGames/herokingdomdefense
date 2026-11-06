Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DataMgr = undefined;
var $z1Appcfg = require("Appcfg");
var $z1EventMgr = require("EventMgr");
var $z1ResourceMgr = require("ResourceMgr");
var $z1Config = require("Config");
var exp_DataMgr = function () {
  function _ctor() {
    this.readRemoteCfg = $z1Config.GameConfig.enableRcfg;
    this.bSheetNames = ["events"];
  }
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.preload = function () {
    var t = this;
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes("configs", "GameJsonCfg", cc.JsonAsset, function (e) {
      t.data = e.json;
      e.decRef();
      $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.Loading, $z1Appcfg.LoadingProcess.ExcelCfg);
    });
  };
  _ctor.prototype.reloadConfig = function (t, e) {
    var n = this;
    if ("A" != t && "C" != t) {
      if (this.bSheetNames.length <= 0) {
        e && e();
      } else {
        var i = "configsB";
        if ("D" == t) {
          i = "configsD";
          this.bSheetNames = ["events"];
        }
        $z1ResourceMgr.ResourceMgr.getInstance().loadRes(i, "GameJsonCfg", cc.JsonAsset, function (t) {
          var i = t.json;
          for (var a = 0; a < n.bSheetNames.length; a++) {
            var o = n.bSheetNames[a];
            n.data[o] = i[o];
          }
          t.decRef();
          e && e();
        });
      }
    } else {
      e && e();
    }
  };
  _ctor.prototype.getTextCfgs = function () {
    var entries = require("LanguageMgr").LanguageMgr.getInstance().catalog.entries;
    return Object.keys(entries).map(function (key) { return entries[key]; });
  };
  _ctor.prototype.getText = function (t) {
    var e = this.getTextCfgs();
    if (e) {
      for (var n = 0; n < e.length; n++) {
        var i = e[n];
        if (i.zh == t) {
          return i;
        }
      }
    }
    return null;
  };
  _ctor.prototype.T = function (e, n) {
    var manager = require("LanguageMgr").LanguageMgr.getInstance();
    return n ? manager._resolve(e, n) : manager.T(e);
  };
  return _ctor;
}();
exports.DataMgr = exp_DataMgr;
