"use strict";

var Encounter = require("UnitTestEncounter");
var WIDTH = 704, HEIGHT = 876;
var COLUMNS = 4, PAGE_SIZE = 12;
var COLORS = {
  panel: "#25313c", border: "#546777", field: "#19232e", card: "#303e4b",
  selected: "#355d76", highlight: "#97dbfc", text: "#f0f5fa", muted: "#b8cad8",
  primary: "#8bd4fb", primaryText: "#132b3d", disabled: "#26333e", error: "#ffb0a1"
};

function node(parent, name, x, y, width, height) {
  var item = new cc.Node(name);
  item.setContentSize(width, height);
  if (parent) {
    item.setPosition(x + (width - parent.width) / 2, (parent.height - height) / 2 - y);
    parent.addChild(item);
  }
  return item;
}

function paint(item, fill, stroke) {
  var graphics = item.getComponent(cc.Graphics) || item.addComponent(cc.Graphics);
  graphics.clear();
  graphics.fillColor = cc.color(fill);
  graphics.strokeColor = cc.color(stroke || fill);
  graphics.lineWidth = 2;
  graphics.roundRect(-item.width / 2, -item.height / 2, item.width, item.height, 8);
  graphics.fill();
  graphics.stroke();
}

function label(parent, name, value, x, y, width, height, size, color, left) {
  var item = node(parent, name, x, y, width, height);
  var text = item.addComponent(cc.Label);
  text.fontSize = size;
  text.lineHeight = Math.ceil(size * 1.2);
  text.horizontalAlign = left ? cc.Label.HorizontalAlign.LEFT : cc.Label.HorizontalAlign.CENTER;
  text.verticalAlign = cc.Label.VerticalAlign.CENTER;
  text.overflow = cc.Label.Overflow.SHRINK;
  text.enableWrapText = false;
  text.string = value;
  item.setContentSize(width, height);
  item.color = cc.color(color || COLORS.text);
  return text;
}

function button(parent, name, value, x, y, width, height, action, primary) {
  var item = node(parent, name, x, y, width, height);
  var caption = label(item, "Caption", value, 6, 0, width - 12, height, 23);
  var enabled;
  item.on(cc.Node.EventType.TOUCH_END, function (event) {
    event.stopPropagation();
    if (enabled) action();
  });
  function setEnabled(next) {
    if (enabled === next) return;
    enabled = next;
    paint(item, next ? primary ? COLORS.primary : COLORS.card : COLORS.disabled, next ? COLORS.border : COLORS.disabled);
    caption.node.color = cc.color(next ? primary ? COLORS.primaryText : COLORS.text : COLORS.muted);
    caption.node.opacity = next ? 255 : 115;
  }
  setEnabled(true);
  return { caption: caption, setEnabled: setEnabled };
}

function input(parent, name, value, placeholder, x, y, width, mode, maxLength) {
  var item = node(parent, name, x, y, width, 50);
  paint(item, COLORS.field, COLORS.border);
  var text = label(item, "Text", "", 12, 0, width - 24, 50, 24, COLORS.text, true);
  var hint = label(item, "Placeholder", "", 12, 0, width - 24, 50, 23, COLORS.muted, true);
  [text.node, hint.node].forEach(function (child) {
    // EditBox keeps its labels top-left anchored on both web and JSB.
    child.setAnchorPoint(0, 1);
    child.setPosition(12 - width / 2, 25);
  });
  var box = item.addComponent(cc.EditBox);
  box.textLabel = text;
  box.placeholderLabel = hint;
  box.inputMode = cc.EditBox.InputMode[mode];
  box.maxLength = maxLength;
  box.placeholder = placeholder;
  box.string = value;
  return box;
}

function stepper(parent, name, x, y, width, cycle) {
  var item = node(parent, name, x, y, width, 46);
  paint(item, COLORS.field, COLORS.border);
  var value = label(item, "Value", "", 48, 0, width - 96, 46, 23);
  var previous = button(item, "Previous", "‹", 0, 0, 46, 46, function () { cycle(-1); });
  var next = button(item, "Next", "›", width - 46, 0, 46, 46, function () { cycle(1); });
  return function (caption, length) {
    value.string = caption;
    previous.setEnabled(length > 1);
    next.setEnabled(length > 1);
  };
}

function loadAsset(bundleName, path, type, done) {
  var bundle = cc.assetManager.getBundle(bundleName);
  if (bundle) bundle.load(path, type, done);
  else cc.assetManager.loadBundle(bundleName, function (error, loaded) {
    if (error) done(error);
    else loaded.load(path, type, done);
  });
}

function releasePortrait(card) {
  var frame = card.sprite.spriteFrame;
  if (!frame) return;
  card.sprite.spriteFrame = null;
  frame.decRef();
}

function drawCard(card, model, selected, enemyBundle, isOpen) {
  card.node.active = !!model;
  if (!model) return;
  if (card.selected !== selected) {
    card.selected = selected;
    paint(card.node, selected ? COLORS.selected : COLORS.card, selected ? COLORS.highlight : COLORS.border);
  }
  if (card.model === model) return;
  releasePortrait(card);
  card.model = model;
  card.name.string = model.name;
  card.name.node.y = model.displayPack ? -21 : -31;
  card.pack.string = model.displayPack ? model.pack : "";
  if (!model.icon) return;
  var isResource = model.icon.indexOf("@icon/") === 0;
  loadAsset(isResource ? "resources" : enemyBundle, isResource ? model.icon.slice(6) : "icon/" + model.icon, cc.SpriteFrame, function (error, frame) {
    if (error || !frame || !isOpen() || card.model !== model) return;
    // Returning to the same page can share an in-flight load with the first visit.
    if (card.sprite.spriteFrame === frame) return;
    releasePortrait(card);
    card.sprite.spriteFrame = frame.addRef();
    var size = frame.getOriginalSize(), scale = (model.displayPack ? 49 : 58) / Math.max(size.width, size.height, 1);
    card.sprite.node.setContentSize(size.width * scale, size.height * scale);
  });
}

function open(ui) {
  if (!Encounter.canOpen(ui)) return false;
  var game = ui.ctrGame, data = game.gameData, epoch = game._combatEpoch, run = game._unitTest;
  var manager = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance();
  var language = require("LanguageMgr").LanguageMgr.getInstance();
  var models = Encounter.catalog(manager, data.levelCfg, language.t.bind(language));
  var spawns = Encounter.spawnPoints(game);
  var enemyBundle = require("KinghtFallConfig").KinghtFallBundelName.Enemy;
  var draft = ui._unitTestDraft || { query: "", count: "1", interval: "0.5", follow: true };
  var filtered = [], page = 0, profile = null;
  var spawnIndex = Math.max(0, spawns.findIndex(function (spawn) { return spawn.id === draft.spawn; }));
  var pending = null, message = "", cards = [], previousLayout;
  var parent = ui.ctrUI.node, root = node(null, "UnitTestOverlay", 0, 0, 0, 0);
  root.active = false;
  root.zIndex = 10001;
  parent.addChild(root);
  root.addComponent(cc.BlockInputEvents);
  var shade = root.addComponent(cc.Graphics);
  var panel = node(root, "UnitTestPanel", 0, 0, WIDTH, HEIGHT);
  paint(panel, COLORS.panel, COLORS.border);
  var state = ui._unitTestPanel = { close: close, layout: layout };

  function isOpen() { return ui._unitTestPanel === state && cc.isValid(root, true); }
  function current() {
    return isOpen() && Encounter.canOpen(ui) && ui.ctrGame === game && game.gameData === data && game._combatEpoch === epoch;
  }
  function close() {
    if (ui._unitTestPanel !== state) return;
    ui._unitTestPanel = null;
    pending = null;
    if (!cc.isValid(root, true)) return;
    ui._unitTestDraft = {
      query: search.string, count: count.string, interval: interval.string,
      unit: profile && profile.id, spawn: spawns[spawnIndex] && spawns[spawnIndex].id, follow: draft.follow
    };
    root.active = false;
    cards.forEach(releasePortrait);
    root.destroy();
  }
  function layout() {
    if (!current()) { close(); return; }
    var origin = cc.view.getVisibleOrigin(), visible = cc.view.getVisibleSize();
    var key = [origin.x, origin.y, visible.width, visible.height].join("|");
    if (key === previousLayout) return;
    previousLayout = key;
    var a = parent.convertToNodeSpaceAR(origin);
    var b = parent.convertToNodeSpaceAR(cc.v2(origin.x + visible.width, origin.y + visible.height));
    root.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2);
    root.setContentSize(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    shade.clear();
    shade.fillColor = cc.color(8, 15, 23, 205);
    shade.rect(-root.width / 2, -root.height / 2, root.width, root.height);
    shade.fill();
    panel.setPosition(0, 0);
    panel.scale = Math.max(.01, Math.min(1, (root.width - 24) / WIDTH, (root.height - 24) / HEIGHT));
  }

  var title = label(panel, "Title", "Unit Test", 24, 18, 525, 50, 36, COLORS.text, true);
  title.enableBold = true;
  label(panel, "Shortcut", "F7", 550, 20, 56, 46, 23, COLORS.muted);
  button(panel, "Close", "×", 626, 20, 54, 46, close);
  var search = input(panel, "Search", draft.query, "Search models, packs, or profiles", 24, 84, 656, "SINGLE_LINE", 80);
  search.node.on("text-changed", function () { filter(); });

  for (var i = 0; i < PAGE_SIZE; i++) {
    var tile = node(panel, "Model " + (i + 1), 24 + i % COLUMNS * 166, 150 + Math.floor(i / COLUMNS) * 108, 158, 100);
    var icon = node(tile, "Portrait", 50, 6, 58, 58).addComponent(cc.Sprite);
    icon.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    var caption = label(tile, "Name", "", 7, 68, 144, 26, 20);
    var pack = label(tile, "Asset pack", "", 7, 83, 144, 16, 14, COLORS.muted);
    var card = { node: tile, sprite: icon, name: caption, pack: pack };
    cards.push(card);
    tile.on(cc.Node.EventType.TOUCH_END, selectModel.bind(null, card));
  }
  function selectModel(card, event) {
    event.stopPropagation();
    if (!card.model || profile && card.model === profile.model) return;
    profile = card.model.profiles[0];
    render();
  }

  function changePage(direction) {
    page += direction;
    var visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    if (!profile || visible.indexOf(profile.model) === -1) profile = visible[0].profiles[0];
    render();
  }
  var prevPage = button(panel, "Previous page", "‹", 24, 482, 66, 42, function () { changePage(-1); });
  var nextPage = button(panel, "Next page", "›", 614, 482, 66, 42, function () { changePage(1); });
  var range = label(panel, "Model range", "", 100, 482, 504, 42, 22, COLORS.muted);
  label(panel, "Profile label", "Fighting profile", 24, 538, 320, 26, 21, COLORS.muted, true);
  label(panel, "Spawn label", "Spawn point", 368, 538, 312, 26, 21, COLORS.muted, true);
  var profileControl = stepper(panel, "Profile", 24, 567, 312, function (direction) {
    var choices = profile.model.profiles;
    profile = choices[(choices.indexOf(profile) + direction + choices.length) % choices.length];
    render();
  });
  var spawnControl = stepper(panel, "Spawn point", 368, 567, 312, function (direction) {
    spawnIndex = (spawnIndex + direction + spawns.length) % spawns.length;
    render();
  });

  label(panel, "Count label", "Count", 24, 625, 158, 26, 21, COLORS.muted, true);
  label(panel, "Spacing label", "Spacing (s)", 206, 625, 158, 26, 21, COLORS.muted, true);
  label(panel, "Camera label", "Camera", 388, 625, 292, 26, 21, COLORS.muted, true);
  var count = input(panel, "Count", draft.count, "", 24, 653, 158, "NUMERIC", String(Encounter.MAX_COUNT).length);
  var interval = input(panel, "Spacing", draft.interval, "", 206, 653, 158, "SINGLE_LINE", 5);
  var camera = button(panel, "Follow test units", "", 388, 653, 292, 50, function () {
    draft.follow = !draft.follow;
    if (run) run.follow = draft.follow;
    render();
  });

  var status = label(panel, "Status", "", 24, 714, 656, 36, 22, COLORS.muted, true);
  var clearUnits = button(panel, "Clear units", "Clear units", 24, 762, 172, 54, function () {
    pending = null;
    if (run) run.dispose();
    run = null;
    message = "";
    render();
  });
  var attack = button(panel, "Play attack", "Play attack", 210, 762, 172, 54, function () {
    if (run) run.playAttack();
    close();
  });
  var send = button(panel, "Send units", "Send units", 396, 762, 284, 54, sendUnits, true);
  label(panel, "Preview rules", "Test attacks play without dealing damage.", 24, 830, 656, 26, 20, COLORS.muted, true);

  function filter() {
    var terms = search.string.toLowerCase().trim().split(/\s+/).filter(Boolean);
    filtered = models.filter(function (model) {
      return terms.every(function (term) { return model.searchText.indexOf(term) !== -1; });
    });
    if (!profile || filtered.indexOf(profile.model) === -1) profile = filtered.length ? filtered[0].profiles[0] : null;
    page = 0;
    if (profile) page = Math.floor(filtered.indexOf(profile.model) / PAGE_SIZE);
    render();
  }
  function render() {
    var start = page * PAGE_SIZE;
    cards.forEach(function (card, i) {
      var model = filtered[start + i];
      drawCard(card, model, !!(profile && profile.model === model), enemyBundle, isOpen);
    });
    if (filtered.length <= 1) range.string = filtered.length ? "1 model" : "No matching models";
    else range.string = (start + 1) + "–" + Math.min(start + PAGE_SIZE, filtered.length) + " of " + filtered.length + " models";
    prevPage.setEnabled(page > 0);
    nextPage.setEnabled(start + PAGE_SIZE < filtered.length);
    profileControl(profile ? profile.name : "Choose a model", profile ? profile.model.profiles.length : 0);
    spawnControl(spawns.length ? spawns[spawnIndex].name : "No enabled spawns", spawns.length);
    camera.caption.string = draft.follow ? "Follow test units" : "Stay with hero";
    send.setEnabled(!!profile && spawns.length > 0 && !pending);
    clearUnits.setEnabled(!!run || !!pending);
    attack.setEnabled(!!run && !pending);
    status.node.color = cc.color(message ? COLORS.error : COLORS.muted);
    status.string = message || (pending ? "Loading " + pending.profile.model.name + "…" :
      run ? run.error || "On stage · " + run.count + " × " + run.profile.model.name :
      profile ? profile.model.name + " · " + profile.model.pack : "");
  }
  function sendUnits() {
    if (!current() || pending || !profile) return;
    var unit = manager.getSoldierCfgById(profile.id), spawn = spawns[spawnIndex] && spawns[spawnIndex].id;
    var total = Number(count.string), delay = Number(interval.string);
    try { Encounter.validate(game, unit, total, spawn, delay); }
    catch (error) { message = error.message; render(); return; }
    var request = pending = { profile: profile, follow: draft.follow };
    message = "";
    render();
    loadAsset(enemyBundle, unit.prefab, cc.Prefab, function (error, prefab) {
      if (!current() || pending !== request) return;
      pending = null;
      if (error || !prefab) {
        message = "Could not load " + request.profile.model.name + ".";
        render();
        return;
      }
      try { run = Encounter.send(game, prefab, request.profile, spawn, total, delay, request.follow); }
      catch (spawnError) { message = spawnError.message; render(); return; }
      close();
    });
  }

  if (draft.unit) models.some(function (model) {
    profile = model.profiles.find(function (choice) { return choice.id === draft.unit; });
    return !!profile;
  });
  layout();
  filter();
  root.active = true;
  if (ui.ctrUI.onBlockTouch) ui.ctrUI.onBlockTouch();
  return true;
}

exports.toggle = function (ui) {
  if (ui._unitTestPanel) { ui._unitTestPanel.close(); return true; }
  return open(ui);
};
