'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const battleMusic = require('../../assets/_script/BattleMusic');
const depthSource = fs.readFileSync(path.join(__dirname, '../../assets/_script/KinghtFallDepthView.js'), 'utf8');

function fixture() {
  let frame = 0, delta = 1 / 60;
  const gameData = { round: 1, levelCfg: { EnemyProfiles: { 91002: { baseId: 91001 } } } };
  const config = { SoldierCfg: {}, GameTools: { enemyClasses: { 'enemy:91001:default': 'elite' } } };
  const cc = { director: { getTotalFrames: () => frame, getDeltaTime: () => delta } };
  const context = vm.createContext({ cc, sp: {}, exports: {}, require(name) {
    if (name === 'BattleMusic') return battleMusic;
    assert.equal(name, 'KinghtFallDataMgr');
    return { KinghtFallDataMgr: { getInstance: () => ({ data: config }) } };
  } });
  const api = vm.runInContext(depthSource + '\n({ ordinarySilhouetteActors, recordSilhouetteHint, matchOcclusion, DepthView, ALLY, ENEMY })', context);
  const view = { game: { gameData, _combatEpoch: 1 } };
  const entry = (id, tint) => ({ tint, actor: { node: { activeInHierarchy: true }, cfg: { ID: id } } });
  const priority = [
    entry(70001, api.ALLY), entry(70002, api.ALLY),
    entry(91002, api.ENEMY), entry(90010, api.ENEMY), entry(undefined, api.ENEMY)
  ];
  const crowd = priority.concat(Array.from({ length: 65 }, () => entry(91003, api.ENEMY)));
  return {
    view, gameData, priority, crowd, context, api,
    current: (actors = crowd) => api.ordinarySilhouetteActors(view, actors),
    step(dt, actors = crowd, optionalHints = 2) {
      for (let i = 0; i < optionalHints; i++) api.recordSilhouetteHint(view, crowd[crowd.length - 1]);
      frame++;
      delta = dt;
      return api.ordinarySilhouetteActors(view, actors);
    }
  };
}

test('healthy crowded frames and repeated draws in one frame preserve ordinary silhouettes', () => {
  const f = fixture();
  for (let frame = 0; frame < 48; frame++) assert.equal(f.step(1 / 60), f.crowd);
  assert.equal(f.step(.15), f.crowd);
  for (let frame = 0; frame < 23; frame++) assert.equal(f.step(1 / 60), f.crowd);
  for (let frame = 0; frame < 23; frame++) {
    assert.equal(f.step(.024), f.crowd);
    assert.equal(f.current(), f.crowd);
  }
  assert.deepEqual(Array.from(f.step(.024)), f.priority);
});

test('slow crowded frames preserve all detail when few optional silhouettes draw', () => {
  const f = fixture();
  for (let frame = 0; frame < 48; frame++) {
    for (const entry of f.priority) f.api.recordSilhouetteHint(f.view, entry);
    assert.equal(f.step(.024, f.crowd, frame % 5 === 0 ? 2 : 0), f.crowd);
  }
  for (let frame = 0; frame < 24; frame++) f.step(.024);
  assert.deepEqual(Array.from(f.current()), f.priority);
});

test('a medium crowd keeps its optional silhouettes even when rendering slows down', () => {
  const f = fixture();
  const actors = f.crowd.slice(0, 50);
  for (let frame = 0; frame < 48; frame++) assert.equal(f.step(.03, actors), actors);
  assert.equal(f.view._silhouetteBudget, null);
});

test('slow crowded fights retain important silhouettes and restore full detail as crowds or waves change', () => {
  const f = fixture();
  for (let frame = 0; frame < 24; frame++) f.step(.021);
  assert.deepEqual(Array.from(f.current()), f.priority);
  assert.deepEqual(Array.from(f.step(1 / 60, f.crowd.slice(0, 55))), f.priority);
  const smaller = f.crowd.slice(0, 47);
  assert.equal(f.step(.021, smaller), smaller);
  for (let frame = 0; frame < 24; frame++) f.step(.021);
  assert.deepEqual(Array.from(f.current()), f.priority);
  f.gameData.round++;
  assert.equal(f.step(.021), f.crowd);
});

test('the adaptive draw still sends every living actor to the gate renderer', () => {
  const f = fixture();
  for (let frame = 0; frame < 24; frame++) f.step(.021);
  f.view.game.ctrPlay = f.crowd[0].actor;
  f.gameData.getSoldierList = () => [f.crowd[1].actor];
  f.gameData.getEnemyList = () => f.crowd.slice(2).map(entry => entry.actor);
  let gateActors;
  Object.assign(f.view, {
    main: { activeInHierarchy: true },
    sort() {}, objects: [],
    gateOcclusion: { update(entries) { gateActors = Array.from(entries, entry => entry.actor); } }
  });
  vm.runInContext(`
    actorGroundPoint = function () { return { x: 0, y: 0 }; };
    matchOcclusion = function (_view, entries, _candidates, _visible, _cache, _footprints, priority) {
      ordinaryActors = entries.filter(function(entry) { return priority.has(entry); }).map(function(entry) { return entry.actor; });
    };
  `, f.context);
  f.api.DepthView.prototype.update.call(f.view);
  assert.deepEqual(Array.from(f.context.ordinaryActors), f.priority.map(entry => entry.actor));
  assert.deepEqual(gateActors, f.crowd.map(entry => entry.actor));
});

test('adaptive detail retains foreground corrections and skips optional tints behind scenery', () => {
  const f = fixture();
  const box = { minX: 0, maxX: 20, minY: 0, maxY: 80 };
  f.context.fixtureBox = box;
  vm.runInContext(`bodyVisuals = function () { return [{}]; }; bounds = function () { return fixtureBox; };`, f.context);
  const [priority, ahead, behind] = [f.priority[0], ...f.crowd.slice(-2)];
  for (const entry of [priority, ahead, behind]) entry.feet = { x: 10, y: 20 };
  priority.actor.node.zIndex = behind.actor.node.zIndex = 0;
  ahead.actor.node.zIndex = 8;
  const occluder = { box, ground: 0, object: { node: { zIndex: 4 } }, hidden: [] };
  f.api.matchOcclusion(f.view, [priority, ahead, behind], [occluder], null, {}, new Map(), new Set([priority]));
  assert.deepEqual(occluder.hidden, [priority, ahead]);
  assert.equal(behind.bounds, undefined);
});
