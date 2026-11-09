'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const gear = read('assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomePersonCtrl.prefab');
const home = read('assets/KinghtFallPrefabs/home/KinghtFallUIHome.prefab');

// Execute the real controller against the authored hierarchy and Widget
// constraints. The inert transform model covers scale/translation without
// launching a game, rendering, or touching any account data.
class Node {
  constructor(row) {
    this.name = row._name; this.children = []; this.handlers = new Map(); this.components = [];
    const transform = row._trs && row._trs.array || [0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
    this.x = transform[0]; this.y = transform[1]; this.scaleX = transform[7]; this.scaleY = transform[8];
    this.width = row._contentSize && row._contentSize.width || 0; this.height = row._contentSize && row._contentSize.height || 0;
    this.anchorX = row._anchorPoint ? row._anchorPoint.x : .5; this.anchorY = row._anchorPoint ? row._anchorPoint.y : .5;
  }
  getChildByName(name) { return this.children.find(node => node.name === name); }
  getComponent(Type) { return this.components.find(component => component instanceof Type); }
  on(type, fn, target) { const rows = this.handlers.get(type) || []; rows.push({ fn, target }); this.handlers.set(type, rows); }
  off(type, fn, target) { this.handlers.set(type, (this.handlers.get(type) || []).filter(row => row.fn !== fn || row.target !== target)); }
  emit(type) { for (const row of (this.handlers.get(type) || []).slice()) row.fn.call(row.target); }
  convertToWorldSpaceAR(point) {
    const transformed = { x: this.x + point.x * this.scaleX, y: this.y + point.y * this.scaleY };
    return this.parent ? this.parent.convertToWorldSpaceAR(transformed) : transformed;
  }
  convertToNodeSpaceAR(point) {
    const transformed = this.parent ? this.parent.convertToNodeSpaceAR(point) : point;
    return { x: (transformed.x - this.x) / this.scaleX, y: (transformed.y - this.y) / this.scaleY };
  }
}
Node.EventType = { SIZE_CHANGED: 'size', POSITION_CHANGED: 'position' };
class Widget {
  constructor(row, node) { this.node = node; this.top = row._top || 0; this.bottom = row._bottom || 0; this.flags = row._alignFlags; this.target = null; }
  updateAlignment() {
    const node = this.node, parent = node.parent; if (!parent) return;
    const previous = [node.width, node.height, node.x, node.y];
    if ((this.flags & 40) === 40) { node.width = parent.width; node.x = parent.width * (.5 - parent.anchorX); }
    if ((this.flags & 5) === 5) node.height = Math.max(0, parent.height - this.top - this.bottom);
    if (this.flags & 1) node.y = parent.height * (1 - parent.anchorY) - this.top - node.height * (1 - node.anchorY);
    else if (this.flags & 4) node.y = -parent.height * parent.anchorY + this.bottom + node.height * node.anchorY;
    if (previous[0] !== node.width || previous[1] !== node.height) node.emit('size');
    if (previous[2] !== node.x || previous[3] !== node.y) node.emit('position');
  }
}
class Mask {}
function tree(prefab, id = 1, parent) {
  const row = prefab[id], node = new Node(row); node.parent = parent;
  for (const ref of row._components || []) {
    const component = prefab[ref.__id__];
    if (component.__type__ === 'cc.Widget') node.components.push(new Widget(component, node));
    if (component.__type__ === 'cc.Mask') node.components.push(new Mask());
  }
  node.children = (row._children || []).map(ref => tree(prefab, ref.__id__, node)); return node;
}
function align(node) { const widget = node.getComponent(Widget); if (widget) widget.updateAlignment(); node.children.forEach(align); }
function bounds(node) {
  const low = node.convertToWorldSpaceAR({ x: -node.width * node.anchorX, y: -node.height * node.anchorY });
  const high = node.convertToWorldSpaceAR({ x: node.width * (1 - node.anchorX), y: node.height * (1 - node.anchorY) });
  return { left: Math.min(low.x, high.x), right: Math.max(low.x, high.x), bottom: Math.min(low.y, high.y), top: Math.max(low.y, high.y) };
}
function fixture(width, height, safeBottom = 0, scale = 1) {
  const lobby = tree(home); lobby.width = width; lobby.height = height; lobby.x = width / 2; lobby.y = height / 2; lobby.scaleX = lobby.scaleY = scale;
  const footer = lobby.getChildByName('ndBottom'); footer.getComponent(Widget).bottom = safeBottom;
  const page = tree(gear, 1, lobby.getChildByName('ndMain')); page.parent.children.push(page); align(lobby);
  const scroll = page.getChildByName('ScrollView'), viewport = scroll.getChildByName('view'), content = viewport.getChildByName('content');
  function Base() {} Base.prototype.onDestroy = function () { this.baseDestroyed = true; };
  const context = { exports: {}, require: name => name === 'BaseCtrl' ? { default: Base } : name === 'HeroWeaponPicker' ? { close() {} } : {},
    cc: { _decorator: { ccclass: value => value, property: () => () => {} }, Node, Widget, Label: function () {}, Sprite: function () {}, ScrollView: function () {}, v2: (x, y) => ({ x, y }) },
    sp: { Skeleton: function () {} }, __extends(C, B) { C.prototype = Object.create(B.prototype); C.prototype.constructor = C; }, __decorate: (_decorators, value) => value };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/KinghtFallHomePersonCtrl.js'), 'utf8'), context);
  const scheduled = [];
  const controller = new context.exports.default(); controller.node = page; controller.scrView = { node: scroll, content };
  controller.scheduleOnce = callback => { if (!scheduled.includes(callback)) scheduled.push(callback); };
  controller.unschedule = callback => { const index = scheduled.indexOf(callback); if (index >= 0) scheduled.splice(index, 1); };
  controller.bindScrollFooter(); controller.layoutScrollToFooter(); align(content);
  return { controller, lobby, page, footer, scroll, viewport, content, scheduled,
    flush() { const work = scheduled.splice(0); for (const callback of work) callback.call(controller); } };
}
function close(a, b) { assert(Math.abs(a - b) < 1e-7, a + ' must meet ' + b); }

test('Gear prefab removes only the twenty-unit strip while retaining the existing scroll top and navigation dimensions', () => {
  const scroll = gear.find(row => row.__type__ === 'cc.Node' && row._name === 'ScrollView');
  const widget = scroll._components.map(ref => gear[ref.__id__]).find(row => row.__type__ === 'cc.Widget');
  const footer = home.find(row => row.__type__ === 'cc.Node' && row._name === 'ndBottom');
  assert.equal(widget._top, 650); assert.equal(widget._bottom, footer._contentSize.height); assert.equal(footer._contentSize.height, 120);
  const f = fixture(750, 1334); assert.equal(f.scroll.height, 564); assert.equal(f.viewport.height, 564);
  close(bounds(f.viewport).bottom, bounds(f.footer).top); assert(f.viewport.getComponent(Mask));
});

test('phone, tablet and safe-area Gear viewports end exactly at the actual footer and keep the last Upgrade fully reachable', () => {
  for (const [width, height, inset, scale] of [[750, 1334, 0, 1], [750, 1624, 34, 1], [1000, 1334, 24, 1], [750, 1000, 0, 1], [750, 1334, 40, 1.5]]) {
    const f = fixture(width, height, inset, scale), viewport = bounds(f.viewport), footer = bounds(f.footer);
    close(viewport.bottom, footer.top);
    close(bounds(f.scroll).top, bounds(f.page).top - 650 * scale);
    assert(viewport.top > viewport.bottom); assert(f.viewport.getComponent(Mask));
    const navPoint = { x: (footer.left + footer.right) / 2, y: footer.top - scale };
    assert(navPoint.y < viewport.bottom, 'the mask excludes navigation touches from scroll children');
    const maxOffset = Math.max(0, f.content.height - f.viewport.height); f.content.y += maxOffset;
    const button = f.content.children.at(-1).getChildByName('btnUpgeade'), end = bounds(button);
    assert(end.bottom >= viewport.bottom, 'last Upgrade clears the footer at maximum scroll');
    assert(end.top <= viewport.top, 'last Upgrade remains fully within the viewport');
    assert(end.left >= viewport.left && end.right <= viewport.right);
  }
});

test('cached Gear reacts to footer position/size and page resize without moving rows, stats or footer controls', () => {
  const f = fixture(750, 1334), rows = JSON.stringify(f.content.children.map(node => [node.x, node.y, node.width, node.height]));
  const profile = f.page.getChildByName('ndPersonInfo'), originalProfile = [profile.x, profile.y];
  const footerPosition = [f.footer.x, f.footer.y];
  f.controller.layoutScrollToFooter(); assert.deepEqual([f.footer.x, f.footer.y], footerPosition); assert.deepEqual([profile.x, profile.y], originalProfile);
  f.footer.y += 37; f.footer.emit('position'); close(bounds(f.viewport).bottom, bounds(f.footer).top);
  f.footer.height += 24; f.footer.emit('size'); close(bounds(f.viewport).bottom, bounds(f.footer).top);
  f.page.height += 100; f.page.emit('size'); close(bounds(f.viewport).bottom, bounds(f.footer).top);
  assert.equal(JSON.stringify(f.content.children.map(node => [node.x, node.y, node.width, node.height])), rows);
  f.controller.onDestroy(); assert.equal(f.controller.baseDestroyed, true);
  assert.equal(f.page.handlers.get('size').length, 0); assert.equal(f.footer.handlers.get('size').length, 0); assert.equal(f.footer.handlers.get('position').length, 0);
  assert.equal(f.scheduled.length, 0);
});

test('native first-frame zero-size ancestors are not measured and a post-Widget pass restores the real footer boundary', () => {
  const f = fixture(750, 1334), widget = f.scroll.getComponent(Widget); f.flush();
  const originalConversion = f.page.convertToNodeSpaceAR;
  let stale = true;
  f.page.convertToNodeSpaceAR = function (point) {
    const value = originalConversion.call(this, point);
    return stale ? { x: value.x, y: value.y - 667 } : value;
  };
  f.page.height = 0; f.controller.layoutScrollToFooter();
  assert.equal(widget.bottom, 120, 'zero-size targets cannot publish a negative navigation margin');
  assert.equal(f.scheduled.length, 1);
  f.page.height = 1334;
  // Native startup may finish parent alignment without another size callback.
  stale = false; f.flush();
  assert.equal(widget.bottom, 120); assert.equal(f.scroll.height, 564); close(bounds(f.viewport).bottom, bounds(f.footer).top);
  assert.equal(f.scheduled.length, 0, 'the final alignment pass never schedules a perpetual loop');

  stale = true; f.controller.layoutScrollToFooter();
  assert.equal(widget.bottom, -547, 'reproduce the observed stale native transform despite a nonzero target');
  f.controller.layoutScrollToFooter(); assert.equal(f.scheduled.length, 1, 'multiple notifications share one deferred pass');
  stale = false; f.flush();
  assert.equal(widget.bottom, 120); assert.equal(f.scroll.height, 564); close(bounds(f.viewport).bottom, bounds(f.footer).top);
  assert.equal(f.scheduled.length, 0);
});
