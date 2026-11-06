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
var $z1GAD_Base = require("GAD_Base");
var $z1GAD_Bubble = require("GAD_Bubble");
var $z1GAD_Enemy_Ani = require("GAD_Enemy_Ani");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_Enermy = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ske_die = null;
    e.ani = null;
    e.ndBubbleRoot = null;
    e.lblHP = null;
    e.ndCollider = null;
    e.prefabBubble = null;
    e.layer = null;
    e.enemyItem = null;
    e._bubbleCtrl = null;
    e._hp = 0;
    e._enemyID = 0;
    e.shouldReset = false;
    e._isAttack = false;
    e._isRolling = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    this.setRoleState($z1GAD_Configs.emGADRoleState.Move);
    this.ani.playMove();
  };
  _ctor.prototype.getHp = function () {
    return this._hp;
  };
  _ctor.prototype.init = function (t, e, n, i) {
    this.shouldReset = i;
    this.initTagID();
    this._roleType = $z1GAD_Configs.emGADRoleType.Enemy;
    this._moveSpeed = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.moveSpeed);
    this._maxSpeed = this._moveSpeed;
    this._originPos = this.node.position.clone();
    var a = null;
    if (e.includes(";")) {
      this._hp = Number(e.split(";")[0]);
      a = n;
    } else {
      this._hp = Number(e);
    }
    this.updateHp();
    if (t.indexOf(",") >= 0) {
      var o = t.split(",").map(function (t) {
        return Number(t);
      });
      this._enemyID = o[0];
    } else {
      this._enemyID = Number(t);
    }
    this._enermyCfg = $z1GAD_DataMgr.default.getInstance().getEnemyCfg(this._enemyID);
    this.ndCollider.setContentSize(this._enermyCfg.width, this._enermyCfg.height);
    if (a) {
      if (!this._bubbleCtrl) {
        var r = cc.instantiate(this.prefabBubble);
        r.parent = this.ndBubbleRoot;
        this._bubbleCtrl = r.getComponent($z1GAD_Bubble.default);
      }
      this._bubbleCtrl.init(a, 0);
    }
    this.initEnermy();
  };
  _ctor.prototype.getAtkPower = function () {
    return this._enermyCfg.atk;
  };
  _ctor.prototype.initEnermy = function () {
    var t = this;
    var e = this._enermyCfg.spineEnemy + "/" + this._enermyCfg.spineEnemy;
    this.enemyItem.node.scale = this._enermyCfg.size;
    this.loadResFromBundle($z1GAD_Configs.emGADBundles.imgs, "spine/" + e, sp.SkeletonData, function (e) {
      t.enemyItem.skeletonData = e;
      t.initEnemyLayer();
    });
  };
  _ctor.prototype.initEnemyLayer = function () {
    var t = this;
    if (1 == this._enermyCfg.itemNum) {
      this.enemyItem.node.active = true;
      this.enemyItem.setAnimation(0, "move", true);
      return void this.scheduleOnce(function () {
        t.lblHP.node.setPosition(0, t.node.height + t._enermyCfg.HpPosition + 15);
        if (t._bubbleCtrl) {
          t._bubbleCtrl.node.setPosition(0, t.node.height + t._enermyCfg.HpPosition + 55);
          t.lblHP.node.setPosition(0, t.node.height + t._enermyCfg.HpPosition + 25);
        }
      });
    }
    var e = 100;
    var n = this._enermyCfg.itemNum;
    this.enemyItem.node.active = false;
    var i = this._enermyCfg.width + 20;
    var a = this._enermyCfg.height + 20;
    var o = n % 2 ? -this._enermyCfg.width - 20 : -this._enermyCfg.width / 2 - 10;
    if (n % 2) {
      for (var r = 0; r <= 8; r++) {
        (l = cc.instantiate(this.enemyItem.node)).zIndex = e--;
        l.scale = this._enermyCfg.size;
        l.active = true;
        l.parent = this.layer;
        l.setPosition(new cc.Vec2(o + r % 3 * i, 0 + Math.floor(r / 3) * a));
        var s = l.getComponent(sp.Skeleton);
        3 != this._enermyCfg.id && 2 != this._enermyCfg.id && s.setSkin("hong");
        s.setAnimation(0, "move", true);
      }
      this.node.width = 3 * this._enermyCfg.width;
      this.node.height = 3 * this._enermyCfg.height;
    } else {
      for (r = 0; r <= 3; r++) {
        var l;
        (l = cc.instantiate(this.enemyItem.node)).zIndex = e--;
        l.scale = this._enermyCfg.size;
        l.active = true;
        l.parent = this.layer;
        l.setPosition(new cc.Vec2(o + r % 2 * i, 0 + Math.floor(r / 2) * a));
        s = l.getComponent(sp.Skeleton);
        3 != this._enermyCfg.id && 2 != this._enermyCfg.id && s.setSkin("hong");
        s.setAnimation(0, "move", true);
      }
      this.node.width = 2 * this._enermyCfg.width;
      this.node.height = 2 * this._enermyCfg.height;
    }
    this.scheduleOnce(function () {
      t.lblHP.node.setPosition(0, t.node.height + t._enermyCfg.HpPosition + 15);
      if (t._bubbleCtrl) {
        t._bubbleCtrl.node.setPosition(0, t.node.height + t._enermyCfg.HpPosition + 55);
        t.lblHP.node.setPosition(0, t.node.height + t._enermyCfg.HpPosition + 25);
      }
    });
  };
  _ctor.prototype.updateHp = function () {
    if (this.shouldReset) {
      var t = this.getDigitCount(this._hp);
      t > 4 && (this.lblHP.fontSize = 80 - 6 * (t - 4));
    }
    this.lblHP.string = "" + this._hp;
  };
  _ctor.prototype.getDigitCount = function (t) {
    if (0 === t) {
      return 1;
    } else {
      return Math.floor(Math.log10(Math.abs(t))) + 1;
    }
  };
  _ctor.prototype.removeFromScreen = function () {
    this.node.destroy();
  };
  _ctor.prototype.playAttack = function (t, e) {
    var n = this;
    this._isAttack || this.ani.playAttack(function () {
      e && e();
    }, function () {
      n._isAttack = false;
      n.ani.playMove();
    });
  };
  _ctor.prototype.onDie = function () {
    var t = this;
    this.setRoleState($z1GAD_Configs.emGADRoleState.Die);
    this.lblHP.node.active = false;
    this.ndBubbleRoot.active = false;
    this.ske_die.node.active = true;
    this.ndCollider.active = false;
    this.ske_die.setAnimation(0, Math.random() < .5 ? "animation" : "animation2", false);
    this.layer.removeAllChildren();
    this.ske_die.setCompleteListener(function () {
      t.node.destroy();
    });
    if (this._bubbleCtrl) {
      var e = this._bubbleCtrl.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
      this._hp <= 0 && this.sendEvent($z1GAD_Configs.emGADEventName.GAD_Bubble_Buf, this._bubbleCtrl.getCfg(), e, this._bubbleCtrl.getCardID());
    }
  };
  _ctor.prototype.bulletHited = function (t, e) {
    if (!this.isUseful || this.hasColliderTagID(t.getTagID())) {
      return $z1GAD_Configs.emGADHitState.None;
    } else {
      return this._hp -= e, this.updateHp(), $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1GAD_Configs.GAD_AudioId.enemyHit), this.addColliderTagID(t.getTagID()), this._hp <= 0 ? (this.onDie(), $z1GAD_Configs.emGADHitState.HitDie) : $z1GAD_Configs.emGADHitState.HitHurt;
    }
  };
  _ctor.prototype.playHpRoll = function () {
    if (!this._isRolling) {
      this._isRolling = true;
      this.scheduleLabelRoll();
      this.schedule(this.scheduleLabelRoll, .05);
    }
  };
  _ctor.prototype.scheduleLabelRoll = function () {
    var t = Number(this.lblHP.string);
    if (t != this._hp) {
      if (t > this._hp) {
        t = Math.max(0, t - 1);
      } else {
        t += 1, t = Math.min(t + 1, this._hp);
      }
      this.lblHP.string = "" + t;
      if (t == this._hp) {
        this.unschedule(this.scheduleLabelRoll), this._isRolling = false;
      }
    } else {
      this.unschedule(this.scheduleLabelRoll);
      this._isRolling = false;
    }
  };
  _ctor.prototype.getWorldColliderRectWithFixed = function (t, e) {
    var n = this.node.getAnchorPoint();
    var i = this.node.parent.convertToWorldSpaceAR(this.node.position);
    t = t || this._enermyCfg.width;
    e = e || this._enermyCfg.height;
    return cc.rect(i.x - n.x * t, i.y - n.y * e, t, e);
  };
  cc__decorate([ccp_property(sp.Skeleton)], _ctor.prototype, "ske_die", undefined);
  cc__decorate([ccp_property($z1GAD_Enemy_Ani.default)], _ctor.prototype, "ani", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndBubbleRoot", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "lblHP", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndCollider", undefined);
  cc__decorate([ccp_property(cc.Prefab)], _ctor.prototype, "prefabBubble", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "layer", undefined);
  cc__decorate([ccp_property(sp.Skeleton)], _ctor.prototype, "enemyItem", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1GAD_Base.default);
exports.default = def_GAD_Enermy;