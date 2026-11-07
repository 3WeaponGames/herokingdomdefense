var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1PoolMgr = require("PoolMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallGameEffect = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndDam = null;
    e.labList = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.initData = function (t) {
    this.ui = t;
    this.loadEffect($z1KinghtFallConfig.KinghtFallPrefabName.EffectEnemyDead);
    this.ndDam.active = false;
  };
  _ctor.prototype.loadEffect = function (t) {
    this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Effect, t, function () {});
  };
  _ctor.prototype.showDamageNum = function (t, e, n) {
    undefined === n && (n = false);
  };
  _ctor.prototype.onMonsterAttack = function (t, e) {
    var n = this;
    var i = function (i) {
      i.setParent(n.node);
      i.setPosition(t);
      i.active = true;
      var a = i.getComponentInChildren(sp.Skeleton);
      a.setAnimation(0, e, false);
      a.node.name = e;
      a.setCompleteListener(function () {
        $z1PoolMgr.PoolMgr.getInstance().freeNode($z1KinghtFallConfig.KinghtFallPoolName.EnemyAttack, i);
        a.setCompleteListener(null);
      });
    };
    var a = $z1PoolMgr.PoolMgr.getInstance().getNode($z1KinghtFallConfig.KinghtFallPoolName.EnemyAttack);
    if (a) {
      i(a);
    } else {
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Effect, $z1KinghtFallConfig.KinghtFallPrefabName.EffectEnemyAttack, function (t) {
        a = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab($z1KinghtFallConfig.KinghtFallPoolName.EnemyAttack, t, 10);
        i(a);
      });
    }
  };
  _ctor.prototype.onSoldierDead = function (t, e) {
    var n = this;
    var i = function (i) {
      i.setParent(n.node);
      i.setPosition(t);
      i.active = true;
      i.scale = e;
      var a = i.getComponentInChildren(sp.Skeleton);
      a.setAnimation(0, a.defaultAnimation, false);
      a.setCompleteListener(function () {
        $z1PoolMgr.PoolMgr.getInstance().freeNode($z1KinghtFallConfig.KinghtFallPoolName.EnemyDead, i);
        a.setCompleteListener(null);
      });
    };
    var a = $z1PoolMgr.PoolMgr.getInstance().getNode($z1KinghtFallConfig.KinghtFallPoolName.EnemyDead);
    if (a) {
      i(a);
    } else {
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Effect, $z1KinghtFallConfig.KinghtFallPrefabName.EffectEnemyDead, function (t) {
        a = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab($z1KinghtFallConfig.KinghtFallPoolName.EnemyDead, t, 10);
        i(a);
      });
    }
  };
  _ctor.prototype.onMoveTrack = function (t, e, n) {
    var i = this;
    var a = function (e) {
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.ndTrack;
      e.setParent(a);
      e.setPosition(t);
      e.active = true;
      var o = e.getComponentInChildren(sp.Skeleton);
      o.setAnimation(0, o.defaultAnimation, true);
      i.scheduleOnce(function () {
        $z1PoolMgr.PoolMgr.getInstance().freeNode(n, e);
      }, 2);
    };
    var o = $z1PoolMgr.PoolMgr.getInstance().getNode(n);
    if (o) {
      a(o);
    } else {
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Effect, e, function (t) {
        o = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab(n, t, 10);
        a(o);
      });
    }
  };
  _ctor.prototype.onAttack = function (t, e, n) {
    var i = this;
    var a = function (e) {
      e.setParent(i.ui);
      e.setPosition(t);
      e.active = true;
      var a = e.getComponentInChildren(sp.Skeleton);
      a.setAnimation(0, a.defaultAnimation, false);
      a.setCompleteListener(function () {
        $z1PoolMgr.PoolMgr.getInstance().freeNode(n, e);
        a.setCompleteListener(null);
      });
    };
    var o = $z1PoolMgr.PoolMgr.getInstance().getNode(n);
    if (o) {
      a(o);
    } else {
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Effect, e, function (t) {
        o = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab(n, t, 10);
        a(o);
      });
    }
  };
  _ctor.prototype.onAttack2 = function (t, e, n, i) {
    var a = this;
    var o = function (e) {
      e.setParent(a.ui);
      e.setPosition(t);
      e.active = true;
      var o = e.getComponentInChildren(sp.Skeleton);
      o.setAnimation(0, i, false);
      o.setCompleteListener(function () {
        $z1PoolMgr.PoolMgr.getInstance().freeNode(n, e);
        o.setCompleteListener(null);
      });
    };
    var r = $z1PoolMgr.PoolMgr.getInstance().getNode(n);
    if (r) {
      o(r);
    } else {
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Effect, e, function (t) {
        r = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab(n, t, 10);
        o(r);
      });
    }
  };
  _ctor.prototype.onBuff = function (t, e, n) {
    var i = $z1PoolMgr.PoolMgr.getInstance().getNode(e);
    if (i) {
      n(i);
    } else {
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Effect, t, function (t) {
        i = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab(e, t, 10);
        n(i);
      });
    }
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "伤害数字"
  })], _ctor.prototype, "ndDam", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_KinghtFallGameEffect;
