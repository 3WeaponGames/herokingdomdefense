'use strict';
// Actual Creator RenderFlow and Spine/Sprite assemblers, with in-memory scene
// matrices and mesh buffers. No browser, renderer device, game, audio or FPS test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const engine = process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const engineOptions = { skip: !fs.existsSync(engine) && !process.env.COCOS_ENGINE_ROOT ? 'Install Creator 2.4.13 for actual RenderFlow integration' : false };

function fixture() {
  const cc = { ENGINE_VERSION: '2.4.13', sys: { isNative: false }, gfx: {}, js: { addon: Object.assign },
    color: (r, g, b, a = 255) => ({ r, g, b, a, _val: 0xffffffff, _fastSetA(value) { this.a = value; } }) };
  class RenderData {
    init() { this.meshCount = 0; }
    createData(_index, floats, indices) {
      this.vDatas = [new Float32Array(floats)]; this.iDatas = [new Uint16Array(indices)];
      this.uintVDatas = [new Uint32Array(this.vDatas[0].buffer)]; this.meshCount = 1;
    }
    createQuadData(...args) { this.createData(...args); }
  }
  class Assembler { static register(Type, Builder) { Type.__assembler__ = Builder; } }
  const context = vm.createContext({ cc, CC_TEST: true, CC_NATIVERENDERER: false, Assembler, RenderData, dynamicAtlasManager: {} });
  const read = relative => fs.readFileSync(path.join(engine, relative), 'utf8');
  function moduleCode(relative, requireModule) {
    const code = read(relative).replace(/^import .*;\r?$/gm, '').replace('export default class', 'class');
    return vm.runInContext('(function(require,module,exports){' + code + '\n})', context, { filename: relative });
  }
  const flowModule = { exports: {} };
  moduleCode('cocos2d/core/renderer/render-flow.js')(() => { throw Error('unexpected RenderFlow dependency'); }, flowModule, flowModule.exports);
  const flow = flowModule.exports;
  function loadClass(relative, name, requireModule = () => { throw Error('unexpected dependency'); }) {
    const code = read(relative).replace(/^import .*;\r?$/gm, '').replace('export default class', 'class');
    return vm.runInContext('(function(require){' + code + '\nreturn ' + name + ';})', context, { filename: relative })(requireModule);
  }
  context.Assembler2D = loadClass('cocos2d/core/renderer/assembler-2d.js', 'Assembler2D');
  const simple = loadClass('cocos2d/core/renderer/webgl/assemblers/sprite/2d/simple.js', 'SimpleSpriteAssembler');
  const sliced = loadClass('cocos2d/core/renderer/webgl/assemblers/sprite/2d/sliced.js', 'SlicedAssembler');
  const filled = loadClass('cocos2d/core/renderer/webgl/assemblers/sprite/2d/bar-filled.js', 'BarFilledAssembler', () => ({ FillType: { HORIZONTAL: 0, VERTICAL: 1 } }));
  const runtime = require(path.join(engine, 'extensions/spine/lib/spine.js'));
  class Skeleton {}
  const spine = loadClass('extensions/spine/spine-assembler.js', 'SpineAssembler', id => {
    if (id === './Skeleton') return Skeleton;
    if (id === './lib/spine') return runtime;
    if (id.endsWith('render-flow')) return flow;
    if (id.endsWith('vertex-format')) return { vfmtPosUvColor: {}, vfmtPosUvTwoColor: {} };
    throw Error('Unexpected Spine dependency: ' + id);
  });
  const validateBody = read('extensions/spine/Skeleton.js').match(/_validateRender \(\) \{([\s\S]*?)\n    \},/)[1];
  Skeleton.prototype._validateRender = vm.runInContext('(function(){' + validateBody + '})', context);

  function matrix() { return { m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }; }
  class Node {
    constructor(name, parent) {
      this.name = name; this._children = []; this._parent = parent || null;
      this._renderFlag = flow.FLAG_CHILDREN; this._activeInHierarchy = true;
      this._opacity = 255; this._color = cc.color(255, 255, 255); this._cullingMask = 1; this.groupIndex = 0;
      this._trs = [0, 0, 0]; this._scale = 1; this._matrix = matrix(); this._worldMatrix = matrix();
      this.width = 100; this.height = 20; this.anchorX = .5; this.anchorY = .5;
      if (parent) parent._children.push(this);
    }
    move(x, y) { this._trs[0] = x; this._trs[1] = y; this._renderFlag |= flow.FLAG_WORLD_TRANSFORM; }
    scale(value) { this._scale = value; this._renderFlag |= flow.FLAG_TRANSFORM; }
    _updateLocalMatrix() {
      const m = this._matrix.m; m[0] = m[5] = this._scale; m[12] = this._trs[0]; m[13] = this._trs[1];
    }
    _mulMat(out, parent, local) {
      const a = parent.m, b = local.m, m = out.m;
      m[0] = a[0] * b[0]; m[5] = a[5] * b[5]; m[12] = a[0] * b[12] + a[12]; m[13] = a[5] * b[13] + a[13];
    }
    _calculWorldMatrix() {
      this._updateLocalMatrix();
      if (this._parent) this._mulMat(this._worldMatrix, this._parent._worldMatrix, this._matrix);
      else this._worldMatrix.m = this._matrix.m.slice();
    }
  }
  const buffer = { _vData: new Float32Array(32768), _iData: new Uint16Array(32768), vertices: 0, indices: 0,
    request(vertices, indices) {
      const result = { byteOffset: this.vertices * 5 * 4, indiceOffset: this.indices, vertexOffset: this.vertices };
      this.vertices += vertices; this.indices += indices; return result;
    } };
  const batcher = { worldMatDirty: 0, parentOpacityDirty: 0, parentOpacity: 1, _renderScene: {},
    reset() { this.worldMatDirty = this.parentOpacityDirty = 0; this.parentOpacity = 1; buffer.vertices = buffer.indices = 0; },
    terminate() {}, getBuffer() { return buffer; } };
  cc.renderer = { _handle: { _meshBuffer: buffer } };
  flow.init(batcher, { render() {}, renderCamera() {} });
  const scene = new Node('scene');
  function common(node, assembler) {
    const component = { node, _assembler: assembler, isValid: true, enabledInHierarchy: true, _vertsDirty: true,
      _validateRender() {}, _checkBacth() {}, _updateColor() {},
      markForRender() { node._renderFlag |= flow.FLAG_RENDER | flow.FLAG_UPDATE_RENDER_DATA; flow.registerValidate(this); },
      disableRender() { node._renderFlag &= ~(flow.FLAG_RENDER | flow.FLAG_UPDATE_RENDER_DATA | flow.FLAG_POST_RENDER); },
      dirty() { this._vertsDirty = true; this.markForRender(); } };
    node._renderComponent = component; component.markForRender(); return component;
  }
  function sprite(name, parent, kind = 'simple') {
    const node = new Node(name, parent), assembler = new ({ simple, sliced, filled }[kind])();
    const component = common(node, assembler), frame = { uv: new Float32Array(8), uvSliced: Array.from({ length: 16 }, () => ({ u: 0, v: 0 })),
      insetLeft: 5, insetRight: 5, insetTop: 5, insetBottom: 5, _texture: { width: 100, height: 20 }, _rect: { x: 0, y: 0, width: 100, height: 20 } };
    Object.assign(component, { spriteFrame: frame, _spriteFrame: frame, trim: true, _fillStart: 0, _fillRange: 1, _fillType: 0 });
    return component;
  }
  function skeleton(name, parent, ready) {
    const node = new Node(name, parent), component = common(node, new spine());
    Object.setPrototypeOf(component, Skeleton.prototype); delete component._validateRender;
    Object.assign(component, { _super() {}, skeletonData: { isTexturesLoaded: () => true }, _skeleton: ready ? {
      color: new runtime.Color(1, 1, 1, 1), drawOrder: [], bones: [], updateWorldTransform() {} } : null,
      _clipper: new runtime.SkeletonClipping(), _startSlotIndex: -1, _endSlotIndex: -1,
      isAnimationCached: () => false, enableBatch: true, premultipliedAlpha: true, useTint: false,
      attachUtil: { _syncAttachedNode() { component.attachedUpdates = (component.attachedUpdates || 0) + 1; } } });
    node._renderFlag |= flow.FLAG_POST_RENDER;
    return component;
  }
  // Public matrix reads can update world matrices without consuming RenderFlow
  // transform flags. Keeping them current isolates the Sprite vertex cache bug.
  function syncMatrices(node) { node._calculWorldMatrix(); node._children.forEach(syncMatrices); }
  function draw() { syncMatrices(scene); flow.render(scene, 1 / 60); return batcher.worldMatDirty; }
  function extent(component) {
    const vertices = component._assembler._renderData.vDatas[0], xs = [], ys = [];
    for (let i = 0; i < vertices.length; i += 5) { xs.push(vertices[i]); ys.push(vertices[i + 1]); }
    return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) };
  }
  function blankFirst() {
    const blank = skeleton('missing runtime', scene, false);
    scene._children.pop(); scene._children.unshift(blank.node); return blank;
  }
  function install() { return require(path.join(root, 'assets/_script/KinghtFallRenderGuard.js')).install(Skeleton, cc); }
  return { cc, flow, batcher, scene, Node, Skeleton, spine, skeleton, sprite, draw, extent, blankFirst, install };
}

test('Unpatched Creator missing-runtime Spine underflows and leaves moving static Sprite vertices stale', engineOptions, () => {
  const f = fixture(), actor = new f.Node('moving actor', f.scene);
  const black = f.sprite('black HP background', actor), fill = f.sprite('changing HP fill', actor, 'filled');
  assert.equal(f.draw(), 0); const original = f.extent(black);
  const blank = f.blankFirst(); blank._validateRender();
  assert(blank.node._renderFlag & f.flow.FLAG_RENDER, 'actual Skeleton validation rejected the loaded-data/missing-runtime reproduction');
  actor.move(200, 80); fill._fillRange = .5; fill.dirty();
  assert.equal(f.draw(), -1, 'actual fill/post pair did not reproduce the counter underflow');
  assert.deepEqual(f.extent(black), original, 'static background should demonstrate stale world vertices');
  assert.equal(f.extent(fill).left, 150, 'freshly generated fill should use the current actor matrix');
  assert.equal(f.extent(fill).right, 200);
});

test('Guard balances actual Spine flow and moves cached SIMPLE/SLICED Sprites with their parent', engineOptions, () => {
  const f = fixture(), actor = new f.Node('moving actor', f.scene);
  const simple = f.sprite('simple HP background', actor), sliced = f.sprite('sliced HP background', actor, 'sliced');
  f.draw(); f.blankFirst(); f.install(); actor.move(200, 80);
  assert.equal(f.draw(), 0);
  for (const component of [simple, sliced]) assert.deepEqual(f.extent(component), { left: 150, right: 250, bottom: 70, top: 90 });
  actor.move(-50, 10); assert.equal(f.draw(), 0);
  for (const component of [simple, sliced]) assert.equal(f.extent(component).left, -100);
});

test('Guard prevents first-open popup backgrounds remaining collapsed after scale zero to one', engineOptions, () => {
  const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallPrefabs/gamePop/KinghtFallUISuspend.prefab'), 'utf8'));
  const authoredTitle = prefab.find(node => node._name === 'wg_gxhd_pd')._contentSize;
  const authoredPanel = prefab.find(node => node._name === 'root')._contentSize;
  function popup(guard) {
    const f = fixture(), panel = f.sprite('UISuspend root', f.scene, 'sliced');
    const title = f.sprite('wg_gxhd_pd', panel.node);
    Object.assign(panel.node, { width: authoredPanel.width, height: authoredPanel.height });
    Object.assign(title.node, { width: authoredTitle.width, height: authoredTitle.height });
    panel.node.scale(0); f.draw(); assert.equal(f.extent(title).left, f.extent(title).right);
    f.blankFirst(); if (guard) f.install(); panel.node.scale(1); f.draw();
    return [f.extent(title), f.extent(panel)];
  }
  for (const box of popup(false)) assert.equal(box.left, box.right, 'unguarded first-open failure was not reproduced');
  popup(true).forEach((box, index) => {
    const size = index ? authoredPanel : authoredTitle;
    assert.deepEqual(box, { left: -size.width / 2, right: size.width / 2, bottom: -size.height / 2, top: size.height / 2 });
  });
});

test('Authored follow ring tracks its hero and released joystick Sprites return to rest through normal RenderFlow', engineOptions, () => {
  const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'), 'utf8'));
  const authoredRing = prefab.find(node => node._name === 'wg_zd_fw1'), authoredRod = prefab.find(node => node._name === 'ndRod');
  const authoredKnob = prefab.find(node => node._name === 'ndConter'), rest = authoredRod._trs.array;
  assert.equal(prefab[authoredRing._parent.__id__]._name, 'ctrPlay');
  assert((authoredRing._trs ? authoredRing._trs.array.slice(0, 3) : [0, 0, 0]).every(value => value === 0),
    'authored follow ring no longer has its zero local position');
  function released(guard) {
    const f = fixture(), hero = new f.Node('ctrPlay', f.scene), ui = new f.Node('joystick UI', f.scene);
    const ring = f.sprite('wg_zd_fw1', hero), rod = f.sprite('ndRod', ui), knob = f.sprite('ndConter', rod.node);
    for (const [sprite, authored] of [[ring, authoredRing], [rod, authoredRod], [knob, authoredKnob]]) {
      sprite.node.width = authored._contentSize.width; sprite.node.height = authored._contentSize.height;
    }
    // Render the dragged state first, then reproduce an empty Spine before
    // release. Only ordinary Node transform flags drive these Sprite updates.
    rod.node.move(160, -220); knob.node.move(40, 30); f.draw();
    f.blankFirst(); if (guard) f.install();
    hero.move(350, 220); rod.node.move(rest[0], rest[1]); knob.node.move(0, 0);
    const counter = f.draw();
    const center = sprite => { const box = f.extent(sprite); return [(box.left + box.right) / 2, (box.bottom + box.top) / 2]; };
    assert.equal(ring.node._parent, hero); assert.deepEqual(ring.node._trs, [0, 0, 0]);
    return { counter, ring: center(ring), rod: center(rod), knob: center(knob) };
  }
  const broken = released(false);
  assert.equal(broken.counter, -1); assert.deepEqual(broken.ring, [0, 0]); assert.deepEqual(broken.rod, [160, -220]);
  const fixed = released(true);
  assert.equal(fixed.counter, 0); assert.deepEqual(fixed.ring, [350, 220]);
  for (const center of [fixed.rod, fixed.knob]) {
    assert(Math.abs(center[0] - rest[0]) < .0001); assert(Math.abs(center[1] - rest[1]) < .0001);
  }
});

test('Repeated and nested blank/valid Spine scopes stay balanced and preserve valid rendering', engineOptions, () => {
  const f = fixture(); f.install(); const first = f.spine.prototype.fillBuffers; f.install();
  assert.equal(f.spine.prototype.fillBuffers, first, 'guard installed more than once');
  f.blankFirst(); f.blankFirst(); const valid = f.skeleton('valid parent', f.scene, true);
  const blank = f.skeleton('blank nested child', valid.node, false), nested = f.skeleton('valid nested child', blank.node, true);
  const child = f.sprite('nested attachment UI', nested.node, 'sliced');
  valid.node.move(130, 55); assert.equal(f.draw(), 0);
  assert.equal(valid.attachedUpdates, 1); assert.equal(nested.attachedUpdates, 1);
  assert.equal(f.extent(child).left, 80);
  valid.node.move(170, 55); assert.equal(f.draw(), 0); assert.equal(f.extent(child).left, 120);
  assert.equal(valid.attachedUpdates, 2); assert.equal(nested.attachedUpdates, 2);
  const normal = fixture(), normalParent = normal.skeleton('normal valid', normal.scene, true);
  const normalSprite = normal.sprite('normal child', normalParent.node, 'sliced');
  normalParent.node.move(170, 55); assert.equal(normal.draw(), 0);
  assert.deepEqual(f.extent(child), normal.extent(normalSprite), 'guard changed valid Spine descendant geometry');
});

test('Guard counter scope survives runtime creation/removal between fill and post', engineOptions, () => {
  const f = fixture(); f.install(); const blank = f.skeleton('late runtime', f.scene, false);
  f.batcher.worldMatDirty = 4; blank._assembler.fillBuffers(blank, f.batcher);
  assert.equal(f.batcher.worldMatDirty, 5); blank._skeleton = {};
  blank._assembler.postFillBuffers(blank, f.batcher); assert.equal(f.batcher.worldMatDirty, 4);
  const valid = f.skeleton('removed runtime', f.scene, true); valid._assembler.fillBuffers(valid, f.batcher);
  assert.equal(f.batcher.worldMatDirty, 5); valid._skeleton = null;
  valid._assembler.postFillBuffers(valid, f.batcher); assert.equal(f.batcher.worldMatDirty, 4);
});

test('Guard preserves already-balanced assemblers, call arguments, return values and exceptions', () => {
  const guard = require(path.join(root, 'assets/_script/KinghtFallRenderGuard.js'));
  const expected = {}, calls = [];
  class BalancedAssembler {
    fillBuffers(component, renderer, extra) { calls.push([this, component, extra]); renderer.worldMatDirty++; return expected; }
    postFillBuffers(_component, renderer) { renderer.worldMatDirty--; }
  }
  class BalancedSkeleton {}
  BalancedSkeleton.__assembler__ = BalancedAssembler;
  const post = BalancedAssembler.prototype.postFillBuffers;
  assert.equal(guard.install(BalancedSkeleton, { ENGINE_VERSION: '2.4.13', sys: { isNative: false } }), true);
  assert.equal(BalancedAssembler.prototype.postFillBuffers, post, 'guard must not rewrite the paired engine post hook');
  const assembler = new BalancedAssembler(), component = { _skeleton: null }, renderer = { worldMatDirty: 3 };
  assert.equal(assembler.fillBuffers(component, renderer, 'extra argument'), expected);
  assert.equal(renderer.worldMatDirty, 4, 'an already-balanced empty path was incremented twice');
  assert.deepEqual(calls, [[assembler, component, 'extra argument']]);
  assembler.postFillBuffers(component, renderer); assert.equal(renderer.worldMatDirty, 3);

  const failure = new Error('real render failure');
  class ThrowingAssembler { fillBuffers() { throw failure; } postFillBuffers() {} }
  class ThrowingSkeleton {}
  ThrowingSkeleton.__assembler__ = ThrowingAssembler;
  guard.install(ThrowingSkeleton, { ENGINE_VERSION: '2.4.13', sys: { isNative: false } });
  assert.throws(() => new ThrowingAssembler().fillBuffers(component, renderer), error => error === failure);
  assert.equal(renderer.worldMatDirty, 3, 'a failed fill should not invent a completed render scope');
});

test('Guard leaves native, other engine versions and unsupported assembler hooks untouched', () => {
  const guard = require(path.join(root, 'assets/_script/KinghtFallRenderGuard.js'));
  for (const engine of [null, {}, { ENGINE_VERSION: '2.4.12', sys: { isNative: false } },
    { ENGINE_VERSION: '3.8.0', sys: { isNative: false } }, { ENGINE_VERSION: '2.4.13', sys: { isNative: true } }]) {
    class Builder { fillBuffers() {} postFillBuffers() {} }
    class Skeleton {}
    Skeleton.__assembler__ = Builder;
    const original = Builder.prototype.fillBuffers;
    assert.equal(guard.install(Skeleton, engine), false);
    assert.equal(Builder.prototype.fillBuffers, original);
  }
  const engine = { ENGINE_VERSION: '2.4.13', sys: { isNative: false } };
  for (const Skeleton of [undefined, class {}, { __assembler__: {} }, { __assembler__: { prototype: { fillBuffers() {} } } }]) {
    assert.equal(guard.install(Skeleton, engine), false);
  }
});
