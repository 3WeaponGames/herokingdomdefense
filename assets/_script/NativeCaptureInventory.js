"use strict";

// The native inventory is unordered. Reconstruct the order of the live
// component tree used by the stock capture scope, including sibling order.
exports.collect = function (scene, nativeRenderers, Node, Skeleton, childRanks, cacheMode) {
  if (!scene || !Array.isArray(nativeRenderers) || !Node || !Node.prototype ||
      !Skeleton || typeof Node.prototype.getComponents !== "function") return null;
  var getComponents = Node.prototype.getComponents;
  var paths = new Map(), seen = new Set(), entries = [];
  paths.set(scene, []);

  function nodePath(node, remaining) {
    if (paths.has(node)) return paths.get(node);
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
    var path = parentPath.concat(index);
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

  entries.sort(function (a, b) {
    var length = Math.min(a.path.length, b.path.length);
    for (var i = 0; i < length; i++) if (a.path[i] !== b.path[i]) return a.path[i] - b.path[i];
    return a.path.length - b.path.length || a.index - b.index;
  });
  return entries.map(function (entry) { return entry.component; });
};
