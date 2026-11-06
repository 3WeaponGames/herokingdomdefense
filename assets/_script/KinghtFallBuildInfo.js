Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallBuildInfo = undefined;
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var exp_KinghtFallBuildInfo = function () {
  function _ctor(t, e) {
    this.canUpgrade = false;
    this.standTime = 0;
    this.hp = 0;
    this.hpMax = 0;
    this.BuildID = t;
    this.standTime = 0;
    this.cfg = e;
    if (e) {
      if (e.BranchBuild && e.BranchBuild.length > 0) {
        if (t == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter) {
          this.canUpgrade = true;
        } else {
          var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getBaseLevel();
          this.canUpgrade = n > e.level;
        }
      } else {
        this.canUpgrade = false;
      }
      this.initBuffData();
    } else {
      this.canUpgrade = true;
    }
  }
  _ctor.prototype.initBuffData = function () {
    if (this.cfg) {
      var t = 1;
      if (this.BuildID == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.ArrowTower) {
        var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff39);
        e && (t += e.Pamer[0]);
        var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff55);
        n && (t += n.Pamer[0]);
      }
      var o = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff46);
      o && (t -= o.Pamer[1]);
      var r = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff48);
      if (r) {
        switch (this.BuildID) {
          case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Wall:
            t += r.Pamer[0];
            break;
          case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter:
            t -= r.Pamer[1];
        }
      }
      var s = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.talentAdd[$z1KinghtFallEnum.KinghtFallEnumTalentCfg.TalenType09];
      if (s) {
        for (var l = 0; l < s.length; l++) {
          t += s[l][0];
        }
      }
      this.BuildID == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Wall && $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.FortDurableStone] && (t += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.FortDurableStone][0]);
      this.hpMax = this.cfg.Hp * t;
      this.hp = this.hpMax;
    }
  };
  return _ctor;
}();
exports.KinghtFallBuildInfo = exp_KinghtFallBuildInfo;