'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const authored = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const dir = path.resolve(__dirname, '../../assets/_script');
const single = instance => ({ getInstance: () => instance });
const noop = () => {};

function load(name, cc, modules, globals = {}) {
  const exports = modules[name] = {};
  vm.runInNewContext(fs.readFileSync(path.join(dir, name + '.js'), 'utf8'), {
    exports, cc, sp: { Skeleton: function () {} }, require: id => modules[id] || { default: function () {} },
    __extends(Child, Parent) { Child.prototype = Object.create(Parent.prototype); Child.prototype.constructor = Child; },
    __decorate: (_decorators, target, key) => key === undefined ? target : undefined, ...globals
  }, { filename: name + '.js' });
  return exports;
}

function fixture() {
  const allocated = [], pending = [], modules = {};
  class Node {
    constructor() {
      this.children = []; this.parent = null;
      this.component = { node: this, initData(...args) { this.initArgs = args; }, initView(reward) { this.reward = reward; } };
    }
    setParent(parent) { this.removeFromParent(); this.parent = parent; parent.children.push(this); }
    removeFromParent() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    setPosition(value) { this.position = value; }
    setScale(value) { this.scale = value; }
    getComponent() { return this.component; }
    destroy() { this.destroyed = true; this.removeFromParent(); }
  }
  const cc = {
    Node, _decorator: { ccclass: x => x, property: () => noop }, isValid: x => !!x && !x.destroyed,
    instantiate() { const node = new Node(); allocated.push(node); return node; },
    tween() { return { set() { return this; }, to() { return this; }, start() {} }; }
  };
  const configured = process.env.COCOS_ENGINE_ROOT || process.env.COCOS_ENGINE_DIR;
  const engine = configured || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
  const file = path.join(engine, 'extensions/ccpool/CCNodePool.js');
  if (configured || fs.existsSync(file)) {
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { cc, CC_DEV: false, module: { exports: {} }, require: () => ({}) });
  } else {
    cc.NodePool = class {
      constructor() { this.nodes = []; }
      put(node) { node.removeFromParent(); this.nodes.push(node); }
      get() { return this.nodes.pop(); }
      size() { return this.nodes.length; }
      clear() { this.nodes.forEach(node => node.destroy()); this.nodes.length = 0; }
    };
  }
  const pool = load('PoolMgr', cc, modules).PoolMgr.getInstance();
  modules.KinghtFallConfig = {
    KinghtFallPoolName: { Enemy: 'enemy', Soldier: 'ally', ItemGood: 'reward' },
    KinghtFallBundelName: { Enemy: 'units', Effect: 'effects', IconGood: 'items' },
    KinghtFallPrefabName: { ItemGood: 'ItemGood' }
  };
  modules.KinghtFallDataMgr = { KinghtFallDataMgr: single({ getSoldierCfgById: id => authored.SoldierCfg[id] }) };
  // Allocation ownership is isolated here; real coordinate/spread behavior has
  // its own runtime harness with actual scene transforms and collision grids.
  modules.KinghtFallNavigation = { positionOf: node => node.position, reset: noop };
  modules.SpawnArea = { prepare: noop, apply: () => true };
  const actors = [];
  const ctrl = Object.assign(Object.create(load('KinghtFallGameCtrl', cc, modules).default.prototype), {
    node: new Node(), ndMain: new Node(), ndPath: { getChildByName: () => ({ position: { x: 0, y: 0 } }) },
    _combatEpoch: 1, gameData: { pendingEnemySpawns: 0, addEnemy: actor => actors.push(actor), addSoldier: actor => actors.push(actor) }
  });
  const fx = Object.create(load('KinghtFallGameEffect', cc, modules).default.prototype);
  const prefab = {};
  function loadPrefab(bundle, name, done) { pending.push({ bundle, name, deliver: () => done(prefab) }); }
  ctrl.loadPrefab = fx.loadPrefab = loadPrefab;
  return { cc, pool, modules, allocated, pending, Node, actors, ctrl, fx, loadPrefab, prefab };
}

for (const kind of ['ally', 'enemy', 'effect']) {
  test(kind + ' concurrent first prefab requests match sequential allocations and fulfill every request once', () => {
    const count = kind === 'effect' ? authored.SoldierCfg[90009].Data[2] : 4;
    const id = kind === 'ally' ? Object.values(authored.BuildEnum).find(b => b.enumKey === 'Barracks').levelList[0].Data[1] : 90001;
    const totals = [];
    for (const concurrent of [false, true]) {
      const f = fixture(), delivered = [];
      function deliver() { f.pending.splice(0).reverse().forEach(request => request.deliver()); }
      for (let i = 0; i < count; i++) {
        if (kind === 'ally') f.ctrl.addSoldier(id, actor => delivered.push(actor));
        if (kind === 'enemy') f.ctrl.addEnemy(id, 1);
        if (kind === 'effect') f.fx.onBuff('Soldier9Buff', 'heal', node => delivered.push(node));
        if (!concurrent) deliver();
      }
      if (concurrent) assert.equal(f.pending.length, count);
      deliver();
      const output = kind === 'enemy' ? f.actors : delivered;
      assert.equal(new Set(output).size, count);
      assert.equal(output.length, count);
      if (kind !== 'effect') {
        assert.equal(f.actors.length, count);
        for (const actor of f.actors) {
          assert.equal(actor.node.parent, f.ctrl.ndMain);
          assert.equal(actor.initArgs[0], id);
        }
      }
      assert.equal(f.ctrl.gameData.pendingEnemySpawns, 0);
      assert.equal(f.pool.poolMap.size, 1);
      assert.equal(f.allocated.filter(node => node.destroyed).length, 0);
      totals.push(f.allocated.length);
    }
    assert.deepEqual(totals, kind === 'ally' ? [5, 5] : [12, 12]);
  });
}

test('a retired combat load cannot prime a pool or consume a current pending spawn', () => {
  const f = fixture();
  f.ctrl.addEnemy(90001, 1);
  const expired = f.pending.shift();
  f.ctrl._combatEpoch++; f.ctrl.gameData = { ...f.ctrl.gameData, pendingEnemySpawns: 0 };
  f.ctrl.addEnemy(90001, 1);
  expired.deliver();
  assert.equal(f.pool.poolMap.size, 0);
  assert.equal(f.ctrl.gameData.pendingEnemySpawns, 1);
  f.pending.shift().deliver();
  assert.equal(f.actors.length, 1);
  assert.equal(f.ctrl.gameData.pendingEnemySpawns, 0);
});

test('reward views share the same detached template across cold delivery and rebuild once after an explicit pool clear', () => {
  const f = fixture();
  const gold = Object.create(load('KinghtFallUIGoldReward', f.cc, f.modules).default.prototype);
  const end = Object.create(load('KinghtFallUIGameEnd', f.cc, f.modules).default.prototype);
  gold.ndCtr = { node: new f.Node(), getPos: i => i };
  end.ndReward = { node: new f.Node(), getPos: i => i };
  gold.loadPrefab = end.loadPrefab = f.loadPrefab;
  for (const [index, view] of [gold, end, gold, end, gold].entries()) view.aniNormal({ id: 100 + index, num: index + 1 }, index);
  assert(f.pending.every(request => request.bundle === 'items' && request.name === 'ItemGood'));
  f.pending.shift().deliver();
  const first = f.pool.poolMap.get('reward');
  assert.equal(first._node.parent, null);
  f.pending.shift().deliver();
  assert.equal(f.pool.poolMap.get('reward'), first);
  assert.equal(f.allocated.length, 12);
  f.pool.clearPool('reward');
  assert.equal(first._isReady, false);
  assert.equal(f.allocated.filter(node => node.destroyed).length, 10);
  f.pending.splice(0).forEach(request => request.deliver());
  assert.equal(f.allocated.length, 24);
  const second = f.pool.poolMap.get('reward');
  assert.notEqual(second, first);
  assert.equal(second._node.parent, null);
  for (const [row, indexes] of [[gold.ndCtr, [0, 2, 4]], [end.ndReward, [1, 3]]]) {
    assert.deepEqual(row.node.children.map(node => node.position), indexes);
    for (const node of row.node.children) {
      assert.equal(node.destroyed, undefined);
      assert.deepEqual(node.component.reward, { id: 100 + node.position, num: node.position + 1 });
    }
  }
  const replacement = new f.Node(), scene = new f.Node();
  replacement.setParent(scene);
  const ownedTemplate = second._node;
  f.pool.creatrePool('reward', replacement, 0);
  assert(ownedTemplate.destroyed);
  f.pool.clearPool('reward');
  assert.equal(replacement.destroyed, undefined, 'explicitly borrowed scene template retains its owner');
});

test('legacy battle config and onLoad ignore malformed query entries and preserve supported flag values', () => {
  const noopBase = function () {};
  const cc = { JsonAsset: noopBase, _decorator: { ccclass: x => x, property: () => noop } };
  const window = { location: { search: '?%zz=unused&isEditor=%FF&isEditor=1&dup=first&dup=last&plus=a+b&%E9%9B%AA=%E7%8C%AB' } };
  let loaded = 0, released = 0;
  const modules = {
    PlatformManager: { PlatformManager: { currentPlatform: 'editor' } }, BasePlatform: { Platform: { EDITOR: 'editor' } },
    GAD_Configs: { emGADBundles: { configs: 'configs' } }, BaseUI: { default: noopBase },
    GAD_PlayerMgr: { default: single({ getLevel: () => 1 }) },
    ResourceMgr: { ResourceMgr: single({ loadRes(bundle, file, type, done) {
      assert.deepEqual([bundle, file, type], ['configs', 'GameJsonCfg', cc.JsonAsset]);
      done({ json: { levelCfg: ['wave'] }, decRef: () => released++ });
    } }) }
  };
  const data = load('GAD_DataMgr', cc, modules, { window }).default.getInstance();
  data.load(() => loaded++);
  const game = new (load('GAD_UIGame', cc, modules, { window }).default)();
  game.onLoad();
  assert.equal(loaded, 1); assert.equal(released, 1);
  assert.equal(game._isEditor, true); assert.deepEqual(game._waveLevelCfgs, ['wave']);
  assert.equal(data.getUrlParam('dup'), 'first');
  assert.equal(data.getUrlParam('plus'), 'a+b');
  assert.equal(data.getUrlParam('雪'), '猫');
  window.location.search = '?isEditor=%FF'; assert.equal(data.getUrlParam('isEditor'), null);
  window.location.search = ''; assert.equal(data.getUrlParam('isEditor'), null);
});
