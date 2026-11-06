"use strict";
// All positions are in ndMain coordinates. The planner uses actual enabled
// physics shapes, not sprite bounds or the old hand-authored detour markers.
var NavigationGrid = require("NavigationGrid").NavigationGrid;

function point(node, main, offset) {
  var p = main.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(offset || { x: 0, y: 0 })));
  return { x: p.x, y: p.y };
}
function distance(a, b) { var x = a.x - b.x, y = a.y - b.y; return Math.sqrt(x * x + y * y); }
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
  this.stats = { searches: 0, noPath: 0, revisions: 0 };
}
Navigation.prototype.refresh = function () {
  var now = Date.now();
  if (this.grid && !this._refreshPending && now < this._nextRefresh) return;
  this._refreshPending = false;
  this._nextRefresh = now + 250;
  var game = this.game, main = game.ndMain, polygons = [], seen = new Set();
  game.gameData.obstacles.concat(game.gameData.getBulidList()).forEach(function (owner) {
    // Gate wings are sibling nodes referenced as Skeleton components, not
    // descendants of the gate. Their enabled physics shapes still block units.
    var nodes = [owner.node].concat((owner.ndAniOther || []).map(function (part) { return part && (part.node || part); }));
    nodes.forEach(function (node) {
      if (!node || !node.activeInHierarchy) return;
      colliders(node).forEach(function (collider) {
        if (seen.has(collider) || !activeCollider(collider)) return;
        seen.add(collider);
        var polygon = colliderPoints(collider).map(function (p) { return point(collider.node, main, p); });
        if (polygon.length >= 3) polygons.push(polygon);
      });
    });
  });
  var size = game.mapSize;
  var bounds = { minX: -size.width / 2, minY: -size.height / 2, maxX: size.width / 2, maxY: size.height / 2 };
  var signature = JSON.stringify([bounds, polygons]);
  if (!this.grid || signature !== this._signature) {
    this._signature = signature;
    this.grid = new NavigationGrid(polygons, bounds, 20);
    this.revision++;
    this.stats.revisions++;
  }
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
Navigation.prototype.move = function (unit, target, dt) {
  var start = point(unit.node, this.game.ndMain);
  var step = Math.max(0, unit.getSpeed() * dt);
  var now = Date.now(), destination = target, state;
  // Also clear velocity on blocked/finished routes, before any early return.
  if (unit.rigidBody) unit.rigidBody.linearVelocity = cc.Vec2.ZERO;
  // Some unit types intentionally cross buildings with their physics disabled.
  if (!unit.rigidBody || unit.rigidBody.active !== false) {
    this.refresh();
    var radius = this.radius(unit);
    state = unit._navigationState;
    var changed = !state || state.owner !== this || state.revision !== this.revision || state.radius !== radius || distance(state.target, target) > 20;
    if (!changed && state.points) {
      if (state.index >= state.points.length) {
        changed = distance(state.target, target) > ARRIVAL_EPSILON || distance(start, state.goal) > ARRIVAL_EPSILON;
      } else if (this.grid.isWalkable(start, radius)) {
        changed = !this.grid.segmentClear(start, state.points[state.index], radius);
      } else {
        changed = state.index !== 0 || !onEscape(start, state.escape);
      }
    }
    if (changed || !state.points && now >= state.retryAt) {
      var path = this.grid.findPath(start, target, radius);
      this.stats.searches++;
      if (!path) this.stats.noPath++;
      state = unit._navigationState = { owner: this, revision: this.revision, radius: radius, target: { x: target.x, y: target.y }, points: path && path.points, goal: path && path.goal, exact: !!(path && path.reached), escape: path && path.escape, index: 0, retryAt: now + 800 };
    }
    if (!state.points) return { arrived: false, reached: false, blocked: true, directionX: 0 };
    while (state.index < state.points.length && distance(start, state.points[state.index]) <= ARRIVAL_EPSILON) state.index++;
    if (state.index >= state.points.length) return { arrived: true, reached: state.exact, blocked: false, directionX: 0 };
    destination = state.points[state.index];
  } else unit._navigationState = null;
  var length = distance(start, destination);
  var travel = Math.min(step, length);
  var next = length > 0 ? { x: start.x + (destination.x - start.x) * travel / length, y: start.y + (destination.y - start.y) * travel / length } : start;
  setMainPosition(unit.node, this.game.ndMain, next);
  var arrived = travel === length;
  if (state && arrived) state.index++;
  var finished = state ? state.index >= state.points.length : arrived;
  // Small target movement is coalesced while travelling, but the old endpoint
  // must never be reported as arrival at a target that has since moved.
  if (state && distance(state.target, target) > ARRIVAL_EPSILON) finished = false;
  return { arrived: finished, reached: finished && (!state || state.exact), blocked: false, directionX: destination.x - start.x };
};
function get(game) {
  if (!game._navigation || game._navigation.game !== game) game._navigation = new Navigation(game);
  return game._navigation;
}
exports.moveTo = function (unit, game, target, dt) { return get(game).move(unit, target, dt); };
exports.positionOf = function (node, game) { return point(node, game.ndMain); };
exports.attackPositionOf = function (selection, unit, game) {
  var polygon = selection.polygon;
  if (!polygon || polygon.length < 2) return point(selection.tag, game.ndMain);
  var main = game.ndMain, start = point(unit.node, main), best = null, bestDistance = Infinity;
  // Building origins can lie behind adjoining cliffs or wall pieces. Approach
  // the same polygon used by combat range checks instead; the planner projects
  // this boundary goal outward by the unit's real physics clearance.
  var vertices = polygon.map(function (p) {
    var local = main.convertToNodeSpaceAR(cc.v2(p));
    return { x: local.x, y: local.y };
  });
  for (var i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    var a = vertices[j], b = vertices[i], dx = b.x - a.x, dy = b.y - a.y;
    var lengthSquared = dx * dx + dy * dy;
    var along = lengthSquared ? Math.max(0, Math.min(1, ((start.x - a.x) * dx + (start.y - a.y) * dy) / lengthSquared)) : 0;
    var candidate = { x: a.x + along * dx, y: a.y + along * dy };
    var length = distance(start, candidate);
    if (length < bestDistance) { best = candidate; bestDistance = length; }
  }
  return best || point(selection.tag, main);
};
exports.reset = function (unit) {
  unit._navigationState = null;
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
exports.beginFrame = function (game) { if (game._navigation) game._navigation._refreshPending = true; };
exports.get = get;
