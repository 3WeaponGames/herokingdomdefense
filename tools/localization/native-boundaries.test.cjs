'use strict';
// Execute real platform adapters with isolated SDK/network/storage mocks; no game save is loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const entries = require('./text-entries.json').entries;

function harness(language, platform = 1) {
  const state = { toasts: [], modals: [], clears: 0, restarts: 0, requests: [], timers: [] };
  const translate = token => {
    const key = token.replace(/^\[\[loc:|\]\]$/g, '');
    assert.ok(entries[key], 'Missing source translation ' + key);
    return entries[key][language];
  };
  const modules = {
    LanguageMgr: { LanguageMgr: { getInstance: () => ({ T: translate }) } },
    HttpMgr: { HttpMgr: { getInstance: () => ({ httpPost(data, callback, url) { state.requests.push({ data, callback, url }); } }) } },
    BasePlatform: { Platform: { WECHAT: 1, BYTEDANCE: 2 } },
    PlatformManager: { PlatformManager: { currentPlatform: platform } },
    CacheUtils: { CacheUtils: { clearAll() { state.clears++; } } },
    EventMgr: { EventMgr: { getInstance: () => ({ emit() {} }) } }
  };
  const sdk = {
    showToast(value) { state.toasts.push(value); },
    showModal(value) { state.modals.push(value); },
    showLoading() {}, hideLoading() {},
    restartMiniProgram() { state.restarts++; },
    restartMiniProgramSync() { state.restarts++; }
  };
  state.load = name => {
    const context = { exports: {}, require: name => modules[name] || {}, wx: sdk, tt: sdk, console,
      setInterval(callback) { state.timers.push(callback); return state.timers.length; },
      clearInterval() {}, setTimeout(callback) { callback(); } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context, { filename: name + '.js' });
    return context.exports;
  };
  return state;
}

for (const language of ['en', 'zh']) {
  test(language + ': order creation failure keeps diagnostic callbacks separate from localized toast', () => {
    const h = harness(language), payment = h.load('WechatPayMgr').WechatPayMgr.instance;
    payment.getAppId = () => { payment.appId = 'test-app'; };
    payment.getOpenId = callback => callback('test-user');
    let callback;
    payment.startPayItem('test-item', 1, (...args) => { callback = args; });
    const response = JSON.stringify({ code: -1, msg: 'SERVER_DIAGNOSTIC_NOT_UI' });
    h.requests[0].callback(response);
    assert.equal(h.toasts[0].title, entries['script.wechatpaymgr.text.60'][language]);
    assert.equal(payment.isPaying, false);
    assert.equal(callback[0], false);
    assert.ok(callback[1].includes(response), 'Original failure details remain available to the caller');
  });

  test(language + ': purchase query failure localizes the UI and preserves the empty result', () => {
    const h = harness(language), payment = h.load('WechatPayMgr').WechatPayMgr.instance;
    payment.appId = 'test-app'; payment.openId = 'test-user';
    let result;
    payment.queryOrder(value => { result = value; });
    h.requests[0].callback(JSON.stringify({ code: -1, msg: 'SERVER_DIAGNOSTIC_NOT_UI' }));
    assert.equal(h.toasts[0].title, entries['payment.queryFailed'][language]);
    assert.equal(result.length, 0);
  });

  test(language + ': payment outcomes localize without changing successful reward callbacks', () => {
    for (const [code, key] of [[0, 'payment.completed'], [-6, 'script.wechatpaymgr.text.194'], [-9, 'payment.unconfirmed']]) {
      const h = harness(language), payment = h.load('WechatPayMgr').WechatPayMgr.instance;
      let successes = 0;
      payment.requestOrder = (order, callback) => callback({ code, msg: 'SERVER_DIAGNOSTIC_NOT_UI' });
      payment.paySuccess('test-order', success => { if (success) successes++; });
      h.timers[0]();
      assert.equal(h.toasts[0].title, entries[key][language]);
      assert.equal(successes, code === 0 ? 1 : 0);
    }
  });

  test(language + ': native reset dialogs use bounded localized buttons and preserve cancel/confirm behavior', () => {
    for (const platform of [1, 2]) {
      const h = harness(language, platform), manager = h.load('ServerDataMgr').ServerdataMgr;
      manager.clearAllData();
      const modal = h.modals[0];
      assert.equal(modal.confirmText, entries['common.nativeOK'][language]);
      assert.equal(modal.cancelText, entries['common.nativeBack'][language]);
      assert.ok(modal.confirmText.length <= 4 && modal.cancelText.length <= 4);
      modal.success({ confirm: false, cancel: true });
      assert.equal(h.clears, 0);
      assert.equal(h.restarts, 0);
      modal.success({ confirm: true, cancel: false });
      assert.equal(h.clears, 1);
      assert.equal(h.restarts, 1);
    }
  });
}
