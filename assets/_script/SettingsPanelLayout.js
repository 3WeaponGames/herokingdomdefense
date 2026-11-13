"use strict";
var Language = require("LanguageMgr").LanguageMgr, Style = require("SettingsPanelStyle");
function panel(root, width, height) {
  var sprite = root.getComponent(cc.Sprite); if (sprite) sprite.enabled = false;
  var node = root.getChildByName("SettingsFrame");
  if (!node) { node = new cc.Node("SettingsFrame"); node.parent = root; node.setSiblingIndex(0); node.addComponent(cc.Graphics); }
  if (node.width === width && node.height === height) return;
  root.setContentSize(width, height); node.setContentSize(width, height);
  var g = node.getComponent(cc.Graphics); g.clear();
  function round(x, y, w, h, r, color) { g.fillColor = cc.color(color); g.roundRect(x, y, w, h, r); g.fill(); }
  round(-width / 2, -height / 2 - 7, width, height, 26, "#172b26");
  round(-width / 2, -height / 2, width, height, 26, "#181d20");
  round(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6, 23, "#50586b");
  round(-width / 2 + 5, -height / 2 + 5, width - 10, height - 85, 21, "#fcf6e6");
  g.fillColor = cc.color("#fcf6e6"); g.rect(-width / 2 + 5, height / 2 - 102, width - 10, 22); g.fill();
  g.strokeColor = cc.color("#aab3bf"); g.lineWidth = 1; g.roundRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 22); g.stroke();
}
// Confirmation dialogs share the Settings frame instead of maintaining a copy.
exports.frame = panel;
function fit(root, owner, height, margin) {
  root.setScale(Math.min(1, Math.max(1, owner.node.height - margin) / height)); root.setPosition(0, 0);
}
function divider(root, name, width, y) {
  var node = root.getChildByName(name);
  if (!node) { node = new cc.Node(name); node.parent = root; node.addComponent(cc.Graphics); }
  node.setPosition(0, y); var g = node.getComponent(cc.Graphics); g.clear();
  g.strokeColor = cc.color("#a2c3aa"); g.lineWidth = 2; g.moveTo(-width / 2, 0); g.lineTo(width / 2, 0); g.stroke();
}
function title(node, width, y) {
  node.setPosition(0, y); node.setScale(.5); node.setContentSize((width - 150) * 2, 128);
  var label = node.getComponent(cc.Label); label._settingsLayout = true; label.fontSize = 96; label.lineHeight = 112;
  label.enableWrapText = false; label.overflow = cc.Label.Overflow.SHRINK;
}
function volume(slider, innerWidth, y, icon) {
  if (!slider) return;
  var row = slider.node.parent, left = -innerWidth / 2, right = innerWidth / 2;
  row.active = true; row.setPosition(0, y); row.setContentSize(innerWidth, 60);
  Style.icon(row, "VolumeIcon", "icons/Pictograms/" + icon, left + 22, 0, 44);
  var caption = row.children.filter(function (node) { return node.getComponent(cc.Label); })[0], label = caption.getComponent(cc.Label);
  var length = Math.min(270, innerWidth * .52), trackLeft = right - length - 6;
  caption.anchorX = 0; caption.setScale(1); caption.setPosition(left + 64, 0);
  Style.body(label, 28, true); label.enableWrapText = false; label.overflow = cc.Label.Overflow.SHRINK;
  label.horizontalAlign = cc.Label.HorizontalAlign.LEFT; label.verticalAlign = cc.Label.VerticalAlign.CENTER;
  caption.setContentSize(trackLeft - (left + 64) - 16, 48);
  slider.node.setPosition(right - 6 - length / 2, 0); slider.node.setContentSize(length, 46);
  [["Background", length + 12, 34], ["Background2", length + 6, 28]].forEach(function (part) {
    var node = slider.node.getChildByName(part[0]), sprite = node.getComponent(cc.Sprite);
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM; node.setContentSize(part[1], part[2]);
  });
  slider.progress = slider.progress;
  require("AudioOptions").refreshFill(slider);
}
exports.settings = function (owner) {
  if (!owner.node) return;
  var root = owner.node.getChildByName("root"), width = Math.min(600, owner.node.width - 64), inner = width - 64;
  var height = owner.btnExchangeCode.active ? 710 : 620, language = Language.getInstance();
  var signature = [width, height, owner.node.height, language.getCurrentLanguage()].join(":");
  if (owner._settingsLayout === signature) return;
  owner._settingsLayout = signature;
  panel(root, width, height); fit(root, owner, height, 64);
  var header = height / 2 - 42, first = height / 2 - 142;
  title(owner.ndTitle, width, header);
  owner.btnClose.setPosition(width / 2 - 42, header); owner.btnClose.setContentSize(49, 52);
  volume(owner.musicSlider, inner, first, "Pictoicon_Music"); volume(owner.effectSlider, inner, first - 86, "Pictoicon_Volume_On");
  divider(root, "AudioDivider", inner, first - 140);
  require("LanguageOptions").attach(owner.node, first - 204, inner);
  require("ControlIndicatorOptions").attach(owner.node, { width: inner, rowY: first - 298, helpY: first - 336 });
  owner.version.node.setScale(1); owner.version.node.setPosition(0, -height / 2 + 39);
  Style.body(owner.version, 20, false, "#796e5b"); owner.version.enableWrapText = false; owner.version.overflow = cc.Label.Overflow.SHRINK;
  owner.version.node.setContentSize(inner, 30);
  owner.btnExchangeCode.setPosition(0, -height / 2 + 106); owner.btnExchangeCode.setScale(.8);
  var reset = owner.btnCleardata; Style.body(reset, 13, false, "#a59b87");
  reset.enableWrapText = false; reset.overflow = cc.Label.Overflow.SHRINK;
  reset.node.setScale(1); reset.node.anchorX = 0; reset.node.setPosition(-width / 2 + 28, -height / 2 + 14); reset.node.setContentSize(112, 20);
};
exports.pause = function (owner) { require("PauseMenuLayout").layout(owner); };
