'use strict';

const Objectives = require('../../../assets/_script/BattleTaskObjectives');
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const contains = (table, id) => !!table && Object.prototype.hasOwnProperty.call(table, id) && !!table[id];

function catalog(config, resolve) {
    function options(table, nameKey) {
        return Object.entries(table || {}).flatMap(([key, record]) => {
            const id = Number(key);
            if (!positiveId(id) || !record) return [];
            return [{id, label: resolve(record[nameKey]) || record.enumKey || String(id)}];
        });
    }
    const definitions = options(config.InGameTaskEnum, 'Name').concat(
        Objectives.definitions.map(({id, label, defaultCount}) => ({id, label, defaultCount, counted: true}))
    );
    const rewards = options(config.GoodsCfg, 'name');
    const defaults = {}, count = {}, random = {};
    for (const group of [1, 2]) {
        const source = (config.InGameTaskCfg || [])[group - 1] || {};
        const ids = Array.isArray(source.MissionID) ? source.MissionID : [];
        const awards = Array.isArray(source.Award) ? source.Award : [];
        defaults[group] = ids.map((taskId, index) => {
            const award = awards[index] || awards[awards.length - 1];
            const [rewardId, amount] = Array.isArray(award) ? award : [];
            return {taskId, rewardId, amount};
        });
        random[group] = Number(source.MissionType) === 2;
        count[group] = random[group] && Number.isSafeInteger(source.MissionNumber)
            ? Math.max(0, Math.min(ids.length, source.MissionNumber)) : ids.length;
    }
    return {definitions, rewards, defaults, count, random};
}

function issues(tasks, config) {
    if (tasks === undefined) return [];
    if (!Array.isArray(tasks)) return [{path: [], message: 'Battle tasks must be a list.'}];
    const result = [];
    tasks.forEach((task, index) => {
        const name = 'Battle task ' + (index + 1);
        if (!task || typeof task !== 'object' || Array.isArray(task)) {
            result.push({path: [index], message: name + ' must include a task and reward.'});
            return;
        }
        const objective = Objectives.definition(task.taskId);
        if (!objective && (!positiveId(task.taskId) || !contains(config.InGameTaskEnum, task.taskId))) {
            result.push({path: [index, 'taskId'], message: name + ' must use an existing task.'});
        }
        if (objective && !positiveId(task.count)) {
            result.push({path: [index, 'count'], message: name + ' needs a positive whole target count.'});
        }
        if (!positiveId(task.rewardId) || !contains(config.GoodsCfg, task.rewardId)) {
            result.push({path: [index, 'rewardId'], message: name + ' must use an existing reward item.'});
        }
        if (!Number.isSafeInteger(task.amount) || task.amount < 0) {
            result.push({path: [index, 'amount'], message: name + ' needs a nonnegative whole reward amount.'});
        }
    });
    return result;
}

module.exports = {catalog, issues};
