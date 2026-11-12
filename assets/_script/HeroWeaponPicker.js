"use strict";
// Browsing is visual-only. Only the explicit Equip action changes the loadout.
var Weapons = require("HeroWeapons");
var WIDTH = 684, HEIGHT = 900;
var BLUE_CARD = "icons/GUI-Pro/ShopCards/Frame_ListFrame14_n_Blue";
function node(parent, name, x, y, width, height) {
  var value = new cc.Node(name); value.setParent(parent); value.setPosition(x || 0, y || 0);
  if (width) value.setContentSize(width, height); return value;
}
function box(parent, name, x, y, width, height, radius, color) {
  var value = node(parent, name, x, y, width, height), g = value.addComponent(cc.Graphics);
  g.fillColor = cc.color(color); g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill(); return value;
}
function live(value) { return cc.isValid(value, true); }
function art(parent, name, resource, x, y, width, height, sliced, tint) {
  var value = node(parent, name, x, y, width, height), sprite = value.addComponent(cc.Sprite);
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  cc.resources.load(resource, cc.SpriteFrame, function (error, frame) {
    if (error || !live(value)) return;
    if (sliced) { sprite.spriteFrame = frame; sprite.type = cc.Sprite.Type.SLICED; }
    else {
      sprite.spriteFrame = frame; sprite.type = cc.Sprite.Type.SIMPLE; sprite.trim = false;
      var size = frame.getOriginalSize();
      if (size.width > 0 && size.height > 0) {
        var scale = Math.min(width / size.width, height / size.height);
        value.setContentSize(size.width * scale, size.height * scale);
      }
    }
    if (tint) value.color = cc.color(tint);
  }); return value;
}
function scenery(parent) {
  var value = node(parent, "Preview scenery"), g = value.addComponent(cc.Graphics);
  function ellipse(x, y, rx, ry, color) { g.fillColor = cc.color(color); g.ellipse(x, y, rx, ry); g.fill(); }
  [-1,1].forEach(function (side) {
    ellipse(side * 220, 270, 49, 13, "#fffaf0"); ellipse(side * 208, 282, 21, 21, "#fffaf0"); ellipse(side * 237, 278, 17, 17, "#fffaf0");
    ellipse(side * 205, 184, 98, 39, "#aacb80"); ellipse(side * 260, 202, 45, 47, "#aacb80"); ellipse(side * 160, 208, 46, 38, "#aacb80");
    ellipse(side * 179, 155, 49, 11, "#91bf42"); ellipse(side * 177, 167, 9, 17, "#91bf42"); ellipse(side * 194, 162, 10, 12, "#91bf42");
  });
  ellipse(0, 139, 112, 12, "#b0a785");
}
function open(owner) {
  if (owner._weaponPicker) return;
  var user = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData();
  var canvas = cc.find("Canvas") || owner.node, root = node(canvas, "Choose fighting style", 0, 0, canvas.width, canvas.height);
  root.zIndex = 10000; root.addComponent(cc.BlockInputEvents); owner._weaponPicker = root;
  var backdrop = root.addComponent(cc.Graphics); backdrop.fillColor = cc.color(0, 0, 0, 185);
  backdrop.rect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height); backdrop.fill();
  var content = node(root, "Weapon choices", 0, 0, WIDTH, HEIGHT); content.addComponent(cc.BlockInputEvents);
  content.scale = Math.min(1, (canvas.width - 28) / WIDTH, (canvas.height - 48) / HEIGHT);
  box(content, "Panel shadow", 0, -18, 684, 850, 42, "#160e20");
  box(content, "Panel outline", 0, -8, 684, 850, 42, "#170f20");
  box(content, "Purple frame", 0, -5, 674, 838, 39, "#853bb5");
  box(content, "Frame highlight", 0, 0, 660, 818, 33, "#cb7af4");
  box(content, "Inner outline", 0, -3, 648, 803, 29, "#24152c");
  box(content, "Cream panel", 0, -1, 638, 791, 26, "#f7ebd2");
  scenery(content);
  var font = null, labels = [], cancelled = false, readyCancel;
  function label(parent, name, text, x, y, width, height, size, color, outline) {
    var value = node(parent, name, x, y, width, height), textLabel = value.addComponent(cc.Label);
    textLabel.string = text; textLabel.fontSize = size; textLabel.lineHeight = size + 4;
    textLabel.horizontalAlign = cc.Label.HorizontalAlign.CENTER; textLabel.verticalAlign = cc.Label.VerticalAlign.CENTER;
    textLabel.overflow = cc.Label.Overflow.SHRINK; textLabel.enableWrapText = false;
    value.setContentSize(width, height);
    value.color = cc.color(color || "#ffffff"); if (font) textLabel.font = font;
    var stroke = value.addComponent(cc.LabelOutline); stroke.color = cc.color("#100c12"); stroke.width = outline === undefined ? 3 : outline;
    labels.push(textLabel); return value;
  }
  cc.resources.load("localization/fonts/Lilita One", cc.Font, function (error, asset) {
    if (error || cancelled || !live(root)) return; font = asset;
    labels.forEach(function (entry) { if (live(entry.node)) entry.font = font; });
  });
  box(content, "Title outline", 0, 402, 490, 91, 27, "#180e21");
  box(content, "Title highlight", 0, 405, 480, 79, 23, "#d282f6");
  box(content, "Purple title", 0, 400, 469, 69, 20, "#9041bf");
  label(content, "Fighting style title", "Fighting style", 0, 402, 440, 76, 50, null, 4);
  var closeButton = box(content, "Close", 303, 402, 74, 77, 22, "#100d18");
  box(closeButton, "Close shadow", 0, -1, 64, 65, 18, "#006eaa");
  box(closeButton, "Close highlight", 0, 5, 61, 58, 16, "#62ddff");
  box(closeButton, "Close face", 0, 2, 55, 52, 14, "#13b9ee");
  label(closeButton, "Close icon", "×", 0, 2, 55, 55, 57, null, 3);
  function closePicker() {
    if (cancelled) return; cancelled = true;
    canvas.off(cc.Node.EventType.SIZE_CHANGED, resize);
    if (readyCancel) readyCancel(); preview.destroy();
    if (owner._weaponPicker === root) owner._weaponPicker = null;
    root.destroy();
  }
  root._closePicker = closePicker;
  closeButton.on(cc.Node.EventType.TOUCH_END, function (event) { event.stopPropagation(); closePicker(); });
  var stage = node(content, "Hero showcase", 0, 246, 300, 212);
  var preview = require("HeroStylePreview").create(stage, user, function (error) {
    if (live(stage) && !stage.getChildByName("Preview unavailable")) label(stage, "Preview unavailable", "Preview unavailable", 0, 0, 280, 35, 22, "#ffffff", 2);
    if (cc.warn) cc.warn("Fighting style preview: " + error.message);
  });
  var chosen = user.getHeroWeapon().id, body = node(content, "Choices");
  function icon(parent, name, image, x, y, width, height) {
    if (image) return art(parent, name, image.resource, x, y, width, height, false, image.tint);
  }
  function render() {
    if (cancelled || !live(root)) return;
    body.destroyAllChildren(); body.removeAllChildren(); labels = labels.filter(function (entry) { return live(entry.node); });
    var Looks = require("HeroItemLooks");
    Weapons.styles.forEach(function (style, index) {
      var selected = chosen === style.id, equipped = user.getHeroWeapon().id === style.id;
      var tile = node(body, "Style " + style.id, (index % 3 - 1) * 204, 50 - Math.floor(index / 3) * 165, 190, 146);
      if (selected) {
        box(tile, "Selection glow", 0, 0, 202, 158, 32, "#ffdb46");
        box(tile, "Gold selection", 0, 0, 195, 151, 29, "#fff9bf");
      }
      box(tile, "Card outline", 0, -1, 187, 144, 28, "#100e15");
      box(tile, "Card highlight", 0, 3, 179, 133, 24, "#8bd4ff");
      art(tile, "GUI PRO card", BLUE_CARD, 0, -1, 174, 129, true);
      var image = Looks.gearImage(4, user.getHeroWeaponLevel(style.id, 4), "equipment", style.id);
      icon(tile, "Weapon icon", image, style.id === "guardian" ? -20 : 0, 21, style.id === "guardian" ? 115 : 156, 72);
      if (style.id === "guardian") icon(tile, "Shield icon", Looks.gearImage(3, user.getHeroWeaponLevel(style.id, 3), "equipment", style.id), 52, 12, 51, 51);
      label(tile, "Style name", style.name, 0, -39, 176, 43, 29);
      if (equipped) {
        box(tile, "Equipped badge outline", 0, -69, 131, 36, 14, "#111409");
        box(tile, "Equipped badge", 0, -67, 123, 29, 11, "#8ce928");
        label(tile, "Equipped marker", "Equipped", 0, -67, 119, 29, 23, "#173b05", 0);
      }
      tile.on(cc.Node.EventType.TOUCH_END, function (event) { event.stopPropagation(); if (chosen !== style.id) { chosen = style.id; render(); } });
    });
    var weapon = Weapons.find(chosen), equipped = user.getHeroWeapon().id === chosen;
    box(body, "Current levels outline", 0, -255, 612, 80, 24, "#28436c");
    box(body, "Current levels rim", 0, -252, 602, 70, 20, "#638abd");
    box(body, "Current levels", 0, -255, 588, 58, 16, "#294970");
    box(body, "Level divider", 0, -255, 2, 42, 1, "#b3ccec");
    [4,3].forEach(function (slot, index) {
      var level = user.getHeroWeaponLevel(chosen, slot), view = Weapons.gear(chosen, slot, "upgrade");
      icon(body, "Level icon " + slot, Looks.gearImage(slot, level, "upgrade", chosen), index ? 49 : -246, -255, index ? 64 : 80, 52);
      label(body, "Level reference " + slot, view.name + " · Lv " + level, index ? 181 : -118, -255, index ? 191 : 168, 47, 26);
    });
    var action = box(body, equipped ? "Equipped action" : "Equip " + weapon.name, 0, -359, 492, 96, 31, "#1b120a");
    box(action, "Action shadow", 0, -1, 480, 84, 26, equipped ? "#62717d" : "#ce8500");
    box(action, "Action highlight", 0, 6, 474, 72, 24, equipped ? "#c6d0d6" : "#fff9bb");
    box(action, "Action face", 0, 1, 464, 67, 21, equipped ? "#8c9ca7" : "#ffce20");
    label(action, "Equip action label", equipped ? "Equipped" : "Equip " + weapon.name, 0, 2, 450, 65, 40, null, 3);
    action.on(cc.Node.EventType.TOUCH_END, function (event) {
      event.stopPropagation();
      if (!equipped && !cancelled && live(action)) { user.setHeroWeapon(chosen); owner.initView(); render(); }
    });
    preview.setStyle(chosen);
  }
  function resize() {
    root.setContentSize(canvas.width, canvas.height);
    backdrop.clear(); backdrop.rect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height); backdrop.fill();
    content.scale = Math.min(1, (canvas.width - 28) / WIDTH, (canvas.height - 48) / HEIGHT);
  }
  canvas.on(cc.Node.EventType.SIZE_CHANGED, resize);
  render(); readyCancel = require("HeroItemLooks").whenReady(render);
  root.on(cc.Node.EventType.TOUCH_END, function (event) { if (event.target === root) closePicker(); });
}
function close(owner) {
  if (!owner._weaponPicker) return;
  if (owner._weaponPicker._closePicker) owner._weaponPicker._closePicker();
  else { owner._weaponPicker.destroy(); owner._weaponPicker = null; }
}
function installSwitch(owner) {
  if (owner._weaponSwitch || !owner.ndItemTop[0]) return;
  var parent=owner.ndItemTop[0].parent,value=new cc.Node("Switch fighting style");value.setParent(parent);value.setContentSize(56,56);
  var left=Math.min.apply(null,owner.ndItemTop.map(function(item){return item.x-item.width/2;})),middle=(owner.ndItemTop[0].y+owner.ndItemTop[3].y)/2;
  value.setPosition(left-39,middle);value.zIndex=20;
  var graphics=value.addComponent(cc.Graphics);graphics.fillColor=cc.color("#315b98");graphics.strokeColor=cc.color("#fff0b5");graphics.lineWidth=3;graphics.circle(0,0,27);graphics.fill();graphics.stroke();
  art(value,"Switch icon","icons/Pictograms/Pictoicon_Switch",0,0,36,36,false);
  value.on(cc.Node.EventType.TOUCH_END,function(event){event.stopPropagation();open(owner);});owner._weaponSwitch=value;
}
exports.open=open; exports.close=close; exports.installSwitch=installSwitch;
