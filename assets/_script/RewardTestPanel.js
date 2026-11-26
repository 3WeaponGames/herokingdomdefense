"use strict";

var Progress = require("RewardTestProgress");
var controls = require("UnitTestPanel").controls;
var node = controls.node, paint = controls.paint, label = controls.label, button = controls.button, colors = controls.colors;
var WIDTH = 704, HEIGHT = 538;

exports.toggle = function (mode) {
  if (!mode.isAvailable()) return false;
  if (mode._rewardTestPanel) { mode._rewardTestPanel.close(); return true; }
  var main = require("Main").default.instance, scene = cc.director.getScene();
  var player = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance();
  var parent = require("UIMgr").UIMgr.getInstance().uiRoot, battle = mode._gameplayTarget;
  if (!scene || !main || !cc.isValid(main, true) || !parent || !cc.isValid(parent, true) ||
      !player.getDailyData() || !player.getMissionData() || battle &&
      (!battle.canBreak || battle.isclose || battle.isPauset || battle._unitTestPanel || battle._waveTestPanel)) return false;
  var root = node(null, "RewardTestOverlay", 0, 0, 0, 0);
  root.active = false;
  root.group = parent.group;
  root.zIndex = cc.macro.MAX_ZINDEX;
  parent.addChild(root);
  root.addComponent(cc.BlockInputEvents);
  var shade = root.addComponent(cc.Graphics);
  var panel = node(root, "RewardTestPanel", 0, 0, WIDTH, HEIGHT);
  paint(panel, colors.panel, colors.border);
  var state = mode._rewardTestPanel = { close: close, battle: battle };
  var config = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance();
  var viewport, confirmReset = false, restarting = false;

  function current() {
    return mode._rewardTestPanel === state && cc.isValid(root, true) && cc.director.getScene() === scene &&
      (!battle || mode._gameplayTarget === battle && !battle.isclose && cc.isValid(battle, true));
  }

  function close() {
    if (mode._rewardTestPanel !== state) return;
    mode._rewardTestPanel = null;
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
    panel.scale = Math.max(.01, Math.min(1, (root.width - 24) / WIDTH, (root.height - 24) / HEIGHT));
  }

  function refresh() {
    var daily = player.getDailyData(), date = new Date(daily.calendarTime()), days = config.getSignCfg().length;
    var day = daily.getSignDay();
    var sign = day >= days ? "Sign-in complete" : "Sign-in day " + (day + 1) + " / " + days +
      (daily.getSignReward() ? " · Collected" : " · Ready");
    calendar.string = date.toDateString() + "  ·  " + sign;
    var data = battle && battle.ctrGame && battle.ctrGame.gameData, task = data && data.taskInfo;
    advisor.setEnabled(!!(task && task.index < task.list.length));
    var testActive = Progress.active();
    profile.string = testActive ? "Temporary test profile is active." : "Test actions use a temporary profile.";
    restore.setEnabled(testActive);
  }

  function run(action) {
    return function () {
      if (!current() || restarting) return;
      confirmReset = false;
      reset.caption.string = "Reset all progress";
      try { message.string = Progress.run(action, player, config, main, battle); }
      catch (error) { message.string = error.message; }
      if (current()) refresh();
    };
  }

  function restart(action) {
    restarting = true;
    reset.setEnabled(false);
    restore.setEnabled(false);
    try { action(); }
    catch (error) {
      restarting = false;
      reset.setEnabled(true);
      message.string = error.message;
      refresh();
    }
  }

  function resetProgress() {
    if (!current() || restarting) return;
    if (!confirmReset) {
      confirmReset = true;
      reset.caption.string = "Confirm reset";
      message.string = "Return to the Start screen with a fresh test profile.";
      return;
    }
    restart(function () { Progress.requestNewPlayer(player); });
  }

  function returnToSaved() {
    if (!current() || restarting || !Progress.active()) return;
    message.string = "Loading your saved profile…";
    restart(Progress.returnToSavedProgress);
  }

  label(panel, "Title", "Reward Testing", 24, 17, 500, 50, 36, colors.text, true).enableBold = true;
  label(panel, "Shortcut", "F4", 550, 20, 56, 46, 23, colors.muted);
  button(panel, "Close", "×", 626, 20, 54, 46, close);
  var profile = label(panel, "Profile", "", 24, 72, 656, 33, 22, colors.muted, true);
  var calendar = label(panel, "Day", "", 24, 116, 656, 42, 25, colors.text, true);
  button(panel, "Advance one day", "Advance 1 day", 24, 170, 656, 52, run("day"), true);
  var advisor = button(panel, "Advisor", "Complete next Advisor task", 24, 246, 322, 48, run("task"));
  button(panel, "Quest", "Complete next quest", 358, 246, 322, 48, run("quest"));
  button(panel, "Battle Pass", "Complete next Battle Pass tier", 24, 306, 322, 48, run("pass"));
  button(panel, "Playtime", "Unlock next playtime reward", 358, 306, 322, 48, run("playtime"));
  var message = label(panel, "Message", "Claim rewards in their usual screens.", 24, 383, 656, 58, 23, colors.muted, true);
  var reset = button(panel, "Reset all progress", "Reset all progress", 24, 457, 322, 48, resetProgress);
  var restore = button(panel, "Return to saved progress", "Return to saved progress", 358, 457, 322, 48, returnToSaved, true);
  if (battle) battle.onPauseGame(true, state);
  cc.director.on(cc.Director.EVENT_AFTER_UPDATE, layout, state);
  layout();
  if (!current()) return false;
  refresh();
  root.active = true;
  if (battle && battle.ctrUI && battle.ctrUI.onBlockTouch) battle.ctrUI.onBlockTouch();
  return true;
};
