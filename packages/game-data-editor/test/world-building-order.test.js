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
const previewRecords = source.slice(source.indexOf(' function gateRecord('), source.indexOf(' function cancelBuildingPlacement('));

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
    artworkRecords: building => [records[building.id]], buildingRuntime: () => null, buildingAvailable: () => true,
    buildingRenderer: renderer, ctx: { save() {}, restore() {} },
    Paint: { object(_ctx, object) { calls.push({ name: object.id, scenery: true }); }, apply() {}, matrix: () => [], sprites(_ctx, sprites) { calls.push({ name: sprites[0].frame, y: stage.specials.find(s => s.sprites === sprites).y }); } }
  };
  vm.createContext(context); vm.runInContext(previewSelection + composition, context); objects.forEach(object=>object.index=0);context.drawStageArtwork({layers:[{id:'objects'}]}, objects);
  const index = name => calls.findIndex(call => call.name === name);
  assert(index('tower-step') > index('rear-tree') && index('gate-shadow') > index('rear-tree'), 'all building parts join the same building layer');
  for (const name of ['tower', 'gate-front', 'gate-rear', 'offer']) assert(index(name) > index('foreground-rock'), name + ' was hidden by foreground scenery');
  assert(index('rear-tree') < index('foreground-rock'), 'scenery retains its own back-to-front order');
  assert(index('tower') < index('offer') && index('offer') < index('gate-rear') && index('gate-front') < index('gate-rear'), 'building sections and offers retain their authored ground order');
  assert(index('foreground-override') < index('rear-tree'), 'Ground Y wins over a former foreground override within the same layer');
  assert.equal(index('disabled'), -1);
  assert.equal(JSON.stringify({ stage, records, objects }), before, 'drawing cannot edit map or stage drafts');
  renderer.destroy();
});

test('level 4 and the per-barracks preview render all four models or a single choice in place', () => {
  const hall={id:1,kind:1,x:0,y:100},tower={id:2,kind:2,x:0,y:0},barracks={id:3,kind:3,x:100,y:-100};
  const stage={buildings:[hall,tower,barracks],specials:[]},record=name=>({
    origin:{x:0,y:0},
    sprites:[{frame:name+' pad',matrix:[1,0,0,1,0,0],ground:true},{frame:name,matrix:[1,0,0,1,0,0],ground:false}],
  });
  const levels=name=>Object.fromEntries([1,2,3,4].map(level=>[level,record(name+' '+level)]));
  const types=['Guard','Shield','Crossbow','Stables'];
  const preview={buildings:{
    1:{levels:levels('Hall')},2:{levels:levels('Tower')},
    3:{levels:levels('Guard'),barracksTypes:types.map((label,i)=>({id:label,label,...(i?{levels:levels(label)}:{})}))},
  }};
  const calls=[],controls=[],alpha=[],ctx={globalAlpha:1,save(){alpha.push(this.globalAlpha);},restore(){this.globalAlpha=alpha.pop();}};
  const renderer=Buildings.create(),state={tab:'Buildings',previewHall:3,previewBuildingLevel:4,selection:[],barracksPreviews:new Map(),openGatePreviews:new Set()};
  const before=JSON.stringify({stage,preview});
  renderer.draw=(ctx,part)=>calls.push([part.sprite.frame,part.building.x,part.building.y,ctx.globalAlpha]);
  const context={
    BuildingLayers:require('../worlds/building-layers'),stageMode:true,state,
    placementStage:()=>stage,placementSnapshot:()=>({buildingPreview:preview}),
    buildingAvailable:()=>true,buildingRuntime:()=>null,buildingRenderer:renderer,ctx,
    right:{},field(parent,name,value,change,choices){controls.push({name,value,change,choices});return {};},
    render(){},
  };
  vm.createContext(context);vm.runInContext(previewRecords+previewSelection+composition,context);
  const draw=()=>{calls.length=0;context.drawStageArtwork({layers:[]},[]);};
  try{
    draw();
    assert(calls.some(([name])=>name==='Hall 3')&&calls.some(([name])=>name==='Tower 4'));
    assert.deepEqual(calls.filter(([,x])=>x===100),[
      ['Guard 4 pad',100,-100,1],['Guard 4',100,-100,1],['Shield 4',100,-100,.5],
      ['Crossbow 4',100,-100,.5],['Stables 4',100,-100,.5],
    ]);
    context.barracksPreviewControl(barracks);
    assert.equal(controls[0].name,'Barracks preview');assert.equal(controls[0].value,'all');
    assert.deepEqual(Array.from(controls[0].choices,choice=>choice.label),['All types',...types]);
    controls[0].change('Crossbow');draw();
    assert.deepEqual(calls.filter(([,x])=>x===100),[['Crossbow 4 pad',100,-100,1],['Crossbow 4',100,-100,1]]);
    controls[0].change('all');draw();
    assert.equal(calls.filter(([,x])=>x===100).length,5);
    assert.equal(JSON.stringify({stage,preview}),before);
  }finally{renderer.destroy();}
});
