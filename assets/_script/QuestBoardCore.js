"use strict";
var CAPACITY = 3;
function create(cfg) {
  var task = { id: cfg.ID, type: cfg.MissionType, num: 0, stage: 0 };
  if (cfg.RoleQuest) {
    task.type = 11;
    task.definition = { ID: cfg.ID, MissionType: 11, MissionDescribe: cfg.RoleQuest.description, Argument: [cfg.RoleQuest.count], Award: cfg.Award.slice(), UnitType: cfg.RoleQuest.unitType };
  }
  return task;
}
function definition(task, getConfig) { return task.definition || getConfig(task.id); }
function syncLegacy(data) {
  if (data.quests.length) data.taskInfo = data.quests[0];
  else if (data.taskInfo) data.taskInfo.stage = 2;
}
function initialize(data, getConfig) {
  if (Array.isArray(data.quests)) return false;
  var old = data.taskInfo, next = old && old.id || 1;
  if (old && old.stage === 2) next++;
  data.quests = [];
  for (; data.quests.length < CAPACITY; next++) {
    var cfg = getConfig(next); if (!cfg) break;
    data.quests.push(old && old.id === next && old.stage !== 2 ? old : create(cfg));
  }
  data.questCursor = next;
  syncLegacy(data); return true;
}
function progress(task, cfg, context) {
  var count = task.num || 0, total = cfg.Argument[0] || 1;
  switch (cfg.MissionType) {
    case 1: count = Math.max(0, context.stage - 1); break;
    case 2: total = 1; count = context.stage > cfg.Argument[0] || context.stage === cfg.Argument[0] && context.wave >= cfg.Argument[1] ? 1 : 0; break;
    case 3: count = context.equipmentUpgrades || 0; break;
    case 4: count = context.equipmentLevel || 0; break;
    case 5: count = context.talentUpgrades || 0; break;
    case 6: count = context.unlockedBuffs || 0; break;
    case 8: count = context.treasureUpgrades || 0; break;
  }
  if (task.stage === 1) count = Math.max(count, total);
  return { num: count, total: total, ready: task.stage === 1 || count >= total };
}
function refresh(data, getConfig, context) {
  var changed = false;
  data.quests.forEach(function (task) {
    var cfg = definition(task, getConfig); if (!cfg || task.stage === 1) return;
    var result = progress(task, cfg, context);
    if (result.ready) { task.stage = 1; changed = true; }
  });
  syncLegacy(data); return changed;
}
function record(data, type, amount, maximum, unitType) {
  var changed = false;
  data.quests.forEach(function (task) {
    var match = task.type === type || type === 10 && task.type === 11 && task.definition && task.definition.UnitType === unitType;
    if (!match || task.stage !== 0) return;
    var next = maximum ? Math.max(task.num, amount) : task.num + amount;
    if (next !== task.num) { task.num = next; changed = true; }
  });
  syncLegacy(data); return changed;
}
function claim(data, id, getConfig) {
  var index = data.quests.findIndex(function (task) { return task.id === id && task.stage === 1; });
  if (index < 0) return false;
  var next = Math.max(data.questCursor || 1, data.quests.reduce(function (max, task) { return Math.max(max, task.id + 1); }, 1));
  var cfg = getConfig(next);
  if (cfg) { data.quests[index] = create(cfg); data.questCursor = next + 1; }
  else data.quests.splice(index, 1);
  syncLegacy(data); return true;
}
exports.CAPACITY = CAPACITY;
exports.definition = definition;
exports.initialize = initialize;
exports.progress = progress;
exports.refresh = refresh;
exports.record = record;
exports.claim = claim;
