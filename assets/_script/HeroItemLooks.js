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
function resolve(data, levels, style, equipment) {
  if (!data) return [];
  return Object.keys(levels).map(function (slot) { var key = slot + ":" + levels[slot] + ((slot === "3" || slot === "4") && style && style !== "skirmisher" ? ":" + style : ""), id = equipment ? require("EquipmentTiers").profileId(data, equipment, slot, levels[slot], style) : data.assignments[key]; return id && data.profiles[id]; }).filter(Boolean);
}
function current(base, previewStyle) {
  load();
  if (!catalog || !Object.keys(catalog.assignments).length) return base;
  var user = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData(), levels = {};
  var style = previewStyle || (user.getHeroWeapon ? user.getHeroWeapon().id : "skirmisher");
  for (var slot = 1; slot <= 6; slot++) levels[slot] = previewStyle && (slot === 3 || slot === 4) ? user.getHeroWeaponLevel(style, slot) : user.getPersonLevel(slot);
  var key = style + ":" + Object.keys(levels).map(function (slot) { return levels[slot]; }).join(":");
  if (cachedBase === base && cachedLevels === key) return cachedLook;
  var items = resolve(catalog, levels, style, require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getEquipCfgList());
  cachedBase = base; cachedLevels = key; cachedLook = items.length ? merge(base, items) : base;
  return cachedLook;
}
function item(slot, level, previewStyle) { load(); var user = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData(), style = previewStyle || (user.getHeroWeapon ? user.getHeroWeapon().id : "skirmisher"), equipment = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getEquipCfgList(), id = require("EquipmentTiers").profileId(catalog, equipment, slot, level, style); return id && catalog.profiles[id] || null; }
function image(slot, level, previewStyle) {
  var profile = item(slot, level, previewStyle), part = profile && profile.parts[0], asset = part && library && library[part.sprite] || profile && profile.icon;
  if (!asset && defaults && defaults.icons && defaults.icons[slot]) {
    var user = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData(), style = previewStyle || (user.getHeroWeapon ? user.getHeroWeapon().id : "skirmisher");
    var cfg = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getEquipCfgList().filter(function (row) { return row.id === slot; })[0], tier = cfg && cfg.levelInfo[level - 1].EquipSkin;
    asset = defaults.icons[slot][[3,4,5].indexOf(slot) >= 0 ? style + "_" + tier : tier];
  }
  if (!asset && Number(slot) === 6) {
    var gear = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getEquipCfgList().filter(function (row) { return row.id === 6; })[0], selected = gear && gear.levelInfo[level - 1], skin = profile && Object.values(profile.skins || {})[0] || selected && selected.EquipSkin;
    if (skin) asset = {resource:"unit-library/mount-icons/hero-horse-" + skin, width:128, height:128};
  }
  return asset ? Object.assign({}, asset, { tint: part && part.tint || asset.tint || '#ffffff' }) : null;
}
function gearImage(slot, level, area, previewStyle) {
  var user = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData(), style = previewStyle || (user.getHeroWeapon ? user.getHeroWeapon().id : "skirmisher"), view = require("HeroWeapons").gear(style, slot, area), source;
  var custom = Number(slot) === 3 && item(slot, level, previewStyle);
  if (custom) source = image(slot, level, previewStyle);
  else if (view && view.kind === "linked") source = image(view.occupiedBy, previewStyle ? user.getHeroWeaponLevel(style, view.occupiedBy) : user.getPersonLevel(view.occupiedBy), previewStyle);
  else if (view && view.kind === "bonus") source = view.icon;
  else source = image(slot, level, previewStyle);
  if (view && view.kind === "offhand" && view.icon && !item(slot, level, previewStyle)) source = view.icon;
  return source && Object.assign({}, source, {gray:!!(view && view.gray && !custom),opacity:custom?255:view && view.opacity || 255,linked:!!(view && view.kind === "linked" && !custom)});
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
exports.current = current; exports.item = item; exports.image = image; exports.gearImage = gearImage; exports.whenReady = whenReady; exports.merge = merge; exports.resolve = resolve;
