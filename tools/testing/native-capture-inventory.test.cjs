'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const Inventory = require('../../assets/_script/NativeCaptureInventory');
const depthSource = fs.readFileSync(path.join(__dirname, '../../assets/_script/KinghtFallDepthView.js'), 'utf8');

function fixture() {
  class Node {
    constructor(parent = null) {
      this._parent = parent;
      this._children = [];
      this._components = [];
      this._activeInHierarchy = true;
      this.activationReads = 0;
      if (parent) parent.children.push(this);
    }

    get parent() { return this._parent; }
    get children() { return this._children; }
    get activeInHierarchy() {
      this.activationReads++;
      return this._activeInHierarchy;
    }

    getComponents(Type) {
      return this._components.filter(component => Type._sealed ? component.constructor === Type : component instanceof Type);
    }
  }

  class Scene extends Node {
    get activeInHierarchy() { throw Error('The stock Scene root does not expose an active flag'); }
  }

  class Skeleton {
    constructor(node, name) {
      this.node = node;
      this.name = name;
      this._nativeSkeleton = { _comp: this };
      this.enabled = true;
      node._components.push(this);
    }

    isAnimationCached() { return this.cached === true; }
  }

  const ranks = new WeakMap();
  const inventory = (scene, raw) => Inventory.collect(scene, raw, Node, Skeleton, ranks, Skeleton.prototype.isAnimationCached);
  function expected(scene) {
    const result = [];
    function visit(node) {
      if (node !== scene && node.activeInHierarchy === false) return;
      result.push(...node.getComponents(Skeleton).filter(component => component.enabled !== false));
      node.children.forEach(visit);
    }
    visit(scene);
    return result;
  }

  return { Node, Scene, Skeleton, inventory, expected };
}

function wrappers(...components) {
  return components.map(component => component._nativeSkeleton);
}

test('native inventory restores exact tree and component order after reordering and reparenting', () => {
  const f = fixture();
  const scene = new f.Scene();
  const left = new f.Node(scene);
  const right = new f.Node(scene);
  const branch = new f.Node(left);
  const child = new f.Node(branch);
  const root = new f.Skeleton(scene, 'scene');
  const leftRig = new f.Skeleton(left, 'left root');
  const rightRig = new f.Skeleton(right, 'right root');
  const first = new f.Skeleton(branch, 'first on branch');
  const second = new f.Skeleton(branch, 'second on branch');
  const nested = new f.Skeleton(child, 'child');
  const raw = wrappers(nested, second, rightRig, root, first, leftRig);

  assert.deepEqual(f.inventory(scene, raw), [root, leftRig, first, second, nested, rightRig]);
  scene.children.reverse();
  branch._components.reverse();
  assert.deepEqual(f.inventory(scene, raw), [root, rightRig, leftRig, second, first, nested]);

  branch.children.pop();
  child._parent = right;
  right.children.unshift(child);
  assert.deepEqual(f.inventory(scene, raw), [root, rightRig, nested, leftRig, second, first]);
  assert.deepEqual(f.inventory(scene, raw), f.expected(scene));
  assert.deepEqual(raw, wrappers(nested, second, rightRig, root, first, leftRig));
});

test('native inventory keeps wide and deep ranks in the same order as short paths', () => {
  const f = fixture();
  const scene = new f.Scene();
  const siblings = Array.from({ length: 1026 }, () => new f.Node(scene));
  const nodes = [0, 1, 2, 3, 7, 511, 1023, 1024, 1025].map(rank => siblings[rank]);
  let branch = siblings[1023];
  for (let depth = 0; depth < 30; depth++) branch = new f.Node(branch);

  const components = [scene, ...nodes, branch, branch].map((node, index) => new f.Skeleton(node, String(index)));
  const native = wrappers(...components.reverse());
  assert.deepEqual(f.inventory(scene, native), f.expected(scene));

  scene.children.reverse();
  branch._components.reverse();
  assert.deepEqual(f.inventory(scene, native), f.expected(scene));
});

test('inventory uses live activation, native owner, component type and scene membership each collection', () => {
  const f = fixture();
  const scene = new f.Scene();
  const otherScene = new f.Scene();
  const branch = new f.Node(scene);
  const normal = new f.Skeleton(new f.Node(branch), 'active renderer');
  const disabled = new f.Skeleton(new f.Node(scene), 'disabled renderer');
  const other = new f.Skeleton(new f.Node(otherScene), 'other scene');
  const detached = new f.Skeleton(new f.Node(), 'detached');
  class Derived extends f.Skeleton {}
  const derived = new Derived(new f.Node(scene), 'derived renderer');
  const retiredNative = normal._nativeSkeleton;
  normal._nativeSkeleton = { _comp: normal };
  disabled.enabled = false;

  const raw = [retiredNative, {}, ...wrappers(detached, derived, other, disabled, normal)];
  assert.deepEqual(f.inventory(scene, raw), [normal, derived]);
  assert.deepEqual(f.inventory(otherScene, raw), [other]);
  assert.deepEqual(f.inventory(scene, raw), f.expected(scene));

  f.Skeleton._sealed = true;
  branch._activeInHierarchy = false;
  assert.deepEqual(f.inventory(scene, raw), []);
  disabled.enabled = true;
  branch._activeInHierarchy = true;
  assert.deepEqual(f.inventory(scene, raw), [normal, disabled]);
  assert.deepEqual(f.inventory(scene, raw), f.expected(scene));
});

test('duplicate bindings and unproved renderer or scene links reject the inventory', () => {
  const f = fixture();
  const scene = new f.Scene();
  const branch = new f.Node(scene);
  const node = new f.Node(branch);
  const renderer = new f.Skeleton(node, 'renderer');
  const raw = wrappers(renderer);

  assert.deepEqual(f.inventory(scene, raw), [renderer]);
  assert.equal(f.inventory(scene, {}), null);
  assert.equal(f.inventory(scene, [null]), null);
  assert.equal(f.inventory(null, raw), null);
  assert.equal(f.inventory(scene, raw.concat(raw)), null);

  node.getComponents = f.Node.prototype.getComponents.bind(node);
  assert.equal(f.inventory(scene, raw), null);
  delete node.getComponents;

  branch.getComponents = f.Node.prototype.getComponents.bind(branch);
  assert.equal(f.inventory(scene, raw), null);
  delete branch.getComponents;

  renderer.isAnimationCached = () => true;
  assert.equal(f.inventory(scene, raw), null);
  delete renderer.isAnimationCached;

  node._components.pop();
  assert.equal(f.inventory(scene, raw), null);
  node._components.push(renderer);

  branch.children.pop();
  assert.equal(f.inventory(scene, raw), null);
  branch.children.push(node);

  Object.defineProperty(node, 'parent', { configurable: true, get() { throw Error('Unexpected ancestry read'); } });
  assert.equal(f.inventory(scene, raw), null);
  delete node.parent;
  assert.deepEqual(f.inventory(scene, raw), [renderer]);
});

function scopeFixture() {
  const f = fixture();
  let scene = new f.Scene();
  const inert = new f.Node(scene);
  const first = new f.Skeleton(new f.Node(scene), 'first');
  const second = new f.Skeleton(new f.Node(scene), 'second');
  const cached = new f.Skeleton(new f.Node(scene), 'cached');
  cached.cached = true;
  const writes = [];
  for (const renderer of [first, second, cached]) {
    const color = { a: .75 };
    renderer._skeleton = { getColor: () => color };
    Object.assign(renderer._nativeSkeleton, {
      getSkeleton: () => renderer._skeleton,
      paused(value) { writes.push([renderer.name, value]); }
    });
  }

  let raw = wrappers(second, first);
  const spine = { _hkdCaptureRealtimeInventory: () => raw };
  const cc = {
    ENGINE_VERSION: '2.4.13', Node: f.Node, Scene: f.Scene,
    sys: { isNative: true, os: 'Windows', OS_WINDOWS: 'Windows' },
    director: { getScene: () => scene },
    isValid: (value, strict) => !!value && !value.destroyed && !(strict && value.toDestroy)
  };
  const Scope = vm.runInNewContext(depthSource + '\nNativeCaptureScope', {
    cc, sp: { Skeleton: f.Skeleton }, spine, exports: {},
    require(id) { assert.equal(id, 'NativeCaptureInventory'); return Inventory; }
  });
  const game = { gameData: {}, _combatEpoch: 1 };
  const view = { nativeCapture: true, main: scene, game };
  game._depthView = view;

  function read() {
    const scope = new Scope(view);
    scope._sceneRepairOwner = view;
    view._nativeCaptureScope = scope;
    writes.length = 0;
    try {
      scope.start();
      const result = Array.from(scope.entries, entry => entry.renderer.name);
      assert.deepEqual(writes, result.map(name => [name, true]));
      return result;
    } finally {
      scope.finish();
      view._nativeCaptureScope = null;
      [first, second, cached].forEach(renderer => assert.equal(renderer._skeleton.getColor().a, .75));
    }
  }

  function replaceScene() {
    const next = new f.Scene();
    while (scene.children.length) {
      const child = scene.children.shift();
      child._parent = next;
      next.children.push(child);
    }
    scene = next;
    view.main = next;
  }

  return { game, inert, first, second, spine, read, replaceScene, setRaw(value) { raw = value; } };
}

test('capture scope compares the resolved stock order and uses a verified native inventory on a later draw', () => {
  const f = scopeFixture();
  assert.deepEqual(f.read(), ['first', 'second']);
  assert(f.inert.activationReads > 0, 'Initial comparison must visit the stock scene');
  const reads = f.inert.activationReads;
  assert.deepEqual(f.read(), ['first', 'second']);
  assert.equal(f.inert.activationReads, reads, 'Verified inventory skips unrelated scene branches');

  f.setRaw(wrappers(f.second, f.second));
  assert.deepEqual(f.read(), ['first', 'second']);
  assert(f.inert.activationReads > reads, 'Invalid inventory falls back to the stock traversal');
});

test('changing scenes invalidates an otherwise verified capture inventory', () => {
  const f = scopeFixture();
  assert.deepEqual(f.read(), ['first', 'second']);
  const reads = f.inert.activationReads;
  f.replaceScene();
  f.setRaw(wrappers(f.second));
  assert.deepEqual(f.read(), ['first', 'second']);
  assert(f.inert.activationReads > reads, 'A new scene compares the actual stock entries again');
});

test('incomplete inventory falls back and needs a new comparison after combat or the native binding changes', () => {
  const f = scopeFixture();
  f.setRaw(wrappers(f.second));
  assert.deepEqual(f.read(), ['first', 'second']);
  const rejectedReads = f.inert.activationReads;
  f.setRaw(wrappers(f.second, f.first));
  assert.deepEqual(f.read(), ['first', 'second']);
  assert(f.inert.activationReads > rejectedReads, 'Rejected inventory leaves this battle on the stock path');

  f.game.gameData = {};
  f.game._combatEpoch++;
  assert.deepEqual(f.read(), ['first', 'second']);
  const nextBattleReads = f.inert.activationReads;
  assert.deepEqual(f.read(), ['first', 'second']);
  assert.equal(f.inert.activationReads, nextBattleReads);

  f.spine._hkdCaptureRealtimeInventory = () => wrappers(f.first);
  assert.deepEqual(f.read(), ['first', 'second']);
  assert(f.inert.activationReads > nextBattleReads, 'Changed binding requires a fresh stock comparison');
});
