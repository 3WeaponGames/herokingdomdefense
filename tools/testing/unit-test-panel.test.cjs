'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { setup, Node } = require('./backend-gameplay-harness.cjs');

class PanelNode extends Node {
  constructor(name) { super(name); this.events = new Map(); }
  addChild(child) { child.setParent(this); }
  setContentSize(width, height) { Object.assign(this, { width, height }); }
  setAnchorPoint(anchorX, anchorY) { Object.assign(this, { anchorX, anchorY }); }
  on(event, callback) { this.events.set(event, callback); }
  destroy() { this.destroyed = true; this.setParent(null); }
}
PanelNode.EventType = { TOUCH_END: 'tap' };
class Label {}
Label.HorizontalAlign = Label.VerticalAlign = { LEFT: 0, CENTER: 1 };
Label.Overflow = { SHRINK: 1 };
class Graphics { clear() {} rect() {} roundRect() {} fill() {} stroke() {} }
class EditBox {}
EditBox.InputMode = { SINGLE_LINE: 1, NUMERIC: 2 };
class Sprite {}
Sprite.SizeMode = { CUSTOM: 1 };

function fixture() {
  const h = setup({ SpawnArea: { prepare() {}, apply: () => true } });
  const { g: game, d: data, e: { cc, stubs }, ui } = h;
  const requests = new Map(), assets = new Map(), placed = [];
  const units = {};
  for (let index = 1; index <= 14; index++) {
    const id = 90000 + index;
    units[id] = { ID: id, Name: 'Model ' + String(index).padStart(2, '0'), MonsterSource: 'model-' + index, prefab: 'unit-' + index, AttackType: 3 };
  }
  units[91001] = { ...units[90001], ID: 91001, prefab: 'unit-1-mystic' };
  const manager = stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
  manager.data = {
    SoldierCfg: units,
    GameTools: {
      unitTypes: { fighter: { name: 'Fighter' }, mystic: { name: 'Mystic' } },
      unitTypeAssignments: { 'enemy:90001:default': 'fighter', 'enemy:91001:default': 'mystic' }
    }
  };
  manager.getSoldierCfgById = id => units[id];
  stubs.KinghtFallConfig.KinghtFallBundelName.Enemy = 'enemy';
  stubs.LanguageMgr = { LanguageMgr: { getInstance: () => ({ t: value => value }) } };
  game.gameStatus = stubs.KinghtFallModle.KinghtFallGameStage.Prepare;
  new Node('ndEnemy1', game.ndPath, 10, 20);
  new Node('ndEnemy2', game.ndPath, 30, 40);
  ui.ctrUI = { node: new PanelNode('Battle UI') };
  ui.canBreak = true;
  Object.assign(cc, {
    Node: PanelNode, Label, Graphics, EditBox, Sprite, Prefab: class {}, BlockInputEvents: class {},
    color: value => value,
    view: { getVisibleOrigin: () => cc.v2(0, 0), getVisibleSize: () => ({ width: 750, height: 1334 }) },
    assetManager: { getBundle: () => ({ load(asset, _type, callback) {
      assert(!requests.has(asset), 'The same prefab should only be requested once per send');
      requests.set(asset, callback);
    } }) },
    instantiate(prefab) {
      assert(prefab.refs > 0, 'The encounter must hold its prefab across spawn intervals');
      const node = new PanelNode('Test actor');
      const actor = {
        node, rigidBody: { active: true }, attacks: 0,
        initData(id, spawn) { this.cfg = units[id]; placed.push({ id, spawn, path: prefab.path, actor: this }); },
        onUpdate() {},
        doAttackStart() { this.attacks++; }
      };
      node.getComponent = () => actor;
      return node;
    }
  });
  function load(name, extra = {}) {
    const exports = {};
    const file = path.join(__dirname, '../../assets/_script', name + '.js');
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { cc, exports, require: id => extra[id] || h.load(id) }, { filename: file });
    return exports;
  }
  const panel = load('UnitTestPanel', { UnitTestEncounter: load('UnitTestEncounter') });
  function get(...names) {
    return names.reduce((parent, name) => parent.getChildByName(name), ui.ctrUI.node.getChildByName('UnitTestOverlay').getChildByName('UnitTestPanel'));
  }
  function tap(...names) {
    const node = get(...names);
    assert(node.activeInHierarchy, 'The control must be visible');
    node.events.get('tap')({ stopPropagation() {} });
  }
  function search(text) {
    const node = get('Search');
    node.getComponent(EditBox).string = text;
    node.events.get('text-changed')();
  }
  function complete(asset, error) {
    const callback = requests.get(asset);
    assert(callback, asset);
    requests.delete(asset);
    if (!assets.has(asset)) assets.set(asset, {
      refs: 0, path: asset,
      addRef() { this.refs++; return this; },
      decRef() { assert(this.refs > 0); this.refs--; }
    });
    const prefab = assets.get(asset);
    callback(error, error ? null : prefab);
    return prefab;
  }
  return {
    game, data, ui, requests, placed, units, get, tap, search, complete,
    toggle: () => assert.equal(panel.toggle(ui), true),
    text: (...names) => get(...names).getComponent(Label).string,
    setInput: (name, value) => { get(name).getComponent(EditBox).string = value; }
  };
}

test('F7 toggles cards across pages and searches, then sends each chosen profile with the shared count and spawn', () => {
  const f = fixture();
  f.toggle();
  f.tap('Send units');
  assert.equal(f.requests.size, 0);
  f.tap('Model 1');
  f.tap('Profile', 'Next');
  assert.equal(f.text('Profile', 'Value'), 'Mystic');
  f.tap('Model 2');
  assert(f.get('Model 1', 'Selected').active);
  assert(f.get('Model 2', 'Selected').active);
  f.tap('Model 2');
  assert.equal(f.get('Model 2', 'Selected').active, false);
  f.tap('Next page');
  f.tap('Model 1');
  f.search('no match');
  assert.equal(f.text('Model range'), 'No matching models · 2 selected');
  f.search('Model 01');
  assert(f.get('Model 1', 'Selected').active);
  f.toggle();
  assert.deepEqual(Array.from(f.ui._unitTestDraft.units), [91001, 90013]);
  f.toggle();
  assert(f.get('Model 1', 'Selected').active);
  f.setInput('Count', '2');
  f.tap('Spawn point', 'Next');
  f.tap('Send units');
  assert.deepEqual(Array.from(f.requests.keys()), ['unit-1-mystic', 'unit-13']);
  const second = f.complete('unit-13');
  assert.equal(f.placed.length, 0);
  const first = f.complete('unit-1-mystic');
  assert.equal(f.ui._unitTestPanel, null);
  const run = f.game._unitTest;
  assert.deepEqual(f.placed.map(unit => unit.id), [91001]);
  run.update(.25);
  assert.equal(f.placed.length, 1);
  run.update(.25);
  run.update(1);
  assert.deepEqual(f.placed.map(({ id, spawn, path }) => [id, spawn, path]), [
    [91001, 2, 'unit-1-mystic'], [90013, 2, 'unit-13'], [91001, 2, 'unit-1-mystic'], [90013, 2, 'unit-13']
  ]);
  assert.equal(f.data.enemyList.length, 0);
  assert(f.placed.every(({ actor }) => actor._unitTestActor && !actor.rigidBody.active));
  assert.equal(run.cameraTarget(), f.placed[0].actor.node);
  f.toggle();
  f.tap('Play attack');
  assert(f.placed.every(({ actor }) => actor.attacks === 1));
  f.toggle();
  f.tap('Clear units');
  assert.equal(f.game._unitTest, null);
  assert(f.placed.every(({ actor }) => actor.node.destroyed));
  assert.equal(first.refs, 0);
  assert.equal(second.refs, 0);
});

test('F7 validates the total before loading and releases a failed or cancelled batch without replacing the active test', () => {
  const f = fixture();
  f.toggle();
  f.tap('Model 1');
  f.tap('Send units');
  const first = f.complete('unit-1');
  const previous = f.game._unitTest;
  f.toggle();
  f.tap('Model 2');
  f.setInput('Count', '51');
  f.tap('Send units');
  assert.match(f.text('Status'), /100 units total/);
  assert.equal(f.requests.size, 0);

  f.setInput('Count', '1');
  f.tap('Send units');
  f.complete('unit-1');
  assert.equal(first.refs, 2);
  const failed = f.complete('unit-2', Error('Asset unavailable'));
  assert.equal(f.text('Status'), 'Could not load Model 02.');
  assert.equal(f.game._unitTest, previous);
  assert.equal(first.refs, 1);
  assert.equal(failed.refs, 0);

  f.tap('Send units');
  f.complete('unit-1');
  f.toggle();
  const late = f.complete('unit-2');
  assert.equal(f.game._unitTest, previous);
  assert.equal(f.placed.length, 1);
  assert.equal(first.refs, 1);
  assert.equal(late.refs, 0);
  previous.dispose();
  assert.equal(first.refs, 0);
});

test('F7 uses one prefab for distinct selected models that share the same asset', () => {
  const f = fixture();
  f.units[90002].prefab = f.units[90001].prefab;
  f.toggle();
  f.tap('Model 1');
  f.tap('Model 2');
  f.tap('Send units');
  assert.deepEqual(Array.from(f.requests.keys()), ['unit-1']);
  const shared = f.complete('unit-1');
  const run = f.game._unitTest;
  run.update(.5);
  assert.deepEqual(f.placed.map(unit => unit.id), [90001, 90002]);
  assert.equal(shared.refs, 1);
  run.dispose();
  assert.equal(shared.refs, 0);
});
