'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),L=require('../worlds/legacy'),A=require('../worlds/animated-objects'),M=require('../worlds/model'),P=require('../worlds/prefab'),Paint=require('../worlds/paint'),Groups=require('../worlds/groups'),Terrain=require('../worlds/terrain');
const index=L.index(root),assets=A.catalog(root,index.images),table=Object.fromEntries(assets.map(a=>[a.id,a]));
test('the object palette exposes two reusable transparent stream animations with the original five frames and timing',()=>{
 assert.deepEqual(assets.map(a=>a.name),['River Stream – Curved','River Stream – Long']);
 const before=assets.map(a=>JSON.stringify(a));assert.deepEqual(A.catalog(root,index.images).map(a=>JSON.stringify(a)),before);
 for(const asset of assets){
  assert.equal(asset.category,'animations');assert(Terrain.inPalette(asset,'Decoration','forest'));assert(!Terrain.inPalette(asset,'Ground','forest'));assert.equal(asset.builtin,true);
  assert.equal(asset.animatedObject.sprites.length,5);assert(Math.abs(asset.animatedObject.period-5/12)<1e-12);assert.deepEqual(asset.animatedObject.times,[0,1/12,2/12,3/12,4/12]);
  const source=asset.animatedObject.source,controller=source.find(c=>c.__type__==='cc.Animation');assert(controller.playOnLoad);assert.equal(source.filter(c=>c.__type__==='cc.Sprite').length,5);
  assert(source.every(c=>['cc.Prefab','cc.Node','cc.Sprite','cc.Animation'].includes(c.__type__)));assert.equal(source[1]._components.length,1);
  for(const sprite of asset.animatedObject.sprites)assert(index.images[sprite.frame]);
 }
});
test('placing animated objects only changes a cloned draft and shares immutable source data while preserving transforms',()=>{
 const original=M.createMap('water','Water','forest');original.future={keep:1};original.layers[0].transform={x:70,y:-30,scale:.5,angle:35};const before=JSON.stringify(original);
 const first=M.place(original,original.layers[0].id,assets[0],{x:100,y:200},1,2,.5),second=M.place(first.map,original.layers[0].id,assets[0],{x:120,y:220},1,1,0);
 assert.equal(JSON.stringify(original),before);assert.equal(first.object.scale,1.5);assert(!first.object.assetId);assert.equal(first.object.depth,'ground');
 const world=M.toWorld(first.map.layers[0].transform,first.object);assert(Math.abs(world.x-100)<1e-9&&Math.abs(world.y-200)<1e-9);
 assert.equal(Object.keys(second.map.legacySources).length,1);assert.notEqual(first.object.id,second.object.id);assert.deepEqual(second.map.future,{keep:1});
 second.object.legacy.sprites[0].matrix[4]=999;assert.notEqual(first.object.legacy.sprites[0].matrix[4],999);assert.notEqual(assets[0].animatedObject.sprites[0].matrix[4],999);
 assert.deepEqual(M.validateMap(first.map,table),[]);
 assert.throws(()=>M.placeGroundImage(original,'foundation',assets[0],{x:0,y:0}),/Objects tab/);assert.equal(JSON.stringify(original),before);
});
test('native export preserves looping animations below units and carries no river painting, blockers or legacy gameplay scripts',()=>{
 for(const asset of assets){
  const map=M.createMap('native','Native','forest'),placed=M.place(map,map.layers[0].id,asset,{x:170,y:-90},1,1,0);placed.object.angle=32;placed.object.flipX=true;
  const before=JSON.stringify(placed.map),output=P.skeleton('Native',placed.map);P.addEnvironment(root,output,placed.map,{ground:[],assets:{}});
  const nodes=output.filter(n=>n.__type__==='cc.Node'),owner=nodes.find(n=>n._name===asset.name),parent=output[owner._parent.__id__],animation=output.find(n=>n.__type__==='cc.Animation'),terrain=output.find(n=>n.__type__===L.script(root,'MapTerrainLayer'));
  assert.equal(parent._name,'ndDown');assert.equal(owner._children.length,5);assert(animation.playOnLoad);assert.deepEqual(animation._defaultClip,asset.animatedObject.source.find(c=>c.__type__==='cc.Animation')._defaultClip);
  assert.equal(terrain.groundOnly,true);assert.equal(output.filter(n=>n.__type__==='cc.Sprite').length,5);assert(!output.some(n=>(n.__type__||'').startsWith('cc.Physics')));assert(!output.some(n=>n.__type__===L.script(root,'KinghtFallBuildObstacle')));assert.equal(JSON.stringify(placed.map),before);
 }
});
test('animation data survives JSON round trips, duplication and portable scenery groups without its library preset',()=>{
 const empty=M.createMap('round-trip','Round trip','ice'),first=M.place(empty,empty.layers[0].id,assets[1],{x:80,y:90},1,1,0),reopened=JSON.parse(JSON.stringify(first.map));
 const copies=M.duplicateObjects(reopened,[first.object.id]);assert.equal(copies.ids.length,1);assert.deepEqual(copies.map.layers[0].objects[1].spriteAnimation,first.object.spriteAnimation);
 const group=Groups.capture(reopened,[first.object.id],{name:'Stream'},table),target=M.createMap('target','Target','desert'),stamped=Groups.stamp(target,group.group,group.sources,{x:0,y:0},.7,90);
 assert.deepEqual(M.validateMap(stamped.map,{}),[]);assert.equal(stamped.map.layers.at(-1).objects[0].animationPreset,assets[1].id);
 const output=P.skeleton('Target',stamped.map);P.addEnvironment(root,output,stamped.map,{ground:[],assets:{}});assert.equal(output.filter(n=>n.__type__==='cc.Animation').length,1);
});
test('editor preview selects one ripple frame per tick, wraps at the authored period and leaves snapshots unchanged',()=>{
 const empty=M.createMap('preview','Preview','forest'),placed=M.place(empty,empty.layers[0].id,assets[0],{x:0,y:0},1,1,0),object=placed.object,before=JSON.stringify(placed.map);
 const images=Object.fromEntries(object.legacy.sprites.map(s=>[s.frame,{image:{id:s.frame},width:s.width,height:s.height}]));
 const calls=[],ctx={globalAlpha:1,save(){},restore(){},transform(){},translate(){},scale(){},drawImage(image){calls.push(image.id);}};
 for(let frame=0;frame<5;frame++){calls.length=0;Paint.object(ctx,object,placed.map.layers[0],images,frame/12+1e-6);assert.deepEqual(calls,[object.legacy.sprites[frame].frame]);}
 assert.equal(Paint.animationFrame(object,5/12+1e-6),0);assert.equal(Paint.animationFrame({},10),-1);assert.equal(JSON.stringify(placed.map),before);
});
