var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallBuildBase = require("KinghtFallBuildBase");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallBuildMill = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndAddCoin = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.hide = function () {
    if (this._millFields) this._millFields.stop();
    t.prototype.hide.call(this);
    this.ndAddCoin && (this.ndAddCoin.active = false);
  };
  _ctor.prototype.startRoundGame = function () {
    t.prototype.startRoundGame.call(this);
    if (!this._millFields || !this._millFields.fields.length) this.applyFields();
    if (this._millFields) this._millFields.fighting = true;
    this.ndAddCoin && (this.ndAddCoin.active = false);
  };
  _ctor.prototype.setLevel = function (e) {
    var previous = this._millFields && this._millFields.fighting && this.index === e ? this._millFields.fields.map(function (field) { return {slot:field.slot.data.name,hp:field.hp}; }) : null;
    t.prototype.setLevel.call(this, e);
    this.applyFields();
    if (previous) this.restoreFieldHealth(previous);
    if (this._millRepairPending) { this.playFieldRepair(); this._millRepairPending = false; }
    if (this.buildInfo.cfg) {
      if (!this.ndAddCoin) {
        this.ndAddCoin = cc.instantiate($z1KinghtFallUIGame.default.instance.ctrUI.ndCoin), this.ndAddCoin.setParent(this.ndHp), this.ndAddCoin.setPosition(0, 20);
      }
      this.ndAddCoin.active = true;
      this.ndAddCoin.getComponentInChildren(cc.Label).string = "+" + this.getGetCoin();
    } else {
      this.ndAddCoin && (this.ndAddCoin.active = false);
    }
  };
  _ctor.prototype.onDead = function () {
    if (this.isDestroyed) return;
    t.prototype.onDead.call(this);
    if (this._millFields) this._millFields.destroyAll();
    $z1KinghtFallUIGame.default.instance.initView();
    $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1KinghtFallConfig.KinghtFallUIID.UIGame, $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.Game02), this.T(this.buildCfg.name)));
  };
  _ctor.prototype.getGetCoin = function () {
    if (!this.buildInfo || !this.buildInfo.cfg) {
      return 0;
    }
    if (this.buildInfo.cfg.MillDefense) return this._millFields ? this._millFields.income() : 0;
    var t = this.buildInfo.cfg.Data[0];
    var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff26);
    e && (t += e.Pamer[0]);
    return t;
  };
  _ctor.prototype.initBuffData = function () {
    t.prototype.initBuffData.call(this);
    this.ndAddCoin && (this.ndAddCoin.getComponentInChildren(cc.Label).string = "+" + this.getGetCoin());
  };
  _ctor.prototype.applyFields = function () {
    var game = $z1KinghtFallUIGame.default.instance.ctrGame;
    if (!this._millFields) this._millFields = new (require("MillFieldDefense").Runtime)(this, game);
    this._millFields.apply();
  };
  _ctor.prototype.doUpgreadAni = function () {
    t.prototype.doUpgreadAni.call(this); this.applyFields();
  };
  _ctor.prototype.getFieldTargets = function () {
    return this._millFields ? this._millFields.fields : [];
  };
  _ctor.prototype.onUpdate = function (dt) {
    t.prototype.onUpdate.call(this, dt);
    // The base stops combat updates for a dead mill; its crop destruction
    // animation and short-lived effects must still finish.
    if (!this.getIsWork() && this._millFields) this._millFields.tick(dt);
  };
  _ctor.prototype.onFieldHealthChanged = function () {
    if (this.ndAddCoin) this.ndAddCoin.getComponentInChildren(cc.Label).string = "+" + this.getGetCoin();
    var ui = $z1KinghtFallUIGame.default.instance;
    if (ui && ui.initView) ui.initView();
  };
  _ctor.prototype.restoreFieldHealth = function (entries) {
    if (!this._millFields || !Array.isArray(entries)) return;
    this._millFields.fields.forEach(function (field) {
      var entry = entries.find(function (value) { return value && value.slot === field.slot.data.name; });
      if (entry && typeof entry.hp === "number" && isFinite(entry.hp)) field.hp = Math.max(0, Math.min(field.hpMax, entry.hp));
    });
    this._millFields.sync();
  };
  _ctor.prototype.playFieldRepair = function () {
    if (this.ndAniDown && this.ndAniDown.addAnimation) {
      this.ndAniDown.setToSetupPose();
      this.ndAniDown.setAnimation(0, "create", false);
      this.ndAniDown.addAnimation(0, "idle", true);
    }
  };
  _ctor.prototype.doTime = function (dt) {
    if (this._millFields) this._millFields.tick(dt);
  };
  _ctor.prototype.endRoundGame = function () {
    this._millRepairPending = !!(this._millFields && this._millFields.fields.some(function (field) { return field.hp < field.hpMax; }));
    if (this._millFields) this._millFields.stop();
    t.prototype.endRoundGame.call(this); this.applyFields();
    if (this._millRepairPending) this.playFieldRepair();
  };
  _ctor.prototype.reset = function (fresh) {
    if (this._millFields) this._millFields.stop();
    t.prototype.reset.call(this, fresh); this.applyFields();
  };
  _ctor.prototype.getSave = function () {
    var save = t.prototype.getSave.call(this);
    if (this._millFields && this._millFields.fighting) save.millFields = this._millFields.fields.map(function (field) { return {slot:field.slot.data.name,hp:field.hp}; });
    return save;
  };
  _ctor.prototype.setSave = function (save) {
    t.prototype.setSave.call(this, save);
    if (save) this.restoreFieldHealth(save.millFields);
  };
  _ctor.prototype.onDestroy = function () {
    if (this._millFields) { this._millFields.destroy(); this._millFields = null; }
    if (t.prototype.onDestroy) t.prototype.onDestroy.call(this);
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBuildBase.default);
exports.default = def_KinghtFallBuildMill;