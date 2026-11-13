"use strict";
// Shared, read-only gear values for combat, Gear, CP and authoring panels.
// Configurations without HeroEquipment retain the original stat mapping.
var Weapons = require("./HeroWeapons");
var definitions = {
  fighter: [{ key: "lifeSteal", label: "Life steal", percent: true }],
  skirmisher: [{ key: "range", label: "Attack range bonus" }, { key: "criticalChance", label: "Critical chance", percent: true }],
  vanguard: [{ key: "move", label: "Movement speed", percent: true }, { key: "attackRate", label: "Attack speed", percent: true }],
  bruiser: [{ key: "attackRate", label: "Attack speed", percent: true }, { key: "criticalDamage", label: "Critical damage", percent: true }],
  guardian: [{ key: "damageReduction", label: "Damage reduction", percent: true }],
  mystic: [{ key: "splashDamage", label: "Splash damage", percent: true }]
};
function enabled(config) { return !!(config && config.HeroEquipment && config.HeroEquipment.version === 1); }
function multiplier(config,style){var values=config.HeroEquipment&&config.HeroEquipment.damageMultipliers||{},value=values[style];return typeof value==='number'&&isFinite(value)&&value>0?value:1;}
function damage(config,style,value){return Math.ceil(value*multiplier(config,style)-1e-9);}
function row(config, slot, level) {
  var gear = (config.EquipCfg || []).filter(function (value) { return value.id === Number(slot); })[0];
  return gear && gear.levelInfo[Math.max(0, Math.min(gear.levelInfo.length - 1, Math.floor(Number(level) || 1) - 1))];
}
function secondary(config, style, level) {
  if (!enabled(config)) return {};
  var current = row(config, 3, level), values = current && current.SecondaryStats && current.SecondaryStats[style] || {}, result = {};
  (definitions[style] || []).forEach(function (field) {
    var value = values[field.key];
    result[field.key] = typeof value === "number" && isFinite(value) ? Math.max(0, field.percent && field.key !== "criticalDamage" ? Math.min(1, value) : value) : 0;
  });
  result.splashRadius = Math.max(0, Number(config.HeroEquipment.splashRadius) || 0);
  return result;
}
function raw(config, style, equipment, secondaryLevel) {
  var result = { health: equipment[1], regen: equipment[2], damage: equipment[3], range: equipment[4], attackRate: equipment[5], move: equipment[6] };
  if (!enabled(config)) return result;
  var bonus = secondary(config, style, secondaryLevel);
  result.damage = damage(config,style,equipment[4]);
  result.range = config.HeroEquipment.baseRange + (bonus.range || 0);
  result.attackRate *= 1 + (bonus.attackRate || 0);
  result.move *= 1 + (bonus.move || 0);
  return result;
}
function fields(config, slot, level, style) {
  if (!enabled(config) || Number(slot) !== 3) return [{ key: "Parameters", label: Number(slot) === 4 && enabled(config) ? "Attack damage" : {1:"Max HP",2:"HP regeneration",3:"Attack damage",4:"Attack range",5:"Attack speed",6:"Movement speed"}[slot], value: Number(slot)===4&&enabled(config)?damage(config,style,(row(config,slot,level)||{}).Parameters):(row(config, slot, level) || {}).Parameters }];
  var values = secondary(config, style, level);
  return (definitions[style] || []).map(function (field) { return Object.assign({}, field, { value: values[field.key] }); });
}
function formatted(field) { return String(Number((field.value * (field.percent ? 100 : 1)).toFixed(3))) + (field.percent ? "%" : ""); }
function summary(config, slot, level, style) { return fields(config, slot, level, style).map(function (field) { return field.label + ": " + formatted(field); }).join(" · "); }
function migrate(data, config) {
  if (!enabled(config) || data.heroEquipmentVersion >= 1) return;
  var migration = config.HeroEquipment.migration || {}, previous = migration.damage || [], oldCount = data.equipmentProgressionVersion >= 1 ? migration.mainLevels || 25 : 20;
  var main = (config.EquipCfg || []).filter(function (gear) { return gear.id === 4; })[0];
  if (!main || main.levelInfo.length !== 50 || !previous.length) return;
  var state = data.heroWeapon, styles = state && state.levels || {}, selected = Weapons.selected(data).id;
  function converted(mainLevel, secondaryLevel) {
    var expanded = 1 + Math.ceil((Math.max(1, Math.min(oldCount, Number(mainLevel) || 1)) - 1) * 49 / (oldCount - 1));
    var damage = previous[Math.max(0, Math.min(previous.length - 1, (Number(secondaryLevel) || 1) - 1))];
    return Math.max(expanded, Math.min(50, Math.ceil(damage / 2)));
  }
  if (Array.isArray(data.personLevel) && (data.personLevel[2] !== undefined || data.personLevel[3] !== undefined)) data.personLevel[3] = converted(data.personLevel[3], data.personLevel[2]);
  Object.keys(styles).forEach(function (id) {
    var progress = styles[id]; if (!Weapons.find(id) || !progress || typeof progress !== "object" || Array.isArray(progress)) return;
    progress[4] = converted(progress[4], progress[3]);
    if (id === "skirmisher" && Array.isArray(data.personLevel)) data.personLevel[3] = Math.max(data.personLevel[3] || 1, progress[4]);
  });
  if (state && selected !== "skirmisher" && !styles[selected]) { state.levels = Object.assign({}, styles); state.levels[selected] = {3:1,4:converted(1,1)}; }
  data.heroEquipmentVersion = 1;
}
exports.enabled=enabled;exports.definitions=definitions;exports.secondary=secondary;
exports.raw=raw;exports.fields=fields;exports.formatted=formatted;exports.summary=summary;exports.migrate=migrate;
exports.multiplier=multiplier;
