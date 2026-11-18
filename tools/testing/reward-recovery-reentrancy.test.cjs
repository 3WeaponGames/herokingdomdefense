const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const {harness} = require('./persistence-harness.cjs');

function eventHarness() {
  const h = harness(), events = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/EventMgr.js'), 'utf8'), {exports: events, console});
  h.modules.EventMgr.EventMgr = events.EventMgr;
  h.bus = events.EventMgr.getInstance();
  return h;
}

test('a recovery listener cannot erase a newer durable reward journal', () => {
  const h = eventHarness();
  h.state.failKeys.add(h.player.udata.gameKey);
  assert.equal(h.player.grantAdRewards([{id: 2001, num: 10}]), true);
  const first = h.player.pendingRewardJournal;
  h.state.failKeys.clear();
  let second, injected = false;
  h.bus.on('SaveRecovered', {}, info => {
    if (injected || info.key !== h.player.udata.gameKey) return;
    injected = true;
    assert.equal(h.player.restorePendingRewards(), true);
    h.state.failKeys.add(h.player.udata.gameKey);
    assert.equal(h.player.grantAdRewards([{id: 2002, num: 20}]), true);
    second = h.player.pendingRewardJournal;
    assert.notEqual(second, first);
  });
  assert.equal(h.player.restorePendingRewards(), false);
  assert.equal(injected, true);
  assert.equal(h.player.pendingRewardJournal, second);
  assert.equal(JSON.parse(h.storage.get(h.player.rewardJournalKey())).id, second.id);
  const restart = harness(h.persist());
  assert.equal(restart.player.restorePendingRewards(), true);
  assert.equal(restart.player.udata.getGoldNum(), 10);
  assert.equal(restart.player.udata.getDiamondNum(), 20);
  assert.equal(restart.player.restorePendingRewards(), true);
  assert.equal(restart.player.udata.getDiamondNum(), 20);
});

test('recursive completion of the same journal remains successful and grants once', () => {
  const h = eventHarness();
  h.state.failKeys.add(h.player.udata.gameKey);
  assert.equal(h.player.grantAdRewards([{id: 2001, num: 10}]), true);
  h.state.failKeys.clear();
  let injected = false;
  h.bus.on('SaveRecovered', {}, info => {
    if (injected || info.key !== h.player.udata.gameKey) return;
    injected = true;
    assert.equal(h.player.restorePendingRewards(), true);
  });
  assert.equal(h.player.restorePendingRewards(), true);
  assert.equal(injected, true);
  assert.equal(h.player.pendingRewardJournal, null);
  const restart = harness(h.persist());
  assert.equal(restart.player.restorePendingRewards(), true);
  assert.equal(restart.player.udata.getGoldNum(), 10);
});
