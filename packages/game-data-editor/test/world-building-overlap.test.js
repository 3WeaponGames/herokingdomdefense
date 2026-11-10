'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../worlds/model');
const P = require('../worlds/prefab');
const L = require('../worlds/legacy');
const Maps = require('../lib/map-assets');
const Budget = require('../worlds/budget');
const temporary = require('./owned-temp');
const root = path.resolve(__dirname, '../../..');
function mapFixture() {
  const map = M.createMap('Map01', 'Overlap fixture', 'forest');
  map.layers[0].objects.push({ id: 'tree', name: 'Tree', assetId: 'tree', depth: 'ground', x: 10, y: 20, scale: 1, angle: 0, ground: { x: 3, y: 4 } });
  return map;
}
function terrain(data, owner) { return (data[owner]._components || []).map(ref => data[ref.__id__]).filter(c => c.__type__ === L.script(root, 'MapTerrainLayer')); }
const bake = { ground: [], assets: { tree: { frames: [{ name: 'tree-frame', frameUuid: 'tree-frame', width: 20, height: 30, x: 0, y: 0 }] } } };

test('building overlap is optional and validates explicit choices without changing old map data', () => {
  const map = mapFixture(), tree = map.layers[0].objects[0], before = JSON.stringify(map);
  assert(M.isGroundObject(map.layers[0], tree)); assert.deepEqual(M.validateMap(map, { tree: {} }), []);
  assert.equal(JSON.stringify(map), before); assert.equal(Object.hasOwn(tree, 'buildingOverlap'), false);
  tree.buildingOverlap = 'front'; assert.equal(M.isGroundObject(map.layers[0], tree), false); assert.deepEqual(M.validateMap(map, { tree: {} }), []);
  tree.buildingOverlap = 'behind'; assert(M.isGroundObject(map.layers[0], tree));
  tree.buildingOverlap = 'invalid'; assert(M.validateMap(map, { tree: {} }).some(issue => /behind or in front/.test(issue)));
});

test('foreground overrides ground depth in the export and texture budget while leaving physics and placement intact', () => {
  const map = mapFixture(); map.layers[0].objects[0].buildingOverlap = 'front';
  const before = JSON.stringify(map), data = P.skeleton('Overlap', map); P.addEnvironment(root, data, map, bake);
  const info = Maps.model(data), owner = info.owners.find(node => node.name === 'Tree');
  assert(owner, 'the foreground image must be an object rather than disappearing into the ground');
  const component = terrain(data, owner.id)[0]; assert.equal(component.frontOfBuildings, true);
  assert.equal(data[component.ground.__id__]._trs.array[0], 3); assert.equal(data[component.ground.__id__]._trs.array[1], 4);
  assert.equal(owner.position.x, 10); assert.equal(owner.position.y, 20);
  const budget = Budget.estimate(map, { tree: { width: 20, height: 30, anchor: { x: .5, y: 0 } } }, {});
  assert.equal(budget.groundObjects, 0); assert.equal(budget.atlasPages, 1);
  assert.equal(JSON.stringify(map), before, 'export cannot change authored depth or normalize the saved override');
});

test('legacy round trips recover the override and explicit behind reuses the existing component', () => {
  const map = mapFixture(); map.layers[0].objects[0].buildingOverlap = 'front';
  const data = P.skeleton('Overlap', map); P.addEnvironment(root, data, map, bake);
  const folder = temporary('hkd-building-overlap-'); fs.mkdirSync(path.join(folder, 'assets/KinghtFallIconMap'), { recursive: true }); fs.mkdirSync(path.join(folder, 'assets/_script'));
  for (const name of ['KinghtFallCommerce', 'KinghtFallBuildObstacle', 'MapTerrainLayer']) fs.copyFileSync(path.join(root, 'assets/_script', name + '.js.meta'), path.join(folder, 'assets/_script', name + '.js.meta'));
  const file = path.join(folder, 'assets/KinghtFallIconMap/Map01.prefab'); fs.writeFileSync(file, JSON.stringify(data));
  const bytes = fs.readFileSync(file), adapted = L.adaptMap(folder, 'Map01'), entry = adapted.layers.flatMap(layer => layer.objects).find(object => object.name === 'Tree');
  assert.equal(entry.buildingOverlap, 'front'); assert.deepEqual(fs.readFileSync(file), bytes, 'opening a legacy map remains read-only');
  entry.buildingOverlap = 'behind';
  const copied = P.skeleton('Overlap copy', adapted); P.addEnvironment(root, copied, adapted, bake);
  const owner = Maps.model(copied).owners.find(node => node.name === 'Tree'), components = terrain(copied, owner.id);
  assert.equal(components.length, 1, 'the copied MapTerrainLayer component must not be duplicated'); assert.equal(components[0].frontOfBuildings, false);
  assert.equal(copied[components[0].ground.__id__]._trs.array[0], 3, 'existing ground references remain valid after copying');
});
