'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./backend-ui-harness.cjs');
const root = path.resolve(__dirname, '../..');

function atlas(legacy = false) {
  const h = fixture(), config = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallConfig/GameJsonCfg.json')));
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/localization/catalog.json')));
  if (legacy) for (const row of Object.values(config.BuildEnum)) delete row.InitialChoices;
  const translate = value => typeof value === 'string' ? value.replace(/\[\[loc:(.+?)\]\]/g, (_match, key) => catalog.entries[key]?.en || key) : '';
  h.cc.Sprite = function () {};
  Object.assign(h.modules, {
    KinghtFallConfig: { KinghtFallBundelName: { IconBuild: 'KinghtFallIconBuild' } },
    KinghtFallEnum: { KinghtFallEnumBuildEnum: { CastleCenter: 1, ArrowTower: 2, Barracks: 3, PrivateHouse: 4, Mill: 5, Wall: 6 } },
    KinghtFallDataMgr: { KinghtFallDataMgr: { getInstance: () => ({ getBuildCfgById: id => config.BuildEnum[id] }) } },
    LanguageMgr: { LanguageMgr: { getInstance: () => ({ t: translate, format: (_template, values) => values.join('') }) } }
  });
  function child(parent, name) { const node = new h.cc.Node(name); node.ui = {}; node.parent = parent; return node; }
  h.cc.instantiate = () => {
    const node = new h.cc.Node('Building');
    child(node, 'sprIcon'); child(node, 'labName'); child(node, 'labInfo');
    return node;
  };
  const Type = h.load('KinghtFallUIBuildAtlas').default, ui = new Type(), loads = [];
  ui.node = new h.cc.Node('Atlas'); ui.ndItem = new h.cc.Node('Template');
  ui.ndParent = new h.cc.Node('List'); ui.btnClose = new h.cc.Node('Close'); ui.T = translate;
  ui.loadSpriteFrame = (bundle, file, done) => { loads.push({ bundle, file }); done({ getOriginalSize: () => ({ width: 1000, height: 1200 }) }); };
  ui.start();
  return { ui, loads, names: ui.ndParent.children.map(node => node.getChildByName('labName').ui.string) };
}

test('Buildings details includes Cannon, Sniper, and all four starting squads', () => {
  const result = atlas();
  assert.equal(result.names.length, 11);
  for (const name of ['Cannon Tower · Lv 1', 'Sniper Tower · Lv 1', 'Royal Guard · Lv 1', 'Heavy Infantry · Lv 1', 'Crossbowmen · Lv 1', 'Vanguard · Lv 1']) assert(result.names.includes(name), name);
  assert.deepEqual(result.loads.filter(item => item.bundle === 'resources').map(item => item.file), ['buildings/towers/cannon-1', 'buildings/towers/sniper-1']);
  assert(result.ui.ndParent.children.every(node => node.getChildByName('labInfo').ui.string.length > 0));
});

test('Buildings details preserves the six original entries without initial choice configuration', () => {
  const result = atlas(true);
  assert.equal(result.names.length, 6);
  assert.equal(result.loads.filter(item => item.bundle === 'resources').length, 0);
});
