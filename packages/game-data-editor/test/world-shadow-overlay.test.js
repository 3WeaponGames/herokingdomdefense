'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const M=require('../worlds/model'),Terrain=require('../worlds/terrain'),Baker=require('../worlds/baker'),Legacy=require('../worlds/legacy'),History=require('../worlds/history');
const PNG=require('../../hkd-characters/lib/png-atlas');
const root=path.resolve(__dirname,'../../..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'authoring/worlds/library/manifest.json'),'utf8'));
const id='shadow-tree-overlay',asset=manifest.assets.find(a=>a.id===id);

test('manual shadow texture retains the measured pure-black alpha26 fill and transparent antialiased edge',()=>{
 assert(asset,'the standalone shadow is registered exactly once');assert.equal(manifest.assets.filter(a=>a.id===id).length,1);
 assert.equal(asset.file,'authoring/worlds/library/images/shadow-tree-overlay.png');assert(!asset.stagedFile&&!asset.url,'production library records remain portable');
 const bytes=fs.readFileSync(path.join(root,asset.file)),image=PNG.decode(bytes),alphas=new Set();let core=0,transparent=0,edge=0;
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.equal(image.width,asset.width);assert.equal(image.height,asset.height);
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
  const at=(y*image.width+x)*4,a=image.rgba[at+3];alphas.add(a);
  assert.equal(image.rgba[at],0);assert.equal(image.rgba[at+1],0);assert.equal(image.rgba[at+2],0);
  if(a===26)core++;else if(a===0)transparent++;else edge++;
  if(x===0||y===0||x===image.width-1||y===image.height-1)assert.equal(a,0,'transparent outer padding prevents clipped shadow edges');
 }
 assert.equal(Math.max(...alphas),26,'a shadow must never exceed 26/255 opacity');assert(core>image.width*image.height*.05,'the silhouette includes a substantial constant-alpha interior');
 assert(transparent>0&&edge>0,'silhouette has both clear padding and antialiased alpha1–25 edges');
 assert.equal(asset.depth,'ground');assert.deepEqual(asset.anchor,{x:.5,y:.5});assert.equal(asset.defaultScale,1);
});

test('shadow remains visible in both palettes for all eight biomes and last after later imports',()=>{
 assert.equal(asset.category,'shadows');assert.equal(asset.paletteLast,true);assert.deepEqual(asset.biomes.slice().sort(),M.BIOMES.slice().sort());
 const appended={id:'later-custom-import',name:'Later custom import',category:'custom',biomes:M.BIOMES.slice()},library=manifest.assets.concat(appended),before=JSON.stringify(library);
 for(const biome of M.BIOMES)for(const visible of [Terrain.groundAsset,Terrain.objectAsset]){
  const palette=Terrain.sortPalette(library.filter(a=>visible(a)&&a.biomes.includes(biome)));
  assert.equal(palette[palette.length-1].id,id,biome+' shadow is last in its palette');assert(palette.some(a=>a.id===appended.id));
 }
 assert.equal(JSON.stringify(library),before,'palette ordering does not mutate the library');
 const normalA=Object.freeze({id:'a'}),lastA=Object.freeze({id:'last-a',paletteLast:true}),normalB=Object.freeze({id:'b'}),lastB=Object.freeze({id:'last-b',paletteLast:true}),input=Object.freeze([lastA,normalA,lastB,normalB]);
 assert.deepEqual(Terrain.sortPalette(input),[normalA,normalB,lastA,lastB],'both groups retain their original ordering');assert.deepEqual(input,[lastA,normalA,lastB,normalB]);
});

test('placing shadows in Ground or Objects only creates valid reversible visual drafts without doubled opacity or collision',()=>{
 const assets=Object.fromEntries(manifest.assets.map(a=>[a.id,a])),original=M.createLayer(M.createMap('shadow-draft','Shadow draft','forest'),'Shadow objects');original.FutureField={keep:true};
 const before=M.clone(original),ground=M.placeGroundImage(original,'roads',asset,{x:125,y:-80}),objects=M.place(original,original.layers[1].id,asset,{x:-65,y:45},1,1,0);
 assert.deepEqual(original,before,'placing either type preserves the source map');
 assert.equal(ground.object.opacity,1);assert.equal(objects.object.opacity===undefined?1:objects.object.opacity,1);assert.equal(ground.object.scale,1);assert.equal(objects.object.scale,1);
 assert.deepEqual(ground.object.mask,[]);assert.equal(M.groundImage(ground.map,ground.object.id).object,ground.map.ground.roads.images[0]);
 assert(M.isGroundObject(objects.map.layers[1],objects.object),'Object placement remains ground artwork below buildings and units');
 for(const map of [ground.map,objects.map]){
  assert.deepEqual(M.validateMap(map,assets),[]);assert.deepEqual(map.FutureField,{keep:true});assert.deepEqual(M.blockerPolygons(map),[]);
  assert(map.layers.every(layer=>(layer.blockers||[]).length===0&&(layer.polygons||[]).length===0&&layer.objects.every(o=>(o.polygons||[]).length===0)));
  const portable=JSON.parse(JSON.stringify(map)),spec=Baker.spec(root,portable,Legacy.loadLibrary(root));
  assert.deepEqual(portable,map);assert.deepEqual(Object.keys(spec.images),[id]);assert.equal(spec.images[id].sha256,asset.sha256);
  const edits=History.diff(original,map),undone=M.clone(map);History.apply(undone,edits,false);assert.deepEqual(undone,original);History.apply(undone,edits,true);assert.deepEqual(undone,map);
 }
});
