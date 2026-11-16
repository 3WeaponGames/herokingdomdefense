'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const M=require('../worlds/model'),Terrain=require('../worlds/terrain');
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

test('saved Terrain concepts retain valid map data, bounded atlases and complete frame dependencies',()=>{
 const maps=fs.readdirSync(path.join(root,'authoring/worlds/maps')).filter(file=>/^map-original-0[1-4]-rebuilt\.json$/.test(file));
 for(const file of maps){
  const map=read('authoring/worlds/maps/'+file);assert.deepEqual(M.validateMap(map,assets),[]);
  const directory='assets/KinghtFallIconMap/Generated/Maps/'+map.id,files=fs.readdirSync(path.join(root,directory));
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
  assert(atlases>0);assert(bytes>0);
 }
});
