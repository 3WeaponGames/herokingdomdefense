"use strict";
var Language = require("LanguageMgr").LanguageMgr;
function panel(root, width, height) {
  var sprite = root.getComponent(cc.Sprite); if (sprite) sprite.enabled = false;
  var node = root.getChildByName("SettingsFrame");
  if (!node) { node = new cc.Node("SettingsFrame"); node.parent = root; node.setSiblingIndex(0); node.addComponent(cc.Graphics); }
  if (node.width === width && node.height === height) return;
  root.setContentSize(width, height); node.setContentSize(width, height);
  var g = node.getComponent(cc.Graphics); g.clear();
  function round(x, y, w, h, r, color) { g.fillColor = cc.color(color); g.roundRect(x, y, w, h, r); g.fill(); }
  round(-width / 2, -height / 2 - 5, width, height, 25, "#15241f");
  round(-width / 2, -height / 2, width, height, 25, "#484e60");
  round(-width / 2 + 3, -height / 2 + 3, width - 6, height - 84, 22, "#f6f0df");
  g.strokeColor = cc.color("#212c26"); g.lineWidth = 3; g.roundRect(-width / 2, -height / 2, width, height, 25); g.stroke();
}
function title(node, width, y) {
  node.setPosition(0, y); node.setScale(.5); node.setContentSize((width - 150) * 2, 104);
  var label = node.getComponent(cc.Label); label._settingsLayout = true; label.fontSize = 76; label.lineHeight = 92;
  label.enableWrapText = false; label.overflow = cc.Label.Overflow.SHRINK;
}
function volume(slider, width, y) {
  if (!slider) return;
  var row = slider.node.parent, left = -width / 2 + 36, right = width / 2 - 36;
  row.active = true; row.setPosition(0, y);
  var caption = row.children.filter(function (node) { return node.getComponent(cc.Label); })[0], label = caption.getComponent(cc.Label);
  label._settingsLayout = true;
  caption.anchorX = 0; caption.setScale(.5); caption.setPosition(left, 0); caption.setContentSize(296, 84);
  label.fontSize = 62; label.lineHeight = 76; label.enableWrapText = false; label.overflow = cc.Label.Overflow.SHRINK;
  label.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
  var length = Math.min(250, width - 242);
  slider.node.setPosition(right - length / 2, 0); slider.node.setContentSize(length, 46);
  [["Background", length + 12, 34], ["Background2", length + 6, 28]].forEach(function (part) {
    var node = slider.node.getChildByName(part[0]), sprite = node.getComponent(cc.Sprite);
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM; node.setContentSize(part[1], part[2]);
  });
  // Setting progress moves the native Slider handle to its resized track.
  slider.progress = slider.progress;
}
exports.settings = function (owner) {
  if (!owner.node) return;
  var root = owner.node.getChildByName("root"), width = Math.min(520, owner.node.width - 64);
  var height = owner.btnExchangeCode.active ? 660 : 570, language = Language.getInstance();
  var signature = [width, height, language.getCurrentLanguage()].join(":");
  if (owner._settingsLayout === signature) return;
  owner._settingsLayout = signature;
  panel(root, width, height); root.setPosition(0, 0);
  var header = height / 2 - 42, first = height / 2 - 134;
  title(owner.ndTitle, width, header);
  owner.btnClose.setPosition(width / 2 - 44, header); owner.btnClose.setContentSize(49, 52);
  volume(owner.musicSlider, width, first); volume(owner.effectSlider, width, first - 82);
  require("LanguageOptions").attach(owner.node, first - 164, width - 72);
  require("ControlIndicatorOptions").attach(owner.node, { width: width - 72, rowY: first - 246, helpY: first - 300 });
  owner.version.node.setScale(1); owner.version.node.setPosition(0, -height / 2 + 42); owner.version.node.setContentSize(width - 64, 34);
  owner.version._settingsLayout = true; owner.version.fontSize = 22; owner.version.lineHeight = 28; owner.version.enableWrapText = false; owner.version.overflow = cc.Label.Overflow.SHRINK;
  owner.btnExchangeCode.setPosition(0, -height / 2 + 115); owner.btnExchangeCode.setScale(.8);
  var reset = owner.btnCleardata;
  reset._settingsLayout = true; reset._localizedFontRole = "body"; reset.fontSize = 14; reset.lineHeight = 18;
  reset.enableWrapText = false; reset.overflow = cc.Label.Overflow.SHRINK;
  reset.node.setScale(1); reset.node.anchorX = 0; reset.node.setPosition(-width / 2 + 28, -height / 2 + 14); reset.node.setContentSize(112, 20);
  [cc.LabelOutline, cc.LabelShadow].forEach(function (Type) { if (!Type) return; var effect = reset.node.getComponent(Type); if (effect) effect.enabled = false; });
  reset.node.color = cc.color("#a59b87");
};
exports.pause = function (owner) {
  if (!owner.node || !owner.musicSlider) return;
  var root = owner.node.getChildByName("root"), width = Math.min(560, owner.node.width - 64), height = Math.min(850, owner.node.height - 160);
  var language = Language.getInstance(), signature = [width, height, language.getCurrentLanguage()].join(":");
  if (owner._settingsLayout === signature) return;
  owner._settingsLayout = signature;
  panel(root, width, height); root.setPosition(0, 0);
  var header = height / 2 - 42, footer = -height / 2 + 64, helpY = footer + 110, hideY = helpY + 54, effectY = hideY + 78, musicY = effectY + 78;
  title(root.getChildByName("title"), width, header);
  if (owner.btnDismiss) owner.btnDismiss.setPosition(width / 2 - 40, header);
  volume(owner.musicSlider, width, musicY); volume(owner.effectSlider, width, effectY);
  require("ControlIndicatorOptions").attach(owner.node, { width: width - 72, rowY: hideY, helpY: helpY });
  var scroll = owner.ndParent.node, view = scroll.getChildByName("view"), top = height / 2 - 112, bottom = musicY + 62;
  var viewHeight = Math.max(100, top - bottom), viewWidth = width - 72;
  scroll.setContentSize(viewWidth, viewHeight); scroll.setPosition(0, (top + bottom) / 2);
  var widget = view.getComponent(cc.Widget); if (widget) widget.enabled = false;
  view.setAnchorPoint(.5, 1); view.setContentSize(viewWidth, viewHeight); view.setPosition(0, viewHeight / 2);
  var gap = Math.min(100, (viewWidth - 84) / 4);
  owner.posX = [[-1.5, -.5, .5, 1.5].map(function (x) { return x * gap; }), [-2, -1, 0, 1, 2].map(function (x) { return x * gap; })];
  owner.btnClose.setPosition(-width / 4, footer); owner.btnNewGame.setPosition(width / 4, footer);
  var buttonScale = Math.min(1, (width / 2 - 28) / 224); owner.btnClose.setScale(buttonScale); owner.btnNewGame.setScale(buttonScale);
};
