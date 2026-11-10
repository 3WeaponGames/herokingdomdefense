'use strict';
// Run the shipped editor composition with real building-part transforms. The
// draw adapters record the actual paint order; no editor IPC or save exists.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Buildings = require('../worlds/building-renderer');
const source = fs.readFileSync(path.resolve(__dirname, '../worlds/client.js'), 'utf8');
const composition = source.slice(source.indexOf(' function drawStageArtwork('), source.indexOf(' function drawGateFacing('));
const previewSelection = source.slice(source.indexOf(' function previewBuildings('), source.indexOf(' function visibleBuildings('));

for (const stageMode of [true, false]) test((stageMode ? 'stage editor' : 'map stage showcase') + ' paints every building above scenery without changing authored data', () => {
  const stage = { buildings: [{ id: 1, x: 0, y: 120, scale: 1, angle: 0 }, { id: 2, x: 0, y: -120, scale: 1, angle: 0 }], specials: [{ id: 'offer', y: -60, sprites: [{ frame: 'offer' }] }, { id: 'disabled', y: -2000, enabled: false, sprites: [{ frame: 'disabled' }] }] };
  const sprite = (frame, y, ground) => ({ frame, matrix: [1, 0, 0, 1, 0, y], ground });
  const records = { 1: { origin: { x: 0, y: 0 }, sprites: [sprite('tower-step', 0, true), sprite('tower', 0, false)] }, 2: { origin: { x: 0, y: 0 }, sprites: [sprite('gate-shadow', 0, true), sprite('gate-front', -5, false), sprite('gate-rear', 5, false)] } };
  const objects = [{ y: 1000, o: { id: 'rear-tree' }, layer: {} }, { y: -1000, o: { id: 'foreground-rock' }, layer: {} }, { y: 10000, o: { id: 'foreground-override', buildingOverlap: 'front' }, layer: {} }];
  objects.forEach(object=>object.index=0);const before = JSON.stringify({ stage, records, objects }), calls = [], renderer = Buildings.create();
  renderer.draw = (_ctx, part) => calls.push({ name: part.sprite.frame, ground: part.ground, y: part.y });
  const context = {
    BuildingLayers:require('../worlds/building-layers'),stageMode, state: { snap: { buildingPreview: {} }, images: {}, tab: 'Buildings', selection: [], previewHall: 3 },
    values: () => stage, placementStage: () => stage,
    stageRecord: building => records[building.id], buildingRuntime: () => null,
    buildingRenderer: renderer, ctx: { save() {}, restore() {} },
    Paint: { object(_ctx, object) { calls.push({ name: object.id, scenery: true }); }, apply() {}, matrix: () => [], sprites(_ctx, sprites) { calls.push({ name: sprites[0].frame, y: stage.specials.find(s => s.sprites === sprites).y }); } }
  };
  vm.createContext(context); vm.runInContext(previewSelection + composition, context); objects.forEach(object=>object.index=0);context.drawStageArtwork({layers:[{id:'objects'}]}, objects);
  const index = name => calls.findIndex(call => call.name === name);
  assert(index('tower-step') > index('rear-tree') && index('gate-shadow') > index('rear-tree'), 'all building parts join the same building layer');
  for (const name of ['tower', 'gate-front', 'gate-rear', 'offer']) assert(index(name) > index('foreground-rock'), name + ' was hidden by foreground scenery');
  assert(index('rear-tree') < index('foreground-rock'), 'scenery retains its own back-to-front order');
  assert(index('tower') < index('offer') && index('offer') < index('gate-rear') && index('gate-front') < index('gate-rear'), 'building sections and offers retain their authored ground order');
  assert(index('foreground-override') < index('gate-front'), 'Default covers every object layer, including former foreground overrides');
  assert.equal(index('disabled'), -1);
  assert.equal(JSON.stringify({ stage, records, objects }), before, 'drawing cannot edit map or stage drafts');
  renderer.destroy();
});
