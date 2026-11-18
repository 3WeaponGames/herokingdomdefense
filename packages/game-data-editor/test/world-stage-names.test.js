'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Names=require('../worlds/stage-names'),M=require('../worlds/model');
const clone=value=>JSON.parse(JSON.stringify(value));
function stage(){return {spawns:[1,2,3].map(id=>({id,name:'Spawn '+id})),graphs:[{id:'a',legacy:true,name:'Path1_2_3',spawnIds:[3,1,2],future:{keep:true}},{id:'b',legacy:true,name:'Path1_2_3',spawnIds:[1,2,3],weight:3},{id:'custom',legacy:true,name:'Secret detour',spawnIds:[2]}],buildings:[],specials:[],hero:{x:0,y:0},nextSpawn:4};}

test('legacy route names become their spawn-based card names without changing route identifiers or custom names',()=>{
 const source=stage(),before=clone(source),draft=clone(source);Names.refreshPaths(draft);
 assert.deepEqual(draft.graphs.map(graph=>graph.name),['Spawns 1–3 · Route 1','Spawns 1–3 · Route 2','Secret detour']);
 assert(draft.graphs.slice(0,2).every(graph=>graph.nameFromSpawns===true));
 assert.deepEqual(draft.graphs.map(graph=>graph.id),['a','b','custom']);
 assert.deepEqual(draft.graphs[0].spawnIds,[3,1,2]);assert.deepEqual(draft.graphs[0].future,{keep:true});assert.equal(draft.graphs[1].weight,3);
 assert.deepEqual(source,before);const once=clone(draft);Names.refreshPaths(draft);assert.deepEqual(draft,once);
});

test('generated route names follow named spawn points and membership while explicit custom names stay authored',()=>{
 const draft=stage();Names.refreshPaths(draft);draft.spawns[0].name='North gate';Names.refreshPaths(draft);
 assert.equal(draft.graphs[0].name,'North gate, Spawn 2, Spawn 3 · Route 1');
 draft.graphs[0].spawnIds=[1];Names.refreshPaths(draft);assert.equal(draft.graphs[0].name,'North gate · Route 1');
 draft.graphs[0].name='Keep my flank';draft.graphs[0].nameFromSpawns=false;draft.spawns[0].name='East gate';Names.refreshPaths(draft);
 assert.equal(draft.graphs[0].name,'Keep my flank');assert.equal(draft.graphs[2].name,'Secret detour');
 const escaped={id:'manual',legacy:true,name:'Path1',nameFromSpawns:false,spawnIds:[1]};draft.graphs.push(escaped);Names.refreshPaths(draft);assert.equal(escaped.name,'Path1');
});

test('new spawn routes use the same numbered naming scheme as imported paths',()=>{
 const before=stage(),next=M.newSpawn(before,{x:25,y:75});
 assert.equal(next.graphs.at(-1).name,'Spawn 4 · Route 1');assert.equal(next.graphs.at(-1).nameFromSpawns,true);
 assert.equal(next.spawns.at(-1).graphId,next.graphs.at(-1).id);assert.equal(before.spawns.length,3);
});

test('every new building starts at one and takes a free case-insensitive number, including disabled existing placements',()=>{
 const draft={buildings:[],specials:[]};
 for(const [kind,name]of Object.entries(Names.BUILDING_NAMES))assert.equal(Names.nextBuildingName(draft,name,Number(kind)),name+' 1');
 draft.buildings=[{id:2,kind:2,name:'Tower 1'},{id:9,kind:2,name:'Archer tower 3',enabled:false},{id:10,kind:4,name:'House 1'},{id:11,kind:4,name:'HOUSE 2'}];
 assert.equal(Names.nextBuildingName(draft,'Archer Tower',2),'Tower 2');assert.equal(Names.nextBuildingName(draft,'House',4),'House 3');
 const template={id:10,kind:4,name:'House 1',editorOrder:0,future:{keep:true}},copy=Names.prepareBuilding(draft,clone(template));
 assert.equal(copy.name,'House 3');assert(!Object.hasOwn(copy,'editorOrder'));assert.deepEqual(copy.future,{keep:true});assert.equal(template.name,'House 1');assert.equal(template.editorOrder,0);
 draft.buildings.push({...copy,id:12});assert.equal(Names.nextBuildingName(draft,'House',4),'House 4');
});

test('base Tower labels replace legacy Archer Tower labels without colliding or renaming authored outposts',()=>{
 const draft={buildings:[{id:1,kind:2,name:'Tower 1'},{id:2,kind:2,name:'Archer Tower 1',future:{keep:2}},{id:3,kind:2,name:'Archer Tower'},{id:4,kind:2,name:'Northern archer outpost'}]};
 Names.refreshTowers(draft);assert.deepEqual(draft.buildings.map(building=>building.name),['Tower 1','Tower 2','Tower 3','Northern archer outpost']);
 assert.deepEqual(draft.buildings.map(building=>building.id),[1,2,3,4]);assert.deepEqual(draft.buildings[1].future,{keep:2});
 const once=clone(draft);Names.refreshTowers(draft);assert.deepEqual(draft,once);
});
