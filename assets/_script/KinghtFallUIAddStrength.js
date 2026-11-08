var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1Utils = require("Utils");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIAddStrength = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.labTitle1 = null;
    e.ndLeft = null;
    e.ndRight = null;
    e.labEnergyRule = null;
    e.labEnergyNext = null;
    e.labEnergyOverflow = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this.call = t;
  };
  _ctor.prototype.start = function () {
    var t = this;
    var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById($z1KinghtFallEnum.KinghtFallEnumGoodsCfg.stamina);
    this.labTitle1.string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.CommerName01), this.T(e.name));
    var n = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.StaminaSupply);
    this.goldNum = n.split(",").map(Number);
    var i;
    var a = parseInt($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.StaminaBuy));
    this.ndLeft.getChildByName("LabNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.goldNum[0]);
    (i = this.ndLeft.getChildByName("ndBtn")).on(cc.Node.EventType.TOUCH_END, function () {
      if (t.isclose) return;
      var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
      if (player.purchase([{ id: $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Diamond, num: a }], function () { player.getUserData().addPowerNum(t.goldNum[0]); })) t.onBtnBuy(0);
    }, this);
    i.getChildByName("Layout").getChildByName("LabNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(a);
    this.ndRight.getChildByName("LabNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.goldNum[1]);
    (i = this.ndRight.getChildByName("ndBtn")).on(cc.Node.EventType.TOUCH_END, function () {
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.power);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_power_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        t.onBtnBuy(t.goldNum[1]);
      }, null, "home.energy.refill");
    }, this);
    this.node.getChildByName("bg").on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
    this.initEnergyInfo();
    this.initEnergyItems();
  };
  _ctor.prototype.initEnergyItems = function () {
    if (this._energyItemRow) return;
    var owner = this, root = this.node.getChildByName("root"); this._energyItemGeneration = 0;
    if (!root) return;
    this._energyItems = require("EnergyItems").create($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance());
    var row = this._energyItemRow = new cc.Node("EnergyItems"); row.parent = root; row.setPosition(0, -250); row.setContentSize(668, 156);
    var graphics = row.addComponent(cc.Graphics); graphics.fillColor = cc.color("#fff5dc"); graphics.strokeColor = cc.color("#242632"); graphics.lineWidth = 3;
    graphics.roundRect(-334, -78, 668, 156, 18); graphics.fill(); graphics.stroke();
    function label(name, size, display) {
      var node = new cc.Node(name); node.parent = row; var result = node.addComponent(cc.Label);
      result.fontSize = size; result.lineHeight = Math.ceil(size * 1.2); result.fontFamily = "Arial"; result.useSystemFont = true;
      result._localizedFontRole = display ? "display" : "body"; result.overflow = cc.Label.Overflow.SHRINK; result.enableWrapText = false;
      result.horizontalAlign = cc.Label.HorizontalAlign.CENTER; result.verticalAlign = cc.Label.VerticalAlign.CENTER;
      node.color = cc.color(display ? "#ffffff" : "#554632");
      if (display) { var outline = node.addComponent(cc.LabelOutline); outline.color = cc.Color.BLACK; outline.width = 2; }
      return result;
    }
    var title = label("Title", 36, true); title.node.setPosition(-70, 35); title.node.setContentSize(260, 52);
    var language = require("LanguageMgr").LanguageMgr.getInstance(); language.bindLabel(title, "ui.energy.items.title");
    this._energyItemOwned = label("Owned", 29, false); this._energyItemOwned.node.setPosition(-70, -17); this._energyItemOwned.node.setContentSize(260, 44);
    this._energyItemStatus = label("Status", 21, false); this._energyItemStatus.node.setPosition(0, -59); this._energyItemStatus.node.setContentSize(628, 25); this._energyItemStatus.node.active = false;
    var icon = new cc.Node("ItemIcon"); icon.parent = row; icon.setPosition(-266, 0); icon.setContentSize(82, 100);
    var sprite = icon.addComponent(cc.Sprite); sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    var item = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(2033), iconPath = item && item.icon;
    var iconBundle = "resources";
    if (!iconPath) iconPath = "icons/GUI-Pro/Icons/Icon_Energy_Yellow";
    else if (iconPath.indexOf("@icon/") === 0) iconPath = iconPath.slice(6);
    else iconBundle = $z1KinghtFallConfig.KinghtFallBundelName.IconGood;
    this.loadSpriteFrame(iconBundle, iconPath, function (frame) { if (frame && !owner.isclose && cc.isValid(icon, true)) sprite.spriteFrame = frame; });
    var button = this._energyItemButton = new cc.Node("UseOne"); button.parent = row; button.setPosition(207, 0); button.setContentSize(220, 78);
    button.addComponent(cc.Button).transition = cc.Button.Transition.SCALE;
    this._energyItemCaption = label("UseCaption", 30, true); this._energyItemCaption.node.parent = button; this._energyItemCaption.node.setPosition(0, 0); this._energyItemCaption.node.setContentSize(204, 66);
    language.bindLabel(this._energyItemCaption, "ui.energy.items.use", [20]); this.updateEnergyItems();
  };
  _ctor.prototype.updateEnergyItems = function () {
    if (!this._energyItems || this.isclose || !this._energyItemButton) return;
    var view = this._energyItems.getView(), owner = this, signature = JSON.stringify([view.count, view.available, view.token]);
    if (signature === this._energyItemSignature) return;
    this._energyItemSignature = signature;
    require("LanguageMgr").LanguageMgr.getInstance().bindLabel(this._energyItemOwned, "ui.energy.items.owned", [view.count]);
    var button = this._energyItemButton, enabled = view.available && view.count > 0;
    button.getComponent(cc.Button).interactable = !!enabled;
    var graphics = button.getComponent(cc.Graphics) || button.addComponent(cc.Graphics); graphics.clear(); graphics.fillColor = cc.color(enabled ? "#12c4ef" : "#7e8899"); graphics.strokeColor = cc.color("#242632"); graphics.lineWidth = 3;
    graphics.roundRect(-110, -39, 220, 78, 14); graphics.fill(); graphics.stroke();
    if (this._energyItemHandler) button.off(cc.Node.EventType.TOUCH_END, this._energyItemHandler, this);
    var token = view.token, generation = this._energyItemGeneration;
    this._energyItemHandler = function (event) {
      if (event) event.stopPropagation();
      if (!enabled || owner.isclose || generation !== owner._energyItemGeneration || owner._usingEnergyItem || !owner.node.activeInHierarchy) return;
      if (event && event.getLocation && event.getStartLocation) { var a = event.getLocation(), b = event.getStartLocation(); if (Math.hypot(a.x - b.x, a.y - b.y) > 14) return; }
      owner._usingEnergyItem = true;
      try {
        var result = owner._energyItems.useOne(token);
        if (result && result.ok) owner.onBtnBuy(0); // The transaction already granted the full 20 Energy.
        else {
          owner._energyItemSignature = null; owner.updateEnergyItems();
          owner._energyItemStatus.node.active = true;
          require("LanguageMgr").LanguageMgr.getInstance().bindLabel(owner._energyItemStatus, "ui.energy.items.retry");
        }
      } finally { owner._usingEnergyItem = false; }
    };
    button.on(cc.Node.EventType.TOUCH_END, this._energyItemHandler, this);
  };
  _ctor.prototype.initEnergyInfo = function () {
    if (!this.labEnergyRule || !this.labEnergyNext || !this.labEnergyOverflow) {
      var root = this.node.getChildByName("root"), info = root && root.getChildByName("EnergyInfo");
      if (!info || info.name !== "EnergyInfo") return;
      this.labEnergyRule = info.getChildByName("RecoveryRule").getComponent(cc.Label);
      this.labEnergyNext = info.getChildByName("RecoveryNext").getComponent(cc.Label);
      this.labEnergyOverflow = info.getChildByName("RecoveryOverflow").getComponent(cc.Label);
    }
    if (!this.labEnergyRule || !this.labEnergyNext || !this.labEnergyOverflow) return;
    var panel = this.labEnergyRule.node.parent;
    var graphics = panel.getComponent(cc.Graphics) || panel.addComponent(cc.Graphics);
    graphics.clear();
    graphics.fillColor = cc.color(31, 49, 84, 245);
    graphics.strokeColor = cc.color(123, 177, 224, 255);
    graphics.lineWidth = 2;
    graphics.roundRect(-panel.width / 2, -panel.height / 2, panel.width, panel.height, 14);
    graphics.fill();graphics.stroke();
    this.updateEnergyInfo();
    this.schedule(this.updateEnergyInfo, 1);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.RefreshPower, this.updateEnergyInfo);
  };
  _ctor.prototype.updateEnergyInfo = function () {
    this.updateEnergyItems();
    if (!this.labEnergyRule || this.isclose) return;
    var user = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData();
    var energy = user.getPowerNum(), cap = user.maxPower, interval = user.powerRecoveryTime;
    var minutes = Math.round(interval / 600) / 100;
    this.labEnergyRule.string = $z1Utils.Utils.StringFormat(this.T("ui.energy.recovery_rule"), cap, minutes);
    if (energy >= cap) this.labEnergyNext.string = $z1Utils.Utils.StringFormat(this.T("ui.energy.recovery_paused"), energy, cap);
    else {
      var seconds = Math.max(0, Math.ceil(Math.min(interval, interval - (Date.now() - user.getPowerUpdateTime())) / 1000));
      var clock = Math.floor(seconds / 60) + ":" + (seconds % 60 < 10 ? "0" : "") + seconds % 60;
      this.labEnergyNext.string = $z1Utils.Utils.StringFormat(this.T("ui.energy.recovery_next"), energy, cap, clock);
    }
    this.labEnergyOverflow.string = this.T("ui.energy.recovery_overflow");
  };
  _ctor.prototype.onDisable = function () {
    this.unschedule(this.updateEnergyInfo);
    this._energyItemGeneration = (this._energyItemGeneration || 0) + 1;
    if (this._energyItemButton && this._energyItemHandler) this._energyItemButton.off(cc.Node.EventType.TOUCH_END, this._energyItemHandler, this);
    this._energyItemHandler = null; this._energyItemSignature = null;
  };
  _ctor.prototype.onBtnBuy = function (t) {
    if (t) $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().addPowerNum(t);
    $z1AudioMgr.AudioMgr.getInstance().playEffect($z1KinghtFallConfig.KinghtFallAudioId.gold_reward);
    this.call && this.call();
    this.closeUI();
  };
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "labTitle1", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "labEnergyRule", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "labEnergyNext", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "labEnergyOverflow", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndLeft", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndRight", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIAddStrength;
