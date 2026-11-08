"use strict";
// All positions are in ndMain coordinates. The planner uses actual enabled
// physics shapes, not sprite bounds or the old hand-authored detour markers.
var NavigationGrid = require("NavigationGrid").NavigationGrid;

function point(node, main, offset) {
  var p = main.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(offset || { x: 0, y: 0 })));
  return { x: p.x, y: p.y };
}
function distance(a, b) { var x = a.x - b.x, y = a.y - b.y; return Math.sqrt(x * x + y * y); }
function nearestPolygonPoint(start, vertices) {
  var best = null, bestDistance = Infinity;
  for (var i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    var a = vertices[j], b = vertices[i], dx = b.x - a.x, dy = b.y - a.y;
    var lengthSquared = dx * dx + dy * dy;
    var along = lengthSquared ? Math.max(0, Math.min(1, ((start.x - a.x) * dx + (start.y - a.y) * dy) / lengthSquared)) : 0;
    var candidate = { x: a.x + along * dx, y: a.y + along * dy }, length = distance(start, candidate);
    if (length < bestDistance) { best = candidate; bestDistance = length; }
  }
  return best;
}
exports.polygonDistance = function (unit, polygon, game) {
  var start = unit.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
  var closest = nearestPolygonPoint(start, polygon);
  if (!closest) return Infinity;
  return distance(point(unit.node, game.ndMain), game.ndMain.convertToNodeSpaceAR(cc.v2(closest)));
};
var ARRIVAL_EPSILON = 0.0001;
function setMainPosition(node, main, position) {
  var world = main.convertToWorldSpaceAR(cc.v2(position));
  var local = node.parent ? node.parent.convertToNodeSpaceAR(world) : world;
  node.setPosition(local.x, local.y);
}
function activeCollider(collider) {
  return collider.enabled && !collider.sensor && collider.node.activeInHierarchy && (!collider.body || collider.body.active !== false);
}
function onEscape(start, escape) {
  // Physics can nudge a newly spawned body while its short exit is in progress.
  // A teleport away from that exit must request a new path instead.
  return escape && distance(escape.from, start) + distance(start, escape.to) <= escape.distance + 0.01;
}
function colliderPoints(collider) {
  var offset = collider.offset || { x: 0, y: 0 };
  var points;
  if (collider.points) points = collider.points;
  else if (collider.size) {
    var w = collider.size.width / 2, h = collider.size.height / 2;
    points = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }];
  } else if (collider.radius) {
    points = [];
    // Circumscribe the circle so a segment cannot cut through its rounded edge.
    var radius = collider.radius / Math.cos(Math.PI / 16);
    for (var i = 0; i < 16; i++) points.push({ x: Math.cos(i * Math.PI / 8) * radius, y: Math.sin(i * Math.PI / 8) * radius });
  } else return [];
  return points.map(function (p) { return { x: p.x + offset.x, y: p.y + offset.y }; });
}
function colliders(node) {
  var result = [];
  [cc.PhysicsPolygonCollider, cc.PhysicsBoxCollider, cc.PhysicsCircleCollider].forEach(function (type) {
    if (type) result = result.concat(node.getComponentsInChildren(type));
  });
  return result;
}
function Navigation(game) {
  this.game = game;
  this.revision = 0;
  this._nextRefresh = 0;
  this._signature = "";
  this._refreshPending = true;
  this._shapeCache = new Map();
  this._polygons = [];
  this._friendlyPolygons = [];
  this._requests = [];
  this._requestUnits = new Set();
  this._frameId = 0;
  this.stats = { searches: 0, noPath: 0, revisions: 0, snapshotBuilds: 0, deferred: 0 };
}
Navigation.prototype.shape = function (collider, forcedPoints) {
  var main = this.game.ndMain, stamp = [], vertices, node = collider.node;
  if (forcedPoints) {
    vertices = forcedPoints.map(function (p) { var local = main.convertToNodeSpaceAR(cc.v2(p)); return { x: Math.round(local.x * 1e4) / 1e4, y: Math.round(local.y * 1e4) / 1e4 }; });
    vertices.forEach(function (p) { stamp.push(p.x, p.y); });
  } else {
    for (var ancestor = node; ancestor && ancestor !== main; ancestor = ancestor.parent) stamp.push(ancestor, ancestor.x, ancestor.y, ancestor.scaleX, ancestor.scaleY, ancestor.angle);
    var offset = collider.offset || { x: 0, y: 0 };
    stamp.push(offset.x, offset.y, collider.radius, collider.size && collider.size.width, collider.size && collider.size.height);
    (collider.points || []).forEach(function (p) { stamp.push(p.x, p.y); });
  }
  var cached = this._shapeCache.get(collider);
  if (cached && cached.forced === !!forcedPoints && cached.stamp.length === stamp.length && stamp.every(function (value, index) {
    var previous = cached.stamp[index];
    if (value === previous) return true;
    // Cocos round-trips static world/local transforms through physics. Ignore
    // floating-point noise against the last cached stamp, so cumulative real
    // movement still invalidates the scene instead of drifting unnoticed.
    return typeof value === "number" && typeof previous === "number" && isFinite(value) && isFinite(previous) && Math.abs(value - previous) <= 1e-12 * Math.max(1, Math.abs(value), Math.abs(previous));
  })) return cached.polygon;
  if (!vertices) vertices = colliderPoints(collider).map(function (p) { return point(node, main, p); });
  this._shapeCache.set(collider, { forced: !!forcedPoints, stamp: stamp, polygon: vertices });
  return vertices;
};
Navigation.prototype.refresh = function () {
  var now = Date.now();
  if (this.grid && !this._refreshPending && now < this._nextRefresh) return;
  this._refreshPending = false;
  this._nextRefresh = now + 250;
  var navigation = this, game = this.game, polygons = [], friendly = [], seen = new Set();
  game.gameData.obstacles.concat(game.gameData.getBulidList()).forEach(function (owner) {
    // Gate wings are sibling nodes referenced as Skeleton components, not
    // descendants of the gate. Their enabled physics shapes still block units.
    var gateShapes = owner.getNavigationGateShapes ? owner.getNavigationGateShapes() : [];
    gateShapes.forEach(function (shape) {
      if (seen.has(shape.collider)) return;
      seen.add(shape.collider);
      var polygon = navigation.shape(shape.collider, shape.points);
      if (polygon.length >= 3) polygons.push(polygon);
    });
    var nodes = [owner.node].concat((owner.ndAniOther || []).map(function (part) { return part && (part.node || part); }));
    nodes.forEach(function (node) {
      if (!node || !node.activeInHierarchy) return;
      colliders(node).forEach(function (collider) {
        if (seen.has(collider) || !activeCollider(collider)) return;
        seen.add(collider);
        var polygon = navigation.shape(collider);
        if (polygon.length >= 3) { polygons.push(polygon); friendly.push(polygon); }
      });
    });
  });
  var size = game.mapSize;
  var bounds = { minX: -size.width / 2, minY: -size.height / 2, maxX: size.width / 2, maxY: size.height / 2 };
  var same = this.grid && this.grid.bounds.minX === bounds.minX && this.grid.bounds.minY === bounds.minY && this.grid.bounds.maxX === bounds.maxX && this.grid.bounds.maxY === bounds.maxY;
  same = same && polygons.length === this._polygons.length && friendly.length === this._friendlyPolygons.length && polygons.every(function (p, index) { return p === navigation._polygons[index]; }) && friendly.every(function (p, index) { return p === navigation._friendlyPolygons[index]; });
  if (!same) {
    this._polygons = polygons;
    this._friendlyPolygons = friendly;
    this.grid = new NavigationGrid(polygons, bounds, 20);
    this.friendlyGrid = null;
    this.revision++;
    this.stats.revisions++;
    this.stats.snapshotBuilds++;
  }
};
Navigation.prototype.gridFor = function (unit) {
  this.refresh();
  if (unit.navigationTeam !== "friendly") return this.grid;
  // The upgraded first-map gate has a valid body-width passage between its
  // wings that a 20-unit lattice misses. Keep body clearance; sample more finely.
  if (!this.friendlyGrid) this.friendlyGrid = new NavigationGrid(this._friendlyPolygons, this.grid.bounds, 16);
  return this.friendlyGrid;
};
Navigation.prototype.takeSearchTurn = function (unit) {
  if (!this._frameManaged) return true;
  unit._navigationRequestFrame = this._frameId;
  while (this._requests.length) {
    var first = this._requests[0];
    if (first._isPooled || first.isDead && first.isDead() || first.node.activeInHierarchy === false || this._frameId - first._navigationRequestFrame > 2) {
      this._requestUnits.delete(first); this._requests.shift();
    } else break;
  }
  if (!this._requestUnits.has(unit)) { this._requestUnits.add(unit); this._requests.push(unit); }
  if (this._requests[0] !== unit || this._frameSearches >= 8 || this._frameSearches > 0 && Date.now() - this._frameSearchStart >= 4) return false;
  this._requests.shift(); this._requestUnits.delete(unit);
  return true;
};
Navigation.prototype.radius = function (unit) {
  // Attack/search CircleColliders are deliberately excluded: they are not bodies.
  var main = this.game.ndMain, center = point(unit.node, main), radius = 8;
  colliders(unit.node).forEach(function (collider) {
    if (!activeCollider(collider)) return;
    colliderPoints(collider).forEach(function (p) {
      radius = Math.max(radius, distance(center, point(collider.node, main, p)));
    });
  });
  return Math.ceil((radius + 2) / 4) * 4;
};
Navigation.prototype.crowdDetour = function (unit, start, target, radius, grid) {
  var navigation = this, data = this.game.gameData, neighbours = [];
  var actors = data.getSoldierList().concat(data.getEnemyList(), [this.game.ctrPlay]);
  actors.forEach(function (other) {
    if (other === unit || !other.node || other.node.activeInHierarchy === false || other._isPooled || other.isDead && other.isDead()) return;
    var position = point(other.node, navigation.game.ndMain), length = distance(start, position);
    if (length > radius + 128) return;
    var clearance = radius + navigation.radius(other);
    if (length < clearance + 64) neighbours.push({ point: position, clearance: clearance, distance: length });
  });
  if (!neighbours.length) return null;
  var angle = Math.atan2(target.y - start.y, target.x - start.x), length = Math.max(24, radius * 2);
  var turns = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI * .75, -Math.PI * .75, Math.PI];
  for (var i = 0; i < turns.length; i++) {
    var candidate = { x: start.x + Math.cos(angle + turns[i]) * length, y: start.y + Math.sin(angle + turns[i]) * length };
    if (!grid.segmentClear(start, candidate, radius)) continue;
    var dx = candidate.x - start.x, dy = candidate.y - start.y;
    var clear = neighbours.every(function (other) {
      var x = start.x - other.point.x, y = start.y - other.point.y;
      // Existing contact may be exited gradually, never deepened. Otherwise
      // require clearance along the entire step, not only at its endpoint.
      if (other.distance <= other.clearance) return x * dx + y * dy >= -.0001 && distance(candidate, other.point) > other.distance + 1;
      var along = Math.max(0, Math.min(1, -(x * dx + y * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x + along * dx, y + along * dy) >= other.clearance;
    });
    if (clear) return candidate;
  }
  return null;
};
Navigation.prototype.move = function (unit, target, dt) {
  if (unit._hitReactionPlaying) {
    if (unit.rigidBody) unit.rigidBody.linearVelocity = cc.Vec2.ZERO;
    return { arrived: false, reached: false, partial: false, blocked: false, directionX: 0, distance: 0 };
  }
  var start = point(unit.node, this.game.ndMain);
  var step = Math.max(0, unit.getSpeed() * dt);
  var now = Date.now(), destination = target, state;
  // Also clear velocity on blocked/finished routes, before any early return.
  if (unit.rigidBody) unit.rigidBody.linearVelocity = cc.Vec2.ZERO;
  // Some unit types intentionally cross buildings with their physics disabled.
  if (!unit.rigidBody || unit.rigidBody.active !== false) {
    this.refresh();
    var grid = this.gridFor(unit);
    var radius = this.radius(unit);
    state = unit._navigationState;
    var changed = !state || state.owner !== this || state.grid !== grid || state.revision !== this.revision || state.radius !== radius || distance(state.target, target) > 20;
    if (!changed && !state.points) changed = distance(state.start, start) > ARRIVAL_EPSILON || distance(state.target, target) > ARRIVAL_EPSILON;
    if (!changed && state.points) {
      if (state.index >= state.points.length) {
        changed = distance(state.target, target) > ARRIVAL_EPSILON || distance(start, state.goal) > ARRIVAL_EPSILON;
      } else if (grid.isWalkable(start, radius)) {
        // Crowd contacts can push a body past its cached escape/corner anchor.
        // Keep moving forward when the next segment has full body clearance;
        // returning to that exact, possibly occupied anchor can pin a queue.
        while (state.index + 1 < state.points.length && grid.segmentClear(start, state.points[state.index + 1], radius)) state.index++;
        changed = !grid.segmentClear(start, state.points[state.index], radius);
      } else {
        changed = state.index !== 0 || !onEscape(start, state.escape);
      }
    }
    if (changed || !state.points && now >= state.retryAt) {
      if (!this.takeSearchTurn(unit)) {
        this.stats.deferred++;
        return { arrived: false, reached: false, blocked: false, deferred: true, directionX: 0 };
      }
      if (!this._frameSearches) this._frameSearchStart = Date.now();
      this._frameSearches = (this._frameSearches || 0) + 1;
      // Enemies advance to a reachable frontier so a distant intact wall can
      // enter their normal acquisition range. Exact-goal callers still fail
      // cleanly; a frontier never counts as completing an authored waypoint.
      var path = grid.findPath(start, target, radius, unit.navigationTeam === "enemy");
      this.stats.searches++;
      if (!path) this.stats.noPath++;
      // An immutable scene cannot yield a different answer for an unchanged
      // failed request. Retry when geometry, target or unit position changes.
      state = unit._navigationState = { owner: this, grid: grid, start: start, revision: this.revision, radius: radius, target: { x: target.x, y: target.y }, points: path && path.points, goal: path && path.goal, exact: !!(path && path.reached), partial: !!(path && path.partial), escape: path && path.escape, index: 0, retryAt: Infinity };
    }
    if (!state.points) return { arrived: false, reached: false, blocked: true, directionX: 0 };
    while (state.index < state.points.length && distance(start, state.points[state.index]) <= ARRIVAL_EPSILON) state.index++;
    if (state.index >= state.points.length) return { arrived: true, reached: state.exact, partial: state.partial, blocked: false, directionX: 0, distance: 0 };
    destination = state.points[state.index];
  } else unit._navigationState = null;
  var detouring = false, progress = unit._navigationProgress;
  if (state && step > 0 && grid.isWalkable(start, radius)) {
    if (!progress || progress.owner !== this || progress.revision !== this.revision || distance(progress.target, target) > 20) {
      progress = unit._navigationProgress = { owner: this, revision: this.revision, target: { x: target.x, y: target.y }, point: start, elapsed: 0 };
    }
    if (distance(progress.point, start) >= Math.max(2, Math.min(8, unit.getSpeed() * .05))) { progress.point = start; progress.elapsed = 0; }
    else progress.elapsed += Math.min(Math.max(dt, 0), .1);
    if (progress.detour) {
      progress.remaining -= dt;
      if (progress.remaining <= 0 || !grid.segmentClear(start, progress.detour, radius)) progress.detour = null;
    }
    if (progress.elapsed >= .75) {
      progress.elapsed = 0;
      progress.detour = this.crowdDetour(unit, start, destination, radius, grid);
      progress.remaining = 1;
      // Physics may have invalidated a corridor without invalidating its last
      // segment. Retry through the existing fair search queue next update.
      if (!progress.detour) unit._navigationState = null;
    }
    if (progress.detour) { destination = progress.detour; detouring = true; }
  }
  var length = distance(start, destination);
  var travel = Math.min(step, length);
  var next = length > 0 ? { x: start.x + (destination.x - start.x) * travel / length, y: start.y + (destination.y - start.y) * travel / length } : start;
  setMainPosition(unit.node, this.game.ndMain, next);
  var arrived = travel === length;
  if (state && arrived && !detouring) state.index++;
  if (detouring && arrived) progress.detour = null;
  var finished = !detouring && (state ? state.index >= state.points.length : arrived);
  // Small target movement is coalesced while travelling, but the old endpoint
  // must never be reported as arrival at a target that has since moved.
  if (state && distance(state.target, target) > ARRIVAL_EPSILON) finished = false;
  return { arrived: finished, reached: finished && (!state || state.exact), partial: !!(state && state.partial), blocked: false, directionX: destination.x - start.x, distance: travel };
};
function get(game) {
  if (!game._navigation || game._navigation.game !== game) game._navigation = new Navigation(game);
  return game._navigation;
}
exports.moveTo = function (unit, game, target, dt) { return get(game).move(unit, target, dt); };
exports.positionOf = function (node, game) { return point(node, game.ndMain); };
exports.canStopFollowing = function (unit, game, target) {
  var navigation = get(game); navigation.refresh();
  return navigation.grid.segmentClear(point(unit.node, game.ndMain), target, 0);
};
exports.attackPositionOf = function (selection, unit, game) {
  var polygon = selection.polygon;
  if (!polygon || polygon.length < 2) return point(selection.tag, game.ndMain);
  var main = game.ndMain, start = point(unit.node, main);
  // Building origins can lie behind adjoining cliffs or wall pieces. Approach
  // the same polygon used by combat range checks instead; the planner projects
  // this boundary goal outward by the unit's real physics clearance.
  var vertices = polygon.map(function (p) {
    var local = main.convertToNodeSpaceAR(cc.v2(p));
    return { x: local.x, y: local.y };
  });
  return nearestPolygonPoint(start, vertices) || point(selection.tag, main);
};
exports.reset = function (unit) {
  unit._navigationState = null;
  unit._navigationProgress = null;
  if (unit.rigidBody) unit.rigidBody.linearVelocity = cc.Vec2.ZERO;
};
exports.resumeEnemyRoute = function (unit, game) {
  // Combat and route destinations can be less than the moving-target cache's
  // tolerance apart. Always discard the combat path on this transition.
  exports.reset(unit);
  var route = unit.bornInfo, nodes = route && route.pathList;
  if (!nodes || !nodes[route.nodeIndex]) return route && route.nodeIndex;
  var main = game.ndMain, start = point(unit.node, main), index = route.nodeIndex;
  var best = distance(start, point(nodes[index], main));
  var navigation = get(game), radius = 0;
  var collides = !unit.rigidBody || unit.rigidBody.active !== false;
  if (collides) { navigation.refresh(); radius = navigation.radius(unit); }
  // Find the nearest forward route segment that can be rejoined directly.
  // A segment behind a wall is not evidence that its preceding waypoints were
  // passed. Ties keep the earlier segment, including at crossing/looping routes.
  // Only skip a segment's start: its end (especially the final objective) still
  // has to be reached through the normal obstacle-aware movement planner.
  for (var i = index; i + 1 < nodes.length; i++) {
    if (!nodes[i] || !nodes[i + 1]) continue;
    var a = point(nodes[i], main), b = point(nodes[i + 1], main);
    var dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) continue;
    var progress = ((start.x - a.x) * dx + (start.y - a.y) * dy) / lengthSquared;
    if (progress <= 0) continue;
    progress = Math.min(1, progress);
    var rejoin = { x: a.x + dx * progress, y: a.y + dy * progress };
    var score = distance(start, rejoin);
    if (score + ARRIVAL_EPSILON >= best) continue;
    if (collides && !navigation.grid.segmentClear(start, rejoin, radius)) continue;
    best = score;
    route.nodeIndex = i + 1;
  }
  return route.nodeIndex;
};
// GameCtrl calls once per update; all units then share one collider snapshot.
exports.beginFrame = function (game) {
  var navigation = get(game);
  navigation._refreshPending = true;
  navigation._frameManaged = true;
  navigation._frameId++;
  navigation._frameSearches = 0;
};
exports.get = get;
