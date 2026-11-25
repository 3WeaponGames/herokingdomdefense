'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const depthSource = fs.readFileSync(path.join(__dirname, '../../assets/_script/KinghtFallDepthView.js'), 'utf8');

const nativeDirtyWalk = `function _setDirtyForNode(node) {
  var selListeners = this._nodeListenersMap[node._id];
  if (selListeners) for (var j = 0, len = selListeners.length; j < len; j++) {
    var selListener = selListeners[j];
    var listenerID = selListener._getListenerID();
    null == this._dirtyListeners[listenerID] && (this._dirtyListeners[listenerID] = true);
  }
  if (node.childrenCount > 0) {
    var children = node._children;
    for (var i = 0, _len = children.length; i < _len; i++) this._setDirtyForNode(children[i]);
  }
}`;

function fixture(walk = nativeDirtyWalk) {
  const context = vm.createContext({ cc: {}, exports: {} });
  return vm.runInContext(depthSource + `
    (() => {
      var visited = [], events = [], nextId = 0;
      var stock = ${walk};
      var manager = { _setDirtyForNode: stock, _nodeListenersMap: {}, _dirtyListeners: {} };
      class Listener {
        constructor(node, type) { this._node = node; this.type = type; }
        _getSceneGraphPriority() { return this._node; }
        _getListenerID() { return this.type; }
      }
      class Node {
        constructor(parent) {
          this._id = 'Node.' + (++nextId);
          this._parent = parent || null;
          this._children = [];
          this._reorderChildDirty = true;
          if (parent) parent._children.push(this);
        }
        get childrenCount() {
          visited.push(this._id);
          return this._children.length;
        }
        sortAllChildren() {
          if (!this._reorderChildDirty) return;
          this._reorderChildDirty = false;
          events.push('sibling-order');
          if (this.beforeDirty) this.beforeDirty();
          manager._setDirtyForNode(this);
          this._children.reverse();
          events.push('child-reorder');
        }
      }
      Object.assign(cc, {
        ENGINE_VERSION: '2.4.13', _BaseNode: Node, EventListener: Listener,
        internal: { eventManager: manager }
      });
      const main = new Node(), first = new Node(main), second = new Node(main), external = new Node();
      new Node(first);
      function listen(node, type) {
        const item = new Listener(node, type);
        (manager._nodeListenersMap[node._id] || (manager._nodeListenersMap[node._id] = [])).push(item);
        return item;
      }
      return {
        main, first, second, external, cc, stock, manager, visited, events, listen,
        sort: () => sortBattleChildren(main),
        stashRegistryRowAsGetter(node, onRead) {
          var row = manager._nodeListenersMap[node._id];
          Object.defineProperty(manager._nodeListenersMap, node._id, { get() { onRead(); return row; } });
        }
      };
    })()
  `, context);
}

test('battle sorting skips the empty listener walk and keeps normal sort effects', () => {
  const f = fixture();
  f.listen(f.external, 'outside');
  f.manager._dirtyListeners.previous = true;
  f.sort();

  assert.deepEqual(Array.from(f.visited), []);
  assert.deepEqual(Array.from(f.events), ['sibling-order', 'child-reorder']);
  assert.equal(f.main._children[0], f.second);
  assert.deepEqual(Object.keys(f.manager._dirtyListeners), ['previous']);
  assert.equal(f.manager._setDirtyForNode, f.stock);
});

test('the minified Creator native release can skip the same empty listener walk', () => {
  const f = fixture(`function(t) {
    var e = this._nodeListenersMap[t._id];
    if (e) for (var i = 0, n = e.length; i < n; i++) {
      var r = e[i]._getListenerID();
      null == this._dirtyListeners[r] && (this._dirtyListeners[r] = !0);
    }
    if (t.childrenCount > 0) for (var s = t._children, o = 0, a = s.length; o < a; o++) this._setDirtyForNode(s[o]);
  }`);
  f.listen(f.external, 'outside');
  f.sort();
  assert.equal(f.visited.length, 0);
  assert.equal(f.manager._setDirtyForNode, f.stock);
});

test('battle sorting sees listeners registered during sibling-order callbacks', () => {
  const f = fixture();
  f.listen(f.external, 'outside');
  f.main.beforeDirty = () => {
    f.listen(f.main, 'root');
    f.listen(f.first, 'first')._paused = true;
    f.listen(f.second, 'second');
    f.listen(f.second, 'first');
  };
  f.sort();

  assert.deepEqual(Object.keys(f.manager._dirtyListeners), ['root', 'first', 'second']);
  assert.equal(f.visited.length, 4);
  assert.deepEqual(Array.from(f.events), ['sibling-order', 'child-reorder']);
  assert.equal(f.manager._setDirtyForNode, f.stock);
});

test('battle sorting falls back for unknown registry rows without invoking getters', () => {
  const f = fixture();
  let reads = 0;
  f.listen(f.external, 'outside');
  f.stashRegistryRowAsGetter(f.external, () => reads++);
  f.sort();

  assert.equal(reads, 0);
  assert.equal(f.visited.length, 4);
  assert.equal(f.manager._setDirtyForNode, f.stock);
});

test('battle sorting preserves an alternate engine walk and restores the stock walk if sorting throws', () => {
  const alternate = fixture();
  let calls = 0;
  const engineWalk = () => calls++;
  alternate.manager._setDirtyForNode = engineWalk;
  alternate.sort();
  assert.equal(calls, 1);
  assert.equal(alternate.manager._setDirtyForNode, engineWalk);

  const f = fixture();
  const failure = new Error('sort callback failed');
  f.main.beforeDirty = () => { throw failure; };
  assert.throws(f.sort, error => error === failure);
  assert.equal(f.manager._setDirtyForNode, f.stock);
});
