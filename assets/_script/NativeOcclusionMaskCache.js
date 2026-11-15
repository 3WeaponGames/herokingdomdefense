"use strict";

// Creator 2.4.13 repeats these pure native boolean assignments for every camera
// render. Keep geometry, materials and render-data updates on their engine path;
// only generated occlusion Mask instances can skip an unchanged assignment.
var masks = new WeakMap(), assemblers = new WeakMap();
var MASK_KEYS = ["setMaskInverted", "setUseModel", "setImageStencil"];
var GRAPHICS_KEYS = ["setUseModel"];

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
function release(record) {
  if (!record || record.retired) return;
  record.retired = true;
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
