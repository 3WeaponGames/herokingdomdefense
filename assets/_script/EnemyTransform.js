"use strict";

function supported(unit, settings) {
  if (!unit || !unit.prefab) return false;
  var behavior = unit.BehaviorTemplate || unit.ID;
  var profiles = settings && settings.unitProfiles;
  return (behavior < 90010 || behavior > 90012) && !(profiles && profiles.aliases && profiles.aliases[unit.ID]);
}

function triggerIssue(skill) {
  if (skill.trigger === "health") {
    if (!Number.isFinite(skill.healthPercent) || skill.healthPercent <= 0 || skill.healthPercent > 100) {
      return "Enter a remaining HP percentage greater than zero and up to 100.";
    }
  } else if (skill.trigger === undefined || skill.trigger === "delay") {
    if (!Number.isFinite(skill.delay) || skill.delay <= 0) return "Enter a delay greater than zero seconds.";
  } else return "Choose Time delay or Health percentage for the Transform trigger.";
  return null;
}

function issue(unit, skill, units, settings) {
  if (skill === undefined) return null;
  if (!supported(unit, settings)) return "Transform requires a spawnable enemy profile with an editable skill.";
  var seen = new Set([unit.ID]);
  while (skill !== undefined) {
    if (!skill || !Number.isSafeInteger(skill.unitId) || skill.unitId <= 0) return "Choose an enemy form.";
    var error = triggerIssue(skill);
    if (error) return error;
    if (seen.has(skill.unitId)) return "Transform forms cannot lead back to a previous form.";
    var next = units[skill.unitId];
    if (!supported(next, settings)) return "Choose an available enemy profile as the next form.";
    seen.add(skill.unitId);
    skill = next.TransformSkill;
  }
  return null;
}

exports.supported = supported;
exports.issue = issue;
