"use strict";

// The native inventory is unordered. Reconstruct the order of the live
// component tree used by the stock capture scope, including sibling order.
// The first set bit after a complete path marks its next child rank. Prefix
// ranks are ordered and leave zero padding so parents sort before descendants.
var CAPTURE_KEY_BITS = 52;
var CAPTURE_PACKED_RANKS = 1024;
var captureRankBits = new Uint8Array(CAPTURE_PACKED_RANKS);
var captureRankCode = new Uint32Array(CAPTURE_PACKED_RANKS);
var capturePowers = new Float64Array(CAPTURE_KEY_BITS + 1);
capturePowers[0] = 1;
for (var bit = 1; bit <= CAPTURE_KEY_BITS; bit++) capturePowers[bit] = capturePowers[bit - 1] * 2;
for (var rank = 0, bin = 1, ex = 0; rank < CAPTURE_PACKED_RANKS; rank++) {
  if (rank + 1 === bin * 2) {
    bin *= 2;
    ex++;
  }
  captureRankBits[rank] = 2 * ex + 2;
  captureRankCode[rank] = (2 * bin - 1) * (2 * bin) + rank + 1 - bin;
}
var captureArrayConcat = Array.prototype.concat;

function captureRanks(path) {
  if (path.ranks) return path.ranks;
  var ranks = new Array(path.depth), current = path;
  for (var i = ranks.length - 1; i >= 0; i--) {
    ranks[i] = current.rank;
    current = current.parent;
  }
  path.ranks = ranks;
  return ranks;
}

function appendCaptureRank(parent, rank) {
  var depth = parent.depth + 1, used = -1, value = 0, ranks = null;
  if (parent.legacy || !Number.isInteger(rank) || Array.prototype.concat !== captureArrayConcat) {
    // Preserve concat's original handling of unusual externally supplied rank
    // values. Ordinary Scene child indices never take this branch.
    ranks = captureRanks(parent).concat(rank);
    return { parent: parent, rank: rank, depth: depth, used: used, value: value, ranks: ranks, legacy: true };
  }
  if (parent.used >= 0 && rank < CAPTURE_PACKED_RANKS) {
    var width = parent.used + captureRankBits[rank];
    if (width <= CAPTURE_KEY_BITS) {
      used = width;
      value = parent.value + captureRankCode[rank] * capturePowers[CAPTURE_KEY_BITS - width];
    }
  }
  return { parent: parent, rank: rank, depth: depth, used: used, value: value, ranks: ranks, legacy: false };
}

function compareCapturePath(a, b) {
  var left = a.path, right = b.path;
  if (left.used >= 0 && right.used >= 0) return left.value - right.value || a.index - b.index;
  var aa = captureRanks(left), bb = captureRanks(right);
  var length = Math.min(aa.length, bb.length);
  for (var i = 0; i < length; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length || a.index - b.index;
}

exports.collect = function (scene, nativeRenderers, Node, Skeleton, childRanks, cacheMode) {
  if (!scene || !Array.isArray(nativeRenderers) || !Node || !Node.prototype ||
      !Skeleton || typeof Node.prototype.getComponents !== "function") return null;
  var getComponents = Node.prototype.getComponents;
  var paths = new Map(), seen = new Set(), entries = [];
  paths.set(scene, { parent: null, rank: 0, depth: 0, used: 0, value: 0, ranks: [], legacy: false });

  function nodePath(node, remaining) {
    var existing = paths.get(node);
    if (existing) return existing;
    if (!node) return null;
    if (!remaining) throw new Error("Capture ancestry exceeds the supported depth");
    var parent = node.parent;
    if (!parent || node.activeInHierarchy === false) return null;
    if (node.getComponents !== getComponents) throw new Error("Unsupported capture component query");
    var parentPath = nodePath(parent, remaining - 1);
    if (!parentPath) return null;
    var children = parent.children;
    if (!Array.isArray(children)) throw new Error("Unsupported capture children");
    var saved = childRanks.get(node);
    var index = saved && saved.parent === parent && children[saved.index] === node ? saved.index : children.indexOf(node);
    if (index < 0) throw new Error("Unlinked capture node");
    if (!saved || saved.parent !== parent || saved.index !== index) childRanks.set(node, { parent: parent, index: index });
    var path = appendCaptureRank(parentPath, index);
    paths.set(node, path);
    return path;
  }

  try {
    if (scene.getComponents !== getComponents) return null;
    for (var i = 0; i < nativeRenderers.length; i++) {
      var native = nativeRenderers[i];
      if (!native || typeof native !== "object") return null;
      var component = native._comp;
      // Native lifetime includes renderers that have not been bound yet and
      // renderers replaced by a different cache mode on the same component.
      if (!component || component._nativeSkeleton !== native) continue;
      if (seen.has(component)) return null;
      seen.add(component);
      if (component.enabled === false) continue;
      var node = component.node, path = nodePath(node, 128);
      if (!path) continue;
      if (!(node instanceof Node) || node.getComponents !== getComponents ||
          !Object.prototype.hasOwnProperty.call(node, "_components") || !Array.isArray(node._components)) return null;
      if (Skeleton._sealed ? component.constructor !== Skeleton : !(component instanceof Skeleton)) continue;
      if (component.isAnimationCached !== cacheMode) return null;
      var componentIndex = node._components.indexOf(component);
      if (componentIndex < 0) return null;
      entries.push({ path: path, index: componentIndex, component: component });
    }
  } catch (error) {
    return null;
  }

  entries.sort(compareCapturePath);
  return entries.map(function (entry) { return entry.component; });
};
