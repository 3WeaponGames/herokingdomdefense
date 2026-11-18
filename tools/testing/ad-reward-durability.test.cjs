'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { harness } = require('./persistence-harness.cjs');
function method(file, name, h) {
  const source = fs.readFileSync(path.join(__dirname, '../../assets/_script', file + '.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('  _ctor.prototype.' + name + ' = function ');
  return vm.runInNewContext('(' + source.slice(source.indexOf('function ', start), source.indexOf('\n  };', start) + 4) + ')', {
    EarnedAds: require('../../assets/_script/GlobalAdReward'),
    $z1KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => h.player } }, $z1KinghtFallEnum: h.load('KinghtFallEnum'),
    $z1AudioMgr: { AudioMgr: { getInstance: () => ({ playEffect() {} }) } }, $z1KinghtFallConfig: { KinghtFallAudioId: {} }, cc: { Vec2: { ZERO: {} } }
  });
}
for (const [id, field] of [[2001, 'goldNum'], [2002, 'diamondNum'], [2005, 'powerNum']]) {
  test('ad payout ' + id + ' recovers once after a failed balance write and process restart', () => {
    const h = harness(); h.player.udata.saveData(); h.state.failKeys.add(h.player.udata.gameKey);
    assert.equal(h.player.grantAdRewards([{ id, num: 123 }]), true, 'The complete journal is durable before a target balance write');
    assert.ok(h.storage.get(h.player.rewardJournalKey()));
    const next = harness(h.persist()); assert.equal(next.player.restorePendingRewards(), true);
    assert.equal(next.player.udata.data[field], 123); assert.equal(next.player.restorePendingRewards(), true); assert.equal(next.player.udata.data[field], 123);
  });
}
test('an unrelated pending journal is not mistaken for the new ad payout', () => {
  const h = harness(); h.state.failKeys.add(h.player.udata.gameKey);
  assert.equal(h.player.grantAdRewards([{ id: 2001, num: 10 }]), true);
  assert.equal(h.player.grantAdRewards([{ id: 2002, num: 20 }]), false); assert.equal(h.player.udata.data.diamondNum, 0);
  h.state.failKeys.clear(); assert.equal(h.player.grantAdRewards([{ id: 2002, num: 20 }]), true);
  assert.equal(h.player.udata.data.goldNum, 10); assert.equal(h.player.udata.data.diamondNum, 20);
});
test('a pending journal first discovered after restart cannot consume a different earned ad', () => {
  const h = harness(); h.state.failKeys.add(h.player.udata.gameKey);
  assert.equal(h.player.grantAdRewards([{ id: 2001, num: 10 }]), true);
  const next = harness(h.persist()); next.state.failKeys.add(next.player.udata.gameKey);
  assert.equal(next.player.pendingRewardJournal, undefined);
  assert.equal(next.player.grantAdRewards([{ id: 2002, num: 20 }]), false); assert.equal(next.player.udata.getDiamondNum(), 0);
  next.state.failKeys.clear(); assert.equal(next.player.grantAdRewards([{ id: 2002, num: 20 }]), true);
  assert.equal(next.player.udata.getGoldNum(), 10); assert.equal(next.player.udata.getDiamondNum(), 20);
});
test('currency payout stays retryable if the journal cannot be written and closes only once after earning it', () => {
  const h = harness(), complete = method('KinghtFallUIAddCurrency', 'completeAdReward', h); let closed = 0;
  const ui = { goodId: 2001, goldNum: 123, _adRewardPending: true, sprIcon: { node: { convertToWorldSpaceAR: () => ({}) } }, closeUI() { closed++; } };
  h.state.failKeys.add(h.player.rewardJournalKey()); assert.equal(complete.call(ui), false); assert.equal(closed, 0); assert.equal(ui._adRewardPending, true);
  h.state.failKeys.clear(); assert.equal(complete.call(ui), true); assert.equal(complete.call(ui), false); assert.equal(closed, 1); assert.equal(h.player.udata.getGoldNum(), 123);
});
test('Energy ad payout retries the same earned amount while paid/item grants remain unchanged', () => {
  const h = harness(), buy = method('KinghtFallUIAddStrength', 'onBtnBuy', h); let closed = 0;
  const ui = { closeUI() { closed++; } }; h.state.failKeys.add(h.player.rewardJournalKey());
  assert.equal(buy.call(ui, 12), false); assert.equal(closed, 0); assert.equal(ui._pendingAdEnergy, 12);
  h.state.failKeys.clear(); assert.equal(buy.call(ui, ui._pendingAdEnergy), true); assert.equal(ui._pendingAdEnergy, 0); assert.equal(h.player.udata.getPowerNum(), 12);
  assert.equal(buy.call(ui, 0), true); assert.equal(h.player.udata.getPowerNum(), 12); assert.equal(closed, 2);
});
