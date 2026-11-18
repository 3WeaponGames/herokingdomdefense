'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../worlds/model'),Paint=require('../worlds/paint'),Terrain=require('../worlds/terrain'),History=require('../worlds/history'),Baker=require('../worlds/baker'),Assets=require('../worlds/asset-management'),Budget=require('../worlds/budget');
const brush=(id,extra)=>Object.assign({id,assetId:'field',size:30,shape:'round',hardness:.6,opacity:.7,op:'paint',points:[{x:10,y:20}],Future:{id}},extra);
const road=id=>brush(id,{mode:'road',assetId:'road',edgeAssetId:'edge',edgeStyle:'textured',edgeScale:.8,edgeSmoothing:.7,edgeWidthMode:'fixed'});
const library=['field','road','edge','other'].map(id=>({id,width:16,height:16,url:'memory:'+id})),assets=Object.fromEntries(library.map(a=>[a.id,a]));
function sample(){let map=M.createMap('merge','Merge','forest');map=M.createGroundLayer(map,'Ground overlay 2');const layer=map.ground.custom[0];Object.assign(layer,{transform:{x:16,y:-28,scale:1.7,angle:32},opacity:.65,blend:'multiply',Future:{preserve:[1,2]},images:[{id:'ground-image-1',name:'Existing image',assetId:'other',x:0,y:0,scale:1,angle:0}]});layer.strokes=[brush('a'),road('b'),brush('erase',{assetId:'missing-eraser-source',op:'erase'}),brush('d',{assetId:'other'}),brush('e'),road('f'),brush('g')];map.Future={keep:true};return map;}
function frozen(value){if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}

test('merge replaces seven recipes with one group while preserving map identity, layer pose and unknown data',()=>{
 const map=frozen(sample()),id=map.ground.custom[0].id,before=JSON.stringify(map),merged=M.mergeGroundStrokes(map,id),layer=M.groundLayer(merged,id);
 assert.notEqual(merged,map);assert.equal(JSON.stringify(map),before);assert.deepEqual(layer.strokes,[{mode:'merged',strokes:map.ground.custom[0].strokes}]);
 const expected=M.clone(map);expected.ground.custom[0].strokes=layer.strokes;assert.deepEqual(merged,expected);assert.notEqual(layer.strokes[0].strokes[0],map.ground.custom[0].strokes[0]);assert.deepEqual(M.validateMap(merged,assets),[]);assert(!Object.hasOwn(merged,'blockerMask'));
});

test('zero or one record is an identity no-op and an editable layer is required for a real merge',()=>{
 for(const records of [[],[brush('one')],[{mode:'merged',strokes:[brush('one'),brush('two')]}]]){const map=M.createMap('noop','No-op','forest');map.ground.grass.strokes=records;map.ground.grass.locked=true;assert.equal(M.mergeGroundStrokes(map,'grass'),map);}
 for(const flag of ['hidden','locked']){const map=sample(),layer=map.ground.custom[0],before=JSON.stringify(map);layer[flag]=true;assert.throws(()=>M.mergeGroundStrokes(map,layer.id),/Show and unlock/);delete layer[flag];assert.equal(JSON.stringify(map),before);}
 assert.throws(()=>M.mergeGroundStrokes(sample(),'missing'),/Choose a ground layer/);
});

test('paint after merge and merge again preserves chronological recipes through serialization and undo/redo',()=>{
 const before=sample(),id=before.ground.custom[0].id,first=M.mergeGroundStrokes(before,id);first.ground.custom[0].strokes[0].Future={group:'kept'};
 const painted=M.stroke(first,id,brush('new',{points:[{x:130,y:-45}]})),merged=M.mergeGroundStrokes(painted,id),group=merged.ground.custom[0].strokes[0],expected=before.ground.custom[0].strokes.concat(M.groundLayer(painted,id).strokes[1]);
 assert.deepEqual(Paint.expandStrokes([group]),expected);assert.deepEqual(group.strokes[0].Future,{group:'kept'});assert.deepEqual(Paint.expandStrokes(JSON.parse(JSON.stringify([group]))),expected);
 const edits=History.diff(painted,merged);assert.deepEqual(History.apply(M.clone(merged),edits,false),painted);assert.deepEqual(History.apply(M.clone(painted),edits,true),merged);assert.deepEqual(M.validateMap(merged,assets),[]);
});

test('nested paint groups expose every required source to source validation and the baker',()=>{
 const map=sample(),id=map.ground.custom[0].id,merged=M.mergeGroundStrokes(map,id),group=merged.ground.custom[0].strokes[0];
 assert.deepEqual(Terrain.strokeAssets(group),['field','road','edge','other','field','road','edge','field']);
 assert.deepEqual(Object.keys(Baker.spec('',merged,library).images).sort(),['edge','field','other','road']);
 assert.throws(()=>Baker.spec('',merged,library.filter(a=>a.id!=='edge')),/Missing source image edge/);assert(!M.validateMap(merged,assets).includes('Missing brush texture.'));
 assert.deepEqual(Budget.estimate(map,assets,{}),Budget.estimate(merged,assets,{}));
});

test('validation checks child brush and road settings without requiring brush fields on group wrappers',()=>{
 const map=M.createMap('valid','Valid','ice');map.ground.grass.strokes=[{mode:'merged',Future:{keep:true},strokes:[brush('one'),{mode:'merged',strokes:[road('two')]}]}];assert.deepEqual(M.validateMap(map,assets),[]);
 for(const [extra,error]of [[{size:0},'Invalid brush stroke.'],[{assetId:'gone'},'Missing brush texture.'],[{opacity:2},'Brush opacity must be between 0 and 100%.'],[{edgeAssetId:'gone'},'Missing road edge texture.'],[{edgeSmoothing:2},'Road edge smoothing must be between 0 and 100%.']]){const value=M.clone(map);Object.assign(value.ground.grass.strokes[0].strokes[1].strokes[0],extra);assert(M.validateMap(value,assets).includes(error),error);}
 map.layers[0].blockers=[{mode:'merged',strokes:[brush('forbidden')]}];assert(M.validateMap(map,assets).includes('Merged paint groups belong on ground layers.'));
});

test('malformed groups and cycles are rejected without hangs while a shared noncyclic group expands twice',()=>{
 for(const children of [undefined,null,{},'wrong',[]]){const map=M.createMap('invalid','Invalid','forest');map.ground.grass.strokes=[{mode:'merged',strokes:children}];assert(M.validateMap(map,assets).includes('Merged paint groups need an array of brush strokes.'));}
 for(const child of [null,42,[],{size:4,points:[null]}]){const map=M.createMap('child','Child','forest');map.ground.grass.strokes=[{mode:'merged',strokes:[child]}];assert(M.validateMap(map,assets).includes('Invalid brush stroke.'));}
 const cycle={mode:'merged',strokes:[]};cycle.strokes.push(cycle);const map=M.createMap('cycle','Cycle','forest');map.ground.grass.strokes=[cycle];assert(M.validateMap(map,assets).includes('Merged paint groups cannot contain cycles.'));assert.throws(()=>Paint.expandStrokes([cycle]),/cycles/);assert.throws(()=>Terrain.strokeAssets(cycle),/cycles/);
 assert.throws(()=>Paint.expandStrokes([{mode:'merged',strokes:{}}]),/array/);assert.throws(()=>Terrain.strokeAssets({mode:'merged',strokes:null}),/array/);
 const shared={mode:'merged',strokes:[brush('shared')]};assert.deepEqual(Paint.expandStrokes([shared,shared]).map(s=>s.id),['shared','shared']);assert.deepEqual(Terrain.strokeAssets({mode:'merged',strokes:[shared,shared]}),['field','field']);
});

test('iterative group expansion and source traversal retain order in deeply nested valid recipes',()=>{
 let value=brush('leaf');for(let i=0;i<2000;i++)value={mode:'merged',strokes:[value]};assert.equal(Paint.expandStrokes([value])[0].id,'leaf');assert.deepEqual(Terrain.strokeAssets(value),['field']);
 const map=M.createMap('deep','Deep','forest');map.ground.grass.strokes=[value];assert.deepEqual(M.validateMap(map,assets),[]);const deleted=Assets.cleanMap(map,'field');assert.equal(deleted.stats.strokes,1);assert.deepEqual(deleted.value.ground.grass.strokes,[]);
});

test('explicit asset deletion cleans nested references by leaf and preserves unrelated grouped recipes',()=>{
 const map=M.createMap('delete','Delete','forest');map.ground.grass.strokes=[{mode:'merged',Future:{keep:true},strokes:[brush('remove'),road('keep-road'),{mode:'merged',Future:{nested:true},strokes:[brush('keep',{assetId:'other'}),brush('erase',{op:'erase',edgeAssetId:'field'})]},{mode:'merged',strokes:[brush('empty-after-delete')]}]}];const before=JSON.stringify(map),cleaned=Assets.cleanMap(map,'field'),group=cleaned.value.ground.grass.strokes[0];
 assert.equal(JSON.stringify(map),before);assert.equal(cleaned.stats.strokes,2);assert.deepEqual(group.Future,{keep:true});assert.deepEqual(Paint.expandStrokes([group]).map(s=>s.id),['keep-road','keep','erase']);assert.deepEqual(group.strokes[1].Future,{nested:true});assert(!Object.hasOwn(group.strokes[1].strokes[1],'assetId'));assert(!Object.hasOwn(group.strokes[1].strokes[1],'edgeAssetId'));assert.deepEqual(M.validateMap(cleaned.value,assets),[]);
});
