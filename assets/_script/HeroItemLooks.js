"use strict";
var catalog = null, library = null, defaults = null, defaultsLoaded = false, loading = false, retryAfter = 0, listeners = new Map(), cachedBase, cachedLevels = "", cachedLook;
function ready() { return catalog && defaultsLoaded && (!Object.keys(catalog.assignments).length || library); }
function load() {
  if (loading || ready() || Date.now() < retryAfter || !cc.resources) return;
  loading = true;
  function fail() { loading = false; retryAfter = Date.now() + 1000; }
  function done() {
    loading = false;
    retryAfter = 0;
    var firstError;
    listeners.forEach(function (cancel, callback) {
      cancel();
      try { callback(); } catch (error) { if (!firstError) firstError = error; }
    });
    if (firstError) throw firstError;
  }
  function parts() {
    if (!defaultsLoaded) {
      cc.resources.load("hero-maker/catalog", cc.JsonAsset, function (error, asset) { defaultsLoaded = true; defaults = !error && asset && asset.json; parts(); });
      return;
    }
    if (!Object.keys(catalog.assignments).length) { done(); return; }
    try { cc.resources.load("character-parts/catalog", cc.JsonAsset, function (issue, images) {
      if (issue || !images || !images.json || !Array.isArray(images.json.parts)) { fail(); return; }
      library = Object.create(null); images.json.parts.forEach(function (image) { library[image.id] = image; }); done();
    }); } catch (error) { fail(); }
  }
  if (catalog) { parts(); return; }
  try { cc.resources.load("hero-items/catalog", cc.JsonAsset, function (error, asset) {
    if (error || !asset || !asset.json || !asset.json.assignments || !asset.json.profiles) { fail(); return; }
    catalog = asset.json; parts();
  }); } catch (error) { fail(); }
}
function merge(base, items) {
  var result = { parts: [], skins: {}, models: {}, bakedLayers: {}, scale: base && base.scale || 1 }, bySlot = {};
  [base].concat(items).filter(Boolean).forEach(function (profile) {
    profile.parts.forEach(function (part) { bySlot[part.layer + ":" + part.slot] = part; });
    Object.keys(profile.skins || {}).forEach(function (layer) { result.skins[layer] = profile.skins[layer]; });
    Object.keys(profile.models || {}).forEach(function (layer) { result.models[layer] = Object.assign({}, result.models[layer] || {}, profile.models[layer]); });
    Object.keys(profile.bakedLayers || {}).forEach(function (layer) { result.bakedLayers[layer] = profile.bakedLayers[layer]; });
  });
  Object.keys(bySlot).forEach(function (key) { result.parts.push(bySlot[key]); });
  return result;
}
function resolve(data, levels, style) {
  if (!data) return [];
  return Object.keys(levels).map(function (slot) { var key = slot + ":" + levels[slot] + ((slot === "3" || slot === "4") && style && style !== "skirmisher" ? ":" + style : ""), id = data.assignments[key]; return id && data.profiles[id]; }).filter(Boolean);
}
function current(base) {
  load();
  if (!catalog || !Object.keys(catalog.assignments).length) return base;
  var user = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData(), levels = {};
  for (var slot = 1; slot <= 6; slot++) levels[slot] = user.getPersonLevel(slot);
  var style = user.getHeroWeapon ? user.getHeroWeapon().id : "skirmisher";
  var key = style + ":" + Object.keys(levels).map(function (slot) { return levels[slot]; }).join(":");
  if (cachedBase === base && cachedLevels === key) return cachedLook;
  var items = resolve(catalog, levels, style);
  cachedBase = base; cachedLevels = key; cachedLook = items.length ? merge(base, items) : base;
  return cachedLook;
}
function item(slot, level) { load(); var user = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData(), style = user.getHeroWeapon ? user.getHeroWeapon().id : "skirmisher", id = catalog && catalog.assignments[require("HeroWeapons").itemKey(slot, level, style)]; return id && catalog.profiles[id] || null; }
function image(slot, level) {
  var profile = item(slot, level), part = profile && profile.parts[0], asset = part && library && library[part.sprite] || profile && profile.icon;
  if (!asset && defaults && defaults.icons && defaults.icons[slot]) {
    var user = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData(), style = user.getHeroWeapon ? user.getHeroWeapon().id : "skirmisher";
    var cfg = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getEquipCfgList().filter(function (row) { return row.id === slot; })[0], tier = cfg && cfg.levelInfo[level - 1].EquipSkin;
    asset = defaults.icons[slot][[3,4,5].indexOf(slot) >= 0 ? style + "_" + tier : tier];
  }
  return asset ? Object.assign({}, asset, { tint: part && part.tint || asset.tint || '#ffffff' }) : null;
}
function whenReady(callback) {
  if (ready()) return;
  var cancel = listeners.get(callback);
  if (!cancel) {
    cancel = function () { if (listeners.get(callback) === cancel) listeners.delete(callback); };
    listeners.set(callback, cancel);
  }
  load();
  return listeners.get(callback);
}
exports.current = current; exports.item = item; exports.image = image; exports.whenReady = whenReady; exports.merge = merge; exports.resolve = resolve;
