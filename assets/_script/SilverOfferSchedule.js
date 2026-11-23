"use strict";

var fields = [
  { key: "count", component: "silverOfferCount", label: "Total offers", minimum: 0, initial: 2 },
  { key: "firstWave", component: "silverFirstWave", label: "First wave", minimum: 1, initial: 1 },
  { key: "interval", component: "silverWaveInterval", label: "Wave interval", minimum: 1, initial: 1 }
];

function valid(field, value) {
  return Number.isSafeInteger(value) && value >= field.minimum;
}

function settings(authored) {
  var result = {};
  fields.forEach(function (field) {
    var value = authored && authored[field.key];
    result[field.key] = valid(field, value) ? value : field.initial;
  });
  return result;
}

function read(component) {
  var result = {};
  fields.forEach(function (field) {
    if (component[field.component] !== undefined) result[field.key] = component[field.component];
  });
  return result;
}

function apply(component, authored) {
  var schedule = settings(authored);
  fields.forEach(function (field) {
    component[field.component] = schedule[field.key];
  });
}

function issues(authored) {
  if (authored === undefined) return [];
  if (!authored || typeof authored !== "object" || Array.isArray(authored)) return ["Silver offer schedule must be an object."];
  return fields.filter(function (field) {
    return authored[field.key] !== undefined && !valid(field, authored[field.key]);
  }).map(function (field) {
    return field.label + " for the Silver offer must be a whole number of at least " + field.minimum + ".";
  });
}

function appears(schedule, wave) {
  var offset = wave - schedule.firstWave;
  return Number.isSafeInteger(wave) && offset >= 0 && offset % schedule.interval === 0 && offset / schedule.interval < schedule.count;
}

exports.fields = fields;
exports.settings = settings;
exports.read = read;
exports.apply = apply;
exports.issues = issues;
exports.appears = appears;
