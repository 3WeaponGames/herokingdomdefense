"use strict";

var Settings = require("WaveTestSettings");
var groupNames = require("UnitTestEncounter").spawnPoints;
var uiControls = require("UnitTestPanel").controls;
var node = uiControls.node, paint = uiControls.paint, label = uiControls.label;
var button = uiControls.button, input = uiControls.input, colors = uiControls.colors;
var WIDTH = 704, ROWS_PER_PAGE = 8;

function canOpen(ui) {
  var game = ui.ctrGame, data = game && game.gameData, level = data && data.levelCfg;
  var phases = require("KinghtFallModle").KinghtFallGameStage;
  return !!(level && level.WaveCfg && level.WaveCfg[data.round - 1] && game.ndMain && game.ndPath &&
    ui.ctrUI && ui.ctrUI.node && ui.canBreak && !ui.isclose && !ui.isPauset && !ui._isEntryLoading &&
    !ui._enemyGuide && !ui._battleDialog && !ui._unitTestPanel && !ui._restartPending &&
    (game.gameStatus === phases.Prepare || ui.isWaveInProgress()));
}

function unitName(manager, language, level, id) {
  var unit = manager.getSoldierCfgById(id), custom = level.EnemyProfiles && level.EnemyProfiles[id];
  var name = unit && language.t(unit.Name) || "Enemy " + id;
  if (custom) return name + " · " + custom.name;
  var settings = manager.data.GameTools || {}, assignments = settings.unitTypeAssignments || {};
  var form = id >= 90010 && id <= 90012 ? id - 90009 : "default";
  var role = unit && (unit.FightingType || assignments["enemy:" + unit.ID + ":" + form]);
  var type = settings.unitTypes && settings.unitTypes[role];
  return type ? name + " · " + language.t(type.name) : name;
}

function open(ui) {
  if (!canOpen(ui)) return false;
  var game = ui.ctrGame, data = game.gameData, model = Settings.describe(data);
  var fighting = ui.isWaveInProgress(), prepare = require("KinghtFallModle").KinghtFallGameStage.Prepare;
  var manager = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance();
  var language = require("LanguageMgr").LanguageMgr.getInstance();
  var spawns = new Map(groupNames(game).map(function (spawn) { return [spawn.id, spawn.name]; }));
  var counts = model.rows.map(function (row, index) { return String(model.test ? model.test.counts[index] : row.count); });
  var values = model.test ? model.test.wave : model.wave;
  var page = 0, pageCount = Math.max(1, Math.ceil(counts.length / ROWS_PER_PAGE)), slots = [];
  var rowCount = Math.min(counts.length, ROWS_PER_PAGE);
  var listEnd = 254 + 62 * Math.max(1, rowCount), footer = listEnd + (pageCount > 1 ? 48 : 2);
  var height = footer + 120;
  var dialog = ui.beginBattleDialog("wave-test");
  if (!dialog) return false;
  var parent = ui.ctrUI.node, root = node(null, "WaveTestOverlay", 0, 0, 0, 0);
  root.active = false;
  root.zIndex = 10002;
  parent.addChild(root);
  root.addComponent(cc.BlockInputEvents);
  var shade = root.addComponent(cc.Graphics), panel = node(root, "WaveTestPanel", 0, 0, WIDTH, height);
  paint(panel, colors.panel, colors.border);
  var state = ui._waveTestPanel = { close: close, layout: layout };
  var viewport;

  function current() {
    return ui._waveTestPanel === state && cc.isValid(root, true) && dialog.isCurrent() &&
      ui._pauseOwners && ui._pauseOwners.has(dialog) &&
      (fighting ? ui.isWaveInProgress() : game.gameStatus === prepare);
  }

  function close() {
    if (ui._waveTestPanel !== state) return;
    ui._waveTestPanel = null;
    if (cc.isValid(root, true)) { root.active = false; root.destroy(); }
    ui.finishBattleDialog(dialog);
  }

  function layout() {
    if (!current()) { close(); return; }
    var origin = cc.view.getVisibleOrigin(), size = cc.view.getVisibleSize();
    var key = [origin.x, origin.y, size.width, size.height].join("|");
    if (key === viewport) return;
    viewport = key;
    var first = parent.convertToNodeSpaceAR(origin);
    var last = parent.convertToNodeSpaceAR(cc.v2(origin.x + size.width, origin.y + size.height));
    root.setPosition((first.x + last.x) / 2, (first.y + last.y) / 2);
    root.setContentSize(Math.abs(last.x - first.x), Math.abs(last.y - first.y));
    shade.clear();
    shade.fillColor = cc.color(8, 15, 23, 205);
    shade.rect(-root.width / 2, -root.height / 2, root.width, root.height);
    shade.fill();
    panel.setPosition(0, 0);
    panel.scale = Math.max(.01, Math.min(1, (root.width - 24) / WIDTH, (root.height - 24) / height));
  }

  function summary() {
    var total = counts.reduce(function (sum, text) { return sum + (Number(text) || 0); }, 0);
    tally.string = total + (total === 1 ? " enemy" : " enemies");
  }

  function readCounts() {
    slots.forEach(function (slot) {
      if (slot.index < counts.length) counts[slot.index] = slot.count.string;
    });
  }

  function showPage() {
    slots.forEach(function (slot, position) {
      slot.index = page * ROWS_PER_PAGE + position;
      var row = model.rows[slot.index];
      slot.root.active = !!row;
      if (!row) return;
      slot.name.string = unitName(manager, language, data.levelCfg, row.unitId);
      var spawn = spawns.get(row.spawnId) || "Spawn " + row.spawnId;
      slot.detail.string = row.start === undefined ? spawn + " · Group " + (slot.index + 1)
        : spawn + " · " + row.start + " s" + (row.interval ? " / every " + row.interval + " s" : "");
      slot.count.string = counts[slot.index];
    });
    if (pageLabel) {
      pageLabel.string = (page + 1) + " / " + pageCount;
      previous.setEnabled(page > 0);
      next.setEnabled(page + 1 < pageCount);
    }
    summary();
  }

  function shift(direction) {
    readCounts();
    page += direction;
    showPage();
  }

  function reset() {
    hp.string = String(model.wave.HealthCoefficient);
    damage.string = String(model.wave.AttackCoefficient);
    counts = model.rows.map(function (row) { return String(row.count); });
    message.string = "";
    showPage();
  }

  function apply() {
    if (!current()) return;
    readCounts();
    try {
      var test = Settings.adjustment(model, hp.string, damage.string, counts, data.packInterval);
      if (test) require("RewardTestProgress").start(require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance());
      if (fighting) {
        if (!ui.restartPausedBattle(dialog, "wave", test)) message.string = "The wave could not be restarted.";
        return;
      }
      if (data.setWaveTest(test)) close();
    } catch (error) {
      message.string = error.message;
    }
  }

  label(panel, "Title", "Wave Adjuster", 24, 17, 500, 50, 36, colors.text, true).enableBold = true;
  label(panel, "Shortcut", "F6", 550, 20, 56, 46, 23, colors.muted);
  button(panel, "Close", "×", 626, 20, 54, 46, close);
  label(panel, "Wave", "Stage " + model.stage + " · Wave " + model.round + " · " + (fighting ? "Battle paused" : "Planning"),
    24, 69, 656, 36, 23, colors.muted, true);
  label(panel, "HP caption", "Enemy HP multiplier", 24, 120, 316, 31, 23, colors.text, true);
  label(panel, "Damage caption", "Enemy damage multiplier", 364, 120, 316, 31, 23, colors.text, true);
  var hp = input(panel, "HP multiplier", String(values.HealthCoefficient), "", 24, 154, 316, "DECIMAL", 16);
  var damage = input(panel, "Damage multiplier", String(values.AttackCoefficient), "", 364, 154, 316, "DECIMAL", 16);
  label(panel, "Enemy groups caption", "Enemy groups", 24, 217, 296, 30, 23, colors.text, true);
  var tally = label(panel, "Total enemies", "", 508, 217, 172, 30, 22, colors.muted);
  if (!model.rows.length) label(panel, "Empty", "This wave has no enemy groups.", 24, 254, 656, 60, 24, colors.muted, true);

  for (var i = 0; i < rowCount; i++) {
    var rowNode = node(panel, "Enemy group " + (i + 1), 24, 254 + 62 * i, 656, 56);
    paint(rowNode, colors.card, colors.border);
    var slot = {
      root: rowNode,
      name: label(rowNode, "Enemy", "", 12, 2, 386, 27, 22, colors.text, true),
      detail: label(rowNode, "Spawn", "", 12, 30, 386, 23, 17, colors.muted, true),
      count: input(rowNode, "Count", "", "", 469, 3, 127, "NUMERIC", 16)
    };
    slots.push(slot);
    bindCount(slot);
  }

  function bindCount(slot) {
    function step(delta) {
      var count = Number(slot.count.string);
      count = Number.isSafeInteger(count) ? count : 0;
      var updated = Math.max(0, count + delta);
      if (!Number.isSafeInteger(updated)) return;
      slot.count.string = counts[slot.index] = String(updated);
      summary();
    }
    slot.count.node.on("text-changed", function () {
      counts[slot.index] = slot.count.string;
      summary();
    });
    button(slot.root, "Decrease", "−", 411, 4, 48, 48, function () { step(-1); });
    button(slot.root, "Increase", "+", 604, 4, 40, 48, function () { step(1); });
  }

  var previous, pageLabel, next;
  if (pageCount > 1) {
    previous = button(panel, "Previous page", "‹", 24, listEnd, 48, 42, function () { shift(-1); });
    pageLabel = label(panel, "Page", "", 82, listEnd, 136, 42, 23, colors.muted);
    next = button(panel, "Next page", "›", 228, listEnd, 48, 42, function () { shift(1); });
  }
  var message = label(panel, "Message", fighting ? "Restart to apply these values." : "Test values and rewards stay in the preview.",
    24, footer, 656, 42, 22, colors.muted, true);
  button(panel, "Reset values", "Reset fields", 24, footer + 50, 178, 48, reset);
  button(panel, fighting ? "Restart wave" : "Apply", fighting ? "Restart wave" : "Apply to wave",
    435, footer + 50, 245, 48, apply, true);

  dialog.paused = true;
  ui.onPauseGame(true, dialog);
  if (!current()) { close(); return false; }
  if (ui.ctrUI.onBlockTouch) ui.ctrUI.onBlockTouch();
  layout();
  showPage();
  root.active = true;
  return true;
}

exports.toggle = function (ui) {
  if (!require("TestMode").TestMode.getInstance().isAvailable()) return false;
  if (ui._waveTestPanel) { ui._waveTestPanel.close(); return true; }
  return open(ui);
};
