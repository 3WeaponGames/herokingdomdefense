'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');

function harness() {
  function Component() {}
  Component.EventHandler = function () {}; Component.EventHandler.emitEvents = () => {};
  const state = { tweens: [] };
  const cc = { Component, Enum: x => x, _decorator: new Proxy({}, { get: () => () => () => {} }),
    Layout: { Type: { HORIZONTAL: 1, VERTICAL: 2, GRID: 3 }, VerticalDirection: { TOP_TO_BOTTOM: 1, BOTTOM_TO_TOP: 2 } },
    isValid: x => !!x && !x.destroyed, Node: { EventType: {} }, warn() {}, error() {}, v2: (x, y) => ({ x, y }),
    tween(node) {
      const tween = { node, callbacks: [], stopped: false, to() { return this; }, by() { return this; },
        call(callback) { this.callbacks.push(callback); return this; }, start() { return this; }, stop() { this.stopped = true; },
        complete() { if (!this.stopped) for (const fn of this.callbacks) fn(); } };
      state.tweens.push(tween); return tween;
    } };
  const modules = {};
  function load(name) {
    const context = { cc, exports: {}, require: name => modules[name] || { default: Component },
      __extends: (ctor, base) => Object.setPrototypeOf(ctor.prototype, base.prototype), __decorate: (_d, target, key) => key === undefined ? target : undefined };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context, { filename: name + '.js' });
    return modules[name] = context.exports;
  }
  const Item = load('ListItem').default, List = load('List').default;
  return { List, Item, state };
}

function scrolling(held, frameByFrameRenderNum = 0) {
  const h = harness(), list = new h.List(), created = [];
  let children = [0, 1, 2].map(id => ({ _listId: id }));
  const content = { get children() { return children; }, get childrenCount() { return children.length; } };
  Object.assign(list, { _virtual: true, _numItems: 10, _actualNumItems: 10, _sizeType: true, _align: 2, _verticalDir: 1,
    _alignCalcType: 3, _colLineNum: 1, _itemSize: { width: 10, height: 10 }, _itemTmp: { x: 0, anchorY: .5 },
    _columnGap: 0, _lineGap: 0, _topGap: 0, _lastDisplayData: [0, 1, 2], _scrollItem: held ? children[0] : null,
    content, frameByFrameRenderNum, _updateCounter: 0, _updateDone: true,
    _pool: { put(node) { children = children.filter(x => x !== node); } },
    _calcViewPos() { this.viewTop = -20; this.viewBottom = -50; }, _calcNearestItem() {},
    _createOrUpdateItem(data) { created.push(data.id); if (!children.some(x => x._listId === data.id)) children.push({ _listId: data.id });
      if (!this._lastDisplayData.includes(data.id)) this._lastDisplayData.push(data.id); } });
  return { list, created, children: () => children.map(x => x._listId) };
}

test('equal-size virtual windows render their incoming row while a dragged outgoing row is retained', () => {
  for (const held of [false, true]) {
    const h = scrolling(held); h.list._onScrolling();
    assert.deepEqual(Array.from(h.list.displayData, x => x.id), [1, 2, 3, 4, 5], 'one extra row is prepared on either side of the viewport');
    assert.ok(h.children().includes(3));
    assert.equal(h.children().includes(0), held, 'the drag-owned row must not be pooled early');
  }
});

test('frame-by-frame virtual rendering fills the new viewport without repeatedly rebuilding an unchanged window', () => {
  const h = scrolling(true, 1); h.list._onScrolling();
  for (let frame = 0; frame < 10 && !h.list._updateDone; frame++) h.list.update();
  assert.equal(h.list._updateDone, true); assert.ok(h.children().includes(3));
  const idle = scrolling(false); idle.list._onScrolling();
  idle.created.length = 0; idle.list._onScrolling();
  assert.deepEqual(idle.created, [], 'stationary viewport has no new rows to render');
});

function deletion(ids) {
  const h = harness(), list = new h.List(), nodes = new Map(), seen = [];
  for (const id of ids) {
    const item = new h.Item();
    const node = { _listId: id, position: { x: 0, y: id * 10 }, scale: 1, width: 20, height: 10,
      getComponent: () => item, removeFromParent() { this.detached = true; nodes.delete(id); }, destroy() { this.destroyed = true; } };
    item.list = list; item.listId = id; item.node = node; nodes.set(id, node);
  }
  Object.assign(list, { _inited: true, _virtual: true, _numItems: Math.max(...ids) + 1, displayData: ids.map(id => ({ id })),
    getItemByListId: id => nodes.get(id), _registerEvent() {}, _init() {}, _calcItemPos: id => ({ id, x: 0, y: id * 10 }) });
  return { ...h, list, nodes, seen };
}

test('reopening during the removal animation completes once with the original data index and cancels node deletion', () => {
  const h = deletion([5]), node = h.nodes.get(5);
  h.list.aniDelItem(5, index => h.seen.push(index), 0);
  assert.equal(h.state.tweens.length, 1);
  node.scale = .7; node.position = { x: 20, y: 60 };
  h.list.onEnable(); h.list.onEnable();
  assert.deepEqual(h.seen, [5]); assert.equal(h.state.tweens[0].stopped, true);
  h.state.tweens[0].complete();
  assert.equal(node.destroyed, undefined); assert.equal(node.scale, 1);
  assert.deepEqual(node.position, { x: 0, y: 50 });
  assert.deepEqual(h.seen, [5]);
});

test('reopening during neighbor shifts cancels owned tweens and ignores late completion callbacks', () => {
  const h = deletion([0, 1, 2]);
  h.list.aniDelItem(0, index => h.seen.push(index), 0);
  h.state.tweens[0].complete();
  assert.equal(h.nodes.has(0), false);
  assert.equal(h.state.tweens.length, 3); assert.deepEqual(h.seen, []);
  h.list.onEnable(); assert.deepEqual(h.seen, [0]);
  assert.ok(h.state.tweens.every(tween => tween.stopped));
  for (const tween of h.state.tweens.slice(1)) for (const callback of tween.callbacks) callback();
  assert.deepEqual(h.seen, [0]);
});

test('normal animated deletion still completes exactly once and permits a new deletion from its callback', () => {
  const h = deletion([0, 1, 2]);
  h.list.aniDelItem(0, index => { h.seen.push(index); h.list.aniDelItem(2, next => h.seen.push(next), 0); }, 0);
  h.state.tweens[0].complete();
  h.state.tweens[2].complete();
  assert.deepEqual(h.seen, [0]); assert.equal(h.list._aniDelRuning, true);
  assert.equal(h.state.tweens[3].stopped, false, 'old completion must not cancel the new operation');
  h.state.tweens[3].complete();
  assert.deepEqual(h.seen, [0, 2]); assert.equal(h.list._aniDelRuning, false);
});

test('single selection retains item identity when deleting before, at, or after it', () => {
  for (const [selected, removed, expected] of [[1, 5, 1], [5, 1, 4], [3, 3, -1], [-1, 2, -1]]) {
    const h = deletion([0, 1, 2, 3, 4, 5, 6]);
    h.list.selectedMode = 1; h.list._selectedId = selected;
    for (const [id, node] of h.nodes) node.getComponent().selected = id === selected;
    h.list.aniDelItem(removed, index => h.seen.push(index), 0);
    h.state.tweens[0].complete();
    assert.equal(h.list.selectedId, expected);
    h.list.onEnable();
    assert.equal(h.list.selectedId, expected, 'reopening while neighbors move must not shift selection twice');
    assert.deepEqual(h.seen, [removed]);
  }
});

test('adaptive reward rows preserve list gaps when long copy grows and a recycled row returns to the template height', () => {
  const h=scrolling(false),list=h.list;let resized=0,refreshed=0;
  list._lineGap=10;list._resizeContent=()=>resized++;list.updateAll=()=>refreshed++;
  const row={_listId:1,width:10,height:30};list._onItemAdaptive(row);
  assert.equal(list._customSize[1],30);assert.equal(list._calcItemPos(2).top,-60);
  for(const height of [30,10,10,24,10]){
    row.height=height;list._onItemAdaptive(row);
    const first=list._calcItemPos(0),middle=list._calcItemPos(1),last=list._calcItemPos(2);
    assert.equal(middle.top-middle.bottom,height);
    assert.equal(first.bottom-middle.top,10);assert.equal(middle.bottom-last.top,10);
  }
  assert.equal(resized,4,'unchanged sizes never trigger extra layout work');assert.equal(refreshed,4);
});
