var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallEnemyBuffType = exports.KinghtFallEnemyBuffInfo = exports.KinghtFallInterface = undefined;
var $z1BaseCtrl = require("BaseCtrl");
var $z1PoolMgr = require("PoolMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var exp_KinghtFallInterface = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndEffect = null;
    e.debuffInfo = [];
    e.isBig = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.setBody = function (t) {
    this.body = t;
  };
  _ctor.prototype.getBuff = function (t) {
    for (var e = 0; e < this.debuffInfo.length; e++) {
      var n = this.debuffInfo[e];
      if (n.type == t) {
        return n;
      }
    }
    return null;
  };
  _ctor.prototype.getBuffList = function (t) {
    var e = [];
    for (var n = 0; n < this.debuffInfo.length; n++) {
      var i = this.debuffInfo[n];
      i.type == t && e.push(i);
    }
    return e;
  };
  _ctor.prototype.addBuff = function (t, e) {
    var n = this;
    var i = new exp_KinghtFallEnemyBuffInfo(t, e);
    switch (t) {
      case p.AttackSpeed:
        this.body && (this.body.color = new cc.Color().fromHEX("#FF7676"));
        break;
      case p.DamageCut:
        $z1KinghtFallUIGame.default.instance.ctrEffect.onBuff($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier10Buff, $z1KinghtFallConfig.KinghtFallPoolName.Soldier10Buff, function (t) {
          t.active = true;
          i.node = t;
          t.setParent(n.ndEffect);
          t.setPosition(cc.Vec2.ZERO);
          t.getComponentInChildren(sp.Skeleton).setAnimation(0, n.isBig ? "debuff_da" : "debuff_xiao", true);
        });
    }
    this.debuffInfo.push(i);
  };
  _ctor.prototype.delBuff = function (t) {
    for (var e = 0; e < this.debuffInfo.length; e++) {
      if (this.debuffInfo[e].type == t) {
        this.delBuffIdx(e);
        e--;
      }
    }
  };
  _ctor.prototype.delBuffIdx = function (t) {
    var e = this.debuffInfo[t];
    switch (e.type) {
      case p.AttackSpeed:
        this.getBuffList(e.type).length <= 1 && this.body && (this.body.color = cc.Color.WHITE);
        break;
      case p.DamageCut:
        e.node && $z1PoolMgr.PoolMgr.getInstance().freeNode($z1KinghtFallConfig.KinghtFallPoolName.Soldier10Buff, e.node);
    }
    this.debuffInfo.splice(t, 1);
  };
  _ctor.prototype.delAllBuff = function () {
    this.body && (this.body.color = cc.Color.WHITE);
    for (var t = 0; t < this.debuffInfo.length; t++) {
      var e = this.debuffInfo[t];
      switch (e.type) {
        case p.AttackSpeed:
          break;
        case p.DamageCut:
          e.node && $z1PoolMgr.PoolMgr.getInstance().freeNode($z1KinghtFallConfig.KinghtFallPoolName.Soldier10Buff, e.node);
      }
    }
    this.ndEffect.removeAllChildren();
    this.debuffInfo = [];
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "特效节点"
  })], _ctor.prototype, "ndEffect", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.KinghtFallInterface = exp_KinghtFallInterface;
var p;
var exp_KinghtFallEnemyBuffInfo = function (t, e) {
  this.type = t;
  this.time = 0;
  this.data = e;
  this.timeMax = e.time;
};
exports.KinghtFallEnemyBuffInfo = exp_KinghtFallEnemyBuffInfo;
(function (t) {
  t[t.AttackSpeed = 0] = "AttackSpeed";
  t[t.DamageAdd = 1] = "DamageAdd";
  t[t.DamageCut = 2] = "DamageCut";
  t[t.MoveSpeed = 3] = "MoveSpeed";
  t[t.MoveSpeedAdd = 4] = "MoveSpeedAdd";
})(p = exports.KinghtFallEnemyBuffType || (exports.KinghtFallEnemyBuffType = {}));