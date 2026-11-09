"use strict";
var Base = require("BaseCtrl").default, Layout = require("ShopViewCore"), Language = require("LanguageMgr").LanguageMgr;
var Config = require("KinghtFallConfig"), Player = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr, Data = require("KinghtFallDataMgr").KinghtFallDataMgr;
var TABS = ["bundles", "chests", "relics", "resources"], COLORS = { cream: "#fff7e5", inset: "#f3e7cc", ink: "#51402a", body: "#503d27", border: "#c5ab7d", header: "#34445f", blue: "#279fff", gold: "#ffda43" };
var RARITY_KEYS = { 1: "shop.rarity.1", 2: "shop.rarity.2", 3: "shop.rarity.3", 4: "shop.rarity.4" };
function node(parent, name, width, height) { var item = new cc.Node(name); item.parent = parent; item.setContentSize(width || 0, height || 0); return item; }
function round(item, fill, stroke, radius) {
  var g = item.getComponent(cc.Graphics) || item.addComponent(cc.Graphics); g.clear(); g.fillColor = cc.color(fill); g.strokeColor = cc.color(stroke || COLORS.ink); g.lineWidth = 3;
  g.roundRect(-item.width / 2, -item.height / 2, item.width, item.height, radius || 16); g.fill(); if (stroke !== false) g.stroke();
}
function place(item, x, y, width, height) { item.setPosition(x, y); if (width !== undefined) item.setContentSize(width, height); }
function fitSkin(item, width, height) {
  item._skinWidth = width; item._skinHeight = height;
  var scale = item._referenceHeight && height > 0 ? height / item._referenceHeight : 1;
  item.setScale(scale); item.setContentSize(width / scale, height / scale);
}
function textShadow(label, depth) {
  depth = Math.max(0, Math.min(4, Number(depth) || 0)); label._shopTypography.shadowDepth = depth;
  var effect = label.node.getComponent(cc.LabelShadow);
  if (depth) effect = effect || label.node.addComponent(cc.LabelShadow);
  if (effect) { effect.enabled = depth > 0; effect.blur = 0; effect.color = cc.color("#000000"); effect.offset = cc.v2(0, -depth); }
}
function cardSurface(item, header) {
  var g = item.getComponent(cc.Graphics) || item.addComponent(cc.Graphics), w = item.width, h = item.height; g.clear();
  g.fillColor = cc.color("#8e744b"); g.roundRect(-w / 2, -h / 2 - 3, w, h, 19); g.fill();
  g.fillColor = cc.color(COLORS.cream); g.strokeColor = cc.color(COLORS.ink); g.lineWidth = 3;
  g.roundRect(-w / 2, -h / 2, w, h, 19); g.fill(); g.stroke();
  g.strokeColor = cc.color("#fffdf4"); g.lineWidth = 3; g.roundRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 15); g.stroke();
  g.strokeColor = cc.color(COLORS.border); g.lineWidth = 1; g.roundRect(-w / 2 + 11, -h / 2 + 11, w - 22, h - 22, 11); g.stroke();
  [-1, 1].forEach(function (side) { [-1, 1].forEach(function (vertical) {
    if (header && vertical > 0) return;
    var x = side * (w / 2 - 17), y = vertical * (h / 2 - 17);
    g.moveTo(x, y - vertical * 13); g.lineTo(x, y); g.lineTo(x - side * 13, y); g.stroke();
    g.fillColor = cc.color("#d8c29a"); g.moveTo(x - side * 3, y - vertical * 3); g.lineTo(x - side * 10, y - vertical * 3); g.lineTo(x - side * 3, y - vertical * 10); g.close(); g.fill();
  }); });
}
function buttonSurface(item, fill) {
  var g = item.getComponent(cc.Graphics) || item.addComponent(cc.Graphics), w = item.width, h = item.height; g.clear();
  g.fillColor = cc.color("#8a774f"); g.roundRect(-w / 2, -h / 2 - 3, w, h, 13); g.fill();
  g.fillColor = cc.color(fill); g.strokeColor = cc.color(COLORS.ink); g.lineWidth = 2;
  g.roundRect(-w / 2, -h / 2, w, h, 13); g.fill(); g.stroke();
  g.strokeColor = cc.color(255, 255, 255, 150); g.lineWidth = 2; g.roundRect(-w / 2 + 4, -h / 2 + 4, Math.max(2, w - 8), Math.max(2, h - 8), 10); g.stroke();
}
var Shop = cc.Class({
  extends: Base,
  onLoad: function () {
    this._shopGeneration = 0; this._visibilityGeneration = 0; this._iconCache = Object.create(null); this._frameParts = Object.create(null); this._iconPending = Object.create(null); this._offsets = Object.create(null); this.tab = "bundles";
    this._language = Language.getInstance(); this.service = require("ShopRuntime").create(Player.getInstance(), Data.getInstance());
    this.build(); this.node.on(cc.Node.EventType.SIZE_CHANGED, this.relayout, this);
    this.addEvent(Config.KinghtFallEventName.RefreshGold, this.refresh);
    this.addEvent(Config.KinghtFallEventName.RefreshDiamond, this.refresh);
    this.addEvent(Config.KinghtFallEventName.TreasureUpdate, this.refresh);
  },
  onEnable: function () {
    if (!this.service) return;
    this._language.onChange(this.languageChanged, this); this._renderToken = null; this.relayout();
    this.unschedule(this.tick); this.schedule(this.tick, 1); this.refresh(); this.preparePayments();
  },
  onDisable: function () {
    this.observeFooter(null); this.unschedule(this.tick); if (this._language) this._language.offChange(this.languageChanged, this);
    this.unschedule(this.hideFeedback); this._feedbackActive = false; this.rememberOffset(); this.closeModal(); this.closeRelicDetails(); this._shopGeneration++; this._visibilityGeneration++;
  },
  onDestroy: function () {
    this.observeFooter(null); this.unschedule(this.tick); this.unschedule(this.hideFeedback); if (this._language) this._language.offChange(this.languageChanged, this);
    this.closeModal(); this.closeRelicDetails(); this._shopGeneration++; this._visibilityGeneration++; this.node.off(cc.Node.EventType.SIZE_CHANGED, this.relayout, this);
    Object.keys(this._frameParts).forEach(function (key) { this._frameParts[key].destroy(); }, this); this._frameParts = Object.create(null);
    Base.prototype.onDestroy.call(this);
  },
  layoutTitle: function () {
    var w = this.geometry.width, s = this.geometry.chromeScale;
    place(this.titleRoot, 0, this.geometry.title, w, 80 * s);
    place(this.title.node, 0, 0, w - 24 * s, 80 * s);
    this.title.fontSize = 64 * s; this.title.lineHeight = 78 * s;
    textShadow(this.title, 4 * s);
  },
  layoutCategories: function () {
    var w = this.geometry.width, s = this.geometry.chromeScale, width = w / TABS.length;
    this.tabRoot.setContentSize(w, 64 * s);
    fitSkin(this.tabStrip, w, 64 * s);
    this.tabButtons.forEach(function (item, i) {
      place(item, -w / 2 + width / 2 + i * width, 0, width, 64 * s); item._selected = this.tab === TABS[i];
      place(item.caption.node, 0, 3 * s, width - 14 * s, 44 * s); item.caption.fontSize = 32 * s; item.caption.lineHeight = 40 * s; item.caption.node.color = cc.color(item._selected ? "#ffffff" : "#4aacf7");
      item.underline.setPosition(0, -28 * s); fitSkin(item.underline, width - 28 * s, 8 * s); item.underline.active = item._selected;
    }, this);
  },
  layoutDailyClaim: function () {
    var s = this.geometry.chromeScale, view = this.view, claimed = !!(view && view.dailyDeal && view.dailyDeal.claimed);
    this.sizeButton(this.dailyClaim, this.geometry.width / 2 - 120 * s, 0, 204 * s, 76 * s, !!view && view.ready !== false && !!view.dailyDeal && !claimed && !this.isPending(), COLORS.blue);
    this.bind(this.dailyClaim.caption, claimed ? "shop.daily.claimed" : "shop.daily.claim");
    var baseline = 3 * this.dailyClaim.height / 84;
    place(this.dailyClaimCheck.node, -89 * s, baseline, 18 * s, 32 * s); this.dailyClaimCheck.fontSize = 20 * s; this.dailyClaimCheck.lineHeight = 24 * s; this.dailyClaimCheck.node.active = claimed;
    place(this.dailyClaim.caption.node, claimed ? 12 * s : 0, baseline, (claimed ? 176 : 188) * s, 64 * s);
    this.dailyClaim.caption.fontSize = (claimed ? 40 : 52) * s; this.dailyClaim.caption.lineHeight = 62 * s;
  },
  text: function (parent, name, size, bold, color, typography) {
    var item = node(parent, name), label = item.addComponent(cc.Label); item.color = cc.color(color || COLORS.body);
    var style = label._shopTypography = Object.assign({ fontRole: "body", fontFamily: "Arial", isBold: !!bold, outlineWidth: 0, outlineColor: "#26383b", shadowDepth: typography && typography.fontRole === "display" ? Math.min(4, size * .08) : 0 }, typography || {});
    label.fontFamily = "Arial"; label.useSystemFont = true; label._localizedFontRole = style.fontRole; label.enableBold = style.isBold;
    label.fontSize = size; label.lineHeight = Math.ceil(size * 1.2); label.enableWrapText = false; label.overflow = cc.Label.Overflow.SHRINK;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER; label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    if (style.outlineWidth > 0) { var outline = item.addComponent(cc.LabelOutline); outline.color = cc.color(style.outlineColor); outline.width = style.outlineWidth; }
    textShadow(label, style.shadowDepth);
    return label;
  },
  bind: function (label, key, params) { this._language.bindLabel(label, key, params); },
  named: function (label, offer) { if (offer.nameKey) this.bind(label, offer.nameKey); else label.string = this.T(offer.name || offer.fallbackName || ""); },
  button: function (parent, name, key, handler, fill) {
    var self = this, item = node(parent, name, 180, 60); buttonSurface(item, fill || COLORS.gold); item._enabled = true;
    item._surfaceFill = fill || COLORS.gold;
    item._refreshSurface = function () {
      var skin = !item._enabled || item._alwaysGray ? item.disabledSkin : item._surfaceFill === COLORS.blue ? item.skySkin : item._surfaceFill === COLORS.gold ? item.goldSkin : null;
      var sprite = skin && skin.getComponent(cc.Sprite), graphics = item.getComponent(cc.Graphics);
      if (sprite && sprite.spriteFrame && skin.active) graphics.clear();
      else buttonSurface(item, item._enabled ? item._surfaceFill : "#85828e");
    };
    var button = item.addComponent(cc.Button); button.transition = cc.Button.Transition.SCALE; button.zoomScale = .97;
    item.goldSkin = this.icon(item, { bundle: "KinghtFallPrefabs", path: "_res/textures/KinghtFallHomePersonCtrl/wg_rw_an1", sliced: true }, 100, "GoldSkin", true);
    item.skySkin = this.icon(item, { bundle: "resources", path: "icons/GUI-Pro/Buttons/Btn_MainButton_Sky", sliced: true, referenceHeight: 145 }, 100, "SkySkin", true);
    item.disabledSkin = this.icon(item, { bundle: "resources", path: "icons/GUI-Pro/Buttons/Btn_MainButton_Gray", sliced: true, referenceHeight: 145 }, 100, "DisabledSkin", true);
    item.goldSkin.active = !fill || fill === COLORS.gold; item.skySkin.active = fill === COLORS.blue; item.disabledSkin.active = false;
    item.caption = this.text(item, "Caption", 32, true); this.bind(item.caption, key);
    item.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); if (item._enabled && cc.isValid(item, true) && item.activeInHierarchy && Layout.tap(event) && self.node.activeInHierarchy) handler(); }, this);
    return item;
  },
  sizeButton: function (item, x, y, width, height, enabled, fill) {
    place(item, x, y, width, height); item._enabled = enabled !== false; item.getComponent(cc.Button).interactable = item._enabled;
    item._surfaceFill = fill || COLORS.gold;
    buttonSurface(item, item._enabled ? fill || COLORS.gold : "#b8c0c2"); place(item.caption.node, 0, 0, width - 16, height - 8);
    var kit = fill === COLORS.blue, whiteText = !item._enabled || kit;
    var style = item.caption._shopTypography, signature = [kit, whiteText].join(":");
    item.caption.node.color = cc.color(whiteText ? "#ffffff" : kit ? "#1c4a78" : COLORS.body);
    if (item._captionStyle !== signature) {
      item._captionStyle = signature; style.fontRole = kit ? "display" : "body"; style.fontFamily = kit ? null : "Arial"; style.isBold = !kit; style.outlineWidth = kit && whiteText ? 3 : 0; style.outlineColor = "#000000";
      item.caption._localizedFontRole = style.fontRole;
      if (this._language.refreshLabel) this._language.refreshLabel(item.caption);
    }
    textShadow(item.caption, kit ? 4 * height / 84 : 0);
    item.goldSkin.active = item._enabled && !item._alwaysGray && (!fill || fill === COLORS.gold); item.skySkin.active = item._enabled && !item._alwaysGray && fill === COLORS.blue; item.disabledSkin.active = !item._enabled || !!item._alwaysGray;
    [item.goldSkin, item.skySkin, item.disabledSkin].forEach(function (skin) { fitSkin(skin, width, height); });
    item._refreshSurface();
    if (kit) item.caption.node.y = 3 * height / 84;
  },
  framePart: function (frame, key, descriptor) {
    if (!descriptor.frameRect) return frame;
    var region = descriptor.frameRect, borders = descriptor.insets || [0, 0, 0, 0], source = frame.getRect();
    if (region.length !== 4 || region.some(function (v) { return !isFinite(v) || v < 0; }) || region[2] <= borders[0] + borders[1] || region[3] <= borders[2] + borders[3] || region[0] + region[2] > source.width || region[1] + region[3] > source.height) throw new Error("Invalid Shop frame region: " + key);
    var partKey = key + ":" + region.join(",") + ":" + borders.join(",");
    if (!this._frameParts[partKey]) {
      var part = frame.clone(); part.name = (frame.name || "ShopCard") + "@" + region.join(","); part.setRect(cc.rect(source.x + region[0], source.y + region[1], region[2], region[3])); part.setOriginalSize(cc.size(region[2], region[3])); part.setOffset(cc.v2(0, 0));
      part.insetLeft = borders[0]; part.insetRight = borders[1]; part.insetTop = borders[2]; part.insetBottom = borders[3]; this._frameParts[partKey] = part;
    }
    return this._frameParts[partKey];
  },
  icon: function (parent, descriptor, size, name, persistent) {
    var self = this, item = node(parent, name || "Icon", size, size), sprite = item.addComponent(cc.Sprite); sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    if (!descriptor) return item;
    if (typeof descriptor === "string") descriptor = { bundle: "resources", path: descriptor };
    var bundle = descriptor.bundle || "resources", path = descriptor.path, key = bundle + "/" + path, generation = this._shopGeneration;
    if (!path) return item;
    if (descriptor.sliced) { sprite.type = cc.Sprite.Type.SLICED; item._referenceHeight = descriptor.referenceHeight || 0; }
    function assign(frame) {
      if (!frame || self.isDestroy || !persistent && generation !== self._shopGeneration || !cc.isValid(item, true)) return;
      sprite.spriteFrame = self.framePart(frame, key, descriptor);
      if (descriptor.sliced) { fitSkin(item, item._skinWidth === undefined ? parent.width : item._skinWidth, item._skinHeight === undefined ? parent.height : item._skinHeight); if (parent._refreshSurface) parent._refreshSurface(); return; }
      // SIMPLE sprites render the trimmed frame; its bounds preserve the
      // artwork's proportions even when the source PNG has square padding.
      var original = frame.getRect ? frame.getRect() : frame.getOriginalSize(), fitWidth = descriptor.fitWidth > 0 ? descriptor.fitWidth : size, fitHeight = descriptor.fitHeight > 0 ? descriptor.fitHeight : size;
      var factor = Math.min(fitWidth / original.width, fitHeight / original.height); item.setContentSize(original.width * factor, original.height * factor);
    }
    if (this._iconCache[key]) assign(this._iconCache[key]);
    else if (this._iconPending[key]) this._iconPending[key].push(assign);
    else { this._iconPending[key] = [assign]; this.loadSpriteFrame(bundle, path, function (frame) { if (frame) self._iconCache[key] = frame; var callbacks = self._iconPending[key] || []; delete self._iconPending[key]; callbacks.forEach(function (callback) { callback(frame); }); }); }
    return item;
  },
  relicVisual: function (parent, item, size, name) {
    var visual = node(parent, name || "RelicVisual", size, size);
    if (item.rarityFrame) this.icon(visual, item.rarityFrame, size, "RarityFrame");
    this.icon(visual, item.icon, item.rarityFrame ? size * .72 : size, "Icon");
    this.bindInspection(visual, item); return visual;
  },
  bindInspection: function (target, item) {
    var owner = this;
    if (!item.relicId && !item.chestId) return;
    target.on(cc.Node.EventType.TOUCH_END, function (event) {
      if (event) event.stopPropagation();
      if (!cc.isValid(target, true) || !target.activeInHierarchy || !owner.node.activeInHierarchy || !Layout.tap(event)) return;
      if (item.relicId) owner.openRelicDetails(item.relicId); else owner.chestContents(item.chestId);
    });
  },
  openRelicDetails: function (id) {
    var owner = this, manager = require("UIMgr").UIMgr.getInstance(), uid = Config.KinghtFallUIID.UITreasureInfo;
    var current = this._relicDetailNode && cc.isValid(this._relicDetailNode, true) && manager.getUIById(uid);
    if (this.isDestroy || !this.node.activeInHierarchy || this._relicDetailOpening || current && !current.isclose) return;
    var relic = Data.getInstance().getTreasureCfgById(Number(id)); if (!relic) return;
    var generation = this._visibilityGeneration, detailGeneration = this._relicDetailGeneration || 0; this._relicDetailOpening = true;
    this._relicDetailRequest = manager.openUIWithOwner(uid, require("Config").UIID.UINONE, {
      parent: this,
      isCurrent: function () { return !owner.isDestroy && cc.isValid(owner, true) && generation === owner._visibilityGeneration && detailGeneration === (owner._relicDetailGeneration || 0) && owner.node.activeInHierarchy; },
      onCancel: function () { if (detailGeneration === (owner._relicDetailGeneration || 0)) { owner._relicDetailOpening = false; owner._relicDetailRequest = null; } },
      onOpened: function (detail) {
        if (owner.isDestroy || generation !== owner._visibilityGeneration || detailGeneration !== (owner._relicDetailGeneration || 0) || !owner.node.activeInHierarchy) { manager.closeUI(detail); return; }
        owner._relicDetailOpening = false; owner._relicDetailRequest = null;
        owner._relicDetailNode = detail; detail._shopInspectionOwner = owner;
        detail.zIndex = owner.popupOrder(true);
      }
    }, relic, true);
  },
  closeRelicDetails: function () {
    this._relicDetailGeneration = (this._relicDetailGeneration || 0) + 1;
    var request = this._relicDetailRequest, detail = this._relicDetailNode;
    this._relicDetailRequest = this._relicDetailNode = null; this._relicDetailOpening = false;
    if (request && !request.finished) request.cancel();
    if (detail && cc.isValid(detail, true) && detail._shopInspectionOwner === this) {
      var manager = require("UIMgr").UIMgr.getInstance(), current = manager.getUIById(Config.KinghtFallUIID.UITreasureInfo);
      if (current && current.node === detail && !current.isclose) manager.closeUI(detail);
    }
  },
  asset: function (name) { return { bundle: "resources", path: "icons/GUI-Pro/Icons/" + name }; },
  currencyIcon: function (currency) { return this.cardAsset(Number(currency) === 2002 ? "Icon_ImageIcon_Gem01_s" : "StatusBarIcon_Gold"); },
  isPending: function () { return !!this._acting; },
  isPaymentPending: function () { return this.isPending() || !!(this.view && this.view.pending); },
  preparePayments: function () {
    if (this._loadingPayments) return;
    var self = this, generation = this._visibilityGeneration, work = [];
    ["loadProducts", "restorePurchases"].forEach(function (method) {
      if (typeof self.service[method] !== "function") return;
      try { work.push(Promise.resolve(self.service[method]()).catch(function () {})); } catch (_) {}
    });
    if (!work.length) return;
    this._loadingPayments = true;
    this._renderToken = null; this.refresh();
    return Promise.all(work).then(function () {
      self._loadingPayments = false;
      if (!self.isDestroy && cc.isValid(self, true) && generation === self._visibilityGeneration && self.node.activeInHierarchy) { self._renderToken = null; self.refresh(); }
    });
  },
  build: function () {
    var self = this; this.surface = node(this.node, "ShopSurface"); this.surface.zIndex = 1;
    this.backdrop = node(this.node, "ShopBackdrop");
    this.backdropSkin = this.icon(this.backdrop, Object.assign(this.cardAsset("Background_06"), { sliced: true }), 100, "KitShopBackground", true);
    this.titleRoot = node(this.surface, "TitleHeading");
    this.title = this.text(this.titleRoot, "Title", 64, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 3, outlineColor: "#000000" });
    this.bind(this.title, "shop.title");
    this.tabRoot = node(this.surface, "Categories");
    this.tabStrip = this.icon(this.tabRoot, { bundle: "resources", path: "icons/GUI-Pro/Buttons/Frame_BarFrame_Top01_Navy", sliced: true }, 100, "KitTabStrip", true);
    this.tabButtons = TABS.map(function (id) {
      var item = node(self.tabRoot, "Tab_" + id); item.addComponent(cc.Button).transition = 0;
      item.caption = self.text(item, "Caption", 32, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 2, outlineColor: "#000000" }); self.bind(item.caption, "shop.tab." + id);
      item.underline = self.icon(item, { bundle: "resources", path: "icons/GUI-Pro/Buttons/Icon_MenuIcon00_TabMenu_Focus", sliced: true, referenceHeight: 14 }, 100, "ActiveUnderline", true);
      item.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); if (Layout.tap(event) && self.node.activeInHierarchy) self.selectTab(id); });
      return item;
    });
    this.daily = node(this.surface, "DailyDeal");
    this.dailySkin = this.icon(this.daily, Object.assign(this.cardAsset("Frame_ListFrame14_n_Blue"), { sliced: true, referenceHeight: 158 / .85 }), 100, "DailySkin", true);
    this.dailyRim = this.icon(this.daily, Object.assign(this.cardAsset("Frame_ListFrame14_s"), { sliced: true, referenceHeight: 158 / .40 }), 100, "DailyRim", true); this.dailyRim.opacity = 90;
    this.dailyGiftGlow = this.icon(this.daily, this.cardAsset("Common_Glow_Circle_White"), 144, "GiftGlow", true); this.dailyGiftGlow.color = cc.color("#91e5ff"); this.dailyGiftGlow.opacity = 180;
    this.dailyIcon = this.icon(this.daily, { bundle: "resources", path: "icons/2d-minimal/UI/Rewards/UI_Rewards_Gift_01_Red" }, 150, "Gift", true); this.dailyTitle = this.text(this.daily, "DailyTitle", 44, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 2, outlineColor: "#000000" }); this.bind(this.dailyTitle, "shop.daily.title");
    this.dailyGold = this.icon(this.daily, this.currencyIcon(2001), 48, "RewardGold", true);
    this.dailyReward = this.text(this.daily, "DailyReward", 40, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 2, outlineColor: "#000000" }); this.bind(this.dailyReward, "shop.daily.reward"); this.dailyTimer = this.text(this.daily, "DailyTimer", 26, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 1, outlineColor: "#000000" });
    this.dailyTitle.horizontalAlign = this.dailyReward.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
    this.dailyTimer.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
    this.dailyTimerStrip = node(this.daily, "ResetStrip"); this.dailyTimerStrip.addComponent(cc.Graphics); this.dailyTimer.node.zIndex = 1;
    this.dailyClock = this.icon(this.daily, { bundle: "resources", path: "icons/Pictograms/Pictoicon_Time" }, 44, "ResetClock", true);
    this.dailyClaim = this.button(this.daily, "ClaimDaily", "shop.daily.claim", function () { var view = self.view; if (view && view.ready !== false && view.dailyDeal && !view.dailyDeal.claimed) self.act("claimDaily", null, view.token); }, COLORS.blue);
    this.dailyClaimCheck = this.text(this.dailyClaim, "ClaimedCheck", 26, true, "#ffffff"); this.dailyClaimCheck.string = "✓"; this.dailyClaimCheck.node.active = false;
    this.scrollNode = node(this.surface, "Products"); this.scrollNode.addComponent(cc.BlockInputEvents);
    this.viewport = node(this.scrollNode, "Viewport"); this.viewport.addComponent(cc.Mask).type = cc.Mask.Type.RECT;
    this.content = node(this.viewport, "Content"); this.content.anchorY = 1;
    this.scroll = this.scrollNode.addComponent(cc.ScrollView); this.scroll.content = this.content; this.scroll.horizontal = false; this.scroll.vertical = true; this.scroll.inertia = true; this.scroll.brake = .45; this.scroll.cancelInnerEvents = true;
    this.status = this.text(this.surface, "Status", 25, false); this.status.node.active = false;
  },
  footer: function () {
    for (var ancestor = this.node.parent; ancestor; ancestor = ancestor.parent) {
      var footer = ancestor.getChildByName("ndBottom"); if (footer) return footer;
    }
    return null;
  },
  observeFooter: function (footer) {
    if (this._footer === footer) return;
    var events = [cc.Node.EventType.SIZE_CHANGED, cc.Node.EventType.POSITION_CHANGED];
    if (this._footer && cc.isValid(this._footer, true)) events.forEach(function (event) { this._footer.off(event, this.relayout, this); }, this);
    this._footer = footer;
    if (footer) events.forEach(function (event) { footer.on(event, this.relayout, this); }, this);
  },
  bounds: function () {
    var origin = cc.view.getVisibleOrigin(), size = cc.view.getVisibleSize(), safe = cc.sys.getSafeAreaRect ? cc.sys.getSafeAreaRect() : { x: origin.x, y: origin.y, width: size.width, height: size.height };
    var a = this.node.convertToNodeSpaceAR(cc.v2(Math.max(origin.x, safe.x), Math.max(origin.y, safe.y))), b = this.node.convertToNodeSpaceAR(cc.v2(Math.min(origin.x + size.width, safe.x + safe.width), Math.min(origin.y + size.height, safe.y + safe.height)));
    var bounds = { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), bottom: Math.min(a.y, b.y), top: Math.max(a.y, b.y) };
    var footer = this.footer(); this.observeFooter(footer);
    if (footer) bounds.footer = this.node.convertToNodeSpaceAR(footer.convertToWorldSpaceAR(cc.v2(0, footer.height * (1 - footer.anchorY)))).y;
    return bounds;
  },
  relayout: function () {
    if (!this.surface) return; var bounds = this.bounds(), geometry = Layout.layout(bounds), signature = JSON.stringify(geometry);
    if (this._geometrySignature === signature) return; this.rememberOffset(); this._geometrySignature = signature; this.geometry = geometry;
    var w = geometry.width, s = geometry.chromeScale; this.surface.x = geometry.center;
    place(this.backdrop, geometry.center, (bounds.top + geometry.listBottom) / 2, bounds.right - bounds.left, bounds.top - geometry.listBottom); fitSkin(this.backdropSkin, this.backdrop.width, this.backdrop.height);
    this.layoutTitle();
    place(this.tabRoot, 0, geometry.tabs); this.layoutCategories();
    place(this.daily, 0, geometry.daily, w, 158 * s); fitSkin(this.dailySkin, w, this.daily.height); fitSkin(this.dailyRim, w - 8 * s, this.daily.height - 8 * s);
    this.dailyGiftGlow.setPosition(-w / 2 + 84 * s, 0); this.dailyGiftGlow.setScale(s);
    this.dailyIcon.setPosition(-w / 2 + 84 * s, 0); this.dailyIcon.setScale(s);
    place(this.dailyTitle.node, -w / 2 + 328 * s, 48 * s, 264 * s, 54 * s); this.dailyTitle.fontSize = 44 * s; this.dailyTitle.lineHeight = 52 * s; textShadow(this.dailyTitle, 3.52 * s);
    this.dailyGold.setPosition(-w / 2 + 222 * s, -7 * s); this.dailyGold.setScale(s);
    place(this.dailyReward.node, -w / 2 + 374 * s, -7 * s, 248 * s, 48 * s); this.dailyReward.fontSize = 40 * s; this.dailyReward.lineHeight = 48 * s; textShadow(this.dailyReward, 3.2 * s);
    place(this.dailyTimerStrip, -w / 2 + 174 * s, 0, 2 * s, 112 * s); var reset = this.dailyTimerStrip.getComponent(cc.Graphics); reset.clear(); reset.strokeColor = cc.color("#47b5eb"); reset.lineWidth = 2 * s; reset.moveTo(0, -56 * s); reset.lineTo(0, 56 * s); reset.stroke();
    this.dailyClock.setPosition(-w / 2 + 218 * s, -53 * s); this.dailyClock.setScale(s);
    place(this.dailyTimer.node, -w / 2 + 371 * s, -53 * s, 242 * s, 36 * s); this.dailyTimer.fontSize = 26 * s; this.dailyTimer.lineHeight = 34 * s; textShadow(this.dailyTimer, 2.08 * s);
    this.layoutDailyClaim();
    place(this.scrollNode, 0, geometry.listY, w, geometry.listHeight); place(this.viewport, 0, 0, w, geometry.listHeight); this.content.setPosition(0, geometry.listHeight / 2); this.content.width = w;
    place(this.status.node, 0, geometry.listY, w - 24 * s, 120 * s); this.closeModal(); this._renderToken = null; if (this.view) this.renderProducts();
  },
  rememberOffset: function () { if (this.scroll && this.tab && this._renderTab === this.tab) this._offsets[this.tab] = Math.max(0, this.scroll.getScrollOffset().y); },
  selectTab: function (id) {
    if (this.tab === id || TABS.indexOf(id) < 0) return; this.rememberOffset(); this.closeModal(); this.closeRelicDetails(); this.tab = id;
    this._renderToken = null; this.refresh();
  },
  languageChanged: function () { this.closeModal(); this._renderToken = null; this.refresh(); },
  tick: function () { if (this.node.activeInHierarchy) this.refresh(); },
  refresh: function () {
    if (!this.service || !this.node.activeInHierarchy) return;
    var view = this.service.getView(); this.view = view;
    // Tokens include the current relic ownership quote as well as daily stock.
    // A changed quote must dismiss an open confirmation or contents overlay.
    if (view && this._renderToken != null && this._renderToken !== view.token) this.closeModal();
    if (!view || view.ready === false) { this.status.node.active = true; this.bind(this.status, "shop.unavailable"); this.scrollNode.active = false; this._dailyState = null; this.layoutDailyClaim(); return; }
    this.scrollNode.active = true; this.status.node.active = !!this._feedbackActive;
    var pending = this.isPending(), dailyState = String(view.dailyDeal.claimed) + ":" + pending;
    if (this._dailyState !== dailyState) {
      this._dailyState = dailyState; this.layoutDailyClaim();
    }
    var timer = view.dailyDeal.claimed ? Layout.time(view.dailyDeal.remainingSeconds) : "once";
    if (this._dailyTimer !== timer) { this._dailyTimer = timer; this.bind(this.dailyTimer, view.dailyDeal.claimed ? "shop.daily.resets" : "shop.daily.once", view.dailyDeal.claimed ? [timer] : undefined); }
    if (this.view.refresh && this.refreshTimer) { var restock = Layout.time(view.refresh.remainingSeconds); if (this._restockTimer !== restock) { this._restockTimer = restock; this.bind(this.refreshTimer, "shop.relics.resets", [restock]); } }
    if (this._renderToken !== view.token || this._renderTab !== this.tab || this._renderPending !== pending || this._renderPresentation !== Layout.presentationSignature(view)) { this.rememberOffset(); this.renderProducts(); }
  },
  header: function (parent, width, height, offer, scale) {
    scale = scale || 1;
    var supplied = (offer.rewards || [])[0], bundleIndex = this.tab === "bundles" ? (this.view.bundles || []).indexOf(offer) : 0, theme = this.tab === "bundles" ? bundleIndex % 2 === 1 ? "Purple" : "Green" : this.tab === "resources" && supplied && supplied.id === 2001 ? "Yellow" : this.tab === "resources" && supplied && supplied.id === 2002 ? "Purple" : "Blue";
    var row = node(parent, "Offer_" + offer.id, width, height), premium = this.tab === "bundles", relic = this.tab === "relics", chest = this.tab === "chests", energy = this.tab === "resources" && supplied && supplied.id === 2033;
    row._kitCard = true; row._cardTheme = theme.toLowerCase(); row._footerHeight = (premium ? 92 : relic ? this._relicConversionRows ? 84 : 66 : chest ? 80 : energy ? 64 : theme === "Purple" ? 96 : 76) * scale;
    row.cardBacking = this.icon(row, Object.assign(this.cardAsset("Frame_CardFrame00_Base"), { sliced: true, referenceHeight: (height + 8 * scale) / (2.2 * scale) }), 100, "CardBacking"); row.cardBacking.color = cc.color("#000000"); fitSkin(row.cardBacking, width + 4 * scale, height + 8 * scale); row.cardBacking.y = -2 * scale;
    if (premium) {
      row.cardFill = this.icon(row, Object.assign(this.cardAsset("Frame_CardFrame00_Base"), { sliced: true, referenceHeight: (height - 8 * scale) / (2 * scale) }), 100, "CardFill"); row.cardFill.color = cc.color(theme === "Green" ? "#00b271" : "#a229ff"); fitSkin(row.cardFill, width - 4 * scale, height - 8 * scale); row.cardFill.y = 2 * scale;
      var footer = node(row, "FooterBand", width - 6 * scale, row._footerHeight - 4 * scale); footer.y = -height / 2 + row._footerHeight / 2 + 3 * scale; var g = footer.addComponent(cc.Graphics); g.fillColor = cc.color(theme === "Green" ? "#70d900" : "#ce52fe"); g.roundRect(-footer.width / 2, -footer.height / 2, footer.width, footer.height, 16 * scale); g.rect(-footer.width / 2, 0, footer.width, footer.height / 2); g.fill();
      row.cardSkin = this.icon(row, Object.assign(this.cardAsset("Frame_CardFrame02_Frame"), { sliced: true, frameRect: [0, 0, 40, 50], insets: [20, 19, 19, 30], referenceHeight: height / (2 * scale) }), 100, "CardSkin"); row.cardSkin.color = cc.color(theme === "Green" ? "#01765c" : "#5c08a7"); fitSkin(row.cardSkin, width, height);
    } else {
      var bodyHeight = height - row._footerHeight, skin = this.cardAsset("Frame_ListFrame12_" + theme);
      // Preserve the kit's corner sizes independently of the footer height.
      // Both slices refer to the original texture; the shared asset is intact.
      row.cardSkin = this.icon(row, Object.assign({}, skin, { sliced: true, frameRect: [0, 0, 61, 33], insets: [30, 30, 25, 0], referenceHeight: bodyHeight / scale }), 100, "CardSkin"); fitSkin(row.cardSkin, width, bodyHeight); row.cardSkin.y = row._footerHeight / 2;
      row.cardFooter = this.icon(row, Object.assign({}, skin, { sliced: true, frameRect: [0, 33, 61, 124], insets: [30, 30, 2, 15], referenceHeight: row._footerHeight / scale }), 100, "CardFooter"); fitSkin(row.cardFooter, width, row._footerHeight); row.cardFooter.y = -height / 2 + row._footerHeight / 2;
    }
    var band = node(row, "Header", chest ? width * .46 : width - 24 * scale, (premium ? 64 : chest ? 58 : 48) * scale); band.y = height / 2 - (premium ? 38 : chest ? 34 : 26) * scale; if (chest) band.x = -width * .25;
    var title = this.text(band, "Name", (premium ? 52 : chest ? 46 : 40) * scale, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 3.2 * scale, outlineColor: "#000000" }); place(title.node, 0, 0, band.width - (premium ? 232 : 8) * scale, band.height); if (chest) title.horizontalAlign = cc.Label.HorizontalAlign.LEFT; title.lineHeight = (premium ? 62 : chest ? 56 : 46) * scale; this.named(title, offer); return row;
  },
  cardAsset: function (name) { return { bundle: "resources", path: "icons/GUI-Pro/ShopCards/" + name }; },
  cardGlow: function (parent, x, y, size, tint) {
    var s = this.geometry.scale, top = parent.height / 2 - 12 * s, bottom = -parent.height / 2 + parent._footerHeight + 8 * s;
    var width = Math.min(parent.width * .94, Math.max(0, parent.width - 24 * s - Math.abs(x) * 2)), height = Math.min(width * .948, Math.max(0, top - bottom));
    var centerY = Math.max(bottom + height / 2, Math.min(top - height / 2, y));
    var glow = this.icon(parent, this.cardAsset("Common_Glow_Circle_White"), size, "ArtworkGlow"); glow.setPosition(x, centerY);
    glow.scaleX = width / size; glow.scaleY = height / size; glow.color = cc.color(tint); glow.opacity = 190;
    var rays = this.icon(parent, this.cardAsset("fx_rotate_line_small"), size, "ArtworkRays"); rays.setPosition(x, centerY); rays.scaleX = width / size; rays.scaleY = height / size; rays.color = cc.color(tint); rays.opacity = 110; return glow;
  },
  cardAction: function (parent, name, key, handler, x, y, width, height, enabled, typography) {
    var self = this, item = node(parent, name, width, height), button = item.addComponent(cc.Button); item.setPosition(x, y); item._enabled = enabled !== false; item._integratedAction = true; button.interactable = item._enabled; button.transition = cc.Button.Transition.SCALE; button.zoomScale = 1.025;
    item.caption = this.text(item, "Caption", 30 * this.geometry.scale, false, item._enabled ? "#ffffff" : "#bdd5ed", Object.assign({ fontRole: "display", fontFamily: null, outlineWidth: 2 * this.geometry.scale, outlineColor: "#000000" }, typography || {})); this.bind(item.caption, key); place(item.caption.node, 0, 0, width - 12 * this.geometry.scale, height - 4 * this.geometry.scale);
    item.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); if (item._enabled && cc.isValid(item, true) && item.activeInHierarchy && self.node.activeInHierarchy && Layout.tap(event)) handler(); }); return item;
  },
  reward: function (parent, reward, x, y, width, height, possible) {
    var card = node(parent, "Reward_" + reward.id, width, height); card.setPosition(x, y);
    var scale = this.geometry.scale;
    if (!possible) this.icon(card, this.cardAsset("Frame_ItemFrame01_Color_Green"), Math.min(width, height), "RewardTile");
    var displayed = reward.id === 2001 || reward.id === 2002 ? Object.assign({}, reward, { icon: this.currencyIcon(reward.id) }) : reward, icon = this.relicVisual(card, displayed, (possible ? 144 : 110) * scale, "RewardIcon"); icon.y = possible ? 0 : 23 * scale;
    if (possible) icon.getChildByName("Icon").setScale(1.12);
    if (!possible) { var amount = this.text(card, "Quantity", 36 * scale, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 2 * scale, outlineColor: "#000000" }); place(amount.node, 0, -55 * scale, width - 10 * scale, 42 * scale); amount.lineHeight = 42 * scale; amount.string = "×" + Layout.formatAmount(reward.num); }
    this.bindInspection(card, reward);
    return card;
  },
  costButton: function (parent, offer, x, y, width, height, kind, token) {
    var self = this, unit = this.geometry.scale, payment = offer.payment, pending = this.isPending() || payment && (this.isPaymentPending() || payment.pending);
    var available = offer.available !== false && !offer.soldOut && !pending && (!payment || payment.available && !!payment.formattedPrice);
    var font = (kind === "resources" ? payment || (offer.rewards || [])[0] && offer.rewards[0].id === 2033 ? 52 : 60 : kind === "relics" ? offer.conversionGold ? 42 : 50 : kind === "chests" ? 56 : 64) * unit;
    var button = this.cardAction(parent, "Buy_" + offer.id, offer.soldOut ? "shop.soldOut" : "shop.buy", function () { self.buy(kind, offer, token); }, x, y, width, height, available, { outlineWidth: 3.5 * unit, shadowDepth: 4 * unit });
    button.caption.fontSize = font; button.caption.lineHeight = Math.ceil(font * 1.15);
    if (payment) {
      if (offer.soldOut) return button;
      if (available) button.caption.string = payment.formattedPrice;
      else {
        button.caption.string = payment.formattedPrice || (payment.currency === "USD" ? "US $" + (payment.priceMinor / 100).toFixed(2) : Layout.referencePrice(payment)); button.caption.node.color = cc.color("#ffffff");
        var price = this.text(button, "ReferencePrice", 24 * unit, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 1.2 * unit, outlineColor: "#000000" }); this.bind(price, pending ? "shop.payment.pending" : "shop.payment.unavailable"); price.lineHeight = 28 * unit;
        if (kind === "bundles") { place(button.caption.node, 0, 0, 340 * unit, height); place(price.node, width / 2 - 90 * unit, 0, 160 * unit, 32 * unit); }
        else { button.caption.fontSize = 52 * unit; button.caption.lineHeight = 60 * unit; place(button.caption.node, 0, 18 * unit, width - 16 * unit, 60 * unit); place(price.node, 0, -28 * unit, width - 16 * unit, 28 * unit); }
      }
    } else if (!offer.soldOut) {
      var cost = Layout.cost(offer.cost); button.caption.string = Layout.formatAmount(cost.amount); button.caption.overflow = cc.Label.Overflow.NONE;
      // NONE sizes the node using one line plus Creator's 0.26 baseline
      // allowance. Keep the transparent padding inside the fixed price slot.
      button.caption.lineHeight = Math.max(1, (height - button.caption._shopTypography.outlineWidth * 2 - 4 * unit) / 1.26);
      var iconSize = font * (kind === "chests" ? 1.12 : kind === "relics" && !offer.conversionGold ? 1.04 : .95), gap = 12 * unit;
      var icon = this.icon(button, this.currencyIcon(cost.currency), iconSize, "PriceIcon");
      function centerPrice() { if (!cc.isValid(button, true)) return; var total = icon.width + gap + button.caption.node.width; icon.setPosition(-total / 2 + icon.width / 2, 0); button.caption.node.setPosition(total / 2 - button.caption.node.width / 2, 0); }
      button.caption.node.on(cc.Node.EventType.SIZE_CHANGED, centerPrice); icon.on(cc.Node.EventType.SIZE_CHANGED, centerPrice);
      if (button.caption._forceUpdateRenderData) button.caption._forceUpdateRenderData(true); centerPrice();
    }
    return button;
  },
  storeNotice: function (y, width, scale) {
    var self = this, notice = node(this.content, "StoreNotice", width, 100 * scale); notice.y = y - 50 * scale; cardSurface(notice, false);
    var caption = this.text(notice, "Reason", 24 * scale, false); caption.enableWrapText = true;
    this.bind(caption, this.isPaymentPending() ? "shop.payment.pendingReason" : "shop.payment.unavailableReason"); place(caption.node, -104 * scale, 0, width - 246 * scale, 82 * scale);
    var retry = this.button(notice, "RestorePurchases", "shop.payment.retry", function () { self.preparePayments(); }, COLORS.blue);
    this.sizeButton(retry, width / 2 - 110 * scale, 0, 190 * scale, 72 * scale, !this._loadingPayments && !this.isPending(), COLORS.blue); retry.caption.fontSize = 25 * scale;
    return y - 116 * scale;
  },
  renderProducts: function () {
    if (!this.view || this.view.ready === false || !this.geometry) return; var self = this, view = this.view, w = this.geometry.width, s = this.geometry.scale, offers = this.tab === "resources" ? Layout.resourceDisplayOrder(view.resources || []) : view[this.tab] || [];
    this.closeRelicDetails(); this._shopGeneration++; this._renderToken = view.token; this._renderTab = this.tab; this._renderPending = this.isPending(); this._renderPresentation = Layout.presentationSignature(view); this.refreshTimer = null;
    this.content.children.slice().forEach(function (item) { item.active = false; item.destroy(); }); var y = -8 * s;
    this.layoutCategories();
    var noticeShown = this.isPaymentPending() || ["bundles", "resources"].some(function (kind) { return (view[kind] || []).some(function (offer) { return offer.payment && (offer.payment.pending || offer.payment.code === "paymentLoading" || offer.payment.code === "accountMismatch"); }); }); this._relicConversionRows = this.tab === "relics" && offers.some(function (offer) { return offer.conversionGold > 0; });
    if (noticeShown) y = this.storeNotice(y, w, s);
    if (this.tab === "relics") {
      var tools = node(this.content, "RelicRefresh", w, 72 * s); tools.y = y - 36 * s; y -= 88 * s; var strip = this.icon(tools, { bundle: "resources", path: "icons/GUI-Pro/Buttons/Frame_BarFrame_Top01_Navy", sliced: true }, 100, "RefreshStrip"); fitSkin(strip, w, 72 * s);
      var title = this.text(tools, "RotationTitle", 36 * s, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 1.5 }); this.bind(title, "shop.relics.stock"); place(title.node, -w / 2 + 99 * s, 0, 178 * s, 48 * s); title.lineHeight = 44 * s;
      var clockDivider = node(tools, "StockDivider", 2 * s, 48 * s); clockDivider.x = -w / 2 + 201 * s; var clockLine = clockDivider.addComponent(cc.Graphics); clockLine.strokeColor = cc.color("#44caff"); clockLine.lineWidth = 2 * s; clockLine.moveTo(0, -24 * s); clockLine.lineTo(0, 24 * s); clockLine.stroke();
      var restockClock = self.icon(tools, { bundle: "resources", path: "icons/Pictograms/Pictoicon_Time" }, 40 * s, "RestockClock"); restockClock.x = -w / 2 + 229 * s;
      var counter = this.text(tools, "RefreshUses", 28 * s, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 1.5 }); this.bind(counter, "shop.relics.uses", [view.refresh.used, view.refresh.limit]); place(counter.node, w / 2 - 263 * s, 0, 72 * s, 40 * s);
      this.refreshTimer = this.text(tools, "RestockTimer", 30 * s, false, "#ffe13c", { fontRole: "display", fontFamily: null, outlineWidth: 1.5 }); this.bind(this.refreshTimer, "shop.relics.resets", [Layout.time(view.refresh.remainingSeconds)]); place(this.refreshTimer.node, -w / 2 + 337 * s, 0, 156 * s, 42 * s);
      this._restockTimer = Layout.time(view.refresh.remainingSeconds);
      var refresh = this.button(tools, "RefreshRelics", "shop.relics.refresh", function () { self.confirmRefresh(view); }, COLORS.blue), refreshCost = Layout.cost(view.refresh.cost);
      this.sizeButton(refresh, w / 2 - 116 * s, 0, 216 * s, 60 * s, view.refresh.enabled && !this.isPending(), COLORS.blue);
      this.bind(refresh.caption, view.refresh.used >= view.refresh.limit ? "shop.relics.limit" : refreshCost.amount ? "shop.relics.refreshPaid" : "shop.relics.refreshFree", [refreshCost.amount]);
      var refreshIcon = this.icon(refresh, { bundle: "resources", path: "icons/Pictograms/Pictoicon_Refresh" }, 32 * s); refreshIcon.x = -refresh.width / 2 + 23 * s;
      place(refresh.caption.node, 14 * s, 2 * s, refresh.width - 48 * s, 48 * s); refresh.caption.fontSize = 28 * s; refresh.caption.lineHeight = 34 * s;
    }
    var grid = this.tab === "relics" || this.tab === "resources", gap = 16 * s, rowGap = 24 * s, cell = (w - gap) / 2, currentRowHeight = 0;
    function productHeight(offer) { if (self.tab === "relics") return (self._relicConversionRows ? 304 : 280) * s; if (self.tab !== "resources") return (self.tab === "bundles" ? 620 : 336) * s; var supplied = (offer.rewards || [])[0]; return (supplied && supplied.id === 2033 ? 216 : supplied && supplied.id === 2002 ? 352 : 292) * s; }
    offers.forEach(function (offer, index) {
      var height = productHeight(offer), width = (grid ? cell : w) - 4 * s, chestGeometry = Layout.chestLayout(width, s);
      if (grid && index % 2 === 0) { if (index) y -= currentRowHeight + rowGap; currentRowHeight = Math.max(height, offers[index + 1] ? productHeight(offers[index + 1]) : height); }
      if (grid) height = currentRowHeight;
      var row = self.header(self.content, width, height, offer, s);
      row.setPosition(grid ? (index % 2 ? 1 : -1) * (cell + gap) / 2 : 0, y - height / 2);
      if (grid) {
        var displayed = offer, supplied = (offer.rewards || [])[0], energyItem = self.tab === "resources" && (offer.rewards || []).filter(function (reward) { return reward.id === 2033; })[0];
        var firstPurchase = !!offer.firstPurchaseAvailable;
        if (self.tab === "resources") {
          row.getChildByName("Header").active = false;
          var artDescriptor = offer.icon, goldIndex = ["gold-pouch", "gold-cart", "gold-vault", "gold-treasury"].indexOf(offer.id), gemIndex = ["gems-100", "gems-550", "gems-1200", "gems-2600", "gems-7000", "gems-15000"].indexOf(offer.id);
          if (supplied && supplied.id === 2001) artDescriptor = self.cardAsset("Icon_ShopIcon_Gold" + Math.max(0, goldIndex));
          if (supplied && supplied.id === 2002) artDescriptor = self.cardAsset(gemIndex === 5 ? "Icon_ShopIcon_GemBox" : "Icon_ShopIcon_Gem" + Math.max(0, gemIndex));
          displayed = Object.assign({}, offer, { icon: artDescriptor });
        }
        var imageY = self.tab === "relics" ? self._relicConversionRows ? 20 : 8 : energyItem ? 24 : supplied && supplied.id === 2002 ? firstPurchase ? 35 : 3 : offer.id === "gold-cart" ? 0 : -1;
        self.cardGlow(row, energyItem ? -78 * s : 0, imageY * s, 208 * s, row._cardTheme === "yellow" ? "#fcff69" : row._cardTheme === "purple" ? "#ff64ff" : "#c6fffa");
        if (self.tab === "relics") {
          self.relicVisual(row, displayed, 156 * s, "ProductImage").setPosition(0, imageY * s);
          var info = self.cardAction(row, "RelicInfo", "shop.contents.title", function () { if (offer.relicId) self.openRelicDetails(offer.relicId); }, width / 2 - 27 * s, height / 2 - 72 * s, 40 * s, 40 * s, true); info.caption.node.active = false; self.icon(info, self.cardAsset("Icon_ImageIcon_Info"), 40 * s, "InfoIcon");
        } else {
          var image = node(row, "ProductImage", (energyItem ? 180 : offer.id === "gold-cart" ? 192 : 176) * s, (energyItem ? 130 : supplied && supplied.id === 2002 ? firstPurchase ? 124 : 148 : offer.id === "gold-cart" ? 136 : 128) * s); image.setPosition(energyItem ? -78 * s : 0, imageY * s);
          if (energyItem) { var bottles = Math.min(3, Number(energyItem.num) || 1); for (var bottle = 0; bottle < bottles; bottle++) { var vial = node(image, "EnergyBottle_" + bottle, 130 * s, 130 * s); vial.setPosition((bottle - (bottles - 1) / 2) * 20 * s, 0); self.icon(vial, Object.assign(self.cardAsset("Icon_Potion01_Blue"), { fitWidth: 130 * s, fitHeight: 130 * s }), 130 * s, "Bottle"); self.icon(vial, self.asset("Icon_Energy_Yellow"), 40 * s, "EnergyEmblem").setPosition(-13 * s, -20 * s); } }
          else self.icon(image, Object.assign({}, displayed.icon, { fitWidth: image.width, fitHeight: image.height }), 176 * s, "Icon");
        }
        if (self.tab === "resources") {
          var quantity = self.text(row, "PackageQuantity", (energyItem ? 56 : 60) * s, false, row._cardTheme === "yellow" ? "#fdf5be" : row._cardTheme === "purple" ? "#ffadf9" : "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 3 * s, outlineColor: "#000000" });
          quantity.string = energyItem ? "×" + Layout.formatAmount(energyItem.num) : (offer.rewards || []).map(function (reward) { return Layout.formatAmount(reward.num); }).join(" + ");
          place(quantity.node, energyItem ? 94 * s : 0, energyItem ? 26 * s : height / 2 - 40 * s, (energyItem ? 130 : width / s - 28) * s, (energyItem ? 64 : 70) * s); quantity.lineHeight = (energyItem ? 64 : 68) * s;
          if (energyItem) { var energyTotal = self.text(row, "EnergyTotal", 26 * s, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 1.2 * s, outlineColor: "#000000" }); self.bind(energyTotal, "shop.resources.energyItems", [energyItem.num, energyItem.num * 20]); place(energyTotal.node, 94 * s, -27 * s, 150 * s, 32 * s); energyTotal.lineHeight = 31 * s; }
        }
        if (firstPurchase) {
          var first = node(row, "FirstPurchaseBonus", width - 16 * s, 48 * s); first.y = -height / 2 + row._footerHeight + 25 * s;
          var ribbon = self.icon(first, Object.assign(self.cardAsset("Label_LeftLabel02"), { sliced: true, referenceHeight: 86 }), 100, "PromotionRibbon"); fitSkin(ribbon, first.width, first.height);
          var firstCaption = self.text(first, "Caption", 34 * s, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 1.5 * s, outlineColor: "#000000" }); self.bind(firstCaption, "shop.payment.firstDouble"); place(firstCaption.node, 4 * s, 2 * s, first.width - 24 * s, 42 * s); firstCaption.lineHeight = 40 * s;
        }
        var priceHeight = self.tab === "relics" ? offer.conversionGold ? 54 : !self._relicConversionRows ? 60 : 76 : energyItem ? 60 : supplied && supplied.id === 2002 ? 96 : 72, priceY = self.tab === "relics" ? offer.conversionGold ? 28 : !self._relicConversionRows ? 33 : 42 : energyItem ? 32 : supplied && supplied.id === 2002 ? 48 : 38;
        self.costButton(row, offer, 0, -height / 2 + priceY * s, width - 12 * s, priceHeight * s, self.tab, view.token);
        if (offer.conversionGold) { var convert = self.text(row, "ConversionNote", 24 * s, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 1.2 * s, outlineColor: "#000000" }); self.bind(convert, "shop.relics.converts", [Layout.formatAmount(offer.conversionGold)]); place(convert.node, 0, -height / 2 + 70 * s, width - 18 * s, 28 * s); convert.lineHeight = 28 * s; }
      } else {
        self.cardGlow(row, self.tab === "bundles" ? 0 : chestGeometry.iconX, self.tab === "bundles" ? 114 * s : chestGeometry.iconY, (self.tab === "bundles" ? 232 : 172) * s, self.tab === "bundles" ? "#c7ff8f" : "#c6fffa");
        var art = node(row, "ProductImage", (self.tab === "bundles" ? 386 : 228) * s, (self.tab === "bundles" ? 224 : 188) * s); art.setPosition(self.tab === "bundles" ? 0 : chestGeometry.iconX, self.tab === "bundles" ? 114 * s : chestGeometry.iconY);
        if (self.tab === "bundles") { self.icon(art, self.cardAsset("Icon_Chest"), 268 * s, "FeaturedChest").setPosition(-36 * s, 0); self.icon(art, offer.heroIcon || offer.icon, 164 * s, "HeroOverlay").setPosition(110 * s, -12 * s); }
        else self.icon(art, offer.icon, 228 * s, "ChestArtwork");
        if (self.tab === "bundles" && offer.purchaseLimit) {
          var counter = self.text(row, "PurchaseCount", 36 * s, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 2 * s, outlineColor: "#000000" }); self.bind(counter, "shop.bundle.purchaseCount", [offer.purchaseCount || 0, offer.purchaseLimit]); counter.lineHeight = 44 * s; counter.horizontalAlign = cc.Label.HorizontalAlign.RIGHT;
          place(counter.node, width / 2 - 70 * s, height / 2 - 38 * s, 100 * s, 48 * s);
        }
        if (self.tab === "chests") { var possible = self.text(row, "TopPossibleRewards", 32 * s, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 1.5, outlineColor: "#000000" }); self.bind(possible, "shop.chests.possible"); place(possible.node, (chestGeometry.previewX[0] + chestGeometry.previewX[1]) / 2, 112 * s, width * .47, 42 * s); possible.lineHeight = 38 * s; }
        if (self.tab === "chests") {
          var bodyDivider = node(row, "BodyDivider", 3 * s, 180 * s); bodyDivider.setPosition(-width * .035, 12 * s); var bodyLine = bodyDivider.addComponent(cc.Graphics); bodyLine.strokeColor = cc.color("#4bd4ff"); bodyLine.lineWidth = 3 * s; bodyLine.moveTo(0, -90 * s); bodyLine.lineTo(0, 90 * s); bodyLine.stroke();
          var footerDivider = node(row, "FooterDivider", 3 * s, 56 * s); footerDivider.setPosition(-width * .115, -128 * s); var footerLine = footerDivider.addComponent(cc.Graphics); footerLine.strokeColor = cc.color("#4bd4ff"); footerLine.lineWidth = 3 * s; footerLine.moveTo(0, -28 * s); footerLine.lineTo(0, 28 * s); footerLine.stroke();
        }
        art.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); if (Layout.tap(event)) self.contents(offer, view.token); });
        var preview = (offer.highlights || offer.rewards || []).slice(0, self.tab === "bundles" ? 3 : 2), previewW = self.tab === "bundles" ? 168 * s : chestGeometry.previewWidth;
        preview.forEach(function (reward, at) { self.reward(row, reward, self.tab === "bundles" ? (at - 1) * width * .274 : chestGeometry.previewX[at], self.tab === "bundles" ? -86 * s : chestGeometry.previewY, previewW, self.tab === "bundles" ? 168 * s : chestGeometry.previewHeight, self.tab === "chests"); });
        var hint;
        if (self.tab === "bundles") {
          hint = self.cardAction(row, "FullContents", "shop.contents.tap", function () { self.contents(offer, view.token); }, 0, -192 * s, width - 64 * s, 44 * s, true); hint.caption.fontSize = 30 * s; hint.caption.lineHeight = 30 * s; hint.caption.overflow = cc.Label.Overflow.NONE;
          var contentsIcon = self.icon(hint, self.cardAsset("Icon_ImageIcon_Info"), 40 * s, "InfoIcon");
          function centerContents() { if (!cc.isValid(hint, true)) return; var combined = contentsIcon.width + 12 * s + hint.caption.node.width; contentsIcon.setPosition(-combined / 2 + contentsIcon.width / 2, 0); hint.caption.node.setPosition(combined / 2 - hint.caption.node.width / 2, 0); }
          hint.caption.node.on(cc.Node.EventType.SIZE_CHANGED, centerContents); contentsIcon.on(cc.Node.EventType.SIZE_CHANGED, centerContents); if (hint.caption._forceUpdateRenderData) hint.caption._forceUpdateRenderData(true); centerContents();
        }
        else { hint = self.button(row, "FullContents", "shop.contents.viewRewards", function () { self.contents(offer, view.token); }, COLORS.blue); self.sizeButton(hint, chestGeometry.hintX, chestGeometry.hintY, chestGeometry.hintWidth, chestGeometry.hintHeight, true, COLORS.blue); hint.caption.fontSize = 30 * s; hint.caption.lineHeight = 36 * s; }
        if (self.tab === "chests") {
          self.costButton(row, offer, chestGeometry.buyX, chestGeometry.buyY, chestGeometry.buyWidth, chestGeometry.buyHeight, self.tab, view.token);
          var open = self.button(row, "OpenOwned_" + offer.id, "shop.chests.openCount", function () { self.act("openChest", [offer.id], view.token); }, COLORS.blue);
          open._alwaysGray = true; self.bind(open.caption, "shop.chests.openCount", [offer.ownedCount || 0]); self.sizeButton(open, chestGeometry.openX, chestGeometry.openY, chestGeometry.openWidth, chestGeometry.openHeight, offer.ownedCount > 0 && !self.isPending(), COLORS.blue); open.caption.fontSize = 36 * s; open.caption.lineHeight = 44 * s;
        } else self.costButton(row, offer, 0, -height / 2 + 46 * s, width - 24 * s, 84 * s, self.tab, view.token);
      }
      if (!grid) y -= height + rowGap;
    });
    if (grid && offers.length) y -= currentRowHeight + rowGap;
    this.content.height = Math.max(this.geometry.listHeight, -y + 12 * s);
    this.scroll.stopAutoScroll(); this.scroll.scrollToOffset(cc.v2(0, Math.min(this._offsets[this.tab] || 0, Math.max(0, this.content.height - this.geometry.listHeight))), 0);
    if (!offers.length) { this.status.node.active = true; this.bind(this.status, "shop.empty"); }
  },
  closeModal: function () {
    if (!this.modal) return; var modal = this.modal; this.modal = null;
    if (modal._shopScrollCleanup) { modal._shopScrollCleanup(); modal._shopScrollCleanup = null; }
    modal.active = false; modal.destroy();
  },
  popupOrder: function (aboveModal) {
    var manager = require("UIMgr").UIMgr.getInstance(), ancestor = this.node, highest = 0;
    while (ancestor.parent && ancestor.parent !== manager.uiRoot) ancestor = ancestor.parent;
    if (ancestor.parent === manager.uiRoot && ancestor.activeInHierarchy) highest = Number(ancestor.zIndex) || 0;
    var top = manager.getUIById(Config.KinghtFallUIID.UITop);
    if (top && !top.isclose && cc.isValid(top.node, true) && top.node.activeInHierarchy) highest = Math.max(highest, Number(top.node.zIndex) || 0);
    if (aboveModal && this.modal && cc.isValid(this.modal, true) && this.modal.activeInHierarchy) highest = Math.max(highest, this.modal.zIndex);
    // Shop popups cover the lobby and its HUD, while Settings, recovery,
    // guidance and the manager's input blocker retain their higher layers.
    return Math.min(require("Appcfg").OrderLayer.pop2 - 1, highest + 1);
  },
  modalShell: function (titleKey, name, requestedHeight) {
    this.closeModal(); var self = this, bounds = this.bounds(), width = 660, height = requestedHeight || 820;
    var host = require("UIMgr").UIMgr.getInstance().uiRoot;
    var lower = host.convertToNodeSpaceAR(this.node.convertToWorldSpaceAR(cc.v2(bounds.left, bounds.bottom))), upper = host.convertToNodeSpaceAR(this.node.convertToWorldSpaceAR(cc.v2(bounds.right, bounds.top)));
    var hostWidth = Math.abs(upper.x - lower.x), hostHeight = Math.abs(upper.y - lower.y);
    // Author one readable layout and fit the entire panel to the safe area.
    // Selectively reducing its height used to push chest notes into the pool.
    var scale = Math.min(1, Math.max(1, hostWidth - 48) / width, Math.max(1, hostHeight - 48) / height);
    var root = this.modal = node(host, "ShopModal", hostWidth, hostHeight); root.setPosition((lower.x + upper.x) / 2, (lower.y + upper.y) / 2); root.zIndex = this.popupOrder(); root.addComponent(cc.BlockInputEvents);
    var shade = node(root, "Shade", root.width, root.height); round(shade, cc.color(0, 0, 0, 185), false);
    var panel = node(root, "Panel", width, height); panel.setScale(scale); cardSurface(panel, true); var band = node(panel, "Header", width - 12, 78); band.y = height / 2 - 43; round(band, COLORS.header, false);
    var title = this.text(band, "Title", 38, false, "#ffffff", { fontRole: "display", fontFamily: null, outlineWidth: 1.2 }); place(title.node, -38, 0, width - 146, 64); if (name) this.named(title, name); else this.bind(title, titleKey);
    var close = this.button(band, "Close", "shop.close", function () { self.closeModal(); }, COLORS.header); this.sizeButton(close, width / 2 - 50, 0, 88, 72, true, COLORS.header);
    close.caption._shopTypography.isBold = false; close.caption.node.color = cc.color("#ffffff"); close.caption.string = "×"; close.caption.fontSize = 42; close.caption.lineHeight = 48;
    return { root: root, panel: panel, width: width, height: height, scale: scale };
  },
  contents: function (offer) {
    var modal = this.modalShell("shop.contents.title", offer), self = this, possible = offer.possibleRewards || [], rewards = offer.rewards || [];
    var intro = this.text(modal.panel, "Introduction", 24, false);
    if (possible.length && offer.guaranteedDraws) {
      var floors = offer.guaranteedDraws.map(function (floor) { return self._language.t(RARITY_KEYS[floor.quality] || "shop.contents.noFloor") + " ×" + floor.count; }).join(" + ");
      this.bind(intro, "shop.contents.drawSummary", [offer.draws, offer.randomDraws, floors || this._language.t("shop.contents.noFloor")]);
    } else this.bind(intro, possible.length ? "shop.contents.possible" : "shop.contents.all");
    intro.enableWrapText = true; place(intro.node, 0, modal.height / 2 - (possible.length ? 134 : 116), modal.width - 36, possible.length ? 78 : 42);
    if (possible.length) {
      var bonus = this.text(modal.panel, "RuneBonus", 24, false); bonus.enableWrapText = true;
      this.bind(bonus, "shop.contents.runeBonus", [Layout.percent(offer.extraCopyChance)]);
      place(bonus.node, 0, modal.height / 2 - 231, modal.width - 36, 88);
    }
    var listTop = modal.height / 2 - (possible.length ? 293 : 155), listBottom = -modal.height / 2 + 44;
    var scrollNode = node(modal.panel, "ContentsScroll", modal.width - 36, listTop - listBottom); scrollNode.y = (listTop + listBottom) / 2;
    var viewport = node(scrollNode, "Viewport", scrollNode.width, scrollNode.height); viewport.addComponent(cc.Mask).type = cc.Mask.Type.RECT;
    var content = node(viewport, "Content", scrollNode.width); content.anchorY = 1; content.y = scrollNode.height / 2;
    var scroll = scrollNode.addComponent(cc.ScrollView); scroll.content = content; scroll.vertical = true; scroll.horizontal = false; scroll.cancelInnerEvents = true; scroll.brake = .45;
    var entries = rewards.map(function (reward) { return { reward: reward, possible: false }; }).concat(possible.map(function (reward) { return { reward: reward, possible: true }; }));
    entries.forEach(function (entry, index) {
      var reward = entry.reward, row = node(content, "ContentsReward_" + index, content.width, 112); row.y = -64 - index * 124; round(row, "#f3e8d2", "#c5ab7d", 12);
      self.relicVisual(row, reward, 86, "RewardIcon").x = -row.width / 2 + 57;
      var label = self.text(row, "Reward", 28, false), name = self.T(reward.nameKey || reward.name || reward.fallbackName || String(reward.id));
      if (entry.possible) {
        var odds = Number(reward.chance === undefined ? reward.probability : reward.chance), rarity = self._language.t(RARITY_KEYS[reward.quality] || "shop.contents.noFloor");
        if (reward.guaranteedDraws > 0) {
          self.bind(label, offer.randomDraws > 0 ? "shop.contents.chanceAndFloor" : "shop.contents.floorChance", offer.randomDraws > 0 ? [name, Layout.percent(odds), rarity, Layout.percent(reward.guaranteedChance)] : [name, rarity, Layout.percent(reward.guaranteedChance)]);
        } else self.bind(label, isFinite(odds) ? "shop.contents.randomChance" : "shop.contents.random", [name, isFinite(odds) ? Layout.percent(odds) : ""]);
      }
      else {
        label.string = name;
        var amount = self.text(row, "Quantity", 30, true); amount.string = "×" + Layout.formatAmount(reward.num); amount.horizontalAlign = cc.Label.HorizontalAlign.RIGHT;
        place(amount.node, row.width / 2 - 76, 0, 116, 84);
      }
      var left = -row.width / 2 + 116, right = row.width / 2 - (entry.possible ? 18 : 150);
      place(label.node, (left + right) / 2, 0, right - left, 88); label.enableWrapText = true; label.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
      self.bindInspection(row, reward);
    }); content.height = Math.max(scrollNode.height, entries.length * 124 + 16);
    var cue = node(modal.panel, "ScrollCue", modal.width - 56, 32); cue.y = -modal.height / 2 + 22;
    var cueCaption = this.text(cue, "MoreRewards", 24, true, COLORS.ink); this.bind(cueCaption, "shop.contents.more"); place(cueCaption.node, 0, 0, cue.width, cue.height);
    function updateCue() {
      if (!cc.isValid(cue, true)) return;
      var maximum = Math.max(0, content.height - scrollNode.height);
      cue.active = maximum > 1 && maximum - scroll.getScrollOffset().y > 1;
    }
    // Creator 2.4's EventType values identify serialized component handlers;
    // the ScrollView node itself emits these string event names.
    var scrollEvents = ["scrolling", "scroll-ended"];
    scrollEvents.forEach(function (event) { scrollNode.on(event, updateCue, self); });
    modal.root._shopScrollCleanup = function () {
      scrollEvents.forEach(function (event) { scrollNode.off(event, updateCue, self); }); cue.active = false;
    };
    updateCue();
  },
  chestContents: function (id) {
    var chest = this.view && (this.view.chests || []).filter(function (offer) { return offer.id === id; })[0];
    if (chest) this.contents(chest);
  },
  confirm: function (key, params, action, conversion, conversionKey) {
    var modal = this.modalShell("shop.confirm.title", null, conversion ? 570 : 450), self = this, description = this.text(modal.panel, "Message", 29, false);
    var buttonsY = -modal.height / 2 + 72, bodyTop = modal.height / 2 - 98, bodyBottom = buttonsY + 42 + 24;
    if (conversion) { var note = this.text(modal.panel, "Conversion", 24, false); note.enableWrapText = true; this.bind(note, conversionKey || "shop.relics.convertConfirm", [Layout.formatAmount(conversion)]); place(note.node, 0, bodyBottom + 45, modal.width - 60, 90); bodyBottom += 106; }
    description.enableWrapText = true; this.bind(description, key, params); place(description.node, 0, (bodyTop + bodyBottom) / 2, modal.width - 60, bodyTop - bodyBottom);
    var cancel = this.button(modal.panel, "Cancel", "shop.cancel", function () { self.closeModal(); }, COLORS.blue), yes = this.button(modal.panel, "Confirm", "shop.confirm", function () { self.closeModal(); action(); });
    this.sizeButton(cancel, -modal.width / 4, buttonsY, modal.width / 2 - 40, 84, true, COLORS.blue); this.sizeButton(yes, modal.width / 4, buttonsY, modal.width / 2 - 40, 84, true);
  },
  buy: function (kind, offer, token) {
    if (this.isPending()) return;
    if (offer.payment) {
      if (!this.isPaymentPending() && offer.available !== false && offer.payment.available && offer.payment.formattedPrice && !offer.soldOut) {
        var owner = this, checkout = function () { return owner.act("purchase", [kind, offer.id], token); };
        if (offer.conversionGold > 0) return this.confirm("shop.confirm.money", [this.T(offer.nameKey || offer.name || offer.fallbackName || ""), offer.payment.formattedPrice], checkout, offer.conversionGold, "shop.bundle.convertConfirm");
        return checkout();
      }
      return;
    }
    var self = this, cost = Layout.cost(offer.cost), action = function () { self.act("purchase", [kind, offer.id], token); };
    this.confirm(cost.currency === 2002 ? "shop.confirm.gems" : "shop.confirm.gold", [this.T(offer.nameKey || offer.name || offer.fallbackName || ""), Layout.formatAmount(cost.amount)], action, offer.conversionGold);
  },
  confirmRefresh: function (view) {
    var self = this, cost = Layout.cost(view.refresh.cost), action = function () { self.act("refreshRelics", null, view.token); };
    if (cost.amount > 0) this.confirm("shop.confirm.refresh", [cost.amount], action); else action();
  },
  act: function (method, args, token) {
    if (this.isPending() || !this.node.activeInHierarchy) return; this._acting = true;
    var self = this, generation = this._visibilityGeneration;
    function finish(result) {
      self._acting = false;
      if (self.isDestroy || !cc.isValid(self, true) || generation !== self._visibilityGeneration || !self.node.activeInHierarchy) return result;
      self._renderToken = null; self.refresh();
      if (!result || !result.ok) self.feedback("shop.error." + (result && result.code || "unavailable"), "shop.error.unavailable", result && result.error);
      else self.feedback(method === "refreshRelics" ? "shop.relics.refreshed" : "shop.success");
      return result;
    }
    try {
      var result = args ? this.service[method].apply(this.service, args.concat([token])) : this.service[method](token);
      if (result && typeof result.then === "function") {
        this.refresh(); return Promise.resolve(result).then(finish, function () { return finish({ ok: false, code: "paymentFailed" }); });
      }
      return finish(result);
    } catch (_) { return finish({ ok: false, code: "unavailable" }); }
  },
  feedback: function (key, fallback, raw) {
    this._feedbackActive = true; this.status.node.active = true; var text = this._language.t(key);
    if (text === key && raw) this.status.string = raw; else this.bind(this.status, text === key && fallback ? fallback : key);
    this.status.node.y = this.geometry.listBottom + 28; this.status.node.setContentSize(this.geometry.width - 24, 45); this.status.node.zIndex = 100;
    this.unschedule(this.hideFeedback); this.scheduleOnce(this.hideFeedback, 2.5);
  },
  hideFeedback: function () { this._feedbackActive = false; if (this.status && this.view && this.view.ready !== false) this.status.node.active = false; }
});
exports.default = Shop;
