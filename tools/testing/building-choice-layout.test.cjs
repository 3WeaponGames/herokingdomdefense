'use strict';
// Execute the actual choice panel against inert scene nodes; no editor/game/audio.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./backend-ui-harness.cjs');

function panel(count, width = 750, height = 1334, layered = false, family = count === 4 ? 'barracks' : 'tower', upgrade = false) {
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
    destroy() { this.destroyed=true; if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this); }
  }
  Node.EventType = { TOUCH_END: 'end' };
  class Sprite {} Sprite.SizeMode = { CUSTOM: 0 }; Sprite.Type = { SLICED: 1 };
  class Label {} Label.Overflow = { SHRINK: 2, RESIZE_HEIGHT: 3 }; Label.HorizontalAlign = { LEFT: 0, CENTER: 1 }; Label.VerticalAlign = { TOP: 0, CENTER: 1 };
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
  banner.y = 398.674;
  child(banner, 'labTitle', Label); child(root, 'labTitle', Label).y = 341.291;
  ui.ndParent = child(root, 'ndMain', Layout); ui.ndItem = new Node('Template');
  ui.loadSpriteFrame = (bundle, path, done) => { loaded.push([bundle, path]); done({ getOriginalSize: () => ({ width: 1000, height: 1200 }) }); };
  ui.T = value => value;
  const rows = Array.from({ length: count }, (_, i) => ({ index: (family === 'barracks' ? 11 : 1) + i * 3, level: upgrade ? 2 : 1, Name: 'Unit ' + i, LevelUpDescribe: upgrade ? 'Upgrade: 2 crop fields. Each surviving field earns silver per wave, then fields repair. Choose a field defense.' : 'Hold the frontline', Zoom: .35,
    Icon: 'unit-' + i, BuildSliverCost: upgrade ? 6 : undefined, MillDefense: family === 'mill' ? {kind: i ? 'bomb' : 'scarecrow'} : undefined, Appearance: family === 'tower' ? { sprite: 'buildings/towers/tower-' + i, weapon: layered ? { sprite: 'buildings/towers/weapon-' + i } : undefined } : undefined }));
  const before = JSON.stringify(rows);
  ui.onLoad(); ui.onOpened(); ui.init({ buildInfo: upgrade ? {cfg:{level:1}} : {}, buildCfg: { enumValue: family === 'tower' ? 2 : family === 'mill' ? 5 : 3, levelList: rows } }, value => choices.push(value), () => {}, rows.map(row => row.index));
  ui.start();
  return { ui, h, root, choices, ads, loaded, rows, before };
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
    assert.equal(row.getChildByName('labInfo').getComponent(p.h.cc.Label).horizontalAlign, 1);
    assert.equal(row.children.filter(n => n.name === 'ndVideo' && n.active).length, 0);
  }
  rows[2].events.end(); rows[0].events.end();
  assert.deepEqual(p.choices, [17]); assert.deepEqual(p.ads, []);
});

test('tower starting choices use generated artwork through the resources bundle', () => {
  const p = panel(3);
  assert.deepEqual(p.loaded, [0, 1, 2].map(i => ['resources', 'buildings/towers/tower-' + i]));
  for (const row of p.ui._choiceRows) {
    const icon = row.getChildByName('sprIcon');
    assert.equal(icon.x, 0); assert.equal(icon.y, 65); assert.equal(icon.scale, 156 / 1200);
    const name = row.getChildByName('labName'), info = row.getChildByName('labInfo');
    assert(name.width * name.scale < row.width);
    assert.equal(name.getComponent(p.h.cc.Label).overflow, p.h.cc.Label.Overflow.SHRINK);
    const rich = info.getComponent(p.h.cc.Label);
    assert(info.x + info.width * info.scale / 2 < row.width / 2);
    assert.equal(info.x, 0); assert.equal(rich.fontFamily, 'Arial'); assert.doesNotMatch(rich.string, /<outline|<b>/);
    assert.equal(rich.fontSize, 38); assert.equal(row.height, 280);
  }
  assert.deepEqual(Array.from(p.ui._choiceRows, row => [row.x, row.y]), [[-160, 150], [160, 150], [0, -154]]);
  assert.equal(p.root.getChildByName('wg_jzfz_bt').getChildByName('labTitle').getComponent(p.h.cc.Label).string, '[[loc:ui.building.towers_title]]');
  assert.equal(p.root.getChildByName('labTitle').getComponent(p.h.cc.Label).string, '[[loc:ui.building.choose_tower]]');
});

test('adding a fourth tower uses the exact same cards, artwork bounds and spacing as four squads', () => {
  const tower = panel(4, 750, 1334, false, 'tower'), squad = panel(4);
  function geometry(p) { return Array.from(p.ui._choiceRows, row => ({
    card: [row.x, row.y, row.width, row.height],
    children: ['sprIcon', 'labName', 'labInfo'].map(name => { const n = row.getChildByName(name); return [n.x, n.y, n.width, n.height, n.scale]; }),
    description: row.getChildByName('labInfo').getComponent(p.h.cc.Label).fontSize
  })); }
  assert.deepEqual(geometry(tower), geometry(squad));
  assert.equal(squad.root.getChildByName('labTitle').getComponent(squad.h.cc.Label).string, '[[loc:ui.building.choose_squad]]');
  tower.ui._choiceRows[3].events.end(); assert.deepEqual(tower.choices, [10]); assert.deepEqual(tower.ads, []);
});

test('additional card rows keep the title, choices and cancel button inside a short screen', () => {
  for (const count of [5, 6]) {
    const p = panel(count, 540, 820), height = 904 + 304;
    assert(p.root.scale * height <= 820 - 48);
    assert(p.root.getChildByName('wg_jzfz_bt').y > p.ui._choiceRows[0].y + 140);
    const bottom = p.ui._choiceRows.at(-1).y - 140;
    assert(p.ui._cancelButton.y + p.ui._cancelButton.height / 2 < bottom);
    assert(p.ui._cancelButton.y - p.ui._cancelButton.height / 2 >= -height / 2);
  }
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
  const p = panel(3), rich = p.ui._choiceRows[0].getChildByName('labInfo').getComponent(p.h.cc.Label);
  rich.node.height = 500; p.ui.lateUpdate();
  assert(rich.fontSize < 38); assert(rich.lineHeight < 43);
  rich.string = 'Short description'; rich.node.height = 43; p.ui.lateUpdate();
  assert.equal(rich.fontSize, 38); assert.equal(rich.lineHeight, 43);
});

test('level2 upgrade rows keep portraits, names and long descriptions in separate bounded card areas', () => {
  for (const count of [2,3]) for (const [width,height] of [[750,1334],[540,820]]) {
    const p=panel(count,width,height,false,'mill',true),rows=p.ui._choiceRows;
    assert.equal(p.ui.ndParent.getComponent(p.h.cc.Layout).enabled,false);
    for(let i=0;i<rows.length;i++) {
      const row=rows[i],name=row.getChildByName('labName'),info=row.getChildByName('labInfo'),rich=info.getComponent(p.h.cc.Label),icon=row.getChildByName('sprIcon');
      assert.equal(row.width,620);assert.equal(row.height,250);
      assert.equal(name.anchorX,0);assert.equal(info.anchorX,0);assert.equal(info.anchorY,1);
      assert(icon.x+1000*icon.scale/2<name.x,'portrait cannot overlap either text column');
      assert(name.y-name.height>info.y,'description starts below the title');
      assert(name.x+name.width<row.width/2);assert(info.x+info.width<row.width/2);
      assert.equal(info.scale,1);assert.equal(rich.fontSize,24);assert.doesNotMatch(rich.string,/<outline|<b>/);
      assert(row.children.filter(n=>(n.name==='ndNormal'||n.name==='ndVideo')&&n.y< -20).every(n=>!n.active),'obsolete name plaques remain hidden');
      if(i)assert(row.y+row.height/2<rows[i-1].y-rows[i-1].height/2,'upgrade cards cannot overlap');
      const budget=p.ui._initialChoiceDescriptions.find(r=>r.label===rich);assert(info.y-budget.maxHeight>=-row.height/2+12);
    }
    assert(p.root.scale*(p.ui._upgradeChoiceHeight+340)<=height-48+1e-8);
    assert(p.ui._cancelButton.y+33<rows.at(-1).y-rows.at(-1).height/2);
    assert.equal(JSON.stringify(p.rows),p.before,'opening the panel never edits authored upgrade data');
    p.ui._cancelButton.events.end();assert.equal(p.ui.isclose,true);assert.deepEqual(p.choices,[]);
  }
});

test('mill level2 choices request the actual scarecrow and bomb symbols and still select the authored row', () => {
  const p=panel(2,750,1334,false,'mill',true);
  assert.deepEqual(p.loaded,[['build','mill-choice-scarecrow'],['build','mill-choice-bomb']]);
  p.ui._choiceRows[1].events.end();assert.deepEqual(p.choices,[4]);assert.deepEqual(p.ads,[]);
});

test('upgrade descriptions stay in their own card after long translations and restore their normal font size', () => {
  const p=panel(2,750,1334,false,'mill',true),rich=p.ui._choiceRows[0].getChildByName('labInfo').getComponent(p.h.cc.Label);
  rich.node.height=400;p.ui.lateUpdate();assert(rich.fontSize>=18&&rich.fontSize<24);
  rich.string='Short';rich.node.height=28;p.ui.lateUpdate();assert.equal(rich.fontSize,24);
});


test('plain choice copy never enables RichText and retains one stable localized Label per card',()=>{
 for(const upgrade of [false,true]){const p=panel(3,750,1334,false,upgrade?'mill':'tower',upgrade);for(const row of p.ui._choiceRows){const node=row.getChildByName('labInfo'),rich=node.getComponent(p.h.cc.RichText),label=node.getComponent(p.h.cc.Label);assert.equal(rich.enabled,false);assert.equal(rich.string,undefined,'do not trigger RichText word rasterization');assert.equal(label.string,p.rows[p.ui._choiceRows.indexOf(row)].LevelUpDescribe);assert.equal(label.enableWrapText,true);assert.equal(label.overflow,p.h.cc.Label.Overflow.RESIZE_HEIGHT);assert.equal(label._uiTypography.fontFamily,'Arial');}const labels=p.ui._initialChoiceDescriptions.map(e=>e.label);for(let i=0;i<10;i++)p.ui.lateUpdate();assert.deepEqual(p.ui._initialChoiceDescriptions.map(e=>e.label),labels);assert.equal(JSON.stringify(p.rows),p.before);}
});


test('the template stays hidden and repeated start never duplicates aligned choice rows',()=>{const p=panel(3);assert.equal(p.ui.ndItem.active,false);assert.equal(p.ui._choicePrepared,true);assert.equal(p.ui._choiceRows.length,3);const rows=p.ui._choiceRows.slice();p.ui.start();assert.deepEqual(p.ui._choiceRows,rows);assert.equal(p.ui.ndParent.children.length,3);});


test('reinitializing an open choice panel retires its previous rows without retaining stale actions',()=>{const p=panel(3),old=p.ui._choiceRows.slice(),selected=[];p.ui.init({buildInfo:{},buildCfg:{enumValue:2,levelList:p.rows}},value=>selected.push(value),()=>{},p.rows.map(r=>r.index));assert(old.every(r=>r.destroyed&&!r.active));assert.equal(p.ui.ndParent.children.length,3);p.ui._choiceRows[1].events.end();assert.deepEqual(selected,[4]);assert.deepEqual(p.choices,[]);});


test('a late icon load cannot touch a retired row after choices are refreshed',()=>{const p=panel(3),pending=[];p.ui.loadSpriteFrame=(_bundle,_path,done)=>pending.push(done);const build={buildInfo:{},buildCfg:{enumValue:2,levelList:p.rows}};p.ui.init(build,()=>{},()=>{},p.rows.map(r=>r.index));const retired=p.ui._choiceRows.slice();p.ui.init(build,()=>{},()=>{},p.rows.map(r=>r.index));retired.forEach(row=>{row.getChildByName=()=>{throw Error('released native row');};});assert.doesNotThrow(()=>pending.slice(0,3).forEach(done=>done({})));assert.equal(p.ui._choiceRows.length,3);});


test('popup activation cannot restore legacy typography over the new card layout',()=>{for(const upgrade of [false,true]){const p=panel(3,750,1334,false,upgrade?'mill':'tower',upgrade);for(const row of p.ui._choiceRows){const label=row.getChildByName('labName').getComponent(p.h.cc.Label);assert.equal(label._settingsLayout,true);assert.equal(label._uiTypography.fontRole,upgrade?'body':'display');assert.equal(label._uiTypography.outlineWidth,upgrade?0:2);}const cancel=p.ui._cancelButton.getChildByName('Label').getComponent(p.h.cc.Label);assert.equal(cancel._localizedFontRole,'display');assert.equal(cancel._uiTypography.outlineWidth,2);}});
