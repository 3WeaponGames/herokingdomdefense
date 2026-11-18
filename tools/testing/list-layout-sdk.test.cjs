'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = process.env.HKD_TEST_PROJECT_ROOT || path.resolve(__dirname, '../..');
const engine = process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const layoutFile = path.join(engine, 'cocos2d/core/components/CCLayout.js');
const sdkOptions = { skip: !fs.existsSync(layoutFile) ? 'Install Creator 2.4.13 or set COCOS_ENGINE_ROOT for the stock Layout comparison' : false };

function harness() {
  function Component() {}
  Component.EventHandler = function () {};
  const cc = {
    Component, Enum: value => value, size: (width, height) => ({ width, height }), v2: (x, y) => ({ x, y }),
    _decorator: new Proxy({}, { get: () => () => () => {} }),
    Class(definition) {
      function Type() {}
      for (const [key, value] of Object.entries(definition)) if (typeof value === 'function') Type.prototype[key] = value;
      Object.assign(Type, definition.statics || {});
      return Type;
    }
  };
  const sdk = { exports: {} };
  // Run the installed module itself, including its real enum values and all
  // layout methods. Geometry receivers below do not start an engine or scene.
  vm.runInNewContext(fs.readFileSync(layoutFile, 'utf8'), {
    cc, module: sdk, CC_EDITOR: false, CC_DEV: false,
    require: name => name === '../CCNode' ? { EventType: {} } : Component
  }, { filename: layoutFile });
  const modules = {};
  for (const name of ['ListItem', 'List']) {
    const exports = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), {
      cc, exports, require: name => modules[name],
      __extends: (Type, Base) => Object.setPrototypeOf(Type.prototype, Base.prototype),
      __decorate: (_decorators, Type, key) => key === undefined ? Type : undefined
    }, { filename: name + '.js' });
    modules[name] = exports;
  }
  return { Layout: sdk.exports, List: modules.List.default };
}

function node(width, height, anchorX = .5, anchorY = .5) {
  return {
    width, height, anchorX, anchorY, x: 0, y: 0, scaleX: 1, scaleY: 1, activeInHierarchy: true,
    children: [], _contentSize: { width, height },
    getAnchorPoint() { return { x: this.anchorX, y: this.anchorY }; },
    getContentSize() { return { width: this.width, height: this.height }; },
    setPosition(point) { this.x = point.x; this.y = point.y; }
  };
}

function gridCases(axisName) {
  const { Layout, List } = harness();
  const axis = Layout.AxisDirection[axisName], horizontalAxis = axisName === 'HORIZONTAL';
  for (const horizontal of Object.values(Layout.HorizontalDirection)) {
    for (const vertical of Object.values(Layout.VerticalDirection)) {
      for (const contentAnchor of [.15, .5, .8]) {
        for (const itemAnchor of [.2, .5, .85]) {
          const rightToLeft = horizontal === Layout.HorizontalDirection.RIGHT_TO_LEFT;
          const bottomToTop = vertical === Layout.VerticalDirection.BOTTOM_TO_TOP;
          const content = node(380, 340, horizontalAxis ? contentAnchor : rightToLeft ? 1 : 0, horizontalAxis ? bottomToTop ? 0 : 1 : contentAnchor);
          content.children = Array.from({ length: 7 }, () => node(90, 54, horizontalAxis ? itemAnchor : .5, horizontalAxis ? .5 : itemAnchor));
          const stock = Object.assign(Object.create(Layout.prototype), {
            node: content, type: Layout.Type.GRID, resizeMode: Layout.ResizeMode.NONE, _resize: Layout.ResizeMode.NONE,
            startAxis: axis, horizontalDirection: horizontal, verticalDirection: vertical,
            paddingLeft: 13, paddingRight: 47, paddingTop: 19, paddingBottom: 53,
            spacingX: 11, spacingY: 7, cellSize: { width: 90, height: 54 }, _getUsedScaleValue: () => 1
          });
          stock._doLayoutGrid();
          const list = Object.assign(new List(), {
            content, _align: Layout.Type.GRID, _startAxis: axis, _horizontalDir: horizontal, _verticalDir: vertical,
            _leftGap: 13, _rightGap: 47, _topGap: 19, _bottomGap: 53, _columnGap: 11, _lineGap: 7,
            _itemSize: { width: 90, height: 54 }, _itemTmp: content.children[0]
          });
          list._updateGridSize();
          const label = JSON.stringify({ axisName, horizontal, vertical, contentAnchor, itemAnchor });
          content.children.forEach((item, index) => {
            const actual = list._calcItemPos(index);
            assert.ok(Math.abs(actual.x - item.x) < 1e-8, label + ' item ' + index + ' x: ' + actual.x + ' != ' + item.x);
            assert.ok(Math.abs(actual.y - item.y) < 1e-8, label + ' item ' + index + ' y: ' + actual.y + ' != ' + item.y);
          });
        }
      }
    }
  }
}

test('virtual horizontal-start GRID matches stock Layout in both directions with unequal padding and varied cross-axis anchors', sdkOptions, () => gridCases('HORIZONTAL'));
test('virtual vertical-start GRID matches stock Layout in both directions with unequal padding and varied cross-axis anchors', sdkOptions, () => gridCases('VERTICAL'));

test('all four current reward List prefabs retain their authored vertical positions, including Passport negative top padding', sdkOptions, () => {
  const { Layout, List } = harness();
  for (const name of ['Achievement', 'OnlineReward', 'Passport', 'Quests']) {
    const rows = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallPrefabs/homePop/KinghtFallUI' + name + '.prefab'), 'utf8'));
    const serialized = rows.find(row => row.__type__ === '1896anh1MNKtpXpHYMe5dn5');
    const owner = rows[serialized.node.__id__], scroll = owner._components.map(ref => rows[ref.__id__]).find(row => row.__type__ === 'cc.ScrollView');
    const savedContent = rows[scroll.content.__id__], savedLayout = savedContent._components.map(ref => rows[ref.__id__]).find(row => row.__type__ === 'cc.Layout');
    const savedItem = rows[serialized.tmpNode.__id__], dimensions = savedItem._contentSize;
    assert.equal(savedLayout._N$layoutType, Layout.Type.VERTICAL);
    const anchor = savedContent._anchorPoint || { x: .5, y: .5 }, itemAnchor = savedItem._anchorPoint || { x: .5, y: .5 };
    const content = node(savedContent._contentSize.width, 2000, anchor.x, anchor.y);
    content.children = Array.from({ length: 7 }, () => node(dimensions.width, dimensions.height, itemAnchor.x, itemAnchor.y));
    const top = savedLayout._N$paddingTop || 0, bottom = savedLayout._N$paddingBottom || 0, gap = savedLayout._N$spacingY || 0;
    const direction = savedLayout._N$verticalDirection === undefined ? Layout.VerticalDirection.TOP_TO_BOTTOM : savedLayout._N$verticalDirection;
    const stock = Object.assign(Object.create(Layout.prototype), {
      node: content, type: Layout.Type.VERTICAL, resizeMode: Layout.ResizeMode.NONE, _resize: Layout.ResizeMode.NONE,
      verticalDirection: direction, horizontalDirection: Layout.HorizontalDirection.LEFT_TO_RIGHT,
      paddingTop: top, paddingBottom: bottom, paddingLeft: 0, paddingRight: 0, spacingY: gap,
      cellSize: dimensions, _getUsedScaleValue: () => 1
    });
    stock._doLayoutVertically(content.height, false, child => child.x, true);
    const list = Object.assign(new List(), {
      content, _align: Layout.Type.VERTICAL, _verticalDir: direction, _topGap: top, _bottomGap: bottom, _lineGap: gap,
      _itemSize: dimensions, _itemTmp: content.children[0]
    });
    content.children.forEach((item, index) => {
      const actual = list._calcItemPos(index);
      assert.equal(actual.x, item.x, name + ' x');
      assert.equal(actual.y, item.y, name + ' item ' + index + ' y');
    });
  }
});
