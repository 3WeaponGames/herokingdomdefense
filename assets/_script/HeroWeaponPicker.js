"use strict";
// Browsing is visual-only. Only the explicit Equip action changes the loadout.
var Weapons = require("HeroWeapons");
var WIDTH = 684, HEIGHT = 1120;
function node(parent, name, x, y, width, height) {
  var value = new cc.Node(name); value.setParent(parent); value.setPosition(x || 0, y || 0);
  if (width) value.setContentSize(width, height); return value;
}
function box(parent, name, x, y, width, height, radius, color) {
  var value = node(parent, name, x, y, width, height), g = value.addComponent(cc.Graphics);
  g.fillColor = cc.color(color); g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill(); return value;
}
function live(value) { return !!value && cc.isValid(value, true); }
function activeSkill(style) {
  var skill = require("HeroSkillAuthoring").entry(style, "active");
  if (!skill) return null;
  var config = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().data;
  var tuning = require("HeroSkillSettings").effective(style, config);
  return { name: skill.name, description: require("HeroSkillDescriptions").render(style, "active", tuning) };
}
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
function skillIcon(parent, style, x, y, size) {
  var clip = node(parent, "Rounded skill icon", x, y, size, size);
  var stencil, mask, iconFrame, display, loading = false, disposed = false;
  function current() { return !disposed && live(clip); }
  function applyMask() {
    // JSB needs the active Mask assembler before changing its stencil.
    if (!stencil || mask || clip.activeInHierarchy === false) return;
    mask = clip.addComponent(cc.Mask);
    mask.type = cc.Mask.Type.IMAGE_STENCIL;
    mask.alphaThreshold = .5;
    mask.spriteFrame = stencil;
    clip.setContentSize(size, size);
  }
  cc.resources.load("skills/rounded-icon-mask", cc.SpriteFrame, function (error, frame) {
    if (error || !live(frame) || !current()) return;
    if (frame.addRef) frame.addRef();
    stencil = frame;
    applyMask();
  });
  var resource = "skills/icons/" + style;
  art(clip, "Skill icon", resource, 0, 0, size, size, false, null, function (done) {
    display = done;
  });
  function loadIcon(retry) {
    loading = true;
    cc.resources.load(resource, cc.SpriteFrame, function (error, frame) {
      loading = false;
      if (!current()) return;
      if (error || !live(frame)) {
        if (retry) loadIcon(false);
        return;
      }
      // The battle HUD can release its copy while this Gear tab is cached.
      if (frame.addRef) frame.addRef();
      iconFrame = frame;
      display(null, frame);
    });
  }
  function refresh() {
    if (!current()) return;
    applyMask();
    if (!loading && !live(iconFrame)) loadIcon(true);
  }
  refresh();
  return {
    node: clip,
    refresh: refresh,
    destroy: function () {
      if (disposed) return;
      disposed = true;
      if (live(clip)) { clip.active = false; clip.destroy(); }
      if (live(iconFrame) && iconFrame.decRef) iconFrame.decRef();
      if (live(stencil) && stencil.decRef) stencil.decRef();
    }
  };
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
  var tutorial = owner.getWeaponPickerTutorial && owner.getWeaponPickerTutorial();
  var canvas = require("UIMgr").UIMgr.getInstance().uiRoot || cc.find("Canvas") || owner.node;
  var root = node(canvas, "Choose fighting style", 0, 0, canvas.width, canvas.height);
  root.zIndex = 10000; root.addComponent(cc.BlockInputEvents); owner._weaponPicker = root;
  var backdrop = root.addComponent(cc.Graphics); backdrop.fillColor = cc.color(0, 0, 0, 185);
  backdrop.rect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height); backdrop.fill();
  var content = node(root, "Weapon choices", 0, 0, WIDTH, HEIGHT); content.addComponent(cc.BlockInputEvents);
  var dialogueHeight = tutorial ? 148 : 0;
  function layout() {
    content.scale = Math.min(1, (canvas.width - 28) / WIDTH, (canvas.height - 48) / (HEIGHT + dialogueHeight));
    content.y = (100 - dialogueHeight / 2) * content.scale;
  }
  layout();
  box(content, "Panel shadow", 0, -118, 684, 1050, 42, "#160e20");
  box(content, "Panel outline", 0, -108, 684, 1050, 42, "#170f20");
  box(content, "Purple frame", 0, -105, 674, 1038, 39, "#853bb5");
  box(content, "Frame highlight", 0, -100, 660, 1018, 33, "#cb7af4");
  box(content, "Inner outline", 0, -103, 648, 1003, 29, "#24152c");
  box(content, "Cream panel", 0, -101, 638, 991, 26, "#f7ebd2");
  scenery(content);
  var font = null, labels = [], cancelled = false, readyCancel, cardIcons = [], cardFrames = [], detailsSkill;
  function clearIcons() {
    cardIcons.forEach(function (icon) { icon.destroy(); }); cardIcons = [];
    cardFrames.forEach(function (frame) { frame.destroy(); }); cardFrames = [];
  }
  function label(parent, name, text, x, y, width, height, size, color, outline) {
    var value = node(parent, name, x, y, width, height), textLabel = value.addComponent(cc.Label);
    textLabel.fontSize = size; textLabel.lineHeight = size + 4;
    textLabel.horizontalAlign = cc.Label.HorizontalAlign.CENTER; textLabel.verticalAlign = cc.Label.VerticalAlign.CENTER;
    textLabel.overflow = cc.Label.Overflow.SHRINK; textLabel.enableWrapText = false;
    value.setContentSize(width, height);
    value.color = cc.color(color || "#ffffff"); if (font) textLabel.font = font;
    var stroke = value.addComponent(cc.LabelOutline); stroke.color = cc.color("#100c12"); stroke.width = outline === undefined ? 3 : outline;
    // Native/TTF activation can initially size the empty label to zero. Apply
    // its final bounds before the first nonempty string reaches SHRINK.
    value.setContentSize(width, height); textLabel.string = text;
    labels.push(textLabel); return value;
  }
  function paragraph(parent, name, text, x, y, width, height, size) {
    var value = label(parent, name, text, x, y, width, height, size, "#fff3d8", 0), body = value.getComponent(cc.Label);
    body._pickerBody = true; body._settingsLayout = true; body._localizedFontRole = "body";
    body._uiTypography = { fontRole: "body", fontFamily: "Arial", outlineWidth: 0, shadowDepth: 0 };
    body.font = null; body.useSystemFont = true; body.fontFamily = "Arial";
    body.enableWrapText = true; body.lineHeight = size + 3; body.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
    value.setContentSize(width, height); return value;
  }
  cc.resources.load("localization/fonts/Lilita One", cc.Font, function (error, asset) {
    if (error || cancelled || !live(root)) return; font = asset;
    labels.forEach(function (entry) { if (live(entry.node) && !entry._pickerBody) entry.font = font; });
  });
  var dialogueText, language;
  if (tutorial) {
    var dialogue = box(content, "Royal Advisor dialogue", 0, 528, 638, dialogueHeight, 23, "#171326");
    dialogue.addComponent(cc.BlockInputEvents);
    box(dialogue, "Dialogue rim", 0, 0, 630, 140, 20, "#638abd");
    box(dialogue, "Dialogue face", 0, 0, 620, 130, 17, "#294970");
    box(dialogue, "Portrait frame", -245, 0, 114, 120, 16, "#1e3559");
    var portrait = node(dialogue, "Royal Advisor portrait", -246, -56);
    portrait.scale = .62;
    cc.resources.load("characters/retired-king-portrait", sp.SkeletonData, function (error, data) {
      if (error || !data || cancelled || !live(portrait)) return;
      var renderer = portrait.addComponent(sp.Skeleton);
      renderer.premultipliedAlpha = false;
      renderer.skeletonData = data;
      renderer.setAnimation(0, "idle", true);
    });
    var speaker = paragraph(dialogue, "Speaker", "", 62, 41, 454, 30, 25);
    speaker.color = cc.color("#ffe5a3");
    var name = speaker.getComponent(cc.Label);
    name.isBold = true; name._uiTypography.isBold = true;
    language = require("LanguageMgr").LanguageMgr.getInstance();
    language.bindLabel(name, "ui.uiguide.labname.27");
    dialogueText = paragraph(dialogue, "Dialogue text", "", 62, -16, 454, 82, 24).getComponent(cc.Label);
  }
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
    if (detailsSkill) detailsSkill.destroy();
    if (readyCancel) readyCancel(); preview.destroy();
    if (owner._weaponPicker === root) owner._weaponPicker = null;
    root.active = false;
    root.destroy();
  }
  function finishPicker() {
    if (cancelled || tutorial && tutorial.onComplete() === false) return false;
    closePicker();
    if (!tutorial && owner.scheduleHomeGuide) owner.scheduleHomeGuide();
    return true;
  }
  root._closePicker = closePicker;
  closeButton.on(cc.Node.EventType.TOUCH_END, function (event) { event.stopPropagation(); finishPicker(); });
  var stage = node(content, "Hero showcase", 0, 250, 300, 224);
  var preview = require("HeroStylePreview").create(stage, user, function (error) {
    if (live(stage) && !stage.getChildByName("Preview unavailable")) label(stage, "Preview unavailable", "Preview unavailable", 0, 0, 280, 35, 22, "#ffffff", 2);
    if (cc.warn) cc.warn("Fighting style preview: " + error.message);
  });
  var chosen = user.getHeroWeapon().id, body = node(content, "Choices");
  var grid = node(body, "Style grid"), details = node(body, "Style details"), cardViews = [];
  function render(rebuildCards) {
    if (cancelled || !live(root)) return;
    var equippedStyle = user.getHeroWeapon().id;
    if (dialogueText) language.bindLabel(dialogueText, equippedStyle === "skirmisher" ? tutorial.text : "tutorial.equipment.keepCurrentWeapon");
    var build = rebuildCards || !cardViews.length;
    if (build) { clearIcons(); grid.destroyAllChildren(); grid.removeAllChildren(); cardViews = []; }
    if (detailsSkill) detailsSkill.destroy();
    details.destroyAllChildren(); details.removeAllChildren(); labels = labels.filter(function (entry) { return live(entry.node); });
    var mainGear = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getEquipCfgList().filter(function (gear) { return gear.id === 4; })[0];
    Weapons.styles.forEach(function (style, index) {
      var selected = chosen === style.id;
      if (!build) {
        if (cardViews[index]) cardViews[index].active = selected;
        return;
      }
      var tile = node(grid, "Style " + style.id, (index % 3 - 1) * 204, 38 - Math.floor(index / 3) * 216, 190, 190);
      var frame = node(tile, "Selection frame"); frame.active = selected;
      box(frame, "Selection outline", 0, -1, 187, 187, 28, "#100e15");
      box(frame, "Selection yellow", 0, 1, 181, 181, 26, "#ffdf62");
      var tier = mainGear.levelInfo[Math.min(mainGear.levelInfo.length, user.getHeroWeaponLevel(style.id, 4)) - 1];
      var clip = node(tile, "Tier clip", 0, -1, 174, 174), mask = clip.addComponent(cc.Mask); mask.type = cc.Mask.Type.IMAGE_STENCIL;
      art(clip, "Tier card", tier.EquipBottom, 0, 0, 174, 174, false, require("EquipmentTiers").tint(tier), function (done) {
        function loaded(error, source) {
          if (cancelled || !live(clip)) return;
          if (error) { done(error); return; }
          // Keep the existing tier artwork and rounded silhouette, showing
          // only its interior. The original pale rim stays outside the crop.
          mask.spriteFrame = source;
          var cropped = source.clone(), rect = source.getRect(), inset = Math.min(rect.width, rect.height) * .12;
          cropped.setRect(cc.rect(rect.x + inset, rect.y + inset, rect.width - inset * 2, rect.height - inset * 2));
          cropped.setOriginalSize(cc.size(rect.width - inset * 2, rect.height - inset * 2)); cropped.setOffset(cc.v2(0, 0));
          cardFrames.push(cropped); done(null, cropped);
        }
        if (owner.loadSpriteFrame) owner.loadSpriteFrame("KinghtFallIconGood", tier.EquipBottom, function (source) { loaded(null, source); });
        else {
          var bundle = cc.assetManager.getBundle("KinghtFallIconGood");
          if (bundle) bundle.load(tier.EquipBottom, cc.SpriteFrame, loaded);
          else cc.assetManager.loadBundle("KinghtFallIconGood", function (error, bundle) { if (!error) bundle.load(tier.EquipBottom, cc.SpriteFrame, loaded); });
        }
      });
      var pose = node(tile, "Weapon pose", 0, 0, 172, 172);
      cardIcons.push(require("HeroWeaponIcon").create(pose, user, style.id, function (error) { if (cc.warn) cc.warn("Fighting style icon: " + error.message); }));
      cardViews[index] = frame;
      label(tile, "Style name", style.name, 0, -66, 176, 40, 29);
      if (equippedStyle === style.id) {
        box(tile, "Equipped badge outline", 0, 80, 131, 36, 14, "#111409");
        box(tile, "Equipped badge", 0, 82, 123, 29, 11, "#8ce928");
        label(tile, "Equipped marker", "Equipped", 0, 82, 119, 29, 23, "#173b05", 0);
      }
      tile.on(cc.Node.EventType.TOUCH_END, function (event) { event.stopPropagation(); if (chosen !== style.id) { chosen = style.id; render(); } });
    });
    var weapon = Weapons.find(chosen), equipped = equippedStyle === chosen;
    var skill = activeSkill(chosen);
    box(details, "Skill panel outline", 0, -374, 612, 180, 24, "#28436c");
    box(details, "Skill panel rim", 0, -371, 602, 170, 20, "#638abd");
    box(details, "Skill panel", 0, -374, 588, 158, 16, "#294970");
    box(details, "Skill icon outline", -232, -374, 122, 122, 20, "#170f20");
    box(details, "Skill icon frame", -232, -372, 114, 114, 17, "#cb7af4");
    detailsSkill = skillIcon(details, chosen, -232, -372, 104);
    var category = paragraph(details, "Skill category", "ACTIVE SKILL", 59, -316, 434, 20, 17).getComponent(cc.Label);
    category.isBold = true; category._uiTypography.isBold = true;
    var title = label(details, "Skill name", skill.name, 59, -341, 434, 30, 30, "#ffffff", 1); title.getComponent(cc.Label).horizontalAlign = cc.Label.HorizontalAlign.LEFT;
    paragraph(details, "Skill description", skill.description, 59, -402, 434, 88, 24).getComponent(cc.Label).lineHeight = 26;
    var action = box(details, equipped ? "Equipped action" : "Equip " + weapon.name, 0, -533, 492, 96, 31, "#1b120a");
    box(action, "Action shadow", 0, -1, 480, 84, 26, equipped ? "#62717d" : "#ce8500");
    box(action, "Action highlight", 0, 6, 474, 72, 24, equipped ? "#c6d0d6" : "#fff9bb");
    box(action, "Action face", 0, 1, 464, 67, 21, equipped ? "#8c9ca7" : "#ffce20");
    label(action, "Equip action label", equipped ? "Equipped" : "Equip " + weapon.name, 0, 2, 450, 65, 40, null, 3);
    action.on(cc.Node.EventType.TOUCH_END, function (event) {
      event.stopPropagation();
      if (!equipped && !cancelled && live(action) && user.setHeroWeapon(chosen)) {
        if (!finishPicker()) render(true);
        owner.initView();
        require("BattleSounds").effect("ui-selection-confirm", owner, { menu: true });
      }
    });
    preview.setStyle(chosen);
  }
  function resize() {
    root.setContentSize(canvas.width, canvas.height);
    backdrop.clear(); backdrop.rect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height); backdrop.fill();
    layout();
  }
  canvas.on(cc.Node.EventType.SIZE_CHANGED, resize);
  render(); readyCancel = require("HeroItemLooks").whenReady(function () { render(true); });
  root.on(cc.Node.EventType.TOUCH_END, function (event) { if (event.target === root) finishPicker(); });
}
function close(owner, disposing) {
  closeSkill(owner);
  var button = owner._gearSkillButton;
  if (disposing && button && button._skillIcon) button._skillIcon.destroy();
  if (!owner._weaponPicker) return;
  if (owner._weaponPicker._closePicker) owner._weaponPicker._closePicker();
  else { owner._weaponPicker.destroy(); owner._weaponPicker = null; }
}
function closeSkill(owner) {
  if (owner._gearSkillPopup) owner._gearSkillPopup.close();
}
function openSkill(owner, style) {
  if (owner._gearSkillPopup || owner._weaponPicker) return;
  var skill = activeSkill(style);
  if (!skill) return;
  var canvas = cc.find("Canvas") || owner.node;
  var root = node(canvas, "Fighting skill details", 0, 0, canvas.width, canvas.height);
  root.zIndex = 10000;
  root.addComponent(cc.BlockInputEvents);
  var backdrop = root.addComponent(cc.Graphics);
  var panel = box(root, "Skill panel outline", 0, 0, 604, 400, 28, "#170f20");
  panel.addComponent(cc.BlockInputEvents);
  box(panel, "Skill panel rim", 0, 0, 594, 390, 24, "#cb7af4");
  box(panel, "Skill panel face", 0, 0, 580, 376, 20, "#294970");
  box(panel, "Skill icon frame", -222, 118, 88, 88, 15, "#170f20");
  var icon = skillIcon(panel, style, -222, 118, 80);
  function text(name, value, x, y, width, height, size, wrap) {
    var child = node(panel, name, x, y, width, height), label = child.addComponent(cc.Label);
    label.useSystemFont = true; label.fontFamily = "Arial";
    label.fontSize = size; label.lineHeight = size + 5; label.isBold = !wrap;
    label.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
    label.verticalAlign = wrap ? cc.Label.VerticalAlign.TOP : cc.Label.VerticalAlign.CENTER;
    label.enableWrapText = wrap; label.overflow = cc.Label.Overflow.SHRINK;
    child.color = cc.color("#fff3d8"); child.setContentSize(width, height); label.string = value;
  }
  text("Skill name", skill.name, 12, 118, 346, 64, 38, false);
  text("Skill description", skill.description, 0, -49, 516, 224, 30, true);
  var dismiss = box(panel, "Close", 245, 123, 62, 62, 16, "#13a6dd");
  art(dismiss, "Close icon", "icons/Pictograms/Pictoicon_Close_Outlined", 0, 0, 42, 42, false);
  function resize() {
    root.setContentSize(canvas.width, canvas.height);
    backdrop.clear(); backdrop.fillColor = cc.color(0, 0, 0, 185);
    backdrop.rect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height); backdrop.fill();
    panel.scale = Math.min(1, (canvas.width - 28) / 604, (canvas.height - 48) / 400);
  }
  function dismissPopup() {
    canvas.off(cc.Node.EventType.SIZE_CHANGED, resize);
    owner._gearSkillPopup = null;
    icon.destroy();
    root.active = false; root.destroy();
  }
  owner._gearSkillPopup = { close: dismissPopup };
  canvas.on(cc.Node.EventType.SIZE_CHANGED, resize);
  function finishPopup() {
    dismissPopup();
    if (owner.scheduleHomeGuide) owner.scheduleHomeGuide();
  }
  dismiss.on(cc.Node.EventType.TOUCH_END, function (event) { event.stopPropagation(); finishPopup(); });
  root.on(cc.Node.EventType.TOUCH_END, function (event) { if (event.target === root) finishPopup(); });
  resize();
}
function refreshSkill(owner) {
  var actor = owner.ctrPlayAni && owner.ctrPlayAni.node, preview = actor && actor.parent;
  if (!preview || !preview.parent) return;
  var style = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData().getHeroWeapon().id;
  var button = owner._gearSkillButton;
  if (!live(button)) {
    if (button && button._skillIcon) button._skillIcon.destroy();
    button = box(preview.parent, "Fighting skill", preview.x - 96, preview.y + 92, 82, 82, 16, "#170f20");
    box(button, "Skill button rim", 0, 0, 76, 76, 13, "#cb7af4");
    button.zIndex = 20;
    button.on(cc.Node.EventType.TOUCH_END, function (event) { event.stopPropagation(); openSkill(owner, button._skillStyle); });
    owner._gearSkillButton = button;
  }
  if (style === button._skillStyle && button._skillIcon && live(button._skillIcon.node)) {
    button._skillIcon.refresh();
    return;
  }
  closeSkill(owner);
  if (button._skillIcon) button._skillIcon.destroy();
  button._skillStyle = style;
  button._skillIcon = skillIcon(button, style, 0, 0, 70);
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
exports.open=open; exports.close=close; exports.installSwitch=installSwitch; exports.refreshSkill=refreshSkill;
