"use strict";
var Core = require("LobbyLayoutCore"), Config = require("KinghtFallConfig"), Language = require("LanguageMgr");
function disable(node, Type) { var component = node && node.getComponent(Type); if (component) component.enabled = false; }
function graphics(node) {
  if (node.getComponent(cc.Sprite)) {
    var background = node.getChildByName("LayoutGraphics");
    if (!background) { background = new cc.Node("LayoutGraphics"); background.parent = node; background.zIndex = -1; }
    node = background;
  }
  return node.getComponent(cc.Graphics) || node.addComponent(cc.Graphics);
}
function scrollOffset(scroll) { return Math.max(0, -scroll.getScrollOffset().x); }
function badge(parent) {
  var node = new cc.Node("ndRed"); node.parent = parent; node.setPosition(13, 28); node.setContentSize(22, 22);
  var g = graphics(node); g.fillColor = cc.color("#f3152b"); g.strokeColor = cc.Color.BLACK; g.lineWidth = 3; g.circle(0, 0, 10); g.fill(); g.stroke(); node.active = false; return node;
}
function arrow(parent, direction, clicked) {
  var node = new cc.Node(direction < 0 ? "ScrollLeft" : "ScrollRight"); node.parent = parent; node.setContentSize(38, 130);
  node._arrowDirection = direction;
  node.addComponent(cc.Button).transition = cc.Button.Transition.SCALE;
  node.on(cc.Node.EventType.TOUCH_END, function (event) { event.stopPropagation(); if (node._scrollEnabled) clicked(); });
  node.rewardBadge = badge(node); return node;
}
function arrowState(node, enabled) {
  if (node._scrollEnabled === enabled) return; node._scrollEnabled = enabled;
  node.getComponent(cc.Button).interactable = enabled;
  var direction = node._arrowDirection, g = graphics(node); g.clear(); g.lineWidth = 5;
  g.strokeColor = cc.color(enabled ? "#bcecff" : "#8d96a6");
  g.moveTo(-direction * 7, 12); g.lineTo(direction * 7, 0); g.lineTo(-direction * 7, -12); g.stroke();
}
function bind(node, key, params) { Language.LanguageMgr.getInstance().bindLabel(node.getComponent(cc.Label), key, params); }
function lockButtonSize(node) {
  (node.getComponents(cc.Component) || []).forEach(function (c) { if (Array.isArray(c.content) && c.minWidth !== undefined) c.enabled = false; });
  node.setContentSize(341, 146);
  var label = node.getChildByName("labName"); label.setPosition(0, 30); label.setContentSize(650, 128);
  var text = label.getComponent(cc.Label); text.fontSize = 94; text.lineHeight = 112; text.overflow = cc.Label.Overflow.CLAMP; text.enableWrapText = false;
  node.getChildByName("Layout").y = -31;
}
function paintMode(node, enabled) {
  if (node._blueState === enabled) return; node._blueState = enabled;
  var g = graphics(node), w = 341, h = 146;
  function polygon(y, color) {
    g.fillColor = cc.color(color); g.moveTo(-w / 2 + 30, h / 2 + y); g.lineTo(w / 2 - 30, h / 2 + y); g.lineTo(w / 2, y); g.lineTo(w / 2 - 30, -h / 2 + y); g.lineTo(-w / 2 + 30, -h / 2 + y); g.lineTo(-w / 2, y); g.close(); g.fill();
  }
  g.clear(); polygon(-3, "#11131a"); polygon(0, enabled ? "#007bb7" : "#555766");
  g.fillColor = cc.color(enabled ? "#20d4f3" : "#9b9eab"); g.moveTo(-138, 68); g.lineTo(138, 68); g.lineTo(165, 0); g.lineTo(139, -61); g.lineTo(-139, -61); g.lineTo(-165, 0); g.close(); g.fill();
  g.fillColor = new cc.Color(255, 255, 255, enabled ? 65 : 30); g.moveTo(-133, 61); g.lineTo(133, 61); g.lineTo(151, 17); g.lineTo(-151, 17); g.close(); g.fill();
  g.fillColor = cc.color(enabled ? "#007eaf" : "#626574"); g.roundRect(-75, -54, 150, 45, 22); g.fill();
}
function install(home) {
  if (home._lobby) return home._lobby;
  var bar = home.ndBtnLeft, content = bar.getChildByName("Layout");
  disable(bar, cc.Widget); disable(bar, cc.Sprite); disable(content, cc.Layout);
  if (bar.getChildByName("btnMove")) bar.getChildByName("btnMove").active = false;
  bar.anchorX = bar.anchorY = .5;
  var view = new cc.Node("RewardViewport"); view.parent = bar; view.addComponent(cc.Mask).type = cc.Mask.Type.RECT;
  content.parent = view; content.anchorX = 0; content.anchorY = .5;
  var scroll = bar.addComponent(cc.ScrollView); scroll.content = content; scroll.horizontal = true; scroll.vertical = false; scroll.inertia = true; scroll.brake = .55; scroll.cancelInnerEvents = true;
  var quest = cc.instantiate(home.btnSign); quest.name = "btnQuests"; quest.parent = content;
  quest.getChildByName("ndRed").active = false;
  var questIcon = quest.getComponentsInChildren(cc.Sprite).filter(function (s) { return s.node.name !== "ndRed"; })[0];
  questIcon.sizeMode = cc.Sprite.SizeMode.CUSTOM; questIcon.node.setContentSize(100, 100);
  cc.resources.load("icons/GUI-Pro/Icons/Icon_Quest", cc.SpriteFrame, function (error, frame) { if (!error && frame && cc.isValid(quest, true)) questIcon.spriteFrame = frame; });
  bind(quest.getChildByName("labName"), "lobby.quests");
  quest.on(cc.Node.EventType.TOUCH_END, function () { require("UIMgr").UIMgr.getInstance().openUI(Config.KinghtFallUIID.UIQuests, Config.KinghtFallUIID.UIHome); });
  var items = [home.btnAchieve, home.btnPassport, home.btnOnline, home.btnSign, quest];
  var state = home._lobby = { bar: bar, view: view, content: content, scroll: scroll, items: items, quest: quest };
  state.left = arrow(bar, -1, function () { scroll.scrollToOffset(cc.v2(Math.max(0, scrollOffset(scroll) - state.geometry.viewport), 0), .22); });
  state.right = arrow(bar, 1, function () { scroll.scrollToOffset(cc.v2(Math.min(scroll.getMaxScrollOffset().x, scrollOffset(scroll) + state.geometry.viewport), 0), .22); });
  var legacy = home.btnSubBg.children[0]; legacy.active = false; legacy.parent = home.node;
  disable(home.btnSubBg, cc.Layout); disable(home.btnSubBg, cc.Sprite); disable(home.btnSubBg, cc.Widget);
  home.btnSubBg.parent = home.node; home.btnSubBg.setPosition(0, 0);
  var defense = state.defense = cc.instantiate(home.btnBattle); defense.name = "WallDefenseButton"; defense.parent = home.btnSubBg; defense._isLobbyMode = true;
  disable(defense, cc.Sprite); defense.getChildByName("mask").active = false;
  lockButtonSize(home.btnBattle); lockButtonSize(defense);
  bind(home.btnBattle.getChildByName("labName"), "lobby.campaign"); bind(defense.getChildByName("labName"), "lobby.wallDefense");
  var caption = state.defenseCaption = new cc.Node("WallDefenseStatus"); caption.parent = home.node; caption.setContentSize(341, 38);
  var label = caption.addComponent(cc.Label); label.fontSize = 26; label.lineHeight = 32; label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
  var outline = caption.addComponent(cc.LabelOutline); outline.color = cc.Color.BLACK; outline.width = 2;
  disable(home.btnSetting.parent, cc.Sprite);
  home.btnSetting.parent = home.node; disable(home.btnSetting, cc.Widget);
  if (home.btnSubEnter) home.btnSubEnter.active = false;
  home.ndTaskInfo.active = false;
  var ribbon = home.ndLevelInfo.getChildByName("wg_zy_pd");
  if (ribbon) {
    ribbon.y = 390;
    (ribbon.getComponents(cc.Component) || []).forEach(function (c) {
      if (c.ribbonTitle !== undefined) { c.minWidth = 620; c.minHeight = 112; c.maxWidth = 620; c.invalidate(); }
    });
  }
  layout(home); return state;
}
function logicalWidth() {
  if (typeof window !== "undefined" && window.innerWidth && !(cc.sys && cc.sys.isNative)) return window.innerWidth;
  var frame = cc.view.getFrameSize(), ratio = cc.view.getDevicePixelRatio ? cc.view.getDevicePixelRatio() : 1;
  return frame.width / Math.max(1, ratio || 1);
}
function layout(home) {
  var state = home._lobby; if (!state) return;
  var origin = cc.view.getVisibleOrigin(), size = cc.view.getVisibleSize(), safe = cc.sys.getSafeAreaRect ? cc.sys.getSafeAreaRect() : { x: origin.x, y: origin.y, width: size.width, height: size.height };
  var a = home.node.convertToNodeSpaceAR(cc.v2(Math.max(origin.x, safe.x), Math.max(origin.y, safe.y)));
  var b = home.node.convertToNodeSpaceAR(cc.v2(Math.min(origin.x + size.width, safe.x + safe.width), Math.min(origin.y + size.height, safe.y + safe.height)));
  var bounds = { left: a.x, right: b.x, bottom: a.y, top: b.y, footer: a.y + 120 };
  var manager = require("UIMgr").UIMgr.getInstance(), ui = manager.getUIById(Config.KinghtFallUIID.UIHome), footer = ui && ui.node.getChildByName("ndBottom");
  if (footer) bounds.footer = Math.max(bounds.footer, home.node.convertToNodeSpaceAR(footer.convertToWorldSpaceAR(cc.v2(0, footer.height * (1 - footer.anchorY)))).y);
  var points = logicalWidth(), geometry = Core.measure(bounds, points), signature = JSON.stringify([bounds, points, Language.LanguageMgr.getInstance().currentLan]);
  if (signature !== state.signature) {
    var oldCell = state.geometry && state.geometry.cell, oldOffset = oldCell ? scrollOffset(state.scroll) / oldCell : 0;
    state.signature = signature; state.geometry = geometry;
    state.bar.setPosition(geometry.center, geometry.barY); state.bar.setContentSize(geometry.barWidth, geometry.barHeight);
    var background = graphics(state.bar); background.clear(); background.fillColor = new cc.Color(19, 61, 159, 155); background.roundRect(-geometry.barWidth / 2, -geometry.barHeight / 2, geometry.barWidth, geometry.barHeight, 22); background.fill();
    state.view.setContentSize(geometry.viewport, geometry.barHeight); state.content.setContentSize(geometry.cell * 5, geometry.barHeight); state.content.setPosition(-geometry.viewport / 2, 0);
    state.items.forEach(function (item, i) {
      item.active = true; item.setPosition(geometry.cell * (i + .5), 0); item.setContentSize(geometry.cell - 4, geometry.barHeight - 10);
      item.children.forEach(function (node) {
        if (node.name === "labName") {
          node.anchorX = .5; node.anchorY = 1; node.setPosition(0, -26);
          var limit = (geometry.cell - 8) / Math.abs(node.scaleX), text = node.getComponent(cc.Label);
          var captionSize = item === home.btnAchieve ? 11 : 12.5;
          text._lobbyCaption = true; text.fontSize = Math.max(36, Math.round(captionSize * (bounds.right - bounds.left) / points / Math.abs(node.scaleX)));
          if (!/\s/.test(text.string) && text._forceUpdateRenderData) {
            text.overflow = cc.Label.Overflow.NONE; text.enableWrapText = false; text._forceUpdateRenderData();
            if (node.width > limit) text.fontSize = Math.floor(text.fontSize * limit / node.width);
          }
          text.lineHeight = text.fontSize * 1.08; text.overflow = cc.Label.Overflow.CLAMP; text.enableWrapText = true;
          text.horizontalAlign = cc.Label.HorizontalAlign.CENTER; text.verticalAlign = cc.Label.VerticalAlign.TOP;
          node.setContentSize(limit, 112);
        }
        else if (node.name === "ndRed") node.setPosition(42, 66);
        else if (node.getComponent(cc.Sprite)) { node.setPosition(0, 30); node.setScale(94 / Math.max(node.width, node.height)); }
      });
    });
    state.scroll.scrollToOffset(cc.v2(Math.min(Math.max(0, state.content.width - geometry.viewport), Math.max(0, oldOffset * geometry.cell)), 0), 0);
    state.left.setPosition(-geometry.barWidth / 2 + 20, 0); state.right.setPosition(geometry.barWidth / 2 - 20, 0);
    state.left.active = state.right.active = geometry.count < 5;
    home.ndLevelInfo.setScale(geometry.stageScale); home.ndLevelInfo.setPosition(geometry.center, geometry.stageY);
    home.ndBoxShow.setScale(geometry.stageScale); home.ndBoxShow.setPosition(geometry.center, geometry.stageY - 166 * geometry.stageScale);
    home.btnBattle.setScale(geometry.buttonScale); home.btnBattle.setPosition(geometry.buttonRight, geometry.buttonY);
    state.defense.setScale(geometry.buttonScale); state.defense.setPosition(geometry.buttonLeft, geometry.buttonY);
    state.defenseCaption.setPosition(geometry.buttonLeft, geometry.buttonY - 73 * geometry.buttonScale - 21);
    home.btnSetting.setPosition(bounds.right - 60, bounds.top - 60); home.btnSetting.setScale(.8);
  }
  layoutHeader(home, bounds);
  refresh(home);
}
function layoutHeader(home, bounds) {
  var state = home._lobby, manager = require("UIMgr").UIMgr.getInstance();
  var top = manager.getUIById(Config.KinghtFallUIID.UITop); if (!top) return;
  var nodes = [top.ndPower, top.ndGold, top.ndDiamond]; if (!nodes.every(Boolean)) return;
  if (!state.header) state.header = nodes.map(function (node) {
    var widget = node.getComponent(cc.Widget);
    return { node: node, x: node.x, y: node.y, widget: widget, enabled: widget && widget.enabled };
  });
  var available = bounds.right - bounds.left - 128, cell = available / 3;
  state.header.forEach(function (saved, index) {
    if (saved.widget) saved.widget.enabled = false;
    var point = home.node.convertToWorldSpaceAR(cc.v2(bounds.left + cell * (index + .5) + 10, bounds.top - 62));
    saved.node.setPosition(saved.node.parent.convertToNodeSpaceAR(point));
  });
}
function releaseHeader(home) {
  var state = home._lobby; if (!state || !state.header) return;
  state.header.forEach(function (saved) { if (!cc.isValid(saved.node, true)) return; saved.node.setPosition(saved.x, saved.y); if (saved.widget) { saved.widget.enabled = saved.enabled; if (saved.enabled) saved.widget.updateAlignment(); } });
  state.header = null;
}
function refresh(home) {
  var state = home._lobby; if (!state || !state.geometry) return;
  var ready = state.items.map(function (item) { var red = item.getChildByName("ndRed"); return !!(red && red.active); });
  var offset = scrollOffset(state.scroll), flags = Core.hiddenRewards(ready, offset, state.geometry.viewport, state.geometry.cell);
  state.left.rewardBadge.active = flags.left; state.right.rewardBadge.active = flags.right;
  arrowState(state.left, offset > 1); arrowState(state.right, offset < state.scroll.getMaxScrollOffset().x - 1);
}
function modeState(home, unlocked, best, unlockStage) {
  var state = home._lobby; if (!state) return;
  paintMode(state.defense, unlocked);
  state.defenseCaption.active = !unlocked;
  var button = state.defense.getComponent(cc.Button); if (button) button.interactable = unlocked;
  var key = unlocked ? "lobby.wallBestWave" : "lobby.wallUnlock", value = unlocked ? best : unlockStage;
  if (state.status !== key + value) { state.status = key + value; bind(state.defenseCaption, key, [value]); }
  var amount = state.defense.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label); amount.string = String(home.costEnergy);
}
exports.install = install;
exports.layout = layout;
exports.refresh = refresh;
exports.modeState = modeState;
exports.releaseHeader = releaseHeader;
