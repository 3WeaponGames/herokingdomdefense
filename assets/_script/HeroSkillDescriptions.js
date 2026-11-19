"use strict";
// Description templates read the same effective tuning as combat. No stored
// percentages, evaluated expressions, or player-state mutations are needed.
var Core = require("./HeroStyleSkills");
var templates = {
  skirmisher: { active: "Fire five arrows in a spread. Each travels straight and deals {activeDamage:percent} bow damage to the first enemy it hits. Cooldown {cooldown}s." },
  fighter: {
    active: "Knock enemies back. Gain +{buffDamage:percent} damage and +{buffAttackRate:percent} attack speed for {buffDuration}s. Cooldown: {cooldown}s.",
    passive: "Land {maxStacks} hits to gain +{stackDamageTotal:percent} damage, {stackReductionTotal:percent} damage reduction, and {stackTenacityTotal:percent} tenacity. Each hit refreshes the {stackDuration}s buff."
  },
  vanguard: {
    active: "Strike {strikes} times over {duration}s for {strikeDamage:percent} base damage per hit. Movement and attack speed increase damage. Cooldown: {cooldown}s.",
    passive: "Moving builds Momentum and grants up to +{momentumMove:percent} movement speed. A hit with Momentum locks it for {buffDuration}s and adds up to +{momentumAttackRate:percent} attack speed. Momentum resets when the buff expires."
  },
  mystic: {
    active: "Marked-target burst: {activeDamage:percent} damage, +{chargeDamage:percent} damage and +{splashRadiusPerCharge} radius per charge (max {maxCharges}). Cooldown: {cooldown}s.",
    passive: "Channel lightning to mark an enemy and slow it by {slow:percent} for {slowDuration}s. Hits on the same target build up to {maxCharges} charges for Arcane Burst."
  },
  bruiser: {
    active: "Spend {sacrifice:percent} of current HP. Cleave nearby enemies for {activeDamage:percent} damage after the missing-HP bonus. Cooldown: {cooldown}s.",
    passive: "Missing HP grants up to +{missingDamage:percent} damage and +{missingAttackRate:percent} attack speed."
  },
  guardian: {
    active: "Gain a shield equal to {shieldHealth:percent} of max HP for {shieldDuration}s. Taunt nearby enemies for {tauntDuration}s. Cooldown: {cooldown}s.",
    passive: "Allies within {allyRadius} distance take {allyReduction:percent} less damage while protected."
  }
};
var percentKeys = "activeDamage strikeDamage buffDamage buffAttackRate distanceDamagePer100 chargedDamage chargedRange chargeDamage slow stackDamage stackReduction stackTenacity momentumMove momentumAttackRate missingDamage missingAttackRate sacrifice shieldHealth allyReduction moveScaling attackScaling stackDamageTotal stackReductionTotal stackTenacityTotal".split(" ");
var TOKEN = /\{([a-zA-Z][a-zA-Z0-9]*)(?::(percent|number))?\}/g;
var MAX_LENGTH = 800;
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function values(style, tuning) {
  var result = {}, source = Object.assign({}, Core.DEFAULTS.common, Core.DEFAULTS[style]);
  Object.keys(source).forEach(function (key) {
    var value = tuning && tuning[key];
    result[key] = typeof value === "number" && isFinite(value) ? value : source[key];
  });
  if (style === "fighter") {
    var state = Core.createState(style, result); state.stacks = Math.max(1, Math.floor(result.maxStacks)); state.stackRemaining = 1;
    var bonus = Core.bonuses(state);
    result.stackDamageTotal = bonus.damage; result.stackReductionTotal = bonus.damageReduction; result.stackTenacityTotal = bonus.tenacity;
  }
  return result;
}
function error(style, text) {
  if (typeof text !== "string") return "Enter a description template.";
  if (text.length > MAX_LENGTH) return "Keep the description to " + MAX_LENGTH + " characters or fewer.";
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return "Remove control characters from the description.";
  var available = values(style), issue = "";
  var rest = text.replace(TOKEN, function (_, key) { if (!own(available, key)) issue = "Unknown skill stat: " + key + ". Use the Insert stat menu."; return ""; });
  if (/[{}]/.test(rest)) return "Use {stat} or {stat:percent} placeholders.";
  return issue;
}
function number(value) { return String(Number(value.toFixed(2))); }
function format(style, text, tuning) {
  if (error(style, text)) return "";
  var data = values(style, tuning);
  return text.replace(TOKEN, function (_, key, mode) { return mode === "percent" ? number(data[key] * 100) + "%" : number(data[key]); });
}
function defaults(style) { return Object.assign({}, templates[style] || {}); }
function render(style, entry, tuning) {
  var text = tuning && tuning.descriptions && tuning.descriptions[entry];
  if (text === undefined || error(style, text)) text = defaults(style)[entry] || "";
  return format(style, text, tuning);
}
function tokens(style) {
  return Object.keys(values(style)).map(function (key) {
    return { key: key, token: "{" + key + (percentKeys.indexOf(key) >= 0 ? ":percent" : "") + "}", label: key.replace(/([A-Z])/g, " $1").replace(/^./, function (c) { return c.toUpperCase(); }) };
  });
}
function fields(style) {
  return Object.keys(templates[style] || {}).map(function (entry) {
    var sample = (templates[style][entry].match(/\{[^{}]+:percent\}/) || ["{cooldown}"])[0];
    return { path: "descriptions." + entry, key: "description", entry: entry, style: style, label: "Description", type: "description", maxLength: MAX_LENGTH,
      help: "Write the skill description once. Insert stat placeholders such as " + sample + "; their values update with the skill settings. Changes stay in the draft until Save." };
  });
}
exports.defaults = defaults; exports.render = render; exports.format = format; exports.error = error; exports.tokens = tokens; exports.fields = fields; exports.values = values;
