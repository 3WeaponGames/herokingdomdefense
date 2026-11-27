"use strict";

var KEY = "project-cocos.preview.save-slots";
var PREFIX = "project-cocos.preview.slot.";
var ORIGINAL = "original";
var MAX_NAME_LENGTH = 40;

function initial() {
  return { version: 1, active: ORIGINAL, nextNumber: 2, slots: [{ id: ORIGINAL, number: 1 }], pendingDeletes: [] };
}

function validId(id) {
  return id === ORIGINAL || typeof id === "string" && /^[a-z0-9]+-[a-z0-9]+$/.test(id);
}

function decode(raw) {
  if (raw === null || raw === undefined) return initial();
  var state;
  try { state = JSON.parse(raw); } catch (error) { /* Report invalid storage below. */ }
  if (!state || state.version !== 1 || !Number.isSafeInteger(state.nextNumber) || state.nextNumber < 2 ||
      !Array.isArray(state.slots) || !state.slots.length || !Array.isArray(state.pendingDeletes)) {
    throw Error("The save slot list could not be read.");
  }
  var ids = new Set(), numbers = new Set();
  state.slots.forEach(function (slot) {
    if (!slot || !validId(slot.id) || ids.has(slot.id) || numbers.has(slot.number) ||
        !Number.isSafeInteger(slot.number) || slot.number < 1 || slot.number >= state.nextNumber ||
        (slot.id === ORIGINAL) !== (slot.number === 1)) throw Error("The save slot list could not be read.");
    ids.add(slot.id);
    numbers.add(slot.number);
  });
  if (!ids.has(state.active) || new Set(state.pendingDeletes).size !== state.pendingDeletes.length ||
      state.pendingDeletes.some(function (id) { return !validId(id) || ids.has(id); })) {
    throw Error("The save slot list could not be read.");
  }
  return state;
}

function namespace(id) { return PREFIX + id + "/"; }
function cleanName(value) {
  var text = typeof value === "string" ? value.trim() : "";
  return text.length <= MAX_NAME_LENGTH && !/[\u0000-\u001f\u007f]/.test(text) ? text : "";
}
function name(slot) { return cleanName(slot.name) || "Save " + slot.number; }

function create(storage, prefixes) {
  prefixes = prefixes.filter(Boolean);
  if (!prefixes.length) throw Error("The game save namespace is unavailable.");

  function owns(key) {
    return typeof key === "string" && prefixes.some(function (prefix) { return key.indexOf(prefix) === 0; });
  }

  function read() {
    var raw = storage.getItem(KEY);
    return { revision: raw == null ? null : raw, state: decode(raw) };
  }

  function replace(expected, raw) {
    if (read().revision !== expected) throw Error("The save slots changed in another preview. Refresh the list and try again.");
    if (raw === null) storage.removeItem(KEY);
    else storage.setItem(KEY, raw);
    if (read().revision !== raw) throw Error("The save slot list could not be saved.");
  }

  function commit(view, state) {
    var raw = JSON.stringify(state);
    replace(view.revision, raw);
    return function () { replace(raw, view.revision); };
  }

  function add(state) {
    var slot = { id: state.nextNumber.toString(36) + "-" + Math.floor(Math.random() * 0x100000000).toString(36), number: state.nextNumber };
    state.nextNumber++;
    state.slots.push(slot);
    state.active = slot.id;
    return slot;
  }

  function collectDeleted() {
    var view = read(), state = view.state;
    if (!state.pendingDeletes.length) return;
    var keys = [], length = storage.length;
    if (!Number.isSafeInteger(length) || typeof storage.key !== "function") throw Error("Save storage cannot list deleted records.");
    for (var i = 0; i < length; i++) keys.push(storage.key(i));
    state.pendingDeletes.forEach(function (id) {
      keys.forEach(function (key) {
        if (id === ORIGINAL ? owns(key) : typeof key === "string" && key.indexOf(namespace(id)) === 0) {
          storage.removeItem(key);
          if (storage.getItem(key) != null) throw Error("Deleted save data could not be cleared.");
        }
      });
    });
    state.pendingDeletes = [];
    commit(view, state);
  }

  function bind(id) {
    return {
      owns: owns,
      localOnly: id !== ORIGINAL,
      managed: function () { return read().revision !== null; },
      exists: function () { return read().state.slots.some(function (slot) { return slot.id === id; }); },
      key: function (key) { return id === ORIGINAL ? key : namespace(id) + key; }
    };
  }

  return { read: read, commit: commit, add: add, collectDeleted: collectDeleted, bind: bind };
}

exports.create = create;
exports.name = name;
exports.cleanName = cleanName;
exports.MAX_NAME_LENGTH = MAX_NAME_LENGTH;
