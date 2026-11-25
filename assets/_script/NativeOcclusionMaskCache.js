"use strict";

// Creator 2.4.13 feeds generated masks back into the render-data queue after
// every camera. Disjoint captures can carry a clean mask to the next draw.
// Cache the unchanged native boolean assignments on the normal path as well.
var masks = new WeakMap(), assemblers = new WeakMap();
var MASK_KEYS = ["setMaskInverted", "setUseModel", "setImageStencil"];
var GRAPHICS_KEYS = ["setUseModel"];
var captureUpdates;

function supported() {
  return typeof cc !== "undefined" && cc.sys && cc.sys.isNative && cc.ENGINE_VERSION === "2.4.13";
}
function generated(mask) {
  return !!mask && !!cc.Mask && mask instanceof cc.Mask && !!mask.node && mask.node._occlusionMask === true &&
    (!cc.isValid || cc.isValid(mask, true) && cc.isValid(mask.node, true));
}
function owns(record, receiver) {
  var mask = record.mask, owner = record.owner, assembler = record.assembler;
  return !record.retired && receiver === assembler && generated(mask) && owner._assembler === assembler &&
    assembler._renderComp === owner && (owner === mask || mask._graphics === owner);
}
function mapBranch(root, main) {
  for (var node = root, depth = 0; node && node !== main && depth < 64; node = node._parent, depth++) {
    if (node._parent === main) return node;
  }
  return null;
}
function groupedQueue() {
  var queue = cc.RenderFlow && cc.RenderFlow._hkdMaskQueue;
  return queue && typeof queue.invalidate === "function" ? queue : null;
}
function beginCaptureUpdates(view) {
  if (!supported() || captureUpdates || !view.camera || !view.camera._camera) return null;
  var flow = cc.RenderFlow, original = flow && flow.render;
  var update = cc.Assembler && cc.Assembler.prototype._updateRenderData;
  if (typeof original !== "function" || typeof update !== "function" || !flow.FLAG_UPDATE_RENDER_DATA) return null;
  var source = Function.prototype.toString.call(original);
  if (source.indexOf("RenderFlow.validateRenderers()") < 0 || source.indexOf("assembler._updateRenderData()") < 0 ||
      source.indexOf("this._nativeFlow.render(scene._proxy, dt, camera)") < 0) return null;
  var queue = groupedQueue();
  var scope = { main: view.main, camera: view.camera, branch: null, running: false, update: update };
  function render(root, delta, camera) {
    var previous = scope.branch, running = scope.running, earlierQueue = queue && queue.scope;
    // A mask is outside this draw only if it belongs to a different map branch.
    // An atlas or full-scene root can still traverse the mask before GPU culling.
    scope.branch = !running && this === flow && delta === 0 && camera === scope.camera._camera &&
      scope.camera.targetTexture ? mapBranch(root, scope.main) : null;
    scope.running = true;
    if (queue) queue.scope = scope.branch ? scope : null;
    try { return original.apply(this, arguments); }
    finally {
      if (queue) queue.scope = earlierQueue;
      scope.running = running;
      scope.branch = previous;
    }
  }
  try { flow.render = render; } catch (_) { return null; }
  if (flow.render !== render) return null;
  captureUpdates = scope;
  return function finish() {
    if (captureUpdates === scope) captureUpdates = null;
    if (flow.render === render) flow.render = original;
  };
}
function stopObserving(record) {
  var watched = record.maskObservers;
  if (!watched) return;
  watched.forEach(function (entry) {
    var current = Object.getOwnPropertyDescriptor(entry.target, entry.key);
    if (current && current.configurable && (entry.setter ? current.set : current.value) === entry.wrapper) delete entry.target[entry.key];
  });
  record.maskObservers = null;
}
function observeGroupedMask(record, queue) {
  var mask = record.mask, watched = record.maskObservers = [];
  function changed(exposesMaterial) {
    if (record.retired) return;
    queue.invalidate(mask.node);
    if (exposesMaterial) record.materialExposed = true;
  }
  function method(target, key, exposesMaterial) {
    var original = target[key];
    if (typeof original !== "function" || Object.prototype.hasOwnProperty.call(target, key)) return false;
    function wrapper() {
      if (this === target) changed(exposesMaterial);
      return original.apply(this, arguments);
    }
    Object.defineProperty(target, key, { value: wrapper, writable: true, configurable: true });
    watched.push({ target: target, key: key, wrapper: wrapper });
    return true;
  }
  function accessor(key, exposesMaterial) {
    if (Object.prototype.hasOwnProperty.call(mask, key)) return false;
    var p = Object.getPrototypeOf(mask), descriptor;
    while (p && !(descriptor = Object.getOwnPropertyDescriptor(p, key))) p = Object.getPrototypeOf(p);
    if (!descriptor || !descriptor.get || !descriptor.set) return false;
    function set(value) {
      if (this === mask) changed(false);
      return descriptor.set.call(this, value);
    }
    function get() {
      if (this === mask) changed(true);
      return descriptor.get.call(this);
    }
    Object.defineProperty(mask, key, { get: exposesMaterial ? get : descriptor.get, set: set, configurable: true });
    watched.push({ target: mask, key: key, wrapper: set, setter: true });
    return true;
  }
  try {
    // These generated masks own their material. Once a caller obtains it,
    // direct edits can bypass Mask setters, so keep that mask on per-entry preparation.
    // The parent hook runs before child-added/removed events that may draw another camera.
    if (method(mask.node, "_onSetParent", false) &&
        method(mask, "_updateMaterial", false) && method(mask, "_resetAssembler", false) &&
        method(mask, "getMaterial", true) && method(mask, "getMaterials", true) &&
        accessor("inverted", false) && accessor("materials", true)) return true;
  } catch (_) {} // A customized mask can still use the existing per-entry path.
  stopObserving(record);
  return false;
}
function stableMaskData(mask, assembler) {
  var materials = mask._materials, material = materials && materials[0];
  var frame = mask._spriteFrame, texture = frame && frame._texture;
  var effect = material && material.effect, clear = mask._clearMaterial;
  var clearAssembler = mask._clearGraphics && mask._clearGraphics._assembler;
  return texture instanceof cc.RenderTexture && texture.packable === false && materials && materials.length === 1 &&
    effect && effect._dirty === false && assembler._effect && assembler._effect[0] === effect &&
    clear && clear.effect && clearAssembler && clearAssembler._effect && clearAssembler._effect[0] === clear.effect;
}
function deferUpdate(record) {
  var assembler = record.assembler;
  var key = "_updateRenderData", original = assembler[key];
  if (!cc.Assembler || original !== cc.Assembler.prototype[key] || typeof original !== "function" ||
      Object.prototype.hasOwnProperty.call(assembler, key)) return;
  function eligible() {
    var scope = captureUpdates, mask = record.mask;
    if (scope && scope.branch && scope.update === original && mask &&
        assembler._renderComp === mask && mask._assembler === assembler && mask.isValid &&
        mask._type === cc.Mask.Type.IMAGE_STENCIL && !mask._vertsDirty && !mask.inverted &&
        mask.alphaThreshold === .1) {
      var node = mask.node;
      if (node && node._parent === scope.main && node !== scope.branch && node._renderComponent === mask &&
          node._occlusionMask && (node.name === "ForegroundOcclusion" || node.name === "ObjectOcclusion") && stableMaskData(mask, assembler)) {
        return true;
      }
    }
    return false;
  }
  function wrapper() {
    if (this === assembler && eligible()) {
      // RenderFlow already consumed the bit. Requeue through the original
      // setter so the next observing camera rebuilds the mask in stock order.
      record.mask.node._renderFlag |= cc.RenderFlow.FLAG_UPDATE_RENDER_DATA;
      return;
    }
    return original.apply(this, arguments);
  }
  try {
    Object.defineProperty(assembler, key, { value: wrapper, writable: true, configurable: true });
    record.methods.push({ key: key, wrapper: wrapper });
    var queue = groupedQueue();
    var mask = record.mask;
    if (queue && Object.getPrototypeOf(mask) === cc.Mask.prototype &&
        (mask.node.name === "ForegroundOcclusion" || mask.node.name === "ObjectOcclusion") && observeGroupedMask(record, queue)) {
      record.queue = queue;
      wrapper._hkdCarryDirtyMask = function () { return !record.materialExposed && eligible(); };
    }
  } catch (_) {}
}
function release(record) {
  if (!record || record.retired) return;
  record.retired = true;
  if (record.queue) record.queue.invalidate(record.mask.node);
  stopObserving(record);
  record.methods.forEach(function (method) {
    // Do not overwrite instrumentation or another consumer installed later.
    if (record.assembler[method.key] !== method.wrapper) return;
    try {
      if (method.descriptor) Object.defineProperty(record.assembler, method.key, method.descriptor);
      else delete record.assembler[method.key];
    } catch (_) {}
  });
  if (assemblers.get(record.assembler) === record) assemblers.delete(record.assembler);
  // A concurrent wrapper can still hold ours after restoration. It must retain
  // neither a retired Mask nor its private Graphics component through the pool.
  record.mask = record.owner = null;
}
function attach(mask, owner, keys) {
  var assembler = owner && owner._assembler;
  if (!assembler || assembler._renderComp !== owner) return null;
  release(assemblers.get(assembler));
  var record = { mask: mask, owner: owner, assembler: assembler, methods: [], retired: false };
  assemblers.set(assembler, record);
  keys.forEach(function (key) {
    var descriptor = Object.getOwnPropertyDescriptor(assembler, key);
    if (descriptor && !Object.prototype.hasOwnProperty.call(descriptor, "value")) return;
    var original = assembler[key];
    if (typeof original !== "function") return;
    var known = false, last;
    function wrapper(value) {
      if (!supported() || !owns(record, this) || arguments.length !== 1 || typeof value !== "boolean") {
        known = false;
        return original.apply(this, arguments);
      }
      if (known && last === value) return;
      var result = original.call(this, value);
      // A throwing native call must never make the first successful write look
      // redundant. These three C++ setters return void and only assign a bool.
      last = value; known = true;
      return result;
    }
    try {
      if (descriptor) {
        var replacement = {};
        Object.keys(descriptor).forEach(function (name) { replacement[name] = descriptor[name]; });
        replacement.value = wrapper;
        Object.defineProperty(assembler, key, replacement);
      } else Object.defineProperty(assembler, key, { value: wrapper, writable: true, configurable: true });
      record.methods.push({ key: key, wrapper: wrapper, descriptor: descriptor });
    } catch (_) {} // Unknown/locked native bindings retain the engine path.
  });
  if (owner === mask && typeof cc.RenderTexture === "function" && cc.Mask.Type) deferUpdate(record);
  return record;
}
function refresh(record, mask, owner, keys) {
  if (record && !record.retired && record.owner === owner && record.assembler === (owner && owner._assembler) && record.assembler._renderComp === owner) return record;
  release(record);
  return attach(mask, owner, keys);
}
function dispose(mask) {
  var state = mask && masks.get(mask);
  if (!state) return;
  masks.delete(mask);
  release(state.mask); release(state.graphics);
}
function sync(mask) {
  if (!supported() || !generated(mask)) { dispose(mask); return; }
  var state = masks.get(mask);
  if (!state) { state = {}; masks.set(mask, state); }
  state.mask = refresh(state.mask, mask, mask, MASK_KEYS);
  state.graphics = refresh(state.graphics, mask, mask._graphics, GRAPHICS_KEYS);
}

exports.sync = sync;
exports.dispose = dispose;
exports.beginCaptureUpdates = beginCaptureUpdates;
