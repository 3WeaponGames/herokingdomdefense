"use strict";
// Battle HUD layout only. Task progress, rewards and tutorial ownership stay
// with their existing controllers; the drawer just reveals the task card.
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
function card(node) {
  var sprite = component(node, cc.Sprite); if (sprite) sprite.enabled = false;
  var background = node.getChildByName("DrawerBackground");
  if (!background) { background = new cc.Node("DrawerBackground"); background.parent = node; background.zIndex = -1; background.addComponent(cc.Graphics); }
  var signature = [node.width, node.height, node.anchorX, node.anchorY].join(":");
  if (background._drawerSize === signature) return; background._drawerSize = signature;
  background.setPosition(node.width * (.5 - node.anchorX), node.height * (.5 - node.anchorY));
  var g = background.getComponent(cc.Graphics); g.clear(); g.fillColor = cc.color(18, 24, 29, 230);
  g.roundRect(-node.width / 2, -node.height / 2, node.width, node.height, Math.min(24, node.height / 2)); g.fill();
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
  var handle = new cc.Node("BattleTasksToggle"); handle.parent = root; handle.setContentSize(180, 60);
  handle.addComponent(cc.BlockInputEvents);
  var title = new cc.Node("TasksTitle"); title.parent = handle; title.anchorX = 0; title.setContentSize(128, 46);
  label(title, 30); var outline = title.addComponent(cc.LabelOutline); outline.color = cc.Color.BLACK; outline.width = 2;
  require("LanguageMgr").LanguageMgr.getInstance().bindLabel(title.getComponent(cc.Label), "battle.tasks");
  var arrow = new cc.Node("DrawerArrow"); arrow.parent = handle; arrow.addComponent(cc.Graphics);
  var red = new cc.Node("ndRed"); red.parent = handle; red.setContentSize(22, 22);
  var dot = red.addComponent(cc.Graphics); dot.fillColor = cc.color("#f51e31"); dot.strokeColor = cc.Color.BLACK; dot.lineWidth = 3; dot.circle(0, 0, 11); dot.fill(); dot.stroke(); red.active = false;
  var view = new cc.Node("BattleTaskViewport"); view.parent = root; view.anchorX = 0; view.setContentSize(0, 80); view.addComponent(cc.Mask).type = cc.Mask.Type.RECT;
  task.parent = view; task.anchorX = 0; task.anchorY = .5; disableFit(task); task.active = false;
  task.opacity = handle.opacity = 255;
  // Reward feedback floats above the card rather than being clipped with the
  // sliding drawer. Keep its original local animation on a separate anchor.
  var rewardAnchor = new cc.Node("BattleTaskFeedback"); rewardAnchor.parent = root; rewardAnchor.zIndex = 10;
  var rewardHint = task.getChildByName("ndAni"); rewardHint.parent = rewardAnchor; rewardHint.active = false;
  disableFit(ui.ndLevelInfo);
  var titleBackground = component(ui.ndLevelInfo, cc.Sprite); if (titleBackground) titleBackground.enabled = false;
  var state = ui._battleHud = { handle: handle, title: title, arrow: arrow, red: red, view: view, rewardAnchor: rewardAnchor, rewardHint: rewardHint, open: false, animating: false, hasTask: false, ready: false };
  handle.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); setOpen(ui, !state.open); });
  layout(ui);
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
function layout(ui) {
  var state = ui._battleHud; if (!state || !cc.view) return;
  // Keep labels enabled behind the zero-width mask while closed. Otherwise
  // native/browser font measurement waits until opening and changes the height.
  state.view.active = ui.ndTask.active = state.hasTask;
  var root = ui.ctrUI.node, bounds = safeBounds(root), coin = ui.ndCoin, pause = ui.btnSuspend, buildings = ui.btnBuildInfo;
  var canvas = cc.Canvas && cc.Canvas.instance, badge = canvas && canvas.node.getChildByName("DevelopmentTestModeBadge"), badgeFloor = bounds.top;
  if (badge && badge.active && badge.activeInHierarchy !== false) badgeFloor = root.convertToNodeSpaceAR(badge.convertToWorldSpaceAR(cc.v2(0, -badge.height * badge.anchorY))).y - 12;
  fitCoin(coin); rewardSpacing(ui);
  var name = ui.ndLevelInfo.getChildByName("labName"), wave = ui.ndLevelInfo.getChildByName("labOrder");
  var taskName = ui.ndTask.getChildByName("labName"), claim = ui.ndTask.getChildByName("labGet"), pending = ui.ndTask.getChildByName("labNoFinish");
  var toggleText = state.title.getComponent(cc.Label);
  var signature = [bounds.left, bounds.right, bounds.top, badgeFloor, coin.width, coin.height, name.getComponent(cc.Label).string, wave.getComponent(cc.Label).string,
    [name, wave, taskName, claim, pending, buildings.getChildByName("labNum")].map(labelMetrics).join(";"),
    taskName.getComponent(cc.Label).string, claim.getComponent(cc.Label).string, pending.getComponent(cc.Label).string,
    toggleText.string, toggleText.fontSize, toggleText.font && toggleText.font.uuid, toggleText.fontFamily, state.hasTask, state.ready, state.open].join("|");
  state.handle.active = state.hasTask; state.red.active = state.hasTask && state.ready && !state.open;
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
  var buildingBottom = buildings.y - buildings.height / 2;
  if (buildingCaption) buildingBottom = Math.min(buildingBottom, buildings.y + buildingCaption.y - buildingCaption.height * Math.abs(buildingCaption.scaleY));
  var waveBottom = titleY + wave.y - waveSize.height / 2;
  var available = bounds.right - bounds.left - margin * 2;
  var beforeControls = controlsX - controlHalfWidth - 12 - (bounds.left + margin);
  var besideControls = beforeControls >= 360;
  var total = Math.min(710, besideControls ? beforeControls : available), panelWidth = total - 50;
  var status = state.ready ? claim : pending;
  var statusSize = sizeLabel(status, 67, 0, false, 78);
  var description = sizeLabel(taskName, 67, Math.max(80, panelWidth - statusSize.width - 46), true, 78);
  var height = Math.max(66, Math.max(description.height, statusSize.height) + 20);
  var toggleSize = sizeLabel(state.title, 30, 0, false, 38);
  state.closedWidth = Math.max(100, Math.ceil(toggleSize.width + 48));
  var oldPanelWidth = state.panelWidth, progress = oldPanelWidth ? state.view.width / oldPanelWidth : 0;
  var taskTop = Math.min(coin.y - coin.height / 2, waveBottom);
  if (!besideControls) taskTop = Math.min(taskTop, buildingBottom);
  var taskY = taskTop - 12 - height / 2;
  state.drawerLeft = bounds.left + margin; state.taskY = taskY;
  state.closedTaskY = coin.y - coin.height / 2 - 12 - height / 2;
  state.openTaskY = taskY;
  state.handle.height = state.view.height = height;
  var g = state.arrow.getComponent(cc.Graphics), direction = state.open ? -1 : 1;
  g.clear(); g.strokeColor = cc.Color.WHITE; g.lineWidth = 4; g.moveTo(-direction * 5, 9); g.lineTo(direction * 5, 0); g.lineTo(-direction * 5, -9); g.stroke();
  state.view.setPosition(state.drawerLeft, taskY);
  state.rewardAnchor.setPosition(state.view.x + panelWidth / 2, taskY);
  ui.ndTask.setContentSize(panelWidth, height); taskName.anchorX = 0; taskName.setPosition(16, 0);
  [claim, pending].forEach(function (node) { node.anchorX = 1; node.setPosition(panelWidth - 16, 0); });
  ui.ndTask.setPosition(0, 0); card(ui.ndTask);
  state.panelWidth = panelWidth;
  // Reveal a stationary card through one animated mask. The handle follows
  // its edge, so its caption cannot overlap the task while closing.
  if (!state.animating) state.view.width = state.open ? panelWidth : 0;
  else if (oldPanelWidth && oldPanelWidth !== panelWidth) state.view.width = Math.max(0, Math.min(1, progress)) * panelWidth;
  renderDrawer(ui);
  if (state.animating && oldPanelWidth && oldPanelWidth !== panelWidth) animateDrawer(ui);
}
function renderDrawer(ui) {
  var state = ui._battleHud; if (!state || !state.panelWidth) return;
  var progress = Math.max(0, Math.min(1, state.view.width / state.panelWidth));
  state.taskY = state.closedTaskY + (state.openTaskY - state.closedTaskY) * progress;
  state.view.y = state.rewardAnchor.y = state.taskY;
  state.handle.width = state.closedWidth + (44 - state.closedWidth) * progress;
  state.handle.setPosition(state.drawerLeft + state.view.width + 6 * progress + state.handle.width / 2, state.taskY);
  state.title.setPosition(-state.handle.width / 2 + 12, 0);
  state.title.opacity = Math.round(255 * Math.max(0, 1 - progress * 3));
  state.title.active = true; state.arrow.x = (state.closedWidth / 2 - 19) * (1 - progress);
  state.red.setPosition(state.handle.width / 2 - 3, state.handle.height / 2 - 3);
  state.red.active = state.hasTask && state.ready && !state.open && !state.animating;
  state.view.active = ui.ndTask.active = state.hasTask;
  card(state.handle);
}
function animateDrawer(ui) {
  var state = ui._battleHud, target = state.open ? state.panelWidth : 0;
  cc.Tween.stopAllByTarget(state.view);
  var generation = state.animationGeneration = (state.animationGeneration || 0) + 1;
  var distance = Math.abs(target - state.view.width) / state.panelWidth;
  cc.tween(state.view).to(Math.max(.08, .26 * distance), { width: target }, {
    easing: "cubicInOut", onUpdate: function () { if (ui._battleHud === state) renderDrawer(ui); }
  }).call(function () {
    if (ui._battleHud !== state || state.animationGeneration !== generation) return;
    state.animating = false; state.view.width = target; renderDrawer(ui);
  }).start();
}
function updateTasks(ui, hasTask, ready) {
  var state = ui._battleHud; if (!state) return;
  state.hasTask = hasTask; state.ready = hasTask && ready;
  if (!hasTask) { state.open = false; state.animating = false; cc.Tween.stopAllByTarget(state.view); }
  layout(ui);
}
function setOpen(ui, open) {
  var state = ui._battleHud; if (!state || !state.hasTask || state.open === open) return;
  cc.Tween.stopAllByTarget(state.view);
  state.open = open; state.animating = true;
  // Label.onEnable reapplies localized typography. Activate before measuring.
  ui.ndTask.active = true; layout(ui);
  animateDrawer(ui);
}
function dispose(ui) {
  if (ui._battleHud && cc.isValid(ui._battleHud.view, true)) cc.Tween.stopAllByTarget(ui._battleHud.view);
  if (ui._battleHud && cc.isValid(ui._battleHud.rewardHint, true)) cc.Tween.stopAllByTarget(ui._battleHud.rewardHint);
  ui._battleHud = null;
}
exports.install = install; exports.layout = layout; exports.updateTasks = updateTasks; exports.setOpen = setOpen; exports.rewardSpacing = rewardSpacing; exports.dispose = dispose;
