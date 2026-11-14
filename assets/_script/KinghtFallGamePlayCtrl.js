var BattleSounds = require("BattleSounds");
var Navigation = require("KinghtFallNavigation");
var GameToolsOverrides = require("GameToolsOverrides");
var RelicCombat = require("RelicCombat");
var RelicRuntime = require("RelicRuntime");
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
    e.navigationTeam = "friendly";
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
  _ctor.prototype.onLoad = function () {
    this.rigidBody = this.node.getComponent(cc.RigidBody);
    Navigation.enableTerrainContacts(this);
  };
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
    this._relicHero = true;
    this._relicMoving = false;
    this.node._combatActor = this;
    this.node._combatGeneration = (this.node._combatGeneration || 0) + 1;
    this._regenerationDisabled = false;
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
    require("HeroWeaponCombat").configure(this, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData(), $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data);
    this.hpMax = this.baseHp;
    this.hp = this.hpMax;
    this._baseAttackRange = this.attackRange;
    this.attackRange *= 1 + RelicRuntime.value(RelicRuntime.current(), 120044);
    if (cc.resources) require("CharacterAppearance").reset(this);
    this.ctrPlayAni.initView();
    if (cc.resources) require("CharacterAppearance").bind(this, "hero");
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
    Navigation.reset(this);
    this._relicMoving = false;
    this.node._combatActor = this;
    this.node._combatGeneration = (this.node._combatGeneration || 0) + 1;
    this.time[C.Attack] = 0;
    undefined === t && (t = false);
    if (t) {
      this.time[C.RebornBuff1] = this.time[C.RebornBuff2] = 0;
      this.time[C.AttackSpeed1] = 0;
      this.time[C.hpRecover] = 0;
      this.time[C.RecoverCd] = 0;
      this.initBuffData();
    }
    $z1AudioMgr.AudioMgr.getInstance().setChannelGain($z1KinghtFallConfig.KinghtFallParameter.BGMusic, 1);
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
    this._relicMoving = !this.isDead() && !!(t.x || t.y);
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
      Navigation.moveManual(this, $z1KinghtFallUIGame.default.instance.ctrGame, this.vec2_1);
      this.ctrPlayAni.setMove();
      if (!(0 != this.time[C.RenSoundTime] || this.isDead())) {
        this.time[C.RenSoundTime] = 1;
        // BattleSounds follows actual movement and selects the active biome.
        if (!BattleSounds.tick) $z1AudioMgr.AudioMgr.getInstance().playMusic($z1KinghtFallConfig.KinghtFallAudioId.run, $z1KinghtFallConfig.KinghtFallParameter.RunMusic);
      }
    }
  };
  _ctor.prototype.onPreSolve = function (contact, self, other) {
    Navigation.allowBlockedExit(this, contact, other);
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
        if (!this._regenerationDisabled) this.time[C.RecoverCd] -= t;
        if (!this._regenerationDisabled && this.time[C.RecoverCd] <= 0) {
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
    this.time[C.Attack] = 0;
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
    return this.moveSpeed * ((t += this.time[C.MoveSpeed] || 0) + ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Speed] || 0) + RelicRuntime.value(RelicRuntime.current(), 120039));
  };
  _ctor.prototype.setPause = function (t) {
    this.ctrPlayAni.setPause(t);
  };
  _ctor.prototype.getWpos = function () {
    return this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
  };
  _ctor.prototype.getAttWpos = function () {
    var origin = require("HeroMakerRider").projectileOrigin(this.ctrPlayAni);
    if (origin) return origin;
    return this.node.convertToWorldSpaceAR(this.ctrArr.node.getPosition());
  };
  _ctor.prototype.isDead = function () {
    return this.state != r.Alive;
  };
  _ctor.prototype.onAttacked = function (t, attacker, ranged) {
    if (t > 0 && this.time[C.NoDie] > 0 && BattleSounds.effect) BattleSounds.effect("impact-shield", this);
    if (!(this.time[C.NoDie] > 0)) {
      var awareness = require("AllyAwareness"), notice = awareness.capture(this, attacker, $z1KinghtFallUIGame.default.instance.ctrGame);
      t = RelicCombat.heroIncoming(this, t, attacker, ranged);
      var received = Math.max(0, Math.min(this.hp, t));
      if (BattleSounds.hit) BattleSounds.hit(this, attacker, received);
      $z1KinghtFallAudioMgr.KinghtFallAudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.player_hurt, this);
      this.time[C.NoDie] = this.time[C.NoDieTime];
      var shieldChance = RelicRuntime.value(RelicRuntime.current(), 120011);
      if (shieldChance > 0 && Math.random() < shieldChance) {
        $z1LogMgr.LogMgr.getInstance().info("***守护之盾");
        this.time[C.NoDie] += 3;
        if (BattleSounds.effect) BattleSounds.effect("shield-activate", this);
      }
      this.hp -= t;
      awareness.notify(notice, received);
      if (this.hp <= 0) {
        this.hp = 0;
        this.onDead();
      }
      this.ctrHp.setHp(this.hp, this.hpMax);
      RelicCombat.afterHeroHit(this, received, attacker);
      return t;
    }
  };
  _ctor.prototype.addHpPro = function (t) {
    if (!this.isDead()) {
      var soundHp = this.hp;
      this.hp += t * this.hpMax;
      this.hp > this.hpMax && (this.hp = this.hpMax);
      if (this.hp > soundHp && BattleSounds.effect) BattleSounds.effect("healing-receive", this);
      this.ctrHp.setHp(this.hp, this.hpMax);
    }
  };
  _ctor.prototype.onDead = function () {
    GameToolsOverrides.cancel(this);
    this._relicMoving = false;
    var generation = this.node._combatGeneration = (this.node._combatGeneration || 0) + 1;
    var t = this;
    this.tagEnemy = null;
    $z1KinghtFallAudioMgr.KinghtFallAudioMgr.getInstance().stopEffectName($z1KinghtFallConfig.KinghtFallParameter.RunMusic);
    $z1AudioMgr.AudioMgr.getInstance().setChannelGain($z1KinghtFallConfig.KinghtFallParameter.BGMusic, .5);
    this.state = r.Reborn;
    $z1KinghtFallUIGame.default.instance.ctrGame.gameTag[$z1KinghtFallEnum.KinghtFallEnumLevelChalType.NoDie] = 1;
    this.ctrPlayAni.setDie(function () {
      if (!cc.isValid(t, true) || t.node._combatGeneration !== generation) return;
      t.state = r.Dead;
      t.time[C.Reborn] = 0;
      t.sendEvent($z1KinghtFallConfig.KinghtFallEventName.ReviveShow, t.time[C.RebornTime] - t.time[C.Reborn]);
    });
    this.delAllBuff();
  };
  _ctor.prototype.onReborn = function () {
    var generation = this.node._combatGeneration = (this.node._combatGeneration || 0) + 1;
    var t = this;
    this.tagEnemy = null;
    $z1KinghtFallAudioMgr.KinghtFallAudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.rebirth, this);
    this.state = r.Reborn;
    this.rigidBody.active = true;
    this.ctrPlayAni.setRevive(function () {
      if (!cc.isValid(t, true) || t.node._combatGeneration !== generation) return;
      t.state = r.Alive;
      t.time[C.hpRecover] = 0;
      t.time[C.Attack] = 0;
      t.hp = t.hpMax;
      t.ctrHp.setHp(t.hp, t.hpMax);
      var audio = $z1AudioMgr.AudioMgr.getInstance();
      audio.setChannelGain($z1KinghtFallConfig.KinghtFallParameter.BGMusic, 1);
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
    // The damage event completes the windup even if its target has left range.
    this.time[C.Attack] = 0;
    if (BattleSounds.attack) BattleSounds.attack(this, "hero");
    else $z1KinghtFallAudioMgr.KinghtFallAudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.palyer_attack, this);
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
      var release = RelicCombat.heroAttack(this, e[0].tag, this.getAttack(e[0].tag));
      for (var o = 0; o < this.attNum; o++) {
        var r = e[o];
        r && $z1KinghtFallUIGame.default.instance.ctrGame.onPlayAttack(r.tag, o === 0 ? release : undefined);
      }
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
    var closeDamage = RelicRuntime.value(RelicRuntime.current(), 120018);
    if (closeDamage > 0) {
      var o = this.node.getPosition();
      var r = t.node.getPosition();
      cc.Vec2.distance(o, r) <= 100 && (n += closeDamage);
    }
    n += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.addTime[$z1KinghtFallGameCtrlData.KinghtFallTimeType.PlayerDamage] || 0;
    (n += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Attack] || 0) < 0 && (n = 0);
    return e * n;
  };
  _ctor.prototype.getCriticalDamage = function () {
    return this.critDam * (1 + (this._heroSecondary && this._heroSecondary.criticalDamage || 0));
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
    e += RelicCombat.heroHaste(this);
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
    if (this._baseAttackRange === undefined) this._baseAttackRange = this.attackRange;
    this.attackRange = this._baseAttackRange * (1 + RelicRuntime.value(RelicRuntime.current(), 120044));
    var previousHpMax = this.hpMax;
    this.hpMax = this.baseHp;
    this._regenerationDisabled = false;
    var t = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff01);
    this.attNum = t ? t.Pamer[0] : 1;
    this.crit = this._heroSecondary && this._heroSecondary.criticalChance || 0;
    var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff14);
    e && (this.crit += e.Pamer[0]);
    var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff37);
    n && (this.crit += n.Pamer[0]);
    this.crit += RelicRuntime.value(RelicRuntime.current(), 120031);
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
      this._regenerationDisabled = true;
      this.hpMax = (1 + s.Pamer[0]) * this.baseHp;
    }
    // Recomputing an owned perk must not repeatedly heal existing damage.
    this.hp = Math.max(0, Math.min(this.hpMax, this.hp + this.hpMax - previousHpMax));
    this.ctrHp.setHp(this.hp, this.hpMax);
    this.time[C.AttackBuff1] = 0;
    var l = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff41);
    if (l) {
      this.time[C.AttackBuff1] = l.Pamer[0];
      this.attackRange *= 1 - l.Pamer[1];
    }
    this.ndRange.scale = 2 * this.attackRange / this.ndRange.width;
    this.time[C.AttackSpeed2] = 0;
    this.time[C.AttackBuff2] = 0;
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
