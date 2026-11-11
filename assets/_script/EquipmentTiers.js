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
exports.tiers = tiers; exports.at = at; exports.key = key; exports.legacyKey = legacyKey;
exports.target = target; exports.profileId = profileId; exports.label = label; exports.icon = icon;
