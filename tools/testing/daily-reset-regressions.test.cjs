'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function clocks(now) {
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  function load(name) {
    const exports = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script', name + '.js'), 'utf8'), {
      exports, Date: Clock, require: () => ({}),
      cc: { _decorator: { ccclass: value => value, property() {} } },
      __decorate: (decorators, value) => decorators.reduceRight((v, fn) => fn(v) || v, value),
      __spreadArrays: (...arrays) => [].concat(...arrays)
    }, { filename: name + '.js' });
    return exports;
  }
  const game = load('KinghtFallModle').default.getInstance();
  const common = load('TimeUtils').TimeUtils;
  return stamp => [game.compareIsToday(stamp), common.compareIsToday(stamp / 1000)];
}

test('Daily checks distinguish same weekdays seven, fourteen and twenty-one days apart', () => {
  const check = clocks(new Date(2026, 10, 27, 12).getTime());
  for (const date of [6, 13, 20]) assert.deepEqual(check(new Date(2026, 10, date, 12).getTime()), [false, false]);
  assert.deepEqual(check(new Date(2026, 10, 27, 1).getTime()), [true, true]);
});

test('Daily checks use local calendar midnight, including month/year boundaries', () => {
  for (const now of [new Date(2026, 10, 7, 0, 1), new Date(2026, 11, 1, 0, 1), new Date(2027, 0, 1, 0, 1)]) {
    const check = clocks(now.getTime());
    assert.deepEqual(check(now.getTime() - 120000), [false, false]);
    assert.deepEqual(check(now.getTime() + 60000), [true, true]);
  }
});

test('Daily checks survive daylight-saving transitions and reject invalid dates', () => {
  for (const day of [new Date(2026, 2, 29, 23, 30), new Date(2026, 9, 25, 23, 30)]) {
    const early = new Date(day); early.setHours(0, 1, 0, 0);
    const check = clocks(day.getTime());
    assert.deepEqual(check(early.getTime()), [true, true]);
    assert.deepEqual(check(NaN), [false, false]);
  }
});
