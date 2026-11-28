'use strict';

const Classes = require('../lib/enemy-classes');
const Records = require('../lib/unit-records');
const {recordTraits} = require('../worlds/wave-threat');
const Targeting = require('../../../assets/_script/EnemyTargeting');
const {definitions} = require('../../../assets/_script/EnemySkills');
const UnitPower = require('../../../tools/balance/unit-combat-power.cjs');

const skillNames = new Map(definitions.map(({id, label}) => [id, label]));
const classOrder = new Map(Classes.CHOICES.map(({value}, index) => [value, index]));

function fromRecord(record, id, side = 'enemy') {
    const traits = recordTraits(record, id);
    const enemy = side === 'enemy';
    const skillLabels = enemy ? traits.skills.map(skill => skillNames.get(skill)) : [];
    const legacyTransform = Records.boss(Records.behavior(record, id)) && Number(record.Data?.[0]) === 1;
    if (enemy && (record.TransformSkill || legacyTransform)) skillLabels.unshift('Transform Self');
    return {
        ...traits, skillLabels,
        cp: UnitPower.calculate({...record, side}).cp,
        targeting: enemy ? Targeting.settings(record) : null
    };
}

function comparePower(left, right) {
    const tier = (classOrder.get(left.enemyClass) ?? 0) - (classOrder.get(right.enemyClass) ?? 0);
    return tier || (left.cp ?? Number.MAX_VALUE) - (right.cp ?? Number.MAX_VALUE);
}

module.exports = {fromRecord, comparePower};
