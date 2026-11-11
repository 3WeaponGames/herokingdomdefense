var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1SdkMgr = require("SdkMgr");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIBuildSel = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndItem = null;
    e.ndParent = null;
    e.build = null;
    e.callBack = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t, e, cancel, choices) {
    this.build = t;
    this.callBack = e;
    this.cancelCall = cancel;
    this.initialChoice = !!t && !(t.buildInfo && t.buildInfo.cfg);
    this.choiceIndexes = Array.isArray(choices) ? choices.slice() : null;
  };
  _ctor.prototype.onClose = function () {
    var cancel = this.cancelCall;
    this.cancelCall = null;
    if (cancel) cancel();
  };
  _ctor.prototype.onDestroy = function () {
    this.onClose();
    t.prototype.onDestroy.call(this);
  };
  _ctor.prototype.start = function () {
    this.ndItem.active = false;
    this.initView();
  };
  _ctor.prototype.initView = function () {
    var t = this;
    var e = this.choiceIndexes || (this.build.getUpgradeChoices ? this.build.getUpgradeChoices() : this.build.buildInfo.cfg.BranchBuild);
    // Every starting building family uses the same cards, including families
    // with only three choices. New choices fill the next grid slot.
    var grid = this.initialChoice || e.length > 3;
    this._choiceGridExtra = Math.max(0, Math.ceil(e.length / 2) - 2) * 304;
    this._nameBadgeRows = [];
    this._choiceRows = [];
    this._initialChoiceDescriptions = [];
    if (grid) {
      var layout = this.ndParent.getComponent(cc.Layout);
      if (layout) layout.enabled = false;
      this.ndParent.setContentSize(620, 600 + this._choiceGridExtra);
      this.ndParent.setPosition(0, -5);
    }
    if (this.initialChoice) this.initInitialChoiceView();
    var n = function (n) {
      var a = e[n];
      var o = i.build.buildCfg.levelList.find(function (row) { return row.index === a; });
      var r = cc.instantiate(i.ndItem);
      r.parent = i.ndParent;
      r.active = true;
      r.x = 0;
      t._choiceRows.push(r);
      // Layered defenses expose a bare base sprite at runtime. Their Icon is
      // the assembled tower artwork intended for selection/atlas previews.
      var artwork = o.Appearance && !o.Appearance.weapon && o.Appearance.sprite;
      i.loadSpriteFrame(artwork ? "resources" : $z1KinghtFallConfig.KinghtFallBundelName.IconBuild, artwork || o.Icon, function (t) {
        var e = r.getChildByName("sprIcon");
        e.getComponent(cc.Sprite).spriteFrame = t;
        e.scale = o.Zoom;
        e.setPosition(o.Excursion ? cc.v2(o.Excursion[0] || 0, o.Excursion[1] || 0) : cc.v2(0, 0));
        if (artwork && !grid) {
          var artworkSize = t.getOriginalSize ? t.getOriginalSize() : e.getContentSize();
          e.scale = Math.min(174 / Math.max(1, artworkSize.width), 128 / Math.max(1, artworkSize.height));
          e.setPosition(-202, 36);
        }
        if (grid) {
          var size = t.getOriginalSize ? t.getOriginalSize() : e.getContentSize();
          e.scale = Math.min((i.initialChoice ? 224 : 186) / Math.max(1, size.width), (i.initialChoice ? 156 : 126) / Math.max(1, size.height));
          e.setPosition(0, 65);
        }
      });
      r.getChildByName("labName").getComponent(cc.Label).string = i.T(o.Name);
      if (!i._nameBadgeRows) i._nameBadgeRows = [];
      if (!grid && !i.initialChoice) i._nameBadgeRows.push({ label: r.getChildByName("labName").getComponent(cc.Label),
        backgrounds: r.children.filter(function (node) { return (node.name === "ndNormal" || node.name === "ndVideo") && node.y < -20; }) });
      for (var d = 0; d < r.children.length; d++) {
        var p = r.children[d];
        "ndNormal" == p.name && (p.active = !require("BuildingCost").video(o, i.initialChoice));
        "ndVideo" == p.name && (p.active = require("BuildingCost").video(o, i.initialChoice));
      }
      var info = r.getChildByName("labInfo"), rich = info.getComponent(cc.RichText);
      rich.string = require("LanguageMgr").LanguageMgr.getInstance().format(i.initialChoice ? "<color=#3d3935>{0}</color>" : "<b><outline color=#000000 width=4>{0}</outline></b>", [i.T(o.LevelUpDescribe)]);
      if (i.initialChoice) {
        rich.font = null;
        rich.fontFamily = "Arial";
        info.color = new cc.Color(61, 57, 53, 255);
        [cc.LabelOutline, cc.LabelShadow].forEach(function (Type) {
          var effect = Type && info.getComponent(Type);
          if (effect) effect.enabled = false;
        });
      }
      if (grid) i.layoutChoiceCard(r, n, e.length);
      if (!require("BuildingCost").video(o, i.initialChoice)) {
        r.on(cc.Node.EventType.TOUCH_END, function () {
          if (!t._decisionPending) t.finishDecision(t.callBack, a);
        }, i);
      } else {
        r.on(cc.Node.EventType.TOUCH_END, function () {
          if (t.isclose || t._decisionCompleted || t._decisionPending) return;
          if (!t.canAffordSelection(a)) return;
          t._decisionPending = true;
          var generation = t._resourceGeneration;
          $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
            if (t.isclose || t._decisionCompleted || generation !== t._resourceGeneration || !cc.isValid(t)) return;
            t._decisionPending = false;
            switch (t.build.buildCfg.enumValue) {
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse:
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_up_2v1_X, "house");
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.ArrowTower:
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_up_2v1_X, "arrwo");
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Wall:
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_up_2v1_X, "wall");
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Mill:
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_up_2v1_X, "mill");
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks:
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_up_2v1_X, "camp");
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter:
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_up_2v1_X, "home");
            }
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_2v1);
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_building_2v1_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
            t.finishDecision(t.callBack, a, generation);
          }, function () {
            if (generation === t._resourceGeneration) t._decisionPending = false;
          }, "battle.building.branch");
        }, i);
      }
    };
    var i = this;
    for (var a = 0; a < e.length; a++) {
      n(a);
    }
  };
  _ctor.prototype.canAffordSelection = function (index) {
    if (!this.build.canAffordChoice || this.build.canAffordChoice(index)) return true;
    if (this.build.showBuildCostError) this.build.showBuildCostError();
    this._decisionPending = false;
    return false;
  };
  _ctor.prototype.finishDecision = function (callback, value, generation) {
    if (this.isclose || this._decisionCompleted || !cc.isValid(this) || generation !== undefined && generation !== this._resourceGeneration) return false;
    if (!this.canAffordSelection(value)) return false;
    return t.prototype.finishDecision.call(this, callback, value, generation);
  };
  _ctor.prototype.layoutChoiceCard = function (row, index, count) {
    row.setContentSize(300, 280);
    var extra = Math.max(0, Math.ceil(count / 2) - 2) * 304;
    var x = count % 2 && index === count - 1 ? 0 : index % 2 ? 160 : -160;
    row.setPosition(x, (count > 2 ? 150 : 0) + extra / 2 - Math.floor(index / 2) * 304);
    var rootSprite = row.getComponent(cc.Sprite);
    if (rootSprite) { rootSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM; rootSprite.type = cc.Sprite.Type.SLICED; }
    row.children.forEach(function (node) {
      if (node.name !== "ndNormal" && node.name !== "ndVideo") return;
      if (node.y < -20) { node.active = false; return; }
      var sprite = node.getComponent(cc.Sprite);
      if (sprite) { sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM; sprite.type = cc.Sprite.Type.SLICED; }
      node.setContentSize(300, 280);
      node.setPosition(0, 0);
    });
    var name = row.getChildByName("labName"), label = name.getComponent(cc.Label);
    name.setPosition(0, -29); name.setScale(.5);
    label.fontSize = 46; label.lineHeight = 52; label.enableWrapText = true; label.overflow = cc.Label.Overflow.SHRINK;
    name.setContentSize(548, 114);
    var info = row.getChildByName("labInfo"), rich = info.getComponent(cc.RichText);
    info.setPosition(0, -88); info.setScale(.5);
    rich.fontSize = 38; rich.lineHeight = 43; rich.maxWidth = 540;
    rich.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    this._initialChoiceDescriptions.push({ label: rich, maxHeight: 76, baseFontSize: 38, baseLineHeight: 43 });
  };
  _ctor.prototype.initInitialChoiceView = function () {
    var root = this.node.getChildByName("root"), banner = root && root.getChildByName("wg_jzfz_bt");
    var extra = this._choiceGridExtra || 0;
    if (root) root.setScale(Math.min(1, Math.max(.1, (this.node.width - 40) / 680), Math.max(.1, (this.node.height - 48) / (904 + extra))));
    var title = banner && banner.getChildByName("labTitle"), hint = root && root.getChildByName("labTitle");
    if (!this._choiceHeaderY) this._choiceHeaderY = { banner: banner && banner.y, hint: hint && hint.y };
    if (banner) banner.y = this._choiceHeaderY.banner + extra / 2;
    if (hint) hint.y = this._choiceHeaderY.hint + extra / 2;
    var squadChoice = this.build.buildCfg.enumValue === $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks;
    if (title) title.getComponent(cc.Label).string = this.T(squadChoice ? "[[loc:ui.building.barracks_title]]" : "[[loc:ui.building.towers_title]]");
    if (hint) hint.getComponent(cc.Label).string = this.T(squadChoice ? "[[loc:ui.building.choose_squad]]" : "[[loc:ui.building.choose_tower]]");
    if (this._cancelButton) this._cancelButton.y = -386 - extra / 2;
    if (!root || this._cancelButton) return;
    var button = new cc.Node("CancelInitialBuild"); button.parent = root; button.setPosition(0, -386 - extra / 2); button.setContentSize(252, 66);
    var background = button.addComponent(cc.Graphics);
    background.fillColor = new cc.Color(72, 73, 94, 255); background.strokeColor = new cc.Color(0, 0, 0, 255); background.lineWidth = 3;
    background.roundRect(-126, -33, 252, 66, 15); background.fill(); background.stroke();
    var textNode = new cc.Node("Label"); textNode.parent = button;
    var label = textNode.addComponent(cc.Label); label.string = this.T("[[loc:ui.building.cancel]]");
    label.fontSize = 32; label.lineHeight = 40; label.isBold = true;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER; label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    label.overflow = cc.Label.Overflow.SHRINK;
    if (title) { var source = title.getComponent(cc.Label); if (source.font) label.font = source.font; }
    // Adding an active Label starts with NONE overflow, which can resize its
    // node to zero before text is laid out. Set its bounds after font/overflow.
    textNode.setContentSize(236, 58);
    button.on(cc.Node.EventType.TOUCH_END, function () { if (!this._decisionPending) this.closeUI(); }, this);
    this._cancelButton = button;
  };
  _ctor.prototype.lateUpdate = function () {
    (this._initialChoiceDescriptions || []).forEach(function (row) {
      var rich = row.label, key = rich.string + "|" + (rich.font && rich.font.uuid);
      if (row.key !== key) {
        row.key = key; rich.fontSize = row.baseFontSize; rich.lineHeight = row.baseLineHeight;
      }
      var height = rich.node.height * Math.abs(rich.node.scaleY);
      if (height > row.maxHeight + 1 && rich.fontSize > 18) {
        var size = Math.max(18, Math.floor(rich.fontSize * row.maxHeight / height));
        rich.fontSize = size; rich.lineHeight = Math.ceil(size * row.baseLineHeight / row.baseFontSize);
      }
    });
    (this._nameBadgeRows || []).forEach(function (row) {
      var label = row.label, node = label.node;
      var signature = [label.string, label.fontSize, label.lineHeight, label.font && label.font.name,
        node.width, node.height, node.scaleX, node.scaleY].join("|");
      if (row.signature === signature) return;
      label._forceUpdateRenderData();
      var width = Math.ceil(Math.max(220, node.width * Math.abs(node.scaleX) + 28));
      var height = Math.ceil(Math.max(80, node.height * Math.abs(node.scaleY) + 16));
      row.backgrounds.forEach(function (background) {
        var sprite = background.getComponent(cc.Sprite);
        sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        sprite.type = cc.Sprite.Type.SLICED;
        background.setContentSize(width, height);
        background.setPosition(node.position);
      });
      row.signature = signature;
    });
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndItem", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndParent", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIBuildSel;
