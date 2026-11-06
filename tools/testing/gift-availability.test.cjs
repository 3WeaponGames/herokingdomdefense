'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function manager(now) {
  const exports = {};
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/KinghtFallDataMgr.js'), 'utf8'), { exports, Date: Clock, require: () => ({}) });
  const instance = new exports.KinghtFallDataMgr();
  instance.data = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
  return instance;
}
test('Expired bundled gifts are neither promoted nor exposed as active codes', () => {
  const data = manager(new Date(2026, 10, 6).getTime());
  assert.equal(data.hasActiveGiftCode(), false);
  assert.equal(data.getCodeJoin(1), null);
  for (const gift of data.data.GiftCfg) assert.equal(data.getCodeStatus(gift), 'expired');
});
test('Gift dates parse portably and invalid dates fail closed', () => {
  const data = manager(new Date(2024, 11, 5, 12).getTime());
  assert.equal(data.getCodeStatus(data.getCode('dy5757')), 'active');
  assert.equal(data.getCodeStatus({ begin_time: '2024-12-6 00:00:00' }), 'future');
  assert.equal(data.getCodeStatus({ end_time: '2024-12-5 12:00:00' }), 'expired');
  for (const end_time of ['nonsense', '2024-2-30 00:00:00', '2024-12-5 25:00:00']) assert.equal(data.getCodeStatus({ end_time }), 'invalid');
});
