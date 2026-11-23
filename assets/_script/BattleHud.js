"use strict";
var TaskPosition = require("StageTaskPosition");
var GameStage = require("KinghtFallModle").KinghtFallGameStage;
var TASK_BUBBLE_ALPHA = 120;
var SPEAKER_FADE_SECONDS = .4;

function component(node, Type) { return node && node.getComponent(Type); }
function disableFit(node) {
  (node.getComponents(cc.Component) || []).forEach(function (c) {
    if (c instanceof cc.Layout || c instanceof cc.Widget || Array.isArray(c.content)) c.enabled = false;
  });
}
function fitCoin(node) {
  var text = node.getComponentsInChildren(cc.Label).map(function (l) { return [l.string, l.fontSize, l.lineHeight, l.font && l.font.uuid].join(":"); }).join("|");
  if (node._battleCoinSignature === text) return; node._battleCoinSignature = text;
  (node.getComponents(cc.Component) || []).forEach(function (c) { if (c.enabled && Array.isArray(c.content) && c.fit) c.fit(); });
}
function label(node, size) {
  var text = component(node, cc.Label) || node.addComponent(cc.Label);
  text.fontSize = size; text.lineHeight = size + 8; text.horizontalAlign = cc.Label.HorizontalAlign.CENTER; text.verticalAlign = cc.Label.VerticalAlign.CENTER;
  return text;
}
function labelMetrics(node) {
  var text = component(node, cc.Label);
  return [node.width, node.height, node.x, node.y, node.scaleX, node.scaleY, text.fontSize, text.lineHeight,
    text.font && text.font.uuid, text.fontFamily, text.overflow, text.enableWrapText].join(":");
}
function install(ui) {
  if (ui._battleHud || !ui.ctrUI || !ui.ctrUI.node || !cc.view) return;
  var root = ui.ctrUI.node, task = ui.ndTask;
  task.parent = root; task.anchorX = task.anchorY = .5;
  disableFit(task); task.active = false;
  var background = component(task, cc.Sprite);
  if (background) background.enabled = false;
  var backdrop = new cc.Node("TaskBubbleBackground"); backdrop.parent = task; backdrop.zIndex = -1;
  var backdropArt = backdrop.addComponent(cc.Graphics);
  var tail = new cc.Node("TaskBubbleTail"); tail.parent = task;
  var tailArt = tail.addComponent(cc.Graphics);
  var collectButton = new cc.Node("CollectTaskReward"); collectButton.parent = task; collectButton.active = false;
  var collectArt = collectButton.addComponent(cc.Graphics);
  var collectControl = collectButton.addComponent(cc.Button);
  collectControl.transition = cc.Button.Transition.SCALE;
  collectControl.zoomScale = .96;
  var collectLabel = task.getChildByName("labGet"); collectLabel.parent = collectButton;
  collectLabel.anchorX = collectLabel.anchorY = .5;
  collectLabel.setPosition(0, 0);
  collectLabel.getComponent(cc.Label).string = "[[loc:battle.task.ready]]";
  var rewardAnchor = new cc.Node("BattleTaskFeedback"); rewardAnchor.parent = task; rewardAnchor.zIndex = 10;
  var rewardHint = task.getChildByName("ndAni"); rewardHint.parent = rewardAnchor; rewardHint.active = false;
  disableFit(ui.ndLevelInfo);
  var titleBackground = component(ui.ndLevelInfo, cc.Sprite); if (titleBackground) titleBackground.enabled = false;
  var state = ui._battleHud = {
    backdropArt: backdropArt, tail: tail, tailArt: tailArt,
    taskName: task.getChildByName("labName"), pendingLabel: task.getChildByName("labNoFinish"),
    collectButton: collectButton, collectControl: collectControl, collectArt: collectArt, collectLabel: collectLabel,
    rewardAnchor: rewardAnchor, rewardHint: rewardHint, hasTasks: false
  };
  if (typeof sp !== "undefined" && cc.resources) {
    cc.resources.load("characters/retired-king-portrait", sp.SkeletonData, function (error, data) {
      if (error || !data || ui._battleHud !== state) return;
      state.kingData = data;
      if (state.king && cc.isValid(state.king, true)) showKing(state.king, data);
    });
  }
  layout(ui);
}
function showKing(node, data) {
  var rig = node.addComponent(sp.Skeleton);
  rig.premultipliedAlpha = false;
  rig.skeletonData = data;
  rig.setAnimation(0, "idle", true);
}
function mountTaskSpeaker(ui) {
  var state = ui._battleHud, game = ui.ctrGame;
  if (!state || !game || !game.ndPath || !game.ndMain) return;
  if (state.king && cc.isValid(state.king, true)) state.king.destroy();
  var path = game.ndPath, main = game.ndMain;
  var marker = path.getChildByName(TaskPosition.marker), hero = path.getChildByName("ndStar");
  var position = TaskPosition.resolve(marker && marker.getPosition(), hero && hero.getPosition(), game.mapSize);
  var king = state.king = new cc.Node("Royal Advisor");
  king.parent = main; king.group = main.group;
  king.setPosition(main.convertToNodeSpaceAR(path.convertToWorldSpaceAR(cc.v2(position.x, position.y))));
  king.setScale(.62);
  state.speakerOpacity = game.gameStatus === GameStage.Prepare ? 255 : 0;
  if (state.kingData) showKing(king, state.kingData);
  layout(ui);
}
function fadeTaskSpeaker(ui, dt) {
  var state = ui._battleHud, speaker = state.king;
  if (!speaker) return;
  var planning = ui.ctrGame.gameStatus === GameStage.Prepare;
  var opacity = state.speakerOpacity, target = planning ? 255 : 0;
  if (opacity !== target && dt > 0) {
    var step = dt * 255 / SPEAKER_FADE_SECONDS;
    opacity = state.speakerOpacity = planning ? Math.min(target, opacity + step) : Math.max(target, opacity - step);
  }
  var alpha = Math.round(opacity);
  speaker.opacity = alpha;
  if (state.taskName.opacity !== alpha) {
    state.taskName.opacity = state.pendingLabel.opacity = state.collectLabel.opacity = state.rewardAnchor.opacity = alpha;
  }
  speaker.active = planning || alpha > 0;
  state.collectControl.interactable = planning && alpha > 0;
}
function safeBounds(root) {
  var origin = cc.view.getVisibleOrigin(), visible = cc.view.getVisibleSize();
  var safe = cc.sys.getSafeAreaRect ? cc.sys.getSafeAreaRect() : { x: origin.x, y: origin.y, width: visible.width, height: visible.height };
  var a = root.convertToNodeSpaceAR(cc.v2(Math.max(origin.x, safe.x), Math.max(origin.y, safe.y)));
  var b = root.convertToNodeSpaceAR(cc.v2(Math.min(origin.x + visible.width, safe.x + safe.width), Math.min(origin.y + visible.height, safe.y + safe.height)));
  return { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), bottom: Math.min(a.y, b.y), top: Math.max(a.y, b.y) };
}
function sizeLabel(node, fontSize, width, wrap, lineHeight) {
  var text = label(node, fontSize);
  if (lineHeight) text.lineHeight = lineHeight;
  text.enableWrapText = wrap; text.overflow = wrap ? cc.Label.Overflow.RESIZE_HEIGHT : cc.Label.Overflow.NONE;
  if (width) node.width = width / Math.abs(node.scaleX);
  if (text._forceUpdateRenderData) text._forceUpdateRenderData();
  return { width: node.width * Math.abs(node.scaleX), height: node.height * Math.abs(node.scaleY) };
}
function rewardSpacing(ui) {
  var button = ui.btnAddCoin, row = button && button.getChildByName("lay1"); if (!row || row.children.length < 3) return;
  var video = row.children[0], silver = row.children[1], amount = row.getChildByName("labNum"); if (!amount) return;
  var text = amount.getComponent(cc.Label);
  var signature = [text.string, text.fontSize, text.font && text.font.uuid, amount.width, video.width, video.scaleX, silver.width, silver.scaleX].join(":");
  if (row._battleRewardSignature === signature) return;
  disableFit(row);
  text.overflow = cc.Label.Overflow.NONE; text.enableWrapText = false;
  if (text._forceUpdateRenderData) text._forceUpdateRenderData();
  var videoWidth = video.width * Math.abs(video.scaleX), silverWidth = silver.width * Math.abs(silver.scaleX), numberWidth = amount.width * Math.abs(amount.scaleX);
  video.anchorX = silver.anchorX = .5; amount.anchorX = 0;
  video.x = videoWidth / 2; silver.x = videoWidth + 16 + silverWidth / 2; amount.x = videoWidth + 16 + silverWidth + 4;
  var width = amount.x + numberWidth; row.width = width;
  button.width = Math.max(131, width + 24);
  row.x = button.width * (.5 - button.anchorX) - width / 2;
  var sprite = button.getComponent(cc.Sprite); if (sprite) sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  row._battleRewardSignature = [text.string, text.fontSize, text.font && text.font.uuid, amount.width, video.width, video.scaleX, silver.width, silver.scaleX].join(":");
}
function layoutHeader(ui, bounds) {
  var state = ui._battleHud, root = ui.ctrUI.node, coin = ui.ndCoin, pause = ui.btnSuspend, buildings = ui.btnBuildInfo;
  var canvas = cc.Canvas && cc.Canvas.instance, badge = canvas && canvas.node.getChildByName("DevelopmentTestModeBadge"), badgeFloor = bounds.top;
  if (badge && badge.active && badge.activeInHierarchy !== false) badgeFloor = root.convertToNodeSpaceAR(badge.convertToWorldSpaceAR(cc.v2(0, -badge.height * badge.anchorY))).y - 12;
  fitCoin(coin); rewardSpacing(ui);
  var name = ui.ndLevelInfo.getChildByName("labName"), wave = ui.ndLevelInfo.getChildByName("labOrder");
  var signature = [bounds.left, bounds.right, bounds.top, badgeFloor, coin.width, coin.height, name.getComponent(cc.Label).string, wave.getComponent(cc.Label).string,
    [name, wave, buildings.getChildByName("labNum")].map(labelMetrics).join(";")].join("|");
  if (signature === state.signature) return; state.signature = signature;
  [coin, pause, buildings].forEach(function (node) { var widget = node.getComponent(cc.Widget); if (widget) widget.enabled = false; });
  var margin = 18, center = (bounds.left + bounds.right) / 2;
  var rowY = bounds.top - Math.max(60, margin + coin.height / 2, margin + pause.height / 2);
  coin.setPosition(bounds.left + margin + coin.width / 2, rowY);
  var buildingCaption = buildings.getChildByName("labNum");
  var controlHalfWidth = Math.max(pause.width / 2, buildings.width / 2, buildingCaption ? buildingCaption.width * Math.abs(buildingCaption.scaleX) / 2 : 0);
  var controlsX = bounds.right - margin - 12 - controlHalfWidth;
  pause.setPosition(controlsX, rowY);
  buildings.setPosition(controlsX, rowY - pause.height / 2 - 20 - buildings.height / 2);
  if (buildingCaption) { buildingCaption.anchorX = .5; buildingCaption.x = 0; buildingCaption.getComponent(cc.Label).horizontalAlign = cc.Label.HorizontalAlign.CENTER; }
  // Dynamic silver amounts reserve their actual width so a larger stage name
  // never sits underneath the counter or the Pause button.
  var low = coin.x + coin.width / 2 + 18, high = pause.x - pause.width / 2 - 18;
  var width = Math.min(420, high - low), titleX = (low + high) / 2, below = width < 300;
  if (below) { width = Math.min(460, bounds.right - bounds.left - 36); titleX = center; }
  name.anchorX = name.anchorY = .5; wave.anchorX = wave.anchorY = .5;
  var titleSize = sizeLabel(name, 68, width - 24, true, 80), waveSize = sizeLabel(wave, 54, 0, false, 64);
  name.color = wave.color = cc.Color.WHITE; name.opacity = wave.opacity = 255;
  name.setPosition(0, 0); wave.setPosition(0, 0); ui.ndLevelInfo.opacity = 255; ui.ndLevelInfo.color = cc.Color.WHITE;
  var titleHeight = Math.max(56, titleSize.height + 12);
  var titleY = Math.min(below ? rowY - Math.max(coin.height, pause.height) / 2 - 18 - titleHeight / 2 : rowY,
    Math.min(bounds.top - margin, badgeFloor) - titleHeight / 2);
  ui.ndLevelInfo.setContentSize(width, titleHeight); ui.ndLevelInfo.setPosition(titleX, titleY);
  wave.y = -titleSize.height / 2 - 4 - waveSize.height / 2;
}
function sizeTaskBubble(task, state, width) {
  var name = state.taskName, pending = state.pendingLabel;
  var ready = state.collectButton.active;
  var status = ready ? state.collectLabel : pending.active ? pending : null;
  function signature() {
    return [width, name.getComponent(cc.Label).string, labelMetrics(name), status && status.name,
      status && status.getComponent(cc.Label).string, status && labelMetrics(status)].join("|");
  }
  if (state.taskSignature === signature()) return;
  var description = sizeLabel(name, 62, width - 32, true, 72);
  var gap = ready ? 10 : 4, statusHeight = 0;
  if (ready) {
    var buttonWidth = Math.min(220, width - 32);
    var buttonHeight = Math.max(88, sizeLabel(status, 54, buttonWidth - 28, true, 64).height + 20);
    state.collectButton.setContentSize(buttonWidth, buttonHeight);
    statusHeight = buttonHeight + gap;
  } else if (status) {
    statusHeight = sizeLabel(status, 54, width - 32, true, 64).height + gap;
  }
  var height = Math.ceil(description.height + statusHeight + 26);
  task.setContentSize(width, height);
  name.anchorX = name.anchorY = .5;
  name.setPosition(0, statusHeight / 2);
  var row = ready ? state.collectButton : status;
  if (row) {
    row.anchorX = row.anchorY = .5;
    row.setPosition(0, -(description.height + gap) / 2);
  }
  state.rewardAnchor.setPosition(0, height / 2);
  state.taskSignature = signature();
}
function paintTaskBubble(task, state, opacity, tailOffset) {
  var button = state.collectButton;
  var signature = [task.width, task.height, opacity, tailOffset, button.active, button.width, button.height].join("|");
  if (state.paintSignature === signature) return;
  state.paintSignature = signature;

  // Graphics stores its own vertex colors. Fade the shapes through their fill alpha.
  var fill = cc.color(255, 255, 255, Math.round(TASK_BUBBLE_ALPHA * opacity / 255));
  var backdrop = state.backdropArt;
  backdrop.clear();
  backdrop.fillColor = fill;
  backdrop.roundRect(-task.width / 2, -task.height / 2, task.width, task.height, 12);
  backdrop.fill();

  var tail = state.tailArt;
  tail.clear();
  tail.fillColor = fill;
  tail.moveTo(-12, 0); tail.lineTo(0, tailOffset); tail.lineTo(12, 0); tail.close(); tail.fill();

  if (button.active) {
    var art = state.collectArt;
    art.clear();
    art.fillColor = cc.color(224, 247, 233, opacity);
    art.strokeColor = cc.color(37, 87, 69, opacity);
    art.lineWidth = 3;
    art.roundRect(-button.width / 2 + 1.5, -button.height / 2 + 1.5, button.width - 3, button.height - 3, 14.5);
    art.fill();
    art.stroke();
  }
}
function layoutTaskBubble(ui, bounds) {
  var state = ui._battleHud, task = ui.ndTask, king = state.king, game = ui.ctrGame;
  var camera = game && (game.camera || cc.Camera && cc.Camera.main);
  if (!state.hasTasks || !king || !king.activeInHierarchy || !king.opacity || !camera) { task.active = false; return; }
  var root = ui.ctrUI.node;
  function project(y) {
    return root.convertToNodeSpaceAR(camera.getWorldToScreenPoint(king.convertToWorldSpaceAR(cc.v2(0, y))));
  }
  var head = project(182), feet = project(0);
  task.active = feet.x >= bounds.left - 24 && feet.x <= bounds.right + 24 && head.y >= bounds.bottom && feet.y <= bounds.top;
  if (!task.active) return;

  var margin = 16, tailLength = 18;
  sizeTaskBubble(task, state, Math.min(360, bounds.right - bounds.left - margin * 2));
  var hw = task.width / 2, hh = task.height / 2;
  var x = Math.max(bounds.left + margin + hw, Math.min(bounds.right - margin - hw, head.x));
  var wave = ui.ndLevelInfo.getChildByName("labOrder");
  var top = Math.min(bounds.top - margin, ui.ndLevelInfo.y + wave.y - wave.height * Math.abs(wave.scaleY) / 2 - 12);
  var below = head.y + tailLength + task.height > top && feet.y - tailLength - task.height >= bounds.bottom + margin;
  var y = below ? feet.y - tailLength - hh : head.y + tailLength + hh;
  y = Math.max(bounds.bottom + margin + hh, Math.min(top - hh, y));
  task.setPosition(x, y);
  var tailX = Math.max(-hw + 28, Math.min(hw - 28, head.x - x));
  var tailY = below ? hh : -hh;
  if (state.tail.x !== tailX || state.tail.y !== tailY) state.tail.setPosition(tailX, tailY);
  paintTaskBubble(task, state, king.opacity, below ? tailLength : -tailLength);
}
function layout(ui, dt) {
  if (!ui._battleHud || !cc.view) return;
  var bounds = safeBounds(ui.ctrUI.node);
  layoutHeader(ui, bounds);
  fadeTaskSpeaker(ui, dt);
  layoutTaskBubble(ui, bounds);
}
function updateTasks(ui, hasTasks) {
  if (!ui._battleHud) return;
  ui._battleHud.hasTasks = hasTasks;
  layout(ui);
}
function dispose(ui) {
  var state = ui._battleHud;
  ui._battleHud = null;
  if (!state) return;
  if (state.king && cc.isValid(state.king, true)) state.king.destroy();
  if (cc.isValid(state.rewardHint, true)) cc.Tween.stopAllByTarget(state.rewardHint);
  if (cc.isValid(ui.ndTask, true)) ui.ndTask.active = false;
}
exports.install = install; exports.layout = layout; exports.updateTasks = updateTasks; exports.mountTaskSpeaker = mountTaskSpeaker; exports.rewardSpacing = rewardSpacing; exports.dispose = dispose;
