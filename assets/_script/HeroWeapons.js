"use strict";
// Weapon and sub-item levels are shared across hero styles.
var styles = [
  { id: "skirmisher", name: "Skirmisher", weapon: "Bow", ranged: true, reach: 1 },
  { id: "fighter", name: "Fighter", weapon: "Sword", ranged: false, reach: .35 },
  { id: "vanguard", name: "Vanguard", weapon: "Spear", ranged: false, reach: .45 },
  { id: "mystic", name: "Mystic", weapon: "Staff", ranged: true, reach: 1 },
  { id: "bruiser", name: "Bruiser", weapon: "Axe", ranged: false, reach: .35 },
  { id: "guardian", name: "Guardian", weapon: "Hammer & shield", ranged: false, reach: .35 }
];
function find(id) { return styles.filter(function (style) { return style.id === id; })[0] || null; }
function selected(data) { return find(data && data.heroWeapon && data.heroWeapon.selected) || styles[0]; }
function upgradeUnlocked(equipment, user) {
  var requirement = equipment.Unlock;
  if (!requirement) return true;
  var stage = user.getMaxStage(), requiredStage = Number(requirement[0]);
  // A requirement without a wave unlocks only when settlement advances the stage.
  return stage > requiredStage || stage === requiredStage && requirement.length > 1 && user.getMaxOrder() > requirement[1];
}
function number(value) { return typeof value === "number" && isFinite(value) && value >= 1 ? Math.floor(value) : 1; }
function level(data, slot) {
  var shared = number(data && data.personLevel && data.personLevel[slot - 1]);
  var levels = data && data.heroWeapon && data.heroWeapon.levels;
  if (!levels || slot !== 3 && slot !== 4) return shared;
  // Read the best legacy level in each slot so existing saves and journals
  // can use shared gear before their next upgrade.
  styles.forEach(function (style) {
    var progress = levels[style.id];
    if (progress && typeof progress === "object" && !Array.isArray(progress)) shared = Math.max(shared, number(progress[slot]));
  });
  return shared;
}
function select(data, id) {
  if (!find(id) || selected(data).id === id) return false;
  var previous = data.heroWeapon || {};
  data.heroWeapon = Object.assign({}, previous, { selected: id, levels: previous.levels || {} });
  return true;
}
function upgrade(data, slot, value) {
  if (!Array.isArray(data.personLevel)) data.personLevel = [];
  data.personLevel[slot - 1] = value;
  var levels = data.heroWeapon && data.heroWeapon.levels;
  if (!levels || slot !== 3 && slot !== 4) return;
  // Retire this slot's legacy levels so explicit level changes take effect.
  styles.forEach(function (style) {
    var progress = levels[style.id];
    if (progress && typeof progress === "object" && !Array.isArray(progress)) delete progress[slot];
  });
}
function itemKey(slot, value, style) { return slot + ":" + value + ((slot === 3 || slot === 4) && style && style !== "skirmisher" ? ":" + style : ""); }
function skin(style, tier) { return (style || "skirmisher") + "_" + tier; }
// Each style supplies its own secondary item and bonus at the shared level.
function gear(style, slot, area) {
  var selected = find(style) || styles[0], main = selected.id === "guardian" ? "Hammer" : selected.weapon;
  if (Number(slot) === 1) return { name: "Chest", kind: "armor", slot: 1 };
  if (Number(slot) === 5) return { name: "Cloak", kind: "cape", slot: 5 };
  if (Number(slot) === 4) return { name: main, kind: "weapon", slot: 4 };
  if (Number(slot) !== 3) return null;
  if (selected.id === "skirmisher") return { name: "Arrow", kind: "offhand", slot: 3 };
  if (selected.id === "guardian") return { name: "Shield", kind: "offhand", slot: 3, icon: { id:"HandLeft/Shield/FA_WP_Sub_Shield_012_Blue",resource:"character-parts/Parts/HandLeft/Shield/FA_WP_Sub_Shield_012_Blue",width:50,height:56 } };
  var arcane = selected.id === "mystic";
  return { name: {fighter:"Food",vanguard:"Lightning Buff",mystic:"Crystal Orb",bruiser:"Skull Charm"}[selected.id], kind: "bonus", slot: 3, bonus: { key: arcane ? "arcane-focus" : "combat-training", parameter: "secondary" }, icon: {resource:arcane?"icons/GUI-Pro/Icons/Icon_Mana":"icons/2d-minimal/Misc/Misc_Fist_01_Gold"} };
}
function validate(data, equipment) {
  var state = data.heroWeapon; if (state === undefined) return;
  if (!state || typeof state !== "object" || Array.isArray(state)) { delete data.heroWeapon; return; }
  state.selected = selected(data).id;
  if (!state.levels || typeof state.levels !== "object" || Array.isArray(state.levels)) state.levels = {};
  styles.forEach(function (style) {
    var progress = state.levels[style.id]; if (!progress) return;
    if (typeof progress !== "object" || Array.isArray(progress)) { delete state.levels[style.id]; return; }
    [3,4].forEach(function (slot) { if (progress[slot] === undefined) return;var cfg=equipment.filter(function(row){return row.id===slot;})[0];progress[slot]=Math.min(cfg ? cfg.levelInfo.length : 1,number(progress[slot])); });
  });
}
exports.styles = styles; exports.find = find; exports.selected = selected; exports.level = level;
exports.upgradeUnlocked = upgradeUnlocked;
exports.select = select; exports.upgrade = upgrade; exports.itemKey = itemKey; exports.skin = skin;
exports.gear = gear;
exports.gearOrder = [1, 2, 5, 4, 3, 6];
exports.validate = validate;
