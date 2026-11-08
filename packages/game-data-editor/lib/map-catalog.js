'use strict';

// Runtime prefabs with authored spawn lanes. Numeric gaps are intentional:
// stages may share maps, while Stage 7 has its own environment.
const maps = Object.freeze({
    Map01: Object.freeze({ name: 'Map01', lanes: 9 }),
    Map02: Object.freeze({ name: 'Map02', lanes: 12 }),
    Map03: Object.freeze({ name: 'Map03', lanes: 12 }),
    Map04: Object.freeze({ name: 'Map04', lanes: 15 }),
    Map07: Object.freeze({ name: 'Map07 · Stage 7 · Ashen Pass', lanes: 12 })
});
const IDS = Object.freeze(Object.keys(maps));
const generated = id => /^Generated\/Stages\/[ABD]-\d+$/.test(id);
const has = id => Object.prototype.hasOwnProperty.call(maps, id) || generated(id);
const lanes = id => Object.prototype.hasOwnProperty.call(maps,id) ? maps[id].lanes : generated(id) ? Number.MAX_SAFE_INTEGER : 0;
module.exports = { maps, IDS, has, lanes };
