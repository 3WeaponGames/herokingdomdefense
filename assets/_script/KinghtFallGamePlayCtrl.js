var GameToolsOverrides = require("GameToolsOverrides");
var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1AudioMgr = require("AudioMgr");
var $z1LogMgr = require("LogMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallAudioMgr = require("KinghtFallAudioMgr");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallItemHp = require("KinghtFallItemHp");
var $z1KinghtFallPlayGameAniCtrl = require("KinghtFallPlayGameAniCtrl");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallBulletPlay = require("KinghtFallBulletPlay");
var $z1KinghtFallGameCtrlData = require("KinghtFallGameCtrlData");
var $z1KinghtFallInterface = require("KinghtFallInterface");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
(function (t) {
  t[t.Alive = 0] = "Alive";
  t[t.Dead = 1] = "Dead";
  t[t.Reborn = 2] = "Reborn";
})(r || (r = {}));
var C;
var def_KinghtFallGamePlayCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ctrPlayAni = null;
    e.ctrHp = null;
    e.ctrArr = null;
    e.ndRange = null;
    e.ndAgg = null;
    e.rigidBody = null;
    e.baseHp = 100;
    e.hp = 100;
    e.hpMax = 100;
    e.hpRecoverSpeed = 10;
    e.attack = 10;
    e.attackRange = 100;
    e.attackSpeed = 10;
    e.moveSpeed = 10;
    e.state = r.Alive;
    e.time = {};
    e.critDam = 20;
    e.vec2_1 = new cc.Vec2();
    e.vec2_2 = new cc.Vec2();
    e.attNum = 1;
    e.crit = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    this.rigidBody = this.node.getComponent(cc.RigidBody);
    this.setLeft(1);
    this.ctrArr.node.active = false;
    this.ndRange.active = false;
    this._refreshRangeIndicator();
    this.ndAgg.active = false;
    this.critDam = Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.CriticalDamage));
  };
  _ctor.prototype._refreshRangeIndicator = function () {
    var range = this.ndRange;
    var settings = $z1KinghtFallConfig.KinghtFallParameter;
    // Draw a thin stroke inside the existing bounds, retaining the range scale.
    var sprite = range.getComponent(cc.Sprite);
    if (sprite) sprite.enabled = false;
    var graphics = range.getComponent(cc.Graphics) || range.addComponent(cc.Graphics);
    graphics.clear();
    graphics.lineWidth = settings.HeroRangeLineWidth;
    graphics.strokeColor = cc.color(255, 255, 255, settings.HeroRangeOpacity);
    graphics.circle(0, 0, (range.width - settings.HeroRangeLineWidth) / 2);
    graphics.stroke();
  };
  _ctor.prototype.initData = function () {
    GameToolsOverrides.cancel(this);
    var t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getEquipCfgList();
    for (var e = 0; e < t.length; e++) {
      var n = t[e];
      var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(n.id);
      var a = n.levelInfo[i - 1];
      switch (n.id) {
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Body:
          this.baseHp = a.Parameters;
          this.hp = a.Parameters;
          this.hpMax = a.Parameters;
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Head:
          this.hpRecoverSpeed = a.Parameters;
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Arrow:
          this.attack = a.Parameters;
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Bow:
          this.attackRange = a.Parameters;
          this.ndRange.scale = 2 * this.attackRange / this.ndRange.width;
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Gloves:
          this.attackSpeed = a.Parameters;
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.horse:
          this.moveSpeed = a.Parameters;
      }
    }
    this.ctrPlayAni.initView();
    this.ctrPlayAni.setAttackEvent(this.doAttack1.bind(this));
    this.ctrPlayAni.setAttackEnd(this.doAttackFinish.bind(this));
    this.time = {};
    this.time[C.hpRecover] = 0;
    this.time[C.RenSoundTime] = 0;
    this.time[C.Attack] = 0;
    this.time[C.RecoverCd] = 0;
    this.time[C.RebornTime] = Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.ReviveTime));
    $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.RevivalCoin] && (this.time[C.RebornTime] -= $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.RevivalCoin][0]);
    this.time[C.NoDieTime] = Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.InvincibleTime));
    this.ctrHp.setType($z1KinghtFallModle.KinghtFallGameArmy.Friend);
    this.ctrHp.setHp(this.hp, this.hpMax);
  };
  _ctor.prototype.onRestart = function (t) {
    GameToolsOverrides.cancel(this);
    undefined === t && (t = false);
    $z1AudioMgr.AudioMgr.getInstance().getAudioSource($z1KinghtFallConfig.KinghtFallParameter.BGMusic).volume = $z1AudioMgr.AudioMgr.getInstance().getMusicVolume();
    this.ctrPlayAni.onRestart();
    this.state = r.Alive;
    this.time[C.Reborn] = this.time[C.RebornTime];
    this.rigidBody.active = true;
    this.hp = this.hpMax;
    this.ctrHp.setHp(this.hp, this.hpMax);
    this.ndRange.active = false;
    t && this.ctrPlayAni.setBus(0);
    this.tagEnemy = null;
    this.delAllBuff();
  };
  _ctor.prototype.doMove = function (t, e) {
    if (this.state != r.Reborn) {
      this.setLeft(t.x);
      if (cc.v2(0, 0).equals(t)) {
        this.time[C.RenSoundTime] = 0;
        $z1KinghtFallAudioMgr.KinghtFallAudioMgr.getInstance().stopEffectName($z1KinghtFallConfig.KinghtFallParameter.RunMusic);
        return void this.ctrPlayAni.setIdle();
      }
      this.node.getPosition(this.vec2_1);
      cc.Vec2.normalize(this.vec2_2, t);
      cc.Vec2.scaleAndAdd(this.vec2_1, this.vec2_1, this.vec2_2, this.getSpeed() * e);
      this.node.setPosition(this.vec2_1);
      this.ctrPlayAni.setMove();
      if (!(0 != this.time[C.RenSoundTime] || this.isDead())) {
        this.time[C.RenSoundTime] = 1;
        $z1AudioMgr.AudioMgr.getInstance().playMusic($z1KinghtFallConfig.KinghtFallAudioId.run, $z1KinghtFallConfig.KinghtFallParameter.RunMusic);
      }
    }
  };
  _ctor.prototype.setLeft = function (t) {
    this.ctrPlayAni.setMaLeft(t);
    this.tagEnemy && (this.tagEnemy.node && !this.tagEnemy.isDead() || (this.tagEnemy = null));
    if (this.tagEnemy) {
      this.tagEnemy.node.getPosition(this.vec2_2);
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      t = this.vec2_2.x;
    }
    this.ctrPlayAni.setBodyLeft(t);
  };
  _ctor.prototype.isLeft = function () {
    return this.ctrPlayAni.node.scaleX < 0;
  };
  _ctor.prototype.onUpdata = function (t) {
    for (var e = 0; e < this.debuffInfo.length; e++) {
      var n = this.debuffInfo[e];
      if (-1 != n.time) {
        n.time += t;
        if (n.time >= n.timeMax) {
          this.delBuffIdx(e), e--;
        }
      }
    }
    switch (this.state) {
      case r.Alive:
        if (-1 != this.time[C.Attack]) {
          this.time[C.Attack] += t * this.getAttSpeed();
          this.time[C.Attack] >= 1 && this.onFindEnemy();
        }
        this.time[C.NoDie] -= t;
        this.time[C.RecoverCd] -= t;
        if (-1 != this.time[C.RecoverCd] && this.time[C.RecoverCd] <= 0) {
          this.time[C.hpRecover] += t;
          if (this.time[C.hpRecover] >= 1) {
            this.hp += this.getHpRecoverSpeed(), this.hp > this.hpMax && (this.hp = this.hpMax), this.ctrHp.setHp(this.hp, this.hpMax), this.time[C.hpRecover]--;
          }
        }
        break;
      case r.Dead:
        this.time[C.Reborn] += t;
        this.time[C.Reborn] >= this.time[C.RebornTime] && this.onReborn();
        this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.ReviveShow, this.time[C.RebornTime] - this.time[C.Reborn]);
    }
  };
  _ctor.prototype.endRoundGame = function () {
    GameToolsOverrides.cancel(this);
    if (this.isDead()) {
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.ReviveShow, 0);
      this.onReborn();
    } else {
      this.hp = this.hpMax;
      this.ctrHp.setHp(this.hp, this.hpMax);
    }
    this.delAllBuff();
  };
  _ctor.prototype.getSpeed = function () {
    var t = 1;
    return this.moveSpeed * ((t += this.time[C.MoveSpeed] || 0) + ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Speed] || 0));
  };
  _ctor.prototype.setPause = function (t) {
    this.ctrPlayAni.setPause(t);
  };
  _ctor.prototype.getWpos = function () {
    return this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
  };
  _ctor.prototype.getAttWpos = function () {
    return this.node.convertToWorldSpaceAR(this.ctrArr.node.getPosition());
  };
  _ctor.prototype.isDead = function () {
    return this.state != r.Alive;
  };
  _ctor.prototype.onAttacked = function (t) {
    if (!(this.time[C.NoDie] > 0)) {
      $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.player_hurt);
      this.time[C.NoDie] = this.time[C.NoDieTime];
      if ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.GuardianShield] && Math.random() < $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.GuardianShield][0]) {
        $z1LogMgr.LogMgr.getInstance().info("***守护之盾");
        this.time[C.NoDie] += 3;
      }
      this.hp -= t;
      if (this.hp <= 0) {
        this.hp = 0;
        this.onDead();
      }
      this.ctrHp.setHp(this.hp, this.hpMax);
      return t;
    }
  };
  _ctor.prototype.addHpPro = function (t) {
    if (!this.isDead()) {
      this.hp += t * this.hpMax;
      this.hp > this.hpMax && (this.hp = this.hpMax);
      this.ctrHp.setHp(this.hp, this.hpMax);
    }
  };
  _ctor.prototype.onDead = function () {
    GameToolsOverrides.cancel(this);
    var t = this;
    this.tagEnemy = null;
    $z1KinghtFallAudioMgr.KinghtFallAudioMgr.getInstance().stopEffectName($z1KinghtFallConfig.KinghtFallParameter.RunMusic);
    $z1AudioMgr.AudioMgr.getInstance().getAudioSource($z1KinghtFallConfig.KinghtFallParameter.BGMusic).volume = .5 * $z1AudioMgr.AudioMgr.getInstance().getMusicVolume();
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.death);
    this.state = r.Reborn;
    $z1KinghtFallUIGame.default.instance.ctrGame.gameTag[$z1KinghtFallEnum.KinghtFallEnumLevelChalType.NoDie] = 1;
    this.ctrPlayAni.setDie(function () {
      t.state = r.Dead;
      t.time[C.Reborn] = 0;
      t.sendEvent($z1KinghtFallConfig.KinghtFallEventName.ReviveShow, t.time[C.RebornTime] - t.time[C.Reborn]);
    });
    this.delAllBuff();
  };
  _ctor.prototype.onReborn = function () {
    var t = this;
    this.tagEnemy = null;
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.rebirth);
    this.state = r.Reborn;
    this.rigidBody.active = true;
    this.ctrPlayAni.setRevive(function () {
      t.state = r.Alive;
      t.time[C.hpRecover] = 0;
      t.time[C.Attack] = 0;
      t.hp = t.hpMax;
      t.ctrHp.setHp(t.hp, t.hpMax);
    });
    var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff13);
    if (e && !this.time[C.RebornBuff1]) {
      this.time[C.RebornBuff1] = e.Pamer[0];
      this.time[C.RebornBuff2] = e.Pamer[1];
    }
  };
  _ctor.prototype.onFindEnemy = function () {
    this.node.getPosition(this.vec2_1);
    var t = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
    var e = [];
    for (var n = 0; n < t.length; n++) {
      var i = t[n];
      if (!i.isDead()) {
        i.node.getPosition(this.vec2_2);
        cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
        var a = this.vec2_2.mag();
        a <= this.attackRange && e.push({
          tag: i,
          len: a
        });
      }
    }
    if (0 != e.length) {
      e.sort(function (t, e) {
        return t.len - e.len;
      });
      this.tagEnemy = e[0].tag;
      this.time[C.Attack] = -1;
      this.doAttackStart();
      GameToolsOverrides.attack(this, "hero", this.doAttack);
    }
  };
  _ctor.prototype.doAttackStart = function () {
    this.ctrPlayAni.setAttack();
    this.time[C.RecoverCd] = 1;
  };
  _ctor.prototype.doAttack = function () {
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.palyer_attack);
    this.node.getPosition(this.vec2_1);
    var t = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
    var e = [];
    for (var n = 0; n < t.length; n++) {
      var i = t[n];
      if (!i.isDead()) {
        i.node.getPosition(this.vec2_2);
        cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
        var a = this.vec2_2.mag();
        a <= this.attackRange && e.push({
          tag: i,
          len: a
        });
      }
    }
    if (0 != e.length) {
      e.sort(function (t, e) {
        return t.len - e.len;
      });
      for (var o = 0; o < this.attNum; o++) {
        var r = e[o];
        r && $z1KinghtFallUIGame.default.instance.ctrGame.onPlayAttack(r.tag);
      }
      this.time[C.Attack] = 0;
    }
  };
  _ctor.prototype.doAttack1 = function () {};
  _ctor.prototype.doAttackFinish = function () {
    this.tagEnemy = null;
  };
  _ctor.prototype.getAttack = function (t) {
    var e = this.attack;
    var n = 1;
    var i = this.getBuffList($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageCut);
    for (var a = 0; a < i.length; a++) {
      n -= i[a].data.subNum;
    }
    this.time[C.RebornBuff1] && (n += this.time[C.RebornBuff1]);
    this.time[C.AttackBuff1] && (n += this.time[C.AttackBuff1]);
    this.time[C.AttackBuff2] && (n -= this.time[C.AttackBuff2]);
    if ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.CloseCut]) {
      var o = this.node.getPosition();
      var r = t.node.getPosition();
      cc.Vec2.distance(o, r) <= 100 && (n += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.CloseCut][0]);
    }
    n += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.addTime[$z1KinghtFallGameCtrlData.KinghtFallTimeType.PlayerDamage] || 0;
    (n += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Attack] || 0) < 0 && (n = 0);
    return e * n;
  };
  _ctor.prototype.getAttSpeed = function () {
    var t = this.attackSpeed;
    var e = 1;
    var n = this.getBuffList($z1KinghtFallInterface.KinghtFallEnemyBuffType.AttackSpeed);
    for (var i = 0; i < n.length; i++) {
      e += n[i].data.addSpeed;
    }
    this.time[C.RebornBuff2] && (e += this.time[C.RebornBuff2]);
    this.time[C.AttackSpeed2] && (e += this.time[C.AttackSpeed2]);
    if (this.hp < .5 * this.hpMax) {
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff18);
      a && (e += a.Pamer[0]);
    }
    return t * ((e += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.addTime[$z1KinghtFallGameCtrlData.KinghtFallTimeType.PlayerAttackSpeed] || 0) + ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.AttackSpeed] || 0));
  };
  _ctor.prototype.getHpRecoverSpeed = function () {
    var t = 1;
    return this.hpRecoverSpeed * (t + (this.time[C.hpRecoverSpeed] || 0));
  };
  _ctor.prototype.initBuffData = function () {
    var t = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff01);
    this.attNum = t ? t.Pamer[0] : 1;
    this.crit = 0;
    var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff14);
    e && (this.crit += e.Pamer[0]);
    var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff37);
    n && (this.crit += n.Pamer[0]);
    this.time[C.MoveSpeed] = 0;
    var i = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff21);
    i && (this.time[C.MoveSpeed] += i.Pamer[0]);
    var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff35);
    a && (this.time[C.MoveSpeed] += a.Pamer[0]);
    this.time[C.hpRecoverSpeed] = 0;
    var o = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff22);
    o && (this.time[C.hpRecoverSpeed] += o.Pamer[0]);
    var r = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff36);
    r && (this.time[C.hpRecoverSpeed] += r.Pamer[0]);
    var s = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff40);
    if (s) {
      this.time[C.RecoverCd] = -1;
      this.hpMax = (1 + s.Pamer[0]) * this.baseHp;
      this.hp = this.hpMax;
      this.ctrHp.setHp(this.hp, this.hpMax);
    }
    this.time[C.AttackBuff1] = 0;
    var l = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff41);
    if (l) {
      this.time[C.AttackBuff1] = l.Pamer[0];
      this.attackRange *= 1 - l.Pamer[1];
      this.ndRange.scale = 2 * this.attackRange / this.ndRange.width;
    }
    var c = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff42);
    if (c) {
      this.time[C.AttackSpeed2] = c.Pamer[0];
      this.time[C.AttackBuff2] = c.Pamer[1];
    }
  };
  cc__decorate([ccp_property({
    type: $z1KinghtFallPlayGameAniCtrl.default,
    tooltip: "玩家动画"
  })], _ctor.prototype, "ctrPlayAni", undefined);
  cc__decorate([ccp_property({
    type: $z1KinghtFallItemHp.default,
    tooltip: "血条"
  })], _ctor.prototype, "ctrHp", undefined);
  cc__decorate([ccp_property({
    type: $z1KinghtFallBulletPlay.default,
    tooltip: "弓箭位置"
  })], _ctor.prototype, "ctrArr", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: ""
  })], _ctor.prototype, "ndRange", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: ""
  })], _ctor.prototype, "ndAgg", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallInterface.KinghtFallInterface);
exports.default = def_KinghtFallGamePlayCtrl;
(function (t) {
  t.hpRecover = "hpRecover";
  t.hpRecoverSpeed = "hpRecoverSpeed";
  t.Attack = "Attack";
  t.AttackBuff1 = "AttackBuff1";
  t.AttackBuff2 = "AttackBuff2";
  t.Reborn = "Reborn";
  t.RebornTime = "RebornTime";
  t.RebornBuff1 = "RebornBuff1";
  t.RebornBuff2 = "RebornBuff2";
  t.AttackSpeed1 = "AttackSpeed1";
  t.AttackSpeed2 = "AttackSpeed2";
  t.NoDie = "NoDie";
  t.NoDieTime = "NoDieTime";
  t.RecoverCd = "RecoverCd";
  t.MoveSpeed = "MoveSpeed";
  t.RenSoundTime = "RenSoundTime";
})(C || (C = {}));
