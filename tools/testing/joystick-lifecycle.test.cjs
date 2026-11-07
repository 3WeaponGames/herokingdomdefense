'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Node, Vec2 } = require('../navigation/runtime-harness.cjs');
const root = path.resolve(__dirname, '../..');

function fixture(start = true) {
  class TouchNode extends Node {
    constructor(...args) { super(...args); this.handlers = new Map(); }
    on(name, callback, target) { this.handlers.set(name, event => callback.call(target, event)); }
    emit(name, event) { this.handlers.get(name)(event); }
  }
  TouchNode.EventType = { TOUCH_START: 'start', TOUCH_MOVE: 'move', TOUCH_END: 'end', TOUCH_CANCEL: 'cancel' };
  class Vector extends Vec2 {}
  Vector.normalize = (out, point) => { const length = point.len() || 1; out.x = point.x / length; out.y = point.y / length; };
  Vector.multiplyScalar = (out, point, scale) => { out.x = point.x * scale; out.y = point.y * scale; };
  const events = [], moves = [], manager = { on() {}, off() {}, emit(...args) { events.push(args); } };
  const context = { exports: {}, cc: { Component: function () {}, Node: TouchNode, Vec2: Vector,
    _decorator: { ccclass: value => value, property: () => () => {} } },
    require: name => name === 'EventMgr' ? { EventMgr: { getInstance: () => manager } } : { KinghtFallEventName: { GamePause: 'pause', PlayVideoSucc: 'video' } },
    __extends(ctor, base) { ctor.prototype = Object.create(base.prototype); ctor.prototype.constructor = ctor; },
    __decorate: (_decorators, target) => target };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/KinghtFallGameUICtrl.js'), 'utf8'), context);
  const control = new context.exports.default(), area = new TouchNode('area');
  const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'), 'utf8'));
  const authored = prefab.find(node => node._name === 'ndRod')._trs.array;
  const rod = new TouchNode('rod', area, authored[0], authored[1]), knob = new TouchNode('knob', rod);
  Object.assign(control, { node: area, ndRod: rod, ndConter: knob, ndAround: Array.from({ length: 4 }, () => new TouchNode()),
    ndReview: new TouchNode(), ndCoin: new TouchNode(), ndLight: new TouchNode(), ndGuide: new TouchNode() });
  control.setMoveFunc(value => moves.push(value && { x: value.x, y: value.y }));
  if (start) control.start();
  return { control, area, rod, knob, moves, events, rest: { x: authored[0], y: authored[1] } };
}
function touch(id, x, y, startX = x, startY = y) {
  return { touch: { getID: () => id, getLocation: () => new Vec2(x, y), getStartLocation: () => new Vec2(startX, startY) } };
}
function resting(f) {
  assert.deepEqual({ x: f.rod.x, y: f.rod.y }, f.rest);
  assert.equal(f.knob.x, 0); assert.equal(f.knob.y, 0);
  assert(f.control.ndAround.every(node => !node.active));
}

for (const terminal of ['end', 'cancel']) test('Joystick ' + terminal + ' restores the authored resting point and sends one stop', () => {
  const f = fixture();
  f.area.emit('start', touch(0, 170, -210));
  f.area.emit('move', touch(0, 230, -130, 170, -210));
  assert.deepEqual(f.moves, [{ x: 60, y: 80 }]);
  assert.equal(f.knob.x, 60); assert.equal(f.knob.y, 80);
  f.area.emit(terminal, touch(0, 230, -130)); resting(f);
  assert.deepEqual(f.moves, [{ x: 60, y: 80 }, null]);
  f.control.onDisable(); assert.equal(f.moves.length, 2, 'disabling after release sent a duplicate stop');
});

test('A second finger cannot move the joystick base or steal the controlling touch', () => {
  const f = fixture();
  f.area.emit('start', touch(0, 140, -190));
  f.area.emit('move', touch(0, 170, -150, 140, -190));
  f.area.emit('start', touch(7, 320, -400));
  assert.equal(f.control.touchID, 0); assert.equal(f.rod.x, 140); assert.equal(f.rod.y, -190);
  f.area.emit('move', touch(7, 400, -400, 320, -400));
  f.area.emit('end', touch(7, 400, -400));
  assert.equal(f.moves.length, 1); assert.equal(f.control.touchID, 0);
  f.area.emit('end', touch(0, 170, -150)); resting(f);
  assert.deepEqual(f.moves, [{ x: 30, y: 40 }, null]);
  assert.equal(f.events.length, 1, 'an unrelated touch changed gameplay pause state');
});

test('Disabling during a drag handles a missing terminal event and the next drag starts cleanly', () => {
  const f = fixture();
  f.area.emit('start', touch(3, 200, -330));
  f.area.emit('move', touch(3, 500, -330, 200, -330));
  assert.deepEqual(f.moves, [{ x: 100, y: 0 }], 'movement radius changed');
  f.control.onDisable(); resting(f); assert.equal(f.control.touchID, false);
  assert.deepEqual(f.moves, [{ x: 100, y: 0 }, null]);
  f.control.onDisable(); assert.equal(f.moves.length, 2);
  f.area.emit('start', touch(9, -80, -220));
  f.area.emit('move', touch(9, -80, -200, -80, -220));
  f.area.emit('cancel', touch(9, -80, -200)); resting(f);
  assert.deepEqual(f.moves.slice(-2), [{ x: 0, y: 20 }, null]);
});

test('Pre-start disabling preserves placement and an explicit input block still forces movement to stop', () => {
  const f = fixture(false);
  f.control.onDisable();
  assert.deepEqual({ x: f.rod.x, y: f.rod.y }, f.rest); assert.equal(f.moves.length, 0);
  f.control.start(); f.control.onBlockTouch(); resting(f);
  assert.deepEqual(f.moves, [null]);
});
