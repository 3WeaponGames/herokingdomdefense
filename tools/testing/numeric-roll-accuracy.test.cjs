'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function fixture() {
  const source = fs.readFileSync(path.join(__dirname, '../../assets/_script/UIUtils.js'), 'utf8');
  const cc = { tween() {
    let step, completion, repeats = 0;
    return { call(fn) { if (!step) step = fn; else completion = fn; return this; },
      delay() { return this; }, union() { return this; }, repeat(count) { repeats = count; return this; },
      start() { for (let index = 0; index < repeats; index++) step(); if (completion) completion(); return this; } };
  } };
  const context = { cc, exports: {} }; vm.runInNewContext(source, context);
  return context.exports.UIUtils;
}

test('whole-number counters preserve fractional progress and reach their exact endpoint before completion', () => {
  for (const increase of [true, false]) for (const amount of [0, 5, 60, 61, 100, 300, 1000]) {
    const api = fixture(), initial = increase ? 17 : amount + 17, target = increase ? initial + amount : 17;
    let value = String(initial), completions = 0; const frames = [];
    const label = { node: {}, get string() { return value; }, set string(next) { value = next; frames.push(Number(next)); } };
    api.rollNumLabelAtlas(increase, label, amount, target, () => { completions++; assert.equal(Number(label.string), target); });
    assert.equal(completions, 1); assert.equal(Number(label.string), target);
    let previous = initial;
    for (const frame of frames) { assert(increase ? frame >= previous && frame <= target : frame <= previous && frame >= target); previous = frame; }
  }
});

test('numeric counter completion is optional for animated and unchanged values', () => {
  for (const amount of [0, 100]) {
    const label = { node: {}, string: '0' };
    assert.doesNotThrow(() => fixture().rollNumLabelAtlas(true, label, amount, amount));
    assert.equal(Number(label.string), amount);
  }
});
