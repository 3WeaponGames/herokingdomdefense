'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'assets/_script/PreparedBuildingMenus.js');
const authored = require('../../assets/KinghtFallConfig/GameJsonCfg.json');

function fixture(options = {}) {
  let clock = 0, timerId = 0;
  const timers = new Map(), draws = new Set(), nodes = new Set(), events = new Map();
  const log = [], paints = [], textures = [], components = [], assets = [];
  class Widget { constructor() { this.enabled = true; } updateAlignment() { log.push('align'); } }
  class Label { constructor() { this.enabled = true; this.string = 'Prepared text'; this.fontSize = 32; this.lineHeight = 36; } }
  class Sprite {}
  class Node {
    constructor(name) { Object.assign(this, {name, children: [], components: [], _active: true, _renderFlag: 64, opacity: 255, width: 750, height: 1334, scale: 1, x: 0, y: 0}); nodes.add(this); }
    get parent() { return this._parent; }
    set parent(parent) { const was = this.activeInHierarchy; if (this._parent) this._parent.children = this._parent.children.filter(node => node !== this); this._parent = parent; if (parent) parent.children.push(this); this._activation(was); }
    setParent(parent) { this.parent = parent; }
    get active() { return this._active; }
    set active(value) { const was = this.activeInHierarchy; this._active = value; this._activation(was); }
    get activeInHierarchy() { return !this.destroyed && this._active && (this.parent ? this.parent.activeInHierarchy : !!this.sceneRoot); }
    _activation(was) { if (was === this.activeInHierarchy) return; for (const component of this.components) { if (this.activeInHierarchy) { component.enables = (component.enables || 0) + 1; if (!component.started && component.start) { component.started = true; component.start(); } } else component.disables = (component.disables || 0) + 1; } }
    setPosition(x, y) { if (typeof x === 'object') ({x, y} = x); this.x = x; this.y = y; }
    setContentSize(width, height) { this.width = width; this.height = height; }
    setScale(value) { this.scale = value; }
    pauseSystemEvents(recursive) { this.paused = recursive; log.push('pause:' + this.name); }
    resumeSystemEvents(recursive) { assert.equal(recursive, true); this.paused = false; log.push('resume:' + this.name); }
    convertToWorldSpaceAR(point) { return {x: point.x + this.x + (this.parent ? this.parent.x : 0), y: point.y + this.y + (this.parent ? this.parent.y : 0)}; }
    getChildByName(name) { return this.children.find(node => node.name === name); }
    addComponent(Type) { const component = new Type(); component.node = this; this.components.push(component); return component; }
    getComponent(Type) { return this.components.find(component => component instanceof Type); }
    getComponentsInChildren(Type) { return this.components.filter(component => component instanceof Type).concat(this.children.flatMap(node => node.getComponentsInChildren(Type))); }
    destroy() { if (this.destroyed) return; this.destroyed = true; this.children.slice().forEach(node => node.destroy()); for (const component of this.components) { component.destroyed = true; if (component.cancelCall) { component.cancelCall(); log.push('cancel-from-destroy'); } } }
  }
  class BaseUI {}
  class Menu extends BaseUI {
    constructor() { super(); this.isclose = false; this._resourceGeneration = 0; this.initCalls = 0; components.push(this); }
    init(build, callback, cancel, choices) { this.initCalls++; this.build = build; this.callBack = callback; this.cancelCall = cancel; this.choiceIndexes = choices; assert.equal(callback, null); assert.equal(cancel, null); log.push('init'); }
    start() {
      this.starts = (this.starts || 0) + 1;
      this._choicePrepared = true;
      this._choiceRows = this.choiceIndexes.map(index => {
        const row = new Node('Row' + index), icon = new Node('sprIcon'); row.parent = this.node.getChildByName('root'); icon.parent = row;
        const sprite = icon.addComponent(Sprite), asset = {name: 'borrowed-icon', destroys: 0, destroy() { this.destroys++; }}; assets.push(asset);
        if (!options.missingIcon) sprite.spriteFrame = asset;
        return row;
      });
      const labelNode = new Node('Title'); labelNode.parent = this.node.getChildByName('root'); const label = labelNode.addComponent(Label);
      label._localizedFontRequest = options.pendingFont ? 'font' : null;
      this.label = label;
      log.push('start');
    }
  }
  class RenderTexture { constructor() { this.destroys = 0; textures.push(this); } initWithSize(width, height) { this.width = width; this.height = height; } destroy() { this.destroys++; } }
  class Camera {
    render(node) {
      const menu = node.getComponent(BaseUI);
      assert(node.activeInHierarchy, 'Preparation paints an activated real presentation'); assert.equal(node.parent.opacity, 255, 'Paint before hiding the parking host');
      assert(menu._choicePrepared); assert.equal(node.paused, true, 'No warmup touch handlers can run'); assert(this.targetTexture, 'Paint has an owned discard target');
      assert.deepEqual(this.node.convertToWorldSpaceAR({x: 0, y: 0}), node.parent.convertToWorldSpaceAR({x: 0, y: 0}), 'Discard camera is centered on the parked presentation, including Canvas translation');
      assert(this.orthoSize * 2 >= uiRoot.height, 'Discard camera covers the logical viewport height');
      assert(this.orthoSize * 2 * this.targetTexture.width / this.targetTexture.height >= uiRoot.width, 'Discard target aspect also covers the full logical viewport width');
      if (options.consumeSceneFlags) {
        const consume = current => { current._renderFlag &= ~(2 | 4); current.children.forEach(consume); };
        consume(scene);
      }
      if (options.paintError) throw Error('GPU paint fixture failure'); paints.push(menu); log.push('paint');
    }
  }
  Camera.ClearFlags = {COLOR: 1, DEPTH: 2, STENCIL: 4};
  function menuNode() { const node = new Node('Menu'), rootNode = new Node('root'); rootNode.parent = node; rootNode.setScale(.75); node.addComponent(Widget); node.addComponent(Menu); return node; }
  const scene = new Node('Scene'); scene.sceneRoot = true;
  let currentScene = scene;
  const uiRoot = new Node('UI'); uiRoot.parent = scene;
  const language = {currentLan: 'en', catalog: {entries: {}}};
  const manager = {uiRoot, uichace: new Map(), uistatck: new Map(), registered: 0, unregistered: 0,
    registerPreparedUI(uid, provider) { assert.equal(uid, 'choice'); assert.equal(provider.ready, true); assert.equal(paints.length, provider.records.length); this.registered++; this.provider = provider; log.push('register'); return () => { this.unregistered++; if (this.provider === provider) this.provider = null; }; }};
  function addTemplate() { const template = menuNode(); manager.uichace.set('choice', template.getComponent(BaseUI)); return template; }
  addTemplate();
  const cc = {Node, Label, Sprite, Widget, Camera, RenderTexture, Director: {EVENT_AFTER_DRAW: 'draw', EVENT_BEFORE_SCENE_LAUNCH: 'scene'}, RenderFlow: {FLAG_WORLD_TRANSFORM: 2, FLAG_OPACITY: 4}, sys: {isNative: !!options.native}, winSize: {width: 750, height: 1334}, gfx: {RB_FMT_S8: 1},
    isValid: value => !!value && !value.destroyed, color: (r, g, b, a) => ({r, g, b, a}), v2: (x, y) => ({x, y}),
    instantiate: () => menuNode(), director: {EVENT_AFTER_DRAW: 'draw', getScene: () => currentScene, once(event, callback) { assert.equal(event, 'draw'); draws.add(callback); }, on(event, callback) { if (!events.has(event)) events.set(event, new Set()); events.get(event).add(callback); }, off(event, callback) { if (event === 'draw') draws.delete(callback); else events.get(event)?.delete(callback); }}};
  const exports = {}, modules = {LanguageMgr: {LanguageMgr: {getInstance: () => language}}, KinghtFallConfig: {KinghtFallUIID: {UIBuildSel: 'choice'}}, BaseUI: {default: BaseUI}};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {exports, cc, require(name) { assert(modules[name], 'Warmup must not import gameplay/player modules: ' + name); return modules[name]; },
    setTimeout(callback, delay = 0) { const id = ++timerId; timers.set(id, {callback, due: clock + delay}); return id; }, clearTimeout(id) { timers.delete(id); }});
  function flush() { let ready; while ((ready = [...timers].find(([, task]) => task.due <= clock))) { timers.delete(ready[0]); ready[1].callback(); } }
  function frame() { clock += 16; for (const callback of [...draws]) { draws.delete(callback); callback(); } flush(); }
  function finish(maxFrames = 1000) { for (let at = 0; at < maxFrames && (draws.size || timers.size); at++) { frame(); if (!draws.size && [...timers.values()].every(task => task.due > clock)) break; } }
  return {api: exports, manager, language, scene, uiRoot, cc, Menu, Node, BaseUI, components, assets, textures, paints, log, draws, timers, addTemplate, frame, finish, flush,
    advance(ms) { clock += ms; flush(); }, getProvider: () => manager.provider, events,
    launchScene() { const next = new Node('Main'); next.sceneRoot = true; currentScene = next; uiRoot.parent = next; return next; },
    beforeScene() { for (const callback of [...events.get('scene') || []]) callback(); }};
}
function build(recipe) { return {buildCfg: recipe.config, buildInfo: recipe.row ? {cfg: recipe.row} : null, getUpgradeChoices: () => recipe.choices.slice()}; }

test('the shipped catalog has four distinct readonly multi-choice presentations and no single-upgrade menus', () => {
  const h = fixture(), before = JSON.stringify(authored), recipes = h.api.plan(authored);
  assert.deepEqual(Array.from(recipes, recipe => [recipe.config.enumValue, recipe.row ? recipe.row.index : null, Array.from(recipe.choices)]), [[2, null, [1, 4, 7]], [3, null, [11, 14, 17, 20]], [5, 1, [2, 5]], [6, 1, [2, 3]]]);
  assert.equal(JSON.stringify(authored), before);
  recipes[0].choices.push(999);
  assert.equal(JSON.stringify(authored), before, 'Planner does not expose the authored choice arrays');
});

test('plan ignores malformed, duplicate, missing and noninitial starting choices without repairing data', () => {
  const h = fixture(), data = {BuildEnum: {2: {enumValue: 2, InitialChoices: [1, 1, '2', -1, 1.5, 999, 2, 3], levelList: [{index: 1, level: 1}, {index: 2, level: 2}, {index: 3, level: 1}]}}}, before = JSON.stringify(data);
  const recipes = h.api.plan(data);
  assert.equal(recipes.length, 1); assert.deepEqual(Array.from(recipes[0].choices), [1, 3]); assert.equal(JSON.stringify(data), before);
});

test('loading completion waits for stable layout and actual paint of every variant before exposing the provider', () => {
  const h = fixture(), before = JSON.stringify(authored), callbacks = [];
  h.api.prepare(authored, h.manager, (error, pool) => callbacks.push({error, pool}));
  h.api.prepare(authored, h.manager, (error, pool) => callbacks.push({error, pool}));
  assert.equal(callbacks.length, 0); assert.equal(h.manager.registered, 0);
  h.frame(); assert.equal(callbacks.length, 0, 'One frame is not a completed layout/paint barrier');
  h.finish();
  assert.equal(callbacks.length, 2); assert(callbacks.every(row => !row.error)); assert.equal(callbacks[0].pool, callbacks[1].pool);
  const pool = callbacks[0].pool; assert.equal(pool.ready, true); assert.equal(h.paints.length, 4); assert.equal(h.manager.registered, 1);
  assert.equal(h.log.filter(v => v === 'paint').length, 4); assert(h.log.lastIndexOf('paint') < h.log.indexOf('register'));
  assert.equal(pool.host.opacity, 0); assert(pool.host.x > h.uiRoot.width);
  for (const record of pool.records) { const c = record.component; assert(c.node.activeInHierarchy); assert(c.node.paused); assert(c.isclose); assert.equal(c.build, null); assert.equal(c.callBack, null); assert.equal(c.cancelCall, null); }
  assert(h.textures.every(texture => texture.destroys === 1), 'Discard paint target is released before entering the game');
  assert(h.assets.every(asset => asset.destroys === 0)); assert.equal(h.manager.uistatck.size, 0); assert.equal(JSON.stringify(authored), before);
});

test('opening and re-parking a prepared menu preserves live lifecycle, rows and approved root scale', () => {
  const h = fixture(); let pool; h.api.prepare(authored, h.manager, (error, value) => { assert.ifError(error); pool = value; }); h.finish();
  const recipe = h.api.plan(authored)[0], c = pool.take([build(recipe), null, null, recipe.choices]); assert(c);
  const starts = c.starts, enables = c.enables, rows = c._choiceRows, initCalls = c.initCalls;
  const visible = new h.Node('Visible'); visible.parent = h.uiRoot;
  c.node.parent = visible; c.isclose = false; pool.willOpen(c); c.node.getChildByName('root').setScale(.12);
  c.build = {live: true}; c.callBack = () => assert.fail('Parking must not execute a choice'); c.cancelCall = () => assert.fail('Parking must not cancel gameplay');
  c.isclose = true; assert.equal(pool.park(c), true);
  assert.equal(c.starts, starts); assert.equal(c.enables, enables); assert.equal(c.initCalls, initCalls); assert.equal(c._choiceRows, rows);
  assert.equal(c.node.parent, pool.host); assert.equal(c.node.getChildByName('root').scale, .75); assert(c.node.paused); assert(c.node.activeInHierarchy);
  assert.equal(c.build, null); assert.equal(c.callBack, null); assert.equal(c.cancelCall, null);
});

test('a translated Canvas keeps the discard camera centered and covers all menu columns', () => {
  const h = fixture(); h.uiRoot.setPosition(375, 667);
  let pool; h.api.prepare(authored, h.manager, (error, value) => { assert.ifError(error); pool = value; }); h.finish();
  assert(pool.ready); assert.equal(h.paints.length, 4, 'Every menu passes camera-origin and full-width coverage assertions');
});

for (const throws of [false, true]) test('native manual paint restores world and HUD render flags ' + (throws ? 'even when rendering throws' : 'after successful rendering'), () => {
  const h = fixture({native: true, consumeSceneFlags: true, paintError: throws});
  const world = new h.Node('Unselected world'), hud = new h.Node('Unselected HUD');
  world.parent = h.scene; hud.parent = h.uiRoot;
  const recipe = h.api.plan(authored)[0], pool = new h.api.Pool(h.manager, h.language), c = h.components[0];
  c.init(build(recipe), null, null, recipe.choices); c.node.parent = pool.host; c.node.pauseSystemEvents(true);
  const before = [];
  function remember(node) { node._renderFlag |= 2 | 4; before.push(node); node.children.forEach(remember); }
  remember(h.scene);
  if (throws) assert.throws(() => pool.paint(c), /GPU paint/);
  else pool.paint(c);
  assert.equal(pool.camera.targetTexture, null, 'Discard target is always detached before normal rendering resumes');
  for (const node of before) {
    assert.equal(node._renderFlag & (2 | 4), 2 | 4, node.name + ' needs normal-camera transform/opacity update');
    assert.equal(node._renderFlag & 64, 64, 'Unrelated render flags must be preserved');
  }
  assert.equal(world.parent, h.scene); assert.equal(hud.parent, h.uiRoot);
  pool.dispose(); assert(h.assets.every(asset => !asset.destroys));
});

test('browser manual paint does not reflag the scene or unselected HUD', () => {
  const h = fixture(), hud = new h.Node('Unselected HUD'); hud.parent = h.uiRoot;
  const recipe = h.api.plan(authored)[0], pool = new h.api.Pool(h.manager, h.language), c = h.components[0];
  c.init(build(recipe), null, null, recipe.choices); c.node.parent = pool.host; c.node.pauseSystemEvents(true);
  pool.paint(c);
  assert.equal(pool.camera.targetTexture, null);
  function unchanged(node) { assert.equal(node._renderFlag, 64, 'Browser render ownership is unchanged: ' + node.name); node.children.forEach(unchanged); }
  unchanged(h.scene); pool.dispose();
});

for (const invalidation of ['locale', 'catalog', 'viewport', 'root']) test('a changed ' + invalidation + ' rejects and disposes old prepared presentation', () => {
  const h = fixture(); let pool; h.api.prepare(authored, h.manager, (error, value) => { assert.ifError(error); pool = value; }); h.finish();
  if (invalidation === 'locale') h.language.currentLan = 'zh';
  if (invalidation === 'catalog') h.language.catalog = {entries: {}};
  if (invalidation === 'viewport') h.uiRoot.width = 540;
  if (invalidation === 'root') { const replacement = new h.Node('NewUI'); replacement.parent = h.scene; h.manager.uiRoot = replacement; }
  const recipe = h.api.plan(authored)[0]; assert.equal(pool.take([build(recipe), null, null, recipe.choices]), null);
  assert.equal(pool.ready, false); assert(pool.host.destroyed); assert.equal(h.manager.unregistered, 1); assert(h.assets.every(asset => !asset.destroys));
});

test('a changed authored presentation or ad requirement cannot match a cached variant', () => {
  const h = fixture(), data = structuredClone(authored), recipe = h.api.plan(data).find(r => r.config.enumValue === 5), b = build(recipe), before = h.api.signature(b, recipe.choices), row = recipe.config.levelList.find(r => r.index === recipe.choices[0]);
  for (const mutate of [r => r.Name += '-edited', r => r.LevelUpDescribe += '-edited', r => r.Icon += '-edited', r => r.Zoom = .93,
    r => r.Excursion = [123, 456], r => r.Appearance = {...r.Appearance, sprite: 'changed-art'}, r => r.level = 3,
    r => r.MillDefense = {kind: 'bomb'}, r => { r.BuildCost = 50; r.VedioCount = 1; }]) {
    const saved = structuredClone(row); mutate(row); assert.notEqual(h.api.signature(b, recipe.choices), before, 'Signature must cover every actual display/input dependency');
    for (const key of Object.keys(row)) delete row[key]; Object.assign(row, saved);
  }
  row.customUnknownField = {preserved: true}; assert.equal(h.api.signature(b, recipe.choices), before, 'Unknown unrelated authoring fields do not rebuild a presentation');
});

test('paint failure retires partial nodes and resources, reports every waiter and permits a fresh retry', () => {
  const options = {paintError: true}, h = fixture(options), errors = [];
  h.api.prepare(authored, h.manager, error => errors.push(error)); h.api.prepare(authored, h.manager, error => errors.push(error)); h.finish();
  assert.equal(errors.length, 2); assert(errors.every(error => /GPU paint/.test(error.message))); assert.equal(h.manager.registered, 0);
  assert(h.components.every(component => component.node.destroyed)); assert(h.textures.every(texture => texture.destroys === 1)); assert(h.assets.every(asset => !asset.destroys));
  options.paintError = false;
  h.addTemplate();
  let result; h.api.prepare(authored, h.manager, (error, pool) => { assert.ifError(error); result = pool; }); h.finish();
  assert(result.ready, 'The same module and manager can retry after a failed preparation');
  assert.equal(h.paints.length, 4); assert.equal(h.manager.registered, 1);
});

test('a caller exception does not strand other loading waiters or invalidate a completed cache', () => {
  const h = fixture(), seen = [];
  h.api.prepare(authored, h.manager, () => { seen.push('throws'); throw Error('caller failure'); });
  h.api.prepare(authored, h.manager, (error, pool) => { assert.ifError(error); seen.push(pool); });
  assert.throws(() => h.finish(), /caller failure/);
  assert.equal(seen.length, 2); assert.equal(seen[1].ready, true);
  let cached; h.api.prepare(authored, h.manager, (error, pool) => { assert.ifError(error); cached = pool; });
  assert.equal(cached, seen[1]); assert.equal(h.paints.length, 4); assert.equal(h.draws.size, 0); assert.equal(h.timers.size, 0);
});

test('locale changes during the loading barrier retire the partial pool and can be retried', () => {
  const h = fixture(); let error;
  h.api.prepare(authored, h.manager, value => { error = value; });
  h.language.currentLan = 'zh'; h.finish();
  assert.match(error.message, /retired/); assert.equal(h.manager.registered, 0); assert.equal(h.paints.length, 0);
  assert(h.components.every(component => component.node.destroyed)); assert.equal(h.draws.size, 0); assert.equal(h.timers.size, 0);
  h.addTemplate(); let pool;
  h.api.prepare(authored, h.manager, (failure, value) => { assert.ifError(failure); pool = value; }); h.finish();
  assert(pool.ready); assert.equal(pool.locale, 'zh'); assert.equal(h.paints.length, 4);
});

test('an unrendered loading context fails rather than completing before the paint barrier', () => {
  const h = fixture(); let error; h.api.prepare(authored, h.manager, value => { error = value; }); assert.equal(error, undefined);
  h.advance(15001); assert.match(error.message, /did not render/); assert.equal(h.manager.registered, 0); assert(h.components.every(component => component.node.destroyed)); assert.equal(h.draws.size, 0);
});

test('missing icon or pending typeface cannot become a ready menu after stable empty frames', () => {
  for (const flag of ['missingIcon', 'pendingFont']) { const h = fixture({[flag]: true}); let error; h.api.prepare(authored, h.manager, value => { error = value; });
    for (let frame = 0; frame < 190 && !error; frame++) h.frame(); assert(error); assert.match(error.message, /did not become ready/); assert.equal(h.paints.length, 0); assert.equal(h.manager.registered, 0); }
});

test('disposing prepared cache never destroys an open decision or its borrowed icons', () => {
  const h = fixture(); let pool; h.api.prepare(authored, h.manager, (error, value) => { assert.ifError(error); pool = value; }); h.finish();
  const c = pool.records[0].component, visible = new h.Node('Visible'); visible.parent = h.uiRoot; c.node.parent = visible; c.isclose = false; c.cancelCall = () => assert.fail('Only UIMgr may cancel an open decision'); h.manager.uistatck.set('choice', c);
  pool.dispose(); assert(!c.node.destroyed); assert(c.cancelCall); assert.equal(c._preparedUIProvider, null); assert(h.assets.every(asset => !asset.destroys));
});

test('Web scene repaint waits for real post-transition draws and preserves the four live presentations', () => {
  const h = fixture(); let pool; h.api.prepare(authored, h.manager, (error, value) => { assert.ifError(error); pool = value; }); h.finish();
  const records = pool.records.slice(), rows = records.map(r => r.component._choiceRows), starts = records.map(r => r.component.starts);
  const main = h.launchScene(), callbacks = [];
  h.api.repaintScene(error => callbacks.push(error)); h.api.repaintScene(error => callbacks.push(error));
  assert.equal(pool.ready, true, 'Provider stays usable; no duplicate preload can allocate another prefab');
  assert.equal(callbacks.length, 0); h.frame(); assert.equal(callbacks.length, 0);
  h.finish(); assert.deepEqual(callbacks, [null, null]); assert.equal(h.paints.length, 8); assert.equal(h.manager.registered, 1);
  assert.equal(pool.renderedScene, main); assert.equal(pool.host.opacity, 0); assert.equal(h.events.get('scene').size, 0);
  records.forEach((record, index) => { assert.equal(pool.records[index], record); assert.equal(record.component._choiceRows, rows[index]); assert.equal(record.component.starts, starts[index]); assert.equal(record.component.initCalls, 1); assert.equal(record.component.node.opacity, 255); assert(record.component.node.paused); });
  assert(h.textures.every(texture => texture.destroys === 1)); assert(h.assets.every(asset => !asset.destroys));
  h.api.repaintScene(error => { assert.ifError(error); callbacks.push('cached'); }); assert.equal(callbacks.at(-1), 'cached'); assert.equal(h.paints.length, 8);
});

test('Web repaint errors release temporary resources and retry the same rows without rebinding input', () => {
  const options = {}, h = fixture(options); let pool;
  h.api.prepare(authored, h.manager, (error, value) => { assert.ifError(error); pool = value; }); h.finish(); h.launchScene();
  const rows = pool.records.map(record => record.component._choiceRows); options.paintError = true;
  const errors = []; h.api.repaintScene(error => errors.push(error)); h.api.repaintScene(error => errors.push(error)); h.finish();
  assert.equal(errors.length, 2); assert(errors.every(error => /GPU paint/.test(error.message))); assert(pool.ready); assert.equal(pool.host.opacity, 0); assert.equal(h.events.get('scene').size, 0);
  options.paintError = false; let completed = false; h.api.repaintScene(error => { assert.ifError(error); completed = true; }); h.finish();
  assert(completed); assert.equal(h.manager.registered, 1); pool.records.forEach((record, index) => { assert.equal(record.component._choiceRows, rows[index]); assert.equal(record.component.initCalls, 1); assert(record.component.node.paused); });
  assert(h.textures.every(texture => texture.destroys === 1)); assert(h.assets.every(asset => !asset.destroys));
});

test('scene cancellation and retired callers cannot strand a live repaint waiter', () => {
  const h = fixture(); let pool; h.api.prepare(authored, h.manager, (error, value) => { assert.ifError(error); pool = value; }); h.finish(); h.launchScene();
  let current = true, dead = 0, live = 0;
  h.api.repaintScene(() => dead++, () => current); h.api.repaintScene(error => { assert.ifError(error); live++; }); current = false; h.finish();
  assert.equal(dead, 1); assert.equal(live, 1); assert(pool.ready);
  h.launchScene(); let cancelled = 0; h.api.repaintScene(error => { assert.ifError(error); cancelled++; }); h.beforeScene(); h.finish();
  assert.equal(cancelled, 1); assert.equal(pool.host.opacity, 0); assert.equal(h.events.get('scene').size, 0); assert.equal(h.draws.size, 0); assert.equal(h.timers.size, 0);
  let retry = 0; h.api.repaintScene(error => { assert.ifError(error); retry++; }); h.finish(); assert.equal(retry, 1);
});

test('scene repaint fanout drains every caller before rethrowing its first exception', () => {
  const h = fixture(); h.api.prepare(authored, h.manager, assert.ifError); h.finish(); h.launchScene(); let second = 0;
  h.api.repaintScene(() => { throw Error('repaint caller failed'); }); h.api.repaintScene(error => { assert.ifError(error); second++; });
  assert.throws(() => h.finish(), /repaint caller failed/); assert.equal(second, 1); assert.equal(h.events.get('scene').size, 0); assert.equal(h.timers.size, 0);
});

test('native scene readiness remains synchronous and does not repaint prepared menus', () => {
  const h = fixture({native: true}); h.api.prepare(authored, h.manager, assert.ifError); h.finish(); h.launchScene(); let complete = false;
  h.api.repaintScene(error => { assert.ifError(error); complete = true; }); assert(complete); assert.equal(h.paints.length, 4); assert.equal(h.draws.size, 0);
});

function mainLoadingFixture(native = false, prepared = null) {
  const calls = [], recoveries = []; let scene = {};
  const loading = {destroyed: false, destroy() { this.destroyed = true; calls.push('hide'); }};
  function Component() {}
  const cc = {...(prepared ? prepared.cc : {}), Component, sys: {isNative: native}, _decorator: {ccclass: C => C, property: () => () => {}}, isValid: v => !!v && !v.destroyed, director: prepared ? prepared.cc.director : {getScene: () => scene}};
  const modules = {UIMgr: {UIMgr: {getInstance: () => ({getChildByName: () => loading})}},
    PreparedBuildingMenus: prepared ? prepared.api : {repaintScene(done, current) { calls.push('repaint'); recoveries.at(-1).paints.push({done, current}); }},
    ResourceMgr: {ResourceMgr: {getInstance: () => ({loadWithRecovery(_name, operation, complete, _error, current) { const request = {paints: [], retry() { if (!current()) return; operation((error, asset) => { if (!current()) { request.cancelled = true; return; } if (error) request.error = error; else complete(asset); }); }}; recoveries.push(request); request.retry(); }})}}};
  const context = {exports: {}, cc, require: name => modules[name] || {}, __extends(C, B) { Object.setPrototypeOf(C, B); C.prototype = Object.create(B.prototype); C.prototype.constructor = C; }, __decorate: (_items, C) => C};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/Main.js'), 'utf8'), context);
  const owner = new context.exports.default(); owner._startupGeneration = 1;
  return {owner, loading, calls, recoveries, changeScene() { scene = {}; }};
}

test('Main keeps its same existing Loading node until Web scene paint completes, with retry', () => {
  const h = mainLoadingFixture(); h.owner.hideLoading(); assert.deepEqual(h.calls, ['repaint']); assert.equal(h.loading.destroyed, false);
  h.recoveries[0].paints[0].done(Error('paint failure')); assert.equal(h.loading.destroyed, false);
  h.recoveries[0].retry(); assert.equal(h.recoveries[0].paints.length, 2); h.recoveries[0].paints[1].done(null); assert.equal(h.loading.destroyed, true); assert.deepEqual(h.calls, ['repaint', 'repaint', 'hide']);
});

test('Main rejects stale Web completion after owner, generation or scene retirement', () => {
  for (const reason of ['owner', 'generation', 'scene']) { const h = mainLoadingFixture(); h.owner.hideLoading(); if (reason === 'owner') h.owner.destroyed = true; if (reason === 'generation') h.owner._startupGeneration++; if (reason === 'scene') h.changeScene(); h.recoveries[0].paints[0].done(null); assert.equal(h.loading.destroyed, false, reason); }
});

test('Main native Loading removal stays synchronous without requesting a repaint or recovery', () => {
  const h = mainLoadingFixture(true); h.owner.hideLoading(); assert.deepEqual(h.calls, ['hide']); assert.equal(h.recoveries.length, 0);
});


test('BEFORE_SCENE_LAUNCH retirement cancels Main loading removal even while its Scene pointer is unchanged', () => {
  const prepared = fixture(); prepared.api.prepare(authored, prepared.manager, assert.ifError); prepared.finish();
  const main = prepared.launchScene(), h = mainLoadingFixture(false, prepared); h.owner.hideLoading();
  assert.equal(prepared.cc.director.getScene(), main); assert.equal(h.loading.destroyed, false);
  prepared.beforeScene();
  assert.equal(prepared.cc.director.getScene(), main, 'Retirement can precede the director pointer swap');
  assert.equal(h.loading.destroyed, false, 'A retiring scene cannot destroy the shared Loading node');
  assert.equal(h.recoveries[0].cancelled, true); assert.equal(prepared.events.get('scene').size, 0);
  assert.equal(prepared.draws.size, 0); assert.equal(prepared.timers.size, 0); prepared.finish();
  assert.equal(h.loading.destroyed, false);
});
