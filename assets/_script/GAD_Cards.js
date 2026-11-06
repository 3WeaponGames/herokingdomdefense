var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1AudioMgr = require("AudioMgr");
var $z1GAD_Configs = require("GAD_Configs");
var $z1GADGameEnumData = require("GADGameEnumData");
var $z1GAD_DataMgr = require("GAD_DataMgr");
var $z1GAD_PlayerMgr = require("GAD_PlayerMgr");
var $z1GAD_Base = require("GAD_Base");
var $z1GAD_CardItem = require("GAD_CardItem");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var m = [cc.v2(-67, -90), cc.v2(67, -90), cc.v2(-67, -220), cc.v2(67, -220), cc.v2(-67, -350), cc.v2(67, -350)];
var def_GAD_Cards = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.prefabCarItem = null;
    e.ndCardRoot = null;
    e.spPropName = null;
    e.lblHP = null;
    e.spBr = null;
    e.ndRoot = null;
    e.maxHp = 100;
    e.hp = 100;
    e.atkCDInterval = 1e3;
    e.atkCD = 1e3;
    e.cdParam = 0;
    e.atkDamage = 0;
    e.maxBulletCnt = 6;
    e.bulletLimit = 6;
    e._edge = {
      left: 1e4,
      right: -1e4,
      top: -2e4,
      bottom: 2e4
    };
    e._cards = [];
    e._RangeType = 2;
    e._isAttacking = false;
    e.OFF_Y = 30;
    e.SPEED = 500;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.setMaxHp = function (t, e) {
    this.maxHp = t;
    e && (this.hp = this.maxHp);
    this.refreshBar();
  };
  _ctor.prototype.refreshBar = function () {
    var t = Math.min(1, Math.max(0, this.hp / this.maxHp));
    this.spBr.node.width = 696 * t;
    this.lblHP.string = "" + Math.floor(this.hp);
  };
  _ctor.prototype.onLoad = function () {
    this.initTagID();
  };
  _ctor.prototype.start = function () {
    if (0 == this._RangeType) {
      this.node.y = .5 * -cc.winSize.height + 15;
    } else if (2 == this._RangeType) {
      this.node.y = .5 * -cc.winSize.height + $z1GAD_Configs.GADConfig.BottomHeight + 30, this.spBr.node.parent.y = this.node.y - 230;
    }
    this.maxBulletCnt = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.bulletLimit, 6);
    this.bulletLimit = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.memberLimit, 6);
    var t = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.basicbullet, 1);
    this.addMember(t);
    this.atkDamage = this._cards[0].getCardCfg().basicATK;
    this.setMaxHp($z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.basicHP, 20), true);
    var e = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.basicASPD, 1);
    this.atkCDInterval = e;
    this.atkCD = this.atkCDInterval;
    this.setRoleState($z1GAD_Configs.emGADRoleState.Idle);
  };
  _ctor.prototype.addMember = function (t) {
    undefined === t && (t = 1);
    for (var e = 0; e < t; e++) {
      if (this.ndCardRoot.children.length >= this.maxBulletCnt) {
        return;
      }
      var n = this.randomMemberCard();
      n && this.addCardItem(n);
    }
  };
  _ctor.prototype.subMember = function (t) {
    undefined === t && (t = 1);
    for (var e = 0; e < t; e++) {
      if (this._cards.length <= 1) {
        return;
      }
      var n = this._cards.pop();
      $z1GAD_PlayerMgr.default.getInstance().removeCard(n.getCardCfg().id);
      n.node.destroy();
    }
  };
  _ctor.prototype.addCardItem = function (t) {
    if (!this.checkIsExit(t.id)) {
      var e = cc.instantiate(this.prefabCarItem);
      e.parent = this.ndCardRoot;
      var n = e.getComponent($z1GAD_CardItem.default);
      this._cards.push(n);
      n.init(t);
      this._cards.length > 1 && n.hideView();
      $z1GAD_PlayerMgr.default.getInstance().addCard(t.id);
      e.y = -100;
      this.refreshBar();
    }
  };
  _ctor.prototype.updateSizePos = function () {
    this._edge = {
      left: 1e4,
      right: -1e4,
      top: -2e4,
      bottom: 2e4
    };
    var t = this.ndCardRoot;
    if (2 == this._RangeType) {
      for (var e = 0; e < this._cards.length; e++) {
        this._cards[e].node.setPosition(m[e]);
      }
    } else {
      var n = t.children.length;
      if (1 == n) {
        var i = t.children[0];
        if (0 == this._RangeType) {
          i.setPosition(0, .5 * i.height);
        } else {
          i.setPosition(0, .5 * -i.height);
        }
      } else {
        var a = 0;
        for (e = 0; e < 3; e++) {
          for (var o = 0; o < 2; o++) {
            var r = this._cards[a].node;
            var s = (.5 * r.width + 3) * (o % 2 == 0 ? -1 : 1);
            var l = 0;
            if (0 == this._RangeType) {
              l = .5 * r.height + (r.height - 50) * e;
              r.zIndex = 10 - e;
            } else {
              l = -(.5 * r.height + (r.height - 50) * e);
              r.zIndex = e;
            }
            r.setPosition(s, l);
            if (++a >= n) {
              break;
            }
          }
          if (a >= n) {
            break;
          }
        }
      }
    }
    this.updateEdge();
    this.updateEdgePos();
    1 == this._RangeType && (this.node.y = .5 * -cc.winSize.height + Math.abs(this._edge.top - this._edge.bottom) + 15);
  };
  _ctor.prototype.updateEdgePos = function () {
    if (2 == this._RangeType) {
      var t = .5 * this.ndCardRoot.width;
      if (this.node.x + t > $z1GAD_Configs.GADConfig.WallWidth) {
        this.node.x = $z1GAD_Configs.GADConfig.WallWidth - t;
      } else {
        this.node.x - t < -$z1GAD_Configs.GADConfig.WallWidth && (this.node.x = -$z1GAD_Configs.GADConfig.WallWidth + t);
      }
    } else {
      var e = Math.abs(.5 * Math.abs(this._edge.right - this._edge.left));
      this.node.x + e > $z1GAD_Configs.GADConfig.WallWidth && (this.node.x = $z1GAD_Configs.GADConfig.WallWidth - e);
      this.node.x - e < -$z1GAD_Configs.GADConfig.WallWidth && (this.node.x = -$z1GAD_Configs.GADConfig.WallWidth + e);
    }
  };
  _ctor.prototype.updateEdge = function () {
    for (var t = 0; t < this._cards.length; t++) {
      var e = this._cards[t].node;
      var n = .5 * e.width;
      var i = .5 * e.height;
      e.x - n < this._edge.left && (this._edge.left = e.x - n);
      e.x + n > this._edge.right && (this._edge.right = e.x + n);
      e.y - i < this._edge.bottom && (this._edge.bottom = e.y - i);
      e.y + i > this._edge.top && (this._edge.top = e.y + i);
    }
  };
  _ctor.prototype.checkIsExit = function (t) {
    for (var e = 0; e < this._cards.length; e++) {
      if (this._cards[e].getCardCfg().id == t) {
        return true;
      }
    }
    return false;
  };
  _ctor.prototype.randomMemberCard = function () {
    var t = $z1GAD_DataMgr.default.getInstance().getAllMembers();
    var e = [];
    for (var n = 0; n < t.length; n++) {
      this.checkIsExit(t[n].id) || e.push(t[n]);
    }
    if (e.length > 0) {
      return e[Math.floor(Math.random() * e.length)];
    } else {
      return null;
    }
  };
  _ctor.prototype.showPropTips = function () {};
  _ctor.prototype.getCDParam = function () {
    return Math.max(1 + this.cdParam, 1);
  };
  _ctor.prototype.updateCD = function (t) {
    this.atkCD -= t * this.getCDParam();
    this.atkCD <= 0 && (this._isAttacking || (this.atkCD = this.atkCDInterval, this.playAttack()));
  };
  _ctor.prototype.playAttack = function () {
    this._isAttacking = true;
    var t = $z1GAD_PlayerMgr.default.getInstance().getGroupID();
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1GAD_Configs.GAD_AudioId.bullet);
    var e = Math.min(1, 1 / this.getCDParam());
    var n = this._cards.length;
    var i = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.BulletSpace, 10);
    var a = .5 * -(25 * n + i * (n - 1));
    for (var o = 0; o < n; o++) {
      var g = undefined;
      if (n > 1) {
        var u = a + 12.5 + (25 + i) * o;
        g = this.node.convertToWorldSpaceAR(cc.v2(u, -10));
      }
      this._cards[o].playAttack(t, e, g);
    }
    this.ndRoot.stopAllActions();
    var d = this.OFF_Y - this.ndRoot.y;
    cc.tween(this.ndRoot).to(d / this.SPEED / e, {
      y: this.OFF_Y
    }).to(this.OFF_Y / this.SPEED / e, {
      y: 0
    }).start();
    this._isAttacking = false;
  };
  _ctor.prototype.checkCollider = function (t, e, n) {
    undefined === e && (e = 0);
    undefined === n && (n = 0);
    for (var i = this.ndCardRoot.children.length - 1; i >= 0; i--) {
      var a = this.ndCardRoot.children[i].getComponent($z1GAD_CardItem.default);
      if (a.getWorldColldierRect(e, n).intersects(t.getWorldColliderRectWithFixed())) {
        return a;
      }
    }
    return null;
  };
  _ctor.prototype.addCardLev = function (t, e) {
    for (var n = 0; n < this._cards.length; n++) {
      if (this._cards[n].getCardCfg().id == t) {
        $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1GAD_Configs.GAD_AudioId.Cards);
        this._cards[n].addLev(e);
        this.atkDamage += this._cards[n].getCardCfg().cardATK;
        return true;
      }
    }
    return false;
  };
  _ctor.prototype.addAtkDamage = function (t) {
    this.atkDamage += t;
    this.atkDamage = Math.max(1, this.atkDamage);
  };
  _ctor.prototype.getAtkDamage = function () {
    return this.atkDamage;
  };
  _ctor.prototype.addBuff = function (t, e) {
    var n = true;
    switch (t) {
      case $z1GADGameEnumData.enumGADBuffTypeCfg.SpeedPlus:
        this.cdParam += e;
        break;
      case $z1GADGameEnumData.enumGADBuffTypeCfg.SpeedSub:
        this.cdParam -= e;
        break;
      case $z1GADGameEnumData.enumGADBuffTypeCfg.ATKplus:
        this.addAtkDamage(e || 0);
        break;
      case $z1GADGameEnumData.enumGADBuffTypeCfg.ATKsub:
        this.addAtkDamage(0 - (e || 0));
        break;
      case $z1GADGameEnumData.enumGADBuffTypeCfg.memberPlus:
        this.addMember(Math.max(0, Math.floor(e)));
        break;
      case $z1GADGameEnumData.enumGADBuffTypeCfg.memberSub:
        this.subMember(Math.max(0, Math.floor(e)));
        break;
      case $z1GADGameEnumData.enumGADBuffTypeCfg.HPplus:
        this.maxHp += e;
        this.hp = Math.max(0, Math.min(this.hp + e, this.maxHp));
        this.showHpTips(e);
        this.refreshBar();
        break;
      case $z1GADGameEnumData.enumGADBuffTypeCfg.HPsub:
        this.maxHp -= e;
        var i = this.hp;
        this.hp = Math.max(0, Math.min(this.hp - e, this.maxHp));
        if (this.hp <= 0) {
          this.hp = 1;
          e = i - this.hp;
        }
        e > 0 && this.showHpTips(-e);
        this.refreshBar();
        break;
      case $z1GADGameEnumData.enumGADBuffTypeCfg.speedMultiply:
        this.cdParam = (0 == this.cdParam ? 1 : this.cdParam) * e;
        break;
      case $z1GADGameEnumData.enumGADBuffTypeCfg.speedDivision:
        0 != e && (this.cdParam /= e);
        break;
      case $z1GADGameEnumData.enumGADBuffTypeCfg.ATKMultiply:
        this.atkDamage *= e;
        this.atkDamage = Math.max(1, this.atkDamage);
        break;
      case $z1GADGameEnumData.enumGADBuffTypeCfg.ATKDivision:
        0 != e && (this.atkDamage /= e);
        this.atkDamage = Math.max(1, this.atkDamage);
        break;
      default:
        n = false;
    }
    if (n) {
      $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1GAD_Configs.GAD_AudioId.Cards);
      this.showPropTips(t);
    }
  };
  _ctor.prototype.enermyHit = function (t) {
    this.hp -= t;
    var e = $z1GAD_Configs.emGADHitState.None;
    if (this.hp <= 0) {
      this.hp = 0;
      e = $z1GAD_Configs.emGADHitState.HitDie;
      this.sendEvent($z1GAD_Configs.emGADEventName.GAD_Player_Die);
    } else {
      e = $z1GAD_Configs.emGADHitState.HitHurt;
      this.sendEvent($z1GAD_Configs.emGADEventName.GAD_Show_Warn);
    }
    this.showHpTips(-t);
    this.refreshBar();
    return e;
  };
  _ctor.prototype.showHpTips = function (t) {
    this.sendEvent($z1GAD_Configs.emGADEventName.GAD_Show_Hit_Text, t, this.getWorldPos(cc.v2(0, this._edge.top)));
  };
  _ctor.prototype.getCardItem = function (t) {
    for (var e = 0; e < this._cards.length; e++) {
      if (this._cards[e].getCardCfg().id == t) {
        return this._cards[e];
      }
    }
    return null;
  };
  cc__decorate([ccp_property(cc.Prefab)], _ctor.prototype, "prefabCarItem", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndCardRoot", undefined);
  cc__decorate([ccp_property(cc.Sprite)], _ctor.prototype, "spPropName", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "lblHP", undefined);
  cc__decorate([ccp_property(cc.Sprite)], _ctor.prototype, "spBr", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndRoot", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1GAD_Base.default);
exports.default = def_GAD_Cards;