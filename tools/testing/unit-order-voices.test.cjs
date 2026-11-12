'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./unit-voice-harness.cjs');
const NAMES = { 90001: 'royal-knight', 90002: 'heavy-infantry', 90003: 'crossbowman', 90004: 'cavalry' };
const BIOMES = ['forest', 'deep-forest', 'autumn', 'desert', 'snow', 'ice', 'fire', 'lava'];

test('rally and follow have three shared variants for every unit, independent of tier', () => {
  for (const [unit, name] of Object.entries(NAMES)) {
    for (const action of ['rally', 'follow']) for (const tier of [1, 2, 3]) {
      const rolls = [], f = fixture({ random: () => rolls.shift() ?? .1 }), soldier = f.responder(Number(unit), tier);
      if (action === 'rally') soldier._followSelected = false;
      for (const [n, pick] of [.1, .1, .99, .1].entries()) {
        rolls.push(.1, pick);
        assert.equal(f.voices[action](f.game, [soldier]), true); f.finishAll();
        assert(f.played[n].file.endsWith(name + '-' + action + '-variant-' + [1, 2, 3, 1][n]));
        assert.equal(f.played[n].loop, false); assert.equal(f.played[n].source.mute, true);
        f.end();
      }
      assert.equal(f.manager.audioSourceMap.size, 1);
    }
  }
});

test('mixed armies choose uniformly among participating types rather than troop count', () => {
  for (const pick of [.1, .4, .6, .9]) {
    const rolls = [pick, .1], f = fixture({ random: () => rolls.shift() ?? .1 }); f.game.isAgg = false;
    const infantry = Array.from({ length: 99 }, () => f.responder()), heavy = f.responder(90002), archer = f.responder(90003), horse = f.responder(90004);
    const expected = Object.values(NAMES)[Math.floor(pick * 4)];
    assert(f.voices.rally(f.game, [...infantry, heavy, archer, horse, ...infantry])); f.finishAll();
    assert.equal(f.played.length, 1); assert(f.played[0].file.includes('/' + expected + '/'));
  }
});

test('only living current friendly recipients can speak; invalid requests allocate nothing', () => {
  const f = fixture(), dead = f.responder(), pooled = f.responder(), hidden = f.responder(), unknown = f.responder(99999), follower = f.responder();
  dead.hp = 0; pooled._isPooled = true; hidden.node.activeInHierarchy = false;
  const enemy = { ...f.responder(90003) };
  assert.equal(f.voices.rally(f.game, [dead, pooled, hidden, unknown, follower, enemy]), false);
  f.game.isAgg = false; assert.equal(f.voices.follow(f.game, [follower]), false);
  assert.equal(f.game._unitVoices, undefined); assert.equal(f.pending.length, 0);
});

test('rally and follow spam share one lock while loading and speaking and never queue a backlog', () => {
  const f = fixture(), rally = f.responder(), follow = f.responder(90003); rally._followSelected = false;
  assert(f.voices.rally(f.game, [rally]));
  for (let i = 0; i < 20; i++) {
    assert.equal(f.voices.rally(f.game, [rally]), false);
    assert.equal(f.voices.follow(f.game, [follow]), false);
  }
  assert.equal(f.pending.length, 1); f.finishAll();
  f.advance(30000); assert.equal(f.voices.follow(f.game, [follow]), false);
  assert.equal(f.played.length, 1); assert.equal(f.game._unitVoices.queue.length, 0);
  f.end(); assert(f.voices.follow(f.game, [follow])); f.finishAll();
  assert.equal(f.played.length, 2); assert(f.played[1].file.includes('crossbowman-follow-variant-'));
  f.advance(30000); f.voices.tick(f.game); assert(f.game._unitVoices.active);
  f.end(); f.voices.tick(f.game); f.advance(30000); f.voices.tick(f.game); f.finishAll();
  assert.equal(f.played.length, 2); assert.equal(f.manager.audioSourceMap.size, 1);
});

test('speaking continues when the responding soldier dies, is recycled, or stops following', () => {
  const f = fixture(), unit = f.responder(); f.voices.follow(f.game, [unit]); f.finishAll();
  unit.hp = 0; unit._followSelected = false; unit.node._combatGeneration++; f.game.isAgg = false;
  f.voices.tick(f.game); assert.equal(f.played[0].source.state, 1); assert(f.game._unitVoices.active);
  f.end(); f.voices.tick(f.game); assert.equal(f.game._unitVoices.active, null);
});

test('barracks and command voices use the same channel and speaking survives another upgrade', () => {
  const f = fixture(), unit = f.responder(90003), building = f.building();
  f.voices.announce(building); assert.equal(f.voices.follow(f.game, [unit]), false); f.finishAll();
  building.index = 2; building.buildInfo.cfg.level = 2; f.voices.announce(building); f.voices.tick(f.game);
  assert.equal(f.played.length, 1); assert.equal(f.played[0].source.state, 1);
  f.end(); f.voices.tick(f.game); f.finishAll(); assert.equal(f.played.length, 2);
  f.end(); assert(f.voices.follow(f.game, [unit])); f.finishAll();
  f.voices.announce(f.building(90004)); f.voices.tick(f.game); assert.equal(f.played.length, 3);
  f.end(); f.voices.tick(f.game); f.finishAll(); assert.equal(f.played.length, 4);
  assert.equal(new Set(f.played.map(p => p.source)).size, 1);
});

for (const [label, invalidate] of [
  ['death', (_f, u) => u.hp = 0], ['pool reuse', (_f, u) => u.node._combatGeneration++],
  ['removed friendly', f => f.game.gameData.getSoldierList().splice(0)],
  ['follow released', (_f, u) => u._followSelected = false], ['follow mode off', f => f.game.isAgg = false],
  ['pause', f => f.voices.suspend(f.game, true)], ['hide', f => f.hide()],
  ['battle retirement', f => f.game._combatEpoch++], ['closed battle', f => f.ui.isclose = true],
  ['mute and restore', f => { f.manager.setEffectVolume(0); f.manager.setEffectVolume(.5); }]
]) test('a pending follow response stays silent after ' + label, () => {
  const f = fixture(), unit = f.responder(); assert(f.voices.follow(f.game, [unit]));
  invalidate(f, unit); f.finishAll(); f.voices.tick(f.game);
  assert.equal(f.played.length, 0); assert.equal(f.manager.audioSourceMap.size, 0);
});

test('a command load expires quickly and a stale callback cannot replace a newer voice', () => {
  const f = fixture(), first = f.responder(), second = f.responder(90004);
  f.voices.follow(f.game, [first]); f.advance(1500); f.voices.tick(f.game);
  assert.equal(f.game._unitVoices.active, null); assert(f.voices.follow(f.game, [second]));
  f.finishAll(); assert.equal(f.played.length, 1); assert(f.played[0].file.includes('cavalry-follow-'));
});

test('a group can respond if one member dies before loading, but not if all members are stale', () => {
  const f = fixture(), first = f.responder(), second = f.responder(); f.voices.follow(f.game, [first, second]);
  first.hp = 0; f.finishAll(); assert.equal(f.played.length, 1);
  f.end(); second.hp = 0; assert.equal(f.voices.follow(f.game, [first, second]), false);
});

test('all eight biomes use the correct shared easter egg for every unit and all three actions', () => {
  for (const biome of BIOMES) for (const [unit, name] of Object.entries(NAMES))
    for (const action of ['build', 'follow', 'rally']) for (const tier of [1, 2, 3]) {
      const f = fixture({ biome }), soldier = f.responder(Number(unit), tier); soldier._followSelected = action === 'follow';
      if (action === 'build') { assert(f.voices.announce(f.building(Number(unit), tier))); f.voices.tick(f.game); }
      else assert(f.voices[action](f.game, [soldier]));
      f.finishAll(); assert.equal(f.played.length, 1);
      assert(f.played[0].file.endsWith(name + '-biome-' + biome + '-' + action), f.played[0].file);
    }
});

test('a fresh 50/50 roll selects the regular or matching biome pool on both sides of the boundary', () => {
  for (const action of ['build', 'follow', 'rally']) for (const chance of [0, .499999, .5, .999999]) {
    const rolls = action === 'build' ? [chance, .1] : [.1, chance, .1], f = fixture({ biome: 'desert', random: () => rolls.shift() ?? .1 });
    const unit = f.responder(); unit._followSelected = action === 'follow';
    if (action === 'build') { f.voices.announce(f.building()); f.voices.tick(f.game); }
    else f.voices[action](f.game, [unit]);
    f.finishAll(); assert.equal(f.played[0].file.includes('-biome-desert-'), chance < .5);
    assert(!f.played[0].file.includes('-biome-snow-'));
  }
});

test('unknown biomes fall back to regular voices without requesting a nonexistent clip', () => {
  const f = fixture({ biome: 'unreleased-biome' }), unit = f.responder(); f.voices.follow(f.game, [unit]); f.finishAll();
  assert(f.played[0].file.endsWith('royal-knight-follow-variant-1'));
});

function commandGame(options = {}) {
  const { setup, Node } = require('./backend-gameplay-harness.cjs');
  const h = setup({ BattleSounds: { effect() {} } }), f = fixture({ game: h.g, ui: h.ui, ...options });
  h.e.stubs.UnitVoices = f.voices; h.e.cc.resources = {};
  Object.assign(h.g, { _separateArmyCommands: true, isAgg: true, _combatEpoch: 1, gameStatus: 0, saves: 0, saveGame() { this.saves++; } });
  Object.assign(h.ui, { isclose: false, isPauset: false });
  h.g.ctrPlay.ndAgg.setParent(h.g.ctrPlay.node);
  function unit(type = 90001, x = 150, y = 150) {
    const value = f.responder(type); value.node = new Node('soldier', h.g.ndMain, x, y); value.node._combatGeneration = 1;
    value._followSelected = false;
    value.applyArmyOrder = function () { this.applied = (this.applied || 0) + 1; };
    value.setPersonalRallyPoint = function (pos, remember) { this.rallyPoint = { pos }; this.remembered = remember; };
    return value;
  }
  return { ...h, f, unit };
}

test('the real rally command only offers actual recipients and preserves following troops', () => {
  const h = commandGame({ biome: 'desert' }), recipient = h.unit(90003), following = h.unit(), dead = h.unit(90002), pooled = h.unit(90004), hidden = h.unit();
  following._followSelected = true; dead.hp = 0; pooled._isPooled = true; hidden.node.active = false;
  h.g.rallyCommand(); h.f.finishAll();
  assert.equal(h.g.saves, 1); assert.equal(h.f.played.length, 1);
  assert(h.f.played[0].file.endsWith('crossbowman-biome-desert-rally'));
  assert.equal(recipient._rallyOrder, h.g.rallyPoint); assert.equal(recipient.remembered, true);
  assert.equal(following._rallyOrder, undefined); assert.equal(following._followSelected, true);
  for (let i = 0; i < 10; i++) h.g.rallyCommand(); h.f.finishAll();
  assert.equal(h.f.played.length, 1); assert.equal(h.f.game._unitVoices.queue.length, 0);
  h.f.end(); h.g.rallyCommand(); h.f.finishAll(); assert.equal(h.f.played.length, 2);
});

test('real group following speaks once, stays silent afterward, and requires a new joining unit for another response', () => {
  const h = commandGame({ biome: 'snow' }), first = h.unit(), second = h.unit(90003), outside = h.unit(90004, 2000, 2000);
  h.g.isAgg = false; h.g.followCommand(); h.f.finishAll();
  assert(first._followSelected && second._followSelected); assert.equal(outside._followSelected, false);
  assert.equal(h.f.played.length, 1); assert(h.f.played[0].file.endsWith('royal-knight-biome-snow-follow'));
  for (let i = 0; i < 20; i++) h.g.collectFollowers(); h.f.end(); h.f.voices.tick(h.g);
  for (let i = 0; i < 20; i++) h.g.collectFollowers(); h.f.finishAll(); assert.equal(h.f.played.length, 1);
  outside.node.setPosition(150, 150); h.g.collectFollowers(); h.f.finishAll();
  assert.equal(h.f.played.length, 2); assert(h.f.played[1].file.endsWith('cavalry-biome-snow-follow'));
  assert.equal(h.g.saves, 0, 'voice requests must not add gameplay saves');
});

test('real manual follower selection suppresses other voices until finished and never repeats for already selected units', () => {
  const h = commandGame(), first = h.unit(), second = h.unit(90003);
  assert(h.g.selectFollower(first)); assert(h.g.selectFollower(second)); h.f.finishAll(); assert.equal(h.f.played.length, 1);
  h.f.end(); h.f.voices.tick(h.g);
  assert(h.g.selectFollower(first)); assert(h.g.selectFollower(second)); h.f.finishAll(); assert.equal(h.f.played.length, 1);
  const third = h.unit(90004); assert(h.g.selectFollower(third)); h.f.finishAll();
  assert.equal(h.f.played.length, 2); assert(h.f.played[1].file.endsWith('cavalry-follow-variant-1'));
  assert.equal(h.g.saves, 0);
});
