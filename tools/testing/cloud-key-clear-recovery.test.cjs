'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const scripts = path.resolve(__dirname, '../../assets/_script');
function fixture(adapterName) {
  const writes = [], removes = [], events = [], timers = new Set();
  const state = { localClears: 0, restarts: 0 }, deps = {};
  const host = { showModal(options) { options.success({ confirm: true }); }, restartMiniProgram() { state.restarts++; }, restartMiniProgramSync() { state.restarts++; } };
  Object.assign(deps, {
    Config: { GameConfig: { AppCacheName: 'app:' } }, Appcfg: { BaseEventName: {} },
    BasePlatform: { Platform: { WECHAT: 1, BYTEDANCE: 2 } }, PlatformConfig: {}, PlatformSetting: {},
    PlatformManager: { PlatformManager: { currentPlatform: adapterName === 'WeachatServerMgr' ? 1 : adapterName ? 2 : 0 } },
    EventMgr: { EventMgr: { getInstance: () => ({ emit: (...args) => events.push(args) }) } },
    LanguageMgr: { LanguageMgr: { getInstance: () => ({ T: value => value }) } },
    CacheUtils: { CacheUtils: { clearAll() { state.localClears++; return true; } } },
    SfSendQueue: { SendConfig: function () {}, SendQueue: { enqueue(data, url, config) { writes.push({ data, url, done: config.callback }); } },
      SfTrackHttp: { httpGet(url, data, done) { removes.push({ url, data, done }); } } }
  });
  function load(name) {
    if (deps[name]) return deps[name];
    const exports = deps[name] = {};
    vm.runInNewContext(fs.readFileSync(path.join(scripts, name + '.js'), 'utf8'), {
      exports, require: load, wx: host, tt: host, window: {}, console: { log() {}, warn() {}, error() {} },
      setTimeout(fn) { timers.add(fn); return fn; }, clearTimeout(fn) { timers.delete(fn); }
    }, { filename: name + '.js' });
    return exports;
  }
  const manager = load('ServerDataMgr').ServerdataMgr;
  let server;
  if (adapterName) {
    const Adapter = load(adapterName)[adapterName];
    server = manager.curServer = new Adapter('/mock', 'app', true);
    Object.assign(server, { openId: 'verified', userId: 'verified' });
  }
  return { manager, server, writes, removes, events, state, timers,
    save(key, done) { manager.saveData(key, '{"gold":7}', done); return writes.at(-1); },
    clear(key, done) { manager.clearDataByKey(key, done); return writes.at(-1); },
    ack(write, success = true) { write.done(success ? { code: 0, data: true } : { code: 5, message: 'temporary failure' }); },
    finishReset() { assert.equal(removes.length, 1); removes[0].done({ code: 0 }); }
  };
}
for (const name of ['WeachatServerMgr', 'ByteDanceServerMgr']) {
  test(name + ': a successful key clear recovers its failed save and preserves the legacy wire payload', () => {
    const f = fixture(name); f.ack(f.save('app:user'), false);
    let cleared; const write = f.clear('app:user', (...args) => cleared = args);
    assert.equal(write.data.key, 'user'); assert.equal(write.data.value, '{}'); assert.equal(write.url, '/mock/saveData');
    f.ack(write); assert.deepEqual(cleared, [true]);
    let result; f.manager.clearAllData(value => result = value);
    assert.equal(f.state.localClears, 1); assert.equal(result, undefined);
    f.finishReset(); assert.equal(result, true); assert.equal(f.state.restarts, 1); assert.equal(f.timers.size, 0);
  });
  test(name + ': reset waits for a key clear and pauses new clears before any deletion', () => {
    const f = fixture(name), clear = f.clear('app:user'); let result;
    f.manager.clearAllData(value => result = value);
    assert.equal(f.manager.isPause, true); assert.equal(result, undefined);
    assert.equal(f.state.localClears, 0); assert.equal(f.removes.length, 0);
    let denied; f.manager.clearDataByKey('app:other', (_data, error) => denied = error);
    assert.match(denied && denied.message, /paused/); assert.equal(f.writes.length, 1);
    f.ack(clear); assert.equal(f.state.localClears, 1); f.finishReset();
    assert.equal(result, true); assert.equal(f.timers.size, 0);
  });
  test(name + ': a failed key clear cancels reset and a later acknowledged retry recovers', () => {
    const f = fixture(name), write = f.clear('app:user'); let failed;
    f.manager.clearAllData((value, error) => failed = [value, error]); f.ack(write, false);
    assert(failed, 'the failed clear must settle the waiting reset');
    assert.equal(failed[0], false); assert.match(failed[1].message, /temporary failure/);
    assert.equal(f.state.localClears, 0); assert.equal(f.removes.length, 0); assert.equal(f.manager.isPause, false);
    f.ack(f.clear('app:user')); let recovered;
    f.manager.clearAllData(value => recovered = value); f.finishReset(); assert.equal(recovered, true);
  });
  test(name + ': save and clear aliases share revision ordering in both completion orders', () => {
    for (const oldIsClear of [false, true]) for (const newestSuccess of [false, true]) for (const olderFirst of [false, true]) {
      const f = fixture(name), older = oldIsClear ? f.clear(' app:user ') : f.save(' app:user ');
      const newer = oldIsClear ? f.save('user') : f.clear('user');
      assert.equal(older.data.key, 'user'); assert.equal(newer.data.key, 'user');
      if (olderFirst) { f.ack(older, !newestSuccess); f.ack(newer, newestSuccess); }
      else { f.ack(newer, newestSuccess); f.ack(older, !newestSuccess); }
      let result; f.manager.clearAllData(value => result = value);
      if (newestSuccess) { f.finishReset(); assert.equal(result, true); }
      else { assert.equal(result, false); assert.equal(f.state.localClears, 0); assert.equal(f.removes.length, 0); }
    }
  });
  test(name + ': clearing another cloud key cannot hide an unresolved failure', () => {
    const f = fixture(name); f.ack(f.save('app:user'), false); f.ack(f.clear('app:missions'));
    let result; f.manager.clearAllData(value => result = value);
    assert.equal(result, false); assert.equal(f.state.localClears, 0); assert.equal(f.removes.length, 0);
  });
  test(name + ': tracking follows the unchanged two-pass clear prefix handling', () => {
    for (const sameWireKey of [false, true]) {
      const f = fixture(name), failed = f.save(sameWireKey ? 'app:user' : 'app:app:user');
      assert.equal(failed.data.key, sameWireKey ? 'user' : 'app:user'); f.ack(failed, false);
      const cleared = f.clear(sameWireKey ? 'app:app:user' : 'app:user');
      assert.equal(cleared.data.key, 'user'); f.ack(cleared);
      let result; f.manager.clearAllData(value => result = value);
      if (sameWireKey) { f.finishReset(); assert.equal(result, true); }
      else { assert.equal(result, false); assert.equal(f.state.localClears, 0); }
    }
  });
  test(name + ': disabled adapter clear keeps its no-argument completion and emits no request', () => {
    const f = fixture(name); f.server.isOpened = false; let args;
    f.manager.clearDataByKey('app:user', (...values) => args = values);
    assert.deepEqual(args, []); assert.equal(f.writes.length, 0); assert.equal(f.manager._pendingCloudSaves || 0, 0);
  });
}
test('custom adapters retain their own clear operation, raw key and callback context/arguments exactly once', () => {
  const f = fixture(), context = { custom: true }, payload = { removed: true }, calls = []; let pending;
  f.manager.curServer = { saveData() { assert.fail('a custom clear must not become a save'); },
    clearDataByKey(key, done) { assert.equal(key, ' app:user '); pending = done; },
    clearAllData(done) { done(true); } };
  f.manager.clearDataByKey(' app:user ', function () { calls.push({ owner: this, args: [...arguments] }); });
  pending.call(context, payload, undefined, 'custom-result'); pending.call(context, false, Error('duplicate'));
  assert.equal(calls.length, 1); assert.equal(calls[0].owner, context); assert.deepEqual(calls[0].args, [payload, undefined, 'custom-result']);
  assert.equal(f.manager._pendingCloudSaves, 0); let reset;
  f.manager.clearAllData(value => reset = value); assert.equal(reset, true); assert.equal(f.state.localClears, 1);
});
test('a custom key-identity exception reports once without creating pending work or blocking reset', () => {
  for (const clear of [false, true]) {
    const f = fixture(), issue = Error('key lookup failed'), results = []; let dispatched = 0;
    f.manager.curServer = { getCloudSaveKey() { throw issue; }, saveData() { dispatched++; }, clearDataByKey() { dispatched++; }, clearAllData(done) { done(true); } };
    const done = (...args) => results.push(args);
    if (clear) f.manager.clearDataByKey('raw', done); else f.manager.saveData('raw', '{}', done);
    assert.equal(results.length, 1); assert.equal(results[0][0], null); assert.equal(results[0][1], issue);
    assert.equal(dispatched, 0); assert.equal(f.manager._pendingCloudSaves || 0, 0);
    let reset; f.manager.clearAllData(value => reset = value); assert.equal(reset, true); assert.equal(f.manager._clearRequest, null);
  }
});
test('custom adapters without a key mapping keep distinct raw keys when another key is cleared', () => {
  const f = fixture(), pending = [];
  f.manager.curServer = { saveData(key, data, done) { pending.push({ key, done }); }, clearDataByKey(key, done) { pending.push({ key, done }); }, clearAllData() { assert.fail('an unrelated key still failed'); } };
  f.manager.saveData('app:user', '{}'); f.manager.clearDataByKey('user');
  assert.deepEqual(pending.map(row => row.key), ['app:user', 'user']);
  pending[0].done(false, Error('original raw key failed')); pending[1].done(true);
  let result; f.manager.clearAllData(value => result = value); assert.equal(result, false); assert.equal(f.state.localClears, 0);
});
test('a thrown custom clear settles once and an acknowledged retry repairs only that raw key', () => {
  const f = fixture(), issue = Error('custom clear failed'), results = []; let pending;
  f.manager.curServer = { clearDataByKey() { throw issue; }, clearAllData(done) { done(true); } };
  f.manager.clearDataByKey('raw', (...args) => results.push(args));
  assert.equal(results.length, 1); assert.equal(results[0][1], issue); assert.equal(f.manager._pendingCloudSaves, 0);
  let rejected; f.manager.clearAllData(value => rejected = value); assert.equal(rejected, false); assert.equal(f.state.localClears, 0);
  f.manager.curServer.clearDataByKey = (_key, done) => pending = done;
  f.manager.clearDataByKey('raw'); pending(true); let recovered;
  f.manager.clearAllData(value => recovered = value); assert.equal(recovered, true);
});
test('without an adapter, key clear keeps its no-argument callback', () => {
  const f = fixture(); let args; f.manager.clearDataByKey('raw', (...values) => args = values); assert.deepEqual(args, []);
});
