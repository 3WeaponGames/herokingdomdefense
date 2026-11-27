"use strict";

var Progress = require("RewardTestProgress");
var controls = require("UnitTestPanel").controls;
var node = controls.node, paint = controls.paint, label = controls.label, button = controls.button, input = controls.input, colors = controls.colors;
var WIDTH = 704, SAVES_HEIGHT = 418, REWARDS_HEIGHT = 822, PAGE_SIZE = 4;

exports.toggle = function (mode, startScreen, fromPause) {
  if (!mode.isAvailable()) return false;
  if (mode._rewardTestPanel) { mode._rewardTestPanel.close(); return true; }
  var scene = cc.director.getScene(), main, player, config, parent, battle;
  if (startScreen) parent = startScreen.node;
  else {
    main = require("Main").default.instance;
    player = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance();
    config = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance();
    parent = require("UIMgr").UIMgr.getInstance().uiRoot;
    battle = mode._gameplayTarget;
    if (!main || !cc.isValid(main, true) || !player.getDailyData() || !player.getMissionData() || battle &&
        (!battle.canBreak || battle.isclose || battle.isPauset && !fromPause || battle._unitTestPanel || battle._waveTestPanel)) return false;
  }
  if (!scene || !parent || !cc.isValid(parent, true)) return false;
  var height = startScreen ? SAVES_HEIGHT : REWARDS_HEIGHT;
  var root = node(null, "RewardTestOverlay", 0, 0, 0, 0);
  root.active = false;
  root.group = parent.group;
  root.zIndex = cc.macro.MAX_ZINDEX;
  parent.addChild(root);
  root.addComponent(cc.BlockInputEvents);
  var shade = root.addComponent(cc.Graphics);
  var panel = node(root, "RewardTestPanel", 0, 0, WIDTH, height);
  paint(panel, colors.panel, colors.border);
  var state = mode._rewardTestPanel = { close: close, battle: battle };
  if (startScreen) startScreen._saveSlotPanel = state;
  var viewport, restarting = false, page = 0, saveList, confirmDelete;

  function current() {
    return mode._rewardTestPanel === state && cc.isValid(root, true) && cc.director.getScene() === scene &&
      (!startScreen || cc.isValid(startScreen, true) && !startScreen._starting) &&
      (!battle || mode._gameplayTarget === battle && !battle.isclose && cc.isValid(battle, true));
  }

  function close() {
    if (mode._rewardTestPanel !== state) return;
    mode._rewardTestPanel = null;
    if (startScreen && startScreen._saveSlotPanel === state) startScreen._saveSlotPanel = null;
    cc.director.off(cc.Director.EVENT_AFTER_UPDATE, layout, state);
    if (battle && cc.isValid(battle, true) && !battle.isclose) battle.onPauseGame(false, state);
    if (cc.isValid(root, true)) { root.active = false; root.destroy(); }
  }

  function layout() {
    if (!current()) { close(); return; }
    var origin = cc.view.getVisibleOrigin(), size = cc.view.getVisibleSize();
    var key = [origin.x, origin.y, size.width, size.height].join("|");
    if (key === viewport) return;
    viewport = key;
    var first = parent.convertToNodeSpaceAR(origin), last = parent.convertToNodeSpaceAR(cc.v2(origin.x + size.width, origin.y + size.height));
    root.setPosition((first.x + last.x) / 2, (first.y + last.y) / 2);
    root.setContentSize(Math.abs(last.x - first.x), Math.abs(last.y - first.y));
    shade.clear();
    shade.fillColor = cc.color(8, 15, 23, 205);
    shade.rect(-root.width / 2, -root.height / 2, root.width, root.height);
    shade.fill();
    panel.setPosition(0, 0);
    panel.scale = Math.max(.01, Math.min(1, (root.width - 24) / WIDTH, (root.height - 24) / height));
  }

  function refreshRewards() {
    if (!player) return;
    var daily = player.getDailyData(), date = new Date(daily.calendarTime()), days = config.getSignCfg().length;
    var day = daily.getSignDay();
    var sign = day >= days ? "Sign-in complete" : "Sign-in day " + (day + 1) + " / " + days +
      (daily.getSignReward() ? " · Collected" : " · Ready");
    calendar.string = date.toDateString() + "  ·  " + sign;
    var data = battle && battle.ctrGame && battle.ctrGame.gameData, task = data && data.taskInfo;
    advisor.setEnabled(!!(task && task.index < task.list.length));
    var testActive = Progress.active();
    profile.string = testActive ? "Temporary reward progress is active." : "Reward testing uses temporary progress.";
    restore.setEnabled(testActive && !restarting);
  }

  function run(action) {
    return function () {
      if (!current() || restarting) return;
      confirmDelete = null;
      try { message.string = Progress.run(action, player, config, main, battle); }
      catch (error) { message.string = error.message; }
      if (current()) { drawSaves(); refreshRewards(); }
    };
  }

  function mutate(action) {
    if (!current() || restarting || !saveList) return;
    restarting = true;
    drawSaves();
    if (restore) restore.setEnabled(false);
    try { if (action()) return; }
    catch (error) { message.string = error.message; }
    restarting = false;
    refreshSaves();
    refreshRewards();
  }

  function changePage(delta) {
    if (restarting) return;
    confirmDelete = null;
    page += delta;
    refreshSaves();
  }

  function refreshSaves() {
    try { saveList = Progress.listSaves(); }
    catch (error) { saveList = null; message.string = error.message; }
    drawSaves();
  }

  function drawSaves() {
    var saves = saveList ? saveList.saves : [];
    var pages = Math.max(1, Math.ceil(saves.length / PAGE_SIZE));
    page = Math.min(Math.max(0, page), pages - 1);
    pageLabel.string = saveList ? (page + 1) + " / " + pages : "—";
    reset.setEnabled(!!saveList && !restarting);
    previous.setEnabled(!restarting && page > 0);
    next.setEnabled(!restarting && page + 1 < pages);
    rows.forEach(function (row, index) {
      var save = row.save = saves[page * PAGE_SIZE + index];
      row.node.active = !!save;
      if (!save) return;
      var currentSave = saveList.current === save.id;
      row.caption.string = save.name + (currentSave ? "  ·  Current" : "");
      row.load.setEnabled(!restarting && (startScreen || !currentSave || Progress.active()));
      row.rename.setEnabled(!restarting);
      row.remove.caption.string = confirmDelete && confirmDelete.id === save.id ? "Confirm" : "Delete";
      row.remove.setEnabled(!restarting);
    });
  }

  function rename(save) {
    if (!current() || restarting || !save) return;
    var revision = saveList.revision;
    confirmDelete = null;
    drawSaves();
    var overlay = node(panel, "Rename overlay", 0, 0, WIDTH, height);
    overlay.addComponent(cc.BlockInputEvents);
    var dialog = node(overlay, "Rename save dialog", 52, (height - 223) / 2, 600, 223);
    paint(dialog, colors.panel, colors.border);
    label(dialog, "Rename title", "Rename save", 24, 12, 552, 40, 29, colors.text, true);
    var field = input(dialog, "New save name", save.name, "Save name", 24, 62, 552, "SINGLE_LINE", Progress.MAX_SAVE_NAME_LENGTH);
    var errorLabel = label(dialog, "Rename error", "", 24, 118, 552, 38, 21, colors.error, true);
    function cancel() { overlay.active = false; overlay.destroy(); }
    function apply() {
      if (!current() || !overlay.active) return;
      try {
        var name = Progress.renameSave(save.id, field.string, revision);
        cancel();
        refreshSaves();
        if (saveList) message.string = "Save renamed to " + name + ".";
      } catch (error) {
        refreshSaves();
        errorLabel.string = error.message;
      }
    }
    button(dialog, "Cancel", "Cancel", 24, 164, 268, 43, cancel);
    button(dialog, "Save name", "Save name", 308, 164, 268, 43, apply, true);
    field.node.on("editing-return", apply);
    field.focus();
  }

  label(panel, "Title", startScreen ? "Save Slots" : "Save Slots & Reward Testing", 24, 17, 500, 50, 36, colors.text, true).enableBold = true;
  label(panel, "Shortcut", "F4", 550, 20, 56, 46, 23, colors.muted);
  button(panel, "Close", "×", 626, 20, 54, 46, close);
  var reset = button(panel, "New save", "New save (reset progress)", 24, 78, 368, 48, function () {
    confirmDelete = null;
    mutate(function () {
      message.string = "Creating a fresh save slot…";
      Progress.requestNewPlayer(player, saveList.revision);
      return true;
    });
  }, true);
  var previous = button(panel, "Previous page", "‹", 422, 78, 56, 48, function () { changePage(-1); });
  var pageLabel = label(panel, "Save pages", "", 482, 78, 134, 48, 22, colors.muted);
  var next = button(panel, "Next page", "›", 624, 78, 56, 48, function () { changePage(1); });
  var rows = [];
  for (var i = 0; i < PAGE_SIZE; i++) {
    var row = { node: node(panel, "Save slot " + (i + 1), 24, 140 + i * 52, 656, 46) };
    paint(row.node, colors.field, colors.border);
    row.caption = label(row.node, "Save name", "", 12, 0, 317, 46, 24, colors.text, true);
    (function (row) {
      row.load = button(row.node, "Load", "Load", 337, 3, 92, 40, function () {
        confirmDelete = null;
        mutate(function () {
          message.string = "Loading " + row.save.name + "…";
          Progress.loadSave(row.save.id, player, saveList.revision);
          return true;
        });
      });
      row.rename = button(row.node, "Rename", "Rename", 437, 3, 100, 40, function () { rename(row.save); });
      row.remove = button(row.node, "Delete", "Delete", 545, 3, 105, 40, function () {
        if (!current() || restarting || !row.save) return;
        if (!confirmDelete || confirmDelete.id !== row.save.id) {
          confirmDelete = { id: row.save.id, revision: saveList.revision };
          message.string = "Delete " + row.save.name + "? This removes its progress.";
          drawSaves();
          return;
        }
        var requested = confirmDelete;
        confirmDelete = null;
        mutate(function () {
          var name = row.save.name;
          var result = Progress.deleteSave(requested.id, player, requested.revision);
          message.string = result.restarting ? "Switching saves…" : name + " deleted.";
          if (result.cleanupPending) message.string += " Storage cleanup will retry on restart.";
          return result.restarting;
        });
      });
    })(row);
    rows.push(row);
  }
  var message = label(panel, "Message", "A new save keeps your other slots.", 24, 356, 656, 48, 22, colors.muted, true);
  var profile, calendar, advisor, restore;
  if (player) {
    profile = label(panel, "Profile", "", 24, 417, 656, 33, 22, colors.muted, true);
    calendar = label(panel, "Day", "", 24, 457, 656, 42, 25, colors.text, true);
    button(panel, "Advance one day", "Advance 1 day", 24, 512, 656, 52, run("day"), true);
    advisor = button(panel, "Advisor", "Complete next Advisor task", 24, 585, 322, 48, run("task"));
    button(panel, "Quest", "Complete next quest", 358, 585, 322, 48, run("quest"));
    button(panel, "Battle Pass", "Complete next Battle Pass tier", 24, 645, 322, 48, run("pass"));
    button(panel, "Playtime", "Unlock next playtime reward", 358, 645, 322, 48, run("playtime"));
    restore = button(panel, "Return to saved progress", "Return to saved progress", 24, 735, 656, 48, function () {
      if (!Progress.active()) return;
      confirmDelete = null;
      mutate(function () {
        message.string = "Loading your saved progress…";
        Progress.returnToSavedProgress();
        return true;
      });
    });
  }
  if (battle) battle.onPauseGame(true, state);
  cc.director.on(cc.Director.EVENT_AFTER_UPDATE, layout, state);
  layout();
  if (!current()) return false;
  refreshSaves();
  if (saveList) {
    var activeIndex = saveList.saves.findIndex(function (save) { return save.id === saveList.current; });
    page = Math.max(0, Math.floor(activeIndex / PAGE_SIZE));
    drawSaves();
  }
  refreshRewards();
  root.active = true;
  if (battle && battle.ctrUI && battle.ctrUI.onBlockTouch) battle.ctrUI.onBlockTouch();
  return true;
};
