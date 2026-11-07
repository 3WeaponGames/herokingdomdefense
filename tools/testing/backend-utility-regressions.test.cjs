'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), test = require('node:test');
const root = path.resolve(__dirname, '../..');
process.env.TZ = 'Europe/Paris';
const read = name => fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8');
function harness(extra = {}) {
  const state = { now: Date.parse('2026-11-06T12:00:00+01:00'), random: 0, saves: 0, events: [] };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  function BaseData() {}
  BaseData.prototype.saveData = function () { state.saves++; };
  const modules = { BaseData: { BaseData }, Config: { GameConfig: { AppCacheName: 'test-' } }, Appcfg: {}, BasePlatform: {},
    AppManager: { IAppManager: { getUMConf: () => ({}), getSwitchVersion: () => '1' } },
    PlatformManager: { PlatformManager: { getInstance: () => ({ youmengTrack: (...args) => state.events.push(args) }) } } };
  const math = Object.create(Math); math.random = () => state.random;
  function load(name) {
    if (modules[name]) return modules[name];
    const exports = {};
    vm.runInNewContext(read(name), { exports, require: load, Date: Clock, Math: math, console, ...extra,
      __extends: (C, B) => Object.setPrototypeOf(C.prototype, B.prototype) }, { filename: name + '.js' });
    return modules[name] = exports;
  }
  return { state, load, math };
}
function method(name, key, scope) {
  const text = read(name), start = text.indexOf('  _ctor.prototype.' + key + ' = function'), end = text.indexOf('\n  };', start) + 5;
  return vm.runInNewContext('(' + text.slice(start, end).split(' = ').slice(1).join(' = ').replace(/;$/, '') + ')', scope);
}
test('relative weights support tiny/huge finite values and exact cumulative boundaries without repeated distributions', () => {
  let pushes = 0; class MeasuredArray extends Array { push(...xs) { pushes += xs.length; return super.push(...xs); } }
  const h = harness({ Array: MeasuredArray }), U = h.load('Utils').Utils;
  const rows = [{ id: 1, weight: .001 }, { id: 2, weight: .002 }, { id: 3, weight: .001 }];
  for (const [draw, id] of [[0, 1], [.249, 1], [.25, 2], [.749, 2], [.75, 3], [.999999, 3]]) {
    h.state.random = draw; assert.equal(U.weight_rand(rows).id, id);
  }
  h.state.random = .6;
  assert.equal(U.weight_rand([{ id: 1, weight: 1e308 }, { id: 2, weight: 1e308 }]).id, 2);
  assert.equal(U.weight_rand([{ id: 1, weight: 1 }, { id: 2, weight: 1000.01 }]).id, 2);
  assert.equal(pushes, 0);
  for (const rows of [[], [{ weight: 0 }], [{ weight: NaN }, { weight: Infinity }, { weight: -1 }]]) assert.equal(U.weight_rand(rows), undefined);
});
test('percent mode retains ordered cap, mixed numeric fractions and last-item remainder', () => {
  const h = harness(), U = h.load('Utils').Utils;
  const rows = [{ id: 1, weight: '20%' }, { id: 2, weight: .3 }, { id: 3, weight: 0 }];
  for (const [draw, id] of [[.19, 1], [.2, 2], [.49, 2], [.5, 3], [.99, 3]]) { h.state.random = draw; assert.equal(U.weight_rand(rows).id, id); }
  h.state.random = .95; assert.equal(U.weight_rand([{ id: 1, weight: '80%' }, { id: 2, weight: '40%' }, { id: 3, weight: '40%' }]).id, 2);
});
test('actual perk refresh selects distinct valid fractional candidates and terminates empty/all-zero pools', () => {
  const h = harness(), U = h.load('Utils').Utils;
  const refresh = method('KinghtFallUIBuff', 'onRefreshBuff', { cc__spreadArrays: (...xs) => [].concat(...xs), $z1Utils: { Utils: U }, Math: h.math });
  const p = { canOutBuff: [{ id: 1, weight: .001, qua: 1 }, { id: 2, weight: .001, qua: 1 }, { id: 3, weight: .001, qua: 1 }], minQua: 4, _customPerkPool: false };
  refresh.call(p, true); assert.deepEqual([...p.selInfo].sort(), [1, 2, 3]);
  p.canOutBuff = []; refresh.call(p, true); assert.equal(p.selInfo.length, 0);
  p.canOutBuff = [{ id: 1, weight: 0, qua: 4 }]; refresh.call(p, true); assert.equal(p.selInfo.length, 0);
});
test('save aliases round-trip unknown special own keys and omit inherited properties', () => {
  const U = harness().load('Utils').Utils;
  const source = JSON.parse('{"goldNum":9,"constructor":7,"__proto__":{"flag":1},"prototype":2,"toString":3,"nested":[{"goldNum":5,"__proto__":4}]}');
  const aliases = Object.create({ constructor: 'bad' }); aliases.goldNum = '1';
  const encoded = U.renameObjectKeys(source, aliases), decoded = U.restoreObjectKeys(encoded, aliases);
  assert.equal(JSON.stringify(decoded), JSON.stringify(source));
  assert.equal(Object.hasOwn(decoded, '__proto__'), true); assert.equal(decoded.flag, undefined);
  assert.equal(Object.hasOwn(Object.prototype, 'flag'), false);
  const inherited = Object.create({ inherited: 2 }); inherited.own = 3;
  assert.deepEqual(Object.keys(U.renameObjectKeys(inherited, aliases)), ['own']);
  assert.deepEqual(Object.keys(U.restoreObjectKeys(inherited, aliases)), ['own']);
});
test('URL parsing preserves equals, escapes, fragment boundaries and last-wins keys safely', () => {
  const U = harness().load('Utils').Utils;
  const value = U.getWebUrlParams('?token=a=b%3Dc&abType=A#fragment');
  assert.equal(value.token, 'a=b=c'); assert.equal(value.abType, 'A');
  const p = U.getWebUrlParams('?a=one+two&a=%E2%9C%93&blank=&missing&bad=%Q1&__proto__=safe');
  assert.equal(p.a, '✓'); assert.equal(p.blank, ''); assert.equal(p.missing, undefined); assert.equal(p.bad, '%Q1'); assert.equal(p.__proto__, 'safe');
  assert.equal(Object.keys(U.getWebUrlParams('https://example.invalid/#?x=1')).length, 0);
});
test('formatStr forwards zero, one and multiple substitutions as separate arguments', () => {
  const calls = [], U = harness({ cc: { js: { formatStr: (...args) => (calls.push(args), 'formatted') } } }).load('Utils').Utils;
  U.formatStr('plain'); U.formatStr('%s', 'a'); U.formatStr('%s %d', 'a', 3);
  assert.deepEqual(calls, [['plain'], ['%s', 'a'], ['%s %d', 'a', 3]]);
});
test('UTC date formatting keeps the UTC year across New Year in either local offset direction', () => {
  const time = harness().load('TimeUtils').TimeUtils;
  const previous = process.env.TZ;
  try {
    for (const [zone, instant, utc, local] of [
      ['Europe/Paris', '2025-12-31T23:30Z', '2025/12/31', '2026-01-01'],
      ['America/Los_Angeles', '2026-01-01T02:30Z', '2026/1/1', '2025-12-31'],
      ['Etc/UTC', '2026-01-01T02:30Z', '2026/1/1', '2026-01-01'],
      ['Europe/Paris', '2026-07-03T12:30Z', '2026/7/3', '2026-07-03']
    ]) {
      process.env.TZ = zone;
      const stamp = Date.parse(instant);
      assert.equal(time.FormatDate1(stamp), utc);
      assert.equal(time.FormatDate1(stamp, '.'), utc.replaceAll('/', '.'));
      assert.equal(time.FormatDate2(stamp), local);
    }
  } finally {
    process.env.TZ = previous;
  }
});

test('tracking day uses local calendar dates across midnight, skipped days and both DST changes', () => {
  for (const [start, now, expected] of [
    ['2026-11-06T00:00:00+01:00', '2026-11-06T12:00:00+01:00', 1],
    ['2026-11-06T23:50:00+01:00', '2026-11-07T00:00:00+01:00', 2],
    ['2026-03-28T23:30:00+01:00', '2026-03-30T12:00:00+02:00', 3],
    ['2026-10-24T00:00:00+02:00', '2026-10-26T12:00:00+01:00', 3],
    ['2026-11-01T12:00:00+01:00', '2026-11-15T12:00:00+01:00', 15]]) {
    const h = harness(), T = h.load('GameTrackData').TrackData, t = new T();
    t.data = { daytime: Date.parse(start) }; h.state.now = Date.parse(now); t.setCurentDay(); assert.equal(t.data.day, expected);
    assert.equal(t.getCrunetDay(), expected === 15 ? '11_15' : String(expected));
  }
});
test('legacy analytics migrate numeric/string zero and absent state by longest prefix without overwriting aliases', () => {
  for (const needConvert of [0, '0', undefined]) {
    const h = harness(), T = h.load('GameTrackData').TrackData, E = h.load('GameTrackDataEvent'), t = new T();
    t.eventCF = E.EventCF; t.data = { needConvert, guideguide1: 1, guideguide10: 1, guideguide16: 1, guideguide21: 1, guideguide22: 1,
      guideguide199: 'unknown', custom: 'keep', '2': 7, lvstart_3_4: 1, abName: 'C' };
    t.convertData();
    for (const key of ['11', '17', '22', '23', '28_3_4']) assert.equal(t.data[key], 1, key);
    assert.equal(t.data['2'], 7); assert.equal(t.data.guideguide199, 'unknown'); assert.equal(t.data.custom, 'keep');
    t.youmengTrack(E.TrackId.guide17); assert.equal(h.state.events.length, 1);
    const saves = h.state.saves; t.convertData(); assert.equal(h.state.saves, saves);
  }
});
test('Binary supports advertised 64-bit values and rejects unavailable runtime capabilities', () => {
  const B = harness().load('Binary'); B.registerProto(1, { a: B.Type.BigInt64, b: B.Type.BigUint64 });
  const input = { a: -(2n ** 63n), b: 2n ** 64n - 1n }, output = B.decode(B.encode(input, 1));
  assert.equal(output.a, input.a); assert.equal(output.b, input.b);
  const unsupported = harness({ DataView: function LegacyDataView() {} }).load('Binary');
  assert.throws(() => unsupported.registerProto(1, { nested: unsupported.singleArray(unsupported.Type.BigInt64) }), /unsupported/);
});
test('Binary preserves 65535 lengths and trailing fields, rejects overflow and truncated buffers', () => {
  const B = harness().load('Binary');
  for (const [id, type, good, bad] of [
    [1, B.Type.String16, 'x'.repeat(65535), 'x'.repeat(65536)],
    [2, B.singleArray(B.Type.Uint8), Array(65535).fill(7), Array(65536).fill(7)],
    [3, B.Type.Object16, { a: 'x'.repeat(65527) }, { a: 'x'.repeat(65528) }]]) {
    B.registerProto(id, { a: type, z: B.Type.Uint8 });
    const bytes = B.encode({ a: good, z: 9 }, id), decoded = B.decode(bytes);
    assert.equal(decoded.z, 9); assert.equal(JSON.stringify(decoded.a), JSON.stringify(good));
    assert.throws(() => B.encode({ a: bad, z: 9 }, id), /65535/);
    assert.throws(() => B.decode(bytes.slice(0, -1)), /bounds|outside|offset/i);
  }
});
