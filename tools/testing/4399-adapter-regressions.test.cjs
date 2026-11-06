const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.resolve(__dirname, '../../assets/_script/Platform4399Manager.js'), 'utf8');

function adapter(api) {
  const context = { exports: {}, window: { h5api: api }, console: { log() {} } };
  vm.runInNewContext(source, context, { filename: 'Platform4399Manager.js' });
  return new context.exports.Platform4399Manager();
}

test('missing or incomplete host SDK fails immediately without rewarding', () => {
  for (const api of [undefined, null, {}, { playAd: true }]) {
    const platform = adapter(api); let success = 0; let failure = 0;
    assert.equal(platform.isRewardedAdAvailable(), false);
    assert.equal(platform.showVideoAd('', () => success++, () => failure++), false);
    assert.equal(success, 0);
    assert.equal(failure, 1);
  }
});

test('host readiness is checked at request time and completion is delivered once', () => {
  const api = {}; const platform = adapter(api); let success = 0; let failure = 0; let complete;
  assert.equal(platform.isRewardedAdAvailable(), false);
  api.playAd = callback => complete = callback;
  assert.equal(platform.isRewardedAdAvailable(), true);
  platform.showVideoAd('', () => success++, () => failure++);
  complete({ code: 10000 });
  assert.equal(success, 0);
  complete({ code: 10001 });
  complete({ code: 10001 });
  complete({ code: 10002 });
  assert.equal(success, 1);
  assert.equal(failure, 0);
});

test('asynchronous malformed/cancel/error callbacks fail once and ignore later completion', () => {
  for (const result of [undefined, null, {}, { code: 10002 }, { code: 10003 }]) {
    let callback; let success = 0; let failure = 0;
    const platform = adapter({ playAd: done => callback = done });
    platform.showVideoAd('', () => success++, () => failure++);
    assert.doesNotThrow(() => callback(result));
    callback({ code: 10001 });
    assert.equal(success, 0);
    assert.equal(failure, 1);
  }
});

test('SDK exceptions fail safely, but reward callback exceptions remain visible', () => {
  let failure = 0;
  const unavailable = adapter({ playAd() { throw Error('SDK unavailable'); } });
  assert.doesNotThrow(() => unavailable.showVideoAd('', () => assert.fail('must not reward'), () => failure++));
  assert.equal(failure, 1);
  const completing = adapter({ playAd: done => done({ code: 10001 }) });
  assert.throws(() => completing.showVideoAd('', () => { throw Error('reward callback bug'); }, () => failure++), /reward callback bug/);
  assert.equal(failure, 1);
});
