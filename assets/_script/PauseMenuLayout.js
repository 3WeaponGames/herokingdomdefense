"use strict";
var Language = require("LanguageMgr").LanguageMgr;
var Picture = require("SettingsPictogram").SettingsPictogram;
function label(parent, name, size, color) {
  var node = parent.getChildByName(name);
  if (!node) { node = new cc.Node(name); node.parent = parent; node.addComponent(cc.Label); }
  var text = node.getComponent(cc.Label); text._settingsLayout = true; text._localizedFontRole = "display";
  text.fontSize = size; text.lineHeight = size + 14; text.enableWrapText = false; text.overflow = cc.Label.Overflow.SHRINK;
  text.horizontalAlign = cc.Label.HorizontalAlign.CENTER; text.verticalAlign = cc.Label.VerticalAlign.CENTER;
  node.color = cc.color(color); node.setScale(1);
  var stroke = node.getComponent(cc.LabelOutline) || node.addComponent(cc.LabelOutline); stroke.width = 4; stroke.color = cc.color("#000000");
  var shadow = node.getComponent(cc.LabelShadow) || node.addComponent(cc.LabelShadow); shadow.blur = 0; shadow.offset = cc.v2(0, -4); shadow.color = cc.color("#000000");
  return text;
}
function picture(node, resource) {
  var sprite = node.getComponent(cc.Sprite) || node.addComponent(cc.Sprite);
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM; sprite.type = cc.Sprite.Type.SIMPLE;
  (node.getComponent(Picture) || node.addComponent(Picture)).setResource("gui-pro/pause/" + resource);
}
function button(root, name, icon, caption, red) {
  var node = new cc.Node(name); node.parent = root;
  node.addComponent(cc.Button).transition = cc.Button.Transition.SCALE;
  picture(node, red ? "hex-red" : "hex-blue");
  var glyph = new cc.Node("Pictogram"); glyph.parent = node; picture(glyph, icon);
  var sizes = { settings: [56, 59], continue: [37, 53], restart: [50, 59], exit: [60, 54] };
  glyph.setContentSize(sizes[icon][0], sizes[icon][1]); glyph.setPosition(icon === "exit" ? 7 : 0, 9);
  var text = label(node, "Caption", 30, red ? "#f6cfca" : "#76c7ff");
  text.enableWrapText = true; text.lineHeight = 35; Language.getInstance().bindLabel(text, caption);
  text.node.setContentSize(158, 74); text.node.setPosition(0, -116);
  node.setContentSize(132, 159); return node;
}
exports.stat = function (text, value) { require("SettingsPanelStyle").body(text, 29, !!value, value ? "#ffdf77" : "#f7f6ee"); };
exports.layout = function (owner) {
  var root = owner.node.getChildByName("root");
  if (!owner._hexPauseReady) {
    owner._hexPauseReady = true;
    owner.btnClose.active = owner.btnNewGame.active = false;
    if (owner.btnDismiss) owner.btnDismiss.active = false;
    var ribbon = root.getChildByName("wg_gxhd_pd"); if (ribbon) ribbon.active = false;
    var frame = root.getComponent(cc.Sprite); if (frame) frame.enabled = false;
    var oldFrame = root.getChildByName("SettingsFrame"); if (oldFrame) oldFrame.active = false;
    owner.btnSettings = button(root, "PauseSettings", "settings", "pause.settings", false);
    owner.btnClose = button(root, "PauseContinue", "continue", "pause.continue", false);
    owner.btnRestart = button(root, "PauseRestart", "restart", "pause.restart", false);
    owner.btnNewGame = button(root, "PauseReturnHome", "exit", "pause.returnHome", true);
    owner._pauseHeading = label(root, "PauseHeading", 82, "#ffffff");
    owner._pauseStage = label(root, "PauseStage", 35, "#ffd000");
    Language.getInstance().bindLabel(owner._pauseHeading, "pause.menuTitle");
    var band = new cc.Node("PauseActionsBand"); band.parent = root; band.setSiblingIndex(0); band.opacity = 51; band.addComponent(cc.Graphics);
  }
  if (owner.musicSlider) owner.musicSlider.node.parent.active = false;
  if (owner.effectSlider) owner.effectSlider.node.parent.active = false;
  ["LanguageOptions", "IdleControlOptions", "IdleControlHelp", "AudioDivider"].forEach(function (name) { var node = root.getChildByName(name); if (node) node.active = false; });
  var width = Math.min(700, owner.node.width - 48), height = 900;
  var meta = owner.menuMetadata || {}, stage = typeof meta.stageTitle === "function" ? meta.stageTitle() : meta.stageTitle;
  stage = stage || Language.getInstance().t(owner._stats ? "pause.wallDefense" : "pause.campaign");
  var signature = [width, owner.node.height, stage, Language.getInstance().getCurrentLanguage()].join(":");
  if (owner._pauseMenuSignature === signature) return;
  owner._pauseMenuSignature = signature;
  root.setContentSize(width, height); root.setScale(Math.min(1, Math.max(1, owner.node.height - 80) / height)); root.setPosition(0, 0);
  owner._pauseHeading.node.setPosition(0, 370); owner._pauseHeading.node.setContentSize(width - 24, 112);
  owner._pauseStage.string = stage; owner._pauseStage.node.setPosition(0, 280); owner._pauseStage.node.setContentSize(width - 40, 60);
  var section = root.getChildByName("title"), title = section.getComponent(cc.Label);
  title._settingsLayout = true; title.fontSize = 64; title.lineHeight = 78; title.overflow = cc.Label.Overflow.SHRINK;
  section.setScale(.5); section.setPosition(0, 200); section.setContentSize((width - 48) * 2, 92);
  var scroll = owner.ndParent.node, view = scroll.getChildByName("view"), viewHeight = 280;
  scroll.setContentSize(width - 64, viewHeight); scroll.setPosition(0, 24);
  var widget = view.getComponent(cc.Widget); if (widget) widget.enabled = false;
  view.setAnchorPoint(.5, 1); view.setContentSize(width - 64, viewHeight); view.setPosition(0, viewHeight / 2);
  var gap = Math.min(104, (width - 148) / 4);
  owner.posX = [[-1.5, -.5, .5, 1.5].map(function (x) { return x * gap; }), [-2, -1, 0, 1, 2].map(function (x) { return x * gap; })];
  var slot = width / 4;
  [owner.btnSettings, owner.btnClose, owner.btnRestart, owner.btnNewGame].forEach(function (node, index) {
    var size = Math.min(132, slot - 16), h = size * 199 / 165;
    node.setContentSize(size, h); node.setPosition((index - 1.5) * slot, -220);
    node.getChildByName("Pictogram").setScale(size / 132);
    var caption = node.getChildByName("Caption"); caption.setContentSize(slot - 8, 74); caption.y = -h / 2 - 38;
  });
  var band = root.getChildByName("PauseActionsBand"), g = band.getComponent(cc.Graphics); band.setPosition(0, -250); g.clear();
  g.fillColor = cc.color("#050d18"); g.rect(-owner.node.width / 2 / root.scaleX, -165, owner.node.width / root.scaleX, 310); g.fill();
};
