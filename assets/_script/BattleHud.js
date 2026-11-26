"use strict";
var TaskPosition = require("StageTaskPosition");
var GameStage = require("KinghtFallModle").KinghtFallGameStage;
var SILVER = require("KinghtFallEnum").KinghtFallEnumGoodsCfg.SilverCoin;
var TASK_BUBBLE_ALPHA = 240;
var TASK_CLOSE_SIZE = 44;
var TASK_CLOSE_INSET = 6;
var SPEAKER_FADE_SECONDS = .4;

function component(node, Type) { return node && node.getComponent(Type); }
function disableFit(node) {
  (node.getComponents(cc.Component) || []).forEach(function (c) {
    if (c instanceof cc.Layout || c instanceof cc.Widget || Array.isArray(c.content)) c.enabled = false;
  });
}
function fitCoin(node) {
  var labels = node.getComponentsInChildren(cc.Label), inputs = node._battleCoinInputs;
  var changed = !inputs || inputs.length !== labels.length * 4;
  if (!inputs) inputs = node._battleCoinInputs = [];
  for (var i = 0; i < labels.length; i++) {
    var label = labels[i], offset = i * 4, font = label.font && label.font.uuid;
    if (inputs[offset] !== label.string || inputs[offset + 1] !== label.fontSize ||
        inputs[offset + 2] !== label.lineHeight || inputs[offset + 3] !== font) {
      inputs[offset] = label.string; inputs[offset + 1] = label.fontSize;
      inputs[offset + 2] = label.lineHeight; inputs[offset + 3] = font;
      changed = true;
    }
  }
  if (!changed) return;
  inputs.length = labels.length * 4;
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
function taskButton(parent, name) {
  var node = new cc.Node(name);
  node.parent = parent;
  var control = node.addComponent(cc.Button);
  control.transition = cc.Button.Transition.SCALE;
  control.zoomScale = .96;
  return control;
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
  var collectControl = taskButton(task, "CollectTaskReward"), collectButton = collectControl.node;
  collectButton.active = false;
  var collectArt = collectButton.addComponent(cc.Graphics);
  var collectLabel = task.getChildByName("labGet"); collectLabel.parent = collectButton;
  collectLabel.anchorX = collectLabel.anchorY = .5;
  collectLabel.setPosition(0, 0);
  var taskName = task.getChildByName("labName"), pendingLabel = task.getChildByName("labNoFinish");
  [taskName, pendingLabel, collectLabel].forEach(function (node) {
    component(node, cc.Label)._battleTaskLayout = true;
  });
  collectLabel.getComponent(cc.Label).string = "[[loc:battle.task.ready]]";
  taskName.color = collectLabel.color = cc.Color.WHITE;
  pendingLabel.color = cc.color(255, 112, 112);
  var rewardPreview = new cc.Node("TaskRewardPreview"); rewardPreview.parent = task; rewardPreview.active = false;
  var rewardNumber = new cc.Node("Amount"); rewardNumber.parent = rewardPreview; rewardNumber.color = cc.Color.WHITE;
  var rewardText = label(rewardNumber, 28), taskFont = component(taskName, cc.Label).font;
  if (taskFont) rewardText.font = taskFont;
  var rewardIcon = new cc.Node("Icon"); rewardIcon.parent = rewardPreview;
  var rewardSprite = rewardIcon.addComponent(cc.Sprite);
  rewardSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  rewardIcon.setContentSize(30, 30);
  var rewardAnchor = new cc.Node("BattleTaskFeedback"); rewardAnchor.parent = task; rewardAnchor.zIndex = 10;
  var rewardHint = task.getChildByName("ndAni"); rewardHint.parent = rewardAnchor; rewardHint.active = false;
  var closeControl = taskButton(task, "CloseTaskPopup"), closeButton = closeControl.node;
  closeButton.setContentSize(TASK_CLOSE_SIZE, TASK_CLOSE_SIZE);
  var closeArt = closeButton.addComponent(cc.Graphics);
  var markerControl = taskButton(root, "AdvisorQuestMarker"), questMarker = markerControl.node;
  questMarker.active = false;
  questMarker.setContentSize(46, 46);
  var markerArt = questMarker.addComponent(cc.Graphics);
  var markerText = new cc.Node("QuestMark");
  markerText.parent = questMarker;
  var markerGlyph = label(markerText, 32);
  markerGlyph.enableBold = true;
  disableFit(ui.ndLevelInfo);
  var titleBackground = component(ui.ndLevelInfo, cc.Sprite); if (titleBackground) titleBackground.enabled = false;
  var state = ui._battleHud = {
    backdropArt: backdropArt, tail: tail, tailArt: tailArt,
    taskName: taskName, pendingLabel: pendingLabel,
    rewardPreview: rewardPreview, rewardNumber: rewardNumber, rewardText: rewardText, rewardSprite: rewardSprite,
    collectButton: collectButton, collectControl: collectControl, collectArt: collectArt, collectLabel: collectLabel,
    closeControl: closeControl, closeArt: closeArt,
    questMarker: questMarker, markerControl: markerControl, markerArt: markerArt, markerGlyph: markerGlyph,
    rewardAnchor: rewardAnchor, rewardHint: rewardHint, hasTasks: false, popupClosed: false
  };
  function setPopupClosed(closed, control) {
    if (ui._battleHud !== state || !control.node.activeInHierarchy || !control.interactable) return;
    state.popupClosed = closed;
    layout(ui);
  }
  closeButton.on("click", function () { setPopupClosed(true, closeControl); });
  questMarker.on("click", function () { setPopupClosed(false, markerControl); });
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
  king.setScale(.5);
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
    state.taskName.opacity = state.pendingLabel.opacity = state.collectLabel.opacity = state.rewardAnchor.opacity = state.rewardPreview.opacity = alpha;
  }
  speaker.active = state.hasTasks && (planning || alpha > 0);
  state.collectControl.interactable = state.closeControl.interactable = state.markerControl.interactable =
    state.hasTasks && planning && alpha > 0;
}
var nativeNode = cc.Node && cc.Node.prototype, nativeScene = cc.Scene && cc.Scene.prototype;
var nativeToLocal = nativeNode && nativeNode.convertToNodeSpaceAR;
var nativeUpdateWorld = nativeNode && nativeNode._updateWorldMatrix;
function settledMatrix(root) {
  if (!nativeUpdateWorld || !cc.sys.isNative || cc.ENGINE_VERSION !== "2.4.13" ||
      root.convertToNodeSpaceAR !== nativeToLocal || Object.getPrototypeOf(root) !== nativeNode) return null;
  // The stock converter updates ancestors first. Reuse its old result only
  // when it would leave the world matrix and descendant dirty flags intact.
  for (var node = root, depth = 0; node; node = node._parent) {
    var type = Object.getPrototypeOf(node);
    if (++depth > 16 || node._worldMatDirty !== false || node._updateWorldMatrix !== nativeUpdateWorld ||
        type !== nativeNode && type !== nativeScene) return null;
  }
  var matrix = root._worldMatrix && root._worldMatrix.m;
  if (!matrix || matrix.length !== 16 || matrix[2] || matrix[3] || matrix[6] || matrix[7] ||
      matrix[8] || matrix[9] || matrix[11] || matrix[15] !== 1) return null;
  var determinant = (matrix[0] * matrix[5] - matrix[1] * matrix[4]) * matrix[10];
  return determinant && Number.isFinite(determinant) ? matrix : null;
}
function safeBounds(root, cache, clamp) {
  var origin = cc.view.getVisibleOrigin(), visible = cc.view.getVisibleSize();
  var safe = cc.sys.getSafeAreaRect ? cc.sys.getSafeAreaRect() : { x: origin.x, y: origin.y, width: visible.width, height: visible.height };
  var x = clamp ? Math.max(origin.x, safe.x) : safe.x, y = clamp ? Math.max(origin.y, safe.y) : safe.y;
  var right = safe.x + safe.width, top = safe.y + safe.height;
  if (clamp) {
    right = Math.min(origin.x + visible.width, right);
    top = Math.min(origin.y + visible.height, top);
  }
  var matrix, previous = cache.matrix, i;
  if (cache.root === root && Object.is(cache.worldLeft, x) && Object.is(cache.worldBottom, y) &&
      Object.is(cache.worldRight, right) && Object.is(cache.worldTop, top)) {
    matrix = settledMatrix(root);
    if (matrix) {
      for (i = 0; i < 16; i++) {
        if (!Object.is(matrix[i], previous[i])) break;
      }
      if (i === 16) return cache.bounds;
    }
  }
  var a = root.convertToNodeSpaceAR(cc.v2(x, y)), b = root.convertToNodeSpaceAR(cc.v2(right, top));
  var left = Math.min(a.x, b.x), localRight = Math.max(a.x, b.x), bottom = Math.min(a.y, b.y), localTop = Math.max(a.y, b.y);
  var bounds = cache.bounds;
  if (!bounds || !Object.is(bounds.left, left) || !Object.is(bounds.right, localRight) ||
      !Object.is(bounds.bottom, bottom) || !Object.is(bounds.top, localTop)) {
    bounds = cache.bounds = { left: left, right: localRight, bottom: bottom, top: localTop };
  }
  matrix = settledMatrix(root);
  if (matrix) {
    for (i = 0; i < 16 && Number.isFinite(matrix[i]); i++) previous[i] = matrix[i];
    cache.root = i === 16 ? root : null;
    cache.worldLeft = x; cache.worldBottom = y; cache.worldRight = right; cache.worldTop = top;
  } else cache.root = null;
  return bounds;
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
  var inputs = row._battleRewardInputs || (row._battleRewardInputs = {});
  var font = text.font && text.font.uuid;
  if (inputs.string === text.string && inputs.fontSize === text.fontSize && inputs.font === font &&
      inputs.amountWidth === amount.width && inputs.amountScale === amount.scaleX &&
      inputs.videoWidth === video.width && inputs.videoScale === video.scaleX &&
      inputs.silverWidth === silver.width && inputs.silverScale === silver.scaleX && inputs.anchor === button.anchorX) return;
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
  inputs.string = text.string; inputs.fontSize = text.fontSize; inputs.font = font;
  inputs.amountWidth = amount.width; inputs.amountScale = amount.scaleX;
  inputs.videoWidth = video.width; inputs.videoScale = video.scaleX;
  inputs.silverWidth = silver.width; inputs.silverScale = silver.scaleX; inputs.anchor = button.anchorX;
}
function headerLabelChanged(row, node, includeText) {
  var text = node && component(node, cc.Label), font = text && text.font && text.font.uuid;
  if (!text) {
    var hadLabel = !!row.node;
    row.node = null;
    return hadLabel;
  }
  var string = includeText ? text.string : null;
  if (row.node === node && row.string === string && row.width === node.width && row.height === node.height &&
      row.x === node.x && row.y === node.y && row.scaleX === node.scaleX && row.scaleY === node.scaleY &&
      row.fontSize === text.fontSize && row.lineHeight === text.lineHeight && row.font === font &&
      row.family === text.fontFamily && row.overflow === text.overflow && row.wrap === text.enableWrapText) return false;
  row.node = node; row.string = string; row.width = node.width; row.height = node.height;
  row.x = node.x; row.y = node.y; row.scaleX = node.scaleX; row.scaleY = node.scaleY;
  row.fontSize = text.fontSize; row.lineHeight = text.lineHeight; row.font = font; row.family = text.fontFamily;
  row.overflow = text.overflow; row.wrap = text.enableWrapText;
  return true;
}
function layoutHeader(ui, bounds) {
  var state = ui._battleHud, root = ui.ctrUI.node, coin = ui.ndCoin, pause = ui.btnSuspend, buildings = ui.btnBuildInfo;
  var canvas = cc.Canvas && cc.Canvas.instance, badge = canvas && canvas.node.getChildByName("DevelopmentTestModeBadge"), badgeFloor = bounds.top;
  if (badge && badge.active && badge.activeInHierarchy !== false) badgeFloor = root.convertToNodeSpaceAR(badge.convertToWorldSpaceAR(cc.v2(0, -badge.height * badge.anchorY))).y - 12;
  fitCoin(coin); rewardSpacing(ui);
  var name = ui.ndLevelInfo.getChildByName("labName"), wave = ui.ndLevelInfo.getChildByName("labOrder");
  var buildingCaption = buildings.getChildByName("labNum");
  var inputs = state.headerInputs || (state.headerInputs = { name: {}, wave: {}, caption: {} });
  var nameChanged = headerLabelChanged(inputs.name, name, true);
  var waveChanged = headerLabelChanged(inputs.wave, wave, true);
  var captionChanged = headerLabelChanged(inputs.caption, buildingCaption, false);
  if (!nameChanged && !waveChanged && !captionChanged &&
      inputs.left === bounds.left && inputs.right === bounds.right && inputs.top === bounds.top && inputs.badgeFloor === badgeFloor &&
      inputs.coinWidth === coin.width && inputs.coinHeight === coin.height && inputs.pauseWidth === pause.width &&
      inputs.pauseHeight === pause.height && inputs.buildWidth === buildings.width && inputs.buildHeight === buildings.height) return;
  inputs.left = bounds.left; inputs.right = bounds.right; inputs.top = bounds.top; inputs.badgeFloor = badgeFloor;
  inputs.coinWidth = coin.width; inputs.coinHeight = coin.height; inputs.pauseWidth = pause.width; inputs.pauseHeight = pause.height;
  inputs.buildWidth = buildings.width; inputs.buildHeight = buildings.height;
  [coin, pause, buildings].forEach(function (node) { var widget = node.getComponent(cc.Widget); if (widget) widget.enabled = false; });
  var margin = 18, center = (bounds.left + bounds.right) / 2;
  var rowY = bounds.top - Math.max(60, margin + coin.height / 2, margin + pause.height / 2);
  coin.setPosition(bounds.left + margin + coin.width / 2, rowY);
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
function shown(node) {
  return !!node && node.active !== false && node.activeInHierarchy !== false;
}
function footerBox(box, node, caption) {
  if (!node) {
    var removed = !!box.node;
    box.node = null; box.visible = false;
    return removed;
  }
  var sx = Math.abs(node.scaleX), sy = Math.abs(node.scaleY), visible = shown(node);
  var minX = -node.anchorX * node.width * sx, maxX = (1 - node.anchorX) * node.width * sx;
  var minY = -node.anchorY * node.height * sy, maxY = (1 - node.anchorY) * node.height * sy;
  if (shown(caption)) {
    var w = caption.width * Math.abs(caption.scaleX) * sx, h = caption.height * Math.abs(caption.scaleY) * sy;
    minX = Math.min(minX, caption.x * sx - caption.anchorX * w);
    maxX = Math.max(maxX, caption.x * sx + (1 - caption.anchorX) * w);
    minY = Math.min(minY, caption.y * sy - caption.anchorY * h);
    maxY = Math.max(maxY, caption.y * sy + (1 - caption.anchorY) * h);
  }
  if (box.node === node && box.visible === visible &&
      box.minX === minX && box.maxX === maxX && box.minY === minY && box.maxY === maxY) return false;
  box.node = node; box.visible = visible;
  box.minX = minX; box.maxX = maxX; box.minY = minY; box.maxY = maxY;
  return true;
}
function positionJoystick(control, rod, root, state, force) {
  var parent = rod.parent, point = cc.v2(state.restX, state.restY);
  if (parent !== root) point = parent.convertToNodeSpaceAR(root.convertToWorldSpaceAR(point));
  if (force || state.control !== control || state.joystick !== rod || state.restParent !== parent ||
      state.restLocalX !== point.x || state.restLocalY !== point.y) {
    control.setJoystickRest(point);
    state.control = control; state.joystick = rod; state.restParent = parent;
    state.restLocalX = point.x; state.restLocalY = point.y;
  }
}
function layoutFooter(ui) {
  var control = ui.ctrUI, root = control && control.node, rod = control && control.ndRod;
  var button = ui.btnStartFight, rally = ui.btnAgg, follow = ui.btnFollow, coin = ui.btnAddCoin;
  if (!root || !rod || !button || !cc.view) return;
  var state = ui._battleFooterLayout || (ui._battleFooterLayout = {
    bounds: { matrix: [] }, start: {}, rally: {}, follow: {}, coin: {}
  });
  var bounds = safeBounds(root, state.bounds, false), left = bounds.left, right = bounds.right, bottom = bounds.bottom;
  var startBox = state.start, rallyBox = state.rally, followBox = state.follow, coinBox = state.coin;
  var startChanged = footerBox(startBox, button, ui._completionReward && ui._completionReward.node);
  var rallyChanged = footerBox(rallyBox, rally, rally && rally.getChildByName("labNum"));
  var followChanged = footerBox(followBox, follow, follow && follow.getChildByName("labNum"));
  var coinChanged = footerBox(coinBox, coin);
  if (!startChanged && !rallyChanged && !followChanged && !coinChanged &&
      state.left === left && state.right === right && state.bottom === bottom &&
      state.rodWidth === rod.width && state.rodHeight === rod.height && state.rodScaleX === rod.scaleX && state.rodScaleY === rod.scaleY) {
    if (state.control !== control || state.joystick !== rod || rod.parent !== root || state.restParent !== root)
      positionJoystick(control, rod, root, state, false);
    return;
  }
  state.left = left; state.right = right; state.bottom = bottom;
  state.rodWidth = rod.width; state.rodHeight = rod.height; state.rodScaleX = rod.scaleX; state.rodScaleY = rod.scaleY;
  var margin = 18, gap = 18;
  if (coin && !ui._footerCoinOffset) ui._footerCoinOffset = { x: coin.x - button.x, y: coin.y - button.y };
  button.setPosition((left + right) / 2, bottom + margin - startBox.minY);
  if (coin && ui._footerCoinOffset) coin.setPosition(button.x + ui._footerCoinOffset.x, button.y + ui._footerCoinOffset.y);
  var commandX = right - margin - Math.max(rally ? rallyBox.maxX : 0, follow ? followBox.maxX : 0);
  var commandLeft = commandX + Math.min(rally ? rallyBox.minX : 0, follow ? followBox.minX : 0);
  var commandBottom = bottom + margin;
  // Narrow screens can lift the commands while keeping Start centered.
  if (startBox.visible && button.x + startBox.maxX + gap > commandLeft) {
    commandBottom = Math.max(commandBottom, button.y + startBox.maxY + gap);
  }
  if (coinBox.visible && coin.x + coinBox.maxX + gap > commandLeft) {
    commandBottom = Math.max(commandBottom, coin.y + coinBox.maxY + gap);
  }
  if (rally) rally.setPosition(commandX, commandBottom - rallyBox.minY);
  if (follow) {
    var followBottom = rally ? rally.y + rallyBox.maxY + gap : commandBottom;
    follow.setPosition(commandX, followBottom - followBox.minY);
  }
  var rodHalfWidth = rod.width * Math.abs(rod.scaleX) / 2, rodHalfHeight = rod.height * Math.abs(rod.scaleY) / 2;
  state.restX = Math.max(left + margin + rodHalfWidth, left + (right - left) / 4);
  state.restY = bottom + 180 + rodHalfHeight;
  if (startBox.visible) {
    var top = button.y + startBox.maxY;
    if (coinBox.visible && state.restX + rodHalfWidth > coin.x + coinBox.minX) top = Math.max(top, coin.y + coinBox.maxY);
    state.restY = Math.max(state.restY, top + gap + rodHalfHeight);
  }
  positionJoystick(control, rod, root, state, true);
}
function sizeTaskBubble(task, state, width) {
  var name = state.taskName, pending = state.pendingLabel;
  var ready = state.collectButton.active, reward = state.rewardPreview;
  var status = ready ? state.collectLabel : pending.active ? pending : null;
  function signature() {
    return [width, name.getComponent(cc.Label).string, labelMetrics(name), reward.active, state.rewardText.string,
      status && status.name, status && status.getComponent(cc.Label).string, status && labelMetrics(status)].join("|");
  }
  if (state.taskSignature === signature()) return;
  var descriptionWidth = Math.max(1, width - 2 * (TASK_CLOSE_SIZE + TASK_CLOSE_INSET));
  var description = sizeLabel(name, 62, descriptionWidth, true, 72);
  var rewardGap = 8, rewardHeight = 0, statusGap = ready ? 10 : 4, statusHeight = 0;
  if (reward.active) {
    var amount = sizeLabel(state.rewardNumber, 28, 0, false, 32);
    var icon = state.rewardSprite.node, iconGap = 6;
    var rewardWidth = amount.width + iconGap + icon.width;
    rewardHeight = Math.max(amount.height, icon.height);
    reward.setContentSize(rewardWidth, rewardHeight);
    state.rewardNumber.setPosition(-rewardWidth / 2 + amount.width / 2, 0);
    icon.setPosition(rewardWidth / 2 - icon.width / 2, 0);
  }
  if (ready) {
    var buttonWidth = Math.min(184, width - 32);
    statusHeight = Math.max(60, sizeLabel(status, 48, buttonWidth - 24, true, 56).height + 18);
    state.collectButton.setContentSize(buttonWidth, statusHeight);
  } else if (status) {
    statusHeight = sizeLabel(status, 54, width - 32, true, 64).height;
  }
  var height = Math.ceil(description.height + 26 +
    (reward.active ? rewardHeight + rewardGap : 0) + (status ? statusHeight + statusGap : 0));
  task.setContentSize(width, height);
  var closeOffset = TASK_CLOSE_INSET + TASK_CLOSE_SIZE / 2;
  state.closeControl.node.setPosition(width / 2 - closeOffset, height / 2 - closeOffset);
  name.anchorX = name.anchorY = .5;
  var y = height / 2 - 13;
  name.setPosition(0, y - description.height / 2);
  y -= description.height;
  if (reward.active) {
    reward.setPosition(0, y - rewardGap - rewardHeight / 2);
    y -= rewardGap + rewardHeight;
  }
  var statusRow = ready ? state.collectButton : status;
  if (statusRow) {
    statusRow.anchorX = statusRow.anchorY = .5;
    statusRow.setPosition(0, y - statusGap - statusHeight / 2);
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
  var fill = cc.color(16, 23, 32, Math.round(TASK_BUBBLE_ALPHA * opacity / 255));
  var backdrop = state.backdropArt;
  backdrop.clear();
  backdrop.fillColor = fill;
  backdrop.roundRect(-task.width / 2, -task.height / 2, task.width, task.height, 12);
  backdrop.fill();

  var tail = state.tailArt;
  tail.clear();
  tail.fillColor = fill;
  tail.moveTo(-12, 0); tail.lineTo(0, tailOffset); tail.lineTo(12, 0); tail.close(); tail.fill();

  var close = state.closeArt;
  close.clear();
  close.fillColor = cc.color(44, 55, 69, opacity);
  close.roundRect(-15, -15, 30, 30, 6);
  close.fill();
  close.strokeColor = cc.color(235, 240, 248, opacity);
  close.lineWidth = 3;
  close.moveTo(-6, -6); close.lineTo(6, 6);
  close.moveTo(-6, 6); close.lineTo(6, -6); close.stroke();

  if (button.active) {
    var art = state.collectArt;
    art.clear();
    art.fillColor = cc.color(39, 115, 70, opacity);
    art.strokeColor = cc.color(107, 179, 127, opacity);
    art.lineWidth = 2;
    art.roundRect(-button.width / 2 + 1, -button.height / 2 + 1, button.width - 2, button.height - 2, 12);
    art.fill();
    art.stroke();
  }
}
function paintQuestMarker(state, opacity) {
  var ready = state.collectButton.active;
  var signature = (ready ? 256 : 0) + opacity;
  if (state.markerPaintSignature === signature) return;
  state.markerPaintSignature = signature;
  var tint = ready ? cc.color(155, 240, 181) : cc.color(255, 214, 106);
  var art = state.markerArt;
  art.clear();
  art.fillColor = cc.color(16, 23, 32, Math.round(TASK_BUBBLE_ALPHA * opacity / 255));
  art.strokeColor = cc.color(tint.r, tint.g, tint.b, opacity);
  art.lineWidth = 3;
  art.circle(0, 0, state.questMarker.width / 2 - 1.5);
  art.fill();
  art.stroke();
  state.markerGlyph.string = ready ? "?" : "!";
  state.markerGlyph.node.color = tint;
  state.markerGlyph.node.opacity = opacity;
}
function layoutTaskPrompt(ui, bounds) {
  var state = ui._battleHud, task = ui.ndTask, marker = state.questMarker, king = state.king, game = ui.ctrGame;
  var camera = game && (game.camera || cc.Camera && cc.Camera.main);
  if (!king || !king.activeInHierarchy || !king.opacity || !camera) {
    task.active = marker.active = false;
    return;
  }
  var root = ui.ctrUI.node;
  function project(y) {
    return root.convertToNodeSpaceAR(camera.getWorldToScreenPoint(king.convertToWorldSpaceAR(cc.v2(0, y))));
  }
  var head = project(182), feet = project(0);
  var visible = feet.x >= bounds.left - 24 && feet.x <= bounds.right + 24 && head.y >= bounds.bottom && feet.y <= bounds.top;
  task.active = visible && !state.popupClosed;
  marker.active = visible && state.popupClosed;
  if (!visible) return;

  var margin = 16, gap = task.active ? 18 : 8;
  if (task.active) sizeTaskBubble(task, state, Math.min(360, bounds.right - bounds.left - margin * 2));
  var prompt = task.active ? task : marker;
  var hw = prompt.width / 2, hh = prompt.height / 2;
  var x = Math.max(bounds.left + margin + hw, Math.min(bounds.right - margin - hw, head.x));
  var wave = ui.ndLevelInfo.getChildByName("labOrder");
  var top = Math.min(bounds.top - margin, ui.ndLevelInfo.y + wave.y - wave.height * Math.abs(wave.scaleY) / 2 - 12);
  var below = head.y + gap + prompt.height > top && feet.y - gap - prompt.height >= bounds.bottom + margin;
  var y = below ? feet.y - gap - hh : head.y + gap + hh;
  y = Math.max(bounds.bottom + margin + hh, Math.min(top - hh, y));
  prompt.setPosition(x, y);
  if (marker.active) {
    paintQuestMarker(state, king.opacity);
    return;
  }
  var tailX = Math.max(-hw + 28, Math.min(hw - 28, head.x - x));
  var tailY = below ? hh : -hh;
  if (state.tail.x !== tailX || state.tail.y !== tailY) state.tail.setPosition(tailX, tailY);
  paintTaskBubble(task, state, king.opacity, below ? gap : -gap);
}
function layout(ui, dt) {
  if (!ui._battleHud || !cc.view) return;
  var state = ui._battleHud, cache = state.headerBounds || (state.headerBounds = { matrix: [] });
  var bounds = safeBounds(ui.ctrUI.node, cache, true);
  layoutHeader(ui, bounds);
  fadeTaskSpeaker(ui, dt);
  layoutTaskPrompt(ui, bounds);
}
function updateTasks(ui, task) {
  var state = ui._battleHud;
  if (!state) return;
  state.hasTasks = task.index < task.list.length;
  var reward = state.hasTasks && task.reward && task.reward[task.index];
  state.rewardPreview.active = !!reward;
  if (reward) {
    var multiplier = task.rewardMultiplier === undefined ? ui.ctrGame.gameData.levelCfg.InGameCoefficient : task.rewardMultiplier;
    var amount = String(reward.id === SILVER ? reward.num : reward.num * (multiplier === undefined ? 1 : multiplier));
    if (state.rewardAmount !== amount) {
      state.rewardAmount = amount;
      state.rewardText.string = "[[loc:battle.task.reward]] " + amount;
    }
    if (state.rewardItem !== reward.id) {
      state.rewardItem = reward.id;
      state.rewardSprite.spriteFrame = null;
      if (reward.id === SILVER) {
        state.rewardSprite.spriteFrame = component(ui.ndCoin.children[0], cc.Sprite).spriteFrame;
      } else {
        var goods = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getGoodsCfgById(reward.id);
        if (goods && goods.icon) {
          var bundle = require("KinghtFallConfig").KinghtFallBundelName.IconGood;
          ui.loadSpriteFrame(bundle, goods.icon, function (frame) {
            if (ui._battleHud === state && state.rewardItem === reward.id) state.rewardSprite.spriteFrame = frame;
          });
        }
      }
    }
  }
  layout(ui);
}
function dispose(ui) {
  var state = ui._battleHud;
  ui._battleHud = null;
  if (!state) return;
  if (state.king && cc.isValid(state.king, true)) state.king.destroy();
  if (cc.isValid(state.questMarker, true)) state.questMarker.destroy();
  if (cc.isValid(state.rewardHint, true)) cc.Tween.stopAllByTarget(state.rewardHint);
  if (cc.isValid(ui.ndTask, true)) ui.ndTask.active = false;
}
exports.install = install; exports.layout = layout; exports.updateTasks = updateTasks; exports.mountTaskSpeaker = mountTaskSpeaker; exports.rewardSpacing = rewardSpacing; exports.dispose = dispose;
exports.layoutFooter = layoutFooter;
