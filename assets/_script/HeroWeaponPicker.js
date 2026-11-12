"use strict";
// Browsing is visual-only. Only the explicit Equip action changes the loadout.
var Weapons = require("HeroWeapons");
var WIDTH = 684, HEIGHT = 990;
function node(parent, name, x, y, width, height) {
  var value = new cc.Node(name); value.setParent(parent); value.setPosition(x || 0, y || 0);
  if (width) value.setContentSize(width, height); return value;
}
function box(parent, name, x, y, width, height, radius, color) {
  var value = node(parent, name, x, y, width, height), g = value.addComponent(cc.Graphics);
  g.fillColor = cc.color(color); g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill(); return value;
}
function live(value) { return cc.isValid(value, true); }
function art(parent, name, resource, x, y, width, height, sliced, tint, loadFrame) {
  var value = node(parent, name, x, y, width, height), sprite = value.addComponent(cc.Sprite);
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  function loaded(error, frame) {
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
  }
  if (loadFrame) loadFrame(loaded); else cc.resources.load(resource, cc.SpriteFrame, loaded);
  return value;
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
  var font = null, labels = [], cancelled = false, readyCancel, cardIcons = [];
  function clearIcons() { cardIcons.forEach(function (icon) { icon.destroy(); }); cardIcons = []; }
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
  art(closeButton, "Close icon", "icons/Pictograms/Pictoicon_Close_Outlined", 0, 2, 49, 52, false);
  function closePicker() {
    if (cancelled) return; cancelled = true;
    canvas.off(cc.Node.EventType.SIZE_CHANGED, resize);
    clearIcons();
    if (readyCancel) readyCancel(); preview.destroy();
    if (owner._weaponPicker === root) owner._weaponPicker = null;
    root.destroy();
  }
  root._closePicker = closePicker;
  closeButton.on(cc.Node.EventType.TOUCH_END, function (event) { event.stopPropagation(); closePicker(); });
  var stage = node(content, "Hero showcase", 0, 250, 300, 224);
  var preview = require("HeroStylePreview").create(stage, user, function (error) {
    if (live(stage) && !stage.getChildByName("Preview unavailable")) label(stage, "Preview unavailable", "Preview unavailable", 0, 0, 280, 35, 22, "#ffffff", 2);
    if (cc.warn) cc.warn("Fighting style preview: " + error.message);
  });
  var chosen = user.getHeroWeapon().id, body = node(content, "Choices");
  var grid = node(body, "Style grid"), details = node(body, "Style details"), cardViews = [];
  function icon(parent, name, image, x, y, width, height) {
    if (image) return art(parent, name, image.resource, x, y, width, height, false, image.tint);
  }
  function render(rebuildCards) {
    if (cancelled || !live(root)) return;
    var build = rebuildCards || !cardViews.length;
    if (build) { clearIcons(); grid.destroyAllChildren(); grid.removeAllChildren(); cardViews = []; }
    details.destroyAllChildren(); details.removeAllChildren(); labels = labels.filter(function (entry) { return live(entry.node); });
    var Looks = require("HeroItemLooks");
    var mainGear = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getEquipCfgList().filter(function (gear) { return gear.id === 4; })[0];
    Weapons.styles.forEach(function (style, index) {
      var selected = chosen === style.id, equipped = user.getHeroWeapon().id === style.id;
      if (!build) {
        var view = cardViews[index], glow = view.rim.getComponent(cc.Graphics), stroke = view.edge.getComponent(cc.Graphics);
        view.rim.opacity = selected ? 255 : 60; glow.clear(); glow.fillColor = cc.color(selected ? "#ffdf62" : "#ffffff");
        glow.roundRect(-89.5, -89.5, 179, 179, 24); glow.fill();
        stroke.clear(); stroke.strokeColor = selected ? cc.color("#ffdf62") : cc.color(255, 255, 255, 55);
        stroke.roundRect(-86, -86, 172, 172, 24); stroke.stroke(); return;
      }
      var tile = node(grid, "Style " + style.id, (index % 3 - 1) * 204, 38 - Math.floor(index / 3) * 216, 190, 190);
      box(tile, "Card outline", 0, -1, 187, 187, 28, "#100e15");
      var rim = box(tile, "Card highlight", 0, 1, 179, 179, 24, selected ? "#ffdf62" : "#ffffff");
      if (!selected) rim.opacity = 60;
      var tier = mainGear.levelInfo[Math.min(mainGear.levelInfo.length, user.getHeroWeaponLevel(style.id, 4)) - 1];
      art(tile, "Tier card", tier.EquipBottom, 0, -1, 174, 174, true, require("EquipmentTiers").tint(tier), function (done) {
        if (owner.loadSpriteFrame) owner.loadSpriteFrame("KinghtFallIconGood", tier.EquipBottom, function (frame) { done(null, frame); });
        else {
          var bundle = cc.assetManager.getBundle("KinghtFallIconGood");
          if (bundle) bundle.load(tier.EquipBottom, cc.SpriteFrame, done);
          else cc.assetManager.loadBundle("KinghtFallIconGood", function (error, loaded) { if (!error) loaded.load(tier.EquipBottom, cc.SpriteFrame, done); });
        }
      });
      var edge = node(tile, "Card edge", 0, 0, 178, 178), border = edge.addComponent(cc.Graphics);
      border.strokeColor = selected ? cc.color("#ffdf62") : cc.color(255, 255, 255, 55); border.lineWidth = 4;
      border.roundRect(-86, -86, 172, 172, 24); border.stroke();
      var pose = node(tile, "Weapon pose", 0, 0, 172, 172);
      cardIcons.push(require("HeroWeaponIcon").create(pose, user, style.id, function (error) { if (cc.warn) cc.warn("Fighting style icon: " + error.message); }));
      cardViews.push({ rim: rim, edge: edge });
      label(tile, "Style name", style.name, 0, -66, 176, 40, 29);
      if (equipped) {
        box(tile, "Equipped badge outline", 0, 80, 131, 36, 14, "#111409");
        box(tile, "Equipped badge", 0, 82, 123, 29, 11, "#8ce928");
        label(tile, "Equipped marker", "Equipped", 0, 82, 119, 29, 23, "#173b05", 0);
      }
      tile.on(cc.Node.EventType.TOUCH_END, function (event) { event.stopPropagation(); if (chosen !== style.id) { chosen = style.id; render(); } });
    });
    var weapon = Weapons.find(chosen), equipped = user.getHeroWeapon().id === chosen;
    box(details, "Current levels outline", 0, -335, 612, 80, 24, "#28436c");
    box(details, "Current levels rim", 0, -332, 602, 70, 20, "#638abd");
    box(details, "Current levels", 0, -335, 588, 58, 16, "#294970");
    box(details, "Level divider", 0, -335, 2, 42, 1, "#b3ccec");
    [4,3].forEach(function (slot, index) {
      var level = user.getHeroWeaponLevel(chosen, slot), view = Weapons.gear(chosen, slot, "upgrade");
      icon(details, "Level icon " + slot, Looks.gearImage(slot, level, "upgrade", chosen), index ? 49 : -246, -335, index ? 64 : 80, 52);
      label(details, "Level reference " + slot, view.name + " · Lv " + level, index ? 181 : -118, -335, index ? 191 : 168, 47, 26);
    });
    var action = box(details, equipped ? "Equipped action" : "Equip " + weapon.name, 0, -433, 492, 96, 31, "#1b120a");
    box(action, "Action shadow", 0, -1, 480, 84, 26, equipped ? "#62717d" : "#ce8500");
    box(action, "Action highlight", 0, 6, 474, 72, 24, equipped ? "#c6d0d6" : "#fff9bb");
    box(action, "Action face", 0, 1, 464, 67, 21, equipped ? "#8c9ca7" : "#ffce20");
    label(action, "Equip action label", equipped ? "Equipped" : "Equip " + weapon.name, 0, 2, 450, 65, 40, null, 3);
    action.on(cc.Node.EventType.TOUCH_END, function (event) {
      event.stopPropagation();
      if (!equipped && !cancelled && live(action)) { user.setHeroWeapon(chosen); owner.initView(); render(true); }
    });
    preview.setStyle(chosen);
  }
  function resize() {
    root.setContentSize(canvas.width, canvas.height);
    backdrop.clear(); backdrop.rect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height); backdrop.fill();
    content.scale = Math.min(1, (canvas.width - 28) / WIDTH, (canvas.height - 48) / HEIGHT);
  }
  canvas.on(cc.Node.EventType.SIZE_CHANGED, resize);
  render(); readyCancel = require("HeroItemLooks").whenReady(function () { render(true); });
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
