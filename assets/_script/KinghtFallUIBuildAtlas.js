var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
function atlasColor(r, g, b) { return new cc.Color(r, g, b, 255); }
function atlasNode(name, parent) { var node = new cc.Node(name); node.parent = parent; return node; }
function atlasRound(graphics, x, y, width, height, radius, fill, stroke, lineWidth) {
  graphics.fillColor = fill;
  graphics.roundRect(x, y, width, height, radius);
  graphics.fill();
  if (stroke) { graphics.strokeColor = stroke; graphics.lineWidth = lineWidth || 2; graphics.stroke(); }
}
function atlasMeasure(label) {
  if (label._updateRichText) label._updateRichText();
  else if (label._forceUpdateRenderData) label._forceUpdateRenderData();
}
function atlasBranch(building, index) {
  return building.levelList.find(function (row) { return row.index === index; });
}
function atlasLevels(building, first) {
  var levels = [], seen = new Set(), queue = [first];
  // Follow authored upgrade links, including alternate final branches. Never
  // infer levels from array positions or write preview state into game data.
  while (queue.length) {
    var index = queue.shift(), cfg = atlasBranch(building, index);
    if (!Number.isInteger(index) || !cfg || seen.has(index)) continue;
    seen.add(index); levels.push(cfg);
    (cfg.BranchBuild || []).forEach(function (next) { queue.push(next); });
  }
  return levels;
}
var def_KinghtFallUIBuildAtlas = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndItem = null;
    e.ndParent = null;
    e.btnClose = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    var self = this;
    this.ndItem.active = false;
    this._atlasGeneration = (this._atlasGeneration || 0) + 1;
    this._atlasLanguage = require("LanguageMgr").LanguageMgr.getInstance();
    this._atlasRoot = this.node.getChildByName("root");
    this._atlasScrollNode = this._atlasRoot.getChildByName("New ScrollView");
    this._atlasView = this._atlasScrollNode.getChildByName("view");
    this._atlasScroll = this._atlasScrollNode.getComponent(cc.ScrollView);
    var oldLayout = this.ndParent.getComponent(cc.Layout);
    if (oldLayout) oldLayout.enabled = false;
    this.ndParent.anchorX = .5; this.ndParent.anchorY = 1;
    this._atlasPanel = atlasNode("CatalogFrame", this._atlasRoot).addComponent(cc.Graphics);
    this._atlasPanel.node.setSiblingIndex(0);
    this._atlasTabs = atlasNode("CategoryTabs", this._atlasRoot);
    this._atlasTabButtons = [];
    ["all", "towers", "barracks"].forEach(function (id) {
      var node = atlasNode("Tab_" + id, self._atlasTabs), graphics = node.addComponent(cc.Graphics);
      var label = self.createCatalogLabel(node, "Caption", 30, true);
      label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
      label.verticalAlign = cc.Label.VerticalAlign.CENTER;
      label.overflow = cc.Label.Overflow.SHRINK;
      node.on(cc.Node.EventType.TOUCH_END, function (event) {
        if (event) event.stopPropagation();
        self.selectCategory(id);
      }, self);
      self._atlasTabButtons.push({ id: id, node: node, label: label, graphics: graphics });
    });
    this._atlasFooter = this.createCatalogLabel(this._atlasRoot, "ScrollHint", 23, false);
    this._atlasFooter.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    this._atlasFooter.verticalAlign = cc.Label.VerticalAlign.CENTER;
    this._atlasFooter.overflow = cc.Label.Overflow.SHRINK;
    this._atlasBar = atlasNode("CatalogScrollBar", this._atlasRoot).addComponent(cc.Graphics);
    this.entries = [];
    this._atlasGroups = [];
    this.category = "all";
    var kinds = $z1KinghtFallEnum.KinghtFallEnumBuildEnum;
    [ ["towers", [kinds.ArrowTower]], ["barracks", [kinds.Barracks]],
      ["economy", [kinds.PrivateHouse, kinds.Mill]], ["defenses", [kinds.CastleCenter, kinds.Wall]] ].forEach(function (definition) {
      var group = { id: definition[0], entries: [] }, header = atlasNode("Section_" + definition[0], self.ndParent);
      group.node = header; group.graphics = header.addComponent(cc.Graphics);
      group.label = self.createCatalogLabel(header, "Caption", 28, true);
      group.label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
      group.label.verticalAlign = cc.Label.VerticalAlign.CENTER;
      group.label.overflow = cc.Label.Overflow.SHRINK;
      self._atlasGroups.push(group);
      definition[1].forEach(function (kind) {
        var building = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBuildCfgById(kind);
        if (!building || !Array.isArray(building.levelList)) return;
        var choices = Array.isArray(building.InitialChoices) && building.InitialChoices.length ? building.InitialChoices : building.levelList.length ? [building.levelList[0].index] : [];
        choices.filter(function (index, at) { return Number.isInteger(index) && atlasBranch(building, index) && choices.indexOf(index) === at; }).forEach(function (index) {
          var entry = self.createCatalogRow(building, kind, index);
          group.entries.push(entry); self.entries.push(entry);
        });
      });
    });
    this.btnClose.on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
    this.node.on(cc.Node.EventType.SIZE_CHANGED, this.layoutCatalog, this);
    this._atlasScrollNode.on("scrolling", this.updateScrollHint, this);
    this._atlasScrollNode.on("scroll-ended", this.updateScrollHint, this);
    this._atlasLanguage.onChange(this.refreshCatalog, this);
    this.refreshCatalog();
  };
  _ctor.prototype.createCatalogLabel = function (parent, name, size, bold) {
    var node = atlasNode(name, parent), label = node.addComponent(cc.Label);
    label.font = null; label.fontFamily = "Arial"; label.useSystemFont = true;
    label._localizedFontRole = "body";
    label.fontSize = size; label.lineHeight = Math.ceil(size * 1.2); label.enableBold = bold;
    label.horizontalAlign = cc.Label.HorizontalAlign.LEFT; label.verticalAlign = cc.Label.VerticalAlign.TOP;
    label.enableWrapText = true; label.overflow = cc.Label.Overflow.RESIZE_HEIGHT;
    node.color = atlasColor(38, 60, 46);
    return label;
  };
  _ctor.prototype.createCatalogRow = function (building, kind, index) {
    var self = this, node = atlasNode("BuildingEntry", this.ndParent);
    var entry = { cfg: atlasBranch(building, index), levels: atlasLevels(building, index), preview: 0,
      kind: kind, index: index, node: node, graphics: node.addComponent(cc.Graphics) };
    entry.icon = atlasNode("sprIcon", node);
    entry.sprite = entry.icon.addComponent(cc.Sprite);
    entry.sprite.sizeMode = cc.Sprite.SizeMode.TRIMMED;
    entry.name = this.createCatalogLabel(node, "labName", 30, true);
    entry.name.node.anchorX = 0; entry.name.node.anchorY = 1;
    var description = atlasNode("labInfo", node);
    description.anchorX = 0; description.anchorY = 1; description.color = atlasColor(61, 62, 54);
    entry.info = description.addComponent(cc.RichText);
    entry.info._localizedFontRole = "body";
    entry.info.font = null; entry.info.fontFamily = "Arial";
    entry.info.fontSize = 24; entry.info.lineHeight = 30; entry.info.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
    entry.badge = atlasNode("LevelBadge", node);
    entry.badgeGraphics = entry.badge.addComponent(cc.Graphics);
    entry.level = this.createCatalogLabel(entry.badge, "labLevel", 23, true);
    entry.level.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    entry.level.verticalAlign = cc.Label.VerticalAlign.CENTER;
    entry.level.overflow = cc.Label.Overflow.SHRINK;
    entry.badge.on(cc.Node.EventType.TOUCH_END, function (event) {
      if (event) event.stopPropagation();
      self.cycleCatalogLevel(entry);
    }, this);
    this.loadCatalogIcon(entry);
    return entry;
  };
  _ctor.prototype.loadCatalogIcon = function (entry) {
    var self = this, cfg = entry.cfg, node = entry.node, generation = this._atlasGeneration;
    var request = entry.iconRequest = (entry.iconRequest || 0) + 1;
    entry.frame = null; entry.sprite.spriteFrame = null;
    // Layered defenses use the assembled portrait, not a bare aiming base.
    var artwork = cfg.Appearance && !cfg.Appearance.weapon && cfg.Appearance.sprite;
    this.loadSpriteFrame(artwork ? "resources" : $z1KinghtFallConfig.KinghtFallBundelName.IconBuild, artwork || cfg.Icon, function (frame) {
      if (!frame || self.isclose || generation !== self._atlasGeneration || request !== entry.iconRequest || !cc.isValid(node, true)) return;
      entry.frame = frame; entry.sprite.spriteFrame = frame;
      self.fitCatalogIcon(entry);
    });
  };
  _ctor.prototype.cycleCatalogLevel = function (entry) {
    if (this.isclose || !entry || entry.levels.length < 2) return;
    entry.preview = (entry.preview + 1) % entry.levels.length;
    entry.cfg = entry.levels[entry.preview];
    this.loadCatalogIcon(entry);
    this.refreshCatalog();
  };
  _ctor.prototype.fitCatalogIcon = function (entry) {
    if (!entry.frame) return;
    var size = entry.frame.getRect ? entry.frame.getRect() : entry.frame.getOriginalSize();
    var width = Math.max(1, size.width), height = Math.max(1, size.height);
    entry.icon.setContentSize(width, height);
    entry.icon.setScale(Math.min((entry.iconWidth || 116) / width, 116 / height));
  };
  _ctor.prototype.refreshCatalog = function () {
    if (!this.entries || this.isclose) return;
    var self = this;
    this.entries.forEach(function (entry) {
      // The level belongs to its own badge; do not alter authored names/data.
      // BaseUI.T returns a token, so stripping that token before translation
      // cannot remove the level. Bind the already-resolved, shortened title.
      var name = self._atlasLanguage.t(entry.cfg.Name).replace(/\s*(?:[·•–-]\s*)?(?:Lv\.?\s*\d+|\d+\s*级)\s*$/i, "").trim();
      self._atlasLanguage.bindLabel(entry.name, name);
      var description = self._atlasLanguage.t(entry.cfg.LevelUpDescribe).replace(/<[^>]*>/g, "");
      self._atlasLanguage.bindLabel(entry.info, "<color=#3d3e36>" + description + "</color>");
      entry.level.string = self._atlasLanguage.format(self.T("[[loc:buildingAtlas.level]]"), [entry.cfg.level]);
    });
    this._atlasGroups.forEach(function (group) { group.label.string = self.T("[[loc:buildingAtlas." + group.id + "]]"); });
    this._atlasTabButtons.forEach(function (tab) { tab.label.string = self.T("[[loc:buildingAtlas." + tab.id + "]]"); });
    this.layoutCatalog();
  };
  _ctor.prototype.selectCategory = function (id) {
    if (this.isclose || ["all", "towers", "barracks"].indexOf(id) < 0 || this.category === id) return;
    this.category = id;
    this.layoutCatalog(true);
  };
  _ctor.prototype.layoutCatalog = function (resetScroll) {
    if (!this.entries || this._atlasLayingOut || this.isclose) return;
    this._atlasLayingOut = true;
    try {
      var width = Math.min(700, this.node.width - 44), height = Math.min(1320, this.node.height - 112);
      var oldOffset = resetScroll === true ? 0 : Math.max(0, this._atlasScroll.getScrollOffset().y);
      var root = this._atlasRoot, panel = this._atlasPanel;
      root.setContentSize(width, height); root.setPosition(0, 0);
      panel.clear();
      atlasRound(panel, -width / 2, -height / 2 - 6, width, height, 34, atlasColor(21, 48, 40));
      atlasRound(panel, -width / 2, -height / 2, width, height, 34, atlasColor(40, 197, 173), atlasColor(19, 60, 47), 4);
      atlasRound(panel, -width / 2 + 9, -height / 2 + 10, width - 18, height - 20, 28, atlasColor(251, 243, 221), atlasColor(255, 251, 235), 2);
      var banner = root.getChildByName("wg_jzfz_bt"), bannerSprite = banner.getComponent(cc.Sprite);
      bannerSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      banner.setContentSize(Math.min(500, width - 132), 100); banner.setPosition(-32, height / 2 - 30);
      this.btnClose.setContentSize(80, 80); this.btnClose.setPosition(width / 2 - 50, height / 2 - 34);
      this._atlasTabs.setPosition(0, height / 2 - 139);
      var tabWidth = (width - 76) / 3, self = this;
      this._atlasTabButtons.forEach(function (tab, at) {
        var selected = tab.id === self.category;
        tab.node.setContentSize(tabWidth, 64); tab.node.setPosition((at - 1) * (tabWidth + 10), 0);
        tab.graphics.clear();
        atlasRound(tab.graphics, -tabWidth / 2, -32, tabWidth, 64, 21, selected ? atlasColor(18, 170, 145) : atlasColor(247, 236, 207), selected ? atlasColor(11, 111, 92) : atlasColor(175, 150, 110), 2);
        tab.label.node.setContentSize(tabWidth - 12, 48); tab.label.node.color = selected ? atlasColor(255, 251, 232) : atlasColor(75, 57, 37);
      });
      var viewWidth = width - 52, viewHeight = height - 302;
      this._atlasScrollNode.setContentSize(viewWidth, viewHeight); this._atlasScrollNode.setPosition(0, -49);
      this._atlasView.setContentSize(viewWidth, viewHeight);
      this._atlasFooter.node.setContentSize(width - 80, 42); this._atlasFooter.node.setPosition(0, -height / 2 + 48);
      this._atlasFooter.node.color = atlasColor(122, 103, 73);
      this._atlasBar.node.setPosition(width / 2 - 20, -49);
      var cursor = 2, rowWidth = viewWidth - 24;
      this._atlasGroups.forEach(function (group) {
        var visible = group.entries.length > 0 && (self.category === "all" || self.category === group.id);
        group.node.active = visible;
        group.entries.forEach(function (entry) { entry.node.active = visible; });
        if (!visible) return;
        group.node.setContentSize(rowWidth, 54); group.node.setPosition(0, -cursor - 27); cursor += 60;
        group.label.node.setContentSize(214, 40);
        var graphics = group.graphics;
        graphics.clear();
        atlasRound(graphics, -117, -20, 234, 40, 18, atlasColor(190, 218, 185));
        graphics.strokeColor = atlasColor(111, 151, 113); graphics.lineWidth = 2;
        graphics.moveTo(-rowWidth / 2 + 14, 0); graphics.lineTo(-133, 0);
        graphics.moveTo(133, 0); graphics.lineTo(rowWidth / 2 - 14, 0); graphics.stroke();
        group.entries.forEach(function (entry) {
          var rowHeight = self.layoutCatalogRow(entry, rowWidth);
          entry.node.setPosition(0, -cursor - rowHeight / 2); cursor += rowHeight + 12;
        });
        cursor += 6;
      });
      this._atlasScroll.stopAutoScroll();
      this.ndParent.setContentSize(viewWidth, Math.max(viewHeight, cursor));
      this.ndParent.setPosition(0, viewHeight / 2);
      this._atlasScroll.scrollToOffset(cc.v2(0, Math.min(oldOffset, Math.max(0, cursor - viewHeight))), 0);
      this.updateScrollHint();
    } finally { this._atlasLayingOut = false; }
  };
  _ctor.prototype.layoutCatalogRow = function (entry, width) {
    var wellWidth = Math.min(132, width * .22), textLeft = -width / 2 + wellWidth + 44;
    var badgeWidth = Math.min(84, wellWidth - 8), badgeLeft = -width / 2 + 12 + wellWidth + 4 - badgeWidth;
    entry.name.node.setContentSize(Math.max(60, width / 2 - 20 - textLeft), 0);
    entry.info.maxWidth = width / 2 - 20 - textLeft;
    atlasMeasure(entry.name); atlasMeasure(entry.info);
    var nameHeight = Math.max(36, entry.name.node.height), infoHeight = Math.max(entry.info.lineHeight * 3 + entry.info.fontSize / 4, entry.info.node.height);
    var height = Math.max(176, 16 + nameHeight + 4 + infoHeight + 16);
    entry.node.setContentSize(width, height);
    entry.name.node.setPosition(textLeft, height / 2 - 16);
    entry.info.node.setPosition(textLeft, height / 2 - 20 - nameHeight);
    entry.badge.setPosition(badgeLeft + badgeWidth / 2, 60); entry.badge.setContentSize(badgeWidth, 44);
    entry.level.node.setContentSize(badgeWidth - 8, 32);
    var graphics = entry.graphics;
    graphics.clear();
    atlasRound(graphics, -width / 2, -height / 2, width, height, 24, atlasColor(253, 248, 232), atlasColor(148, 122, 83), 2);
    atlasRound(graphics, -width / 2 + 12, -80, wellWidth + 4, 160, 19, atlasColor(244, 230, 196));
    graphics.strokeColor = atlasColor(204, 183, 143); graphics.lineWidth = 2;
    graphics.moveTo(textLeft - 14, -height / 2 + 20); graphics.lineTo(textLeft - 14, height / 2 - 20); graphics.stroke();
    entry.badgeGraphics.clear();
    atlasRound(entry.badgeGraphics, -badgeWidth / 2, -18, badgeWidth, 36, 15, atlasColor(215, 235, 205), atlasColor(99, 149, 115), 2);
    entry.icon.setPosition(-width / 2 + 14 + wellWidth / 2, -18); entry.iconWidth = wellWidth - 10;
    this.fitCatalogIcon(entry);
    return height;
  };
  _ctor.prototype.updateScrollHint = function () {
    if (!this._atlasScroll || !this._atlasFooter || this.isclose) return;
    var height = this._atlasView.height, content = this.ndParent.height;
    var maximum = Math.max(0, content - height), offset = Math.max(0, Math.min(maximum, this._atlasScroll.getScrollOffset().y));
    var key = maximum > 1 && offset < maximum - 2 ? "more" : "end";
    this._atlasFooter.string = this.T("[[loc:buildingAtlas." + key + "]]");
    var graphics = this._atlasBar;
    graphics.node.active = maximum > 1;
    graphics.clear();
    if (maximum <= 1) return;
    var track = height - 8, thumb = Math.max(44, track * height / content), y = track / 2 - thumb - (track - thumb) * offset / maximum;
    atlasRound(graphics, -4, -track / 2, 8, track, 4, atlasColor(212, 215, 183));
    atlasRound(graphics, -5, y, 10, thumb, 5, atlasColor(23, 171, 144), atlasColor(11, 123, 104), 1);
  };
  _ctor.prototype.onEnable = function () {
    if (this._atlasLanguage) this._atlasLanguage.onChange(this.refreshCatalog, this);
  };
  _ctor.prototype.onDisable = function () {
    if (this._atlasLanguage) this._atlasLanguage.offChange(this.refreshCatalog, this);
  };
  _ctor.prototype.onDestroy = function () {
    this._atlasGeneration = (this._atlasGeneration || 0) + 1;
    if (this._atlasLanguage) this._atlasLanguage.offChange(this.refreshCatalog, this);
    this.node.off(cc.Node.EventType.SIZE_CHANGED, this.layoutCatalog, this);
    t.prototype.onDestroy.call(this);
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndItem", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndParent", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnClose", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIBuildAtlas;
