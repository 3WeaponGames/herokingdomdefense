'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const M=require('../worlds/model'),Terrain=require('../worlds/terrain'),Blockers=require('../worlds/blockers');
const {NavigationGrid}=require('../../../assets/_script/NavigationGrid');
const root=path.resolve(__dirname,'../../..'),biomes=M.BIOMES.filter(value=>value!=='fire');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const manifest=read('authoring/worlds/library/manifest.json'),assets=Object.fromEntries(manifest.assets.map(asset=>[asset.id,asset]));
const pieces=['river-boundary','cliff','rocky-hill','mountain','lake','ruins'];
const category={ 'river-boundary':'water',cliff:'cliffs','rocky-hill':'rocks',mountain:'mountains',lake:'water',ruins:'ruins' };
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

test('biome terrain sources are portable, unique and restricted to the Objects palette',()=>{
 const sources=manifest.assets.filter(asset=>asset.id.startsWith('terrain-'));
 assert(sources.length>=biomes.length*pieces.length,'the original six reusable terrain families remain available for every biome');
 assert.equal(new Set(sources.map(asset=>asset.id)).size,sources.length);
 for(const biome of biomes)for(const piece of pieces){
  const id='terrain-'+biome+'-'+piece,asset=assets[id];assert(asset,id);
  assert.equal(manifest.assets.filter(value=>value.id===id).length,1,id);
  assert.deepEqual(asset.biomes,[biome]);assert.equal(asset.category,category[piece]);
  assert(Terrain.objectAsset(asset));assert(!Terrain.groundAsset(asset));
  assert.equal(asset.file,'authoring/worlds/library/images/biome-terrain/'+biome+'/'+piece+'.png');
  assert(!path.isAbsolute(asset.file));assert(!asset.file.split('/').includes('..'));
  assert(!asset.url&&!asset.stagedFile);assert(!/[A-Za-z]:[\\/]|file:\/\/|Codex Artifacts/.test(JSON.stringify(asset)));
  const {outlineRefinement,...origin}=asset.source;
  assert.deepEqual(origin,{kind:'openai-imagegen',biome,piece});
  if(outlineRefinement){
   assert.deepEqual(Object.keys(outlineRefinement).sort(),['date','kind','reference','worldStroke']);
   assert.equal(outlineRefinement.kind,'openai-imagegen');assert.match(outlineRefinement.date,/^\d{4}-\d{2}-\d{2}$/);
   assert.equal(outlineRefinement.reference,'Tree Yellow Green 15');assert.equal(outlineRefinement.worldStroke,1.8);
  }
  const png=fs.readFileSync(path.join(root,asset.file));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(hash(png),asset.sha256,id);assert.equal(png.readUInt32BE(16),asset.width);assert.equal(png.readUInt32BE(20),asset.height);
  assert(asset.width>0&&asset.height>0&&asset.width*asset.height<=16*1024*1024);
  assert(Number.isFinite(asset.defaultScale)&&asset.defaultScale>0,'Objects placement needs the calibrated world scale: '+id);
  assert.equal(asset.depth,category[piece]==='water'?'ground':'world');
 }
});

test('each biome has two reusable field-topped terrain pieces with calibrated placement',()=>{
 for(const biome of M.BIOMES)for(const piece of ['plateau-wide','raised-ledge']){
  const id='terrain-'+biome+'-'+piece,asset=assets[id];assert(asset,id);
  assert.equal(manifest.assets.filter(value=>value.id===id).length,1);assert.equal(asset.category,'cliffs');assert.equal(asset.depth,'world');assert.deepEqual(asset.biomes,[biome]);
  assert(Terrain.objectAsset(asset));assert(!Terrain.groundAsset(asset));assert.equal(asset.defaultScale,.5);
  assert.equal(asset.file,'authoring/worlds/library/images/biome-terrain/'+biome+'/'+piece+'.png');assert(!asset.url&&!asset.stagedFile);
  assert(asset.anchor.x>=0&&asset.anchor.x<=1&&asset.anchor.y>=0&&asset.anchor.y<=1);
  const png=fs.readFileSync(path.join(root,asset.file));assert.equal(hash(png),asset.sha256);assert.equal(png.readUInt32BE(16),asset.width);assert.equal(png.readUInt32BE(20),asset.height);
 }
});

for(const biome of biomes)test('editable '+biome+' template keeps independent terrain and one fixed global blocker',()=>{
 const map=read('authoring/worlds/maps/map-'+biome+'-terrain.json');
 assert.equal(map.biome,biome);assert(map.size.width>=1800&&map.size.height>=3000&&map.size.height>map.size.width);
 assert(map.playable.width>0&&map.playable.height>map.playable.width);
 assert.deepEqual(M.validateMap(map,assets),[]);
 for(const field of ['buildings','specials','spawns','graphs','hero','config','legacy','legacyData','legacyGround','images'])assert.equal(map[field],undefined,field+' belongs to stage data or legacy content');
 assert(map.layers.length>=4&&map.layers.length<=9,'templates should use the terrain needed by their topology');
 const terrain=map.layers.flatMap(layer=>layer.objects.map(object=>({layer,object}))),ids=new Set();
 assert.equal(terrain.length,map.layers.length);
 for(const {layer,object}of terrain){
  assert.equal(layer.objects.length,1);assert(!object.legacy);assert(object.assetId.startsWith('terrain-'+biome+'-'));
  assert(!ids.has(object.id));ids.add(object.id);
  const asset=assets[object.assetId];assert(asset,object.assetId);assert(asset.biomes.includes(biome));
  assert.equal(object.scale,asset.defaultScale,'placed terrain must retain its calibrated world detail scale');
  assert.equal(object.angle,0,'terrain lighting stays in its authored orientation');assert.equal(object.flipX,false);
  assert.deepEqual(layer.blockers||[],[]);assert.equal(layer.blockerMask,undefined);assert.deepEqual(layer.polygons||[],[]);assert.deepEqual(object.polygons||[],[]);
  assert(Number.isFinite(object.ground.x)&&Number.isFinite(object.ground.y));
 }
 assert(Array.isArray(map.blockerMask)&&map.blockerMask.length>0);assert.deepEqual(Blockers.issues(map.blockerMask),[]);
 const before=JSON.stringify(map),moved=M.clone(map);for(const layer of moved.layers){layer.transform.x+=137;layer.transform.y-=83;}
 assert.deepEqual(M.mapBlockerRegions(moved),map.blockerMask,'scenery transformations must not move blockers');
 const removed=M.removeLayer(map,map.layers[0].id);assert.deepEqual(M.mapBlockerRegions(removed),map.blockerMask,'deleting terrain must not delete global blockers');
 assert.equal(JSON.stringify(map),before,'authoring operations preserve their source');
 const field=assets[map.ground.foundation.baseAsset];assert(field&&field.category==='field');
 assert.equal((map.ground.foundation.tiles||[]).length,0);assert.equal((map.ground.foundation.images||[]).length,0);assert.equal((map.ground.foundation.strokes||[]).length,0,'roads must remain separate from the foundation');
 const roadBiome=biome==='lava'&&field.biomes.includes('fire')?'fire':biome,pair=Terrain.roadPair(field,manifest.assets,roadBiome),roads=map.ground.roads.strokes.filter(stroke=>stroke.op!=='erase');
 assert(pair);assert(roads.length>=1,'template must retain editable roads');
 for(const road of roads){assert.equal(road.mode,'road');assert.equal(road.assetId,pair.surface.id);assert.equal(road.edgeAssetId,pair.edge.id);assert.equal(road.edgeStyle,'textured');assert(road.points.length>=2);}
});

test('river crossings keep independent walkable bridge decks at the calibrated art scale',()=>{
 const crossings={forest:{id:'terrain-forest-bridge-ew',axis:0,span:600,count:2},autumn:{id:'terrain-autumn-bridge-ns',axis:90,span:600,count:1},ice:{id:'terrain-ice-bridge-ne-sw',axis:45,span:530,count:1}};
 for(const biome of biomes){
  const map=read('authoring/worlds/maps/map-'+biome+'-terrain.json'),bridges=map.layers.flatMap(layer=>layer.objects.filter(object=>assets[object.assetId].category==='bridges').map(object=>({layer,object}))),expected=crossings[biome];
  assert.equal(bridges.length,expected?expected.count:0,biome);
  if(!expected)continue;
  const grid=new NavigationGrid(M.blockerPolygons(map).map(value=>value.points),{minX:-map.size.width/2,minY:-map.size.height/2,maxX:map.size.width/2,maxY:map.size.height/2},20),angle=expected.axis*Math.PI/180;
  for(const {layer,object}of bridges){
   const asset=assets[object.assetId];assert.equal(asset.id,expected.id);assert.equal(asset.depth,'ground');assert(M.isGroundObject(layer,object));assert.equal(object.scale,asset.defaultScale);
   const center=M.toWorld(layer.transform,{x:object.x,y:object.y}),half=expected.span/2-5,a={x:center.x-Math.cos(angle)*half,y:center.y-Math.sin(angle)*half},b={x:center.x+Math.cos(angle)*half,y:center.y+Math.sin(angle)*half};
   for(const radius of [20,30,85])assert(grid.segmentClear(a,b,radius),biome+' bridge must be directly walkable at radius '+radius);
   assert.deepEqual(layer.blockers||[],[],'bridge artwork cannot create an attached blocker');
  }
 }
});

test('biome exports retain bounded atlas textures and complete frame dependencies',()=>{
 for(const biome of biomes){
  const directory='assets/KinghtFallIconMap/Generated/Maps/map-'+biome+'-terrain',files=fs.readdirSync(path.join(root,directory));
  let bytes=0,atlases=0;
  assert(files.includes('thumbnail.png'));assert(files.some(file=>/^ground-.*\.png$/.test(file)));
  for(const file of files.filter(name=>name.endsWith('.png'))){
   const png=fs.readFileSync(path.join(root,directory,file)),width=png.readUInt32BE(16),height=png.readUInt32BE(20),meta=read(directory+'/'+file+'.meta');
   assert(width>0&&height>0&&width<=2048&&height<=2048);assert.equal(meta.width,width);assert.equal(meta.height,height);assert.equal(meta.packable,false);
   if(file!=='thumbnail.png')bytes+=width*height*4;
  }
  for(const file of files.filter(name=>name.endsWith('.plist.meta'))){
   atlases++;const atlas=read(directory+'/'+file),texture=read(directory+'/'+file.replace('.plist.meta','.png.meta'));
   assert.equal(atlas.importer,'sprite-atlas');assert.equal(atlas.rawTextureUuid,texture.uuid);
   assert(Object.keys(atlas.subMetas).length>0);
   for(const frame of Object.values(atlas.subMetas)){assert.equal(frame.rawTextureUuid,texture.uuid);assert(frame.width>0&&frame.height>0);assert(frame.trimX>=0&&frame.trimY>=0&&frame.trimX+frame.width<=texture.width&&frame.trimY+frame.height<=texture.height);}
  }
  assert(atlases>0&&atlases<=8);assert(bytes<=64*1024*1024,biome+' exceeds the map texture budget');
 }
});
