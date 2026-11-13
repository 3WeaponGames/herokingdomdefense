'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Node, Vec2 } = require('../navigation/runtime-harness.cjs');
const root = path.resolve(__dirname, '../..');

function fixture(start = true, game = null) {
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
  const ui = { isPauset: false, ctrGame: game };
  const context = { exports: {}, cc: { Component: function () {}, Node: TouchNode, Vec2: Vector, isValid: value => !!value && !value.destroyed,
    _decorator: { ccclass: value => value, property: () => () => {} } },
    require: name => name === 'EventMgr' ? { EventMgr: { getInstance: () => manager } } : name === 'KinghtFallUIGame' ? { default: { instance: ui } } : { KinghtFallEventName: { GamePause: 'pause', PlayVideoSucc: 'video' } },
    __extends(ctor, base) { ctor.prototype = Object.create(base.prototype); ctor.prototype.constructor = ctor; },
    __decorate: (_decorators, target) => target };
  const preferenceContext={exports:{},cc:context.cc};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/ControlPreferences.js'),'utf8'),preferenceContext);
  const skillContext={exports:{},cc:context.cc,Date,Math,require:name=>require(path.join(root,'assets/_script',name))};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroSkillHUD.js'),'utf8'),skillContext);
  const originalRequire=context.require;context.require=name=>name==='ControlPreferences'?preferenceContext.exports:name==='HeroSkillHUD'?skillContext.exports:originalRequire(name);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/KinghtFallGameUICtrl.js'), 'utf8'), context);
  const control = new context.exports.default(), area = new TouchNode('area');
  const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'), 'utf8'));
  const authored = prefab.find(node => node._name === 'ndRod')._trs.array;
  const rod = new TouchNode('rod', area, authored[0], authored[1]), knob = new TouchNode('knob', rod);
  Object.assign(control, { node: area, ndRod: rod, ndConter: knob, ndAround: Array.from({ length: 4 }, () => new TouchNode()),
    ndReview: new TouchNode(), ndCoin: new TouchNode(), ndLight: new TouchNode(), ndGuide: new TouchNode() });
  control.setMoveFunc(value => moves.push(value && { x: value.x, y: value.y }));
  if (start) control.start();
  return { control, area, rod, knob, moves, events, ui, preferences:preferenceContext.exports, rest: { x: authored[0], y: authored[1] } };
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

function selectionFixture(){
  const selected=[],unit={node:new Node()};unit.node._combatGeneration=1;
  const game={findFollowUnitAtScreen:p=>p.x===170?unit:null,selectFollower:u=>selected.push(u)};
  return {...fixture(true,game),selected,unit};
}
test('A unit tap selects on release without moving or repositioning the joystick',()=>{
  const f=selectionFixture();f.area.emit('start',touch(0,170,-210));resting(f);assert.equal(f.control.touchID,false);
  f.area.emit('end',touch(0,170,-210));assert.deepEqual(f.selected,[f.unit]);assert.deepEqual(f.moves,[]);assert.deepEqual(f.events,[]);
});
test('Dragging from a unit becomes a normal movement gesture and does not select it',()=>{
  const f=selectionFixture();f.area.emit('start',touch(0,170,-210));f.area.emit('move',touch(0,230,-130,170,-210));
  assert.deepEqual(f.moves,[{x:60,y:80}]);assert.equal(f.rod.x,170);assert.equal(f.rod.y,-210);
  f.area.emit('end',touch(0,230,-130));resting(f);assert.equal(f.selected.length,0);assert.equal(f.moves.at(-1),null);
});
test('A second finger can tap-select while the first finger retains joystick movement',()=>{
  const f=selectionFixture();f.area.emit('start',touch(0,0,-200));f.area.emit('move',touch(0,30,-200,0,-200));
  f.area.emit('start',touch(7,170,-210));f.area.emit('end',touch(7,170,-210));assert.equal(f.selected.length,1);
  assert.equal(f.control.touchID,0);assert.deepEqual(f.moves,[{x:30,y:0}]);f.area.emit('end',touch(0,30,-200));assert.equal(f.moves.at(-1),null);
});
test('Cancelled, blocked, paused or recycled-unit touches cannot change follow selection',()=>{
  for(const kind of ['cancel','block','disable','paused','recycled','destroyed']){
    const f=selectionFixture();f.area.emit('start',touch(0,170,-210));
    if(kind==='cancel')f.area.emit('cancel',touch(0,170,-210));
    else {if(kind==='block')f.control.onBlockTouch();if(kind==='disable')f.control.onDisable();if(kind==='paused')f.ui.isPauset=true;if(kind==='recycled')f.unit.node._combatGeneration++;if(kind==='destroyed')f.unit.node.destroyed=true;f.area.emit('end',touch(0,170,-210));}
    assert.equal(f.selected.length,0,kind);
  }
});
test('Hide idle controls keeps input active, reveals on touch and hides after release, cancellation and blocking',()=>{
  const f=fixture();assert(f.rod.active);f.preferences.setHideIdle(true);assert.equal(f.rod.active,false);assert(f.area.active);
  for(const terminal of ['end','cancel']){f.area.emit('start',touch(0,40,-300));assert(f.rod.active);f.area.emit('move',touch(0,70,-300,40,-300));assert(f.rod.active);f.area.emit(terminal,touch(0,70,-300));assert.equal(f.rod.active,false);resting(f);}
  f.area.emit('start',touch(1,40,-300));f.control.onBlockTouch();assert.equal(f.rod.active,false);assert.equal(f.control.touchID,false);f.preferences.setHideIdle(false);assert(f.rod.active);
});
test('keyboard movement reveals the indicator and touch movement remains visible when movement keys are released',()=>{
  const f=fixture();f.preferences.setHideIdle(true);f.control.setKeyboardMoving(true);assert(f.rod.active);f.control.setKeyboardMoving(false);assert.equal(f.rod.active,false);
  f.area.emit('start',touch(0,40,-300));f.control.setKeyboardMoving(true);f.control.setKeyboardMoving(false);assert(f.rod.active);f.area.emit('end',touch(0,40,-300));assert.equal(f.rod.active,false);
  f.control.setKeyboardMoving(true);f.control.onDisable();assert.equal(f.rod.active,false);f.control.onDestroy();f.preferences.setHideIdle(false);assert.equal(f.rod.active,false,'a destroyed controller retained its preference listener');
});
test('footer relayout updates the release position without moving a held joystick or issuing movement commands',()=>{
  const f=fixture();f.area.emit('start',touch(0,40,-300));f.control.setJoystickRest(new Vec2(-180,-540));assert.equal(f.rod.x,40);assert.equal(f.rod.y,-300);assert.deepEqual(f.moves,[]);
  f.rest={x:-180,y:-540};f.area.emit('end',touch(0,40,-300));resting(f);assert.deepEqual(f.moves,[null]);
});


test('armed skill direction selection consumes its touch before follow selection or joystick movement',()=>{
 const calls=[],rt={aiming:true,state:{style:'skirmisher',cooldown:0},available:()=>true,screenAim(p){this.aimDirection={x:p.x,y:p.y};},cast(direction){calls.push(direction);this.aiming=false;}};
 const hero={_styleRuntime:rt,_skillHUD:{runtime:rt}},game={ctrPlay:hero,findFollowUnitAtScreen(){throw Error('skill aim must run before follow selection');}};
 const f=fixture(true,game);f.area.emit('start',touch(7,170,-210));f.area.emit('move',touch(7,230,-130,170,-210));f.area.emit('end',touch(7,230,-130));
 assert.equal(calls.length,1);assert.equal(calls[0].x,230);assert.equal(calls[0].y,-130);assert.equal(f.control.touchID,false);assert.deepEqual(f.moves,[]);resting(f);
});
