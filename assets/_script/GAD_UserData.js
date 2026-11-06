var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseData = require("BaseData");
var $z1Config = require("Config");
var s = function () {
  this.level = 1;
};
var def_GAD_UserData = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.protoId = 1;
    e.ecrypt = false;
    e.aliseMap = {
      level: "1"
    };
    e.gameKey = $z1Config.GameConfig.AppCacheName + "gad_udata";
    e.isNewUser = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.createData = function () {
    this.data = new s();
    return this.data;
  };
  _ctor.prototype.initData = function (t) {
    t && (this.isNewUser = true);
    this.saveData();
  };
  _ctor.prototype.getLevel = function () {
    return this.data.level || 1;
  };
  _ctor.prototype.addLevel = function () {
    this.data.level = this.data.level || 1;
    this.data.level++;
    this.saveData();
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.default = def_GAD_UserData;