"use strict";
var Language = require("LanguageMgr").LanguageMgr;
var Frame = require("SettingsPanelLayout"), Style = require("SettingsPanelStyle");
var Picture = require("SettingsPictogram").SettingsPictogram;

function text(parent, name, key, size, display) {
  var node = new cc.Node(name); node.parent = parent;
  var label = node.addComponent(cc.Label);
  if (display) {
    label._settingsLayout = true; label._localizedFontRole = "display";
    label.fontSize = size; label.lineHeight = size + 8;
    node.color = cc.color("#fff8ed");
    var outline = node.addComponent(cc.LabelOutline); outline.width = 2; outline.color = cc.color("#151a22");
    var shadow = node.addComponent(cc.LabelShadow); shadow.blur = 0; shadow.offset = cc.v2(0, -2); shadow.color = cc.color("#151a22");
  } else Style.body(label, size, false);
  label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
  label.verticalAlign = cc.Label.VerticalAlign.CENTER;
  label.enableWrapText = !display; label.overflow = cc.Label.Overflow.SHRINK;
  Language.getInstance().bindLabel(label, key);
  return label;
}
function button(parent, name, key, gray, choose) {
  var node = new cc.Node(name); node.parent = parent;
  node.addComponent(cc.Button).transition = cc.Button.Transition.SCALE;
  var skin = new cc.Node("Skin"); skin.parent = node;
  var sprite = skin.addComponent(cc.Sprite); sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM; sprite.type = cc.Sprite.Type.SLICED;
  skin.addComponent(Picture).setResource("icons/GUI-Pro/Buttons/Btn_MainButton_" + (gray ? "Gray" : "Sky"));
  var label = text(node, "Caption", key, 28, true);
  node.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); choose(); });
  return {node: node, skin: skin, label: label};
}
function placeButton(control, width, height, y) {
  control.node.setContentSize(width, height); control.node.setPosition(0, y);
  // Preserve the kit's native vertical highlights and corner proportions.
  var scale = height / 145;
  control.skin.setContentSize(width / scale, 145); control.skin.setScale(scale);
  control.label.node.setContentSize(width - 32, height - 12); control.label.node.setPosition(0, 3);
}
function bounds(owner) {
  var min = {x: -owner.node.width / 2, y: -owner.node.height / 2}, max = {x: owner.node.width / 2, y: owner.node.height / 2};
  var safe = cc.sys && cc.sys.getSafeAreaRect && cc.sys.getSafeAreaRect();
  if (safe && safe.width > 0 && safe.height > 0 && owner.node.convertToNodeSpaceAR) {
    min = owner.node.convertToNodeSpaceAR(cc.v2(safe.x, safe.y));
    max = owner.node.convertToNodeSpaceAR(cc.v2(safe.x + safe.width, safe.y + safe.height));
  }
  var canvas = cc.Canvas && cc.Canvas.instance, badge = canvas && canvas.node.getChildByName("DevelopmentTestModeBadge");
  if (badge && badge.active && badge.activeInHierarchy !== false) {
    max.y = Math.min(max.y, owner.node.convertToNodeSpaceAR(badge.convertToWorldSpaceAR(cc.v2(0, -badge.height * badge.anchorY))).y - 12);
  }
  return {min: min, max: max};
}
var Controller = cc.Class({
  extends: cc.Component,
  lateUpdate: function () { if (this.handle) this.handle.refresh(); },
  onDestroy: function () { if (this.handle) this.handle.close(); }
});

exports.open = function (owner, canRestartWave, onChoose, onClosed) {
  if (!owner || owner.isclose || !cc.isValid(owner, true) || !owner.node || !cc.isValid(owner.node, true)) return null;
  var closed = false, choosing = false, signature = null, language = Language.getInstance();
  var overlay = new cc.Node("CampaignRestartPrompt"); overlay.parent = owner.node;
  overlay.zIndex = cc.macro.MAX_ZINDEX - 1;
  overlay.addComponent(cc.BlockInputEvents);
  var shade = new cc.Node("Backdrop"); shade.parent = overlay; shade.opacity = 255;
  var background = shade.addComponent(cc.Graphics);
  var panel = new cc.Node("RestartPanel"); panel.parent = overlay; panel.addComponent(cc.BlockInputEvents);
  var heading = text(panel, "Title", canRestartWave ? "pause.restartChoiceTitle" : "pause.restartStageTitle", 40, true);
  var explanation = text(panel, "Description", canRestartWave ? "pause.restartChoiceWarning" : "pause.restartStageWarning", 25, false);
  var stage, wave, stageHelp, waveHelp;
  var error = text(panel, "Error", "pause.restartFailed", 19, false); error.node.active = false; error.node.color = cc.color("#a82e29");
  function live() { return !closed && !owner.isclose && cc.isValid(owner, true) && cc.isValid(owner.node, true); }
  function close() {
    if (closed) return;
    closed = true;
    language.offChange(refresh, handle);
    if (cc.isValid(overlay, true)) { overlay.active = false; overlay.destroy(); }
    if (onClosed) onClosed(handle);
  }
  function choose(mode) {
    if (!live()) { close(); return; }
    if (choosing) return;
    choosing = true;
    try {
      if (onChoose(mode) === false) { error.node.active = true; return; }
      close();
    } catch (failure) {
      if (!closed) error.node.active = true;
      throw failure;
    } finally { choosing = false; }
  }
  stage = button(panel, "RestartStage", "pause.restartWholeStage", false, function () { choose("stage"); });
  if (canRestartWave) {
    stageHelp = text(panel, "StageHelp", "pause.restartStageHelp", 22, false);
    wave = button(panel, "RestartWave", "pause.restartThisWave", false, function () { choose("wave"); });
    waveHelp = text(panel, "WaveHelp", "pause.restartWaveHelp", 22, false);
  }
  var cancel = button(panel, "Cancel", "pause.restartCancel", true, function () { if (!choosing) close(); });
  overlay.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); if (!choosing) close(); });
  function refresh() {
    if (!live()) { close(); return; }
    var safe = bounds(owner), availableWidth = safe.max.x - safe.min.x - 40, availableHeight = safe.max.y - safe.min.y - 48;
    var width = Math.max(280, Math.min(560, availableWidth)), height = canRestartWave ? 680 : 610;
    var next = [owner.node.width, owner.node.height, safe.min.x, safe.min.y, safe.max.x, safe.max.y, language.getCurrentLanguage()].join(":");
    if (signature === next) return;
    signature = next;
    overlay.setContentSize(owner.node.width, owner.node.height);
    shade.setContentSize(owner.node.width, owner.node.height);
    // Creator 2.4 Graphics writes its own draw color; node opacity does not
    // make this fill translucent on either renderer.
    background.clear(); background.fillColor = cc.color(0, 0, 0, 160);
    background.rect(-shade.width / 2, -shade.height / 2, shade.width, shade.height); background.fill();
    Frame.frame(panel, width, height);
    panel.setScale(Math.min(1, Math.max(1, availableWidth) / width, Math.max(1, availableHeight) / height));
    panel.setPosition((safe.min.x + safe.max.x) / 2, (safe.min.y + safe.max.y) / 2);
    heading.node.setPosition(0, height / 2 - 42); heading.node.setContentSize(width - 50, 60);
    explanation.node.setPosition(0, canRestartWave ? 201 : 106); explanation.node.setContentSize(width - 64, canRestartWave ? 96 : 184);
    placeButton(stage, width - 64, 76, canRestartWave ? 102 : -70);
    if (wave) {
      stageHelp.node.setPosition(0, 16); stageHelp.node.setContentSize(width - 64, 64);
      placeButton(wave, width - 64, 76, -86);
      waveHelp.node.setPosition(0, -165); waveHelp.node.setContentSize(width - 64, 64);
    }
    error.node.setPosition(0, canRestartWave ? -216 : -150); error.node.setContentSize(width - 64, 32);
    placeButton(cancel, width - 64, 56, canRestartWave ? -267 : -210);
  }
  var handle = {node: overlay, close: close, refresh: refresh};
  overlay.addComponent(Controller).handle = handle;
  language.onChange(refresh, handle);
  refresh();
  return handle;
};
