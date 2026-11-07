Object.defineProperty(exports, "__esModule", { value: true });
exports.KinghtFallAudioMgr = undefined;
var $z1AudioMgr = require("AudioMgr");
var $z1CacheUtils = require("CacheUtils");
var exp_KinghtFallAudioMgr = function () {
  function _ctor() {}
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.playEffectName = function (id, key, volume) {
    $z1AudioMgr.AudioMgr.getInstance().playNamedEffect(id, key, volume);
  };
  _ctor.prototype.playEffectNameFree = function (id, key, volume) {
    if (!$z1CacheUtils.CacheUtils.canPlayEffect()) return;
    var manager = $z1AudioMgr.AudioMgr.getInstance();
    if (!manager.getAdConf(id)) return;
    // Keep two free channels and one replaceable channel, as for normal effects.
    // Apply volume once, after choosing the channel.
    var selected = key + "_2";
    for (var i = 0; i < 3; i++) {
      var name = key + "_" + i;
      var source = manager.freeEffectMap.get(name);
      if (!source) { source = manager.getAudioSource(name); manager.freeEffectMap.set(name, source); }
      if (!manager.sourceBusy(source)) { selected = name; break; }
    }
    manager.playNamedEffect(id, selected, volume);
  };
  _ctor.prototype.stopEffectName = function (key) {
    // Invalidate pending loads too, including the hero's named running loop.
    $z1AudioMgr.AudioMgr.getInstance().stopMusic(key);
  };
  return _ctor;
}();
exports.KinghtFallAudioMgr = exp_KinghtFallAudioMgr;
