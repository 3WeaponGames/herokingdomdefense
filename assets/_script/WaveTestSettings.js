"use strict";

var SpawnPlan = require("AuthoredSpawnPlan");

function groups(wave, legacy) {
  var rows = [];
  if (Array.isArray(wave.SpawnTimeline)) {
    wave.SpawnTimeline.forEach(function (row, index) {
      if (row.unitId > 0) rows.push({
        index: index, spawnId: row.spawnId, unitId: row.unitId, count: row.count,
        start: row.startSeconds, interval: row.intervalSeconds
      });
    });
  } else {
    Object.keys(legacy).forEach(function (spawn) {
      legacy[spawn].forEach(function (row, index) {
        if (row.id > 0) rows.push({ index: index, spawnId: Number(spawn), unitId: row.id, count: row.num });
      });
    });
  }
  return rows;
}

function describe(data) {
  var stage = data.levelCfg, wave = stage.WaveCfg[data.round - 1];
  var test = data._waveTest;
  if (test && (test.stage !== stage.Level || test.round !== data.round)) test = null;
  var rows = groups(wave, Array.isArray(wave.SpawnTimeline) ? null : SpawnPlan.legacyQueue(wave.RefreshSoldierKind));
  return { stage: stage.Level, round: data.round, wave: wave, rows: rows, test: test };
}

function number(value, whole) {
  var text = String(value).trim();
  var valid = whole ? /^\d+$/.test(text) : /^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(text);
  return valid ? Number(text.replace(",", ".")) : NaN;
}

function adjustment(model, hpInput, damageInput, countInputs, packInterval) {
  var hp = number(hpInput, false), damage = number(damageInput, false);
  if (!isFinite(hp) || hp <= 0) throw Error("Enemy HP multiplier must be greater than zero.");
  if (!isFinite(damage) || damage < 0) throw Error("Enemy damage multiplier must be zero or greater.");
  if (countInputs.length !== model.rows.length) throw Error("The wave groups changed. Reopen the panel.");
  var counts = model.rows.map(function (row, index) {
    var count = number(countInputs[index], true);
    if (!Number.isSafeInteger(count) || count < 0) throw Error("Enter a whole number for the enemy count in group " + (index + 1) + ".");
    return count;
  });
  var original = model.wave;
  var countsChanged = counts.some(function (count, index) { return count !== model.rows[index].count; });
  if (countsChanged && !counts.some(function (count) { return count > 0; })) throw Error("Leave at least one enemy in the wave.");
  if (!countsChanged && hp === original.HealthCoefficient && damage === original.AttackCoefficient) return null;
  var active = model.test;
  if (active && hp === active.wave.HealthCoefficient && damage === active.wave.AttackCoefficient &&
      counts.every(function (count, index) { return count === active.counts[index]; })) return active;
  var wave = { HealthCoefficient: hp, AttackCoefficient: damage };
  var defaultInterval = isFinite(packInterval) && packInterval > 0 ? packInterval : .5;
  if (Array.isArray(original.SpawnTimeline)) {
    var timeline = original.SpawnTimeline.slice();
    model.rows.forEach(function (row, index) {
      var count = counts[index];
      if (count === row.count) return;
      var interval = count > 1 && row.interval === 0 ? defaultInterval : row.interval;
      if (count > 0 && !isFinite(row.start + (count - 1) * interval)) throw Error("The timing for enemy group " + (index + 1) + " is too large.");
      timeline[row.index] = Object.assign({}, timeline[row.index], { count: count, intervalSeconds: interval });
    });
    wave.SpawnTimeline = timeline;
  } else if (!countsChanged) wave.RefreshSoldierKind = original.RefreshSoldierKind;
  else {
    var queue = SpawnPlan.legacyQueue(original.RefreshSoldierKind);
    model.rows.forEach(function (row, index) { queue[row.spawnId][row.index].num = counts[index]; });
    wave.RefreshSoldierKind = Object.keys(queue).map(function (spawn) {
      var entries = queue[spawn].filter(function (entry) { return entry.id <= 0 || entry.num > 0; });
      return entries.length ? spawn + "#" + entries.map(function (entry) { return entry.id + "," + entry.num; }).join(";") : "";
    });
  }
  return { stage: model.stage, round: model.round, counts: counts, wave: wave };
}

exports.describe = describe;
exports.adjustment = adjustment;
