'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process'), path = require('node:path');
const Core = require('../../assets/_script/ShopCore'), Catalog = require('../../assets/_script/ShopCatalog');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const catalog = Catalog.create({ getTreasureCfg: () => config.TreasureCfg, getGoodsCfgById: id => config.GoodsCfg[id] });
const noon = new Date(2026, 10, 8, 12).getTime(), copy = value => JSON.parse(JSON.stringify(value));
function rng(seed = 15) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }
function shape(state) {
  assert.equal(Core.validate(state, catalog), state); assert.equal(state.slots.length, 12);
  assert.equal(new Set(state.slots.map(s => s.relicId)).size, 12);
  assert.deepEqual([1, 2, 3, 4].map(q => state.slots.filter(s => s.quality === q).length), [2, 0, 4, 6]);
}
test('new stock uses twelve distinct authored orange/blue/green relics without changing gameplay configuration', () => {
  const before = JSON.stringify(config), state = Core.createState(catalog, noon, rng()); shape(state);
  assert.equal(state.version, 1); assert.equal(state.day, '2026-11-08'); assert.equal(state.revision, 1); assert.equal(state.generation, 1);
  assert.equal(state.refreshCount, 0); assert.equal(state.dailyClaimed, false); assert(state.slots.every(s => !s.bought));
  assert.deepEqual(state.slots.map(s => s.slotId), ['legendary:0', 'legendary:1', 'rare:0', 'rare:1', 'rare:2', 'rare:3', 'common:0', 'common:1', 'common:2', 'common:3', 'common:4', 'common:5']);
  assert.equal(JSON.stringify(config), before);
});
test('claims and purchases create immutable revisions and reject repeat flags without silently resetting stock', () => {
  const first = Core.createState(catalog, noon, rng()), before = copy(first); first.future = { retained: true };
  const claimed = Core.claim(first); assert.equal(claimed.revision, 2); assert(claimed.dailyClaimed); assert.equal(claimed.generation, 1);
  assert.equal(first.dailyClaimed, false); assert.deepEqual(claimed.future, { retained: true }); assert.throws(() => Core.claim(claimed), /already claimed/);
  const purchased = Core.buyRelic(claimed, first.slots[0].slotId); assert.equal(purchased.revision, 3); assert(purchased.slots[0].bought);
  assert(!claimed.slots[0].bought); assert.throws(() => Core.buyRelic(purchased, first.slots[0].slotId), /already bought/);
  assert.throws(() => Core.buyRelic(first, 'constructor'), /unknown relic slot/);
  delete first.future; assert.deepEqual(first, before); shape(purchased);
});
test('ten manual rerolls include the first free one, rotate every slot and keep the daily claim', () => {
  let state = Core.claim(Core.createState(catalog, noon, rng(6))), random = rng(22);
  const costs = [0, 10, 20, 30, 40, 50, 75, 100, 125, 150], observed = [];
  state = Core.buyRelic(state, state.slots[0].slotId);
  for (let index = 0; index < 10; index++) {
    const before = copy(state); observed.push(Core.refreshCost(state)); state = Core.roll(state, catalog, noon, random, true); shape(state);
    assert.equal(state.revision, before.revision + 1); assert.equal(state.generation, before.generation + 1); assert.equal(state.refreshCount, index + 1);
    assert(state.dailyClaimed); assert(state.slots.every((slot, i) => !slot.bought && slot.relicId !== before.slots[i].relicId && slot.slotId === before.slots[i].slotId));
  }
  assert.deepEqual(observed, costs); assert.equal(Core.refreshCost(state), null); assert.throws(() => Core.roll(state, catalog, noon, random, true), /limit/);
});
test('rotation matching changes all positions even with minimal pools and repeated random values', () => {
  const minimal = { relics: [1, 3, 4].flatMap(q => catalog.relics.filter(r => r.quality === q).slice(0, q === 1 ? 2 : q === 3 ? 4 : 6)) };
  for (const random of [() => 0, () => .999999, rng(456)]) {
    let state = Core.createState(minimal, noon, random);
    for (let turn = 0; turn < 10; turn++) {
      const before = copy(state); state = Core.roll(state, minimal, noon, random, true);
      Core.validate(state, minimal); assert.equal(new Set(state.slots.map(s => s.relicId)).size, 12);
      assert(state.slots.every((slot, i) => slot.relicId !== before.slots[i].relicId));
    }
  }
});
test('automatic next-day stock resets daily flags without charging manual quota and rejects backwards rearming', () => {
  let state = Core.claim(Core.createState(catalog, noon, rng())); state = Core.roll(state, catalog, noon, rng(2), true);
  state = Core.buyRelic(state, state.slots[4].slotId); state.future = { retained: 9 };
  const earlier = new Date(2026, 10, 7, 12).getTime(), later = new Date(2026, 10, 9, 0, 0, 1).getTime();
  assert.equal(Core.roll(state, catalog, noon, rng(), false), state); assert.equal(Core.createState(catalog, noon, rng(), state), state);
  assert.equal(Core.roll(state, catalog, earlier, rng(), false), state); assert.equal(Core.roll(state, catalog, earlier, rng(), true), state);
  assert.equal(Core.createState(catalog, earlier, rng(), state), state); assert.throws(() => Core.roll(state, catalog, later, rng(), true), /current daily stock/);
  const next = Core.roll(state, catalog, later, rng(8), false); shape(next);
  assert.equal(next.day, '2026-11-09'); assert.equal(next.refreshCount, 0); assert.equal(next.dailyClaimed, false); assert.equal(Core.refreshCost(next), 0);
  assert.equal(next.revision, state.revision + 1); assert.equal(next.generation, state.generation + 1); assert(next.slots.every(s => !s.bought)); assert.deepEqual(next.future, state.future);
});
test('malformed persisted state, changed catalog and invalid random sources fail explicitly without mutating input', () => {
  const good = Core.createState(catalog, noon, rng());
  for (const mutate of [
    s => s.version = 2, s => s.day = '2026-02-30', s => s.revision = 0, s => s.generation = 1.5,
    s => s.refreshCount = 11, s => s.dailyClaimed = 1, s => s.slots.pop(), s => s.slots[0].bought = null,
    s => s.slots[1].relicId = s.slots[0].relicId, s => s.slots[0].quality = 4, s => s.slots[0].slotId = '__proto__'
  ]) { const bad = copy(good); mutate(bad); const before = JSON.stringify(bad); assert.throws(() => Core.validate(bad, catalog), /Invalid shop/); assert.equal(JSON.stringify(bad), before); }
  const changed = { relics: catalog.relics.filter(r => r.relicId !== good.slots[0].relicId) };
  assert.throws(() => Core.validate(good, changed), /authored tier/);
  assert.throws(() => Core.createState({ relics: [] }, noon, rng()), /not enough/);
  for (const value of [1, -1, NaN, Infinity, '0']) assert.throws(() => Core.createState(catalog, noon, () => value), /random source/);
  const exhausted = copy(good); exhausted.revision = Number.MAX_SAFE_INTEGER; assert.throws(() => Core.claim(exhausted), /revision exhausted/);
  for (const now of [NaN, Infinity, '2026-11-08', null]) assert.throws(() => Core.localDay(now), /clock/);
});
test('calendar helpers use local midnight and cover both short and long DST days', () => {
  const modulePath = path.resolve(__dirname, '../../assets/_script/ShopCore.js');
  const source = `const c=require(${JSON.stringify(modulePath)});console.log(JSON.stringify([new Date(2026,2,8),new Date(2026,10,1)].map(d=>({day:c.localDay(+d),hours:(c.nextMidnight(+d)-d)/3600000,next:c.localDay(c.nextMidnight(+d))}))));`;
  const r = cp.spawnSync(process.execPath, ['-e', source], { encoding: 'utf8', env: { ...process.env, TZ: 'America/New_York' } });
  assert.equal(r.status, 0, r.stderr); assert.deepEqual(JSON.parse(r.stdout), [{ day: '2026-03-08', hours: 23, next: '2026-03-09' }, { day: '2026-11-01', hours: 25, next: '2026-11-02' }]);
});
