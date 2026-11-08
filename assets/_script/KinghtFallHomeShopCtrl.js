"use strict";
var Base = require("BaseCtrl").default, Layout = require("ShopViewCore"), Language = require("LanguageMgr").LanguageMgr;
var Config = require("KinghtFallConfig"), Player = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr, Data = require("KinghtFallDataMgr").KinghtFallDataMgr;
var TABS = ["bundles", "chests", "relics", "resources"], COLORS = { cream: "#fff5dc", ink: "#242632", header: "#424c60", blue: "#12c4ef", gold: "#ffdb3c" };
var RARITY_KEYS = { 1: "shop.rarity.1", 2: "shop.rarity.2", 3: "shop.rarity.3", 4: "shop.rarity.4" };
function node(parent, name, width, height) { var item = new cc.Node(name); item.parent = parent; item.setContentSize(width || 0, height || 0); return item; }
function round(item, fill, stroke, radius) {
  var g = item.getComponent(cc.Graphics) || item.addComponent(cc.Graphics); g.clear(); g.fillColor = cc.color(fill); g.strokeColor = cc.color(stroke || COLORS.ink); g.lineWidth = 3;
  g.roundRect(-item.width / 2, -item.height / 2, item.width, item.height, radius || 16); g.fill(); if (stroke !== false) g.stroke();
}
function place(item, x, y, width, height) { item.setPosition(x, y); if (width !== undefined) item.setContentSize(width, height); }
var Shop = cc.Class({
  extends: Base,
  onLoad: function () {
    this._shopGeneration = 0; this._visibilityGeneration = 0; this._iconCache = Object.create(null); this._iconPending = Object.create(null); this._offsets = Object.create(null); this.tab = "bundles";
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
    this.unschedule(this.tick); if (this._language) this._language.offChange(this.languageChanged, this);
    this.unschedule(this.hideFeedback); this._feedbackActive = false; this.rememberOffset(); this.closeModal(); this._shopGeneration++; this._visibilityGeneration++;
  },
  onDestroy: function () {
    this.unschedule(this.tick); this.unschedule(this.hideFeedback); if (this._language) this._language.offChange(this.languageChanged, this);
    this.closeModal(); this._shopGeneration++; this._visibilityGeneration++; this.node.off(cc.Node.EventType.SIZE_CHANGED, this.relayout, this);
    Base.prototype.onDestroy.call(this);
  },
  text: function (parent, name, size, display, color) {
    var item = node(parent, name), label = item.addComponent(cc.Label); item.color = cc.color(color || (display ? "#ffffff" : "#554632"));
    label.fontFamily = "Arial"; label.useSystemFont = true; label._localizedFontRole = display ? "display" : "body";
    label.fontSize = size; label.lineHeight = Math.ceil(size * 1.2); label.enableWrapText = false; label.overflow = cc.Label.Overflow.SHRINK;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER; label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    if (display) { var outline = item.addComponent(cc.LabelOutline); outline.color = cc.Color.BLACK; outline.width = 2; }
    return label;
  },
  bind: function (label, key, params) { this._language.bindLabel(label, key, params); },
  named: function (label, offer) { if (offer.nameKey) this.bind(label, offer.nameKey); else label.string = this.T(offer.name || offer.fallbackName || ""); },
  button: function (parent, name, key, handler, fill) {
    var self = this, item = node(parent, name, 180, 60); round(item, fill || COLORS.gold); item._enabled = true;
    var button = item.addComponent(cc.Button); button.transition = cc.Button.Transition.SCALE;
    item.caption = this.text(item, "Caption", 29, true); this.bind(item.caption, key);
    item.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); if (item._enabled && cc.isValid(item, true) && item.activeInHierarchy && Layout.tap(event) && self.node.activeInHierarchy) handler(); }, this);
    return item;
  },
  sizeButton: function (item, x, y, width, height, enabled, fill) {
    place(item, x, y, width, height); item._enabled = enabled !== false; item.getComponent(cc.Button).interactable = item._enabled;
    round(item, item._enabled ? fill || COLORS.gold : "#7e8899"); place(item.caption.node, 0, 0, width - 16, height - 8);
  },
  icon: function (parent, descriptor, size, name, persistent) {
    var self = this, item = node(parent, name || "Icon", size, size), sprite = item.addComponent(cc.Sprite); sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    if (!descriptor) return item;
    if (typeof descriptor === "string") descriptor = { bundle: "resources", path: descriptor };
    var bundle = descriptor.bundle || "resources", path = descriptor.path, key = bundle + "/" + path, generation = this._shopGeneration;
    if (!path) return item;
    function assign(frame) {
      if (!frame || self.isDestroy || !persistent && generation !== self._shopGeneration || !cc.isValid(item, true)) return;
      sprite.spriteFrame = frame; var original = frame.getOriginalSize(), factor = Math.min(size / original.width, size / original.height); item.setContentSize(original.width * factor, original.height * factor);
    }
    if (this._iconCache[key]) assign(this._iconCache[key]);
    else if (this._iconPending[key]) this._iconPending[key].push(assign);
    else { this._iconPending[key] = [assign]; this.loadSpriteFrame(bundle, path, function (frame) { if (frame) self._iconCache[key] = frame; var callbacks = self._iconPending[key] || []; delete self._iconPending[key]; callbacks.forEach(function (callback) { callback(frame); }); }); }
    return item;
  },
  asset: function (name) { return { bundle: "resources", path: "icons/GUI-Pro/Icons/" + name }; },
  currencyIcon: function (currency) { return this.asset(Number(currency) === 2002 ? "Icon_Gems" : "Icon_Gold"); },
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
    this.titleRoot = node(this.surface, "TitleRibbon"); this.titleRoot.addComponent(cc.Graphics); this.title = this.text(this.titleRoot, "Title", 60, true); this.bind(this.title, "shop.title");
    this.tabRoot = node(this.surface, "Categories"); this.tabButtons = TABS.map(function (id) { return self.button(self.tabRoot, "Tab_" + id, "shop.tab." + id, function () { self.selectTab(id); }); });
    this.daily = node(this.surface, "DailyDeal"); this.daily.addComponent(cc.Graphics);
    this.dailyIcon = this.icon(this.daily, this.asset("Icon_Gift"), 100, "Gift", true); this.dailyTitle = this.text(this.daily, "DailyTitle", 33, true); this.bind(this.dailyTitle, "shop.daily.title");
    this.dailyReward = this.text(this.daily, "DailyReward", 27, false); this.bind(this.dailyReward, "shop.daily.reward"); this.dailyTimer = this.text(this.daily, "DailyTimer", 23, false);
    this.dailyClaim = this.button(this.daily, "ClaimDaily", "shop.daily.claim", function () { var view = self.view; if (view && view.ready !== false && view.dailyDeal && !view.dailyDeal.claimed) self.act("claimDaily", null, view.token); }, COLORS.blue);
    this.scrollNode = node(this.surface, "Products"); this.scrollNode.addComponent(cc.BlockInputEvents);
    this.viewport = node(this.scrollNode, "Viewport"); this.viewport.addComponent(cc.Mask).type = cc.Mask.Type.RECT;
    this.content = node(this.viewport, "Content"); this.content.anchorY = 1;
    this.scroll = this.scrollNode.addComponent(cc.ScrollView); this.scroll.content = this.content; this.scroll.horizontal = false; this.scroll.vertical = true; this.scroll.inertia = true; this.scroll.brake = .45; this.scroll.cancelInnerEvents = true;
    this.status = this.text(this.surface, "Status", 25, false); this.status.node.active = false;
  },
  bounds: function () {
    var origin = cc.view.getVisibleOrigin(), size = cc.view.getVisibleSize(), safe = cc.sys.getSafeAreaRect ? cc.sys.getSafeAreaRect() : { x: origin.x, y: origin.y, width: size.width, height: size.height };
    var a = this.node.convertToNodeSpaceAR(cc.v2(Math.max(origin.x, safe.x), Math.max(origin.y, safe.y))), b = this.node.convertToNodeSpaceAR(cc.v2(Math.min(origin.x + size.width, safe.x + safe.width), Math.min(origin.y + size.height, safe.y + safe.height)));
    return { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), bottom: Math.min(a.y, b.y), top: Math.max(a.y, b.y) };
  },
  relayout: function () {
    if (!this.surface) return; var geometry = Layout.layout(this.bounds()), signature = JSON.stringify(geometry);
    if (this._geometrySignature === signature) return; this.rememberOffset(); this._geometrySignature = signature; this.geometry = geometry;
    var w = geometry.width, s = geometry.scale; this.surface.x = geometry.center;
    place(this.titleRoot, 0, geometry.title, Math.min(w - 50 * s, 610 * s), 90 * s);
    var g = this.titleRoot.getComponent(cc.Graphics), tw = this.titleRoot.width, th = this.titleRoot.height; g.clear(); g.fillColor = cc.color("#ffcc00"); g.strokeColor = cc.color(COLORS.ink); g.lineWidth = 3;
    [-1, 1].forEach(function (direction) { g.moveTo(direction * (tw / 2 - 12 * s), th / 2 - 12 * s); g.lineTo(direction * (tw / 2 + 28 * s), th / 2 - 8 * s); g.lineTo(direction * (tw / 2 + 18 * s), -4 * s); g.lineTo(direction * (tw / 2 + 28 * s), -th / 2 - 8 * s); g.lineTo(direction * (tw / 2 - 12 * s), -th / 2); g.close(); g.fill(); g.stroke(); });
    g.roundRect(-tw / 2, -th / 2, tw, th, 10 * s); g.fill(); g.stroke(); place(this.title.node, 0, 0, tw - 40 * s, th - 8 * s);
    place(this.tabRoot, 0, geometry.tabs); var gap = 8 * s, tabWidth = (w - gap * 3) / 4;
    this.tabButtons.forEach(function (item, index) { this.sizeButton(item, -w / 2 + tabWidth / 2 + index * (tabWidth + gap), 0, tabWidth, 62 * s, true, this.tab === TABS[index] ? COLORS.blue : COLORS.cream); }, this);
    place(this.daily, 0, geometry.daily, w, 158 * s); round(this.daily, COLORS.cream);
    this.dailyIcon.setPosition(-w / 2 + 68 * s, 10 * s); this.dailyIcon.setScale(s);
    place(this.dailyTitle.node, -w / 2 + 280 * s, 39 * s, 290 * s, 45 * s); place(this.dailyReward.node, -w / 2 + 280 * s, -3 * s, 290 * s, 36 * s);
    place(this.dailyTimer.node, 0, -54 * s, w - 35 * s, 28 * s); this.sizeButton(this.dailyClaim, w / 2 - 124 * s, 12 * s, 218 * s, 65 * s, !!this.view && this.view.ready !== false && !!this.view.dailyDeal && !this.view.dailyDeal.claimed && !this.isPending(), COLORS.blue);
    place(this.scrollNode, 0, geometry.listY, w, geometry.listHeight); place(this.viewport, 0, 0, w, geometry.listHeight); this.content.setPosition(0, geometry.listHeight / 2); this.content.width = w;
    place(this.status.node, 0, geometry.listY, w - 24 * s, 120 * s); this.closeModal(); this._renderToken = null; if (this.view) this.renderProducts();
  },
  rememberOffset: function () { if (this.scroll && this.tab && this._renderTab === this.tab) this._offsets[this.tab] = Math.max(0, this.scroll.getScrollOffset().y); },
  selectTab: function (id) {
    if (this.tab === id || TABS.indexOf(id) < 0) return; this.rememberOffset(); this.closeModal(); this.tab = id;
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
    if (!view || view.ready === false) { this.status.node.active = true; this.bind(this.status, "shop.unavailable"); this.scrollNode.active = false; this.dailyClaim._enabled = false; return; }
    this.scrollNode.active = true; this.status.node.active = !!this._feedbackActive;
    var pending = this.isPending(), dailyState = String(view.dailyDeal.claimed) + ":" + pending;
    if (this._dailyState !== dailyState) {
      this._dailyState = dailyState; this.bind(this.dailyClaim.caption, view.dailyDeal.claimed ? "shop.daily.claimed" : "shop.daily.claim");
      this.sizeButton(this.dailyClaim, this.dailyClaim.x, this.dailyClaim.y, this.dailyClaim.width, this.dailyClaim.height, !view.dailyDeal.claimed && !pending, COLORS.blue);
    }
    var timer = view.dailyDeal.claimed ? Layout.time(view.dailyDeal.remainingSeconds) : "once";
    if (this._dailyTimer !== timer) { this._dailyTimer = timer; this.bind(this.dailyTimer, view.dailyDeal.claimed ? "shop.daily.resets" : "shop.daily.once", view.dailyDeal.claimed ? [timer] : undefined); }
    if (this.view.refresh && this.refreshTimer) { var restock = Layout.time(view.refresh.remainingSeconds); if (this._restockTimer !== restock) { this._restockTimer = restock; this.bind(this.refreshTimer, "shop.relics.resets", [restock]); } }
    if (this._renderToken !== view.token || this._renderTab !== this.tab || this._renderPending !== pending || this._renderPresentation !== Layout.presentationSignature(view)) { this.rememberOffset(); this.renderProducts(); }
  },
  header: function (parent, width, height, offer, tint) {
    var row = node(parent, "Offer_" + offer.id, width, height); round(row, COLORS.cream);
    var band = node(row, "Header", width - 6, 58); band.y = height / 2 - 31; round(band, tint || COLORS.header, false, 12);
    var title = this.text(band, "Name", 31, true); place(title.node, 0, 0, width - 28, 50); this.named(title, offer); return row;
  },
  reward: function (parent, reward, x, y, width, height, possible) {
    var card = node(parent, "Reward_" + reward.id, width, height); card.setPosition(x, y); round(card, "#ffedc9", "#ac8656", 12);
    var icon = this.icon(card, reward.icon, Math.min(66, height - 31), "RewardIcon"); icon.y = 12;
    var amount = this.text(card, "Quantity", 28, true); place(amount.node, 0, -height / 2 + 22, width - 12, 36);
    if (possible) { amount.fontSize = 19; this.named(amount, reward); } else amount.string = "×" + Number(reward.num).toLocaleString();
    if (reward.chestId) {
      var self = this;
      card.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); if (Layout.tap(event)) self.chestContents(reward.chestId); });
    }
    return card;
  },
  costButton: function (parent, offer, x, y, width, height, kind, token) {
    var self = this, button = this.button(parent, "Buy_" + offer.id, offer.soldOut ? "shop.soldOut" : "shop.buy", function () { self.buy(kind, offer, token); });
    var unit = Math.min(1, height / 65);
    var payment = offer.payment, pending = this.isPending() || payment && (this.isPaymentPending() || payment.pending);
    var available = offer.available !== false && !offer.soldOut && !pending && (!payment || payment.available && !!payment.formattedPrice);
    this.sizeButton(button, x, y, width, height, available);
    if (payment) {
      if (offer.soldOut) return button;
      if (available) button.caption.string = payment.formattedPrice;
      else {
        this.bind(button.caption, pending ? "shop.payment.pending" : "shop.payment.unavailable"); button.caption.fontSize = 21 * unit; button.caption.lineHeight = 25 * unit; place(button.caption.node, 0, -15 * unit, width - 16 * unit, 25 * unit);
        var price = this.text(button, "ReferencePrice", 20 * unit, false, "#ffffff");
        if (payment.formattedPrice) price.string = payment.formattedPrice;
        else this.bind(price, "shop.payment.referencePrice", [Layout.referencePrice(payment)]);
        place(price.node, 0, 16 * unit, width - 12 * unit, 25 * unit);
      }
    } else if (!offer.soldOut) {
      var cost = Layout.cost(offer.cost); button.caption.string = cost.amount.toLocaleString(); place(button.caption.node, 20 * unit, 0, width - 65 * unit, height - 8 * unit);
      var icon = this.icon(button, this.currencyIcon(cost.currency), 37 * unit); icon.setPosition(-Math.min(width / 2 - 30 * unit, 52 * unit), 0);
    }
    return button;
  },
  renderProducts: function () {
    if (!this.view || this.view.ready === false || !this.geometry) return; var self = this, view = this.view, w = this.geometry.width, s = this.geometry.scale, offers = view[this.tab] || [];
    this._shopGeneration++; this._renderToken = view.token; this._renderTab = this.tab; this._renderPending = this.isPending(); this._renderPresentation = Layout.presentationSignature(view); this.refreshTimer = null;
    this.content.children.slice().forEach(function (item) { item.active = false; item.destroy(); }); var y = -8 * s;
    this.tabButtons.forEach(function (item, i) { self.sizeButton(item, item.x, item.y, item.width, item.height, true, TABS[i] === self.tab ? COLORS.blue : COLORS.cream); });
    if (this.isPaymentPending() || offers.some(function (offer) { return offer.payment && !offer.payment.available && !offer.soldOut; })) {
      var notice = node(this.content, "StoreNotice", w, 82 * s); notice.y = y - 41 * s; y -= 94 * s; round(notice, COLORS.cream);
      var noticeText = this.text(notice, "Reason", 23, false); noticeText.enableWrapText = true;
      this.bind(noticeText, this.isPaymentPending() ? "shop.payment.pendingReason" : "shop.payment.unavailableReason"); place(noticeText.node, -96 * s, 0, w - 220 * s, 70 * s);
      var restore = this.button(notice, "RestorePurchases", "shop.payment.retry", function () { self.preparePayments(); }, COLORS.blue);
      this.sizeButton(restore, w / 2 - 98 * s, 0, 174 * s, 56 * s, !this._loadingPayments && !this.isPending(), COLORS.blue);
    }
    if (this.tab === "relics") {
      var tools = node(this.content, "RelicRefresh", w, 126 * s); tools.y = y - 63 * s; y -= 136 * s; round(tools, COLORS.cream);
      var title = this.text(tools, "RotationTitle", 29, true); this.bind(title, "shop.relics.stock"); place(title.node, -w / 4, 30 * s, w / 2 - 20 * s, 42 * s);
      var counter = this.text(tools, "RefreshUses", 23, false); this.bind(counter, "shop.relics.uses", [view.refresh.used, view.refresh.limit]); place(counter.node, -w / 4, -4 * s, w / 2 - 20 * s, 34 * s);
      this.refreshTimer = this.text(tools, "RestockTimer", 20, false); this.bind(this.refreshTimer, "shop.relics.resets", [Layout.time(view.refresh.remainingSeconds)]); place(this.refreshTimer.node, -w / 4, -39 * s, w / 2 - 18 * s, 28 * s);
      this._restockTimer = Layout.time(view.refresh.remainingSeconds);
      var refresh = this.button(tools, "RefreshRelics", "shop.relics.refresh", function () { self.confirmRefresh(view); }, COLORS.blue), refreshCost = Layout.cost(view.refresh.cost);
      this.sizeButton(refresh, w / 4, 6 * s, w / 2 - 30 * s, 74 * s, view.refresh.enabled && !this.isPending(), COLORS.blue);
      this.bind(refresh.caption, view.refresh.used >= view.refresh.limit ? "shop.relics.limit" : refreshCost.amount ? "shop.relics.refreshPaid" : "shop.relics.refreshFree", [refreshCost.amount]);
      var refreshIcon = this.icon(refresh, { bundle: "resources", path: "icons/Pictograms/Pictoicon_Refresh" }, 34 * s); refreshIcon.x = -refresh.width / 2 + 29 * s;
      place(refresh.caption.node, 17 * s, 0, refresh.width - 62 * s, refresh.height - 8 * s);
    }
    var grid = this.tab === "relics" || this.tab === "resources", gap = 12 * s, cell = (w - gap) / 2;
    offers.forEach(function (offer, index) {
      var height = (grid ? self.tab === "resources" ? 350 : 284 : self.tab === "bundles" ? 414 : 330) * s, width = grid ? cell : w;
      if (grid && index % 2 === 0 && index) y -= height + gap;
      var row = self.header(self.content, width, height, offer, offer.quality === 1 ? "#bd6b20" : offer.quality === 3 ? "#2868a0" : offer.quality === 4 ? "#42834e" : COLORS.header);
      row.setPosition(grid ? (index % 2 ? 1 : -1) * (cell + gap) / 2 : 0, y - height / 2);
      if (grid) {
        self.icon(row, offer.icon, (self.tab === "resources" || offer.conversionGold ? 112 : 128) * s).setPosition(0, (self.tab === "resources" || offer.conversionGold ? 23 : 15) * s);
        if (offer.firstPurchaseAvailable) {
          var first = node(row, "FirstPurchaseBonus", width - 28 * s, 30 * s); first.y = height / 2 - 78 * s; round(first, "#ffd53b", "#ac7527", 8);
          var firstCaption = self.text(first, "Caption", 21, true); self.bind(firstCaption, "shop.payment.firstDouble"); place(firstCaption.node, 0, 0, first.width - 12 * s, first.height - 4 * s);
        }
        if (self.tab === "resources") {
          var quantity = self.text(row, "PackageQuantity", 27, true), amounts = (offer.rewards || []).map(function (reward) { return Number(reward.num).toLocaleString(); });
          var energyItem = (offer.rewards || []).filter(function (reward) { return reward.id === 2033; })[0];
          if (energyItem) self.bind(quantity, "shop.resources.energyItems", [energyItem.num, energyItem.num * 20]);
          else quantity.string = amounts.join(" + ");
          place(quantity.node, 0, -50 * s, width - 28 * s, 28 * s);
        }
        self.costButton(row, offer, 0, -height / 2 + 48 * s, width - 30 * s, 64 * s, self.tab, view.token);
        if (offer.soldOut) { var sold = self.text(row, "SoldOutOverlay", 31, true); self.bind(sold, "shop.soldOut"); place(sold.node, 0, 8 * s, width - 24 * s, 50 * s); }
        if (offer.conversionGold) { var convert = self.text(row, "ConversionNote", 17, false); self.bind(convert, "shop.relics.converts", [offer.conversionGold]); place(convert.node, 0, -48 * s, width - 18 * s, 22 * s); }
      } else {
        var art = self.icon(row, offer.icon, (self.tab === "bundles" ? 133 : 126) * s, "ProductImage"); art.setPosition(self.tab === "bundles" ? 0 : -w / 2 + 92 * s, self.tab === "bundles" ? 70 * s : 18 * s);
        if (self.tab === "bundles" && offer.purchaseLimit) {
          var counter = self.text(row, "PurchaseCount", 25, true); self.bind(counter, "shop.bundle.purchaseCount", [offer.purchaseCount || 0, offer.purchaseLimit]);
          place(counter.node, w / 2 - 72 * s, height / 2 - 88 * s, 120 * s, 40 * s);
        }
        if (self.tab === "chests") { var possible = self.text(row, "TopPossibleRewards", 21, false); self.bind(possible, "shop.chests.possible"); place(possible.node, 90 * s, 87 * s, w - 210 * s, 28 * s); }
        art.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); if (Layout.tap(event)) self.contents(offer, view.token); });
        var preview = (offer.highlights || offer.rewards || []).slice(0, self.tab === "bundles" ? 3 : 2), previewW = self.tab === "bundles" ? (w - 60 * s) / 3 : (w - 224 * s) / 2;
        preview.forEach(function (reward, at) { self.reward(row, reward, self.tab === "bundles" ? (at - 1) * (previewW + 6 * s) : -w / 2 + 206 * s + previewW / 2 + at * (previewW + 6 * s), self.tab === "bundles" ? -58 * s : 20 * s, previewW, 92 * s, self.tab === "chests"); });
        var hint = self.button(row, "FullContents", self.tab === "bundles" ? "shop.contents.tap" : "shop.contents.odds", function () { self.contents(offer, view.token); }, "#bca078");
        self.sizeButton(hint, 0, self.tab === "bundles" ? 0 : -58 * s, w - 56 * s, 34 * s, true, "#bca078"); hint.caption.fontSize = 21; hint.caption.lineHeight = 26;
        if (self.tab === "chests") {
          self.costButton(row, offer, -w / 4 + 5 * s, -height / 2 + 45 * s, w / 2 - 30 * s, 65 * s, self.tab, view.token);
          var open = self.button(row, "OpenOwned_" + offer.id, "shop.chests.openOwned", function () { self.act("openChest", [offer.id], view.token); }, COLORS.blue);
          self.bind(open.caption, "shop.chests.openOwned", [offer.ownedCount || 0]); self.sizeButton(open, w / 4 - 5 * s, -height / 2 + 45 * s, w / 2 - 30 * s, 65 * s, offer.ownedCount > 0 && !self.isPending(), COLORS.blue);
        } else self.costButton(row, offer, 0, -height / 2 + 45 * s, w - 40 * s, 65 * s, self.tab, view.token);
      }
      if (!grid) y -= height + gap;
    });
    if (grid && offers.length) y -= (this.tab === "resources" ? 350 : 284) * s + gap;
    this.content.height = Math.max(this.geometry.listHeight, -y + 12 * s);
    this.scroll.stopAutoScroll(); this.scroll.scrollToOffset(cc.v2(0, Math.min(this._offsets[this.tab] || 0, Math.max(0, this.content.height - this.geometry.listHeight))), 0);
    if (!offers.length) { this.status.node.active = true; this.bind(this.status, "shop.empty"); }
  },
  closeModal: function () {
    if (!this.modal) return; var modal = this.modal; this.modal = null; modal.active = false; modal.destroy();
  },
  modalShell: function (titleKey, name, requestedHeight) {
    this.closeModal(); var self = this, bounds = this.bounds(), width = Math.min(this.geometry.width - 24, 660), height = Math.max(280, Math.min(requestedHeight || 820, bounds.top - bounds.bottom - 180));
    var root = this.modal = node(this.node, "ShopModal", bounds.right - bounds.left, bounds.top - bounds.bottom); root.setPosition((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2); root.zIndex = 1000; root.addComponent(cc.BlockInputEvents);
    var shade = node(root, "Shade", root.width, root.height); round(shade, cc.color(0, 0, 0, 185), false);
    var panel = node(root, "Panel", width, height); round(panel, COLORS.cream); var band = node(panel, "Header", width - 6, 72); band.y = height / 2 - 39; round(band, COLORS.header, false);
    var title = this.text(band, "Title", 34, true); place(title.node, -10, 0, width - 110, 60); if (name) this.named(title, name); else this.bind(title, titleKey);
    var close = this.button(band, "Close", "shop.close", function () { self.closeModal(); }, COLORS.header); this.sizeButton(close, width / 2 - 39, 0, 56, 54, true, COLORS.header); close.caption.string = "×"; close.caption.fontSize = 52;
    return { root: root, panel: panel, width: width, height: height };
  },
  contents: function (offer) {
    var modal = this.modalShell("shop.contents.title", offer), self = this, possible = offer.possibleRewards || [], rewards = offer.rewards || [];
    var intro = this.text(modal.panel, "Introduction", 23, false);
    if (possible.length && offer.guaranteedDraws) {
      var floors = offer.guaranteedDraws.map(function (floor) { return self._language.t(RARITY_KEYS[floor.quality] || "shop.contents.noFloor") + " ×" + floor.count; }).join(" + ");
      this.bind(intro, "shop.contents.drawSummary", [offer.draws, offer.randomDraws, floors || this._language.t("shop.contents.noFloor")]);
    } else this.bind(intro, possible.length ? "shop.contents.possible" : "shop.contents.all");
    intro.enableWrapText = true; place(intro.node, 0, modal.height / 2 - (possible.length ? 126 : 110), modal.width - 36, possible.length ? 78 : 42);
    if (possible.length) {
      var bonus = this.text(modal.panel, "RuneBonus", 23, false); bonus.enableWrapText = true;
      this.bind(bonus, "shop.contents.runeBonus", [Layout.percent(offer.extraCopyChance)]);
      place(bonus.node, 0, modal.height / 2 - 218, modal.width - 36, 88);
    }
    var scrollNode = node(modal.panel, "ContentsScroll", modal.width - 36, Math.max(96, modal.height - (possible.length ? 314 : 206))); scrollNode.y = possible.length ? -121 : -40;
    var viewport = node(scrollNode, "Viewport", scrollNode.width, scrollNode.height); viewport.addComponent(cc.Mask).type = cc.Mask.Type.RECT;
    var content = node(viewport, "Content", scrollNode.width); content.anchorY = 1; content.y = scrollNode.height / 2;
    var scroll = scrollNode.addComponent(cc.ScrollView); scroll.content = content; scroll.vertical = true; scroll.horizontal = false; scroll.cancelInnerEvents = true; scroll.brake = .45;
    var entries = rewards.map(function (reward) { return { reward: reward, possible: false }; }).concat(possible.map(function (reward) { return { reward: reward, possible: true }; }));
    entries.forEach(function (entry, index) {
      var reward = entry.reward, row = node(content, "ContentsReward_" + index, content.width, 102); row.y = -55 - index * 110; round(row, "#f0e1c2", "#b4a080", 10);
      self.icon(row, reward.icon, 64).x = -row.width / 2 + 42;
      var label = self.text(row, "Reward", 25, false), name = self.T(reward.nameKey || reward.name || reward.fallbackName || String(reward.id));
      if (entry.possible) {
        var odds = Number(reward.chance === undefined ? reward.probability : reward.chance), rarity = self._language.t(RARITY_KEYS[reward.quality] || "shop.contents.noFloor");
        if (reward.guaranteedDraws > 0) {
          self.bind(label, offer.randomDraws > 0 ? "shop.contents.chanceAndFloor" : "shop.contents.floorChance", offer.randomDraws > 0 ? [name, Layout.percent(odds), rarity, Layout.percent(reward.guaranteedChance)] : [name, rarity, Layout.percent(reward.guaranteedChance)]);
        } else self.bind(label, isFinite(odds) ? "shop.contents.randomChance" : "shop.contents.random", [name, isFinite(odds) ? Layout.percent(odds) : ""]);
      }
      else label.string = name + " ×" + Number(reward.num).toLocaleString();
      place(label.node, 40, 0, row.width - 110, 92); label.enableWrapText = true;
      if (reward.chestId) row.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); if (Layout.tap(event)) self.chestContents(reward.chestId); });
    }); content.height = Math.max(scrollNode.height, entries.length * 110 + 12);
  },
  chestContents: function (id) {
    var chest = this.view && (this.view.chests || []).filter(function (offer) { return offer.id === id; })[0];
    if (chest) this.contents(chest);
  },
  confirm: function (key, params, action, conversion, conversionKey) {
    var modal = this.modalShell("shop.confirm.title", null, conversion ? 470 : 390), self = this, description = this.text(modal.panel, "Message", 29, false);
    description.enableWrapText = true; this.bind(description, key, params); place(description.node, 0, 40, modal.width - 60, modal.height - 230);
    if (conversion) { var note = this.text(modal.panel, "Conversion", 24, false); note.enableWrapText = true; this.bind(note, conversionKey || "shop.relics.convertConfirm", [conversion]); place(note.node, 0, -modal.height / 2 + 145, modal.width - 50, 70); }
    var cancel = this.button(modal.panel, "Cancel", "shop.cancel", function () { self.closeModal(); }, COLORS.blue), yes = this.button(modal.panel, "Confirm", "shop.confirm", function () { self.closeModal(); action(); });
    this.sizeButton(cancel, -modal.width / 4, -modal.height / 2 + 62, modal.width / 2 - 40, 64, true, COLORS.blue); this.sizeButton(yes, modal.width / 4, -modal.height / 2 + 62, modal.width / 2 - 40, 64, true);
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
    this.confirm(cost.currency === 2002 ? "shop.confirm.gems" : "shop.confirm.gold", [this.T(offer.nameKey || offer.name || offer.fallbackName || ""), cost.amount], action, offer.conversionGold);
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
