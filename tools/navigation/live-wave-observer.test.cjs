'use strict';
// Actual wave/controller/resource methods with inert nodes, transport and timers.
// Importing the observer does not launch the live panel or touch player storage.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test');
const { setup, Node } = require('../testing/backend-gameplay-harness.cjs');
const { createWaveCompletionObserver } = require('./live-panel.js');

test('an injected non-browser Main module retains its exports and never boots the fixture', () => {
  const original = { default: function Main() {} }, module = { exports: original, filename: 'Main.js' };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'live-panel.js'), 'utf8'), { module });
  assert.equal(module.exports, original);
});

function prefab(id) {
  const asset = () => {
    const node = new Node();
    node.getComponent = () => ({ uuid: String(id), node, initData() {}, onUpdate() {} });
    return node;
  };
  asset.addRef = () => asset;
  return asset;
}
function attach(h) {
  const observer = createWaveCompletionObserver(h.d, () => h.g._combatEpoch);
  h.d.tryEndGame = observer.tryEndGame;
  observer.begin();
  return observer;
}
function resources(h) {
  const requests = [], failures = [], timers = new Set(), modules = {};
  const cc = h.e.cc;
  h.e.stubs.KinghtFallConfig.KinghtFallBundelName.Enemy = 'enemies';
  cc.Prefab = function Prefab() {};
  cc.js = { getClassName: type => 'cc.' + type.name };
  cc.assetManager = { getBundle: () => ({ load(name, type, done) { requests.push({ name, done }); } }) };
  Object.assign(modules, {
    BasePlatform: {}, PlatformManager: {}, PoolMgr: {},
    LogMgr: { LogMgr: { getInstance: () => ({ error() {} }) } },
    TimeUtils: { TimeUtils: { GetTimeBySecond: () => 0 } },
    ResCacheMgr: { ResCacheMgr: { getInstance: () => ({ getAssets: () => null, addAssets() {}, addAssetKeyToMap() {} }) } }
  });
  function load(name) {
    if (modules[name]) return modules[name];
    const exports = modules[name] = {};
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../assets/_script', name + '.js'), 'utf8'), {
      exports, cc, require: name => load(name), console: { error() {} },
      setTimeout(fn) { timers.add(fn); return fn; }, clearTimeout(fn) { timers.delete(fn); }
    });
    return exports;
  }
  const manager = load('ResourceMgr').ResourceMgr.getInstance();
  manager.loadErrorHandler = (error, retry) => failures.push({ error, retry });
  h.g.loadPrefab = (bundle, name, done) => manager.loadRes(bundle, name, cc.Prefab, done, true);
  return { requests, failures, timers };
}

test('diagnostic completion matches the actual production queued/live/pending and one-shot contract', () => {
  for (let mask = 0; mask < 8; mask++) for (const finalWave of [false, true]) {
    const production = setup(), diagnostic = setup();
    for (const h of [production, diagnostic]) {
      h.d.round = finalWave ? 2 : 1;
      h.d.enemyQueue = { 1: mask & 1 ? [{ id: -1, num: 1 }] : [] };
      h.d.enemyList = mask & 2 ? [{ uuid: 'alive' }] : [];
      h.d.pendingEnemySpawns = mask & 4 ? 1 : 0;
    }
    const observer = attach(diagnostic);
    production.d.tryEndGame(); diagnostic.d.tryEndGame();
    assert.equal(observer.report().waveFinished, production.d._roundCompleted === true);
    production.d.tryEndGame(); diagnostic.d.tryEndGame();
    assert.equal(observer.report().completionCount, mask ? 0 : 1);
    assert.equal(production.events.length, mask ? 0 : 1);
    if (!mask) assert.deepEqual(production.events[0], finalWave ? ['GameOver', true] : ['RoundEnd']);
    assert.deepEqual(diagnostic.events, [], 'the fixture suppresses only ending effects');
  }
});

test('an emptied spawn queue is not finished before the delayed final enemy loads and dies', () => {
  const h = setup(); h.d.packInterval = .5; h.d.enemyQueue = { 1: [{ id: 90001, num: 1 }] };
  const observer = attach(h);
  h.d.onUpdata(.6);
  assert.equal(h.d.enemyQueue[1].length, 0); assert.equal(h.d.enemyList.length, 0);
  assert.equal(h.d.pendingEnemySpawns, 1);
  assert.equal(!h.d.enemyList.length && !Object.keys(h.d.enemyQueue).some(key => h.d.enemyQueue[key].length), true,
    'negative control: the former live-panel predicate falsely passed this actual pending load');
  assert.equal(observer.report().waveFinished, false);
  h.pending[0](prefab(1)); h.d.tryEndGame(); assert.equal(observer.report().waveFinished, false);
  h.d.delEnemy(h.d.enemyList[0]); h.d.tryEndGame();
  assert.equal(observer.report().waveFinished, true); assert.equal(observer.report().completionCount, 1);
});

test('actual resource failure, stale callbacks and retry keep completion blocked until the enemy dies', () => {
  const h = setup(), r = resources(h);
  h.d.packInterval = .5; h.d.enemyQueue = { 1: [{ id: 90001, num: 1 }] };
  const observer = attach(h); h.d.onUpdata(.6);
  r.requests[0].done(Error('controlled prefab failure')); h.d.tryEndGame();
  assert.equal(r.failures.length, 1); assert.equal(observer.report().pendingEnemySpawns, 1);
  assert.equal(observer.report().waveFinished, false);
  r.failures[0].retry(); r.requests[0].done(null, prefab('obsolete'));
  r.requests[0].done(Error('duplicate failure')); h.d.tryEndGame();
  assert.equal(h.d.enemyList.length, 0); assert.equal(observer.report().waveFinished, false);
  r.requests[1].done(null, prefab('current')); r.requests[1].done(null, prefab('duplicate'));
  assert.equal(h.d.pendingEnemySpawns, 0); assert.equal(h.d.enemyList.length, 1);
  h.d.tryEndGame(); assert.equal(observer.report().waveFinished, false);
  h.d.delEnemy(h.d.enemyList[0]);
  assert.equal(observer.report().waveFinished, true); assert.equal(r.timers.size, 0);
});

test('teardown and a new wave cannot inherit an old completion or accept an obsolete prefab generation', () => {
  const h = setup(), observer = attach(h);
  h.d.tryEndGame(); assert.equal(observer.report().waveFinished, true);
  h.d.round = 2; assert.equal(observer.report().waveFinished, false, 'round identity changed');
  h.d.round = 1; h.d.enemyQueue = {}; assert.equal(observer.report().waveFinished, false, 'queue identity changed');
  h.d._roundCompleted = false; observer.begin();
  h.g.addEnemy(90001, 1); h.d.tryEndGame(); assert.equal(observer.report().waveFinished, false);
  observer.cancel(); h.g.cleanMap(); h.d.pendingEnemySpawns = 0; h.d._roundCompleted = false;
  h.d.enemyQueue = {}; observer.begin(); const generation = observer.report().generation;
  h.g.addEnemy(90001, 1); h.pending[0](prefab('old epoch'));
  assert.equal(h.d.enemyList.length, 0); assert.equal(h.d.pendingEnemySpawns, 1);
  h.d.tryEndGame(); assert.equal(observer.report().waveFinished, false);
  h.pending[1](prefab('current epoch')); h.d.delEnemy(h.d.enemyList[0]);
  assert.equal(observer.report().waveFinished, true); assert.equal(observer.report().generation, generation);
  observer.cancel(); h.d.tryEndGame(); assert.equal(observer.report().waveFinished, false);
});
