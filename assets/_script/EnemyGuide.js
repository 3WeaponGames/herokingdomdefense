"use strict";
// Read-only battle inspection. This overlay owns one pause token and never
// starts combat, saves progress, changes unit configuration or plays audio.
function finite(value) { return typeof value === "number" && isFinite(value); }
function manager() { return require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance(); }
function language() { return require("LanguageMgr").LanguageMgr.getInstance(); }
function planning(ui) { return !!ui.ctrGame && ui.ctrGame.gameStatus === require("KinghtFallModle").KinghtFallGameStage.Prepare; }
function syncMarkers(ui) {
  var enabled = planning(ui);
  if (ui._enemyGuideMarkerPhase === enabled) return;
  ui._enemyGuideMarkerPhase = enabled;
  Object.keys(ui.enemyIconInfo || {}).forEach(function (key) {
    var record = ui.enemyIconInfo[key], blocker = record.ndItem && record.ndItem._enemyGuideInputBlocker;
    if (blocker) blocker.enabled = enabled && !record._guideLive;
  });
}
function alive(actor) { return actor && actor.node && cc.isValid(actor.node, true) && actor.node.activeInHierarchy !== false && !actor._isPooled && (!actor.isDead || !actor.isDead()); }
function read(actor, name, fallback) { var value = actor && actor[name] && actor[name](); return finite(value) ? value : fallback; }
function display(value) { return finite(value) ? String(Math.round(value * 100) / 100) : language().t("enemyGuide.unknown"); }
function describe(ui, id, live) {
  var data = manager(), cfg = data.getSoldierCfgById(id), game = ui.ctrGame, battle = game.gameData;
  if (!cfg) return null;
  var actor = live && battle.getEnemyList && battle.getEnemyList().filter(function (enemy) { return enemy.cfg && Number(enemy.cfg.ID) === Number(id) && alive(enemy); })[0];
  var settings = data.data && data.data.GameTools || {}, number = Number(id);
  var form = actor && actor.spIdx !== undefined ? actor.spIdx + 1 : number >= 90010 && number <= 90012 ? number - 90009 : "default";
  var roleId = settings.unitTypeAssignments && settings.unitTypeAssignments["enemy:" + id + ":" + form];
  var role = settings.unitTypes && settings.unitTypes[roleId], wave = battle.levelCfg && battle.levelCfg.WaveCfg[battle.round - 1] || {};
  var hpFactor = battle.getHpAdd ? battle.getHpAdd(id) : wave.HealthCoefficient;
  var damageFactor = battle.getAttAdd ? battle.getAttAdd(id) : wave.AttackCoefficient;
  if (!finite(hpFactor)) hpFactor = 1;
  if (!finite(damageFactor)) damageFactor = 1;
  var hp = actor && finite(actor.hpMax) ? actor.hpMax : cfg.Health * hpFactor;
  var damage = read(actor, "getAttack", finite(cfg.AttackDamage) ? Math.round(cfg.AttackDamage * damageFactor) : cfg.AttackType === 3 ? 0 : null);
  var behavior = Number(cfg.CampaignBaseUnit || cfg.BehaviorTemplate || cfg.ID), fallback = "enemyGuide.fallbackMelee";
  if (behavior === 90006) fallback = "enemyGuide.fallbackBuffer";
  else if (behavior === 90009) fallback = "enemyGuide.fallbackHealer";
  else if (cfg.AttackType === 2) fallback = "enemyGuide.fallbackRanged";
  var range = finite(cfg.AttackRange) ? cfg.AttackRange : behavior === 90006 && cfg.Data ? cfg.Data[2] : behavior === 90009 && cfg.Data ? cfg.Data[1] : null;
  var roleName = role && role.name || "enemyGuide.unknown";
  var approvedRoles = { fighter: "Fighter", skirmisher: "Skirmisher", vanguard: "Vanguard", mystic: "Mystic", bruiser: "Bruiser", guardian: "Guardian" };
  if (role && approvedRoles[roleId] === role.name) roleName = "enemyGuide.role." + roleId;
  return { id: id, name: cfg.Name, role: roleName, icon: cfg.loadIcon,
    wave: battle.round, live: !!live, description: cfg.Guide && cfg.Guide.description || fallback, lore: cfg.Guide && cfg.Guide.lore || "",
    stats: [
      ["health", actor && finite(actor.hp) ? display(actor.hp) + " / " + display(hp) : display(hp)],
      ["damage", display(damage)],
      ["attackRate", display(read(actor, "getAttSpeed", cfg.AttackInterval))],
      ["movement", display(read(actor, "getSpeed", cfg.Speed))],
      ["range", display(range)],
      ["sight", display(finite(range) ? range + (finite(cfg.SearchRange) ? cfg.SearchRange : 0) : null)]
    ] };
}
function node(parent, name, width, height) { var result = new cc.Node(name); result.parent = parent; result.setContentSize(width || 0, height || 0); return result; }
function text(parent, name, size, color, displayFont) {
  var item = node(parent, name), label = item.addComponent(cc.Label);
  item.color = cc.color(color || "#594b39"); label.fontSize = size; label.lineHeight = Math.ceil(size * 1.24);
  label.fontFamily = "Arial"; label.useSystemFont = true; label.enableWrapText = true;
  label.overflow = cc.Label.Overflow.RESIZE_HEIGHT; label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
  label.verticalAlign = cc.Label.VerticalAlign.CENTER; label._localizedFontRole = displayFont ? "display" : "body";
  if (displayFont) { var outline = item.addComponent(cc.LabelOutline); outline.color = cc.Color.BLACK; outline.width = 2; }
  return label;
}
function bindText(label, key, params) { language().bindLabel(label, key, params); }
function graphic(item, fill, stroke, radius) {
  var g = item.getComponent(cc.Graphics) || item.addComponent(cc.Graphics); g.clear();
  g.fillColor = cc.color(fill); g.strokeColor = cc.color(stroke || fill); g.lineWidth = 3;
  g.roundRect(-item.width / 2, -item.height / 2, item.width, item.height, radius || 12); g.fill(); if (stroke) g.stroke();
}
function safeBounds(root) {
  var origin = cc.view.getVisibleOrigin(), size = cc.view.getVisibleSize();
  var safe = cc.sys.getSafeAreaRect ? cc.sys.getSafeAreaRect() : { x: origin.x, y: origin.y, width: size.width, height: size.height };
  var a = root.convertToNodeSpaceAR(cc.v2(Math.max(origin.x, safe.x), Math.max(origin.y, safe.y)));
  var b = root.convertToNodeSpaceAR(cc.v2(Math.min(origin.x + size.width, safe.x + safe.width), Math.min(origin.y + size.height, safe.y + safe.height)));
  return { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), bottom: Math.min(a.y, b.y), top: Math.max(a.y, b.y) };
}
function current(ui, state) {
  return ui._enemyGuide === state && planning(ui) && !ui.isclose && cc.isValid(ui, true) && cc.isValid(state.root, true) &&
    ui.ctrGame === state.game && state.game.gameData === state.data && state.game._combatEpoch === state.epoch && state.data.round === state.round;
}
function close(ui, keepPaused) {
  var state = ui._enemyGuide; if (!state) return;
  ui._enemyGuide = null;
  if (cc.systemEvent) cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, state.keydown, state);
  language().offChange(state.refresh, state);
  require("TestMode").TestMode.getInstance().clearGameplayInput(true);
  if (cc.isValid(state.root, true)) { state.root.active = false; state.root.destroy(); }
  state.frames.forEach(function (frame) { if (cc.isValid(frame, true)) frame.destroy(); });
  // A stale overlay must never resume a replacement battle or an exiting UI.
  if (!keepPaused && !ui.isclose && ui.ctrGame === state.game && state.game.gameData === state.data && state.game._combatEpoch === state.epoch && cc.isValid(ui, true)) ui.onPauseGame(false, state);
  else if (ui._pauseOwners) ui._pauseOwners.delete(state);
}
function button(parent, name, caption, handler) {
  var item = node(parent, name, 56, 50); graphic(item, "#16c2ec", "#292936", 10);
  var label = text(item, "Caption", 32, "#ffffff", true); label.node.setContentSize(48, 44); label.string = caption;
  item.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); handler(); });
  return item;
}
function measure(label, width) {
  label.node.width = width; if (label._forceUpdateRenderData) label._forceUpdateRenderData();
  return Math.max(label.lineHeight, label.node.height);
}
function layout(ui, state) {
  var origin = cc.view.getVisibleOrigin(), visible = cc.view.getVisibleSize(), host = state.root.parent;
  var a = host.convertToNodeSpaceAR(cc.v2(origin.x, origin.y)), b = host.convertToNodeSpaceAR(cc.v2(origin.x + visible.width, origin.y + visible.height));
  var screen = [a.x, a.y, b.x, b.y].join(":");
  if (state.screen !== screen) {
    state.screen = screen; state.root.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2); state.root.setContentSize(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    var shade = state.root.getComponent(cc.Graphics); shade.clear(); shade.fillColor = cc.color(0, 0, 0, 170); shade.rect(-state.root.width / 2, -state.root.height / 2, state.root.width, state.root.height); shade.fill();
  }
  var bounds = safeBounds(state.parent), labels = [state.title, state.name, state.role, state.context, state.description, state.lore];
  var signature = [bounds.left, bounds.right, bounds.bottom, bounds.top, labels.map(function (label) { return [label.font && label.font.uuid, label.node.height, label.string].join(":"); }).join("|")].join("|");
  if (state.signature === signature) return;
  var width = Math.min(680, bounds.right - bounds.left - 40), height = Math.min(990, bounds.top - bounds.bottom - 40);
  if (!(width > 100 && height > 120)) return;
  state.panel.setContentSize(width, height); state.panel.setPosition((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2);
  graphic(state.panel, "#e9e0cd", "#181a22", 24);
  state.skin.setContentSize(width, height);
  state.header.setContentSize(width - 8, 74); state.header.setPosition(0, height / 2 - 40); graphic(state.header, "#484d5e", null, 18);
  state.title.node.setContentSize(Math.max(60, width - 150), 64); state.title.node.setPosition(0, height / 2 - 40);
  state.close.setPosition(width / 2 - 43, height / 2 - 40);
  var multiple = state.ids.length > 1;
  var contentWidth = width - 64, viewportHeight = height - 126 - (multiple ? 64 : 0);
  state.view.setContentSize(contentWidth, viewportHeight); state.view.setPosition(0, height / 2 - 94);
  state.content.width = contentWidth;
  var portraitSize = Math.min(142, contentWidth * .3), left = -contentWidth / 2;
  state.portraitCard.setContentSize(portraitSize + 12, portraitSize + 12); state.portraitCard.setPosition(left + portraitSize / 2 + 6, -portraitSize / 2 - 6); graphic(state.portraitCard, "#8b90a7", "#30323e", 18);
  var headWidth = contentWidth - portraitSize - 30, textX = left + portraitSize + 24 + headWidth / 2;
  var nameHeight = measure(state.name, headWidth), roleHeight = measure(state.role, headWidth);
  state.name.node.setPosition(textX, -nameHeight / 2 - 4); state.role.node.setPosition(textX, -nameHeight - roleHeight / 2 - 10);
  var contextHeight = measure(state.context, headWidth);
  state.context.node.setPosition(textX, -nameHeight - roleHeight - contextHeight / 2 - 20);
  var y = -Math.max(portraitSize + 26, nameHeight + roleHeight + contextHeight + 36), cellWidth = (contentWidth - 14) / 2;
  state.stats.forEach(function (cell, index) {
    var labelHeight = measure(cell.label, cellWidth - 16), valueHeight = measure(cell.value, cellWidth - 16);
    cell.height = labelHeight + valueHeight + 18;
  });
  for (var row = 0; row < 3; row++) {
    var rowHeight = Math.max(state.stats[row * 2].height, state.stats[row * 2 + 1].height);
    for (var col = 0; col < 2; col++) {
      var cell = state.stats[row * 2 + col]; cell.node.setContentSize(cellWidth, rowHeight); cell.node.setPosition(left + cellWidth / 2 + col * (cellWidth + 14), y - rowHeight / 2);
      graphic(cell.node, "#f7f0df", "#b7ad97", 10); cell.label.node.setPosition(0, rowHeight / 2 - cell.label.node.height / 2 - 7); cell.value.node.setPosition(0, -rowHeight / 2 + cell.value.node.height / 2 + 7);
    }
    y -= rowHeight + 12;
  }
  function paragraph(heading, body) {
    var h = measure(heading, contentWidth - 12); heading.node.setPosition(0, y - h / 2 - 10); y -= h + 20;
    h = measure(body, contentWidth - 20); body.node.setPosition(0, y - h / 2); y -= h + 22;
  }
  paragraph(state.descriptionTitle, state.description);
  state.loreTitle.node.active = state.lore.node.active = !!state.model.lore;
  if (state.model.lore) paragraph(state.loreTitle, state.lore);
  state.previous.active = state.next.active = state.page.node.active = multiple;
  if (multiple) {
    state.previous.setPosition(-80, -height / 2 + 42); state.next.setPosition(80, -height / 2 + 42);
    state.page.node.setContentSize(88, 44); state.page.node.setPosition(0, -height / 2 + 42);
  }
  state.content.height = Math.max(viewportHeight, -y + 8);
  if (state.resetScroll) { state.scroll.scrollToTop(0); state.resetScroll = false; }
  state.signature = [bounds.left, bounds.right, bounds.bottom, bounds.top, labels.map(function (label) { return [label.font && label.font.uuid, label.node.height, label.string].join(":"); }).join("|")].join("|");
}
function refresh(ui, state) {
  if (!current(ui, state)) return;
  var model = state.model = describe(ui, state.ids[state.index], state.live); if (!model) return close(ui);
  state.version++; state.signature = null; state.resetScroll = true;
  bindText(state.title, "enemyGuide.title"); bindText(state.name, model.name); bindText(state.role, model.role);
  bindText(state.context, model.live ? "enemyGuide.live" : "enemyGuide.incoming", [model.wave]);
  bindText(state.descriptionTitle, "enemyGuide.description"); bindText(state.description, model.description);
  bindText(state.loreTitle, "enemyGuide.lore"); bindText(state.lore, model.lore);
  bindText(state.page, "enemyGuide.page", [state.index + 1, state.ids.length]);
  state.stats.forEach(function (cell, index) { bindText(cell.label, "enemyGuide." + model.stats[index][0]); bindText(cell.value, model.stats[index][1]); });
  state.portrait.spriteFrame = null;
  var version = state.version, resource = model.icon && model.icon.indexOf("@icon/") === 0;
  if (model.icon) ui.loadSpriteFrame(resource ? "resources" : "KinghtFallEnemy", resource ? model.icon.slice(6) : "icon/" + model.icon, function (frame) {
    if (!frame || !current(ui, state) || state.version !== version) return;
    state.portrait.spriteFrame = frame;
    var original = frame.getOriginalSize && frame.getOriginalSize(), max = Math.min(142, state.content.width * .3), scale = original && Math.min(max / original.width, max / original.height);
    state.portrait.node.setContentSize(scale ? original.width * scale : max, scale ? original.height * scale : max);
  });
  layout(ui, state);
}
function open(ui, record) {
  if (!record || !record.id || record._guideLive || !planning(ui) || ui.isclose || !ui.canBreak || ui._battleDialog || !ui.ctrUI) return;
  close(ui);
  var game = ui.ctrGame, parent = ui.ctrUI.node, state = { parent: parent, game: game, data: game.gameData, epoch: game._combatEpoch, round: game.gameData.round, live: !!record._guideLive, frames: [], ids: [], index: 0, version: 0 };
  (record._guideIds || [record.id]).forEach(function (id) { if (manager().getSoldierCfgById(id) && state.ids.indexOf(id) < 0) state.ids.push(id); });
  if (!state.ids.length) return;
  state.index = Math.max(0, state.ids.indexOf(record.id)); ui._enemyGuide = state;
  state.root = node(parent, "EnemyGuideOverlay"); state.root.zIndex = 10000; state.root.addComponent(cc.BlockInputEvents);
  var origin = cc.view.getVisibleOrigin(), visible = cc.view.getVisibleSize();
  var a = parent.convertToNodeSpaceAR(origin), b = parent.convertToNodeSpaceAR(cc.v2(origin.x + visible.width, origin.y + visible.height));
  state.root.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2); state.root.setContentSize(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  graphic(state.root, "#000000"); state.root.getComponent(cc.Graphics).fillColor = cc.color(0, 0, 0, 170);
  var dark = state.root.getComponent(cc.Graphics); dark.clear(); dark.rect(-state.root.width / 2, -state.root.height / 2, state.root.width, state.root.height); dark.fill();
  state.panel = node(state.root, "GuidePanel"); state.panel.addComponent(cc.BlockInputEvents);
  // The modal root is centered in the visible rectangle. Panel coordinates use
  // that same local space, including non-zero viewport origins and safe areas.
  state.parent = state.root;
  state.skin = node(state.panel, "SharedPanelArtwork"); var skin = state.skin.addComponent(cc.Sprite); skin.sizeMode = cc.Sprite.SizeMode.CUSTOM; skin.type = cc.Sprite.Type.SLICED;
  state.header = node(state.panel, "Header"); state.title = text(state.panel, "Title", 38, "#ffffff", true);
  state.title.enableWrapText = false; state.title.overflow = cc.Label.Overflow.SHRINK;
  state.close = button(state.panel, "Close", "×", function () { close(ui); });
  state.view = node(state.panel, "GuideScrollViewport"); state.view.anchorY = 1; state.view.addComponent(cc.Mask).type = cc.Mask.Type.RECT;
  state.content = node(state.view, "GuideContent"); state.content.anchorY = 1;
  state.scroll = state.view.addComponent(cc.ScrollView); state.scroll.content = state.content; state.scroll.horizontal = false; state.scroll.vertical = true; state.scroll.inertia = true; state.scroll.elastic = true; state.scroll.brake = .6; state.scroll.bounceDuration = .18; state.scroll.cancelInnerEvents = true;
  state.portraitCard = node(state.content, "PortraitCard"); var portrait = node(state.portraitCard, "Portrait", 142, 142);
  state.portrait = portrait.addComponent(cc.Sprite); state.portrait.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  state.name = text(state.content, "Name", 36, "#ffffff", true); state.role = text(state.content, "Role", 26); state.context = text(state.content, "WaveContext", 23);
  state.stats = Array.from({ length: 6 }, function (_, i) { var cell = node(state.content, "Stat" + i); return { node: cell, label: text(cell, "Label", 23), value: text(cell, "Value", 29) }; });
  state.descriptionTitle = text(state.content, "DescriptionHeading", 28); state.description = text(state.content, "Description", 27);
  state.loreTitle = text(state.content, "LoreHeading", 28); state.lore = text(state.content, "Lore", 26);
  state.previous = button(state.panel, "Previous", "‹", function () { state.index = (state.index + state.ids.length - 1) % state.ids.length; refresh(ui, state); });
  state.next = button(state.panel, "Next", "›", function () { state.index = (state.index + 1) % state.ids.length; refresh(ui, state); }); state.page = text(state.panel, "Page", 24);
  state.root.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); close(ui); });
  state.keydown = function (event) { if (event.keyCode === cc.macro.KEY.escape) { if (event.stopPropagation) event.stopPropagation(); close(ui); } };
  if (cc.systemEvent) cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, state.keydown, state);
  state.refresh = function () { refresh(ui, state); }; language().onChange(state.refresh, state);
  ui.onPauseGame(true, state);
  if (ui.ctrUI.onBlockTouch) ui.ctrUI.onBlockTouch(); if (game.moveFun) game.moveFun(null);
  refresh(ui, state);
  ui.loadSpriteFrame("KinghtFallPrefabs", "_res/textures/KinghtFallUISuspend/wg_zt_d", function (frame) {
    if (!frame || !current(ui, state)) return;
    // Preserve corners and the original header height without changing the
    // shared SpriteFrame used by pause and other panels.
    var copy = frame.clone(); copy.insetTop = 80; copy.insetBottom = 60; copy.insetLeft = copy.insetRight = 48;
    state.frames.push(copy); skin.spriteFrame = copy;
  });
}
function bind(ui, record) {
  var item = record && record.ndItem; if (!item || !item.on) return;
  if (item._enemyGuideInputBlocker) item._enemyGuideInputBlocker.enabled = planning(ui) && !record._guideLive;
  if (record._guideLive || item._enemyGuideBound) return;
  item._enemyGuideBound = true;
  item._enemyGuideInputBlocker = item.addComponent(cc.BlockInputEvents);
  item._enemyGuideInputBlocker.enabled = planning(ui);
  ui._enemyGuideMarkersBound = true;
  item.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (!planning(ui) || record._guideLive || !record.tag || item.activeInHierarchy === false) return;
    if (event) event.stopPropagation();
    if (event && event.getLocation && event.getStartLocation) {
      var a = event.getLocation(), b = event.getStartLocation(); if (Math.hypot(a.x - b.x, a.y - b.y) > 16) return;
    }
    open(ui, record);
  });
}
function update(ui) {
  syncMarkers(ui);
  var state = ui._enemyGuide; if (!state) return;
  if (!current(ui, state) || ui.node && ui.node.activeInHierarchy === false) close(ui);
  else layout(ui, state);
}
exports.bind = bind; exports.open = open; exports.close = close; exports.update = update;
exports.describe = describe; exports.safeBounds = safeBounds;
