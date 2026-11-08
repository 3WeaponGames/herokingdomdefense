'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const source = fs.readFileSync(path.join(root, 'assets/_script/KinghtFallItemHp.js'), 'utf8');
const army = { None: 0, Friend: 1, Enemy: 2 };

function fixture(width = 48) {
  const context = {
    exports: {},
    require: name => name === 'KinghtFallModle' ? { KinghtFallGameArmy: army } : {},
    cc: {
      Component: function () {}, Label: function () {}, Sprite: function () {},
      _decorator: { ccclass: value => value, property: () => () => {} }
    },
    sp: { Skeleton: function () {} },
    __extends(C, B) { C.prototype = Object.create(B.prototype); C.prototype.constructor = C; },
    __decorate: (_decorators, value, key) => key === undefined ? value : undefined
  };
  vm.runInNewContext(source, context, { filename: 'KinghtFallItemHp.js' });
  const hp = new context.exports.default();
  hp.node = { width, height: 10, x: 17, y: 31, scaleX: 2.25, scaleY: .75, active: false };
  const fill = range => ({ fillRange: range, node: { width: width - 4, height: 6, anchorX: .5, x: 0, active: false } });
  hp.sprPro1 = fill(.8);
  hp.sprPro2 = fill(.5);
  hp.labPro = { node: { active: true }, string: '' };
  hp.spAni = { node: { active: true }, setCompleteListener(callback) { this.complete = callback; } };
  return hp;
}

test('legacy health bars keep their filled-sprite geometry when GUI Pro styling is not opted in', () => {
  const hp = fixture(170), fill = hp.sprPro1;
  assert.equal(hp.guiProStyle, false);
  hp.setFillProgress(fill, .25);
  assert.equal(fill.fillRange, .25);
  assert.equal(fill.node.width, 166);
  assert.equal(fill.node.height, 6);
  assert.equal(fill.node.anchorX, .5);
  assert.equal(fill.node.x, 0);
  assert.equal(hp.node.active, false);
});

test('GUI Pro fill grows from its left inset without changing the bar dimensions, scale or position', () => {
  for (const width of [48, 64]) {
    const hp = fixture(width), fill = hp.sprPro1;
    hp.guiProStyle = true;
    const before = JSON.stringify(hp.node);
    for (const progress of [0, .25, .5, .9, 1]) {
      hp.setFillProgress(fill, progress);
      assert.equal(fill.fillRange, progress);
      assert.equal(fill.node.anchorX, 0);
      assert.equal(fill.node.x, -width / 2 + 2);
      assert.equal(fill.node.width, (width - 4) * progress);
      assert.equal(fill.node.height, 6);
      assert.equal(JSON.stringify(hp.node), before);
    }
  }
});

test('HP and normalized progress updates both use the shared fill updater', () => {
  const hp = fixture(), calls = [];
  hp.setType(army.Friend);
  hp.setFillProgress = (sprite, progress) => calls.push({ sprite, progress });
  hp.setHp(25, 100);
  hp.setProgress(.7);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].sprite, hp.sprPro1);
  assert.equal(calls[0].progress, .25);
  assert.equal(calls[1].sprite, hp.sprPro1);
  assert.equal(calls[1].progress, .7);
  assert.equal(hp.labPro.string, '25.00/100.00');
});

test('team selection and load-time fill initialization never reveal a hidden whole health bar', () => {
  const hp = fixture();
  hp.guiProStyle = true;
  hp.onLoad();
  assert.equal(hp.node.active, false);
  assert.equal(hp.labPro.node.active, false);
  assert.equal(hp.spAni.node.active, false);
  assert.equal(hp.sprPro1.node.width, 44 * .8);
  assert.equal(hp.sprPro2.node.width, 44 * .5);
  for (const type of [army.Friend, army.Enemy, army.None, army.Friend]) {
    hp.setType(type, { node: {} });
    assert.equal(hp.node.active, false);
  }
  assert.equal(hp.sprPro, hp.sprPro1);
  assert.equal(hp.sprPro1.node.active, true);
  assert.equal(hp.sprPro2.node.active, false);
});

test('partial health uses the correct team fill while death and full health hide the complete frame', () => {
  const hp = fixture();
  hp.guiProStyle = true;
  hp.setType(army.Friend);
  hp.setHp(25, 100);
  assert.equal(hp.node.active, true);
  assert.equal(hp.sprPro1.node.width, 11);
  hp.setHp(0, 100);
  assert.equal(hp.node.active, false);
  hp.setType(army.Enemy);
  hp.onLoad();
  assert.equal(hp.node.active, false, 'pool/load setup revealed the old empty frame');
  hp.setHp(38, 100);
  assert.equal(hp.node.active, true);
  assert.equal(hp.sprPro, hp.sprPro2);
  assert.equal(hp.sprPro2.node.width, 44 * .38);
  hp.setHp(100, 100);
  assert.equal(hp.node.active, false);
  hp.setProgress(.5);
  assert.equal(hp.node.active, true);
  assert.equal(hp.sprPro2.node.width, 22);
  for (const progress of [0, 1]) {
    hp.setProgress(progress);
    assert.equal(hp.node.active, false);
  }
});

function bar(file) {
  const data = read(file), component = data.find(row => row.__type__ && row.__type__.startsWith('02b8b'));
  assert(component, file + ' contains the health-bar component');
  const node = data[component.node.__id__];
  const frame = data[node._components.find(ref => data[ref.__id__].__type__ === 'cc.Sprite').__id__];
  return { data, component, node, frame };
}

function kitFrame(name) {
  const file = 'assets/resources/gui-pro/health/' + name + '.png';
  assert(fs.statSync(path.join(root, file)).size > 0, file + ' exists');
  const meta = read(file + '.meta'), entries = Object.values(meta.subMetas);
  assert.equal(entries.length, 1);
  const frame = entries[0];
  assert.equal(frame.rawTextureUuid, meta.uuid);
  assert.equal(frame.importer, 'sprite-frame');
  assert(frame.width > 0 && frame.height > 0);
  assert(frame.borderLeft > 0 && frame.borderRight > 0, 'rounded kit caps must be preserved');
  // Unity accepts zero-size slice centers; Creator needs a real UV strip to
  // stretch between the caps rather than rendering disconnected end pieces.
  assert(frame.borderLeft + frame.borderRight < frame.width);
  assert(frame.borderTop + frame.borderBottom < frame.height);
  assert(frame.borderTop >= 0 && frame.borderBottom >= 0);
  return frame.uuid;
}

test('hero, ally and enemy prefabs reference blue, green and red GUI Pro fills at their original sizes', () => {
  const ids = { frame: kitFrame('frame'), blue: kitFrame('fill-blue'), green: kitFrame('fill-green'), red: kitFrame('fill-red') };
  assert.equal(new Set(Object.values(ids)).size, 4, 'each imported frame needs its own UUID');
  const unit = bar('assets/KinghtFallEnemy/ItemHp.prefab');
  const hero = bar('assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab');
  for (const [entry, width, colors] of [[unit, 48, ['green', 'red']], [hero, 64, ['blue']]]) {
    assert.equal(entry.component.guiProStyle, true);
    assert.equal(entry.node._contentSize.width, width);
    assert.equal(entry.node._contentSize.height, 10);
    assert.equal(entry.frame._spriteFrame.__uuid__, ids.frame);
    assert.equal(entry.frame._type, 1);
    colors.forEach((color, index) => {
      const sprite = entry.data[entry.component['sprPro' + (index + 1)].__id__], node = entry.data[sprite.node.__id__];
      assert.equal(sprite._spriteFrame.__uuid__, ids[color]);
      assert.equal(sprite._type, 1);
      assert.equal(sprite._sizeMode, 0);
      assert.equal(node._contentSize.width, width - 4);
      assert.equal(node._contentSize.height, 6);
      assert.equal(node._anchorPoint.x, 0);
      assert.equal(node._trs.array[0], -width / 2 + 2);
    });
  }
});

test('building health bars retain their legacy art, filled sprites and original dimensions', () => {
  const building = bar('assets/KinghtFallIconMap/ItemHp.prefab');
  assert.notEqual(building.component.guiProStyle, true);
  assert.equal(building.node._contentSize.width, 170);
  assert.equal(building.node._contentSize.height, 20);
  assert.equal(building.frame._spriteFrame.__uuid__, '300bfce7-f552-43ce-bbe4-9c8dda99bb84');
  for (const key of ['sprPro1', 'sprPro2']) {
    const sprite = building.data[building.component[key].__id__], node = building.data[sprite.node.__id__];
    assert.equal(sprite._type, 3);
    assert.equal(sprite._spriteFrame.__uuid__, '305b9953-7aa9-4ccb-ae94-8ef57c6fcb38');
    assert.equal(node._contentSize.width, 164);
    assert.equal(node._contentSize.height, 14);
  }
});
