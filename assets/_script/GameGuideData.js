var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GuideData = undefined;
var $z1BaseData = require("BaseData");
var $z1Config = require("Config");
var s = function () {
  this.currentId = 1;
};
var exp_GuideData = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.aliseMap = {
      currentId: 1
    };
    e.protoId = 2;
    e.ecrypt = false;
    e.gameKey = $z1Config.GameConfig.AppCacheName + "guide";
    e.endId = 4;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.createData = function () {
    this.data = new s();
    return this.data;
  };
  _ctor.prototype.getCurrentId = function () {
    return this.data.currentId;
  };
  _ctor.prototype.addCurrentId = function (t) {
    undefined === t && (t = true);
    this.data.currentId += 1;
    t && this.saveData();
  };
  _ctor.prototype.getGuideEnd = function () {
    return this.data.currentId >= this.endId;
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.GuideData = exp_GuideData;