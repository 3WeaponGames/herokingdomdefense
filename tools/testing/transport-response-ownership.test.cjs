'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function fixture() {
  const context = { exports: {}, console: { log() {}, warn() {}, error() {} },
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/NetNode.js'), 'utf8'), context);
  const node = new context.exports.NetNode();
  node.init({ connect() { return true; }, send() { return true; }, close() {} },
    { checkPackage: () => true, getPackageId: value => value, getHearbeat: () => '' });
  function connect() { assert.equal(node.connect({ autoReconnect: 0 }), true); node.onConnected(); }
  connect(); return { node, connect };
}

test('an old response cannot enter listeners installed by its callback on a replacement connection', () => {
  const { node, connect } = fixture(), seen = [];
  node.request('request', 7, { callback() {
    seen.push('response'); node.close(); connect();
    node.setResponeHandler(7, () => seen.push('new listener'));
    node.request('new request', 8, { callback() { seen.push('new response'); } });
  } });
  node.onMessage(7); assert.deepEqual(seen, ['response']); assert.equal(node._requests.length, 1);
  node.onMessage(8); node.onMessage(7); assert.deepEqual(seen, ['response', 'new response', 'new listener']);
});

test('listener retirement stops the old dispatch while an unchanged connection retains listener order', () => {
  for (const replace of [false, true]) {
    const { node, connect } = fixture(), seen = [];
    node.addResponeHandler(7, () => { seen.push('first'); if (replace) { node.close(); connect(); node.addResponeHandler(7, () => seen.push('new')); } });
    node.addResponeHandler(7, () => seen.push('second'));
    node.onMessage(7); assert.deepEqual(seen, replace ? ['first'] : ['first', 'second']);
    if (replace) { node.onMessage(7); assert.deepEqual(seen, ['first', 'new']); }
  }
});
