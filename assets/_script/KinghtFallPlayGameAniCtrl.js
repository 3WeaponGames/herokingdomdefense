var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1AudioMgr = require("AudioMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallPlayGameAniCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.spAniMa = null;
    e.spAniBody = null;
    e.spAniDrap = null;
    e.spAniHead = null;
    e.spAniBow = null;
    e.spAniArrow = null;
    e.spAniHand = null;
    e.spAniSmoke = null;
    e.spAniSoulFire = null;
    e.spAniRevive = null;
    e.spAniLevelUp = null;
    e.ndReviveTail = null;
    e.isMove = true;
    e.isDie = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.initView = function () {
    var t;
    var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getEquipCfgList();
    for (var n = 0; n < e.length; n++) {
      var i = e[n];
      var a = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(i.id);
      switch (i.id) {
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Body:
          this.spAniDrap.setSkin(i.levelInfo[a - 1].EquipSkin);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Head:
          this.spAniHead.setSkin(i.levelInfo[a - 1].EquipSkin);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Arrow:
          this.spAniArrow.setSkin(i.levelInfo[a - 1].EquipSkin);
          this.arrName = i.levelInfo[a - 1].EquipSkin;
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Bow:
          this.spAniBow.setSkin(i.levelInfo[a - 1].EquipSkin);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Gloves:
          this.spAniHand.setSkin(i.levelInfo[a - 1].EquipSkin);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.horse:
          this.spAniMa.setSkin(i.levelInfo[a - 1].EquipSkin);
      }
    }
    null === (t = this.spAniSmoke) || undefined === t || t.setAnimation(0, "move_3", false);
    this.spAniSoulFire.node.active = false;
    this.spAniRevive.node.active = false;
    this.spAniLevelUp.node.active = false;
    this.ndReviveTail.active = false;
  };
  _ctor.prototype.setAttackEvent = function (t) {
    this.spAniBody.setEventListener(function (e, n) {
      switch (n.data.name) {
        case "attack":
          t();
      }
    });
  };
  _ctor.prototype.setAttackEnd = function (t) {
    var e = this;
    this.spAniBody.setCompleteListener(function () {
      e.spAniBody.animation == $z1KinghtFallModle.KinghtFallPlayAniEnum.Attack && t();
    });
  };
  _ctor.prototype.setMaLeft = function (t) {
    if (0 != t) {
      this.spAniMa.node.scaleX = t < 0 ? -1 : 1;
      this.spAniSmoke.node.scaleX = t < 0 ? -1 : 1;
    }
  };
  _ctor.prototype.setBodyLeft = function (t) {
    0 == t && (t = this.spAniMa.node.scaleX);
    this.spAniBody.node.scaleX = t < 0 ? -1 : 1;
    this.spAniDrap.node.scaleX = t < 0 ? -1 : 1;
    this.spAniHead.node.scaleX = t < 0 ? -1 : 1;
    this.spAniBow.node.scaleX = t < 0 ? -1 : 1;
    this.spAniArrow.node.scaleX = t < 0 ? -1 : 1;
    this.spAniHand.node.scaleX = t < 0 ? -1 : 1;
  };
  _ctor.prototype.setAttack = function (t) {
    var e = this.spAniBody.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Attack, false);
    t && this.spAniBody.setTrackCompleteListener(e, function () {
      t();
    });
    this.spAniBody.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniDrap.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Attack, false);
    this.spAniDrap.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniHead.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Attack, false);
    this.spAniHead.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniBow.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Attack, false);
    this.spAniBow.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniArrow.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Attack, false);
    this.spAniArrow.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniHand.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Attack, false);
    this.spAniHand.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
  };
  _ctor.prototype.setIdle = function () {
    var t;
    if (this.isMove) {
      this.isMove = false;
      if (!this.isDie) {
        this.spAniMa.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true), null === (t = this.spAniSmoke) || undefined === t || t.setAnimation(0, "move_3", false);
      }
    }
  };
  _ctor.prototype.setMove = function () {
    if (!this.isMove) {
      this.isMove = true;
      if (!this.isDie) {
        this.spAniMa.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Move, true), this.spAniSmoke.setAnimation(0, "move_1", false), this.spAniSmoke.addAnimation(0, "move_2", true);
      }
    }
  };
  _ctor.prototype.setPause = function (t) {
    this.spAniMa.paused = t;
    this.spAniBody.paused = t;
    this.spAniDrap.paused = t;
    this.spAniHead.paused = t;
    this.spAniBow.paused = t;
    this.spAniArrow.paused = t;
    this.spAniHand.paused = t;
    this.spAniSmoke && (this.spAniSmoke.paused = t);
  };
  _ctor.prototype.setDie = function (t) {
    this.isDie = true;
    this.spAniMa.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Die, false);
    this.spAniBody.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Die, false);
    this.spAniDrap.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Die, false);
    this.spAniHead.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Die, false);
    this.spAniBow.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Die, false);
    this.spAniArrow.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Die, false);
    this.spAniHand.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Die, false);
    this.spAniSmoke.node.active = false;
    this.spAniSoulFire.node.active = true;
    var e = this.spAniSoulFire.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Die, false);
    this.spAniSoulFire.setTrackCompleteListener(e, function () {
      t && t();
    });
    this.spAniSoulFire.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.DieKeep, true);
    this.ndReviveTail.active = true;
  };
  _ctor.prototype.setRevive = function (t) {
    var e = this;
    this.spAniMa.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Rise, false);
    this.spAniMa.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniBody.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Rise, false);
    this.spAniBody.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniDrap.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Rise, false);
    this.spAniDrap.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniHead.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Rise, false);
    this.spAniHead.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniBow.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Rise, false);
    this.spAniBow.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniArrow.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Rise, false);
    this.spAniArrow.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniHand.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Rise, false);
    this.spAniHand.addAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniSoulFire.node.active = false;
    this.spAniRevive.node.active = true;
    this.spAniRevive.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Rise, false);
    this.spAniRevive.setCompleteListener(function () {
      e.isDie = false;
      e.spAniRevive.node.active = false;
      e.ndReviveTail.active = false;
      e.spAniSmoke.node.active = true;
      if (e.isMove) {
        e.spAniMa.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Move, true);
        e.spAniSmoke.setAnimation(0, "move_1", false);
        e.spAniSmoke.addAnimation(0, "move_2", true);
      } else {
        e.spAniMa.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
        e.spAniSmoke.setAnimation(0, "move_3", false);
      }
      t && t();
      e.spAniRevive.setCompleteListener(null);
    });
  };
  _ctor.prototype.setLevelUp = function (t) {
    var e = this;
    this.spAniLevelUp.node.active = true;
    this.spAniLevelUp.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.LevelUp, false);
    this.spAniLevelUp.setCompleteListener(function () {
      e.spAniLevelUp.node.active = false;
      t && t();
    });
    $z1AudioMgr.AudioMgr.getInstance().playEffect($z1KinghtFallConfig.KinghtFallAudioId.get_idea);
  };
  _ctor.prototype.onRestart = function () {
    var t;
    this.isMove = false;
    this.isDie = false;
    this.setPause(false);
    this.spAniMa.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniBody.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniDrap.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniHead.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniBow.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniArrow.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    this.spAniHand.setAnimation(0, $z1KinghtFallModle.KinghtFallPlayAniEnum.Idle, true);
    null === (t = this.spAniSmoke) || undefined === t || t.setAnimation(0, "move_3", false);
    this.spAniSoulFire.node.active = false;
    this.spAniRevive.node.active = false;
    this.spAniLevelUp.node.active = false;
    this.ndReviveTail.active = false;
  };
  _ctor.prototype.onChangeSpeed = function () {
    var t = $z1KinghtFallUIGame.default.instance.speed;
    this.spAniMa.timeScale = t;
    this.spAniBody.timeScale = t;
    this.spAniDrap.timeScale = t;
    this.spAniHead.timeScale = t;
    this.spAniBow.timeScale = t;
    this.spAniArrow.timeScale = t;
    this.spAniHand.timeScale = t;
    this.spAniSmoke.timeScale = t;
    this.spAniSoulFire.timeScale = t;
    this.spAniRevive.timeScale = t;
    this.spAniLevelUp.timeScale = t;
  };
  _ctor.prototype.setBus = function (t) {
    switch (t) {
      case 0:
        var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getEquipCfgList();
        for (var n = 0; n < e.length; n++) {
          var i = e[n];
          var a = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(i.id);
          switch (i.id) {
            case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Arrow:
              this.spAniArrow.setSkin(i.levelInfo[a - 1].EquipSkin);
              this.arrName = i.levelInfo[a - 1].EquipSkin;
              break;
            case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Bow:
              this.spAniBow.setSkin(i.levelInfo[a - 1].EquipSkin);
              break;
            case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.horse:
              this.spAniMa.setSkin(i.levelInfo[a - 1].EquipSkin);
          }
        }
        break;
      case 1:
        this.arrName = "vip1";
        this.spAniArrow.setSkin("vip1");
        this.spAniBow.setSkin("vip1");
        this.setLevelUp();
        break;
      case 2:
        this.spAniMa.setSkin("vip1");
        this.setLevelUp();
        break;
      case 3:
        this.arrName = "vip2";
        this.spAniArrow.setSkin("vip2");
        this.spAniBow.setSkin("vip2");
        this.setLevelUp();
        break;
      case 4:
        this.spAniMa.setSkin("vip2");
        this.setLevelUp();
    }
  };
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "马"
  })], _ctor.prototype, "spAniMa", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "身体"
  })], _ctor.prototype, "spAniBody", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "斗篷"
  })], _ctor.prototype, "spAniDrap", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "头"
  })], _ctor.prototype, "spAniHead", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "弓"
  })], _ctor.prototype, "spAniBow", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "箭"
  })], _ctor.prototype, "spAniArrow", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "手"
  })], _ctor.prototype, "spAniHand", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "烟"
  })], _ctor.prototype, "spAniSmoke", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "魂火"
  })], _ctor.prototype, "spAniSoulFire", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "复活动画"
  })], _ctor.prototype, "spAniRevive", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "升级动画"
  })], _ctor.prototype, "spAniLevelUp", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "复活拖尾"
  })], _ctor.prototype, "ndReviveTail", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_KinghtFallPlayGameAniCtrl;