"use strict";

// Read-only requirements shared by battle snapshots, tooltips and the CP ledger.
// Defaults also protect old checkpoints and callers with only an ID/value map.
var IDS = ["skirmisher", "fighter", "vanguard", "mystic", "bruiser", "guardian"];
var DEFAULTS = {
  120011: ["guardian"], 120014: ["fighter"],
  120018: ["fighter", "vanguard", "bruiser", "guardian"],
  120024: ["vanguard"], 120025: ["skirmisher"], 120026: ["guardian"], 120027: ["fighter"],
  120029: ["mystic"], 120030: ["mystic"], 120033: ["mystic"], 120034: ["bruiser"],
  120035: ["bruiser"], 120036: ["mystic"], 120039: ["vanguard"], 120040: ["guardian"],
  120041: ["vanguard"], 120042: ["bruiser"], 120044: ["skirmisher"],
  120048: ["skirmisher"], 120049: ["guardian"]
};
function style(input) {
  var id = typeof input === "string" ? input : input && input.id;
  if (IDS.indexOf(id) < 0) id = "skirmisher";
  return { id: id, ranged: id === "skirmisher" || id === "mystic" };
}
function selected(user) {
  var data = user && user.data || user || {}, current;
  if (data.heroWeapon) current = data.heroWeapon.selected;
  else if (user && typeof user.getHeroWeapon === "function") current = user.getHeroWeapon();
  return style(current);
}
function list(value) {
  return Array.isArray(value) ? value : typeof value === "string" ? value.split(/[|,]/).map(function (item) { return item.trim(); }) : [value];
}
function matches(value, equipped) {
  return list(value).some(function (item) {
    return item === equipped.id || item === "hero" || item === "all" || item === "any" || item === "melee" && !equipped.ranged || item === "ranged" && equipped.ranged;
  });
}
function required(row, equipped) {
  row = row || {}; equipped = style(equipped);
  var fields = ["HeroStyle", "RequiredHeroStyle", "RequiredHeroStyles", "RequiredType", "RequiredUnitType", "UnitType"];
  var explicit = fields.concat(["RequiredAttackType"]).some(function (key) { return row[key] !== undefined && row[key] !== null && row[key] !== ""; });
  if (!explicit && DEFAULTS[row.ID] && DEFAULTS[row.ID].indexOf(equipped.id) < 0) return false;
  for (var index = 0; index < fields.length; index++) {
    var value = row[fields[index]];
    if (value !== undefined && value !== null && value !== "" && !matches(value, equipped)) return false;
  }
  return row.RequiredAttackType === undefined || Number(row.RequiredAttackType) === (equipped.ranged ? 2 : 1);
}
function stylesFor(id, row) {
  // Authored requirements may narrow or broaden the shipped defaults explicitly.
  return IDS.filter(function (name) { return required(Object.assign({ ID: id }, row), name); });
}
function eligible(id, equipped, row) {
  return required(Object.assign({ ID: id }, row), equipped);
}
module.exports = { ids: IDS, style: style, selected: selected, required: required, eligible: eligible, stylesFor: stylesFor };
