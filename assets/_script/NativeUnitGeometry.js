"use strict";
// Actor attachment geometry is shared by native skins. Cache only intrinsic
// vectors; animation matrices, slot deforms and all visibility stay live.
var epoch = 0, installed = null, disabled = false;
function invalidate() { epoch++; }
function retire() { disabled = true; invalidate(); return null; }
function descriptor(object, key) {
  while (object) {
    var own = Object.getOwnPropertyDescriptor(object, key);
    if (own) return { owner: object, descriptor: own };
    object = Object.getPrototypeOf(object);
  }
  return null;
}
function same(a, b) {
  if (!a || !b) return a === b;
  return a.value === b.value && a.get === b.get && a.set === b.set &&
    a.configurable === b.configurable && a.enumerable === b.enumerable && a.writable === b.writable;
}
function nativeRuntime() {
  return !!(typeof cc !== "undefined" && cc.sys && cc.sys.isNative && cc.ENGINE_VERSION === "2.4.13" &&
    typeof spine !== "undefined" && typeof sp !== "undefined" && sp.Skeleton);
}
function nativeFunction(value) {
  return typeof value === "function" && /\[native code\]/.test(Function.prototype.toString.call(value));
}
function transparent(original) {
  return function () {
    invalidate();
    try { return original.apply(this, arguments); }
    finally { invalidate(); }
  };
}
function compileVerification(state) {
  var checkedKeys = new Map(), checkedLinks = new Map();
  var properties = [], links = [];
  function property(owner, key, expected) {
    var keys = checkedKeys.get(owner);
    if (!keys) { keys = new Map(); checkedKeys.set(owner, keys); }
    if (keys.has(key)) {
      if (!same(keys.get(key), expected)) throw Error("Conflicting native geometry descriptor " + key);
      return;
    }
    keys.set(key, expected);
    properties.push({owner: owner, key: key, expected: expected});
  }
  function chain(target, key, owner) {
    while (target !== owner) {
      if (!target) throw Error("Native geometry descriptor owner changed " + key);
      property(target, key, undefined);
      var parent = Object.getPrototypeOf(target);
      if (!checkedLinks.has(target)) {
        checkedLinks.set(target, parent);
        links.push({node: target, parent: parent});
      }
      target = parent;
    }
  }
  state.checks.forEach(function (check) {
    chain(check.target, check.key, check.owner);
    property(check.owner, check.key, check.expected);
  });
  state.absent.forEach(function (missing) { chain(missing.target, missing.key, null); });
  // Several Spine types inherit one binding. Check its own descriptor once,
  // and still verify every closer prototype for new shadows or changed links.
  state.properties = properties;
  state.links = links;
}
function verify(state) {
  if (!nativeRuntime()) return false;
  for (var i = 0; i < state.types.length; i++) {
    var type = state.types[i];
    if (type.namespace[type.name] !== type.Type || type.Type.prototype !== type.prototype) return false;
  }
  for (i = 0; i < state.links.length; i++) {
    var link = state.links[i];
    if (Object.getPrototypeOf(link.node) !== link.parent) return false;
  }
  for (i = 0; i < state.properties.length; i++) {
    var check = state.properties[i];
    if (!same(Object.getOwnPropertyDescriptor(check.owner, check.key), check.expected)) return false;
  }
  return true;
}
function trusted(state) {
  if (disabled) return false;
  if (verify(state)) return true;
  // Foreign bindings may mutate geometry while live fallback is in use.
  // Never revive old vectors if those methods are subsequently restored.
  retire(); return false;
}
function prepare() {
  if (disabled || !nativeRuntime()) return null;
  if (installed) return trusted(installed) ? installed : null;
  var state = { types: [], checks: [], absent: [], actions: [], nativeTypes: [], getters: [] };
  function type(namespace, name, required) {
    var Type = namespace[name];
    if (typeof Type !== "function" || !Type.prototype) { if (required) throw Error("Unsupported native " + name); return null; }
    var value = { namespace: namespace, name: name, Type: Type, prototype: Type.prototype };
    state.types.push(value); return value;
  }
  function watch(target, key, hook, required) {
    var found = descriptor(target, key);
    if (!found) { if (required) throw Error("Missing native " + key); state.absent.push({ target: target, key: key }); return; }
    var own = found.descriptor;
    var setter = hook === "setter";
    if (hook && (typeof (setter ? own.set : own.value) !== "function" || !own.configurable && (setter || !own.writable))) throw Error("Unhookable native " + key);
    var prior = state.checks.find(function (entry) { return entry.owner === found.owner && entry.key === key; });
    var check = { target: target, key: key, owner: found.owner, original: own, expected: prior ? prior.expected : own };
    state.checks.push(check);
    if (hook && !prior) {
      check.expected = Object.assign({}, own, setter ? { set: transparent(own.set) } : { value: transparent(own.value) }); state.actions.push(check);
    }
  }
  try {
    var region = type(spine, "RegionAttachment", true), mesh = type(spine, "MeshAttachment", true), vertex = type(spine, "VertexAttachment", true);
    state.component = type(sp, "Skeleton", true);
    ["SkeletonRenderer", "SkeletonAnimation", "SkeletonCacheAnimation"].forEach(function (name) {
      var value = type(spine, name, false); if (value) state.nativeTypes.push(value);
    });
    if (!state.nativeTypes.length) return null;
    watch(region.prototype, "updateOffset", true, true);
    watch(mesh.prototype, "setParentMesh", true, true);
    watch(mesh.prototype, "updateUVs", true, true);
    watch(vertex.prototype, "copyTo", true, true);
    watch(vertex.prototype, "setWorldVerticesLength", true, true);
    // Mesh may inherit these methods or shadow them with an extension. Verify
    // and intercept resolution on the actual cached attachment type as well.
    watch(mesh.prototype, "copyTo", true, true);
    watch(mesh.prototype, "setWorldVerticesLength", true, true);
    // Intercept accessor writes too. A pre-existing alias could have captured
    // the original native method instead of dispatching through its wrapper.
    function alias(prototype, key) {
      var found = descriptor(prototype, key);
      watch(prototype, key, found && found.descriptor.set ? "setter" : false, false);
    }
    [vertex.prototype, mesh.prototype].forEach(function (prototype) { alias(prototype, "worldVerticesLength"); });
    alias(mesh.prototype, "parentMesh");
    [state.component].concat(state.nativeTypes).forEach(function (value) { watch(value.prototype, "updateRegion", true, false); });
    [[region, ["getOffset"]], [mesh, ["getVertices", "getUVs", "getTriangles", "getWorldVerticesLength"]]].forEach(function (entry) {
      var info = { type: entry[0], methods: {}, kind: entry[0] === region ? "region" : "mesh" };
      entry[1].forEach(function (name) {
        var fn = entry[0].prototype[name]; if (!nativeFunction(fn)) throw Error("Unsupported native " + name);
        watch(entry[0].prototype, name, false, true); info.methods[name] = fn;
      });
      info.methods.getBones = entry[0].prototype.getBones;
      if (info.methods.getBones !== undefined && !nativeFunction(info.methods.getBones)) throw Error("Unsupported native getBones");
      info.mutators = entry[0] === region ? ["updateOffset"] : ["setParentMesh", "updateUVs", "copyTo", "setWorldVerticesLength"];
      info.names = Object.keys(info.methods);
      state.getters.push(info);
    });
    // All required descriptors are checked before making the first write.
    for (var i = 0; i < state.actions.length; i++) {
      var action = state.actions[i]; Object.defineProperty(action.owner, action.key, action.expected);
    }
    compileVerification(state);
    if (!verify(state)) throw Error("Native geometry descriptor verification failed");
    installed = state; return state;
  } catch (error) {
    for (var n = state.actions.length - 1; n >= 0; n--) {
      var entry = state.actions[n], current = Object.getOwnPropertyDescriptor(entry.owner, entry.key);
      if (same(current, entry.expected)) try { Object.defineProperty(entry.owner, entry.key, entry.original); } catch (ignored) {}
    }
    disabled = true; return null;
  }
}
function scope(renderer, plan) {
  var state = prepare(); if (!state || !renderer || !plan) return null;
  if (renderer._nativeSkeleton !== plan.native || renderer._skeleton !== plan.skeleton || renderer.skeletonData !== plan.data ||
      (plan.data && plan.data.skeletonJson) !== plan.json) return null;
  if (Object.getPrototypeOf(renderer) !== state.component.prototype) return plan.geometryUsed ? retire() : null;
  var native = null, nativePrototype = Object.getPrototypeOf(plan.native);
  for (var i = 0; i < state.nativeTypes.length; i++) if (nativePrototype === state.nativeTypes[i].prototype) { native = state.nativeTypes[i]; break; }
  if (!native || renderer.updateRegion !== state.component.prototype.updateRegion || plan.native.updateRegion !== native.prototype.updateRegion) return plan.geometryUsed ? retire() : null;
  if (typeof plan.native.getSkeleton !== "function" || plan.native.getSkeleton() !== plan.skeleton) return null;
  return { renderer: renderer, plan: plan, state: state, native: native };
}
function vector(values) {
  if (!values || typeof values.length !== "number") return null;
  var result = Array.prototype.slice.call(values);
  return result.every(Number.isFinite) ? result : null;
}
function read(current, attachment) {
  if (!current || !attachment || !trusted(current.state)) return null;
  var plan = current.plan, renderer = current.renderer;
  if (renderer._nativeSkeleton !== plan.native || renderer._skeleton !== plan.skeleton || renderer.skeletonData !== plan.data ||
      (plan.data && plan.data.skeletonJson) !== plan.json || typeof attachment.computeWorldVertices === "function") return null;
  if (renderer.updateRegion !== current.state.component.prototype.updateRegion || plan.native.updateRegion !== current.native.prototype.updateRegion) return retire();
  var prototype = Object.getPrototypeOf(attachment), info = null;
  for (var i = 0; i < current.state.getters.length; i++) if (current.state.getters[i].type.prototype === prototype) { info = current.state.getters[i]; break; }
  if (!info) return null;
  for (i = 0; i < info.names.length; i++) {
    var name = info.names[i]; if (attachment[name] !== info.methods[name]) return retire();
  }
  for (i = 0; i < info.mutators.length; i++) {
    name = info.mutators[i]; if (attachment[name] !== info.type.prototype[name]) return retire();
  }
  if (Object.getOwnPropertyDescriptor(attachment, "worldVerticesLength") || Object.getOwnPropertyDescriptor(attachment, "parentMesh")) return retire();
  if (plan.geometryEpoch !== epoch) {
    plan.geometryEpoch = epoch; plan.intrinsicGeometry = new WeakMap(); plan.meshes = new WeakMap();
  }
  var saved = plan.intrinsicGeometry.get(attachment); if (saved) return saved;
  var version = epoch, geometry;
  if (info.kind === "region") {
    var offset = vector(attachment.getOffset());
    if (!offset || offset.length !== 8) return null;
    geometry = { region: offset, count: 8 };
  } else {
    var vertices = vector(attachment.getVertices()), uvs = vector(attachment.getUVs()), triangles = vector(attachment.getTriangles());
    var count = attachment.getWorldVerticesLength();
    if (!vertices || !uvs || !triangles || !Number.isInteger(count) || count <= 0 || count % 2) return null;
    geometry = { vertices: vertices, uvs: uvs, triangles: triangles, count: count, weights: Object.create(null) };
    if (attachment.getBones) geometry.bones = vector(attachment.getBones());
  }
  if (version !== epoch || !trusted(current.state)) return null;
  plan.geometryUsed = true; plan.intrinsicGeometry.set(attachment, geometry); return geometry;
}
// Call around direct native actor attachment edits. Assets/skin attachments
// can be shared by several actors, so invalidation intentionally is global.
exports.invalidate = invalidate;
exports.scope = scope;
exports.read = read;
