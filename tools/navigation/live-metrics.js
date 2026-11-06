"use strict";

// Optional, temporary observer for the actual Creator preview. This file has no
// engine imports and does not belong in the shipped asset bundle.
// attach(game, cc, Navigation, NavigationGrid).start("wave 6 gate crowd")
var SAMPLE_LIMIT = 18000;
var UNIT_LIMIT = 1024;
var SAMPLE_GAME_MS = 200;
var STALL_GAME_MS = 5000;
var CPU_METHODS = ["enemyFind", "soldierFind", "movement", "buildingFootprints", "formation", "collision", "spineUpdate", "spineTransform", "spineVertices", "spineWorldVertices", "depthView", "depthSnapshot", "rendering"];

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}
function series() {
  return { values: [], buckets: new Map(), cursor: 0, count: 0, sum: 0, max: 0, over50: 0, over100: 0 };
}
function bucket(value) { return value <= 100 ? Math.round(value * 10) / 10 : Math.round(value); }
function addSeries(metric, value) {
  if (!Number.isFinite(value) || value < 0) return;
  if (metric.values.length < SAMPLE_LIMIT) metric.values.push(value);
  else {
    var previous = bucket(metric.values[metric.cursor]), count = metric.buckets.get(previous);
    if (count === 1) metric.buckets.delete(previous); else metric.buckets.set(previous, count - 1);
    metric.values[metric.cursor] = value; metric.cursor = (metric.cursor + 1) % SAMPLE_LIMIT;
  }
  var key = bucket(value);
  metric.buckets.set(key, (metric.buckets.get(key) || 0) + 1);
  metric.count++; metric.sum += value; metric.max = Math.max(metric.max, value);
  if (value > 50) metric.over50++;
  if (value > 100) metric.over100++;
}
function summarize(metric) {
  // Reporting traverses occupied timing buckets, not thousands of frame rows.
  // Means, maxima and threshold counts remain exact; percentiles are rounded.
  var sorted = Array.from(metric.buckets.keys()).sort(function (a, b) { return a - b; });
  function percentile(fraction) {
    var target = Math.ceil(metric.values.length * fraction), count = 0;
    for (var i = 0; i < sorted.length; i++) { count += metric.buckets.get(sorted[i]); if (count >= target) return sorted[i]; }
    return 0;
  }
  function round(value) { return Math.round(value * 1000) / 1000; }
  return { count: metric.count, retainedSamples: metric.values.length, mean: round(metric.count ? metric.sum / metric.count : 0),
    p50: round(percentile(.5)), p95: round(percentile(.95)), p99: round(percentile(.99)), max: round(metric.max),
    over50: metric.over50, over100: metric.over100 };
}
function copyPoint(value) { return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function stateName(value) { return ["idle", "moving", "attacking", "waiting", "dead"][value] || String(value); }

function attach(game, cc, Navigation, NavigationGrid, options) {
  if (!game || typeof game.onUpdate !== "function") throw new TypeError("live-metrics requires a live GameCtrl");
  NavigationGrid = NavigationGrid && (NavigationGrid.NavigationGrid || NavigationGrid);
  if (!NavigationGrid || !NavigationGrid.prototype.findPath) throw new TypeError("live-metrics requires NavigationGrid");
  var bindings = [], records = new Map(), buildings = new Set(), phase = null, frame = null, frameId = 0, phaseId = 0;
  var insideGame = 0, gameMs = 0, nextSample = 0, sampleDue = false, disposed = false, lastSnapshot = null;
  var director = cc.director, physics = director.getPhysicsManager();
  var geometryDiagnostics = !!(options && options.geometryDiagnostics);
  var detailedEngineCPU = !!(options && options.detailedEngineCPU);
  var assemblerTypes = new Set(), depthBinding = null, drawStarted = null;

  function safe(callback) {
    try { return callback(); }
    catch (error) { if (phase && phase.errors.length < 20) phase.errors.push(String(error && error.stack || error)); }
  }
  function bind(object, key, wrap) {
    if (!object || typeof object[key] !== "function") return null;
    var descriptor = Object.getOwnPropertyDescriptor(object, key), original = object[key];
    var replacement = wrap(original);
    object[key] = replacement;
    var binding = { object: object, key: key, original: original, descriptor: descriptor, replacement: replacement };
    bindings.push(binding);
    return binding;
  }
  function restore(binding) {
    if (binding.object[binding.key] !== binding.replacement) return;
    if (binding.descriptor) Object.defineProperty(binding.object, binding.key, binding.descriptor);
    else delete binding.object[binding.key];
  }
  function valid(unit) {
    return unit && unit.node && unit.node.activeInHierarchy !== false && !unit._isPooled && !(unit.isDead && unit.isDead());
  }
  function unitKey(unit) { return String(unit.node.uuid || unit.uuid || unit.node.name || "unit") + ":" + (unit.node._combatGeneration || 0); }
  function resetRecord(record) {
    record.generation = record.unit.node._combatGeneration || 0;
    record.phaseId = phaseId;
    record.points = [];
    record.lastMove = -Infinity;
    record.lastMoveFrame = -Infinity;
    record.lastFindFrame = -Infinity;
    record.canAttack = false;
    record.lastAttack = -Infinity;
    record.attacks = 0;
    record.sampledAttacks = 0;
    record.suspect = null;
    record.goal = null;
    record.result = null;
    record.targetNode = null;
    record.plannedPosition = null;
  }
  function prepare(record) {
    if (record.phaseId !== phaseId || record.generation !== (record.unit.node._combatGeneration || 0)) resetRecord(record);
    return record;
  }
  function addCall(name, elapsed) {
    var metric = phase.calls[name];
    metric.count++; metric.totalMs += elapsed; metric.maxMs = Math.max(metric.maxMs, elapsed);
    if (frame) frame[name + "CPU"] += elapsed;
  }
  function profile(object, key, name) {
    return bind(object, key, function(original) {
      return function() {
        if(!phase || !frame)return original.apply(this,arguments);
        var started=now();
        try{return original.apply(this,arguments);}
        finally{addCall(name,now()-started);}
      };
    });
  }
  function observeAssembler(skeleton) {
    if(!detailedEngineCPU)return;
    var assembler=skeleton&&skeleton._assembler,prototype=assembler&&Object.getPrototypeOf(assembler);
    if(!prototype||assemblerTypes.has(prototype))return;
    assemblerTypes.add(prototype);
    profile(prototype,"updateRenderData","spineTransform");
    profile(prototype,"fillBuffers","spineVertices");
  }
  function register(unit, team) {
    if (!unit || !unit.node) return null;
    var record = records.get(unit);
    if (record) { record.team = team || record.team; record.lastSeen = gameMs; return prepare(record); }
    if (records.size >= UNIT_LIMIT) { if (phase) phase.untrackedUnits++; return null; }
    record = { unit: unit, team: team || (unit.navigationTeam === "friendly" ? "ally" : "enemy"), lastSeen: gameMs, bindings: [] };
    records.set(unit, record); resetRecord(record);
    observeAssembler(unit.spAni);
    var findBinding = bind(unit, "getFind", function (original) {
      return function () {
        var measured = phase && insideGame, started = measured ? now() : 0, result;
        try { result = original.apply(this, arguments); }
        finally { if (measured) addCall(record.team === "ally" ? "soldierFind" : "enemyFind", now() - started); }
        if (phase && insideGame) safe(function () {
          prepare(record); record.canAttack = !!(result && result.canAtt); record.lastFindFrame = frameId;
          var target = result && result.tag; record.targetNode = target && (target.node || target);
        });
        return result;
      };
    });
    var attackBinding = bind(unit, "doAttackStart", function (original) {
      return function () {
        if (phase && insideGame) safe(function () {
          prepare(record); record.lastAttack = gameMs; record.attacks++; phase.attacks++;
        });
        return original.apply(this, arguments);
      };
    });
    if (findBinding) record.bindings.push(findBinding);
    if (attackBinding) record.bindings.push(attackBinding);
    return record;
  }
  function lists() {
    var data = game.gameData;
    return { enemies: data && data.getEnemyList ? data.getEnemyList() : [], allies: data && data.getSoldierList ? data.getSoldierList() : [] };
  }
  function observeUnits() {
    var units = lists();
    units.enemies.forEach(function (unit) { register(unit, "enemy"); });
    units.allies.forEach(function (unit) { register(unit, "ally"); });
    if (game.gameData && game.gameData.getBulidList) game.gameData.getBulidList().forEach(function (building) {
      if (buildings.has(building)) return;
      buildings.add(building);
      ["getWposPhyCol", "getWposPhyCol2"].forEach(function (name) {
        bind(building, name, function (original) {
          return function () {
            if (!phase || !insideGame) return original.apply(this, arguments);
            var started = now();
            try { return original.apply(this, arguments); }
            finally { addCall("buildingFootprints", now() - started); }
          };
        });
      });
    });
    return units;
  }
  function finishFrame(end) {
    if (!phase || !frame || !frame.gameCalls) return;
    addSeries(phase.frameMs, end - frame.started);
    addSeries(phase.gameUpdateMs, frame.gameCPU);
    addSeries(phase.physicsMs, frame.physicsCPU);
    addSeries(phase.searchFrameMs, frame.searchCPU);
    CPU_METHODS.forEach(function (name) { addSeries(phase[name + "Ms"], frame[name + "CPU"]); });
    phase.peakSearchesPerFrame = Math.max(phase.peakSearchesPerFrame, frame.searches);
    phase.peakRefreshesPerFrame = Math.max(phase.peakRefreshesPerFrame, frame.refreshes);
    phase.frames++;
  }
  function beforeUpdate() {
    if (!phase || disposed) return;
    var time = now();
    finishFrame(time); frameId++;
    frame = { started: time, gameCalls: 0, gameCPU: 0, physicsCPU: 0, searchCPU: 0, searches: 0, refreshes: 0,
      enemyFindCPU: 0, soldierFindCPU: 0, movementCPU: 0, buildingFootprintsCPU: 0 };
    CPU_METHODS.forEach(function(name){frame[name+"CPU"]=0;});
  }
  function afterUpdate() {
    if (!phase || !sampleDue || disposed) return;
    // Creator updates physics after component updates. Observe final positions,
    // after Box2D has synchronized bodies back to their scene nodes.
    safe(sample); nextSample = gameMs + SAMPLE_GAME_MS; sampleDue = false;
  }
  function geometrySnapshot(navigation) {
    return { revision: navigation.revision, cache: new Map(navigation._shapeCache),
      polygons: navigation._polygons.slice(), friendlyPolygons: navigation._friendlyPolygons.slice(),
      bounds: navigation.grid && Object.assign({}, navigation.grid.bounds) };
  }
  function shapeName(collider) {
    return { node: collider.node && collider.node.name, nodeId: collider.node && collider.node.uuid,
      collider: collider.uuid || collider._id || "", type: collider.constructor && collider.constructor.name };
  }
  function stampLabels(collider, cached) {
    var labels = [];
    if (cached.forced) {
      for (var p = 0; p < cached.stamp.length / 2; p++) labels.push("forcedPoint[" + p + "].x", "forcedPoint[" + p + "].y");
      return labels;
    }
    for (var ancestor = collider.node; ancestor && ancestor !== game.ndMain; ancestor = ancestor.parent) {
      var name = ancestor === collider.node ? "node" : "ancestor(" + ancestor.name + ")";
      labels.push(name + ".reference", name + ".x", name + ".y", name + ".scaleX", name + ".scaleY", name + ".angle");
    }
    labels.push("offset.x", "offset.y", "radius", "size.width", "size.height");
    for (var i = 0; labels.length < cached.stamp.length; i++) labels.push("point[" + i + "].x", "point[" + i + "].y");
    return labels;
  }
  function retainLargest(list, value, key) {
    var existing = list.findIndex(function (entry) { return entry.key === key; });
    if (existing >= 0) {
      if (list[existing].absoluteDelta >= value.absoluteDelta) return;
      list.splice(existing, 1);
    }
    value.key = key; list.push(value);
    list.sort(function (a, b) { return b.absoluteDelta - a.absoluteDelta; });
    if (list.length > 5) list.length = 5;
  }
  function recordGeometry(navigation, before) {
    if (!phase || before.revision === navigation.revision) return;
    var diagnostics = phase.geometry, oldActive = new Set(before.polygons), active = new Set(navigation._polygons);
    var event = { frame: frameId, gameMs: gameMs, revision: navigation.revision,
      polygonCounts: { before: before.polygons.length, after: navigation._polygons.length,
        friendlyBefore: before.friendlyPolygons.length, friendlyAfter: navigation._friendlyPolygons.length },
      boundsChanged: JSON.stringify(before.bounds) !== JSON.stringify(navigation.grid && navigation.grid.bounds),
      changedColliders: 0, activated: 0, deactivated: 0, referenceChanges: 0, top5: [], changes: [] };
    if (event.boundsChanged) event.bounds = { before: before.bounds, after: Object.assign({}, navigation.grid.bounds) };
    navigation._shapeCache.forEach(function (after, collider) {
      var prior = before.cache.get(collider), wasActive = prior && oldActive.has(prior.polygon), isActive = active.has(after.polygon);
      var changed = !prior || prior !== after;
      if (wasActive === isActive && !changed) return;
      if (!wasActive && !isActive) return;
      var identity = shapeName(collider), name = identity.node || "(unnamed)", type = !wasActive ? "activated" : !isActive ? "deactivated" : "stamp";
      if (!wasActive) event.activated++;
      if (!isActive) event.deactivated++;
      event.changedColliders++;
      var nodeKey = identity.nodeId || name;
      if (!diagnostics.nodes.has(nodeKey) && diagnostics.nodes.size >= 50) nodeKey = "(other nodes)";
      var node = diagnostics.nodes.get(nodeKey);
      if (!node) { node = { node: name, nodeId: identity.nodeId, changes: 0, activations: 0, deactivations: 0, maxStampDelta: 0 }; diagnostics.nodes.set(nodeKey, node); }
      node.changes++; if (!wasActive) node.activations++; if (!isActive) node.deactivations++;
      var detail = Object.assign({}, identity, { change: type, forced: after.forced, stampLength: after.stamp.length });
      if (event.changes.length < 10) event.changes.push(detail);
      if (!prior || !wasActive || !isActive) return;
      var labels = stampLabels(collider, after), length = Math.max(prior.stamp.length, after.stamp.length);
      for (var i = 0; i < length; i++) {
        var oldValue = prior.stamp[i], newValue = after.stamp[i];
        if (oldValue === newValue) continue;
        if (typeof oldValue !== "number" || typeof newValue !== "number" || !Number.isFinite(oldValue) || !Number.isFinite(newValue)) { event.referenceChanges++; continue; }
        var absoluteDelta = Math.abs(newValue - oldValue);
        node.maxStampDelta = Math.max(node.maxStampDelta, absoluteDelta);
        var delta = Object.assign({}, identity, { field: labels[i] || "stamp[" + i + "]", before: oldValue, after: newValue, absoluteDelta: absoluteDelta });
        var key = (identity.collider || nodeKey) + ":" + i;
        retainLargest(event.top5, Object.assign({}, delta), key);
        retainLargest(diagnostics.top5, delta, key);
      }
    });
    diagnostics.revisions++;
    diagnostics.events.push(event);
    if (diagnostics.events.length > 20) diagnostics.events.shift();
  }

  bind(game, "onUpdate", function (original) {
    return function (dt) {
      if (!phase) return original.apply(this, arguments);
      if (!frame) beforeUpdate();
      safe(observeUnits);
      insideGame++; var started = now();
      try { return original.apply(this, arguments); }
      finally {
        var elapsed = now() - started;
        insideGame--;
        if (frame) { frame.gameCalls++; frame.gameCPU += elapsed; }
        gameMs += Math.max(0, Number(dt) || 0) * 1000;
        if (gameMs >= nextSample) {
          sampleDue = true;
          if (!cc.Director.EVENT_AFTER_UPDATE) afterUpdate();
        }
      }
    };
  });
  bind(physics, "update", function (original) {
    return function () {
      if (!phase || !frame) return original.apply(this, arguments);
      var started = now();
      try { return original.apply(this, arguments); }
      finally { if (frame) frame.physicsCPU += now() - started; }
    };
  });
  if(detailedEngineCPU)profile(director.getCollisionManager&&director.getCollisionManager(),"update","collision");
  if(detailedEngineCPU&&typeof sp!=="undefined"&&sp.Skeleton)profile(sp.Skeleton.prototype,"update","spineUpdate");
  if(detailedEngineCPU&&typeof sp!=="undefined"&&sp.spine){
    profile(sp.spine.RegionAttachment&&sp.spine.RegionAttachment.prototype,"computeWorldVertices","spineWorldVertices");
    profile(sp.spine.VertexAttachment&&sp.spine.VertexAttachment.prototype,"computeWorldVertices","spineWorldVertices");
  }
  profile(game,"getArmyOrderGoal","formation");
  if(detailedEngineCPU&&game._depthView) {
    var depth=game._depthView;
    depthBinding=profile(depth,"update","depthView");
    profile(depth,"snapshot","depthSnapshot");
    // DepthView registered its current function before instrumentation attached.
    // Rebind that listener to the measured function, retaining the same target.
    if(depthBinding){director.off(cc.Director.EVENT_BEFORE_DRAW,depthBinding.original,depth);director.on(cc.Director.EVENT_BEFORE_DRAW,depthBinding.replacement,depth);}
  }
  bind(NavigationGrid.prototype, "findPath", function (original) {
    return function () {
      if (!phase || !insideGame) return original.apply(this, arguments);
      var started = now(), result;
      try { result = original.apply(this, arguments); return result; }
      finally {
        var elapsed = now() - started;
        addSeries(phase.searchCallMs, elapsed); phase.searches++;
        if (!result) phase.noPathSearches++;
        if (frame) { frame.searches++; frame.searchCPU += elapsed; }
      }
    };
  });
  bind(Object.getPrototypeOf(Navigation.get(game)), "refresh", function (original) {
    return function () {
      var navigation = this, before = null;
      if (phase && geometryDiagnostics && this.game === game && (!this.grid || this._refreshPending || Date.now() >= this._nextRefresh)) {
        before = safe(function () { return geometrySnapshot(navigation); });
      }
      if (phase && insideGame && this.game === game) {
        phase.refreshCalls++;
        if (frame) frame.refreshes++;
      }
      var result = original.apply(this, arguments);
      if (before) safe(function () { recordGeometry(navigation, before); });
      return result;
    };
  });
  bind(Navigation, "moveTo", function (original) {
    return function (unit, owner, goal) {
      var measured = phase && owner === game && insideGame, started = measured ? now() : 0, result;
      try { result = original.apply(this, arguments); }
      finally { if (measured) addCall("movement", now() - started); }
      if (phase && owner === game && insideGame) safe(function () {
        var record = register(unit);
        if (!record) return;
        record.goal = copyPoint(goal); record.result = { arrived: !!result.arrived, reached: !!result.reached, blocked: !!result.blocked, deferred: !!result.deferred };
        if (geometryDiagnostics) record.plannedPosition = Navigation.positionOf(unit.node, game);
        record.lastMove = gameMs; record.lastMoveFrame = frameId;
        phase.moveCalls++;
        if (result.blocked) phase.blockedMoves++;
        if (result.deferred) phase.deferredMoves++;
        if (result.arrived) phase.endpointArrivals++;
        if (result.reached) phase.exactArrivals++;
      });
      return result;
    };
  });
  director.on(cc.Director.EVENT_BEFORE_UPDATE, beforeUpdate);
  if (cc.Director.EVENT_AFTER_UPDATE) director.on(cc.Director.EVENT_AFTER_UPDATE, afterUpdate);
  function beforeDraw(){if(phase&&frame)drawStarted=now();}
  function afterDraw(){if(phase&&frame&&drawStarted!==null){addCall("rendering",now()-drawStarted);if(cc.renderer)addSeries(phase.drawCalls,cc.renderer.drawCalls);}drawStarted=null;}
  if(detailedEngineCPU&&cc.Director.EVENT_BEFORE_DRAW)director.on(cc.Director.EVENT_BEFORE_DRAW,beforeDraw);
  if(detailedEngineCPU&&cc.Director.EVENT_AFTER_DRAW)director.on(cc.Director.EVENT_AFTER_DRAW,afterDraw);

  function sample() {
    if (!phase || disposed) return lastSnapshot;
    var units = observeUnits(), counts = { enemies: 0, allies: 0, idle: 0, moving: 0, attacking: 0, waiting: 0,
      deadOrInactive: 0, attackCooldown: 0, routeExhausted: 0, movingWithGoal: 0, currentBlocked: 0, currentDeferred: 0 };
    var present = new Set(units.enemies.concat(units.allies)), suspects = [];
    records.forEach(function (record, unit) {
      if (!present.has(unit) && gameMs - record.lastSeen > 30000) {
        record.bindings.forEach(function (binding) {
          restore(binding);
          var index = bindings.indexOf(binding); if (index >= 0) bindings.splice(index, 1);
        });
        records.delete(unit); return;
      }
      if (!present.has(unit)) return;
      prepare(record);
      if (!valid(unit)) { counts.deadOrInactive++; record.points = []; record.suspect = null; return; }
      counts[record.team === "ally" ? "allies" : "enemies"]++;
      var state = stateName(unit.state);
      if (Object.prototype.hasOwnProperty.call(counts, state)) counts[state]++;
      var route = unit.bornInfo;
      if (unit.state === 3 && route && route.nodeIndex >= route.pathList.length) counts.routeExhausted++;
      var position = Navigation.positionOf(unit.node, game);
      var speed = unit.getSpeed ? unit.getSpeed() : 0;
      var recentMove = gameMs - record.lastMove <= Math.max(500, SAMPLE_GAME_MS * 2);
      var coolingDown = record.canAttack && record.lastFindFrame >= record.lastMoveFrame && record.lastFindFrame >= frameId - 2;
      if (coolingDown) counts.attackCooldown++;
      var eligible = unit.state === 1 && speed > 0 && recentMove && record.goal && record.result && !record.result.reached && distance(position, record.goal) > 1 && !coolingDown;
      if (record.attacks !== record.sampledAttacks) { record.points = []; record.suspect = null; record.sampledAttacks = record.attacks; }
      if (!eligible) { record.points = []; record.suspect = null; return; }
      counts.movingWithGoal++;
      if (record.result.blocked) counts.currentBlocked++;
      if (record.result.deferred) counts.currentDeferred++;
      // Keep a position range over five seconds of active simulation. Jitter
      // cannot masquerade as progress by adding up tiny alternating movements.
      var points = record.points;
      if (!points.length || gameMs !== points[points.length - 1].time) points.push({ time: gameMs, x: position.x, y: position.y });
      while (points.length > 1 && points[1].time <= gameMs - STALL_GAME_MS) points.shift();
      if (points.length > 64) points.shift();
      if (gameMs - points[0].time < STALL_GAME_MS) return;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      points.forEach(function (point) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); });
      var range = Math.hypot(maxX - minX, maxY - minY), tolerance = Math.max(4, speed * .1);
      if (range > tolerance) { record.suspect = null; return; }
      var navigationState = unit._navigationState;
      var pathSamples = [], pathPoints = navigationState && navigationState.points;
      if (pathPoints && pathPoints.length) {
        [0, navigationState.index, navigationState.index + 1].forEach(function (index) {
          if (index >= pathPoints.length || pathSamples.some(function (point) { return point.index === index; })) return;
          pathSamples.push({ index: index, point: copyPoint(pathPoints[index]) });
        });
      }
      var escape = navigationState && navigationState.escape;
      var detail = { unit: unitKey(unit), kind: unit.cfg && unit.cfg.ID, team: record.team, state: state,
        position: copyPoint(position), goal: copyPoint(record.goal), windowGameMs: gameMs - points[0].time,
        positionRange: Math.round(range * 1000) / 1000, tolerance: tolerance, speed: speed,
        blocked: record.result.blocked, deferred: record.result.deferred, projectedArrival: record.result.arrived && !record.result.reached,
        target: record.targetNode && (record.targetNode.uuid || record.targetNode.name),
        lastAttackGameMsAgo: Number.isFinite(record.lastAttack) ? gameMs - record.lastAttack : null,
        routeIndex: route && route.nodeIndex, routeLength: route && route.pathList.length,
        pathIndex: navigationState && navigationState.index, pathLength: navigationState && navigationState.points && navigationState.points.length,
        navigationRevision: navigationState && navigationState.revision, radius: navigationState && navigationState.radius,
        pathSamples: pathSamples, pathStart: navigationState && copyPoint(navigationState.start), pathGoal: navigationState && copyPoint(navigationState.goal),
        escape: escape ? { from: copyPoint(escape.from), to: copyPoint(escape.to), distance: escape.distance } : null,
        plannedBeforePhysics: record.plannedPosition && copyPoint(record.plannedPosition),
        physicsDisplacement: record.plannedPosition ? distance(record.plannedPosition, position) : null,
        following: !!unit.isAgg, rallying: !!unit.rallyPoint };
      if (!record.suspect) {
        phase.stallEpisodes++;
        phase.stallDetails.push(detail);
        if (phase.stallDetails.length > 20) phase.stallDetails.shift();
      }
      record.suspect = detail; suspects.push(detail);
    });
    phase.peakEnemies = Math.max(phase.peakEnemies, counts.enemies);
    phase.peakAllies = Math.max(phase.peakAllies, counts.allies);
    phase.peakUnits = Math.max(phase.peakUnits, counts.enemies + counts.allies);
    phase.peakStalls = Math.max(phase.peakStalls, suspects.length);
    lastSnapshot = { counts: counts, currentStalls: suspects.slice(-20) };
    return lastSnapshot;
  }
  function start(label) {
    if (disposed) throw new Error("live-metrics observer was disposed");
    phaseId++; gameMs = 0; nextSample = 0; sampleDue = false; frame = null; lastSnapshot = null;
    var navigation = Navigation.get(game);
    phase = { label: String(label || "preview"), started: now(), baseline: Object.assign({}, navigation.stats), frames: 0,
      frameMs: series(), gameUpdateMs: series(), physicsMs: series(), searchFrameMs: series(), searchCallMs: series(),drawCalls:series(),
      enemyFindMs: series(), soldierFindMs: series(), movementMs: series(), buildingFootprintsMs: series(), calls: {},
      searches: 0, noPathSearches: 0, refreshCalls: 0, moveCalls: 0, blockedMoves: 0, deferredMoves: 0,
      endpointArrivals: 0, exactArrivals: 0, attacks: 0, peakSearchesPerFrame: 0, peakRefreshesPerFrame: 0,
      peakEnemies: 0, peakAllies: 0, peakUnits: 0, stallEpisodes: 0, peakStalls: 0, stallDetails: [], errors: [], untrackedUnits: 0,
      geometry: { revisions: 0, events: [], top5: [], nodes: new Map() } };
    CPU_METHODS.forEach(function (name) { phase[name+"Ms"]=series();phase.calls[name] = { count: 0, totalMs: 0, maxMs: 0 }; });
    safe(observeUnits);
    return { label: phase.label, started: true };
  }
  function report() {
    if (!phase) return { attached: !disposed, running: false };
    safe(sample);
    var stats = Navigation.get(game).stats || {}, delta = {}, calls = {};
    Object.keys(stats).forEach(function (key) { delta[key] = stats[key] - (phase.baseline[key] || 0); });
    Object.keys(phase.calls).forEach(function (name) {
      var metric = phase.calls[name];
      calls[name] = { count: metric.count, totalMs: Math.round(metric.totalMs * 1000) / 1000,
        meanMs: metric.count ? Math.round(metric.totalMs / metric.count * 1000) / 1000 : 0, maxMs: Math.round(metric.maxMs * 1000) / 1000 };
    });
    return { label: phase.label, running: !disposed, elapsedWallMs: Math.round(now() - phase.started), elapsedGameMs: Math.round(gameMs),
      frames: phase.frames, sampleCapacity: SAMPLE_LIMIT, percentileScope: "last retained samples; counts/mean/max cover the phase",
      percentileRoundingMs: "0.1 up to 100ms; 1 above 100ms",
      timingMs: { frame: summarize(phase.frameMs), gameUpdate: summarize(phase.gameUpdateMs), physics: summarize(phase.physicsMs),
        searchesPerFrame: summarize(phase.searchFrameMs), searchCall: summarize(phase.searchCallMs),
        enemyFind: summarize(phase.enemyFindMs), soldierFind: summarize(phase.soldierFindMs), movement: summarize(phase.movementMs),
        buildingFootprints: summarize(phase.buildingFootprintsMs),formation:summarize(phase.formationMs), collision:summarize(phase.collisionMs),
        spineUpdate:summarize(phase.spineUpdateMs),spineTransform:summarize(phase.spineTransformMs),spineAssembly:summarize(phase.spineVerticesMs),spineVertices:summarize(phase.spineVerticesMs),spineWorldVertices:summarize(phase.spineWorldVerticesMs),
        depthView:summarize(phase.depthViewMs),depthSnapshot:summarize(phase.depthSnapshotMs),rendering:summarize(phase.renderingMs) },
      drawCalls:summarize(phase.drawCalls),methodCalls: calls, timingNesting: "Per-frame CPU ms. buildingFootprints is nested in enemy/soldierFind; searchesPerFrame in movement; depthSnapshot in depthView. spineAssembly (legacy alias spineVertices) covers all assembler fillBuffers work, including materials, colors and batching. spineWorldVertices measures only RegionAttachment/VertexAttachment.computeWorldVertices and is nested in depthView or spineAssembly. rendering spans BEFORE_DRAW after DepthView to AFTER_DRAW. CollisionManager is separate from Box2D physics. formation measures getArmyOrderGoal within game update.",
      navigation: { searches: phase.searches, noPathSearches: phase.noPathSearches, refreshCalls: phase.refreshCalls,
        moveCalls: phase.moveCalls, blockedMoves: phase.blockedMoves, deferredMoves: phase.deferredMoves,
        endpointArrivals: phase.endpointArrivals, exactArrivals: phase.exactArrivals,
        peakSearchesPerFrame: phase.peakSearchesPerFrame, peakRefreshesPerFrame: phase.peakRefreshesPerFrame, statsDelta: delta },
      army: { peakEnemies: phase.peakEnemies, peakAllies: phase.peakAllies, peakUnits: phase.peakUnits, attacks: phase.attacks,
        current: lastSnapshot && lastSnapshot.counts },
      stalls: { thresholdGameMs: STALL_GAME_MS, episodes: phase.stallEpisodes, peakConcurrent: phase.peakStalls,
        current: lastSnapshot ? lastSnapshot.currentStalls : [], last20: phase.stallDetails.slice() },
      geometry: { enabled: geometryDiagnostics, revisions: phase.geometry.revisions, top5: phase.geometry.top5.slice(),
        nodes: Array.from(phase.geometry.nodes.values()).sort(function (a, b) { return b.changes - a.changes; }).slice(0, 10),
        last20: phase.geometry.events.slice() },
      observer: { trackedUnits: records.size, untrackedUnits: phase.untrackedUnits, detailedEngineCPU:detailedEngineCPU, errors: phase.errors.slice() } };
  }
  function dispose() {
    if (disposed) return report();
    var result = report();
    director.off(cc.Director.EVENT_BEFORE_UPDATE, beforeUpdate);
    if (cc.Director.EVENT_AFTER_UPDATE) director.off(cc.Director.EVENT_AFTER_UPDATE, afterUpdate);
    if(cc.Director.EVENT_BEFORE_DRAW)director.off(cc.Director.EVENT_BEFORE_DRAW,beforeDraw);
    if(cc.Director.EVENT_AFTER_DRAW)director.off(cc.Director.EVENT_AFTER_DRAW,afterDraw);
    if(depthBinding){director.off(cc.Director.EVENT_BEFORE_DRAW,depthBinding.replacement,depthBinding.object);director.on(cc.Director.EVENT_BEFORE_DRAW,depthBinding.original,depthBinding.object);}
    for (var i = bindings.length - 1; i >= 0; i--) restore(bindings[i]);
    disposed = true; frame = null;
    result.running = false;
    return result;
  }
  return { start: start, sample: sample, report: report, dispose: dispose,
    restoreRenderTimingOrder:function(){if(detailedEngineCPU&&cc.Director.EVENT_BEFORE_DRAW){director.off(cc.Director.EVENT_BEFORE_DRAW,beforeDraw);director.on(cc.Director.EVENT_BEFORE_DRAW,beforeDraw);}},
    setGeometryDiagnostics: function (enabled) { geometryDiagnostics = !!enabled; return geometryDiagnostics; } };
}

exports.attach = attach;
