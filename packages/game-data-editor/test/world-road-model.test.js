'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../worlds/model'),History=require('../worlds/history'),Baker=require('../worlds/baker');
const road=()=>({mode:'road',assetId:'road',edgeAssetId:'edge',edgeScale:1,textureScale:1,size:80,shape:'round',hardness:1,opacity:1,op:'paint',points:[{x:12.5,y:20.25},{x:112.125,y:60.5},{x:90.75,y:140.25}]}),assets={road:{id:'road'},edge:{id:'edge'}};
test('all eight bundled biomes pair their Road and Road up tiles without rewriting the library',()=>{
 const fs=require('fs'),path=require('path'),Terrain=require('../worlds/terrain'),manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../authoring/worlds/library/manifest.json'),'utf8')),before=JSON.stringify(manifest),library=manifest.assets;
 for(const biome of M.BIOMES){
  const fill=library.find(a=>a.category==='roads'&&/^Road (?!up )/.test(a.name)&&a.biomes.includes(biome)),pair=Terrain.roadPair(fill,library);
  assert(fill,'Road fill for '+biome);assert(pair,'Road pair for '+biome);assert.equal(pair.surface.id,fill.id);
  assert(pair.edge.biomes.includes(biome),'matching road edge for '+biome);assert(pair.field&&pair.field.biomes.includes(biome),'matching field for '+biome);
  // Ice intentionally shares the Snow transition strip. Selecting that strip
  // may choose the Snow surface, but must retain the exact matching border.
  assert.equal(Terrain.roadPair(pair.edge,library).edge.id,pair.edge.id);
 }
 assert.equal(JSON.stringify(manifest),before);assert.equal(Terrain.roadPair({id:'tree',category:'trees',name:'Tree'},library),null);assert.equal(Terrain.isRoad({name:'Road up Fire',category:'roads'}),true);assert.equal(Terrain.groundAsset({category:'trees'}),false);assert.equal(Terrain.groundAsset({category:'custom'}),false);assert.deepEqual(Terrain.strokeAssets(road()),['road','edge']);assert.deepEqual(Terrain.strokeAssets({assetId:'road'}),['road']);
});
test('curved road drafts preserve source documents, original fields and one reversible gesture',()=>{const map=M.createMap('roads','Roads','forest');map.Future={preserve:true};map.ground.roads.FutureLayer='keep';const before=M.clone(map),next=M.stroke(map,'roads',road()),edits=History.diff(map,next),draft=M.clone(next);assert.deepEqual(map,before);assert.deepEqual(next.Future,{preserve:true});assert.equal(next.ground.roads.FutureLayer,'keep');assert.equal(next.ground.roads.strokes.length,1);assert.deepEqual(M.validateMap(next,assets),[]);History.apply(draft,edits,false);assert.deepEqual(draft,before);History.apply(draft,edits,true);assert.deepEqual(draft,next);});
test('road centerline and brush width convert to a transformed layer without losing precision',()=>{const map=M.createMap('transformed-roads','Roads','forest');map.ground.roads.transform={x:30.25,y:-12.5,scale:2.5,angle:31};const s=road(),result=M.stroke(map,'roads',s).ground.roads.strokes[0];assert.equal(result.size,s.size/2.5);for(let i=0;i<s.points.length;i++){const world=M.toWorld(map.ground.roads.transform,result.points[i]);assert(Math.abs(world.x-s.points[i].x)<1e-9);assert(Math.abs(world.y-s.points[i].y)<1e-9);}assert.equal(result.edgeAssetId,s.edgeAssetId);});
test('legacy texture strokes remain unchanged when no curved-road mode is saved',()=>{const map=M.createMap('legacy-paint','Legacy paint','forest'),s={assetId:'road',textureScale:2,size:55,hardness:.4,opacity:.6,shape:'square',op:'paint',points:[{x:10.25,y:-3.5}]},result=M.stroke(map,'roads',s);assert.deepEqual(result.ground.roads.strokes[0],s);assert(!Object.prototype.hasOwnProperty.call(result.ground.roads.strokes[0],'mode'));assert.deepEqual(M.validateMap(result,assets),[]);});
test('curved road save specifications include the secondary edge image',()=>{const map=M.stroke(M.createMap('road-bake','Road bake','forest'),'roads',road()),library=[{id:'road',url:'file:///road.png'},{id:'edge',url:'file:///edge.png'},{id:'unused',url:'file:///unused.png'}],spec=Baker.spec('',map,library);assert.deepEqual(Object.keys(spec.images).sort(),['edge','road']);assert.throws(()=>Baker.spec('',map,library.filter(a=>a.id!=='edge')),/Missing source image edge/);});
test('curved road validation rejects missing borders and invalid border scales',()=>{const map=M.stroke(M.createMap('bad-roads','Bad roads','forest'),'roads',road());delete map.ground.roads.strokes[0].edgeAssetId;assert(M.validateMap(map,assets).some(x=>/road|edge|border/i.test(x)));for(const scale of [0,-1,Infinity,NaN,8.01]){const value=M.stroke(M.createMap('bad-scale','Bad scale','forest'),'roads',road());value.ground.roads.strokes[0].edgeScale=scale;assert(M.validateMap(value,assets).length>0);}const unknown=M.stroke(M.createMap('missing-road-edge','Missing edge','forest'),'roads',road());unknown.ground.roads.strokes[0].edgeAssetId='missing';assert(M.validateMap(unknown,assets).some(x=>/edge|texture|road/i.test(x)));});
test('road authoring obeys layer locks while ordinary erases remain compatible',()=>{const map=M.createMap('locked-roads','Locked','forest');map.ground.roads.locked=true;assert.throws(()=>M.stroke(map,'roads',road()),/unlock/i);map.ground.roads.locked=false;const painted=M.stroke(map,'roads',road()),erased=M.stroke(painted,'roads',{size:30,hardness:.5,opacity:.5,op:'erase',points:[{x:50,y:50}]});assert.equal(erased.ground.roads.strokes.length,2);assert.equal(erased.ground.roads.strokes[1].op,'erase');assert.deepEqual(M.validateMap(erased,assets),[]);});

test('road edge smoothing round-trips explicitly without changing legacy road records or source paths',()=>{
 const map=M.createMap('smooth-roads','Smooth roads','forest'),legacy=road();legacy.FutureEdge={preserve:17};const original=M.clone(legacy);
 let draft=M.stroke(map,'roads',legacy);
 for(const amount of [0,.75,1])draft=M.stroke(draft,'roads',Object.assign(road(),{edgeSmoothing:amount}));
 assert.deepEqual(draft.ground.roads.strokes[0],original);assert(!Object.prototype.hasOwnProperty.call(draft.ground.roads.strokes[0],'edgeSmoothing'));
 for(let i=1;i<4;i++){assert.equal(draft.ground.roads.strokes[i].edgeSmoothing,[0,.75,1][i-1]);assert.deepEqual(draft.ground.roads.strokes[i].points,legacy.points);}
 assert.deepEqual(M.validateMap(draft,assets),[]);assert.deepEqual(JSON.parse(JSON.stringify(draft)),draft);assert.deepEqual(map.ground.roads.strokes,[]);
 const edits=History.diff(map,draft),undo=M.clone(draft);History.apply(undo,edits,false);assert.deepEqual(undo,map);History.apply(undo,edits,true);assert.deepEqual(undo,draft);
});
test('road edge smoothing validation accepts zero and one but rejects nonfinite or out-of-range settings',()=>{
 for(const amount of [-.01,1.01,Infinity,-Infinity,NaN,null,'0.75']){
  const map=M.stroke(M.createMap('bad-smoothing','Bad smoothing','forest'),'roads',road());map.ground.roads.strokes[0].edgeSmoothing=amount;
  assert(M.validateMap(map,assets).some(x=>/smooth/i.test(x)),'invalid smoothing '+String(amount));
 }
 for(const amount of [undefined,0,.75,1]){const map=M.stroke(M.createMap('valid-smoothing','Valid smoothing','forest'),'roads',road());if(amount!==undefined)map.ground.roads.strokes[0].edgeSmoothing=amount;assert.deepEqual(M.validateMap(map,assets),[]);}
});
test('smooth road bake specifications retain both artwork sources and explicit smoothing',()=>{
 const map=M.stroke(M.createMap('smooth-bake','Smooth bake','forest'),'roads',Object.assign(road(),{edgeSmoothing:.75})),before=M.clone(map),spec=Baker.spec('',map,[{id:'road',url:'file:///road.png'},{id:'edge',url:'file:///edge.png'}]);
 assert.deepEqual(Object.keys(spec.images).sort(),['edge','road']);assert.equal(spec.map.ground.roads.strokes[0].edgeSmoothing,.75);assert.deepEqual(map,before);
});

test('fixed road edge thickness remains independent of road width while legacy records stay unmodified',()=>{
 const map=M.createMap('fixed-edge','Fixed edge','forest'),legacy=road(),first=Object.assign(road(),{edgeWidthMode:'fixed',edgeScale:.8,size:120,edgeSmoothing:.75}),second=Object.assign(road(),{edgeWidthMode:'fixed',edgeScale:.8,size:200,edgeSmoothing:.75});
 let value=M.stroke(map,'roads',legacy);value=M.stroke(value,'roads',first);value=M.stroke(value,'roads',second);
 assert(!Object.prototype.hasOwnProperty.call(value.ground.roads.strokes[0],'edgeWidthMode'));assert.deepEqual(value.ground.roads.strokes[0],legacy);
 const roads=value.ground.roads.strokes.slice(1);assert.deepEqual(roads.map(s=>s.size),[120,200]);assert(roads.every(s=>s.edgeScale===.8&&s.edgeWidthMode==='fixed'));assert.deepEqual(M.validateMap(value,assets),[]);
 for(const mode of ['stretch',null,0]){const invalid=M.clone(value);invalid.ground.roads.strokes[1].edgeWidthMode=mode;assert(M.validateMap(invalid,assets).some(x=>/width|thick|edge mode/i.test(x)),'invalid edge width mode '+String(mode));}
});

test('textured and clean road styles remain explicit portable authoring choices',()=>{
 const original=M.createMap('road-styles','Road styles','forest'),legacy=road();legacy.FutureRoadField={keep:true};let map=M.stroke(original,'roads',legacy);
 for(const style of ['textured','clean'])map=M.stroke(map,'roads',Object.assign(road(),{edgeStyle:style,edgeSmoothing:.6,edgeWidthMode:'fixed'}));
 assert.deepEqual(map.ground.roads.strokes[0],legacy);assert(!Object.prototype.hasOwnProperty.call(map.ground.roads.strokes[0],'edgeStyle'));
 assert.deepEqual(map.ground.roads.strokes.slice(1).map(s=>s.edgeStyle),['textured','clean']);assert.deepEqual(M.validateMap(map,assets),[]);
 const portable=JSON.parse(JSON.stringify(map));assert.deepEqual(portable,map);assert.deepEqual(original.ground.roads.strokes,[]);
 const edits=History.diff(original,map),draft=M.clone(map);History.apply(draft,edits,false);assert.deepEqual(draft,original);History.apply(draft,edits,true);assert.deepEqual(draft,map);
});
test('road edge style validation accepts absent or recognized styles and rejects invalid authored values',()=>{
 for(const style of [undefined,'textured','clean']){const map=M.stroke(M.createMap('valid-style','Valid style','forest'),'roads',road());if(style!==undefined)map.ground.roads.strokes[0].edgeStyle=style;assert.deepEqual(M.validateMap(map,assets),[]);}
 for(const style of ['unknown','',null,0,{}]){const map=M.stroke(M.createMap('invalid-style','Invalid style','forest'),'roads',road());map.ground.roads.strokes[0].edgeStyle=style;assert(M.validateMap(map,assets).some(x=>/style/i.test(x)),'invalid edge style '+JSON.stringify(style));}
});
test('textured road baking retains original source image references and style without rewriting legacy records',()=>{
 const map=M.stroke(M.createMap('textured-bake','Textured bake','forest'),'roads',Object.assign(road(),{edgeStyle:'textured',edgeSmoothing:.6,edgeWidthMode:'fixed'})),before=M.clone(map),spec=Baker.spec('',map,[{id:'road',url:'file:///original-road.png'},{id:'edge',url:'file:///original-edge.png'}]);
 assert.equal(spec.images.edge.url,'file:///original-edge.png');assert.equal(spec.map.ground.roads.strokes[0].edgeStyle,'textured');assert.equal(spec.map.ground.roads.strokes[0].edgeSmoothing,.6);assert.deepEqual(map,before);
});
