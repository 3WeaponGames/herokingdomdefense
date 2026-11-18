'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function fixture() {
  const pending = [], state = { localClears: 0, remoteClears: 0 }, events = [], timers = new Set(), ex = {};
  const deps = { BasePlatform: { Platform: { WECHAT: 1, BYTEDANCE: 2 } }, PlatformConfig: { ServerDataCfg: {} },
    PlatformSetting: { PlatformSetting: { currentApp: 'test' } }, PlatformManager: { PlatformManager: { currentPlatform: 0 } },
    CacheUtils: { CacheUtils: { clearAll() { state.localClears++; return true; } } },
    EventMgr: { EventMgr: { getInstance: () => ({ emit: (...args) => events.push(args) }) } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/ServerDataMgr.js'), 'utf8'), {
    exports: ex, require: name => deps[name] || {}, console: { error() {}, warn() {} },
    setTimeout(fn) { timers.add(fn); return fn; }, clearTimeout(fn) { timers.delete(fn); }
  });
  const manager = ex.ServerdataMgr;
  manager.curServer = { saveData(key, data, done) { pending.push({ key, data, done }); }, clearAllData(done) { state.remoteClears++; done(true); } };
  return { manager, pending, state, events, timers, save(key = 'user') { manager.saveData(key, '{}', () => {}); return pending.at(-1).done; } };
}
test('a successful replacement for the failed key restores reset availability', () => {
  const f = fixture(); f.save()(false, new Error('temporary')); f.save()(true);
  let result; f.manager.clearAllData(value => result = value);
  assert.equal(result, true); assert.equal(f.state.localClears, 1); assert.equal(f.state.remoteClears, 1);
});
test('success for another key cannot hide an unresolved failed save', () => {
  const f = fixture(); f.save('user')(false, new Error('user failed')); f.save('missions')(true);
  let result; f.manager.clearAllData(value => result = value);
  assert.equal(result, false); assert.equal(f.state.localClears, 0); assert.equal(f.state.remoteClears, 0); assert.equal(f.manager.isPause, false);
});
test('reset waits for an in-flight retry before deciding whether the old failure is recovered', () => {
  for (const success of [true, false]) {
    const f = fixture(); f.save()(false, new Error('old failure')); const retry = f.save();
    let result; f.manager.clearAllData(value => result = value);
    assert.equal(result, undefined); assert.equal(f.state.localClears, 0); assert.equal(f.manager.isPause, true);
    retry(success); assert.equal(result, success); assert.equal(f.state.localClears, success ? 1 : 0); assert.equal(f.timers.size, 0);
  }
});
test('an older success cannot clear a newer failure, and an older failure cannot replace a recovered revision', () => {
  for (const newestSuccess of [false, true]) {
    const f = fixture(), older = f.save(), newer = f.save();
    newer(newestSuccess, newestSuccess ? undefined : new Error('new failure'));
    older(!newestSuccess, newestSuccess ? new Error('old failure') : undefined);
    let result; f.manager.clearAllData(value => result = value);
    assert.equal(result, newestSuccess); assert.equal(f.state.localClears, newestSuccess ? 1 : 0);
  }
});
test('duplicate acknowledgements settle one request and cannot restart reset', () => {
  const f = fixture(), done = f.save(); let results = 0;
  f.manager.clearAllData(() => results++); done(true); done(false, new Error('late'));
  assert.equal(results, 1); assert.equal(f.manager._pendingCloudSaves, 0); assert.equal(f.state.remoteClears, 1);
});
