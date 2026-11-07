const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');

function harness(options = {}) {
  const storage = new Map(Object.entries(options.local || {}));
  const state = { intervals: [], events: [], sends: [], failKeys: new Set(), now: Date.now(), disk: JSON.stringify(options.native || {}), failFile: false, failBackup: false, failRemove: false, cloud: !!options.cloud };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  const host = { sffile: { ...(options.native || {}) }, env: { USER_DATA_PATH: 'memory' }, getFileSystemManager: () => ({ writeFileSync(_path, value) { if (state.failFile) throw Error('file full'); state.disk = value; } }) };
  const modules = {
    Config: { GameConfig: { AppCacheName: 'audit-' } },
    BasePlatform: { Platform: { WECHAT: 1, WEB_LINK: 2, BYTEDANCE: 3 } },
    PlatformManager: { PlatformManager: { currentPlatform: options.platform || 0 } },
    EventMgr: { EventMgr: { getInstance: () => ({ on() {}, emit: (...args) => state.events.push(args) }) } },
    ServerDataMgr: { ServerdataMgr: { getDataByKey: key => (options.server || {})[key], getNeedSaveServer: () => state.cloud, saveData: (key, value, callback) => { state.sends.push({ key, value }); callback(); } } }
  };
  const globals = {
    Date: Clock, Math, console: { log() {}, error() {}, warn() {} }, wx: host, tt: host,
    cc: { game: { EVENT_HIDE: 'hide', on(_event, fn) { state.hide = fn; } } }, setInterval: fn => state.intervals.push(fn),
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem(key, value) { if (state.failKeys.has(key) || state.failBackup && key.includes('.corrupt.')) throw Error('quota'); storage.set(key, value); },
      removeItem(key) { if (state.failRemove) throw Error('read-only mirror'); storage.delete(key); }
    },
    __extends: (ctor, base) => Object.setPrototypeOf(ctor.prototype, base.prototype)
  };
  function load(name) {
    if (modules[name]) return modules[name];
    const context = { ...globals, exports: {}, require: load };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context, { filename: name });
    return modules[name] = context.exports;
  }
  const Record = load('GameTestSegData').TestData;
  const record = new Record();
  return { state, storage, host, record, load, snapshot: () => ({ local: Object.fromEntries(storage), native: JSON.parse(state.disk), platform: options.platform }) };
}
for (const count of [0, 1, 29, 30, 31, 60, 61]) {
  test('segmented bulk ' + count + ' entries round-trip and clear every chunk', () => {
    const h = harness(); h.record.getData();
    h.record.data.test = Array.from({ length: count }, (_, index) => ({ index }));
    h.record.data.futureField = { preserve: true };
    assert.equal(h.record.saveData(-1), true);
    const head = JSON.parse(h.storage.get('audit-test0'));
    assert.equal(head.sft, Math.round(h.state.now / 1000));
    const reload = harness(h.snapshot()); reload.record.getData();
    assert.deepEqual(Array.from(reload.record.data.test, item => item.index), Array.from({ length: count }, (_, index) => index));
    assert.equal(reload.record.data.futureField.preserve, true);
    assert.equal(reload.record.clearData(), true);
    assert.equal([...reload.storage.keys()].filter(key => /^audit-test\d+$/.test(key)).length, 0);
  });
}
test('shrinking a segmented list empties old tails and retains unknown tail fields', () => {
  const head = { goldNum: 1, test: Array(30).fill({ value: 1 }), maxNum: 2, sft: 1 };
  const h = harness({ local: { 'audit-test0': JSON.stringify(head), 'audit-test1': JSON.stringify({ list: Array(30).fill({ value: 2 }), future: 'keep', sft: 1 }), 'audit-test2': JSON.stringify({ list: [{ value: 3 }], sft: 1 }) } });
  h.record.getData(); assert.equal(h.record.data.test.length, 61);
  h.record.data.test = [{ value: 9 }]; assert.equal(h.record.saveData(-1), true);
  assert.equal(JSON.parse(h.storage.get('audit-test1')).future, 'keep');
  const reload = harness(h.snapshot()); reload.record.getData(); assert.equal(reload.record.data.test.length, 1); assert.equal(reload.record.data.test[0].value, 9);
});
for (const index of [0, 1]) {
  test('corrupt segment ' + index + ' is preserved and cannot abort startup or overwrite original bytes', () => {
    const local = { 'audit-test0': JSON.stringify({ goldNum: 1, test: Array(30).fill({ value: 1 }), maxNum: 1, sft: 1 }), 'audit-test1': '{bad-json' };
    local['audit-test' + index] = '{bad-json';
    const h = harness({ local }); assert.doesNotThrow(() => h.record.getData());
    assert.equal(h.record.saveBlockedByRecovery, true); assert.equal(h.record.saveData(-1), false);
    assert.equal(h.storage.get('audit-test' + index), '{bad-json');
    assert.ok([...h.storage].some(([key, value]) => key.startsWith('audit-test' + index + '.corrupt.local.') && value === '{bad-json'));
  });
}
test('invalid segment shapes and failed quarantine remain protected', () => {
  for (const raw of ['null', '[]', '{"test":"bad","maxNum":0}', '{"test":[],"maxNum":-1}']) {
    const h = harness({ local: { 'audit-test0': raw } }); h.state.failBackup = true;
    assert.doesNotThrow(() => h.record.getData()); assert.equal(h.record.saveBlockedByRecovery, true); assert.equal(h.record.saveData(-1), false); assert.equal(h.storage.get('audit-test0'), raw);
  }
});
test('a newer local head loads its local tail even if cloud only has an older head', () => {
  const h = harness({
    local: { 'audit-test0': JSON.stringify({ goldNum: 2, test: Array(30).fill({ value: 1 }), maxNum: 1, sft: 200 }), 'audit-test1': JSON.stringify({ list: [{ value: 31 }], sft: 200 }) },
    server: { 'audit-test0': JSON.stringify({ goldNum: 1, test: [], maxNum: 0, sft: 100 }) }
  });
  h.record.getData(); assert.equal(h.record.data.test.length, 31); assert.equal(h.record.data.test[30].value, 31); assert.equal(h.record.data.goldNum, 2);
});
test('valid cloud segment can replace a quarantined malformed local segment', () => {
  const h = harness({ local: { 'audit-test0': '{bad' }, server: { 'audit-test0': JSON.stringify({ goldNum: 7, test: [{ value: 8 }], maxNum: 0, sft: 3 }) } });
  h.record.getData(); assert.equal(h.record.data.goldNum, 7); assert.equal(h.record.saveBlockedByRecovery, undefined); assert.equal(h.record.saveData(-1), true);
  assert.ok([...h.storage.values()].includes('{bad'));
});
test('failed local tail saves retry before cloud upload and hide flushes queued changes', () => {
  const h = harness({ cloud: true }); h.record.getData(); h.record.data.test = Array(31).fill({ value: 1 });
  h.state.failKeys.add('audit-test1'); assert.equal(h.record.saveData(-1), false); assert.equal(h.state.sends.length, 0);
  h.state.failKeys.clear(); h.state.intervals.forEach(fn => fn()); assert.equal(h.record.localSavePending, false); assert.equal(h.state.sends.length, 2);
  h.record.data.test[30].value = 2; h.record.saveData(1); assert.equal(h.state.sends.length, 2);
  h.state.hide(); assert.equal(h.state.sends.length, 3); assert.equal(JSON.parse(h.state.sends[2].value).list[0].value, 2);
});

test('legacy segments without a head count retain all entries and unknown fields in deferred uploads', () => {
  const h = harness({ cloud: true, local: {
    'audit-test0': JSON.stringify({ goldNum: 2, test: Array(30).fill({ value: 1 }), sft: 1 }),
    'audit-test1': JSON.stringify({ list: [{ value: 31 }], future: { keep: true }, sft: 1 })
  } });
  h.record.getData(); assert.equal(h.record.data.maxNum, 1); assert.equal(h.record.data.test.length, 31);
  assert.equal(h.record.saveData(-1), true); assert.equal(h.state.sends.length, 2);
  h.record.data.test[30].value = 32; h.record.saveData(1); assert.equal(h.state.sends.length, 2);
  h.state.hide(); const tail = JSON.parse(h.state.sends[2].value);
  assert.equal(tail.list[0].value, 32); assert.equal(tail.future.keep, true);
  const reload = harness(h.snapshot()); reload.record.getData(); assert.equal(reload.record.data.test.length, 31);
});
for (const platform of [1, 3]) {
  test('platform ' + platform + ' removal persists authoritative tombstones and tolerates a stale mirror', () => {
    const h = harness({ platform, local: { old: 'old-local' }, native: { old: 'old-file', keep: 'untouched' } });
    const Cache = h.load('CacheUtils').CacheUtils;
    h.state.failFile = true; assert.equal(Cache.removeData('old'), false);
    assert.equal(JSON.parse(h.state.disk).old, 'old-file');
    h.state.failFile = false; h.state.failKeys.add('old'); h.state.failRemove = true;
    assert.equal(Cache.removeData('old'), true); assert.equal(Cache.getData('old'), null); assert.equal(JSON.parse(h.state.disk).keep, 'untouched');
    const reload = harness(h.snapshot()); assert.equal(reload.load('CacheUtils').CacheUtils.getData('old'), null);
    assert.equal(reload.load('CacheUtils').CacheUtils.getData('keep'), 'untouched');
  });
  test('platform ' + platform + ' segmented clear retries file failure and cannot reupload old chunks', () => {
    const h = harness({ platform, cloud: true }); h.record.getData(); h.record.data.test = Array(31).fill({ value: 1 }); h.record.saveData(-1);
    h.state.failFile = true; assert.equal(h.record.clearData(), false); assert.equal(h.record.clearPending, true);
    h.state.failFile = false; h.state.intervals.forEach(fn => fn()); assert.equal(h.record.clearPending, false); assert.equal(h.record.localSavePending, false);
    assert.equal(h.load('CacheUtils').CacheUtils.getData('audit-test0'), null); assert.equal(h.load('CacheUtils').CacheUtils.getData('audit-test1'), null);
    const sends = h.state.sends.length; h.state.hide(); assert.equal(h.state.sends.length, sends);
  });
}
test('BaseData.clearData uses the same authoritative storage removal', () => {
  const h = harness({ platform: 1, native: { record: 'saved' } });
  const Base = h.load('BaseData').BaseData, record = new Base(); record.gameKey = 'record';
  assert.equal(record.clearData(), true); assert.equal(h.load('CacheUtils').CacheUtils.getData('record'), null);
});

test('BaseData retries failed clear without restoring pending local or cloud progress', () => {
  const h = harness({ platform: 3, cloud: true, native: { record: '{"sft":1,"progress":7}' } });
  const Base = h.load('BaseData').BaseData, record = new Base(); record.gameKey = 'record';
  record.getData(); record.localSavePending = true; record.isneedSave = true;
  h.state.failFile = true; assert.equal(record.clearData(), false); assert.equal(record.clearPending, true);
  assert.equal(record.saveData(), false); record.UpdateData(); assert.equal(h.state.sends.length, 0);
  h.state.failFile = false; h.state.intervals.forEach(fn => fn());
  assert.equal(record.clearPending, false); assert.equal(record.localSavePending, false); assert.equal(record.isneedSave, false);
  h.state.hide(); h.state.intervals.forEach(fn => fn());
  assert.equal(h.load('CacheUtils').CacheUtils.getData('record'), null); assert.equal(h.state.sends.length, 0);
  assert.ok(h.state.events.some(event => event[0] === 'SaveRecovered'));
});
