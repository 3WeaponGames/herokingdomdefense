'use strict';
// Actual runtime modules; every transport, host, timer and cache is in memory.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const { harness } = require('./backend-platform-harness.cjs');
const source = path.resolve(__dirname, '../../assets/_script');
const quiet = { log() {}, warn() {}, error() {} };
function load(name, globals = {}, deps = {}) {
  const context = { exports: {}, console: quiet, require: key => deps[key] || {}, ...globals };
  vm.runInNewContext(fs.readFileSync(path.join(source, name + '.js'), 'utf8'), context, { filename: name });
  return context.exports;
}
function network() {
  const jobs = new Map(); let next = 0;
  const timers = { setTimeout(fn) { jobs.set(++next, fn); return next; }, clearTimeout(id) { jobs.delete(id); }, setInterval(fn) { jobs.set(++next, fn); return next; }, clearInterval(id) { jobs.delete(id); } };
  const api = load('NetNode', timers), socket = { connect: () => true, close() {}, send: () => true }, node = new api.NetNode();
  node.init(socket, { checkPackage: () => true, getPackageId: () => 7, getHearbeat: () => '' });
  node.connect({ autoReconnect: -1 }); node.onConnected();
  return { node, socket, jobs };
}
test('socket listener mutation preserves survivors and defers newly registered listeners', () => {
  const { node } = network(), seen = [];
  function added() { seen.push('added'); }
  function first() { seen.push('first'); node.removeResponeHandler(7, first); node.addResponeHandler(7, added); }
  node.addResponeHandler(7, first); node.addResponeHandler(7, () => seen.push('second'));
  node.onMessage('payload'); assert.deepEqual(seen, ['first', 'second']);
  node.onMessage('payload'); assert.deepEqual(seen.slice(2), ['second', 'added']);
  node.setResponeHandler(7, () => node.cleanListeners()); node.addResponeHandler(7, added);
  node.onMessage('payload'); assert.equal(seen.length, 4);
});
test('manager shutdown is intentional and late messages cannot recreate timers or dispatch', () => {
  const { node, jobs } = network(), Manager = load('NetManager').NetManager, manager = new Manager();
  manager.setNetNode(node); manager.close(); node.onClosed(); node.onMessage('late');
  assert.equal(jobs.size, 0); assert.equal(node._state, 0); assert.equal(node._reconnectTimer, null);
});
test('connection status callbacks cannot resurrect a channel they close or authenticate a replacement', () => {
  const { node, jobs } = network(); node.close();
  node.setOnServerStatus(status => { if (status === 0) node.close(); });
  node.connect({ autoReconnect: 0 }); node.onConnected();
  assert.equal(node._state, 0); assert.equal(node._isSocketOpen, false); assert.equal(node.send('late'), false); assert.equal(jobs.size, 0);
  node.setOnServerStatus(null); const checks = [];
  node._connectedCallback = done => checks.push(done);
  node.connect({ autoReconnect: 0 }); node.onConnected(); node.close();
  node.connect({ autoReconnect: 0 }); node.onConnected();
  checks[0](); assert.equal(node._state, 2); checks[1](); assert.equal(node._state, 3);
});
test('a rejected flush retains queued one-way packets in order until a successful send', () => {
  const { node, socket } = network(); node.close(); node.connect({ autoReconnect: 0 });
  node.send('first'); node.send('second'); const sent = [];
  socket.send = value => { sent.push(value); return false; }; node.onChecked();
  assert.deepEqual(sent, ['first']); assert.equal(node._requests.length, 2);
  socket.send = value => { sent.push(value); return true; }; node.onChecked();
  assert.deepEqual(sent, ['first', 'first', 'second']); assert.equal(node._requests.length, 0);
});
test('JSON save transport requires an actual acknowledgement and settles empty/malformed replies once', () => {
  const xhrs = []; function XHR() { xhrs.push(this); }
  XHR.prototype.open = XHR.prototype.setRequestHeader = XHR.prototype.send = function () {};
  const Http = load('SfSendQueue', { XMLHttpRequest: XHR }).SfTrackHttp;
  for (const body of ['', '{broken', '{"code":0}']) {
    const replies = []; Http.httpPost('/saveData', {}, value => replies.push(value));
    const xhr = xhrs.at(-1); Object.assign(xhr, { status: 200, readyState: 4, responseText: body });
    xhr.onreadystatechange(); xhr.onerror(); assert.equal(replies.length, 1);
    assert.equal(replies[0].code, body === '{"code":0}' ? 0 : -1);
  }
});
function cloud(name) {
  const requests = [], hides = [], events = [];
  const sdk = { getLaunchOptionsSync: () => ({}), getAccountInfoSync: () => ({ miniProgram: { appId: 'app' } }), onHide: callback => hides.push(callback), login: options => options.success({ code: 'verified' }), showModal() {}, getStorageSync() { throw Error('storage denied'); }, setStorageSync() { throw Error('storage denied'); } };
  const store = { getItem() { throw Error('storage denied'); }, setItem() { throw Error('storage denied'); } };
  const deps = { Config: { GameConfig: { AppCacheName: 'app:' } }, Appcfg: { BaseEventName: { onHide: 'hide' } }, EventMgr: { EventMgr: { getInstance: () => ({ emit: name => events.push(name) }) } },
    SfSendQueue: { SfTrackHttp: { httpGet(...args) { requests.push(args); } }, SendConfig: function () {}, SendQueue: { enqueue(...args) { requests.push(args); } } } };
  const globals = { tt: sdk, wx: sdk, window: {}, localStorage: store };
  const Server = load(name, globals, deps)[name];
  return { server: new Server('/mock', 'app', true), requests, hides, events, sdk, globals };
}
for (const name of ['ByteDanceServerMgr', 'WeachatServerMgr']) {
  test(name + ' completes verified login despite optional cache failure and preserves hide notifications after key clear', () => {
    const h = cloud(name); let calls = 0, issue;
    h.server.init(error => { calls++; issue = error; });
    h.requests.shift()[2]({ code: 0, data: { openid: 'verified-user' } });
    assert.equal(calls, 1); assert.equal(issue, undefined); assert.equal(h.globals.window.openId, 'verified-user');
    h.server.userId = 'legacy'; h.server.clearDataByKey('app:user', () => {});
    h.hides[0](); h.hides[0](); assert.deepEqual(h.events, ['hide', 'hide']);
  });
}
test('ByteDance optional launch metadata is omitted safely and provided metadata is preserved', () => {
  const h = cloud('ByteDanceServerMgr'); h.server.openId = 'user';
  let result; h.server.loadData(data => result = data);
  assert.equal(Object.hasOwn(h.requests[0][1], 'appGameId'), false);
  h.requests.shift()[2]({ code: 0, data: { valid: true } }); assert.equal(result.valid, true);
  h.sdk.getLaunchOptionsSync = () => ({ extra: { appId: 'authored' } });
  h.server.loadData(() => {}); assert.equal(h.requests[0][1].appGameId, 'authored');
});
test('forced server startup loads available cloud data without accessing local flags; no-adapter identity completes', () => {
  let loads = 0;
  function Server() {} Server.prototype.init = callback => callback(); Server.prototype.loadData = callback => { loads++; callback({}, null); };
  const deps = { BasePlatform: { Platform: { WECHAT: 1, BYTEDANCE: 2 } }, PlatformConfig: { ServerDataCfg: { Main: { wechatOpened: true } } }, PlatformSetting: { PlatformSetting: { currentApp: 'Main' } }, PlatformManager: { PlatformManager: { currentPlatform: 1 } }, WeachatServerMgr: { WeachatServerMgr: Server } };
  const manager = load('ServerDataMgr', { localStorage: { getItem() { throw Error('denied'); } } }, deps).ServerdataMgr;
  let calls = 0; manager.init(error => { assert.equal(error, null); calls++; }); assert.equal(calls, 1); assert.equal(loads, 1);
  deps.PlatformManager.PlatformManager.currentPlatform = 0;
  const other = load('ServerDataMgr', {}, deps).ServerdataMgr; other.getOpenId(id => { assert.equal(id, null); calls++; }); assert.equal(calls, 2);
});
test('failed authoritative save clearing restores pause state and does not restart or clear remote progress', () => {
  const events = []; let remote = 0, result;
  const deps = { PlatformManager: { PlatformManager: { currentPlatform: 0 } }, BasePlatform: { Platform: {} }, CacheUtils: { CacheUtils: { clearAll: () => false } }, EventMgr: { EventMgr: { getInstance: () => ({ emit: (...args) => events.push(args) }) } } };
  const manager = load('ServerDataMgr', {}, deps).ServerdataMgr; manager.curServer = { clearAllData() { remote++; } };
  manager.clearAllData(value => result = value); assert.equal(result, false); assert.equal(remote, 0); assert.equal(manager.isPause, false);
  assert.deepEqual(events, [['CLEARDATA', true], ['CLEARDATA', false]]);
});
for (const multi of [false, true]) {
  test('earned ' + (multi ? 'multiton' : 'rewarded') + ' result is delivered once despite teardown subscriber failure', () => {
    const h = harness(); let provider, rewards = 0;
    h.stubs.PlatformManager = { PlatformManager: { getInstance: () => ({ showVideoAd(id, type, done) { provider = done; }, playMultitonVideo(a, b, c, done) { provider = done; } }) } };
    h.stubs.EventMgr.EventMgr.getInstance().emit = (name, value) => { if (name === 'blocktouch' && value === true) throw Error('teardown failed'); };
    const sdk = h.load('SdkMgr').SdkMgr.getInstance();
    if (multi) sdk.playMultitonVideo(1, 2, 3, () => rewards++, () => {}); else sdk.playVideo(3, () => rewards++, () => {}, 'test');
    assert.throws(() => provider(), /teardown failed/); assert.equal(rewards, 1); assert.equal(h.sounds.resume, 1);
    provider(); assert.equal(rewards, 1); assert.equal(sdk._activeRewardedAd, null);
  });
}
test('FeedCard accepts SDK object replies, rejects malformed replies and never posts without identity', () => {
  const h = harness('h5_bytedance'), feed = h.load('FeedCardMgr').FeedCardMgr.instance; feed.init();
  const results = []; feed.getTaskTarget(value => results.push(value)); h.requests.shift().success({ data: { code: 0, data: [] } });
  assert.equal(results[0].length, 0);
  feed.getTaskTarget(value => results.push(value)); h.requests.shift().success({ data: '{broken' }); assert.equal(results[1], null);
  feed.getTaskTarget(value => results.push(value)); h.requests.shift().success({ data: { code: 0 } }); assert.equal(results[2], null);
  feed.getTaskTarget(value => results.push(value)); h.requests.shift().success({ data: { code: 0, data: [null, {}, { platform: '1', id: 'valid' }] } });
  assert.equal(results[3].length, 1); assert.equal(results[3][0].id, 'valid');
  feed.launchOptions = { scene: '023040' }; assert.equal(feed.getLaunchCardId(), -1);
  let done; feed.sendTask('card', value => done = value); assert.equal(done, false); assert.equal(h.requests.length, 0);
});
test('FeedPlayable retires callbacks on disposal and retries an item only after its previous response settles', () => {
  const h = harness('h5_bytedance'), feed = h.load('FeedPlayableMgr').FeedPlayableMgr.instance;
  feed.sendUserData('scene', ['item'], 10); assert.equal(h.requests.length, 0, 'failed login must not post');
  feed.getOpenId = done => { feed.openId = 'verified'; done('verified'); };
  feed.sendUserData('scene', ['item'], 10); h.requests.shift().cb('{broken'); assert.equal(feed.waitSend.length, 1);
  let time = 110; h.stubs.TimeUtils.TimeUtils.GetTimeBySecond = () => time;
  feed.requestAny(); time += 6; feed.requestAny(); assert.equal(h.requests.length, 1);
  h.requests.shift().cb(null); feed.requestAny(); assert.equal(h.requests.length, 1);
  h.requests.shift().cb({ code: 0 }); feed.requestAny(); assert.equal(feed.waitSend.length, 0);
  feed.sendUserData('scene', ['item'], 10); const late = h.requests.shift(); feed.dispose(); late.cb(null); assert.equal(feed.waitSend.length, 0);
});
test('changing live room closes the previous socket and creates a connection for the new room', () => {
  const connections = []; let closed = 0;
  function Net() { this.init = this.setResponeHandler = this.setOnServerStatus = function () {}; this.close = () => closed++; }
  const deps = { NetNode: { NetNode: Net }, NetInterface: { DefStringProtocol: function () {} }, WebSock: { WebSock: function () {} }, NetManager: { NetManager: { getInstance: () => ({ setNetNode() {}, connect: options => connections.push(options.url) }) } } };
  const manager = load('SocketMgr', {}, deps).default.getInstance();
  manager.startSocket('ws://example.invalid', 'first', 'app'); manager.startSocket('ws://example.invalid', 'second', 'app'); manager.startSocket('ws://example.invalid', 'second', 'app');
  assert.equal(closed, 1); assert.equal(connections.length, 2); assert.match(connections[1], /second/);
});
test('unique sampling handles zero, existing selections and deterministic RNG without recursion', () => {
  const Utils = load('Utils', { Math: Object.assign(Object.create(Math), { random: () => 0 }) }).Utils;
  const values = []; Utils.randomDiffIndex(3, 0, values); assert.deepEqual(values, []);
  values.push(1); Utils.randomDiffIndex(3, 3, values); assert.equal(new Set(values).size, 3); assert.deepEqual(values.slice().sort(), [0, 1, 2]);
  assert.throws(() => Utils.randomDiffIndex(2, 3, []), /count/);
});
test('map wire values remain strings while keys and values receive valid JSON escaping', () => {
  const Utils = load('Utils').Utils, value = new Map([['quoted"key', 'has "quotes"\n'], [2, 3]]);
  assert.deepEqual(JSON.parse(Utils.MapTOJson(value)), { 'quoted"key': 'has "quotes"\n', '2': '3' });
  assert.equal(Utils.MapTOJson(new Map()), '{}');
});
test('next local time respects minutes and milliseconds and month-end uses calendar dates across DST', () => {
  const previousTZ = process.env.TZ; process.env.TZ = 'Europe/Paris';
  try {
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-07T10:15:00.650+01:00'])); } }
    const Time = load('TimeUtils', { Date: Clock }).TimeUtils;
    assert.equal(Time.getSplaceTime(10, 30) * 1000, new Date('2026-11-07T10:30:00+01:00').getTime());
    assert.equal(Time.getSplaceTime(10, 15) * 1000, new Date('2026-11-08T10:15:00+01:00').getTime());
    assert.equal(Time.isLastDayOfMonth(new Date('2024-03-31T12:00:00+02:00').getTime()), true);
    assert.equal(Time.isLastDayOfMonth(new Date('2024-03-30T12:00:00+01:00').getTime()), false);
    assert.equal(Time.isLastDayOfMonth(new Date('2024-02-29T12:00:00+01:00').getTime()), true);
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
});
