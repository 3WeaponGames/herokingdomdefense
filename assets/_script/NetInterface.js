Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DefStringProtocol = undefined;
var exp_DefStringProtocol = function () {
  function _ctor() {}
  _ctor.prototype.getHeadlen = function () {
    return 0;
  };
  _ctor.prototype.getHearbeat = function () {
    return "";
  };
  _ctor.prototype.getPackageLen = function (t) {
    return t.toString().length;
  };
  _ctor.prototype.checkPackage = function () {
    return true;
  };
  _ctor.prototype.getPackageId = function () {
    return 0;
  };
  return _ctor;
}();
exports.DefStringProtocol = exp_DefStringProtocol;