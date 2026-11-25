"use strict";
// All positions are in ndMain coordinates. The planner uses actual enabled
// physics shapes, not sprite bounds or the old hand-authored detour markers.
var NavigationGrid = require("NavigationGrid").NavigationGrid;

function point(node, main, offset) {
  if (!offset && node.parent === main) return { x: node.x, y: node.y };
  var p = main.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(offset || { x: 0, y: 0 })));
  return { x: p.x, y: p.y };
}
function distance(a, b) { var x = a.x - b.x, y = a.y - b.y; return Math.sqrt(x * x + y * y); }
function nearestPolygonPoint(start, vertices) {
  var bestX, bestY, bestDistance = Infinity;
  for (var i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    var a = vertices[j], b = vertices[i], dx = b.x - a.x, dy = b.y - a.y;
    var lengthSquared = dx * dx + dy * dy;
    var along = lengthSquared ? Math.max(0, Math.min(1, ((start.x - a.x) * dx + (start.y - a.y) * dy) / lengthSquared)) : 0;
    var x = a.x + along * dx, y = a.y + along * dy;
    var gapX = start.x - x, gapY = start.y - y;
    var gap = gapX * gapX + gapY * gapY;
    if (gap < bestDistance) { bestX = x; bestY = y; bestDistance = gap; }
  }
  return bestDistance < Infinity ? { x: bestX, y: bestY } : null;
}
exports.polygonDistance = function (unit, polygon, game, worldOrigin, localOrigin) {
  var start = worldOrigin || unit.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
  var closest = nearestPolygonPoint(start, polygon);
  if (!closest) return Infinity;
  return distance(localOrigin || point(unit.node, game.ndMain), game.ndMain.convertToNodeSpaceAR(cc.v2(closest)));
};
var ARRIVAL_EPSILON = 0.0001;
function requestPointChanged(a, b) {
  // JSB matrices and physics positions round through Float32. A hundredth
  // of a world unit is query identity noise, never extra terrain clearance.
  return distance(a, b) > (cc.sys && cc.sys.isNative ? .01 : ARRIVAL_EPSILON);
}
function setMainPosition(node, main, position) {
  if (node.parent === main) {
    node.setPosition(position.x, position.y);
    return;
  }
  var world = main.convertToWorldSpaceAR(cc.v2(position));
  var local = node.parent ? node.parent.convertToNodeSpaceAR(world) : world;
  node.setPosition(local.x, local.y);
}
function activeCollider(collider) {
  return collider.enabled && !collider.sensor && collider.node.activeInHierarchy && (!collider.body || collider.body.active !== false);
}
function colliderPoints(collider, authoredPoints) {
  var offset = collider.offset || { x: 0, y: 0 };
  var points;
  if (collider.points) points = authoredPoints || collider.points;
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
function stockColliderQuery() {
  if (typeof cc === "undefined" || !cc.sys || !cc.sys.isNative || cc.ENGINE_VERSION !== "2.4.13" ||
      !cc.Node || !cc._BaseNode || typeof Symbol === "undefined" || !Symbol.hasInstance) return null;
  var query = cc._BaseNode.prototype.getComponentsInChildren;
  if (typeof query !== "function" || cc.Node.prototype.getComponentsInChildren !== query) return null;
  var source = Function.prototype.toString.call(query).replace(/\s+/g, "");
  var body = "getComponentsInChildren(typeOrClassName){varconstructor=getConstructor(typeOrClassName),components=[];if(constructor){findComponents(this,constructor,components);findChildComponents(this._children,constructor,components);}returncomponents;}";
  if (source !== body && source !== "function" + body) return null;
  return query;
}
var nativeColliderQuery = stockColliderQuery();
var standardInstanceOf = typeof Symbol !== "undefined" && Function.prototype[Symbol.hasInstance];
function collectPhysicsShapes(node, base, polygon, box, circle, result) {
  var components = node._components, children = node._children;
  for (var i = 0; i < components.length; i++) {
    var component = components[i];
    if (component instanceof base &&
        (component instanceof polygon || component instanceof box || component instanceof circle)) result.push(component);
  }
  for (var i = 0; i < children.length; i++) collectPhysicsShapes(children[i], base, polygon, box, circle, result);
}
function colliders(node) {
  var base = cc.PhysicsCollider;
  if (base) {
    if (nativeColliderQuery && node instanceof cc.Node && node.getComponentsInChildren === nativeColliderQuery) {
      var polygon = cc.PhysicsPolygonCollider, box = cc.PhysicsBoxCollider, circle = cc.PhysicsCircleCollider;
      if (!base._sealed && polygon && box && circle && standardInstanceOf &&
          base[Symbol.hasInstance] === standardInstanceOf && polygon[Symbol.hasInstance] === standardInstanceOf &&
          box[Symbol.hasInstance] === standardInstanceOf && circle[Symbol.hasInstance] === standardInstanceOf) {
        // The stock query walks the live backing arrays in pre-order. Filter
        // in that walk without building its intermediate PhysicsCollider list.
        var shapes = [];
        collectPhysicsShapes(node, base, polygon, box, circle, shapes);
        return shapes;
      }
    }
    // One subtree traversal collects all body types. Keep trigger/search
    // CircleColliders out even in adapters that share their collider base.
    return node.getComponentsInChildren(base).filter(function (collider) {
      return cc.PhysicsPolygonCollider && collider instanceof cc.PhysicsPolygonCollider || cc.PhysicsBoxCollider && collider instanceof cc.PhysicsBoxCollider || cc.PhysicsCircleCollider && collider instanceof cc.PhysicsCircleCollider;
    });
  }
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
  this._refreshPending = true;
  this._shapeCache = new WeakMap();
  this._shapeStamp = [];
  this._polygons = [];
  this._friendlyPolygons = [];
  this._requests = new Map();
  this._requestUnits = new Set();
  this._activeSearches = new Map();
  this._frameId = 0;
  this.stats = { searches: 0, noPath: 0, revisions: 0, snapshotBuilds: 0, deferred: 0 };
}
function sameShapeStamp(previous, next) {
  if (previous.length !== next.length) return false;
  for (var i = 0; i < next.length; i++) {
    var value = next[i], saved = previous[i];
    if (value === saved) continue;
    // Physics world/local round trips can introduce tiny errors. Compare
    // against the published geometry so genuine subpixel drift accumulates.
    if (typeof value !== "number" || typeof saved !== "number" || !isFinite(value) || !isFinite(saved) ||
        Math.abs(value - saved) > 1e-12 * Math.max(1, Math.abs(value), Math.abs(saved))) return false;
  }
  return true;
}
Navigation.prototype.shape = function (collider, forcedPoints, authoredPoints, roundPoints) {
  var main = this.game.ndMain, stamp = this._shapeStamp, vertices, node = collider.node;
  stamp.length = 0;
  if (forcedPoints) {
    vertices = forcedPoints.map(function (p) { var local = main.convertToNodeSpaceAR(cc.v2(p)); return { x: Math.round(local.x * 1e4) / 1e4, y: Math.round(local.y * 1e4) / 1e4 }; });
    vertices.forEach(function (p) { stamp.push(p.x, p.y); });
  } else {
    for (var ancestor = node; ancestor && ancestor !== main; ancestor = ancestor.parent) {
      stamp.push(ancestor, ancestor.x, ancestor.y, ancestor.scaleX, ancestor.scaleY, ancestor.angle, ancestor.skewX, ancestor.skewY, ancestor.is3DNode);
      if (ancestor.is3DNode) {
        var angles = ancestor.eulerAngles;
        stamp.push(ancestor.z, ancestor.scaleZ, angles.x, angles.y, angles.z);
      }
    }
    var offset = collider.offset || { x: 0, y: 0 };
    var size = collider.size;
    stamp.push(offset.x, offset.y, collider.radius, size && size.width, size && size.height);
    var points = authoredPoints || collider.points;
    if (points) for (var i = 0; i < points.length; i++) stamp.push(points[i].x, points[i].y);
  }
  var cached = this._shapeCache.get(collider);
  if (cached && cached.forced === !!forcedPoints && cached.round === !!roundPoints && sameShapeStamp(cached.stamp, stamp)) return cached.polygon;
  if (!vertices) vertices = colliderPoints(collider, authoredPoints).map(function (p) { return point(node, main, p); });
  if (roundPoints) vertices.forEach(function (p) {
    p.x = Math.round(p.x * 1e4) / 1e4;
    p.y = Math.round(p.y * 1e4) / 1e4;
  });
  this._shapeCache.set(collider, { forced: !!forcedPoints, round: !!roundPoints, stamp: stamp.slice(), polygon: vertices });
  return vertices;
};
Navigation.prototype.refresh = function () {
  if (this._frameManaged && !this._refreshPending && this._snapshotFrame === this._frameId) return;
  var now = Date.now();
  if (this.grid && !this._refreshPending && now < this._nextRefresh) return;
  this._refreshPending = false;
  this._snapshotFrame = this._frameId;
  this._nextRefresh = now + 250;
  // Scratch remains private. A changed scan publishes its arrays to the new
  // grid, where existing movement states can still reference them later.
  var scratch = this._terrainScan || { polygons: [], friendly: [], passages: [], terrain: [], owners: [], friendlyTerrain: [], seen: new Set() };
  var navigation = this, game = this.game, polygons = scratch.polygons, friendly = scratch.friendly, passages = scratch.passages;
  var terrain = scratch.terrain, owners = scratch.owners, friendlyTerrain = scratch.friendlyTerrain, seen = scratch.seen;
  this._terrainScan = null;
  polygons.length = friendly.length = passages.length = terrain.length = owners.length = friendlyTerrain.length = 0;
  seen.clear();
  game.gameData.obstacles.concat(game.gameData.getBulidList()).forEach(function (owner) {
    // Gate wings are sibling nodes referenced as Skeleton components, not
    // descendants of the gate. Their enabled physics shapes still block units.
    var gateShapes = owner.getNavigationGateShapes && owner.getNavigationGateShapes(true);
    for (var i = 0; gateShapes && i < gateShapes.length; i++) {
      var shape = gateShapes[i];
      if (seen.has(shape.collider)) continue;
      seen.add(shape.collider);
      var polygon = navigation.shape(shape.collider, shape.points, shape.localPoints, !!shape.localPoints);
      if (polygon.length >= 3) { polygons.push(polygon); terrain.push(shape.collider); owners.push(owner); passages.push(polygon); }
    }
    var other = owner.ndAniOther;
    var wallPoints = destructibleWall(owner) && owner.colPoint;
    for (var partIndex = -1; partIndex < (other ? other.length : 0); partIndex++) {
      var part = other && other[partIndex];
      var node = partIndex < 0 ? owner.node : part && (part.node || part);
      if (!node || !node.activeInHierarchy) continue;
      var shapes = colliders(node);
      for (var shapeIndex = 0; shapeIndex < shapes.length; shapeIndex++) {
        var collider = shapes[shapeIndex];
        if (seen.has(collider) || !activeCollider(collider)) continue;
        seen.add(collider);
        var body = navigation.shape(collider, null, wallPoints && wallPoints[collider.uuid]);
        if (body.length >= 3) { polygons.push(body); terrain.push(collider); owners.push(owner); friendly.push(body); friendlyTerrain.push(collider); }
      }
    }
  });
  var size = game.mapSize;
  var bounds = { minX: -size.width / 2, minY: -size.height / 2, maxX: size.width / 2, maxY: size.height / 2 };
  var same = this.grid && this.grid.bounds.minX === bounds.minX && this.grid.bounds.minY === bounds.minY && this.grid.bounds.maxX === bounds.maxX && this.grid.bounds.maxY === bounds.maxY;
  same = same && polygons.length === this._polygons.length && friendly.length === this._friendlyPolygons.length &&
    polygons.every(function (p, index) { return p === navigation._polygons[index] && owners[index] === navigation.grid.terrainOwners[index]; }) &&
    friendly.every(function (p, index) { return p === navigation._friendlyPolygons[index]; });
  if (same) this._terrainScan = scratch;
  if (!same) {
    this._requestUnits.forEach(function(unit){cancelRequest(unit);});
    this._activeSearches.forEach(function(active){cancelRequest(active.unit);});
    this._polygons = polygons;
    this._friendlyPolygons = friendly;
    this._friendlyPassages = passages;
    this.grid = new NavigationGrid(polygons, bounds, 20);
    this.grid.terrainColliders = terrain;
    this.grid.terrainOwners = owners;
    this._friendlyTerrain = friendlyTerrain;
    this.friendlyGrid = null;
    this._breachGrid = null;
    this.revision++;
    this.stats.revisions++;
    this.stats.snapshotBuilds++;
  }
};
Navigation.prototype.gridFor = function (unit) {
  this.refresh();
  if (unit.navigationTeam !== "friendly" || unit._automaticEgress && unit._automaticEgress.owner === this && unit._automaticEgress.fullGrid) return this.grid;
  // The upgraded first-map gate has a valid body-width passage between its
  // wings that a 20-unit lattice misses. Keep body clearance; sample more finely.
  // Gate-sized fine searches add safe bridges between ordinary lattice cells.
  // Keep the whole map coarse and preserve the unit's real collision radius.
  if (!this.friendlyGrid) { this.friendlyGrid = new NavigationGrid(this._friendlyPolygons, this.grid.bounds, 16, this._friendlyPassages); this.friendlyGrid.terrainColliders = this._friendlyTerrain; }
  return this.friendlyGrid;
};
function destructibleWall(owner) {
  return owner && owner.getNavigationGateShapes && !owner.isDestroyed && owner.getIsWork && owner.getIsWork();
}
Navigation.prototype.gridThroughWalls = function () {
  if (!this._breachGrid) {
    var owners = this.grid.terrainOwners, polygons = this._polygons.filter(function (_, i) { return !destructibleWall(owners[i]); });
    this._breachGrid = polygons.length === owners.length ? this.grid : new NavigationGrid(polygons, this.grid.bounds, this.grid.cellSize);
  }
  return this._breachGrid;
};
exports.obstructionBetween = function (unit, game, goal, exempt) {
  var navigation = get(game); navigation.refresh();
  var grid = navigation.grid, owners = grid.terrainOwners, start = point(unit.node, game.ndMain);
  var hit = grid.firstObstacle(start, goal, 0, function (i) { return owners[i] !== exempt; });
  return hit ? owners[hit.index] : null;
};
exports.wallBetween = function (game, start, goal) {
  var navigation = get(game); navigation.refresh();
  var grid = navigation.grid, owners = grid.terrainOwners;
  var hit = grid.firstObstacle(start, goal, 0, function (i) { return destructibleWall(owners[i]); });
  return hit ? owners[hit.index] : null;
};
function recordTerrainExit(unit,navigation,grid,start,radius) {
  var candidates=grid._query(start.x-radius,start.y-radius,start.x+radius,start.y+radius),overlap;
  for(var i=0;i<candidates.length;i++){
    var id=candidates[i],collider=grid.terrainColliders&&grid.terrainColliders[id];
    if(collider&&grid._hitsPolygon(start,start,radius,grid.polygons[id].vertices)){
      if(!overlap)overlap=new Map();
      overlap.set(collider,grid.polygons[id].vertices);
    }
  }
  // Capture overlaps before voluntary movement. This exception can never be
  // acquired by attempting to walk into a new wall during the same step.
  unit._terrainExit=overlap?{owner:navigation,revision:navigation.revision,grid:grid,radius:radius,colliders:overlap}:null;
  if(overlap)exports.enableTerrainContacts(unit);
}
exports.enableTerrainContacts=function(unit){
  var body=unit.rigidBody;if(!body)return;body.enabledContactListener=true;
  // Creator 2.4 registers fixtures when they are created. Setting the flag
  // later must also register existing fixtures, without recreating the body.
  var manager=cc.director&&cc.director.getPhysicsManager&&cc.director.getPhysicsManager(),listener=manager&&manager._contactListener,registered=listener&&listener._contactFixtures;
  if(!registered||!manager._registerContactFixture)return;
  colliders(unit.node).forEach(function(collider){if(collider.body&&collider.body!==body)return;(collider._fixtures||[]).forEach(function(fixture){if(registered.indexOf(fixture)<0)manager._registerContactFixture(fixture);});});
};
exports.allowBlockedExit=function(unit,contact,other){
  var exit=unit._terrainExit,vertices=exit&&exit.colliders.get(other);
  if(vertices&&exit.revision===exit.owner.revision){var start=point(unit.node,exit.owner.game.ndMain);if(exit.grid._hitsPolygon(start,start,exit.radius,vertices))contact.disabledOnce=true;else exit.colliders.delete(other);}
};
exports.prepareTerrainExit=function(unit,game,spawn,bodyRadius){
  if(unit.rigidBody&&unit.rigidBody.active===false){unit._terrainExit=null;return;}
  var navigation=get(game),grid=navigation.gridFor(unit),start=point(unit.node,game.ndMain);
  var radius=bodyRadius===undefined?navigation.radius(unit):bodyRadius;
  // Friendly gates are traversable, but a fresh roster member must not park
  // inside their leaf. Use ordinary full-body egress only until it is clear.
  if(spawn&&grid!==navigation.grid&&grid.isWalkable(start,radius)&&!navigation.grid.isWalkable(start,radius)){
    unit._automaticEgress={owner:navigation,goal:{x:start.x,y:start.y},fullGrid:true};grid=navigation.grid;
  }
  recordTerrainExit(unit,navigation,grid,start,radius);
};
exports.moveManual=function(unit,game,localPosition){
  if(unit.rigidBody&&unit.rigidBody.active===false){unit._terrainExit=null;unit.node.setPosition(localPosition);return;}
  var navigation=get(game),grid=navigation.gridFor(unit),radius=navigation.radius(unit),start=point(unit.node,game.ndMain),world=unit.node.parent?unit.node.parent.convertToWorldSpaceAR(localPosition):localPosition,target=game.ndMain.convertToNodeSpaceAR(world);
  recordTerrainExit(unit,navigation,grid,start,radius);
  if(!grid.canExitBlocked(start,target,radius,true)){
    var x={x:target.x,y:start.y},y={x:start.x,y:target.y},canX=distance(start,x)>ARRIVAL_EPSILON&&grid.canExitBlocked(start,x,radius,true),canY=distance(start,y)>ARRIVAL_EPSILON&&grid.canExitBlocked(start,y,radius,true);
    if(canX||canY)target=canX&&(!canY||distance(x,target)<=distance(y,target))?x:y;
    else{var lo=0,hi=1;for(var i=0;i<12;i++){var f=(lo+hi)/2,p={x:start.x+(target.x-start.x)*f,y:start.y+(target.y-start.y)*f};if(grid.canExitBlocked(start,p,radius,true))lo=f;else hi=f;}target={x:start.x+(target.x-start.x)*lo,y:start.y+(target.y-start.y)*lo};}
  }
  setMainPosition(unit.node,game.ndMain,target);
};
function unavailable(unit, frame) {
  return unit._isPooled || unit.isDead && unit.isDead() || unit._hitReactionPlaying || unit._heroKnockback || !unit.node || !cc.isValid(unit.node, true) || unit.node.activeInHierarchy === false || frame - unit._navigationRequestFrame > 2;
}
Navigation.prototype.takeSearchTurn = function (unit, grid) {
  if (unit._navigationRequestOwner && (unit._navigationRequestOwner !== this || unit._navigationRequestGrid !== grid)) cancelRequest(unit);
  if (!this._frameManaged) return true;
  var navigation = this;
  this._activeSearches.forEach(function(active){if(unavailable(active.unit,navigation._frameId))cancelRequest(active.unit);});
  unit._navigationRequestFrame = this._frameId;
  var queue = this._requests.get(grid) || [];
  while (queue.length && unavailable(queue[0],this._frameId)) {
    var first=queue.shift();this._requestUnits.delete(first);first._navigationRequestOwner=null;first._navigationRequestGrid=null;
  }
  if (!this._requestUnits.has(unit)) { this._requestUnits.add(unit); queue.push(unit); unit._navigationRequestOwner=this;unit._navigationRequestGrid=grid; }
  this._requests.set(grid,queue);
  var reserved=0;this._activeSearches.forEach(function(active){if(active.countedFrame!==navigation._frameId)reserved++;});
  if (this._activeSearches.has(grid) || queue[0] !== unit || this._frameSearches + reserved >= 8 || this._frameSearchMillis >= 4) return false;
  queue.shift();this._requestUnits.delete(unit);if(!queue.length)this._requests.delete(grid);
  unit._navigationRequestOwner=null;unit._navigationRequestGrid=null;return true;
};
function cancelRequest(unit) {
  var navigation=unit._navigationRequestOwner;if(!navigation)return;
  var grid=unit._navigationRequestGrid,active=navigation._activeSearches.get(grid);
  if(active&&active.unit===unit){active.job.cancel();navigation._activeSearches.delete(grid);if(unit._navigationState&&unit._navigationState.job===active.job)unit._navigationState=null;}
  navigation._requestUnits.delete(unit);var queue=navigation._requests.get(grid),index=queue?queue.indexOf(unit):-1;
  if(index>=0){queue.splice(index,1);if(!queue.length)navigation._requests.delete(grid);}
  unit._navigationRequestOwner=null;unit._navigationRequestGrid=null;
}
Navigation.prototype.radius = function (unit, includeSleepingBody) {
  if (unit._unitTestRadius) return unit._unitTestRadius;
  // Attack/search CircleColliders are deliberately excluded: they are not bodies.
  var main = this.game.ndMain, node = unit.node, center, radiusSquared = 64;
  var localBody = node.parent === main && !node.is3DNode && !node.skewX && !node.skewY;
  colliders(unit.node).forEach(function (collider) {
    if (!activeCollider(collider)) {
      if (!includeSleepingBody || !collider.enabled || collider.sensor) return;
      // Placement must measure a hidden casualty's future active footprint,
      // while respecting intentionally disabled alternative child branches.
      var branch = collider.node;
      while (branch && branch !== unit.node && branch.active !== false) branch = branch.parent;
      if (branch !== unit.node) return;
    }
    if (localBody && collider.node === node) {
      // Translation and 2D rotation preserve radius in the map's local space.
      var points = collider.points, offset = points && collider.offset;
      var offsetX = offset ? offset.x : 0, offsetY = offset ? offset.y : 0;
      var vertices = points || colliderPoints(collider), scaleX = node.scaleX, scaleY = node.scaleY;
      for (var i = 0; i < vertices.length; i++) {
        var x = (vertices[i].x + offsetX) * scaleX, y = (vertices[i].y + offsetY) * scaleY;
        radiusSquared = Math.max(radiusSquared, x * x + y * y);
      }
    } else {
      if (!center) center = point(node, main);
      colliderPoints(collider).forEach(function (p) {
        var world = point(collider.node, main, p), x = center.x - world.x, y = center.y - world.y;
        radiusSquared = Math.max(radiusSquared, x * x + y * y);
      });
    }
  });
  return Math.ceil((Math.sqrt(radiusSquared) + 2) / 4) * 4;
};
Navigation.prototype.crowdDetour = function (unit, start, target, radius, grid, escapeOnly) {
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
    if (!(escapeOnly ? grid.canExitBlocked(start, candidate, radius, true) : grid.segmentClear(start, candidate, radius))) continue;
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
Navigation.prototype.move = function (unit, target, dt, escapeOnly, breach) {
  if (unit._hitReactionPlaying) {
    if (unit.rigidBody) unit.rigidBody.linearVelocity = cc.Vec2.ZERO;
    return { arrived: false, reached: false, partial: false, blocked: false, directionX: 0, distance: 0 };
  }
  var start = point(unit.node, this.game.ndMain);
  var speed = unit.getSpeed(), step = Math.max(0, speed * dt);
  var destination = target, state;
  // Also clear velocity on blocked/finished routes, before any early return.
  if (unit.rigidBody) unit.rigidBody.linearVelocity = cc.Vec2.ZERO;
  // Some unit types intentionally cross buildings with their physics disabled.
  if (unit._unitTestRadius || !unit.rigidBody || unit.rigidBody.active !== false) {
    var solid = this.gridFor(unit), grid = breach ? this.gridThroughWalls() : solid;
    var radius = unit._unitTestRadius || this.radius(unit);
    var startWalkable;
    state = unit._navigationState;
    // Let a bounded in-flight query finish when its moving target advances.
    // Restarting it on every target update can starve pursuit indefinitely.
    var changed = !state || state.owner !== this || state.grid !== grid || state.revision !== this.revision || state.radius !== radius || state.escapeOnly !== !!escapeOnly || (state.job ? distance(state.start, start) > 20 : distance(state.target, target) > 20);
    if (!changed && !state.points && !state.job) changed = requestPointChanged(state.start, start) || requestPointChanged(state.target, target);
    if (!changed && state.points) {
      if (state.index >= state.points.length) {
        changed = requestPointChanged(state.target, target) || requestPointChanged(start, state.goal);
      } else {
        var clearNext = grid.segmentClear(start, state.points[state.index], radius);
        startWalkable = clearNext || grid.isWalkable(start, radius);
        if (startWalkable) {
          // Crowd contacts can push a body past its cached escape/corner anchor.
          // Keep moving forward when the next segment has full body clearance.
          var previousIndex = state.index;
          while (state.index + 1 < state.points.length && grid.segmentClear(start, state.points[state.index + 1], radius)) state.index++;
          changed = !clearNext && state.index === previousIndex;
        } else {
          changed = !grid.canExitBlocked(start, state.points[state.index], radius);
        }
      }
    }
    var goal = changed ? { x: target.x, y: target.y } : null;
    var direct = !!goal && !escapeOnly && grid.segmentClear(start, goal, radius);
    // A clear start on the solid grid cannot have a terrain overlap to exit.
    if (grid === solid && (startWalkable || direct)) unit._terrainExit = null;
    else recordTerrainExit(unit, this, solid, start, radius);
    if (changed) {
      // Directly clear routes should continue even if another actor is using
      // this grid's incremental search budget.
      var reuse = !direct && state && state.owner === this && state.revision !== this.revision && state.breach === !!breach && state.exact &&
        !state.escape && !state.escapeOnly && !escapeOnly && state.points && state.index < state.points.length &&
        state.radius === radius && !requestPointChanged(state.target, goal) && grid.segmentClear(start, state.points[state.index], radius);
      if (direct || reuse || state && state.job) cancelRequest(unit);
      if (reuse) {
        // Later segments are still checked before moving along them.
        state.grid = grid;
        state.revision = this.revision;
        startWalkable = true;
      } else if (direct) {
        state = unit._navigationState = { owner: this, grid: grid, start: start, revision: this.revision, radius: radius, escapeOnly: false, breach: !!breach,
          target: goal, points: [goal], goal: goal, exact: true, partial: false, escape: null, index: 0 };
        startWalkable = true;
      } else if (!this.takeSearchTurn(unit, grid)) {
        this.stats.deferred++;
        return { arrived: false, reached: false, blocked: false, deferred: true, directionX: 0 };
      } else {
        this._frameSearches = (this._frameSearches || 0) + 1;
        // Enemies advance to a reachable frontier so a distant intact wall can
        // enter their normal acquisition range. Exact-goal callers still fail
        // cleanly; a frontier never counts as completing an authored waypoint.
        var incremental = this._frameManaged && typeof grid.createSearch === "function";
        var path = incremental ? null : grid.findPath(start, goal, radius, unit.navigationTeam === "enemy", !!escapeOnly);
        this.stats.searches++;
        if (!incremental && !path) this.stats.noPath++;
        // An immutable scene cannot yield a different answer for an unchanged
        // failed request. Retry when geometry, target or unit position changes.
        state = unit._navigationState = { owner: this, grid: grid, start: start, revision: this.revision, radius: radius, escapeOnly: !!escapeOnly, breach: !!breach, target: goal, points: path && path.points, goal: path && path.goal, exact: !!(path && path.reached), partial: !!(path && path.partial), escape: path && path.escape, index: 0 };
        if (incremental) {
          state.job = grid.createSearch(start, goal, radius, unit.navigationTeam === "enemy", !!escapeOnly);
          this._activeSearches.set(grid, { unit: unit, job: state.job, frame: -1, countedFrame: this._frameId });
          unit._navigationRequestOwner = this; unit._navigationRequestGrid = grid;
        }
      }
    }
    if (state.job) {
      var activeSearch = this._activeSearches.get(grid), job = state.job;
      unit._navigationRequestFrame = this._frameId;
      if (activeSearch && activeSearch.countedFrame !== this._frameId) {
        if (this._frameSearches >= 8) { this.stats.deferred++; return { arrived:false,reached:false,blocked:false,deferred:true,pending:true,directionX:0 }; }
          this._frameSearches++; activeSearch.countedFrame = this._frameId;
      }
      var grids = new Set();this._activeSearches.forEach(function(_,key){grids.add(key);});this._requests.forEach(function(_,key){grids.add(key);});
      var remaining = Math.min(4096-(this._frameSearchWork||0),Math.ceil(4096/Math.max(1,grids.size))-(this._frameSearchWorkByGrid.get(grid)||0)),milliseconds=4-(this._frameSearchMillis||0);
      if (activeSearch && activeSearch.frame !== this._frameId && remaining > 0 && milliseconds > 0) {
        activeSearch.frame = this._frameId;
        var sliceStart=Date.now();job.step(remaining, Math.min(2, milliseconds));this._frameSearchMillis=(this._frameSearchMillis||0)+Math.max(0,Date.now()-sliceStart);
        this._frameSearchWork = (this._frameSearchWork || 0) + job.lastWork;this._frameSearchWorkByGrid.set(grid,(this._frameSearchWorkByGrid.get(grid)||0)+job.lastWork);
      }
      if (!job.done) {
        this.stats.deferred++;
        return { arrived: false, reached: false, blocked: false, deferred: true, pending: true, directionX: 0 };
      }
      var completed = job.result;
      this._activeSearches.delete(grid);unit._navigationRequestOwner=null;unit._navigationRequestGrid=null;
      job.cancel(); state.job = null;
      state.points = completed && completed.points; state.goal = completed && completed.goal;
      state.exact = !!(completed && completed.reached); state.partial = !!(completed && completed.partial); state.escape = completed && completed.escape;
      if (!completed && (requestPointChanged(state.start, start) || requestPointChanged(state.target, target))) {
        // A stale failed query is not evidence that the current pursuit is
        // unreachable. Let the next bounded query use the new inputs.
        exports.reset(unit); this.stats.deferred++;
        return { arrived: false, reached: false, blocked: false, deferred: true, directionX: 0 };
      }
      if (!completed) this.stats.noPath++;
      // Physics may have nudged a waiting actor. Reconnect only over a clear
      // segment (or its original controlled escape), never across a new wall.
      if (state.points) {
        var safe = false;
        startWalkable = grid.isWalkable(start, radius);
        if (startWalkable) {
          while (state.index + 1 < state.points.length && grid.segmentClear(start, state.points[state.index + 1], radius)) state.index++;
          safe = state.index >= state.points.length || grid.segmentClear(start, state.points[state.index], radius);
        } else safe = state.index >= state.points.length || grid.canExitBlocked(start, state.points[state.index], radius);
        if (!safe) { exports.reset(unit); return { arrived: false, reached: false, blocked: false, deferred: true, directionX: 0 }; }
      }
    }
    if (!state.points) return { arrived: false, reached: false, blocked: true, directionX: 0 };
    while (state.index < state.points.length && distance(start, state.points[state.index]) <= ARRIVAL_EPSILON) state.index++;
    if (state.index >= state.points.length) {
      var currentGoal = !requestPointChanged(state.target, target);
      return { arrived: currentGoal, reached: currentGoal && state.exact, partial: state.partial, blocked: false, directionX: 0, distance: 0 };
    }
    destination = state.points[state.index];
  } else { cancelRequest(unit); unit._navigationState = null; unit._navigationProgress = null; }
  var detouring = false, progress = unit._navigationProgress;
  if (state && step > 0 && (escapeOnly || (startWalkable === undefined ? grid.isWalkable(start, radius) : startWalkable))) {
    if (!progress || progress.owner !== this || progress.revision !== this.revision || distance(progress.target, target) > 20) {
      progress = unit._navigationProgress = { owner: this, revision: this.revision, target: { x: target.x, y: target.y }, point: start, elapsed: 0 };
    }
    if (distance(progress.point, start) >= Math.max(2, Math.min(8, speed * .05))) { progress.point = start; progress.elapsed = 0; }
    else progress.elapsed += Math.min(Math.max(dt, 0), .1);
    if (progress.detour) {
      progress.remaining -= dt;
      if (progress.remaining <= 0 || !(escapeOnly ? grid.canExitBlocked(start, progress.detour, radius, true) : grid.segmentClear(start, progress.detour, radius))) progress.detour = null;
    }
    if (progress.elapsed >= .75) {
      progress.elapsed = 0;
      progress.detour = this.crowdDetour(unit, start, destination, radius, grid, escapeOnly);
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
  if (breach && state && grid !== solid && travel > 0) {
    // The route can plan through a wall, but walking stops on its near side.
    var owners = solid.terrainOwners;
    var hit = solid.firstObstacle(start, next, radius, function (i) { return destructibleWall(owners[i]); });
    if (hit) {
      var advance = Math.max(0, travel * (hit.fraction - 1 / 65536) - .01);
      var nearSide = { x: start.x + (destination.x - start.x) * advance / length,
        y: start.y + (destination.y - start.y) * advance / length };
      if (advance && solid.segmentClear(start, nearSide, radius)) setMainPosition(unit.node, this.game.ndMain, nearSide);
      return { blockingWall: owners[hit.index], arrived: false, directionX: destination.x - start.x };
    }
  }
  setMainPosition(unit.node, this.game.ndMain, next);
  var arrived = travel === length;
  if (state && arrived && !detouring) state.index++;
  if (detouring && arrived) progress.detour = null;
  var finished = !detouring && (state ? state.index >= state.points.length : arrived);
  // Small target movement is coalesced while travelling, but the old endpoint
  // must never be reported as arrival at a target that has since moved.
  if (finished && state && requestPointChanged(state.target, target)) finished = false;
  return { arrived: finished, reached: finished && (!state || state.exact), partial: !!(state && state.partial), blocked: false, directionX: destination.x - start.x, distance: travel };
};
function get(game) {
  if (!game._navigation || game._navigation.game !== game) game._navigation = new Navigation(game);
  return game._navigation;
}
exports.moveTo = function (unit, game, target, dt, breach) { return get(game).move(unit, target, dt, false, breach); };
function recoveryBuildings(navigation, grid) {
  if (navigation._recoveryBuildingSource === grid) return navigation._recoveryBuildingGrid;
  var shapes = new Set(), polygons = [];
  navigation.game.gameData.getBulidList().forEach(function (owner) {
    (owner.getNavigationGateShapes ? owner.getNavigationGateShapes(true) : []).forEach(function (shape) { shapes.add(shape.collider); });
    [owner.node].concat((owner.ndAniOther || []).map(function (part) { return part && (part.node || part); })).forEach(function (node) {
      if (node) colliders(node).forEach(function (collider) { shapes.add(collider); });
    });
  });
  (grid.terrainColliders || []).forEach(function (collider, index) { if (shapes.has(collider)) polygons.push(grid.polygons[index].vertices); });
  navigation._recoveryBuildingSource = grid;
  navigation._recoveryBuildingGrid = polygons.length ? new NavigationGrid(polygons, grid.bounds, grid.cellSize) : null;
  return navigation._recoveryBuildingGrid;
}
// Ordinary path retries and crowd yielding run first. If a moving enemy has
// made no physical progress for five gameplay seconds, recover to nearby free
// ground with a clear continuation to its route. Never alter HP or wave counts.
exports.recoverStranded = function (unit, game, dt) {
  var state=unit._navigationState,target=unit._targetSearchCache&&unit._targetSearchCache.target;
  if (!(dt>0) || unit._hitReactionPlaying || target&&target.canAtt || state&&state.job || unit._navigationRequestOwner) { unit._enemyStall=null; return false; }
  var speed=unit.getSpeed();
  if (!(speed>0)) { unit._enemyStall=null; return false; }
  var navigation=get(game);
  navigation.refresh();
  var start=point(unit.node,game.ndMain),record=unit._enemyStall;
  var generation=unit.node._combatGeneration;
  if (!record || record.owner!==navigation || record.revision!==navigation.revision || record.generation!==generation) {
    unit._enemyStall={owner:navigation,revision:navigation.revision,generation:generation,point:start,elapsed:0};return false;
  }
  if (distance(record.point,start)>=Math.max(.001,Math.min(8,speed*.25))) {
    record.point=start; record.elapsed=0; return false;
  }
  record.elapsed+=Math.min(dt,.1);
  if (record.elapsed<5 || navigation._strandedRecoveryFrame===navigation._frameId) return false;
  navigation._strandedRecoveryFrame=navigation._frameId;
  var grid=navigation.gridFor(unit);
  // Body measurement scans the collider subtree and transforms its vertices.
  // Ordinary movement already measures it; only repeat that work when this
  // five-second watchdog is actually going to search for a recovery position.
  var radius=unit._unitTestRadius||navigation.radius(unit),anchors=[],bounds=grid.bounds,margin=radius+.01;
  function anchor(value) {
    if(!value||!isFinite(value.x)||!isFinite(value.y))return;
    var p={x:Math.max(bounds.minX+margin,Math.min(bounds.maxX-margin,value.x)),y:Math.max(bounds.minY+margin,Math.min(bounds.maxY-margin,value.y))};
    if(grid.isWalkable(p,radius))anchors.push(p);
  }
  // A partial route ends at an unreachable frontier. Reconnecting to that
  // endpoint only repeats the same stall; recovery needs a forward continuation.
  if(state&&!state.partial){if(state.points)state.points.slice(state.index,state.index+8).forEach(anchor);anchor(state.goal);}
  var route=unit.bornInfo;
  // An active pursuit retains its own prepared path, rather than jumping away
  // from a live combat target to a different authored route segment.
  if(!(target&&target.tag)&&route&&route.pathList)route.pathList.slice(route.nodeIndex,route.nodeIndex+8).forEach(function(node){if(node&&cc.isValid(node,true))anchor(point(node,game.ndMain));});
  var buildings=recoveryBuildings(navigation,grid);
  // Every candidate needs a clear segment to a continuation point.
  if (!anchors.length) {
    record.elapsed = 3;
    return false;
  }
  var actors=game.gameData.getEnemyList().concat(game.gameData.getSoldierList(),[game.ctrPlay]),occupied=[];
  actors.forEach(function(other){if(other!==unit&&other&&other.node&&other.node.activeInHierarchy!==false&&!other._isPooled&&(!other.isDead||!other.isDead()))occupied.push({point:point(other.node,game.ndMain),radius:navigation.radius(other)});});
  function safe(p) {
    return distance(start,p)>=Math.max(16,radius*2)&&grid.isWalkable(p,radius)&&
      (!buildings||buildings.canExitBlocked(start,p,radius,true))&&
      anchors.some(function(a){return distance(p,a)>1&&grid.segmentClear(p,a,radius);})&&
      occupied.every(function(other){return distance(p,other.point)>radius+other.radius+2;});
  }
  var step = Math.max(24, radius * 2 + 4), firstAnchor = anchors[0];
  var angle = Math.atan2(firstAnchor.y - start.y, firstAnchor.x - start.x), candidate = null;
  for(var ring=1;ring<=8&&!candidate;ring++)for(var turn=0;turn<16;turn++) {
    var direction=angle+turn*Math.PI/8,p={x:start.x+Math.cos(direction)*step*ring,y:start.y+Math.sin(direction)*step*ring};
    if(safe(p)){candidate=p;break;}
  }
  // A spawn can be isolated beyond the local rings. Authored forward points
  // provide a final route-owned search area, still requiring body clearance.
  for(var index=0;index<anchors.length&&!candidate;index++)for(var turn=0;turn<16;turn++) {
    var a=anchors[index],p={x:a.x+Math.cos(turn*Math.PI/8)*step,y:a.y+Math.sin(turn*Math.PI/8)*step};
    if(safe(p)){candidate=p;break;}
  }
  if(!candidate){record.elapsed=3;return false;}
  exports.reset(unit);
  setMainPosition(unit.node,game.ndMain,candidate);
  if(unit.rigidBody&&unit.rigidBody.syncPosition)unit.rigidBody.syncPosition(true);
  unit._targetSearchCache=null;unit._routeInterrupted=true;
  unit._navigationRecoveries=(unit._navigationRecoveries||0)+1;
  return true;
};
// A new building footprint can cover a resting unit without giving it a move
// order. Temporarily walk out at ordinary speed, then resume the original order.
exports.recoverBlocked = function (unit, game, dt) {
  if (unit.rigidBody && unit.rigidBody.active === false) { unit._automaticEgress = null; return null; }
  var navigation = get(game), grid = navigation.gridFor(unit), radius = navigation.radius(unit);
  var start = point(unit.node, game.ndMain), recovery = unit._automaticEgress;
  if (unit._standingNavigationOwner !== navigation || unit._standingNavigationRevision !== navigation.revision) {
    var recoveredPost = unit._standingGoal && unit._standingGoal.terrainRecovery && unit._standingGoal.order === unit.rallyPoint;
    if (unit._standingNavigationOwner) { unit._standingGoal = null; unit._settledPoint = null; }
    unit._standingNavigationOwner = navigation; unit._standingNavigationRevision = navigation.revision;
    // A later growth frame or unrelated building invalidates the old geometry,
    // but must not send a safe recovered unit back toward its obstructed post.
    if (recoveredPost && !unit.isAgg && unit.rallyPoint && grid.isWalkable(start, radius) && !grid.isWalkable(unit.rallyPoint.pos, radius)) {
      unit._standingGoal = { pos: { x: start.x, y: start.y }, terrainRecovery: true, order: unit.rallyPoint };
      unit._settledPoint = { x: start.x, y: start.y };
    }
  }
  if (grid.isWalkable(start, radius)) {
    if (recovery) {
      exports.reset(unit);
      // Keep an obstructed authored post intact. This temporary nearby post is
      // discarded by a new command or geometry revision; it is never saved.
      if (!unit.isAgg && unit.rallyPoint && !grid.isWalkable(unit.rallyPoint.pos, radius)) {
        unit._standingGoal = { pos: { x: start.x, y: start.y }, terrainRecovery: true, order: unit.rallyPoint };
        unit._settledPoint = { x: start.x, y: start.y };
      }
    }
    return null;
  }
  if (!recovery || recovery.owner !== navigation) {
    exports.reset(unit);
    recovery = unit._automaticEgress = { owner: navigation, goal: { x: start.x, y: start.y } };
  }
  return navigation.move(unit, recovery.goal, dt, true);
};
// A revived/reloaded soldier can start outside a building while its saved post
// remains inside it. Only the completed, non-frontier projected path may rest.
exports.projectedStandingPoint = function (unit, game, target) {
  if (unit.navigationTeam !== "friendly") return null;
  var navigation = get(game), grid = navigation.gridFor(unit), state = unit._navigationState;
  if (!state || state.owner !== navigation || state.grid !== grid || state.revision !== navigation.revision || state.job || state.escapeOnly ||
      !state.points || !state.points.length || state.index < state.points.length || state.exact || state.partial ||
      !state.target || requestPointChanged(state.target, target) || !state.goal) return null;
  var start = point(unit.node, game.ndMain), radius = navigation.radius(unit);
  if (requestPointChanged(start, state.goal) || grid.isWalkable(target, radius) || !grid.isWalkable(start, radius)) return null;
  return start;
};
exports.positionOf = function (node, game) { return point(node, game.ndMain); };
exports.attackPartsOf = function (building) {
  if(building.getAttackTargetParts)return building.getAttackTargetParts();
  return building.getWposPhyCol2?building.getWposPhyCol2():building.getWposPhyCol().map(function(points){return{tagNode:building.node,points:points};});
};
var attackFootprints = new WeakMap();
function localAttackFootprint(main, polygon, shared) {
  var prototype = cc.Node && cc.Node.prototype;
  if (shared && prototype && main.getWorldMatrix === prototype.getWorldMatrix &&
      main.convertToNodeSpaceAR === prototype.convertToNodeSpaceAR &&
      typeof main.getWorldMatrix === "function" && typeof cc.Mat4 === "function" &&
      !(cc.PrivateNode && main instanceof cc.PrivateNode)) {
    var scope = attackFootprints.get(main);
    if (!scope) {
      scope = { world: new cc.Mat4(), stamp: null, polygons: new WeakMap() };
      attackFootprints.set(main, scope);
    }
    // All enemies can share the current frame's published building footprint.
    // A camera or scene callback can still move Main before another query.
    main.getWorldMatrix(scope.world);
    var matrix = scope.world.m;
    if (matrix && matrix.length === 16) {
      var index = 0, stamp = scope.stamp;
      if (stamp) while (index < 16 && matrix[index] === stamp[index]) index++;
      if (index !== 16) {
        scope.stamp = matrix.slice();
        scope.polygons = new WeakMap();
      }
      var saved = scope.polygons.get(polygon);
      if (!saved) {
        saved = polygon.map(function (vertex) { return main.convertToNodeSpaceAR(vertex); });
        scope.polygons.set(polygon, saved);
      }
      return saved;
    }
  }
  return polygon.map(function (vertex) {
    return main.convertToNodeSpaceAR(vertex);
  });
}
function polygonAttackPoint(start, polygon, main, shared) {
  return nearestPolygonPoint(start, localAttackFootprint(main, polygon, shared));
}
exports.attackPointOf = function (target, game, origin, polygon) {
  var main = game.ndMain;
  if (origin && destructibleWall(target)) {
    if (polygon) return polygonAttackPoint(origin, polygon, main);
    var closest = null, best = Infinity;
    exports.attackPartsOf(target).forEach(function (part) {
      var candidate = polygonAttackPoint(origin, part.points, main);
      if (!candidate) return;
      var length = distance(origin, candidate);
      if (length < best) { closest = candidate; best = length; }
    });
    if (closest) return closest;
  }
  return point(target.node, main);
};
exports.findStandingPoint = function (unit, game, anchor, preferred) {
  var navigation = get(game); navigation.refresh();
  // Every candidate below requires a clear segment from this exact anchor.
  // A blocked origin cannot produce one; avoid repeating the full crowd/ring
  // scan on each waiting soldier update. Keep zero-radius passage semantics.
  if (!navigation.grid.isWalkable(anchor, 0)) return null;
  var radius = Math.max(unit._spawnBodyRadius || 0, navigation.radius(unit));
  var grid = navigation.gridFor(unit), reserved = [];
  game.gameData.getSoldierList().concat(game.gameData.getEnemyList(), [game.ctrPlay]).forEach(function (other) {
    if (other === unit || !other || !other.node || !other.node.activeInHierarchy || other._isPooled || other.isDead && other.isDead()) return;
    var clearance = radius + Math.max(other._spawnBodyRadius || 0, navigation.radius(other)) + 4;
    reserved.push({ pos: point(other.node, game.ndMain), clearance: clearance });
    if (!other.isAgg && other._standingGoal) reserved.push({ pos: other._standingGoal.pos, clearance: clearance });
  });
  function clear(candidate) {
    if (!grid.isWalkable(candidate, radius) || !navigation.grid.segmentClear(anchor, candidate, 0)) return false;
    return reserved.every(function (other) { return distance(candidate, other.pos) >= other.clearance; });
  }
  if (preferred && clear(preferred)) return { x: preferred.x, y: preferred.y };
  if (clear(anchor)) return { x: anchor.x, y: anchor.y };
  var start = point(unit.node, game.ndMain), angle = Math.atan2(start.y - anchor.y, start.x - anchor.x), spacing = radius * 2 + 6;
  for (var ring = 1; ring <= 8; ring++) for (var index = 0; index < ring * 6; index++) {
    var direction = angle + 2 * Math.PI * index / (ring * 6);
    var candidate = { x: anchor.x + Math.cos(direction) * ring * spacing, y: anchor.y + Math.sin(direction) * ring * spacing };
    if (clear(candidate)) return candidate;
  }
  return null;
};
exports.canStopFollowing = function (unit, game, target) {
  var navigation = get(game); navigation.refresh();
  var start = point(unit.node, game.ndMain);
  // A clear center-line does not mean the body's standing position is safe.
  // Contacts and newly constructed walls can overlap an otherwise settled unit.
  return navigation.gridFor(unit).isWalkable(start, navigation.radius(unit)) && navigation.grid.segmentClear(start, target, 0);
};
exports.attackPositionOf = function (selection, unit, game) {
  var polygon = selection.polygon;
  if (!polygon || polygon.length < 2) return point(selection.tag, game.ndMain);
  var main = game.ndMain, start = point(unit.node, main);
  // Building origins can lie behind adjoining cliffs or wall pieces. Approach
  // the same polygon used by combat range checks instead; the planner projects
  // this boundary goal outward by the unit's real physics clearance.
  var closest = polygonAttackPoint(start, polygon, main, selection.sharedFootprint) || point(selection.tag, main);
  if (destructibleWall(selection.building) || selection.breachRoute) {
    // Give short-range siege units a precise standing point outside the face.
    // Lattice projection alone can stop a body a full cell away from the wall.
    var navigation = get(game), solid = navigation.gridFor(unit);
    var grid = selection.breachRoute ? navigation.gridThroughWalls() : solid;
    var radius = navigation.radius(unit), length = distance(start, closest);
    if (length > radius) {
      var fraction = (radius + .05) / length;
      var nearSide = { x: closest.x + (start.x - closest.x) * fraction, y: closest.y + (start.y - closest.y) * fraction };
      if (grid.isWalkable(nearSide, radius)) return nearSide;
    }
  }
  return closest;
};
exports.reset = function (unit) {
  cancelRequest(unit);
  unit._navigationState = null;
  unit._navigationProgress = null;
  unit._enemyStall = null;
  unit._terrainExit = null;
  unit._automaticEgress = null;
  unit._standingNavigationOwner = null;
  unit._standingNavigationRevision = null;
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
  var collides = unit._unitTestRadius || !unit.rigidBody || unit.rigidBody.active !== false;
  if (collides) { navigation.refresh(); radius = unit._unitTestRadius || navigation.radius(unit); }
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
exports.invalidate = function (game) {
  if (game._navigation) game._navigation._refreshPending = true;
};
// GameCtrl calls once per update; all units then share one collider snapshot.
exports.beginFrame = function (game) {
  var navigation = get(game);
  navigation._refreshPending = true;
  navigation._frameManaged = true;
  navigation._frameId++;
  navigation._frameSearches = 0;
  navigation._frameSearchWork = 0;
  navigation._frameSearchMillis=0;navigation._frameSearchWorkByGrid=new Map();
};
exports.get = get;
