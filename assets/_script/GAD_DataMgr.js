var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BasePlatform = require("BasePlatform");
var $z1PlatformManager = require("PlatformManager");
var $z1ResourceMgr = require("ResourceMgr");
var $z1GAD_Configs = require("GAD_Configs");
var $z1GADGameEnumData = require("GADGameEnumData");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_GAD_DataMgr = function () {
  function _ctor() {
    this._isRemote = false;
  }
  var e;
  e = _ctor;
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new e());
    return this.instance;
  };
  _ctor.prototype.getUrlParam = function (t) {
    var e;
    var n;
    if (!window || !window.location) {
      return null;
    }
    var i = null === (n = null === (e = null === window || undefined === window ? undefined : window.location) || undefined === e ? undefined : e.search) || undefined === n ? undefined : n.replace("?", "");
    if (!i || "" === i) {
      return null;
    }
    var a = i.split("&");
    for (var o = 0; o < a.length; o++) {
      var r = a[o].split("=");
      if (decodeURIComponent(r[0]) === t) {
        return decodeURIComponent(r[1]);
      }
    }
    return null;
  };
  _ctor.prototype.load = function (t) {
    var e = this;
    this._isRemote;
    if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.EDITOR) {
      this.getUrlParam("isRemote");
    }
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes($z1GAD_Configs.emGADBundles.configs, "GameJsonCfg", cc.JsonAsset, function (n) {
      e.data = n.json;
      n.decRef();
      t && t();
    });
  };
  _ctor.prototype.initCfgData = function () {
    $z1GAD_Configs.GADConfig.WallWidth = .5 * this.getParam($z1GADGameEnumData.enumGADBasicCfg.WallWidth, 750);
    $z1GAD_Configs.GADConfig.EnemyFixedWidth = this.getParam($z1GADGameEnumData.enumGADBasicCfg.EnemyFixedWidth, 188);
  };
  _ctor.prototype.getParam = function (t, e) {
    undefined === e && (e = 0);
    if (this.data.basicCfg[t]) {
      return this.data.basicCfg[t].para;
    } else {
      return e;
    }
  };
  _ctor.prototype.getAllMembers = function () {
    return this.data.memberCfg;
  };
  _ctor.prototype.getWaveCfgs = function () {
    return this.data.levelCfg;
  };
  _ctor.prototype.isBuffType = function (t) {
    for (var e = 0; e < this.data.buffTypeCfg.length; e++) {
      if (this.data.buffTypeCfg[e].buffType == t) {
        return true;
      }
    }
    return false;
  };
  _ctor.prototype.getBuffTypeCfg = function (t) {
    for (var e = 0; e < this.data.buffTypeCfg.length; e++) {
      if (this.data.buffTypeCfg[e].buffType == t) {
        return this.data.buffTypeCfg[e];
      }
    }
    return null;
  };
  _ctor.prototype.getBubbleCfg = function (t) {
    for (var e = 0; e < this.data.bubbleCfg.length; e++) {
      if (this.data.bubbleCfg[e].typeBubble == t) {
        return this.data.bubbleCfg[e];
      }
    }
    return null;
  };
  _ctor.prototype.getEnemyCfg = function (t) {
    for (var e = 0; e < this.data.enemyCfg.length; e++) {
      if (this.data.enemyCfg[e].id == t) {
        return this.data.enemyCfg[e];
      }
    }
    return null;
  };
  return e = cc__decorate([ccp_ccclass], _ctor);
}();
exports.default = def_GAD_DataMgr;