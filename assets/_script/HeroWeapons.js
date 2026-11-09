"use strict";
// Equipment slots and campaign costs remain the existing ones. Only slots 3
// (power) and 4 (weapon reach) have independent progress for each weapon.
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
function number(value) { return typeof value === "number" && isFinite(value) && value >= 1 ? Math.floor(value) : 1; }
function level(data, slot, style) {
  var id = style || selected(data).id, levels = data && data.heroWeapon && data.heroWeapon.levels, weapon = levels && levels[id];
  if (slot !== 3 && slot !== 4) return number(data && data.personLevel && data.personLevel[slot - 1]);
  if (weapon && weapon[slot] !== undefined) return number(weapon[slot]);
  return id === "skirmisher" ? number(data && data.personLevel && data.personLevel[slot - 1]) : 1;
}
function state(data) {
  var previous = data.heroWeapon || {}, result = Object.assign({}, previous, { selected: selected(data).id, levels: Object.assign({}, previous.levels) });
  // Copy legacy bow progress only when the player actually changes equipment.
  if (!result.levels.skirmisher) result.levels.skirmisher = { 3: level(data, 3, "skirmisher"), 4: level(data, 4, "skirmisher") };
  return result;
}
function select(data, id) {
  if (!find(id) || selected(data).id === id) return false;
  var next = state(data); next.selected = id; data.heroWeapon = next; return true;
}
function upgrade(data, slot, value, style) {
  if (slot !== 3 && slot !== 4) { data.personLevel[slot - 1] = value; return; }
  var next = state(data), id = find(style) ? style : next.selected;
  next.levels[id] = Object.assign({}, next.levels[id]); next.levels[id][slot] = value; data.heroWeapon = next;
  if (id === "skirmisher") data.personLevel[slot - 1] = value;
}
function itemKey(slot, value, style) { return slot + ":" + value + ((slot === 3 || slot === 4) && style && style !== "skirmisher" ? ":" + style : ""); }
function skin(style, tier) { return (style || "skirmisher") + "_" + tier; }
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
exports.select = select; exports.upgrade = upgrade; exports.itemKey = itemKey; exports.skin = skin;
exports.validate = validate;
