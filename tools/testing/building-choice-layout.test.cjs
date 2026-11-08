'use strict';
// Execute the actual choice panel against inert scene nodes; no editor/game/audio.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./backend-ui-harness.cjs');

function panel(count, width = 750, height = 1334, layered = false) {
  const h = fixture(), choices = [], ads = [], loaded = [];
  class Node {
    constructor(name) { Object.assign(this, { name, children: [], components: new Map(), active: true, x: 0, y: 0, scale: 1, width: 620, height: 156, events: {} }); }
    set parent(parent) { this._parent = parent; if (parent) parent.children.push(this); }
    get parent() { return this._parent; }
    setPosition(x, y) { if (typeof x === 'object') ({ x, y } = x); this.x = x; this.y = y; }
    setScale(value) { this.scale = value; this.scaleX = this.scaleY = value; }
    setContentSize(width, height) { this.width = width; this.height = height; }
    getContentSize() { return { width: this.width, height: this.height }; }
    getChildByName(name) { return this.children.find(child => child.name === name); }
    getComponent(Type) { return this.components.get(Type); }
    addComponent(Type) { const value = new Type(); value.node = this; this.components.set(Type, value); if (Type === Label) this.setContentSize(0, 0); return value; }
    on(type, fn, owner) { this.events[type] = fn.bind(owner); }
  }
  Node.EventType = { TOUCH_END: 'end' };
  class Sprite {} Sprite.SizeMode = { CUSTOM: 0 }; Sprite.Type = { SLICED: 1 };
  class Label {} Label.Overflow = { SHRINK: 2 }; Label.HorizontalAlign = Label.VerticalAlign = { CENTER: 1 };
  class RichText {} class Layout {} class Graphics { roundRect() {} fill() {} stroke() {} }
  Object.assign(h.cc, { Node, Sprite, Label, RichText, Layout, Graphics });
  const single = value => ({ getInstance: () => value });
  Object.assign(h.modules, {
    SdkMgr: { AdType: {}, SdkMgr: single({ playVideo() { ads.push(true); } }) },
    KinghtFallConfig: { KinghtFallBundelName: { IconBuild: 'build' } },
    KinghtFallEnum: { KinghtFallEnumBuildEnum: { Barracks: 3, ArrowTower: 2 } },
    LanguageMgr: { LanguageMgr: single({ t: key => key, format: (_key, values) => values.join('') }) },
    PlayerMgr: {}, GameTrackDataEvent: {}, KinghtFallPlayerMgr: {}
  });
  function child(parent, name, Type) { const value = new Node(name); value.parent = parent; if (Type) value.addComponent(Type); return value; }
  h.cc.instantiate = () => {
    const row = new Node('Choice'); row.addComponent(Sprite);
    child(row, 'ndNormal', Sprite); child(row, 'ndVideo', Sprite);
    child(row, 'sprIcon', Sprite);
    child(row, 'ndNormal', Sprite).y = -53; child(row, 'ndVideo', Sprite).y = -53;
    child(row, 'labName', Label); child(row, 'labInfo', RichText);
    return row;
  };
  const UI = h.load('KinghtFallUIBuildSel').default, ui = new UI();
  ui.node = new Node('Panel'); ui.node.setContentSize(width, height);
  const root = child(ui.node, 'root'), banner = child(root, 'wg_jzfz_bt');
  child(banner, 'labTitle', Label); child(root, 'labTitle', Label);
  ui.ndParent = child(root, 'ndMain', Layout); ui.ndItem = new Node('Template');
  ui.loadSpriteFrame = (bundle, path, done) => { loaded.push([bundle, path]); done({ getOriginalSize: () => ({ width: 1000, height: 1200 }) }); };
  ui.T = value => value;
  const rows = Array.from({ length: count }, (_, i) => ({ level: 1, Name: 'Unit ' + i, LevelUpDescribe: 'Hold the frontline', Zoom: .35,
    Icon: 'unit-' + i, Appearance: count === 3 ? { sprite: 'buildings/towers/tower-' + i, weapon: layered ? { sprite: 'buildings/towers/weapon-' + i } : undefined } : undefined }));
  ui.onOpened(); ui.init({ buildInfo: {}, buildCfg: { enumValue: count === 4 ? 3 : 2, levelList: rows } }, value => choices.push(value), () => {}, rows.map((_, i) => i + 1));
  ui.start();
  return { ui, h, root, choices, ads, loaded };
}

test('four starting squads render as separate, readable cards and select once without requiring ads', () => {
  const p = panel(4);
  assert.equal(p.ui.ndParent.getComponent(p.h.cc.Layout).enabled, false);
  const rows = p.ui._choiceRows;
  assert.deepEqual(Array.from(rows, row => [row.x, row.y]), [[-160, 150], [160, 150], [-160, -154], [160, -154]]);
  for (const row of rows) {
    assert(row.x - row.width / 2 >= -310 && row.x + row.width / 2 <= 310);
    assert(row.y - row.height / 2 > -320 && row.y + row.height / 2 < 320);
    const name = row.getChildByName('labName');
    assert(name.width * name.scale < row.width);
    assert.equal(name.getComponent(p.h.cc.Label).enableWrapText, true);
    assert.equal(row.getChildByName('labInfo').getComponent(p.h.cc.RichText).horizontalAlign, 1);
    assert.equal(row.children.filter(n => n.name === 'ndVideo' && n.active).length, 0);
  }
  rows[2].events.end(); rows[0].events.end();
  assert.deepEqual(p.choices, [3]); assert.deepEqual(p.ads, []);
});

test('tower starting choices use generated artwork through the resources bundle', () => {
  const p = panel(3);
  assert.deepEqual(p.loaded, [0, 1, 2].map(i => ['resources', 'buildings/towers/tower-' + i]));
  for (const row of p.ui._choiceRows) {
    const icon = row.getChildByName('sprIcon');
    assert.equal(icon.x, -202); assert.equal(icon.y, 36); assert.equal(icon.scale, 128 / 1200);
    const name = row.getChildByName('labName'), info = row.getChildByName('labInfo');
    assert(name.width * name.scale <= 212);
    assert.equal(name.getComponent(p.h.cc.Label).overflow, p.h.cc.Label.Overflow.SHRINK);
    const rich = info.getComponent(p.h.cc.RichText);
    assert(info.x + rich.maxWidth * info.scale / 2 < row.width / 2);
    assert(info.x - rich.maxWidth * info.scale / 2 > name.x + 212 / 2);
    assert.equal(rich.fontSize, 46); assert.equal(row.height, 180);
  }
  assert.deepEqual(Array.from(p.ui._choiceRows, row => row.y), [212, 0, -212]);
});

test('layered tower choices retain the complete tower icon instead of displaying only an empty base', () => {
  const p = panel(3, 750, 1334, true);
  assert.deepEqual(p.loaded, [0, 1, 2].map(i => ['build', 'unit-' + i]));
});

test('initial chooser fits short screens and provides a reachable cancellation control', () => {
  const p = panel(4, 540, 820);
  assert(p.root.scale * 904 <= 820 - 48);
  assert(p.root.scale * 680 <= 540 - 40 + 1e-8);
  assert(p.ui._cancelButton.y - p.ui._cancelButton.height / 2 >= -452);
  assert.equal(p.ui._cancelButton.getChildByName('Label').width, 236, 'The active Label receives bounds after its default NONE overflow reset');
  p.ui._cancelButton.events.end(); assert.equal(p.ui.isclose, true);
  assert.deepEqual(p.choices, []);
});

test('long localized initial descriptions shrink within their card and reset for a shorter translation', () => {
  const p = panel(3), rich = p.ui._choiceRows[0].getChildByName('labInfo').getComponent(p.h.cc.RichText);
  rich.node.height = 500; p.ui.lateUpdate();
  assert(rich.fontSize < 46); assert(rich.lineHeight < 52);
  rich.string = 'Short description'; rich.node.height = 52; p.ui.lateUpdate();
  assert.equal(rich.fontSize, 46); assert.equal(rich.lineHeight, 52);
});
