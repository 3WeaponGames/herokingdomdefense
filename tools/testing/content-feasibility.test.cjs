'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const catalog = require('../../assets/resources/localization/catalog.json');
const limits = {
  chapter: config.LevelCfg.length,
  equipment: config.EquipCfg.reduce((sum, track) => sum + track.levelInfo.length - 1, 0),
  relics: config.TreasureCfg.length,
  relicUpgrades: config.TreasureCfg.reduce((sum, track) => sum + track.levelInfo.length - 1, 0)
};

test('Finite campaign, equipment and relic goals fit shipped content', () => {
  const taskCaps = { 1: limits.chapter, 3: limits.equipment, 6: limits.relics };
  const achievementCaps = { 3: limits.chapter, 4: limits.relics, 5: limits.relicUpgrades, 7: limits.equipment };
  for (const task of config.TaskCfg) {
    if (taskCaps[task.MissionType]) assert(task.Argument[0] <= taskCaps[task.MissionType], `Mission ${task.ID} exceeds content`);
  }
  for (const achievement of config.AchievementCfg) {
    if (achievementCaps[achievement.Type]) assert(achievement.Argument <= achievementCaps[achievement.Type], `Achievement ${achievement.ID} exceeds content`);
  }
});

test('Achievement milestones increase and descriptions match their requirements', () => {
  const last = {};
  for (const row of config.AchievementCfg) {
    assert(row.Argument > (last[row.Type] || 0), `Achievement ${row.ID} is not increasing`);
    last[row.Type] = row.Argument;
    if (![4, 5, 7].includes(row.Type)) continue;
    const entry = catalog.entries[row.Describe.slice(6, -2)];
    for (const locale of ['en', 'zh']) assert.equal(Number(/<color=[^>]+>\s*(\d+)/.exec(entry[locale])?.[1]), row.Argument, `${row.ID} ${locale} says the wrong goal`);
  }
});
