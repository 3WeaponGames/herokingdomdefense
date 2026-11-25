"use strict";

// Only generated terrain with a closed, stock tree can share exact candidate
// geometry across draws. Dynamic objects still run through the original scan.
var Node = cc.Node, Sprite = cc.Sprite, Scene = cc.Scene;
var nodeKeys = ["parent", "children", "activeInHierarchy", "is3DNode", "width", "height", "anchorX", "anchorY",
  "x", "y", "scaleX", "scaleY", "angle", "skewX", "skewY", "getWorldMatrix", "_updateWorldMatrix",
  "convertToWorldSpaceAR", "convertToNodeSpaceAR"];
var spriteKeys = ["enabled", "spriteFrame", "trim", "skeletonData"];
var stockNodes = descriptors(Node, nodeKeys), stockSprites = descriptors(Sprite, spriteKeys);
var localizedFrameSetter;

function descriptor(prototype, key) {
  for (; prototype; prototype = Object.getPrototypeOf(prototype)) {
    var item = Object.getOwnPropertyDescriptor(prototype, key);
    if (item) return item;
  }
}

function descriptors(Type, keys) {
  return keys.map(function (key) { return descriptor(Type && Type.prototype, key); });
}

function sameDescriptor(a, b) {
  return a && b ? a.get === b.get && a.set === b.set && a.value === b.value &&
    a.writable === b.writable && a.configurable === b.configurable && a.enumerable === b.enumerable : a === b;
}

function localizedSpriteFrame(actual, stock) {
  var marker = Object.getOwnPropertyDescriptor(Sprite.prototype, "_localizationInstalled");
  if (!marker || marker.value !== true || marker.writable || marker.configurable || !actual || !stock ||
      actual.get !== stock.get || actual.enumerable !== stock.enumerable || typeof actual.set !== "function") return false;
  if (actual.set === localizedFrameSetter) return true;
  var code = Function.prototype.toString.call(actual.set).replace(/\s+/g, "");
  if (!/^function(?:set)?\(value\)\{descriptor\.set\.call\(this,value\);if\(!this\._localizationWriting\)\{this\._localizedOriginalFrame=value;self\.refreshSprite\(this\);\}\}$/.test(code)) return false;
  localizedFrameSetter = actual.set;
  return true;
}

function stockSurface() {
  if (Node !== cc.Node || Sprite !== cc.Sprite || Scene !== cc.Scene) return false;
  for (var i = 0; i < nodeKeys.length; i++) {
    if (!sameDescriptor(descriptor(Node.prototype, nodeKeys[i]), stockNodes[i])) return false;
  }
  for (var j = 0; j < spriteKeys.length; j++) {
    var key = spriteKeys[j], item = descriptor(Sprite.prototype, key);
    if (!sameDescriptor(item, stockSprites[j]) &&
        !(key === "spriteFrame" && localizedSpriteFrame(item, stockSprites[j]))) return false;
  }
  return true;
}

function noOwnOverrides(object, keys) {
  return keys.every(function (key) { return !Object.prototype.hasOwnProperty.call(object, key); });
}

function plainNode(node) {
  return node && Object.getPrototypeOf(node) === Node.prototype && !node.is3DNode &&
    noOwnOverrides(node, nodeKeys) && ArrayBuffer.isView(node._trs) && node._trs.length === 10 &&
    node._contentSize && node._anchorPoint;
}

function ancestorPath(main, scene) {
  var nodes = [];
  for (var node = main; node && nodes.length < 16; node = node._parent) {
    nodes.push(node);
    if (node === scene) {
      return Scene && Object.getPrototypeOf(scene) === Scene.prototype && !scene._parent &&
        scene.getWorldMatrix === Node.prototype.getWorldMatrix &&
        scene._updateWorldMatrix === Node.prototype._updateWorldMatrix ? nodes : null;
    }
    if (!plainNode(node)) return null;
  }
  return null;
}

function hasDataFields(object, keys) {
  return keys.every(function (key) {
    var slot = Object.getOwnPropertyDescriptor(object, key);
    return !slot || Object.prototype.hasOwnProperty.call(slot, "value");
  });
}

var terrainFields = ["node", "artwork", "ground", "objectLayerOrder"];
var nodeDepthFields = ["_depthMapObject", "_depthMapFlat", "_depthGround", "_depthGroundVisual",
  "_depthBuilding", "_depthBuildingOwner"];

function terrainTree(view, object, source, Terrain, Obstacle) {
  var root = object.node, main = view.main;
  if (object.buildings || !plainNode(root) || root._parent !== main ||
      !hasDataFields(root, nodeDepthFields) || root._depthMapObject !== true ||
      root._depthBuilding || root._depthBuildingOwner || !Array.isArray(root._components)) return null;
  var layer = root._components.find(function (component) {
    return component && Object.getPrototypeOf(component) === Terrain.prototype;
  });
  if (!layer || !hasDataFields(layer, terrainFields) || layer.node !== root || !layer.artwork ||
      !layer.ground || layer.ground !== root._depthGround || !Number.isFinite(layer.objectLayerOrder) ||
      layer.objectLayerOrder < 0 || !source || Object.getPrototypeOf(source) !== Sprite.prototype ||
      !hasDataFields(source, ["node"]) || !noOwnOverrides(source, spriteKeys) ||
      source.trim !== true || source.enabled !== true || !source.node) return null;

  var saved = view._sceneryShapes && view._sceneryShapes.get(root);
  if (!saved || !saved.stamps || saved.stamps.length !== 1 || saved.stamps[0][0] !== source) return null;

  var nodes = [root], components = [], seen = new Set(nodes), foundSprite = false;
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (nodes.length > 24 || !plainNode(node) || !hasDataFields(node, nodeDepthFields) ||
        !Array.isArray(node._components) || !Array.isArray(node.children)) return null;
    for (var component of node._components) {
      if ((component === source && node === source.node && !foundSprite) ||
          (node === root && (component === layer ||
            (Obstacle && component && Object.getPrototypeOf(component) === Obstacle.prototype)))) {
        if (component === source) foundSprite = true;
        components.push(component);
      } else return null;
    }
    for (var child of node.children) {
      if (!child || child._parent !== node || seen.has(child)) return null;
      seen.add(child);
      nodes.push(child);
    }
  }
  if (!foundSprite || !seen.has(layer.ground) || !seen.has(layer.artwork) ||
      source.node.activeInHierarchy !== true || source.node._depthGroundVisual) return null;
  for (var node = source.node; node && seen.has(node); node = node._parent) {
    if (node === layer.artwork) return nodes.concat(components);
  }
  return null;
}

var cellSize = 256, maxCell = 1048576, cellStride = 2097153;

function cellsFor(box) {
  if (!box) return null;
  var left = Math.floor(box.minX / cellSize), right = Math.floor(box.maxX / cellSize),
    bottom = Math.floor(box.minY / cellSize), top = Math.floor(box.maxY / cellSize);
  return left >= -maxCell && left <= right && right <= maxCell &&
    bottom >= -maxCell && bottom <= top && top <= maxCell ? [left, right, bottom, top] : null;
}

function scanCells(range, visit) {
  for (var y = range[2]; y <= range[3]; y++) {
    for (var x = range[0]; x <= range[1]; x++) visit(x * cellStride + y);
  }
}

function cellCount(range) {
  return (range[1] - range[0] + 1) * (range[3] - range[2] + 1);
}

function candidateIndex(rows) {
  var cells = new Map(), large = [];
  rows.forEach(function (row, id) {
    var range = cellsFor(row.box);
    if (!range || cellCount(range) > 16) { large.push(id); return; }
    scanCells(range, function (key) {
      var ids = cells.get(key);
      if (!ids) cells.set(key, ids = []);
      ids.push(id);
    });
  });
  return { rows: rows, cells: cells, large: large, seen: new Float64Array(rows.length), serial: 0, selected: [] };
}

function originalOrder(a, b) { return a.order - b.order; }

function visibleRows(index, visible, overlaps) {
  var selected = index.selected, range = cellsFor(visible);
  selected.length = 0;
  if (!range || cellCount(range) > 128) {
    for (var row of index.rows) if (!visible || overlaps(row.box, visible)) selected.push(row);
    return selected;
  }

  var serial = ++index.serial;
  function take(id) {
    if (index.seen[id] === serial) return;
    index.seen[id] = serial;
    var row = index.rows[id];
    if (overlaps(row.box, visible)) selected.push(row);
  }
  index.large.forEach(take);
  scanCells(range, function (key) {
    var ids = index.cells.get(key);
    if (ids) ids.forEach(take);
  });
  selected.sort(originalOrder);
  return selected;
}

function copyBox(box) {
  return { minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY };
}

function cleanMatrix(node) {
  var words = node._worldMatrix && node._worldMatrix.m;
  if (node._worldMatDirty !== false || !(words instanceof Float32Array) || words.length !== 16 ||
      words[2] !== 0 || words[3] !== 0 || words[6] !== 0 || words[7] !== 0 ||
      words[8] !== 0 || words[9] !== 0 || words[10] !== 1 || words[11] !== 0 || words[14] !== 0 || words[15] !== 1) return null;
  return words;
}

function matchesBasis(words, stamp, offset) {
  return words && stamp && words[0] === stamp[offset] && words[1] === stamp[offset + 1] &&
    words[4] === stamp[offset + 2] && words[5] === stamp[offset + 3] &&
    words[12] === stamp[offset + 4] && words[13] === stamp[offset + 5];
}

function snapshotBasis(words) {
  if (!words) return null;
  var basis = [words[0], words[1], words[4], words[5], words[12], words[13]];
  return basis.every(Number.isFinite) ? basis : null;
}

function numericRowsAgree(current) {
  // A stock GetWorldMatrix visits parents first. A dirty ancestor can
  // invalidate an apparently clean descendant's words during the read.
  for (var i = 0; i < current.matrixAncestors.length; i++) {
    if (current.matrixAncestors[i]._worldMatDirty !== false) return false;
  }
  if (!matchesBasis(cleanMatrix(current.main), current.basis, 0)) return false;
  var rows = current.index.rows;
  for (var j = 0; j < rows.length; j++) {
    var row = rows[j], ground = cleanMatrix(row.anchor);
    if (!matchesBasis(cleanMatrix(row.source.node), row.stamp, 4) || !ground ||
        ground[12] !== row.anchorX || ground[13] !== row.anchorY) return false;
  }
  return true;
}

function pushCandidate(candidate, candidates, byObject) {
  if (candidate) {
    candidates.push(candidate);
    byObject.set(candidate.object, candidate);
  }
}

function bridge() {
  var api = cc._hkdTerrainGeometry;
  return cc.sys && cc.sys.isNative && cc.sys.os === cc.sys.OS_WINDOWS && cc.ENGINE_VERSION === "2.4.13" &&
    api && api.version === 1 && typeof api.track === "function" && typeof api.release === "function" ? api : null;
}

function create(view, stockCandidate, point, overlaps) {
  var api = bridge();
  if (!api || typeof Node !== "function" || typeof Sprite !== "function" || typeof Scene !== "function") return null;

  var state = null, busy = false, disposed = false, draw = 0, nextSeed = 0;
  function release() {
    if (!state) return;
    var old = state;
    state = null;
    api.release(old.ticket, old.members);
  }
  function samePass(old) {
    return !disposed && !view._destroyed && old.ticket.value === old.generation &&
      old.main === view.main && old.game === view.game && old.data === view.game.gameData && old.epoch === view.game._combatEpoch &&
      old.objects === view.objects && old.length === old.objects.length && old.scene === cc.director.getScene();
  }

  function seed(cache, visible, candidates, byObject) {
    var scene = cc.director.getScene(), main = view.main, game = view.game;
    var ancestors = ancestorPath(main, scene), classById = cc.js && cc.js._getClassById;
    if (!ancestors || !classById) return false;
    var Terrain = classById("483a8ja4YhO8bI7DXBqLOcH") || classById("483a88da-e188-4ef1-b23b-0d706a2ce707");
    var Obstacle = classById("18fdaVPwQRBIrhl5kY8QMeg") || classById("18fda54f-c104-4122-b865-e6463c40c7a0");
    if (typeof Terrain !== "function") return false;

    var objects = view.objects, length = objects.length, seen = new Set(), shared = new Set();
    var members = new Set(ancestors), owners = new Map(), dynamic = [], rows = [];
    objects.forEach(function (object) {
      object.sources.forEach(function (source) {
        if (seen.has(source)) shared.add(source);
        seen.add(source);
      });
    });
    objects.forEach(function (object, order) {
      var source = object.sources[0], tree = object.sources.length === 1 && !shared.has(source) &&
        terrainTree(view, object, source, Terrain, Obstacle);
      if (!tree) return;
      tree.forEach(function (member) { members.add(member); });
      owners.set(order, source);
    });
    if (!owners.size) return false;

    var tracked = Array.from(members), ticket = api.track(tracked, ancestors);
    if (!ticket) return false;
    var pending = { main: main, scene: scene, game: game, data: game.gameData, epoch: game._combatEpoch,
      objects: objects, length: length, members: tracked, ticket: ticket, generation: ticket.value, dynamic: dynamic };
    try {
      // Publish the real stock result for each row during enrollment.
      objects.forEach(function (object, order) {
        var source = owners.get(order), row = null;
        if (source && pending.ticket.value === pending.generation && !cache.bounds.has(source)) {
          row = { order: order, object: object, source: source, anchor: object.node._depthGround, box: null, ground: null };
        } else dynamic.push(order);
        var candidate = stockCandidate(view, object, cache, visible, row);
        pushCandidate(candidate, candidates, byObject);
        if (row) {
          var receipt = view._staticOcclusionBounds && view._staticOcclusionBounds.get(row.source);
          if (row.box && receipt && receipt.box === row.box) {
            row.stamp = receipt.stamp;
            row.box = copyBox(row.box);
            if (candidate) row.ground = candidate.ground;
            rows.push(row);
          } else dynamic.push(order);
        }
      });

      // A culled row never needs ground in the original loop. Settle its
      // retained value after stock callbacks, using only private scratch.
      if (samePass(pending)) {
        var scratch = {};
        rows.forEach(function (row) {
          if (row.ground === null) {
            var node = row.object.node;
            row.ground = point(node._depthGround || node, main, 0, 0, scratch).y;
          }
        });
      }
      if (samePass(pending)) {
        var mainWords = cleanMatrix(main);
        pending.basis = snapshotBasis(mainWords);
        if (pending.basis) {
          // The native Float32 matrices can settle without an authored
          // transform setter. Keep only the numeric route that produced the
          // original Sprite bounds on the current Main basis.
          var matrixAncestors = new Set(ancestors);
          var stable = rows.filter(function (row) {
            var ground = cleanMatrix(row.anchor);
            if (ground && Number.isFinite(ground[12]) && Number.isFinite(ground[13]) &&
                matchesBasis(mainWords, row.stamp, 10) && matchesBasis(cleanMatrix(row.source.node), row.stamp, 4)) {
              row.anchorX = ground[12];
              row.anchorY = ground[13];
              for (var node = row.source.node._parent; node && node !== main && !matrixAncestors.has(node); node = node._parent) {
                matrixAncestors.add(node);
              }
              for (var node = row.anchor._parent; node && node !== main && !matrixAncestors.has(node); node = node._parent) {
                matrixAncestors.add(node);
              }
              return true;
            }
            dynamic.push(row.order);
            return false;
          });
          if (stable.length) {
            dynamic.sort(function (a, b) { return a - b; });
            pending.matrixAncestors = Array.from(matrixAncestors);
            pending.index = candidateIndex(stable);
            if (numericRowsAgree(pending)) state = pending;
          }
        }
      }
      return true;
    } finally {
      if (state !== pending) api.release(ticket, tracked);
    }
  }

  function serve(cache, visible, candidates, byObject) {
    var current = state, selected = visibleRows(current.index, visible, overlaps), dynamic = current.dynamic;
    var next = 0, i = 0, j = 0;
    while (i < selected.length || j < dynamic.length) {
      var row = selected[i], order = dynamic[j];
      if (j >= dynamic.length || (row && row.order < order)) {
        if (cache.bounds.has(row.source)) break;
        cache.bounds.set(row.source, row.box);
        pushCandidate({ object: row.object, box: row.box, ground: row.ground, hidden: [] }, candidates, byObject);
        next = row.order + 1;
        i++;
      } else {
        pushCandidate(stockCandidate(view, current.objects[order], cache, visible), candidates, byObject);
        next = order + 1;
        j++;
        if (!samePass(current)) break;
      }
    }
    if (i === selected.length && j === dynamic.length && samePass(current)) return true;

    // A stock callback may mutate a later row. Resume at its original
    // position and keep all effects already completed in this draw.
    release();
    for (; next < current.length; next++) {
      if (next in current.objects) {
        pushCandidate(stockCandidate(view, current.objects[next], cache, visible), candidates, byObject);
      }
    }
    return true;
  }

  return {
    painter: function () {
      var current = state;
      if (busy || !current || !samePass(current) || api !== bridge() || !stockSurface() || !numericRowsAgree(current)) return null;
      if (!current.painter) {
        var rows = new Map();
        current.index.rows.forEach(function (row) {
          rows.set(row.object.node, { anchor: row.anchor, ground: undefined, shape: undefined });
        });
        current.painter = function (owner, anchor) {
          if (busy || state !== current || view._destroyed || current.ticket.value !== current.generation ||
              current.main !== view.main || current.objects !== view.objects || current.game !== view.game ||
              current.data !== view.game.gameData || current.epoch !== view.game._combatEpoch) return null;
          var row = rows.get(owner);
          return row && row.anchor === (anchor === undefined ? owner._depthGround : anchor) ? row : null;
        };
      }
      return current.painter;
    },
    collect: function (cache, visible, candidates, byObject) {
      if (busy || disposed || view._destroyed || api !== bridge()) return false;
      draw++;
      if (state && (!samePass(state) || !numericRowsAgree(state))) release();
      if (!state && draw < nextSeed) return false;
      busy = true;
      try {
        if (!stockSurface()) { release(); nextSeed = draw + 16; return false; }
        if (state) return serve(cache, visible, candidates, byObject);
        nextSeed = draw + 16;
        return seed(cache, visible, candidates, byObject);
      } finally {
        busy = false;
      }
    },
    dispose: function () { disposed = true; release(); }
  };
}

exports.create = create;
