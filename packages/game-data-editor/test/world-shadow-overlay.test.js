'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const M=require('../worlds/model'),Terrain=require('../worlds/terrain'),PNG=require('../../hkd-characters/lib/png-atlas');
const root=path.resolve(__dirname,'../../..'),assets=JSON.parse(fs.readFileSync(path.join(root,'authoring/worlds/library/manifest.json'))).assets;
test('paintable shadow is the only shadow source; obsolete fixed overlay and Map7 baked ground files are removed',()=>{
 const brush=assets.find(a=>a.id==='shadow-brush');assert(brush);assert.equal(assets.filter(a=>a.id===brush.id).length,1);assert.equal(brush.brush,'shadow');assert.equal(brush.paletteLast,true);assert(!assets.some(a=>a.id==='shadow-tree-overlay'||/^(?:Map 7 (?:clean field|editable roads)|clean-ground-)/.test(a.name)));
 assert(!fs.existsSync(path.join(root,'authoring/worlds/library/images/shadow-tree-overlay.png')));
 const bytes=fs.readFileSync(path.join(root,brush.file)),image=PNG.decode(bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),brush.sha256);assert.equal(image.width,brush.width);assert.equal(image.height,brush.height);for(let i=0;i<image.rgba.length;i+=4)assert.deepEqual([...image.rgba.subarray(i,i+4)],[0,0,0,26]);
});
test('every biome Ground palette has only Road, Road up, Field and the paintable shadow texture',()=>{
 for(const biome of M.BIOMES){const palette=Terrain.sortPalette(assets.filter(a=>Terrain.inPalette(a,'Ground',biome)&&a.biomes.includes(biome)));assert.equal(palette.length,4,biome);assert.equal(palette.at(-1).id,'shadow-brush');assert.deepEqual(palette.map(a=>a.brush==='shadow'?'shadow':Terrain.terrainRole(a)).sort(),['edge','field','road','shadow']);}
 const custom={id:'custom',name:'Uploaded cliff',category:'custom',biomes:['forest']};assert(!Terrain.groundAsset(custom));assert(Terrain.objectAsset(custom));
});
test('renaming terrain keeps its paint behavior and biome pairing through a stable role',()=>{
 for(const biome of M.BIOMES){const library=assets.map(a=>Object.assign({},a,{terrainRole:Terrain.terrainRole(a)}));for(const a of library)a.name='Renamed '+a.id;const road=library.find(a=>a.terrainRole==='road'&&a.biomes.includes(biome)),pair=Terrain.roadPair(road,library,biome);assert(pair,biome);assert.equal(pair.surface.id,road.id);assert(pair.edge.biomes.includes(biome));assert(pair.field.biomes.includes(biome));assert(Terrain.groundAsset(road));}
});
