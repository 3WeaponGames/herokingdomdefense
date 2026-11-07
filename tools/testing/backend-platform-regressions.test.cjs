'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { harness } = require('./backend-platform-harness.cjs');
function payment(h) { return h.load('WechatPayMgr').WechatPayMgr.instance; }
function startPayment(h, callback) {
  const p = payment(h); p.getOpenId = cb => cb('identity');
  p.startPayItem(1, 5, callback);
  const creation = h.requests.shift();
  creation.cb(JSON.stringify({ code: 0, data: { signData: '{"outTradeNo":"order-1"}', paySig: 'sig', signature: 'sign' } }));
  return p;
}
function cleanAd(h, sdk) {
  assert.equal(sdk._activeRewardedAd, null);
  assert.equal(h.sounds.pause, h.sounds.resume);
  assert.equal(h.events.filter(e => e[0] === 'blocktouch' && !e[1]).length, h.events.filter(e => e[0] === 'blocktouch' && e[1]).length);
  assert.equal(h.timeouts.filter(t => t.active).length, 0);
}

test('fresh feed configuration replaces its derived cache, while failed refresh preserves it', () => {
  const h = harness('h5_bytedance'), feed = h.load('FeedCardMgr').FeedCardMgr.instance;
  feed.init(); const results = [];
  for (const ids of [['old'], ['new'], []]) {
    feed.getTaskTarget(value => results.push(value));
    h.requests.shift().success({ data: { code: 0, data: ids.map(id => ({ id, platform: String(feed.platformId) })) } });
  }
  assert.deepEqual(results.map(rows => Array.from(rows, row => row.id)), [['old'], ['new'], []]);
  feed.getTaskTarget(value => results.push(value)); h.requests.shift().success({ data: { code: -1 } });
  assert.equal(results.at(-1), null); assert.equal(feed.taskdatas.length, 0); assert.equal(feed.getTaskData().length, 0);
});

test('verified payment identity completes once despite denied optional cache reads or writes', () => {
  for (const byKey of [false, true]) for (const failedKey of ['igame_openId', 'um_od', 'all']) {
    const h = harness('h5_wechat'), p = payment(h), calls = [];
    h.wx.login = options => options.success({ code: 'verified' });
    h.wx.getStorageSync = () => { throw Error('denied'); };
    h.wx.setStorageSync = (key, value) => { if (failedKey === 'all' || key === failedKey) throw Error('quota'); h.storage.set(key, value); };
    if (byKey) p.loginByKey((...args) => calls.push(args)); else p.getOpenId((...args) => calls.push(args));
    const request = h.requests.shift(), reply = { code: 0, data: byKey ? { openid: 'identity', key: 'verified-key' } : 'identity' };
    request.cb(JSON.stringify(reply)); request.cb(JSON.stringify(reply));
    assert.equal(calls.length, 1); assert.equal(calls[0][0], 'identity'); assert.equal(p.openId, 'identity');
    if (byKey) assert.equal(calls[0][1], 'verified-key');
  }
});

test('denied identity cache does not turn rejected server identity into a verified login', () => {
  const h = harness('h5_wechat'), p = payment(h), calls = [];
  h.wx.login = options => options.success({ code: 'login-code' });
  h.wx.getStorageSync = () => { throw Error('denied'); }; h.wx.setStorageSync = () => assert.fail('invalid identity must not be cached');
  p.getOpenId(value => calls.push(value)); h.requests.shift().cb(JSON.stringify({ code: 0, data: {} }));
  assert.deepEqual(calls, [null]); assert.equal(!!p.openId, false);
});
test('unsupported multi-ad settles on editor/4399 and releases input/audio exactly once', () => {
  for (const platform of ['editor', 'android_4399']) {
    const h = harness(platform), p = h.load('PlatformManager').PlatformManager.getInstance(); p.init();
    const sdk = h.load('SdkMgr').SdkMgr.getInstance(); let failures = 0;
    sdk.playMultitonVideo(0, 0, 0, () => assert.fail('unsupported reward'), () => failures++);
    assert.equal(failures, 1); cleanAd(h, sdk); h.tick(100); assert.equal(failures, 1);
  }
});
test('multi-ad timeout, duplicate callbacks and thrown hosts cannot retain ownership or double-deliver', () => {
  for (const mode of ['timeout', 'duplicate', 'throw']) {
    const h = harness(), p = h.load('PlatformManager').PlatformManager.getInstance(); p.init();
    let late, successes = 0, failures = 0;
    p.currentPaltform.playMultitonVideo = (a, b, c, success, failure) => {
      late = success;
      if (mode === 'throw') throw Error('host');
      if (mode === 'duplicate') { success(3); failure(); success(4); }
    };
    const sdk = h.load('SdkMgr').SdkMgr.getInstance();
    sdk.playMultitonVideo(0, 0, 0, value => { assert.equal(value, 3); successes++; }, () => failures++);
    h.tick(100); late(3); assert.equal(successes + failures, 1); cleanAd(h, sdk);
  }
});
test('normal and multi ads share ownership and defer rejected failure callbacks until release', () => {
  const h = harness(), p = h.load('PlatformManager').PlatformManager.getInstance(); p.init();
  let finish, failures = 0;
  p.currentPaltform.playMultitonVideo = (a, b, c, success) => finish = success;
  const sdk = h.load('SdkMgr').SdkMgr.getInstance(); sdk.playMultitonVideo(0, 0, 0, () => {}, () => {});
  assert.equal(sdk.playVideo(0, () => assert.fail('concurrent success'), () => failures++), false);
  assert.equal(failures, 0); finish(1); assert.equal(failures, 1); cleanAd(h, sdk);
});
test('editor and 4399 capability callbacks report unsupported results instead of hanging', () => {
  for (const platform of ['editor', 'android_4399']) {
    const h = harness(platform), p = h.load('PlatformManager').PlatformManager.getInstance(); p.init();
    let calls = 0;
    p.getUserInfo(value => { assert.equal(value, null); calls++; });
    p.getLaunchOptionsSync(value => { assert.equal(value, null); calls++; });
    p.checkCanOpenSideBar(value => { assert.equal(value, false); calls++; });
    assert.equal(calls, 3);
  }
});
test('payment login failure or missing login code releases reservation and allows retry', () => {
  for (const mode of ['failure', 'missing']) {
    const h = harness(), p = payment(h), results = [];
    if (mode === 'missing') h.wx.login = o => o.success({});
    p.startPayItem(1, 1, value => results.push(value));
    p.startPayItem(1, 1, value => results.push(value));
    assert.deepEqual(results, [false, false]); assert.equal(p.isPaying, false);
    assert.equal(h.timeouts.filter(t => t.active).length, 0);
  }
});
test('payment retains lock until single-flight verification finishes and callbacks are one-shot', () => {
  const h = harness(), results = [], p = startPayment(h, value => results.push(value));
  h.payments[0].success(); h.payments[0].fail(); assert.equal(p.isPaying, true);
  p.startPayItem(2, 1, value => assert.equal(value, false));
  h.tick(2000); assert.equal(h.requests.length, 1);
  h.tick(6000); assert.equal(h.requests.length, 1, 'no overlapping poll while request is in flight');
  const first = h.requests.shift(); first.cb('{"code":1}'); first.cb('{"code":0}');
  assert.deepEqual(results, []); assert.equal(h.requests.length, 0, 'processing never recurses immediately');
  h.tick(1999); assert.equal(h.requests.length, 0); h.tick(1); assert.equal(h.requests.length, 1);
  h.requests.shift().cb('{"code":0}'); assert.deepEqual(results, [true]); assert.equal(p.isPaying, false);
  assert.equal(h.timeouts.filter(t => t.active).length, 0);
});
test('payment deadline settles hung verification and stale response cannot affect next payment', () => {
  const h = harness(), first = [], p = startPayment(h, value => first.push(value));
  h.payments[0].success(); h.tick(2000); const stale = h.requests.shift();
  h.tick(238000); assert.deepEqual(first, [false]); assert.equal(p.isPaying, false);
  const second = []; startPayment(h, value => second.push(value));
  stale.cb('{"code":0}'); assert.deepEqual(second, []); assert.equal(p.isPaying, true);
  h.payments[1].fail(); assert.deepEqual(second, [false]);
});
test('payment accepts cached validated identity in order payload', () => {
  const h = harness(), p = payment(h); h.storage.set('payopenkey', 'cached');
  p.startPayItem(1, 1, () => {});
  h.requests.shift().cb('{"code":0,"data":1}');
  assert.equal(p.openId, 'cached'); assert.equal(h.requests[0].data.openid, 'cached');
  h.requests.shift().cb(null); assert.equal(p.isPaying, false);
});
test('payment preserves legacy identity keys and keyed login response shape', () => {
  for (const key of ['igame_openId', 'um_od']) {
    const h = harness(), p = payment(h); h.storage.set(key, 'legacy-id');
    let value; p.getOpenId(id => value = id); h.requests.shift().cb('{"code":0,"data":1}');
    assert.equal(value, 'legacy-id'); assert.equal(p.openId, 'legacy-id');
  }
  const h = harness(), p = payment(h); h.wx.login = o => o.success({ code: 'code' });
  let result; p.loginByKey((id, key) => result = [id, key]);
  h.requests.shift().cb('{"code":0,"data":{"openid":"identity","key":"session"}}');
  assert.deepEqual(result, ['identity', 'session']); assert.equal(h.storage.get('igame_openId'), 'identity');
});
test('malformed payment responses fail explicitly at creation, login, query and verification', () => {
  for (const payload of [null, 'not-json', '{}', '{"code":0,"data":null}']) {
    const h = harness(), p = payment(h), results = []; p.getOpenId = cb => cb('id');
    p.startPayItem(1, 1, value => results.push(value)); h.requests.shift().cb(payload);
    assert.deepEqual(results, [false]); assert.equal(p.isPaying, false);
    p.queryOrder(value => assert.equal(value.length, 0)); h.requests.shift().cb(payload);
    p.requestOrder({}, value => assert.ok(value && value.code != null)); h.requests.shift().cb(payload);
    const login = harness(), lp = payment(login); login.wx.login = o => o.success({ code: 'code' });
    lp.login(value => assert.equal(value, null)); login.requests.shift().cb(payload);
  }
});
test('feed card exact IDs, daily rollover and duplicate insert retain existing storage format', () => {
  const h = harness(), p = h.load('FeedCardMgr').FeedCardMgr.instance; let day = '2026-11-06'; p.getTimeDay = () => day;
  p.addTaskCardId(12); assert.equal(p.getIsSend(2), false); assert.equal(p.getIsSend(12), true);
  p.addTaskCardId(12); assert.equal(h.storage.get('igame_task'), day + '_12');
  day = '2026-11-07'; p.addTaskCardId(9); assert.equal(p.getIsSend(12), false); assert.equal(p.getIsSend(9), true);
  assert.equal(h.storage.get('igame_task'), day + '_9');
});
test('FeedPlayable initialization owns one poller and unsupported hosts settle callbacks safely', () => {
  const h = harness('h5_bytedance'), p = h.load('FeedPlayableMgr').FeedPlayableMgr.instance;
  p.init(); p.init(); assert.equal(h.intervals.filter(t => t.active).length, 1);
  p.dispose(); assert.equal(h.intervals.filter(t => t.active).length, 0); p.init(); assert.equal(h.intervals.filter(t => t.active).length, 1);
  h.tt.getLaunchOptionsSync = () => ({ scene: 23041 }); assert.equal(p.getLaunchSceneId(), -1);
  const absent = harness('editor', { globals: { tt: undefined } }).load('FeedPlayableMgr').FeedPlayableMgr.instance;
  let calls = 0; absent.init(); absent.requestFeedSubscribe(1, [], value => { assert.equal(value, false); calls++; });
  absent.checkFeedSubscribeStatus(1, value => { assert.equal(value, false); calls++; }); assert.equal(calls, 2);
});
test('Wechat subscription login accepts string/object response bodies and rejects malformed ones', () => {
  for (const body of ['{"code":0,"data":"identity"}', { code: 0, data: 'identity' }, 'bad', null]) {
    const h = harness(), p = h.load('SubscribeManager').SubscribeManager.instance; p.type = 2; p.appId = 'app';
    h.wx.login = o => o.success({ code: 'code' }); const values = []; p.getOpenId(value => values.push(value));
    h.requests[0].success({ data: body }); h.requests[0].fail({});
    assert.deepEqual(values, [body && body !== 'bad' ? 'identity' : null]);
  }
});
test('subscription unsupported version, missing login code and server rejection settle without throwing', () => {
  const h = harness(), p = h.load('SubscribeManager').SubscribeManager.instance; p.type = 2; p.checkCanSend = () => true;
  let calls = 0; p.openSubscribeWechatVersion(value => { assert.equal(value, null); calls++; });
  h.wx.login = o => o.success({}); p.getOpenId(value => { assert.equal(value, null); calls++; });
  p.getOpenId = cb => cb('identity');
  for (const body of ['{"code":-1}', 'bad', { code: -1 }]) {
    p.addInfo('key', 'value', value => { assert.equal(value, null); calls++; }); h.requests.shift().success({ data: body });
  }
  assert.equal(calls, 5);
});
test('malformed live responses retry within a bounded generation and ignore superseded requests', () => {
  const h = harness(), p = h.load('LiveMgr').default.getInstance(); let connections = 0;
  h.stubs.SocketMgr.default.getInstance = () => ({ startSocket: () => connections++, setOnMsg() {} });
  p.startSocket('first'); const stale = h.requests.shift(); p.startSocket('second');
  stale.cb('{"code":0,"data":{"room_id":"stale"}}'); assert.equal(connections, 0);
  h.requests.shift().cb('not-json'); assert.equal(h.timeouts.filter(t => t.active).length, 1);
  h.tick(1000); h.requests.shift().cb('{"code":0,"data":{"room_id":"valid"}}'); assert.equal(connections, 1);
  p.startSocket('third');
  for (let i = 0; i <= 60; i++) { assert.equal(h.requests.length, 1); h.requests.shift().cb(null); h.tick(1000); }
  assert.equal(h.requests.length, 0); assert.equal(h.timeouts.filter(t => t.active).length, 0); assert.equal(p.count, 0);
});
