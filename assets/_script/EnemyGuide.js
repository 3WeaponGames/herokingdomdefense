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
var approvedRoles = { fighter: "Fighter", skirmisher: "Skirmisher", vanguard: "Vanguard", mystic: "Mystic", bruiser: "Bruiser", guardian: "Guardian" };
function roleName(id, role) { return role ? approvedRoles[id] === role.name ? "enemyGuide.role." + id : role.name : "enemyGuide.unknown"; }
function typeGuide(ui, id) {
  var data = manager().data || {}, settings = data.GameTools || {}, definitions = settings.unitTypes || {}, members = [];
  var types = Object.keys(definitions).map(function (key) {
    var type = definitions[key];
    return { id: key, name: roleName(key, type), icon: type.icon, tint: type.tint || "#ffffff",
      description: type.description || (approvedRoles[key] ? "enemyGuide.typeDescription." + key : "enemyGuide.typeDescription.custom"), strong: [], weak: [] };
  }), byId = {};
  types.forEach(function (type) { byId[type.id] = type; });
  Object.keys(settings.unitTypeAssignments || {}).forEach(function (key) {
    var parts = key.split(":"), side = parts[0], cfg = (side === "enemy" ? data.SoldierCfg : side === "ally" ? data.AllyCfg : null);
    cfg = cfg && cfg[parts[1]];
    var role = settings.unitTypeAssignments[key];
    if (cfg && byId[role]) members.push({ side: side, cfg: cfg, role: role });
  });
  function add(list, value) { if (byId[value] && list.indexOf(value) < 0) list.push(value); }
  function targets(member) {
    if (member.cfg.CounterType !== undefined) return byId[member.cfg.CounterType] ? [member.cfg.CounterType] : [];
    // An absent type override retains the game's exact-ID legacy matchup.
    var result = [];
    members.forEach(function (target) { if (target.side !== member.side && member.cfg.Suppressed && target.cfg.ID == member.cfg.Suppressed) add(result, target.role); });
    return result;
  }
  members.forEach(function (member) {
    targets(member).forEach(function (target) { add(byId[member.role].strong, target); add(byId[target].weak, member.role); });
  });
  var model = describe(ui, id, false), unit = { name: model && model.name || "enemyGuide.unknown", strong: [], weak: [] };
  if (model) {
    var cfg = manager().getSoldierCfgById(id);
    targets({ side: "enemy", cfg: cfg, role: model.roleId }).forEach(function (target) { add(unit.strong, target); });
    members.forEach(function (member) {
      if (member.side !== "ally") return;
      var matches = member.cfg.CounterType === undefined ? member.cfg.Suppressed && member.cfg.Suppressed == id : member.cfg.CounterType && member.cfg.CounterType === model.roleId;
      if (matches) add(unit.weak, member.role);
    });
  }
  return { types: types, unit: unit };
}
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
  return { id: id, name: cfg.Name, role: roleName(roleId, role), roleId: roleId, roleIcon: role && role.icon, roleTint: role && role.tint || "#ffffff", icon: cfg.loadIcon,
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
function graphic(item, fill, stroke, radius, lineWidth) {
  var g = item.getComponent(cc.Graphics) || item.addComponent(cc.Graphics); g.clear();
  g.fillColor = cc.color(fill); g.strokeColor = cc.color(stroke || fill); g.lineWidth = lineWidth || 3;
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
  closeTypes(state);
  ui._enemyGuide = null;
  if (cc.systemEvent) cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, state.keydown, state);
  language().offChange(state.refresh, state);
  require("TestMode").TestMode.getInstance().clearGameplayInput(true);
  if (cc.isValid(state.root, true)) { state.root.active = false; state.root.destroy(); }
  // A stale overlay must never resume a replacement battle or an exiting UI.
  if (!keepPaused && !ui.isclose && ui.ctrGame === state.game && state.game.gameData === state.data && state.game._combatEpoch === state.epoch && cc.isValid(ui, true)) ui.onPauseGame(false, state);
  else if (ui._pauseOwners) ui._pauseOwners.delete(state);
}
function button(parent, name, caption, handler, plain) {
  var item = node(parent, name, 56, 50); if (!plain) graphic(item, "#c1e1c2", "#427b64", 10, 2);
  var label = text(item, "Caption", 32, "#ffffff", true); label.node.setContentSize(48, 44); label.string = caption;
  item.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); handler(); });
  return item;
}
function closeButton(parent, handler) {
  var item = node(parent, "Close", 56, 50), fallback = node(item, "Caption", 48, 44), g = fallback.addComponent(cc.Graphics);
  if (cc.Graphics.LineCap) g.lineCap = cc.Graphics.LineCap.ROUND;
  [ [16, "#13151c"], [10, "#ffffff"] ].forEach(function (style) {
    g.lineWidth = style[0]; g.strokeColor = cc.color(style[1]);
    g.moveTo(-14, -14); g.lineTo(14, 14); g.moveTo(-14, 14); g.lineTo(14, -14); g.stroke();
  });
  item.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); handler(); });
  return item;
}
function measure(label, width) {
  label.node.width = width; if (label._forceUpdateRenderData) label._forceUpdateRenderData();
  return Math.max(label.lineHeight, label.node.height);
}
function style(label, size, scale, bold, align) {
  label.fontSize = Math.max(12, Math.round(size * scale)); label.lineHeight = Math.ceil(label.fontSize * 1.26);
  label.enableBold = !!bold; label.horizontalAlign = align === undefined ? cc.Label.HorizontalAlign.LEFT : align;
}
function rule(item, x1, y1, x2, y2, color) {
  var g = item.getComponent(cc.Graphics) || item.addComponent(cc.Graphics); g.clear();
  g.strokeColor = cc.color(color || "#c5b699"); g.lineWidth = 1; g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}
function fit(sprite, width, height) {
  var frame = sprite.spriteFrame, original = frame && frame.getOriginalSize && frame.getOriginalSize();
  var scale = original && original.width > 0 && original.height > 0 && Math.min(width / original.width, height / original.height);
  sprite.node.setContentSize(scale ? original.width * scale : width, scale ? original.height * scale : height);
}
function shell(owner, parent, name, caption, handler) {
  owner.panel = node(parent, name); owner.panel.addComponent(cc.BlockInputEvents);
  owner.header = node(owner.panel, "Header"); owner.title = text(owner.panel, "Title", 38, "#ffffff", true);
  owner.title.enableWrapText = false; owner.title.overflow = cc.Label.Overflow.SHRINK; bindText(owner.title, caption);
  owner.close = closeButton(owner.panel, handler);
  owner.closeIcon = node(owner.close, "CloseIcon", 46, 48).addComponent(cc.Sprite); owner.closeIcon.sizeMode = cc.Sprite.SizeMode.CUSTOM;
}
function layoutShell(owner, width, height, x, y) {
  // Paint one opaque cream surface. The old shared texture includes internal
  // frames and bands which cut across this layout when stretched.
  owner.panel.setContentSize(width, height); owner.panel.setPosition(x, y); graphic(owner.panel, "#fbf5e6", "#242a30", 24);
  owner.header.setContentSize(width - 8, 74); owner.header.setPosition(0, height / 2 - 40); graphic(owner.header, "#484d5e", null, 18);
  var header = owner.header.getComponent(cc.Graphics); header.rect(-owner.header.width / 2, -37, owner.header.width, 18); header.fill();
  owner.title.node.setContentSize(Math.max(60, width - 144), 64); owner.title.node.setPosition(0, height / 2 - 40);
  owner.close.setPosition(width / 2 - 42, height / 2 - 40);
}
function tap(event) {
  if (!event || !event.getLocation || !event.getStartLocation) return true;
  var a = event.getLocation(), b = event.getStartLocation(); return Math.hypot(a.x - b.x, a.y - b.y) <= 14;
}
function createScroll(owner, name) {
  owner.view = node(owner.panel, name + "Viewport"); owner.view.anchorY = 1; owner.view.addComponent(cc.Mask).type = cc.Mask.Type.RECT;
  owner.content = node(owner.view, name + "Content"); owner.content.anchorY = 1;
  owner.scroll = owner.view.addComponent(cc.ScrollView); owner.scroll.content = owner.content;
  owner.scroll.horizontal = false; owner.scroll.vertical = true; owner.scroll.inertia = true; owner.scroll.elastic = false;
  owner.scroll.brake = .6; owner.scroll.cancelInnerEvents = true;
  owner.bar = node(owner.panel, name + "ScrollBar", 24, 1);
  owner.view.on("scrolling", function () { scrollBar(owner); }); owner.view.on("scroll-ended", function () { scrollBar(owner); });
  function drag(event, start) {
    if (!owner.bar.active || !event || !event.getLocation) return;
    if (event.stopPropagation) event.stopPropagation();
    var point = owner.bar.convertToNodeSpaceAR(event.getLocation());
    if (start) {
      if (owner.scroll.stopAutoScroll) owner.scroll.stopAutoScroll();
      owner.barGrab = Math.abs(point.y - owner.thumbY) <= owner.thumbHeight / 2 ? point.y - owner.thumbY : 0;
    }
    var travel = owner.bar.height - owner.thumbHeight;
    var ratio = travel > 0 ? (travel / 2 - (point.y - (owner.barGrab || 0))) / travel : 0;
    var maximum = Math.max(0, owner.content.height - owner.view.height);
    owner.scroll.scrollToOffset(cc.v2(0, Math.max(0, Math.min(1, ratio)) * maximum), 0); scrollBar(owner);
  }
  owner.bar.on(cc.Node.EventType.TOUCH_START, function (event) { drag(event, true); });
  owner.bar.on(cc.Node.EventType.TOUCH_MOVE, function (event) { drag(event, false); });
  owner.bar.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); });
}
function scrollBar(owner) {
  var maximum = Math.max(0, owner.content.height - owner.view.height);
  owner.bar.active = maximum > 1; if (!owner.bar.active) return;
  var height = owner.bar.height, offset = owner.scroll.getScrollOffset ? owner.scroll.getScrollOffset().y : -owner.content.y;
  owner.thumbHeight = Math.min(height, Math.max(32, height * owner.view.height / owner.content.height));
  owner.thumbY = (height - owner.thumbHeight) * (.5 - Math.max(0, Math.min(1, offset / maximum)));
  var g = owner.bar.getComponent(cc.Graphics) || owner.bar.addComponent(cc.Graphics); g.clear();
  g.fillColor = cc.color("#e2dac5"); g.roundRect(-2, -height / 2, 4, height, 2); g.fill();
  g.fillColor = cc.color("#599c88"); g.roundRect(-3, owner.thumbY - owner.thumbHeight / 2, 6, owner.thumbHeight, 3); g.fill();
}
function layoutScroll(owner, width, height, panelHeight) {
  owner.view.setContentSize(width, height); owner.view.setPosition(-4, panelHeight / 2 - 98); owner.content.width = width;
  owner.bar.setContentSize(24, height); owner.bar.setPosition(owner.panel.width / 2 - 16, owner.view.y - height / 2);
}
function finishScroll(owner, height) {
  var offset = owner.scroll.getScrollOffset ? owner.scroll.getScrollOffset().y : 0;
  owner.content.height = Math.max(owner.view.height, height);
  if (owner.scroll.stopAutoScroll) owner.scroll.stopAutoScroll();
  if (owner.resetScroll) { owner.scroll.scrollToTop(0); owner.resetScroll = false; }
  else if (owner.scroll.scrollToOffset) owner.scroll.scrollToOffset(cc.v2(0, Math.max(0, Math.min(offset, owner.content.height - owner.view.height))), 0);
  scrollBar(owner);
}
function section(parent, name, heading, body) {
  var item = { node: node(parent, name) }; item.node.anchorY = 1;
  item.header = node(item.node, "HeadingPill"); item.heading = text(item.header, "Heading", 28, "#263c2e");
  item.rule = node(item.node, "Divider"); item.card = node(item.node, "BodyCard"); item.body = text(item.card, "Body", 26);
  bindText(item.heading, heading); bindText(item.body, body); return item;
}
function layoutSection(item, y, width, scale) {
  style(item.heading, 28, scale, true, cc.Label.HorizontalAlign.CENTER); style(item.body, 26, scale, false);
  var captionWidth = item.heading.string.split("").reduce(function (sum, character) { return sum + item.heading.fontSize * (/[\u2e80-\u9fff]/.test(character) ? 1 : .56); }, 0);
  var pill = Math.min(width * .78, Math.max(100 * scale, captionWidth + 32 * scale));
  var headingHeight = Math.max(38 * scale, measure(item.heading, pill - 18 * scale) + 10 * scale);
  var bodyHeight = measure(item.body, width - 32 * scale), cardHeight = Math.max(3 * item.body.lineHeight, bodyHeight) + 28 * scale;
  var height = headingHeight + 12 * scale + cardHeight;
  item.node.setContentSize(width, height); item.node.setPosition(0, y);
  item.header.setContentSize(pill, headingHeight); item.header.setPosition(-width / 2 + pill / 2, -headingHeight / 2);
  graphic(item.header, "#bee0c0", null, 16 * scale); item.heading.node.setPosition(0, 0);
  rule(item.rule, -width / 2 + pill + 14 * scale, -headingHeight / 2, width / 2, -headingHeight / 2, "#4e947e");
  item.card.setContentSize(width, cardHeight); item.card.setPosition(0, -headingHeight - 12 * scale - cardHeight / 2);
  graphic(item.card, "#fff9ec", "#bba17d", 14 * scale, 1);
  item.body.node.setPosition(0, cardHeight / 2 - 14 * scale - bodyHeight / 2);
  return y - height - 24 * scale;
}
function signature(bounds, labels) {
  return [bounds.left, bounds.right, bounds.bottom, bounds.top, labels.map(function (label) { return [label.font && label.font.uuid, label.string].join(":"); }).join("|")].join("|");
}
function layout(ui, state) {
  var origin = cc.view.getVisibleOrigin(), visible = cc.view.getVisibleSize(), host = state.root.parent;
  var a = host.convertToNodeSpaceAR(cc.v2(origin.x, origin.y)), b = host.convertToNodeSpaceAR(cc.v2(origin.x + visible.width, origin.y + visible.height));
  var screen = [a.x, a.y, b.x, b.y].join(":");
  if (state.screen !== screen) {
    state.screen = screen; state.root.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2); state.root.setContentSize(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    var shade = state.root.getComponent(cc.Graphics); shade.clear(); shade.fillColor = cc.color(0, 0, 0, 170); shade.rect(-state.root.width / 2, -state.root.height / 2, state.root.width, state.root.height); shade.fill();
  }
  var bounds = safeBounds(state.parent), labels = [state.title, state.name, state.role, state.descriptionTitle, state.description, state.loreTitle, state.lore];
  state.stats.forEach(function (cell) { labels.push(cell.label, cell.value); });
  var key = signature(bounds, labels);
  if (state.signature === key) { if (state.typeTooltip) layoutTypes(ui, state); return; }
  var width = Math.min(680, bounds.right - bounds.left - 40), height = Math.min(990, bounds.top - bounds.bottom - 40);
  if (!(width > 100 && height > 120)) return;
  layoutShell(state, width, height, (bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2);
  var multiple = state.ids.length > 1;
  var contentWidth = width - 64, viewportHeight = height - 126 - (multiple ? 58 : 0), scale = Math.min(1, Math.max(.55, contentWidth / 600));
  layoutScroll(state, contentWidth, viewportHeight, height);
  var left = -contentWidth / 2, columnWidth = contentWidth * .45, gutter = 24 * scale, statWidth = contentWidth - columnWidth - gutter;
  var portraitSize = Math.min(180 * scale, columnWidth - 20 * scale), profileX = left + columnWidth / 2;
  style(state.name, 30, scale, true, cc.Label.HorizontalAlign.CENTER); style(state.role, 25, scale, true, cc.Label.HorizontalAlign.CENTER);
  var nameHeight = measure(state.name, columnWidth - 12 * scale), roleWidth = columnWidth - 60 * scale, roleHeight = measure(state.role, roleWidth);
  var typeHeight = Math.max(44 * scale, roleHeight + 14 * scale), profileHeight = portraitSize + 28 * scale + nameHeight + 14 * scale + typeHeight + 18 * scale;
  var statY = 0;
  state.stats.forEach(function (cell, index) {
    style(cell.label, 24, scale, false); style(cell.value, 30, scale, true, cc.Label.HorizontalAlign.RIGHT);
    var valueWidth = statWidth * .28, labelWidth = statWidth - valueWidth - 18 * scale;
    cell.height = Math.max(measure(cell.label, labelWidth), measure(cell.value, valueWidth)) + 18 * scale;
    cell.node.setContentSize(statWidth, cell.height); cell.node.setPosition(left + columnWidth + gutter + statWidth / 2, statY - cell.height / 2);
    cell.label.node.setPosition(-statWidth / 2 + labelWidth / 2, 0); cell.value.node.setPosition(statWidth / 2 - valueWidth / 2, 0);
    rule(cell.node, -statWidth / 2, -cell.height / 2, statWidth / 2, -cell.height / 2);
    statY -= cell.height;
  });
  var profileBottom = -Math.max(profileHeight, -statY);
  state.profile.setContentSize(columnWidth, -profileBottom); state.profile.setPosition(profileX, profileBottom / 2);
  var profileInset = Math.max(0, (-profileBottom - profileHeight) / 2);
  state.portraitCard.setContentSize(portraitSize, portraitSize);
  state.portraitCard.setPosition(0, -profileBottom / 2 - portraitSize / 2 - 12 * scale - profileInset);
  fit(state.portrait, portraitSize, portraitSize);
  state.name.node.setPosition(0, -profileBottom / 2 - portraitSize - 24 * scale - nameHeight / 2 - profileInset);
  state.typeButton.setContentSize(columnWidth - 12 * scale, typeHeight);
  state.typeButton.setPosition(0, -profileBottom / 2 - portraitSize - 24 * scale - nameHeight - 12 * scale - typeHeight / 2 - profileInset);
  graphic(state.typeButton, "#c4dfc0", "#6a9d80", 10 * scale, 1.5);
  state.roleIconCard.setContentSize(36 * scale, 36 * scale); state.roleIconCard.setPosition(-state.typeButton.width / 2 + 22 * scale, 0);
  graphic(state.roleIconCard, "#40566b", "#7891a3", 6 * scale, 1.5); fit(state.roleIcon, 27 * scale, 27 * scale);
  state.role.node.setPosition(16 * scale, 0);
  rule(state.split, left + columnWidth + gutter / 2, 0, left + columnWidth + gutter / 2, profileBottom);
  var y = layoutSection(state.abilitySection, profileBottom - 26 * scale, contentWidth, scale);
  state.loreSection.node.active = !!state.model.lore;
  if (state.model.lore) y = layoutSection(state.loreSection, y, contentWidth, scale);
  state.previous.active = state.next.active = state.page.node.active = multiple;
  if (multiple) {
    state.previous.setPosition(-80, -height / 2 + 42); state.next.setPosition(80, -height / 2 + 42);
    state.page.node.setContentSize(88, 44); state.page.node.setPosition(0, -height / 2 + 42);
  }
  finishScroll(state, -y + 4);
  state.signature = signature(bounds, labels);
  if (state.typeTooltip) layoutTypes(ui, state);
}
function closeTypes(state) {
  var tip = state.typeTooltip; if (!tip) return;
  state.typeTooltip = null;
  if (cc.isValid(state.panel, true)) state.panel.active = true;
  if (cc.isValid(tip.root, true)) { tip.root.active = false; tip.root.destroy(); }
}
function matchLabel(label, ids, types, empty) {
  var names = ids.map(function (id) { var type = types.filter(function (item) { return item.id === id; })[0]; return type && language().t(type.name); }).filter(Boolean);
  bindText(label, names.length ? names.join(", ") : empty);
}
function typeRow(parent, model, types, selected) {
  var row = { node: node(parent, selected ? "CurrentEnemyMatchups" : "Type_" + model.id), model: model, selected: selected };
  row.name = text(row.node, "Name", 28, "#263c2e"); bindText(row.name, model.name);
  if (!selected) {
    row.iconCard = node(row.node, "TypeIconCard", 38, 38);
    row.icon = node(row.iconCard, "TypeIcon", 30, 30).addComponent(cc.Sprite); row.icon.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    row.icon.node.color = cc.color(model.tint);
    row.description = text(row.node, "Description", 24); bindText(row.description, model.description);
  }
  row.strongTitle = text(row.node, "StrengthHeading", 21); bindText(row.strongTitle, "enemyGuide.strongHeading");
  row.weakTitle = text(row.node, "WeaknessHeading", 21); bindText(row.weakTitle, "enemyGuide.weakHeading");
  row.strong = text(row.node, "Strengths", 24, "#315745"); row.weak = text(row.node, "Weaknesses", 24, "#594b39");
  matchLabel(row.strong, model.strong, types, "enemyGuide.noCounterBonus");
  matchLabel(row.weak, model.weak, types, "enemyGuide.noTypeCounter");
  return row;
}
function layoutTypeRow(row, y, width, scale) {
  var pad = 16 * scale, inner = width - 2 * pad, iconWidth = row.icon ? 46 * scale : 0;
  style(row.name, 28, scale, true); style(row.strong, 24, scale, true); style(row.weak, 24, scale, true);
  style(row.strongTitle, 21, scale, false); style(row.weakTitle, 21, scale, false);
  var titleHeight = Math.max(row.icon ? 36 * scale : 0, measure(row.name, inner - iconWidth));
  var descriptionHeight = 0;
  if (row.description) { style(row.description, 24, scale, false); descriptionHeight = measure(row.description, inner) + 12 * scale; }
  var columnWidth = (inner - 24 * scale) / 2;
  var headingHeight = Math.max(measure(row.strongTitle, columnWidth), measure(row.weakTitle, columnWidth));
  var valueHeight = Math.max(measure(row.strong, columnWidth), measure(row.weak, columnWidth));
  var height = 2 * pad + titleHeight + descriptionHeight + 12 * scale + headingHeight + valueHeight + 6 * scale;
  row.node.setContentSize(width, height); row.node.setPosition(0, y - height / 2);
  if (row.selected) graphic(row.node, "#edf0dd", null, 12 * scale);
  else rule(row.node, -inner / 2, -height / 2, inner / 2, -height / 2, "#d0c2a7");
  row.name.node.setPosition(iconWidth / 2, height / 2 - pad - titleHeight / 2);
  if (row.icon) {
    row.iconCard.setContentSize(38 * scale, 38 * scale); row.iconCard.setPosition(-width / 2 + pad + 19 * scale, row.name.node.y);
    graphic(row.iconCard, "#40566b", "#7891a3", 6 * scale, 1.5); fit(row.icon, 29 * scale, 29 * scale);
  }
  var bottom = height / 2 - pad - titleHeight - 12 * scale;
  if (row.description) { row.description.node.setPosition(0, bottom - row.description.node.height / 2); bottom -= descriptionHeight; }
  var left = -inner / 2 + columnWidth / 2, right = inner / 2 - columnWidth / 2;
  row.strongTitle.node.setPosition(left, bottom - headingHeight / 2); row.weakTitle.node.setPosition(right, bottom - headingHeight / 2);
  bottom -= headingHeight + 6 * scale;
  row.strong.node.setPosition(left, bottom - row.strong.node.height / 2); row.weak.node.setPosition(right, bottom - row.weak.node.height / 2);
  return y - height - 18 * scale;
}
function layoutTypes(ui, state) {
  var tip = state.typeTooltip; if (!tip) return;
  var bounds = safeBounds(state.root), labels = [tip.title, tip.note, tip.hint];
  tip.rows.forEach(function (row) { labels.push(row.name, row.strongTitle, row.weakTitle, row.strong, row.weak); if (row.description) labels.push(row.description); });
  var key = signature(bounds, labels); if (tip.signature === key) return;
  tip.root.setContentSize(state.root.width, state.root.height);
  var shade = tip.root.getComponent(cc.Graphics) || tip.root.addComponent(cc.Graphics); shade.clear(); shade.fillColor = cc.color(0, 0, 0, 150);
  shade.rect(-tip.root.width / 2, -tip.root.height / 2, tip.root.width, tip.root.height); shade.fill();
  var width = Math.min(640, bounds.right - bounds.left - 64), height = Math.min(940, bounds.top - bounds.bottom - 64);
  layoutShell(tip, width, height, (bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2);
  var contentWidth = width - 64, scale = Math.min(1, Math.max(.55, contentWidth / 600));
  layoutScroll(tip, contentWidth, height - 158, height);
  var y = layoutTypeRow(tip.rows[0], 0, contentWidth, scale);
  style(tip.note, 21, scale, false); var h = measure(tip.note, contentWidth - 32 * scale);
  tip.note.node.setPosition(0, y - h / 2); y -= h + 14 * scale;
  tip.rows.slice(1).forEach(function (row) { y = layoutTypeRow(row, y, contentWidth, scale); });
  style(tip.hint, 22, scale, false, cc.Label.HorizontalAlign.CENTER); tip.hint.node.setContentSize(width - 48, 40); tip.hint.node.setPosition(0, -height / 2 + 30);
  finishScroll(tip, -y); tip.signature = signature(bounds, labels);
}
function openTypes(ui, state) {
  if (!current(ui, state) || state.typeTooltip) return;
  var tip = state.typeTooltip = { resetScroll: true }, guide = typeGuide(ui, state.model.id);
  state.panel.active = false;
  tip.root = node(state.root, "UnitTypeTooltip"); tip.root.zIndex = 100; tip.root.addComponent(cc.BlockInputEvents);
  shell(tip, tip.root, "TypeGuidePanel", "enemyGuide.typesTitle", function () { closeTypes(state); });
  if (state.closeIcon.spriteFrame) { tip.closeIcon.spriteFrame = state.closeIcon.spriteFrame; tip.close.getChildByName("Caption").active = false; }
  createScroll(tip, "TypeGuide");
  tip.rows = [typeRow(tip.content, guide.unit, guide.types, true)];
  tip.note = text(tip.content, "MatchupNote", 22); bindText(tip.note, "enemyGuide.typeSummaryNote");
  guide.types.forEach(function (type) {
    var row = typeRow(tip.content, type, guide.types, false); tip.rows.push(row);
    if (type.icon) loadIcon(ui, type.icon, function (frame) {
      if (!frame || !current(ui, state) || state.typeTooltip !== tip) return;
      row.icon.spriteFrame = frame; tip.signature = null;
    });
  });
  tip.hint = text(tip.panel, "DismissHint", 22); bindText(tip.hint, "enemyGuide.dismissTypes");
  tip.dismiss = function (event) {
    if (state.typeTooltip !== tip || !tap(event) || event && event.target === tip.bar) return;
    if (event) event.stopPropagation(); closeTypes(state);
  };
  // Capture reaches taps on text, cards and the viewport as well as outside.
  // A drag keeps the tooltip open so its long list can be scrolled normally.
  tip.root.on(cc.Node.EventType.TOUCH_END, tip.dismiss, tip, true);
  tip.root.on(cc.Node.EventType.TOUCH_END, tip.dismiss);
  layoutTypes(ui, state);
}
function loadIcon(ui, icon, handler) {
  var resource = icon && icon.indexOf("@icon/") === 0;
  if (icon) ui.loadSpriteFrame(resource ? "resources" : "KinghtFallEnemy", resource ? icon.slice(6) : "icon/" + icon, handler);
}
function loadPortrait(ui, icon, done) {
  if (!icon) return;
  var cache = ui._enemyGuidePortraitCache;
  if (!cache || cache.generation !== ui._resourceGeneration) cache = ui._enemyGuidePortraitCache = { generation: ui._resourceGeneration, entries: {} };
  var entry = cache.entries[icon] || (cache.entries[icon] = { callbacks: [] });
  if (entry.frame && cc.isValid(entry.frame, true)) { if (done) done(entry.frame); return; }
  if (done) entry.callbacks.push(done);
  if (entry.loading) return; entry.loading = true;
  loadIcon(ui, icon, function (frame) {
    if (ui._enemyGuidePortraitCache !== cache || ui._resourceGeneration !== cache.generation || !cc.isValid(ui, true)) return;
    entry.loading = false; entry.frame = frame;
    entry.callbacks.splice(0).forEach(function (callback) { callback(frame); });
  });
}
function refresh(ui, state) {
  if (!current(ui, state)) return;
  var reopenTypes = !!state.typeTooltip; closeTypes(state);
  var model = state.model = describe(ui, state.ids[state.index], state.live); if (!model) return close(ui);
  state.version++; state.signature = null; state.resetScroll = true;
  bindText(state.title, "enemyGuide.title"); bindText(state.name, model.name); bindText(state.role, model.role);
  bindText(state.descriptionTitle, "enemyGuide.description"); bindText(state.description, model.description);
  bindText(state.loreTitle, "enemyGuide.loreHeading"); bindText(state.lore, model.lore);
  bindText(state.page, "enemyGuide.page", [state.index + 1, state.ids.length]);
  var compactCaptions = { attackRate: "attackRateShort", movement: "movementShort", range: "rangeShort", sight: "sightShort" };
  state.stats.forEach(function (cell, index) { var key = model.stats[index][0]; bindText(cell.label, "enemyGuide." + (compactCaptions[key] || key)); bindText(cell.value, model.stats[index][1]); });
  state.portrait.spriteFrame = null;
  state.roleIcon.spriteFrame = null; state.roleIcon.node.color = cc.color(model.roleTint);
  var version = state.version;
  loadPortrait(ui, model.icon, function (frame) {
    if (!frame || !current(ui, state) || state.version !== version) return;
    state.portrait.spriteFrame = frame; state.signature = null; layout(ui, state);
  });
  loadIcon(ui, model.roleIcon, function (frame) {
    if (!frame || !current(ui, state) || state.version !== version) return;
    state.roleIcon.spriteFrame = frame; state.signature = null; layout(ui, state);
  });
  layout(ui, state);
  if (reopenTypes) openTypes(ui, state);
}
function open(ui, record) {
  if (!record || !record.id || record._guideLive || !planning(ui) || ui.isclose || !ui.canBreak || ui._battleDialog || !ui.ctrUI) return;
  close(ui);
  var game = ui.ctrGame, parent = ui.ctrUI.node, state = { parent: parent, game: game, data: game.gameData, epoch: game._combatEpoch, round: game.gameData.round, live: !!record._guideLive, ids: [], index: 0, version: 0 };
  (record._guideIds || [record.id]).forEach(function (id) { if (manager().getSoldierCfgById(id) && state.ids.indexOf(id) < 0) state.ids.push(id); });
  if (!state.ids.length) return;
  state.index = Math.max(0, state.ids.indexOf(record.id)); ui._enemyGuide = state;
  state.root = node(parent, "EnemyGuideOverlay"); state.root.zIndex = 10000; state.root.addComponent(cc.BlockInputEvents);
  var origin = cc.view.getVisibleOrigin(), visible = cc.view.getVisibleSize();
  var a = parent.convertToNodeSpaceAR(origin), b = parent.convertToNodeSpaceAR(cc.v2(origin.x + visible.width, origin.y + visible.height));
  state.root.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2); state.root.setContentSize(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  graphic(state.root, "#000000"); state.root.getComponent(cc.Graphics).fillColor = cc.color(0, 0, 0, 170);
  var dark = state.root.getComponent(cc.Graphics); dark.clear(); dark.rect(-state.root.width / 2, -state.root.height / 2, state.root.width, state.root.height); dark.fill();
  // The modal root is centered in the visible rectangle. Panel coordinates use
  // that same local space, including non-zero viewport origins and safe areas.
  state.parent = state.root;
  shell(state, state.root, "GuidePanel", "enemyGuide.title", function () { close(ui); });
  createScroll(state, "Guide");
  state.profile = node(state.content, "EnemyIdentity"); state.portraitCard = node(state.profile, "PortraitAnchor"); var portrait = node(state.portraitCard, "Portrait", 180, 180);
  state.portrait = portrait.addComponent(cc.Sprite); state.portrait.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  state.name = text(state.profile, "Name", 30, "#263c2e");
  state.typeButton = node(state.profile, "UnitType"); state.roleIconCard = node(state.typeButton, "TypeIconCard");
  state.roleIcon = node(state.roleIconCard, "TypeIcon", 32, 32).addComponent(cc.Sprite); state.roleIcon.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  state.role = text(state.typeButton, "Role", 25, "#263c2e");
  state.typeButton.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); if (tap(event)) openTypes(ui, state); });
  state.split = node(state.content, "ColumnDivider");
  state.stats = Array.from({ length: 6 }, function (_, i) { var cell = node(state.content, "Stat" + i); return { node: cell, label: text(cell, "Label", 23), value: text(cell, "Value", 29) }; });
  state.abilitySection = section(state.content, "AttackAndAbilities", "enemyGuide.description", ""); state.descriptionTitle = state.abilitySection.heading; state.description = state.abilitySection.body;
  state.loreSection = section(state.content, "Lore", "enemyGuide.loreHeading", ""); state.loreTitle = state.loreSection.heading; state.lore = state.loreSection.body;
  state.previous = button(state.panel, "Previous", "‹", function () { state.index = (state.index + state.ids.length - 1) % state.ids.length; refresh(ui, state); });
  state.next = button(state.panel, "Next", "›", function () { state.index = (state.index + 1) % state.ids.length; refresh(ui, state); }); state.page = text(state.panel, "Page", 24);
  state.root.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); if (state.typeTooltip) closeTypes(state); else if (tap(event)) close(ui); });
  state.keydown = function (event) { if (event.keyCode === cc.macro.KEY.escape) { if (event.stopPropagation) event.stopPropagation(); if (state.typeTooltip) closeTypes(state); else close(ui); } };
  if (cc.systemEvent) cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, state.keydown, state);
  state.refresh = function () { refresh(ui, state); }; language().onChange(state.refresh, state);
  ui.onPauseGame(true, state);
  if (ui.ctrUI.onBlockTouch) ui.ctrUI.onBlockTouch(); if (game.moveFun) game.moveFun(null);
  refresh(ui, state);
  ui.loadSpriteFrame("KinghtFallPrefabs", "_res/textures/KinghtFallUIOnlineReward/wg_zy_gb", function (frame) {
    if (!frame || !current(ui, state)) return;
    state.closeIcon.spriteFrame = frame; state.close.getChildByName("Caption").active = false;
    if (state.typeTooltip) { state.typeTooltip.closeIcon.spriteFrame = frame; state.typeTooltip.close.getChildByName("Caption").active = false; }
  });
}
function bind(ui, record) {
  var item = record && record.ndItem; if (!item || !item.on) return;
  if (item._enemyGuideInputBlocker) item._enemyGuideInputBlocker.enabled = planning(ui) && !record._guideLive;
  if (record._guideLive || item._enemyGuideBound) return;
  item._enemyGuideBound = true;
  item._enemyGuideInputBlocker = item.addComponent(cc.BlockInputEvents);
  item._enemyGuideInputBlocker.enabled = planning(ui);
  if (planning(ui)) (record._guideIds || [record.id]).forEach(function (id) {
    var cfg = manager().getSoldierCfgById(id); if (cfg) loadPortrait(ui, cfg.loadIcon);
  });
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
exports.describe = describe; exports.describeTypes = typeGuide; exports.safeBounds = safeBounds;
