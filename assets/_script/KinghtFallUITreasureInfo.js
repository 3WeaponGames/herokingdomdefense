var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
var cc__spreadArrays = __spreadArrays;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallMissionData = require("KinghtFallMissionData");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUITreasureInfo = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.labName = null;
    e.btnClose = null;
    e.ndItem = null;
    e.labInfo = null;
    e.ndPro = null;
    e.ndLock = null;
    e.btnGold = null;
    e.readOnly = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t, readOnly) {
    this.cfg = t;
    this.readOnly = !!readOnly;
    this.cfgGoods = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(this.cfg.goodID);
    this.initTypography();
  };
  _ctor.prototype.initTypography = function () {
    var title = this.labName;
    if (!title || !title.node) return;
    var language = require("LanguageMgr").LanguageMgr.getInstance();
    if (this.labInfo) {
      this.labInfo._localizedTextFlow = Object.assign({}, this.labInfo._localizedTextFlow, { keepValueUnits: true });
      language.refreshLabel(this.labInfo);
    }
    title._uiTypography = { fontRole: "display", outlineWidth: 2, outlineColor: "#26383b" };
    language.refreshLabel(title);
    var root = title.node.parent, instruction = root && root.getChildByName("labClose");
    var label = instruction && instruction.getComponent(cc.Label);
    if (label) {
      label._uiTypography = { fontRole: "body", fontFamily: "Arial", isBold: true, outlineWidth: 0 };
      language.refreshLabel(label);
    }
    this.prepareDescriptionLayout(language, instruction);
  };
  _ctor.prototype.prepareDescriptionLayout = function (language, instruction) {
    if (this._descriptionLayout || !this.labInfo || !this.labInfo.node || !this.labInfo.node.parent) return;
    var panel = this.labInfo.node.parent, self = this;
    var upper = [this.labName && this.labName.node, this.btnClose, this.ndItem, this.labInfo.node, this.ndPro].filter(Boolean);
    var lower = [this.ndLock, this.btnGold, instruction].filter(Boolean);
    function snapshot(item) { return { node: item, y: item.y, scaleY: item.scaleY }; }
    var sprite = cc.Sprite && panel.getComponent(cc.Sprite);
    this._descriptionLayout = { panel: panel, width: panel.width, height: panel.height, x: panel.x, y: panel.y, scaleX: panel.scaleX, scaleY: panel.scaleY,
      anchorX: typeof panel.anchorX === "number" ? panel.anchorX : .5, anchorY: typeof panel.anchorY === "number" ? panel.anchorY : .5, upper: upper.map(snapshot), lower: lower.map(snapshot),
      infoNode: this.labInfo.node, ownerNode: this.node, infoY: this.labInfo.node.y, instruction: instruction, instructionScaleY: instruction && instruction.scaleY, sprite: sprite, frame: sprite && sprite.spriteFrame, spriteEnabled: sprite && sprite.enabled };
    this._descriptionLanguage = language;
    this._descriptionPositionNodes = [this.labName && this.labName.node, instruction].filter(Boolean);
    var events = cc.Node.EventType;
    if (events) {
      if (this.labInfo.node.on) this.labInfo.node.on(events.SIZE_CHANGED, this.layoutDescription, this);
      if (this.node && this.node.on) this.node.on(events.SIZE_CHANGED, this.layoutDescription, this);
      if (panel.on) panel.on(events.SCALE_CHANGED, this.repairDescriptionScale, this);
      this._descriptionPositionNodes.forEach(function (item) { if (item.on) item.on(events.POSITION_CHANGED, self.layoutDescription, self); });
    }
    if (language.onChange) language.onChange(this.layoutDescription, this);
  };
  _ctor.prototype.layoutDescription = function () {
    var base = this._descriptionLayout;
    if (!base || this._descriptionLayingOut || this.isclose || !base.infoNode || cc.isValid && (!cc.isValid(base.panel, true) || !cc.isValid(base.infoNode, true))) return;
    this._descriptionLayingOut = true;
    try {
      var panel = base.panel, info = base.infoNode, gap = 16;
      // Keep the original decorative body floor and the active Locked/Upgrade
      // control clear. All positions are restored from the authored baseline.
      // The source's beige inset ends at row 318; leave ten authored units
      // above that edge, including after the middle of the frame stretches.
      var floor = (1 - base.anchorY) * base.height - base.height * (318 - 10) / 474;
      base.lower.forEach(function (entry) {
        if (entry.node === base.instruction || !entry.node.active) return;
        var item = entry.node, top = entry.y + item.height * Math.abs(entry.scaleY) * (1 - item.anchorY);
        floor = Math.max(floor, top + gap);
      });
      var height = info.height * Math.abs(info.scaleY), delta = Math.max(0, height - (base.infoY - floor));
      var topShift = delta * (1 - base.anchorY), bottomShift = -delta * base.anchorY;
      base.upper.forEach(function (entry) { entry.node.y = entry.y + topShift; });
      base.lower.forEach(function (entry) { entry.node.y = entry.y + bottomShift; });
      if (delta > 0 && base.frame && !this._descriptionBackground) {
        var rect = base.frame.getRect(), frame = base.frame.clone(); frame.name = (base.frame.name || "RelicInfo") + "@description";
        frame.insetLeft = frame.insetRight = rect.width * 60 / 584;
        frame.insetTop = rect.height * 150 / 474; frame.insetBottom = rect.height * 190 / 474;
        var background = new cc.Node("DescriptionFrame"); background.parent = panel;
        if (background.setSiblingIndex) background.setSiblingIndex(0);
        var artwork = background.addComponent(cc.Sprite); artwork.type = cc.Sprite.Type.SLICED; artwork.sizeMode = cc.Sprite.SizeMode.CUSTOM; artwork.spriteFrame = frame;
        background.scaleX = base.width / rect.width; background.scaleY = base.height / rect.height;
        this._descriptionFrame = frame; this._descriptionBackground = background;
      }
      if (this._descriptionBackground) {
        this._descriptionBackground.active = delta > 0;
        if (base.sprite) base.sprite.enabled = delta > 0 ? false : base.spriteEnabled;
        this._descriptionBackground.setContentSize(base.width / this._descriptionBackground.scaleX, (base.height + delta) / this._descriptionBackground.scaleY);
        this._descriptionBackground.setPosition((.5 - base.anchorX) * base.width, (.5 - base.anchorY) * (base.height + delta));
      }
      panel.setContentSize(base.width, base.height + delta);
      var origin = cc.view && cc.view.getVisibleOrigin(), visible = cc.view && cc.view.getVisibleSize();
      if (origin && visible && panel.parent && panel.parent.convertToNodeSpaceAR) {
        var safe = cc.sys.getSafeAreaRect ? cc.sys.getSafeAreaRect() : { x: origin.x, y: origin.y, width: visible.width, height: visible.height };
        var a = panel.parent.convertToNodeSpaceAR(cc.v2(Math.max(origin.x, safe.x), Math.max(origin.y, safe.y)));
        var b = panel.parent.convertToNodeSpaceAR(cc.v2(Math.min(origin.x + visible.width, safe.x + safe.width), Math.min(origin.y + visible.height, safe.y + safe.height)));
        var top = (1 - base.anchorY) * panel.height, bottom = -base.anchorY * panel.height;
        if (base.instruction) bottom = Math.min(bottom, base.instruction.y - base.instruction.height * Math.abs(base.instructionScaleY) * base.instruction.anchorY);
        var scale = Math.min(1, Math.max(1, Math.abs(b.x - a.x) - 40) / (base.width * Math.abs(base.scaleX)), Math.max(1, Math.abs(b.y - a.y) - 40) / ((top - bottom) * Math.abs(base.scaleY)));
        // A safe-area fit is only needed when the measured panel exceeds the
        // available screen. Ordinary descriptions retain their authored scale.
        if (this._descriptionOpened && (scale < 1 || base.fitted)) { panel.scaleX = base.scaleX * scale; panel.scaleY = base.scaleY * scale; base.fitted = scale < 1; }
        var sy = Math.abs(base.scaleY) * scale, low = Math.min(a.y, b.y) + 20 - bottom * sy, high = Math.max(a.y, b.y) - 20 - top * sy;
        panel.y = Math.max(low, Math.min(base.y, high));
        var sx = Math.abs(base.scaleX) * scale, left = -base.anchorX * panel.width, right = (1 - base.anchorX) * panel.width;
        var lowX = Math.min(a.x, b.x) + 20 - left * sx, highX = Math.max(a.x, b.x) - 20 - right * sx;
        panel.x = Math.max(lowX, Math.min(base.x, highX));
      } else { panel.x = base.x; panel.y = base.y; }
    } finally { this._descriptionLayingOut = false; }
  };
  _ctor.prototype.repairDescriptionScale = function () {
    if (this._descriptionOpened && this._descriptionLayout && this._descriptionLayout.fitted) this.layoutDescription();
  };
  _ctor.prototype.onOpen = function () {
    if (t.prototype.onOpen) t.prototype.onOpen.call(this);
    this._descriptionOpened = true;
    this.layoutDescription();
  };
  _ctor.prototype.onDestroy = function () {
    var base = this._descriptionLayout, self = this, events = cc.Node.EventType;
    function off(item, event, callback) { if (item && item.off && (!cc.isValid || cc.isValid(item))) item.off(event, callback, self); }
    try {
      try {
        if (base && events) {
          off(base.infoNode, events.SIZE_CHANGED, this.layoutDescription);
          off(base.ownerNode, events.SIZE_CHANGED, this.layoutDescription);
          off(base.panel, events.SCALE_CHANGED, this.repairDescriptionScale);
          (this._descriptionPositionNodes || []).forEach(function (item) { off(item, events.POSITION_CHANGED, self.layoutDescription); });
        }
      } finally {
        if (this._descriptionLanguage && this._descriptionLanguage.offChange) this._descriptionLanguage.offChange(this.layoutDescription, this);
      }
    } finally {
      try { if (this._descriptionFrame && (!cc.isValid || cc.isValid(this._descriptionFrame, true))) this._descriptionFrame.destroy(); }
      finally {
        this._descriptionLayout = this._descriptionLanguage = this._descriptionFrame = this._descriptionBackground = this._descriptionPositionNodes = null;
        if (t.prototype.onDestroy) t.prototype.onDestroy.call(this);
      }
    }
  };
  _ctor.prototype.start = function () {
    this.info = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel(this.cfg.ID);
    this.initView();
    this.initBtnListener();
  };
  _ctor.prototype.initBtnListener = function () {
    this.btnClose.on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
    this.node.getChildByName("bg").on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
    if (!this.readOnly) this.btnGold.on(cc.Node.EventType.TOUCH_END, this.onGoldBtnClick, this);
  };
  _ctor.prototype.initView = function () {
    var t = this;
    this.labName.string = this.T(this.cfgGoods.name);
    this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, this.cfgGoods.sprBg, function (e) {
      t.ndItem.getChildByName("sprBg").getComponent(cc.Sprite).spriteFrame = e;
    });
    this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, this.cfgGoods.icon, function (e) {
      t.ndItem.getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = e;
    });
    var e = this.info ? this.info.level : 1;
    this.ndItem.getChildByName("labNum").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea02), e);
    var n = [];
    for (var i = 0; i < this.cfg.levelInfo[e - 1].param.length; i++) {
      var a = this.cfg.levelInfo[e - 1].param[i];
      if (this.cfg.levelInfo[e - 1].vaulePercentage[i]) {
        n.push("<color=#43a926>" + Number((100 * a).toFixed(2)) + "%</c>");
      } else {
        n.push("<color=#43a926>" + a + "</c>");
      }
    }
    this.labInfo.string = require("LanguageMgr").LanguageMgr.getInstance().format("<b>{0}</b>", [$z1Utils.Utils.StringFormat.apply($z1Utils.Utils, cc__spreadArrays([this.T(this.cfg.Describe)], n))]);
    if (!this.info || this.info.level >= this.cfg.levelInfo.length) {
      this.ndLock.active = !this.info;
      this.ndPro.active = false;
      this.btnGold.active = false;
    } else {
      this.ndLock.active = false;
      this.ndPro.active = true;
      this.btnGold.active = !this.readOnly;
      this.ndPro.getChildByName("labPro").getComponent(cc.Label).string = this.info.frame + "/" + this.cfg.levelInfo[this.info.level - 1].PieceCost;
      this.ndPro.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = this.info.frame / this.cfg.levelInfo[this.info.level - 1].PieceCost;
      this.btnGold.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.cfg.levelInfo[this.info.level - 1].GoldCost);
    }
    this.layoutDescription();
  };
  _ctor.prototype.onGoldBtnClick = function () {
    if (this.readOnly) return;
    var self = this, player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
    this.info = player.getUserData().getTreasureLevel(this.cfg.ID);
    if (!this.info || this.info.level >= this.cfg.levelInfo.length) return;
    var level = this.info.level, upgrade = this.cfg.levelInfo[level - 1];
    if (this.info.frame < this.cfg.levelInfo[this.info.level - 1].PieceCost) {
      this.openUI($z1Config.UIID.UITips, $z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTips05);
    } else if (player.purchase([{ id: $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin, num: upgrade.GoldCost }], function () {
      var info = player.getUserData().getTreasureLevel(self.cfg.ID);
      player.getMissionData().addTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.TreasureUp, 1);
      info.frame -= upgrade.PieceCost;
      info.level++;
      player.getUserData().setTreasureLevel(info);
    }, function () { var info = player.getUserData().getTreasureLevel(self.cfg.ID); return !!info && info.level === level && info.frame >= upgrade.PieceCost; })) {
      $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.level_up);
      this.info = player.getUserData().getTreasureLevel(this.cfg.ID);
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.TreasureUpdate);
      this.initView();
    } else if (player.getUserData().getGoldNum() < upgrade.GoldCost) {
      this.openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddCurrency, $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin);
    }
  };
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "天赋名称"
  })], _ctor.prototype, "labName", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "ndItem", undefined);
  cc__decorate([ccp_property({
    type: cc.RichText,
    tooltip: "天赋名称"
  })], _ctor.prototype, "labInfo", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "ndPro", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "已签到"
  })], _ctor.prototype, "ndLock", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "已签到"
  })], _ctor.prototype, "btnGold", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUITreasureInfo;
