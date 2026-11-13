"use strict";
// Visual tiers follow authored skins. Upgrade IDs and player progress stay intact.
function tiers(equipment) {
  var result = [];
  (equipment && equipment.levelInfo || []).forEach(function (row) {
    var tier = result.filter(function (item) { return item.skin === row.EquipSkin; })[0];
    if (!tier) { tier = { skin: row.EquipSkin, number: result.length + 1, levels: [] }; result.push(tier); }
    tier.levels.push(row.Level);
  });
  return result;
}
function at(equipment, level) {
  var tier = tiers(equipment).filter(function (item) { return item.levels.indexOf(Number(level)) >= 0; })[0];
  return tier && Object.assign({}, tier, { level: tier.levels.indexOf(Number(level)) + 1 });
}
function suffix(slot, style) { return (Number(slot) === 3 || Number(slot) === 4) && style && style !== "skirmisher" ? ":" + style : ""; }
function key(slot, skin, style) { return slot + ":tier:" + encodeURIComponent(skin) + suffix(slot, style); }
function legacyKey(slot, level, style) { return slot + ":" + level + suffix(slot, style); }
function target(equipment, value) {
  var fields = String(value).split(":"), slot = Number(fields[0]), gear = (equipment || []).filter(function (item) { return item.id === slot; })[0];
  if (!gear) return null;
  var tier, level, style;
  if (fields[1] === "tier") {
    var skin; try { skin = decodeURIComponent(fields[2]); } catch (_) { return null; }
    tier = tiers(gear).filter(function (item) { return item.skin === skin; })[0];
    if (!tier) return null;
    level = tier.levels[0]; style = fields[3];
  } else { level = Number(fields[1]); tier = at(gear, level); style = fields[2]; }
  return tier && { slot: slot, level: level, skin: tier.skin, tier: tier.number, levels: tier.levels, style: style || ((slot === 3 || slot === 4) ? "skirmisher" : undefined) };
}
function profileId(data, equipment, slot, level, style) {
  if (!data) return undefined;
  var gear = (equipment || []).filter(function (item) { return item.id === Number(slot); })[0], tier = at(gear, level);
  return tier && data.assignments[key(slot, tier.skin, style)] || data.assignments[legacyKey(slot, level, style)];
}
function label(equipment, level) {
  var value = at(equipment, level);
  return value ? "Tier " + value.number + " · Level " + value.level : "Level " + level;
}
function icon(data, defaults, equipment, slot, level, style) {
  var id = profileId(data, equipment, slot, level, style), profile = id && data.profiles[id], part = profile && profile.parts && profile.parts[0];
  if (part) return { id: part.sprite, tint: part.tint || "#ffffff" };
  if (profile && profile.icon) return profile.icon;
  var gear = (equipment || []).filter(function (item) { return item.id === Number(slot); })[0], tier = at(gear, level), icons = defaults && defaults.icons && defaults.icons[slot];
  return icons && tier && icons[([3, 4, 5].indexOf(Number(slot)) >= 0 ? (style || "skirmisher") + "_" : "") + tier.skin] || null;
}
// Existing skin IDs retain their saved appearances. Blue is inserted between
// the old green and purple skins; tier numbers come from the progression order.
function tint(level) { return level && level.EquipSkin === "lv_blue" ? "#54c7ff" : "#ffffff"; }
// Blue equipment begins with the green art, while older projectile/effect rigs
// retain their original skin names. Never pass an unverified name into JSB.
function legacySkin(name, supported) {
  if (typeof name !== "string" || !name || typeof supported !== "function") return null;
  if (supported(name)) return name;
  return name === "lv_blue" && supported("lv2") ? "lv2" : null;
}
function expandedLevel(level, from, to) {
  if (typeof level !== "number" || !isFinite(level) || level < 1 || level > from) return level;
  return 1 + Math.ceil((Math.floor(level) - 1) * (to - 1) / (from - 1) - 1e-9);
}
function migrateProgress(data, equipment, migration) {
  if (!data || !migration || !(migration.version > (data.equipmentProgressionVersion || 0))) return;
  Object.keys(migration.levels || {}).forEach(function (slot) {
    var rule = migration.levels[slot], gear = (equipment || []).filter(function (row) { return row.id === Number(slot); })[0];
    if (!gear || gear.levelInfo.length !== rule.to || !(rule.from > 1 && rule.to > rule.from)) return;
    if (Array.isArray(data.personLevel) && data.personLevel[slot - 1] !== undefined) data.personLevel[slot - 1] = expandedLevel(data.personLevel[slot - 1], rule.from, rule.to);
    var levels = data.heroWeapon && data.heroWeapon.levels;
    Object.keys(levels || {}).forEach(function (style) {
      if (levels[style] && typeof levels[style] === "object" && !Array.isArray(levels[style]) && levels[style][slot] !== undefined) levels[style][slot] = expandedLevel(levels[style][slot], rule.from, rule.to);
    });
  });
  data.equipmentProgressionVersion = migration.version;
}
exports.tiers = tiers; exports.at = at; exports.key = key; exports.legacyKey = legacyKey;
exports.target = target; exports.profileId = profileId; exports.label = label; exports.icon = icon;
exports.tint = tint; exports.expandedLevel = expandedLevel; exports.migrateProgress = migrateProgress;
exports.legacySkin = legacySkin;
