'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Terrain=require('../worlds/terrain');
const library=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../authoring/worlds/library/manifest.json'),'utf8')).assets;
const asset=name=>{const found=library.find(a=>a.name===name);assert(found,'Fixture asset '+name);return found;};
const names=pair=>pair&&[pair.surface.name,pair.edge.name,pair.field&&pair.field.name];
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};

test('shared Snow edge and field choose the Ice fill in an Ice authoring context',()=>{
 for(const name of ['Road up Snow','Field Snow']){
  const selected=asset(name);
  assert.deepEqual(names(Terrain.roadPair(selected,library,'ice')),['Road Ice','Road up Snow','Field Snow']);
  assert.deepEqual(names(Terrain.roadPair(selected,library,'snow')),['Road Snow','Road up Snow','Field Snow']);
 }
});

test('an explicitly selected Road fill keeps its exact identity despite a different biome context',()=>{
 const snow=asset('Road Snow'),ice=asset('Road Ice');
 for(const context of ['ice','snow','fire','all',undefined]){
  assert.strictEqual(Terrain.roadPair(snow,library,context).surface,snow);
  assert.strictEqual(Terrain.roadPair(ice,library,context).surface,ice);
 }
 // A different record with the same display name must not replace the clicked ID.
 const duplicate=Object.assign({},snow,{id:'duplicate-snow-art',FutureField:{keep:true}});
 const records=[duplicate].concat(library);
 assert.strictEqual(Terrain.roadPair(snow,records,'ice').surface,snow);
 assert.strictEqual(Terrain.roadPair(duplicate,records,'snow').surface,duplicate);
});

test('no-context pairing and unsupported contexts retain the existing eight-biome choices',()=>{
 const expected=[
  ['Forest','forest'],['DeepForest','deep-forest'],['Autumn','autumn'],['Desert','desert'],
  ['Snow','snow'],['Fire','fire'],['Lava','lava']
 ];
 for(const [suffix,biome] of expected){
  for(const name of ['Road '+suffix,'Road up '+suffix,'Field '+suffix]){
   const selected=asset(name),tuple=['Road '+suffix,'Road up '+suffix,'Field '+suffix];
   assert.deepEqual(names(Terrain.roadPair(selected,library)),tuple);
   assert.deepEqual(names(Terrain.roadPair(selected,library,'not-a-biome')),tuple);
   assert(Terrain.roadPair(selected,library,biome).surface.biomes.includes(biome));
  }
 }
 assert.deepEqual(names(Terrain.roadPair(asset('Road Ice'),library)),['Road Ice','Road up Snow','Field Snow']);
 assert.deepEqual(names(Terrain.roadPair(asset('Road up Snow'),library,'all')),['Road Snow','Road up Snow','Field Snow']);
 // An unrelated context never forces a foreign palette asset to a new biome.
 assert.deepEqual(names(Terrain.roadPair(asset('Road up Fire'),library,'ice')),['Road Fire','Road up Fire','Field Fire']);
});

test('a valid shared-asset context never silently falls back to another biome when its fill is missing',()=>{
 const noIce=library.filter(a=>a.name!=='Road Ice');
 assert.equal(Terrain.roadPair(asset('Road up Snow'),noIce,'ice'),null);
 assert.equal(Terrain.roadDefaults(asset('Road up Snow'),noIce,'ice'),null);
 const noFireEdge=library.filter(a=>a.name!=='Road up Fire');
 assert.equal(Terrain.roadPair(asset('Road Fire'),noFireEdge,'fire'),null);
 assert.equal(Terrain.roadDefaults(asset('Road Fire'),noFireEdge,'fire'),null);
});

test('all eight biome presets use their reviewed edge scale with a consistent interior allowance',()=>{
 const expected=[
  ['forest','Road Forest',155],['deep-forest','Road DeepForest',155],['autumn','Road Autumn',155],
  ['desert','Road Desert',175],['snow','Road Snow',180],['ice','Road Ice',180],
  ['fire','Road Fire',180],['lava','Road Lava',240]
 ];
 for(const [biome,name,width] of expected){
  const selected=asset(name),pair=Terrain.roadPair(selected,library,biome),value=Terrain.roadDefaults(selected,library,biome);
  const ordinary={biome,width,edgeScale:biome==='lava'?.75:1,edgeSmoothing:.6,edgeStyle:'textured'};
  assert.deepEqual(value,biome==='lava'?Object.assign(ordinary,{edgeExterior:'cutout'}):ordinary);
  assert(width-2*Math.max(1,pair.edge.height-2)*value.edgeScale>=90);
  assert(width-2*Math.max(1,pair.edge.height-2)*value.edgeScale<95);
  assert.equal(Object.prototype.hasOwnProperty.call(value,'edgeExterior'),biome==='lava');
 }
 assert.equal(Terrain.roadDefaults(asset('Road up Snow'),library,'ice').biome,'ice');
 assert.equal(Terrain.roadDefaults(asset('Field Snow'),library,'ice').width,180);
 assert.equal(Terrain.roadDefaults(asset('Road up Snow'),library,'snow').biome,'snow');
});

test('pairing and presets do not modify IDs, unknown fields, arrays or any source records',()=>{
 const records=JSON.parse(JSON.stringify(library));
 records.forEach(a=>a.FutureAuthoring={keep:['original',a.id]});
 const before=JSON.stringify(records);freeze(records);
 for(const biome of ['forest','deep-forest','autumn','desert','snow','ice','fire','lava']){
  const selected=records.find(a=>a.category==='roads'&&/^Road (?!up )/.test(a.name)&&a.biomes.includes(biome));
  const result=Terrain.roadPair(selected,records,biome),defaults=Terrain.roadDefaults(selected,records,biome);
  assert.strictEqual(result.surface,selected);
  assert.deepEqual(result.surface.FutureAuthoring,{keep:['original',selected.id]});
  assert.equal(defaults.biome,biome);
 }
 assert.equal(JSON.stringify(records),before);
});

test('presets are independent tool settings and never reuse mutable result objects',()=>{
 const selected=asset('Road up Snow'),first=Terrain.roadDefaults(selected,library,'ice');
 first.width=999;first.edgeStyle='clean';first.extra={temporary:true};
 assert.deepEqual(Terrain.roadDefaults(selected,library,'ice'),{biome:'ice',width:180,edgeScale:1,edgeSmoothing:.6,edgeStyle:'textured'});
 assert.equal(Terrain.roadDefaults(selected,library,'snow').biome,'snow');
 assert.equal(Terrain.roadDefaults(selected,library).biome,'snow');
});

test('non-terrain selections cannot create road presets or pairs',()=>{
 for(const value of [null,undefined,{id:'tree',name:'Road Tree',category:'trees',biomes:['forest']},{id:'uploaded',name:'Road Uploaded',category:'custom',biomes:['forest']}]){
  assert.equal(Terrain.roadPair(value,library,'forest'),null);
  assert.equal(Terrain.roadDefaults(value,library,'forest'),null);
 }
});


test('Lava exterior cutout survives portable drafts while absent legacy values remain unchanged',()=>{const M=require('../worlds/model'),asset={id:'surface'},edge={id:'edge'},source=M.createMap('lava-cutout','Lava','lava'),base={mode:'road',assetId:asset.id,edgeAssetId:edge.id,size:290,op:'paint',points:[{x:0,y:0},{x:50,y:50}]},legacy=M.stroke(source,'roads',base),draft=M.stroke(source,'roads',Object.assign({},base,{edgeExterior:'cutout'}));assert.deepEqual(M.validateMap(draft,{surface:asset,edge}),[]);assert.equal(M.clone(draft).ground.roads.strokes[0].edgeExterior,'cutout');assert.equal(Object.prototype.hasOwnProperty.call(legacy.ground.roads.strokes[0],'edgeExterior'),false);const invalid=M.clone(draft);invalid.ground.roads.strokes[0].edgeExterior='invalid';assert(M.validateMap(invalid,{surface:asset,edge}).some(i=>/exterior/i.test(i)));assert.deepEqual(source.ground.roads.strokes,[]);});
