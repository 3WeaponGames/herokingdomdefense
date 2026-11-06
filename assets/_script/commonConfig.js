var i;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.game = exports.game_UICF = exports.subGame_Conf = undefined;
var a;
var $z1Config = require("Config");
var $z1DataMgr = require("DataMgr");
(function (t) {
  t.gameA = "gameA";
})(a = exports.subGame_Conf || (exports.subGame_Conf = {}));
exports.game_UICF = ((i = {})[a.gameA] = {
  gameUIID: $z1Config.UIID,
  gameUICF: $z1Config.UICF,
  gameAudioCF: $z1Config.AudioCF,
  gameAudioId: $z1Config.AudioId,
  gameDataMgr: $z1DataMgr.DataMgr
}, i);
var exp_game = function () {
  function _ctor() {}
  _ctor.getGameConfig = function (t) {
    return exports.game_UICF[t];
  };
  return _ctor;
}();
exports.game = exp_game;