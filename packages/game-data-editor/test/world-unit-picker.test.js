'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const W=require('../worlds/wave-editor'),Catalog=require('../worlds/unit-catalog'),{Service}=require('../worlds/service');
const clone=value=>JSON.parse(JSON.stringify(value));
function stage(){return{spawns:[{id:1,enabled:true},{id:2,enabled:true}],graphs:[{id:'route',spawnIds:[1]}],config:{WaveCfg:[{id:7,Wave:1,FutureWave:{keep:true},SpawnTimeline:[{id:'original',unitId:3,spawnId:1,count:7,startSeconds:3.5,intervalSeconds:.75,routeGraphId:'route',future:{keep:[1,2]}},{id:'other',unitId:4,spawnId:2,count:1,startSeconds:1,intervalSeconds:1}]}]}};}
const settings={spawnId:1,count:7,startSeconds:3.5,intervalSeconds:.75};
test('multi-selection adds each chosen model exactly once and rejects the entire batch on an invalid choice',()=>{
 const s=stage(),before=clone(s);W.chooseGroups(s,0,[5,6,5],settings,.5);assert.deepEqual(s.config.WaveCfg[0].SpawnTimeline.slice(0,2),before.config.WaveCfg[0].SpawnTimeline);assert.deepEqual(s.config.WaveCfg[0].SpawnTimeline.slice(2).map(row=>row.unitId),[5,6]);
 for(const bad of [[],[5,-1]]){const current=clone(s);assert.throws(()=>W.chooseGroups(s,0,bad,settings,.5),/Select at least|valid unit/);assert.deepEqual(s,current);}
});
test('Switch replaces the original group in place and additional choices inherit settings while preserving source metadata',()=>{
 const s=stage(),before=clone(s);W.chooseGroups(s,0,[5,6],settings,.5,'original');const rows=s.config.WaveCfg[0].SpawnTimeline;
 assert.deepEqual(rows[0],Object.assign({},before.config.WaveCfg[0].SpawnTimeline[0],{unitId:5}));assert.deepEqual(rows[1],before.config.WaveCfg[0].SpawnTimeline[1]);assert.equal(rows[2].unitId,6);for(const key of Object.keys(settings))assert.equal(rows[2][key],settings[key]);assert.equal(rows[2].routeGraphId,'route');assert.deepEqual(s.config.WaveCfg[0].FutureWave,{keep:true});
});
test('keeping the initial selection adds other models and leaves the original intact; unchanged Switch preserves even legacy format',()=>{
 const s=stage(),before=clone(s);W.chooseGroups(s,0,[6,3],settings,.5,'original');assert.deepEqual(s.config.WaveCfg[0].SpawnTimeline[0],before.config.WaveCfg[0].SpawnTimeline[0]);assert.equal(s.config.WaveCfg[0].SpawnTimeline[2].unitId,6);
 for(const wave of [before.config.WaveCfg[0],{id:7,Wave:1,RefreshSoldierKind:['1#3,2'],future:{keep:true}}]){const legacy=stage();legacy.config.WaveCfg=[clone(wave)];const entry=W.entries(wave,.5)[0],snapshot=clone(legacy);W.chooseGroups(legacy,0,[entry.unitId],{count:entry.count,spawnId:entry.spawnId,startSeconds:entry.startSeconds,intervalSeconds:entry.intervalSeconds},.5,entry.id);assert.deepEqual(legacy,snapshot);}
});
test('Switch clears only an unrelated route when the spawn changes, including on added groups',()=>{
 const s=stage();W.chooseGroups(s,0,[5,6],Object.assign({},settings,{spawnId:2}),.5,'original');const rows=s.config.WaveCfg[0].SpawnTimeline;assert.equal(rows[0].routeGraphId,null);assert(!rows[2].routeGraphId);assert.deepEqual(rows[0].future,{keep:[1,2]});
});
test('catalog resolves descriptions and filters, including the source asset pack of campaign appearances, without changing config',()=>{
 const config={SoldierCfg:{3:{Name:'[[loc:name]]',Guide:{description:'[[loc:description]]'},prefab:'model',MonsterPack:'monster2'},4:{Name:'Campaign',prefab:'campaign',AppearanceSourceUnit:3},90011:{Name:'Boss form',prefab:'model'}},GameTools:{unitTypes:{mystic:{name:'Mystic'}},unitTypeAssignments:{'enemy:3:default':'mystic'}}},before=clone(config),rows=Catalog.rows(config,{entries:{name:{en:'Acolyte'},description:{en:'Heals nearby allies with radiant spells.'}}});
 assert.equal(rows.length,2);assert.equal(rows[0].description,'Heals nearby allies with radiant spells.');assert.equal(rows[0].unitType,'mystic');assert.equal(rows[1].assetPack,'monster2');assert(Catalog.matches(rows[0],'radiant heals'));assert(!Catalog.matches(rows[0],'radiant archer'));assert.deepEqual(config,before);
});
test('the complete saved catalog exposes every spawnable unit and read-only model descriptions without creating drafts',()=>{
 const root=path.resolve(__dirname,'../../..'),file=path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),before=fs.readFileSync(file),service=new Service(root,{artifacts:path.join(os.tmpdir(),'hkd-picker-readonly-'+process.pid)}),catalog=service.catalog(),config=JSON.parse(before);
 assert.equal(catalog.units.length,Object.values(config.SoldierCfg).filter(unit=>unit.prefab&&![90011,90012].includes(Number(unit.ID))).length);assert(catalog.units.every(unit=>typeof unit.description==='string'&&unit.unitType&&unit.assetPack));assert.equal(catalog.units.find(unit=>unit.id===92001).assetPack,'monster1');
 const documents=clone(service.docs),model=service.unitPreview({id:91001});assert(model.layers.length&&model.layers[0].json&&model.layers[0].atlas&&model.runtimePath);assert.deepEqual(model.shared,[]);assert.equal(service.version,1);assert.deepEqual(service.docs,documents);assert(fs.readFileSync(file).equals(before));assert.throws(()=>service.unitPreview({id:90011}),/spawnable/);
});
