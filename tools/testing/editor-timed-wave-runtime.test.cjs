'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {setup}=require('./backend-gameplay-harness.cjs'),AuthoredSpawnPlan=require('../../assets/_script/AuthoredSpawnPlan');
function fixture(wave){const missions=[],player={getMissionData:()=>({addAchNum:(...args)=>missions.push(args)}),getGameData:()=>({getRoundNum:()=>1,getCoin:()=>321})};const h=setup({AuthoredSpawnPlan,KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>player}}});Object.assign(h.d,{round:0,coin:20,levelCfg:{Level:1,WaveCfg:[wave]}});return{...h,missions};}
function timed(){return{Wave:1,id:1,StartSliver:17,CommerceSliver:3,SpawnTimeline:[{id:'first',spawnId:1,unitId:90001,count:2,startSeconds:.5,intervalSeconds:.75}]};}
const plain=value=>JSON.parse(JSON.stringify(value));
test('actual startup accepts editor timed-only waves without changing authored credits or emission times',()=>{
 const wave=timed(),before=JSON.stringify(wave),h=fixture(wave);h.d.loadMonster();assert.equal(h.d.round,1);assert.equal(h.d.coin,37);assert.equal(h.d.videoCoin,3);assert.equal(h.missions.length,1);assert.equal(h.missions[0][1],17);assert(h.d.authoredTimeline instanceof AuthoredSpawnPlan.Timeline);assert.deepEqual(plain(h.d.enemyQueue),{1:[{id:90001,num:2}]});
 const emitted=[];h.d.authoredTimeline.advance(.49,(...args)=>emitted.push(args));assert.equal(emitted.length,0);h.d.authoredTimeline.advance(.01,(...args)=>emitted.push(args));assert.deepEqual(emitted,[[90001,1,null]]);h.d.authoredTimeline.advance(.75,(...args)=>emitted.push(args));assert.equal(emitted.length,2);assert(!h.d.authoredTimeline.pending());assert.equal(JSON.stringify(wave),before);
});
test('checkpoint load and setRound do not parse ignored legacy fields or replay timed-wave credits',()=>{
 for(const mode of ['restore','setRound']){const wave=timed();Object.defineProperty(wave,'RefreshSoldierKind',{get(){throw Error('Ignored legacy queue was read');}});const h=fixture(wave);h.d.coin=321;if(mode==='restore')h.d.loadMonster(true);else h.d.setRound();assert.equal(h.d.coin,321);assert.equal(h.d.round,1);assert.equal(h.missions.length,0);assert(h.d.authoredTimeline instanceof AuthoredSpawnPlan.Timeline);assert.deepEqual(plain(h.d.enemyQueue),{1:[{id:90001,num:2}]});}
});
test('legacy startup and restore retain exact last-lane, wait and credit semantics without a timed override',()=>{
 const wave={Wave:1,id:1,StartSliver:17,CommerceSliver:3,RefreshSoldierKind:['1#90001,9','1#-1,2;90002,1','2#90003,4']},before=JSON.stringify(wave),h=fixture(wave),expected={1:[{id:-1,num:2},{id:90002,num:1}],2:[{id:90003,num:4}]};h.d.loadMonster();assert.equal(h.d.coin,37);assert.equal(h.d.authoredTimeline,null);assert.deepEqual(plain(h.d.enemyQueue),expected);h.d.setRound();assert.equal(h.d.coin,321);assert.equal(h.d.authoredTimeline,null);assert.deepEqual(plain(h.d.enemyQueue),expected);assert.equal(h.missions.length,1);assert.equal(JSON.stringify(wave),before);
});

function settings() {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../assets/_script/WaveTestSettings.js'), 'utf8'),
    { exports, require: () => AuthoredSpawnPlan });
  return exports;
}

test('wave test settings change the real timeline and enemy multipliers for only the selected wave', () => {
  const wave = { ...timed(), HealthCoefficient: 1.4, AttackCoefficient: 1.2 };
  wave.SpawnTimeline[0].routeGraphId = 'alternate';
  wave.SpawnTimeline.push({ id: 'one-shot', spawnId: 3, unitId: 90002, count: 1, startSeconds: 8, intervalSeconds: 0 });
  Object.defineProperty(wave, 'RefreshSoldierKind', { get() { throw Error('Unused legacy schedule'); } });
  const before = plain(wave), h = fixture(wave), Edit = settings();
  h.d.levelCfg.WaveCfg.push({ ...timed(), HealthCoefficient: 2, AttackCoefficient: 1.5 });
  h.d.loadMonster();
  const testWave = Edit.adjustment(Edit.describe(h.d), '1,75', '0', ['3', '2'], .5);
  assert.equal(h.d.setWaveTest(testWave), true);
  assert.equal(h.d.getHpAdd(90001), 1.75);
  assert.equal(h.d.getAttAdd(), 0);
  const emitted = [];
  h.d.authoredTimeline.advance(.5, (...args) => emitted.push(args));
  assert.deepEqual(emitted, [[90001, 1, 'alternate']]);
  h.d.authoredTimeline.advance(8, (...args) => emitted.push(args));
  assert.equal(emitted.filter(([id]) => id === 90001).length, 3);
  assert.equal(emitted.filter(([id]) => id === 90002).length, 2);
  assert.deepEqual(plain(wave), before);
  h.d.loadMonster();
  assert.equal(h.d._waveTest, null);
  assert.equal(h.d.getAttAdd(), 1.5);
  assert.equal(h.d.setWaveTest(testWave), false);
});

test('wave test counts support disabling one legacy group while preserving waits and validation', () => {
  const wave = { HealthCoefficient: 1, AttackCoefficient: 1, StartSliver: 0, CommerceSliver: 0,
    RefreshSoldierKind: ['1#90001,9', '1#-1,2;90002,6', '2#90003,4'] };
  const h = fixture(wave), Edit = settings();
  h.d.loadMonster();
  const model = Edit.describe(h.d);
  const testWave = Edit.adjustment(model, '1', '1', ['9', '0'], .5);
  h.d.setWaveTest(testWave);
  assert.deepEqual(plain(h.d.enemyQueue), { 1: [{ id: -1, num: 2 }, { id: 90002, num: 9 }] });
  assert.deepEqual(plain(Edit.describe(h.d).test.counts), [9, 0]);
  assert.throws(() => Edit.adjustment(model, '0', '1', ['9', '4'], .5), /greater than zero/);
  assert.throws(() => Edit.adjustment(model, '1', '1', ['1.5', '4'], .5), /whole number/);
  h.d.setWaveTest(Edit.adjustment(model, '1', '1', ['6', '4'], .5));
  assert.deepEqual(plain(h.d.enemyQueue), { 1: [{ id: -1, num: 2 }, { id: 90002, num: 6 }], 2: [{ id: 90003, num: 4 }] });
});
