'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, Node, distance } = require('../navigation/runtime-harness.cjs');
const authored = require('../../assets/KinghtFallConfig/GameJsonCfg.json');

const families = ['KinghtFallEnemyLong', 'KinghtFallEnemyItem03', 'KinghtFallEnemyItem05', 'KinghtFallEnemyItem08'];
function fixture(kind = 'KinghtFallEnemyItem03', settings) {
  const e = environment(), unit = e.actor(kind, 0, 0);
  e.game.mapSize = { width: 1000, height: 1000 };
  e.game._combatEpoch = 1; e.game.gameStatus = 1;
  e.stubs.KinghtFallModle.KinghtFallSoldierAniEnum.Attack = 'attack';
  e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data = settings ? { GameTools: settings } : {};
  unit.cfg = { ...authored.SoldierCfg[92039] };
  unit.node._combatGeneration = 1;
  unit.time.Attack = 1;
  unit.bornInfo = { nodeIndex: 0, pathList: [new Node('objective', e.game.ndMain, 300, 0)] };
  const renderer = unit.spAni = {
    node: new Node('renderer', unit.node),
    setCompleteListener(done) { this.complete = done; },
    setAnimation(_track, name) { return this.entry = { animation: { name, duration: .5 }, trackTime: 0, timeScale: 1 }; },
    getCurrent() { return this.entry; }
  };
  unit.onLoad();
  const releases = [];
  unit.doAttack = function () { releases.push(this.time.Attack); };
  return { e, unit, renderer, releases, overrides: e.load('GameToolsOverrides') };
}

test('Fire Lizard and every ranged family finish repeated attacks and resume route movement when targets leave', () => {
  for (const kind of families) {
    const f = fixture(kind), { unit, renderer } = f;
    for (let cycle = 0; cycle < 2; cycle++) {
      unit.doAttackStart();
      assert.equal(unit.state, 2, kind + ' did not start attacking');
      const entry = renderer.entry;
      renderer.complete(entry);
      assert.equal(unit.state, 0, kind + ' remained frozen in Attack after its clip finished');
      assert.equal(unit._attackAnimation, null);
      renderer.complete(entry);
      assert.equal(unit.state, 0, 'duplicate completion changed the released state');
    }
    assert.deepEqual(f.releases, [0, 0], 'legacy ranged cooldown must begin before synchronous damage');
    unit.onUpdate(.1);
    assert.equal(unit.state, 1, kind + ' did not resume its authored route');
    const before = unit.node.position;
    // Navigation may finish its bounded search on a following managed frame.
    for (let frame = 0; frame < 8 && distance(before, unit.node) === 0; frame++) {
      f.e.nav.beginFrame(f.e.game); unit.onUpdate(.1);
    }
    assert(distance(before, unit.node) > 0, kind + ' stayed stationary after losing its combat target');
  }
});

test('ranged cooldown starts with the animation while saved defaults and custom windups retain their exact release times', () => {
  for (const kind of families) for (const custom of [false, true]) {
    const key = 'enemy:92039:default';
    const settings = { timingDefaults: { [key]: { attack: .4 } } };
    if (custom) settings.timings = { [key]: { attack: .8 } };
    const f = fixture(kind, settings), delay = custom ? .8 : .4;
    f.unit.doAttackStart();
    assert.equal(f.unit.time.Attack, 0, kind + ' inherited the melee release sentinel');
    assert.equal(f.overrides.isPending(f.unit), true);
    f.overrides.tick(delay - .01, true);
    assert.equal(f.releases.length, 0, 'authored windup released early');
    f.overrides.tick(.01, true);
    assert.deepEqual(f.releases, [0]);
    assert.equal(f.overrides.isPending(f.unit), false);
    f.renderer.complete(f.renderer.entry);
    assert.equal(f.unit.state, 0);
  }
});

test('finishing a ranged clip keeps a later authored hit pending and cannot schedule a duplicate attack', () => {
  for (const kind of families) {
    const f = fixture(kind, { timings: { 'enemy:92039:default': { attack: .8 } } });
    f.unit.doAttackStart(); const first = f.renderer.entry;
    f.overrides.tick(.5, true); f.renderer.complete(first);
    assert.equal(f.unit.state, 0);
    f.unit.doAttackStart();
    assert.equal(f.renderer.entry.animation.name, 'idle', 'pending authored hit allowed another attack');
    f.overrides.tick(.3, true);
    assert.deepEqual(f.releases, [0], kind + ' lost its queued hit after animation completion');
    assert.equal(f.overrides.isPending(f.unit), false);
  }
});

const retirements = {
  generation: f => f.unit.node._combatGeneration++,
  pooled: f => f.unit._isPooled = true,
  node: f => f.unit.node = new Node(),
  timers: f => f.unit.time = {},
  epoch: f => f.e.game._combatEpoch++,
  phase: f => f.e.game.gameStatus = 0,
  data: f => f.e.game.gameData = {},
  ui: f => f.e.stubs.KinghtFallUIGame.default.instance.isclose = true,
  renderer: f => f.renderer.destroyed = true
};
test('ranged completion uses only its own current TrackEntry and rejects retired battle, actor and renderer lifetimes', () => {
  for (const kind of families) {
    const current = fixture(kind); let completed = 0;
    current.unit.doAttackFinish = () => completed++;
    current.unit.doAttackStart(); const old = current.renderer.entry;
    current.unit.doAttackStart(); const active = current.renderer.entry;
    current.renderer.complete(old); assert.equal(completed, 0, kind + ' accepted an older attack');
    current.renderer.complete(active); current.renderer.complete(active); assert.equal(completed, 1);
    for (const [name, retire] of Object.entries(retirements)) {
      const f = fixture(kind); let finished = 0;
      f.unit.doAttackFinish = () => finished++;
      f.unit.doAttackStart(); const entry = f.renderer.entry;
      retire(f); f.renderer.complete(entry);
      assert.equal(finished, 0, kind + ' accepted retired ' + name);
    }
  }
});

test('a disposed ranged renderer is never sent a new native animation', () => {
  for (const kind of families) {
    const f = fixture(kind); f.renderer.destroyed = true;
    f.renderer.setAnimation = () => assert.fail('disposed native animation setter');
    assert.doesNotThrow(() => f.unit.doAttackStart());
    assert.equal(f.releases.length, 0);
    assert.equal(f.unit.time.Attack, 1);
  }
});

test('shared melee attacks retain their release sentinel and existing completion lifecycle', () => {
  const f = fixture('KinghtFallEnemyItem02');
  f.unit.doAttackStart(); assert.deepEqual(f.releases, [-1]);
  f.renderer.complete(f.renderer.entry); assert.equal(f.unit.state, 0);
});
