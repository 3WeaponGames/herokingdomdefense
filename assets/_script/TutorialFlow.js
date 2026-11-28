"use strict";

// The original group/step IDs remain the save format. A lesson advances only
// when its visible guide is acknowledged, never when a prefab starts loading.
function visible(node) {
  return !!node && node.active !== false && node.activeInHierarchy !== false &&
    (typeof cc === "undefined" || !cc.isValid || cc.isValid(node, true));
}
function active(owner) { return !!owner && !owner.isclose && visible(owner.node); }
function advance(guide, group, step, length) {
  if (guide.getGroupId() !== group || guide.getStepId() !== step) return false;
  if (guide.advanceStep) return guide.advanceStep(group, step, length);
  if (step + 1 < length) guide.setStepId(step + 1);
  else { guide.setGroupId(group + 1); guide.setStepId(0); }
  return true;
}
function open(owner, cfg, current, commit) {
  if (!active(owner) || owner._tutorialOpen || !current()) return false;
  if (cfg.distNode && !visible(cfg.distNode)) return false;
  var token = { target: cfg.distNode }, manager = require("UIMgr").UIMgr.getInstance();
  if (manager.getUIById && manager.getUIById(require("Config").UIID.UIGuide)) return false;
  owner._tutorialOpen = token;
  cfg.isCurrent = function () { return active(owner) && owner._tutorialOpen === token && current(); };
  function clear() { if (owner._tutorialOpen === token) owner._tutorialOpen = null; }
  function acknowledge(action) {
    return function () {
      if (!cfg.isCurrent() || action() === false) return false;
      clear();
      return true;
    };
  }
  cfg.onComplete = acknowledge(commit);
  if (cfg.onDismiss) cfg.onDismiss = acknowledge(cfg.onDismiss);
  var closed = cfg.onClosed;
  cfg.onClosed = function () { clear(); if (closed) closed(); };
  try {
    manager.openUIWithOwner(require("Config").UIID.UIGuide, owner.uid, {
      parent: owner,
      isCurrent: cfg.isCurrent,
      onCancel: function () {
        var cancelledCurrent = cfg.isCurrent();
        clear();
        if (cancelledCurrent && cfg.onCancel) cfg.onCancel();
      }
    }, cfg);
  } catch (error) { clear(); throw error; }
  return owner._tutorialOpen === token;
}
function present(owner, guide, group, step, rows, cfg) {
  if (!rows[step]) return false;
  return open(owner, cfg, function () { return guide.getGroupId() === group && guide.getStepId() === step; },
    function () { return advance(guide, group, step, rows.length); });
}
function tip(owner, guide, id, cfg) {
  return open(owner, cfg, function () { return !guide.getGuideTips(id); }, function () {
    if (guide.setGuideTips(id) === false) return false;
    return true;
  });
}
function state(guide, group, step) {
  if (guide.setGuideState) return guide.setGuideState(group, step);
  guide.setGroupId(group); guide.setStepId(step); return true;
}
function scrollTo(controller, target) {
  var scroll = controller && (controller.scrView || controller.ndParent);
  if (!target || !scroll || !scroll.content || !scroll.scrollToOffset || !scroll.getMaxScrollOffset || !target.convertToWorldSpaceAR || !scroll.content.convertToNodeSpaceAR) return;
  var content = scroll.content, view = content.parent;
  if (!view) return;
  var origin = typeof cc === "undefined" ? { x: 0, y: 0 } : cc.v2(0, 0);
  var point = content.convertToNodeSpaceAR(target.convertToWorldSpaceAR(origin)), max = scroll.getMaxScrollOffset();
  var x = Math.max(0, Math.min(max.x, point.x + content.width * content.anchorX - view.width / 2));
  var y = Math.max(0, Math.min(max.y, content.height * (1 - content.anchorY) - point.y - view.height / 2));
  if (scroll.stopAutoScroll) scroll.stopAutoScroll();
  scroll.scrollToOffset(typeof cc === "undefined" ? { x: x, y: y } : cc.v2(x, y), 0);
}
function config(row) {
  if (!row) return null;
  var cfg = new (require("UIGuide").GuildCfg)();
  cfg.isWeek = !!row.Close; cfg.showHand = row.Finger; cfg.hideMask = !row.Mask;
  cfg.tipstring = row.Describe; cfg.showAni = !!row.ShowKing;
  cfg.deviationTipsAll = cc.v2(0, row.Offset || 0);
  return cfg;
}
function openingHouse(ui, guide) {
  var game = ui.ctrGame, data = game && game.gameData, stage = data && data.levelCfg;
  if (ui._endless || !stage || stage.Level !== 1 || data.round !== 1 || guide.getGroupId() !== 2 ||
      !data.baseBuild || data.baseBuild.getLevel() < 1 ||
      game.gameStatus !== require("KinghtFallModle").KinghtFallGameStage.Prepare ||
      require("PlatformSetting").PlatformSetting.currentPlatform === require("BasePlatform").Platform.WEB_LINK) return null;
  var house = require("KinghtFallEnum").KinghtFallEnumBuildEnum.PrivateHouse;
  var plots = (stage.HomeLevel1Unlock || []).filter(function (spot) { return spot[0] === house; }).map(function (spot) {
    return data.bulidPointMap && data.bulidPointMap[spot[1]];
  }).filter(Boolean);
  if (plots.some(function (plot) { return plot.getLevel() > 0; })) return null;
  var first = null;
  for (var i = 0; i < plots.length; i++) {
    var plot = plots[i], field = plot.getPurchaseField(), cost = plot.getSell();
    if (!visible(field) || !(cost >= 0 && cost <= data.coin)) continue;
    if (plot.node.name === "House 1") return field;
    if (!first) first = field;
  }
  return first;
}
function homeBlocked() {
  var manager = require("UIMgr").UIMgr.getInstance(), ids = require("KinghtFallConfig").KinghtFallUIID;
  if (!manager.getUIById) return false;
  return [ids.UITreasureReward, ids.UITreasureInfo, ids.UITalentInfo, ids.UIAddCurrency, ids.UINewModular, ids.UIExchangeCode].some(function (id) {
    var ui = id && manager.getUIById(id);
    return ui && !ui.isclose && visible(ui.node);
  });
}
function heroHit(game) {
  var ui = game && require("KinghtFallUIGame").default.instance;
  if (!ui || ui.ctrGame !== game || ui.isclose || !ui.ctrUI) return;
  var guide = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getGuideData();
  if (!guide.getGuideTips(2)) { ui.ctrUI.setGuide(null); guide.setGuideTips(2); }
}
exports.visible = visible;
exports.active = active;
exports.present = present;
exports.tip = tip;
exports.state = state;
exports.scrollTo = scrollTo;
exports.config = config;
exports.openingHouse = openingHouse;
exports.homeBlocked = homeBlocked;
exports.heroHit = heroHit;
