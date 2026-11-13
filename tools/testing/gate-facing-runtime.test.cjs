'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),Module=require('node:module');
const root=path.resolve(__dirname,'../..'),Facing=require('../../assets/_script/GateFacing');
function fixture(){
 const made=[];
 class Data{
  constructor(){this.refs=0;this.destroyed=false;made.push(this);}
  addRef(){this.refs++;return this;}decRef(){this.refs--;if(this.refs===0)this.destroyed=true;return this;}
  getRuntimeData(){return {parsed:true};}destroy(){this.destroyed=true;}
 }
 const filename=path.join(root,'assets/_script/GateFacingRuntime.js'),unit=new Module(filename,module);unit.filename=filename;unit.paths=Module._nodeModulePaths(path.dirname(filename));
 unit.require=name=>name==='GateFacing'?Facing:name==='__gateFacingData'?Data:Module.prototype.require.call(unit,name);
 unit._compile('var sp={SkeletonData:require("__gateFacingData")};var cc={isValid:(v,strict)=>!!v&&!v.destroyed&&!(strict&&v.toDestroy)};\n'+fs.readFileSync(filename,'utf8'),filename);
 function source(){const data=new Data();data.skeletonJson={skins:[]};data.atlasText='authored atlas';data.textures=[{texture:'shared'}];data.textureNames=['gate.png'];data.scale=.5;data._uuid='original';data.name='Gate';data.addRef();return data;}
 return {unit,Data,made,source,component:data=>({node:{activeInHierarchy:true},skeletonData:data})};
}
// The adapter constructs public SkeletonData assets; only the engine object
// is mocked here. Actual transformed mesh/animation math has real-asset tests.
function load(){return fixture();}
test('legacy and southern gates keep their imported assets without creating variants',()=>{
 const f=load(),source=f.source(),owner={ndAniMain:f.component(source),wallFacing:''},before=f.made.length;
 for(const facing of ['',undefined,'SW','SE','invalid']){owner.wallFacing=facing;f.unit.exports.apply(owner);assert.equal(owner.ndAniMain.skeletonData,source);assert(!owner._gateFacingRuntime);}
 assert.equal(f.made.length,before);assert.equal(source.refs,1);
});
test('north-facing gates share atlas textures while owning isolated mirrored animation data and releasing it',()=>{
 const f=load(),L=require('../../packages/game-data-editor/worlds/legacy'),Units=require('../../packages/game-data-editor/lib/unit-assets'),sourcePrefab=L.inspect(root,'Map01'),ownerNode=sourcePrefab.info.owners.find(n=>n.slot===19),controller=sourcePrefab.data[ownerNode.ownerComponent],assetId=sourcePrefab.data[controller.ndAniMain.__id__]._N$skeletonData.__uuid__,json=JSON.parse(fs.readFileSync(Units.index(root).uuids[assetId],'utf8')),source=f.source();source.skeletonJson=json;
 const before=JSON.stringify(json),a={wallFacing:'NE',ndAniMain:f.component(source)},b={wallFacing:'NW',ndAniMain:f.component(source)};
 try{
  f.unit.exports.apply(a);f.unit.exports.apply(b);const one=a.ndAniMain.skeletonData,two=b.ndAniMain.skeletonData;
  assert.notStrictEqual(one,source);assert.notStrictEqual(one,two);assert.notEqual(one._uuid,two._uuid);assert.strictEqual(one.textures[0],source.textures[0]);assert.strictEqual(two.textures[0],source.textures[0]);assert.equal(one.atlasText,source.atlasText);assert.equal(one.scale,source.scale);
  assert.deepEqual(one.skeletonJson,Facing.mirrorJson(json));assert.equal(JSON.stringify(source.skeletonJson),before);assert.equal(source.refs,3);
  f.unit.exports.apply(a);assert.strictEqual(a.ndAniMain.skeletonData,one,'repeated level updates retain the same live mirrored asset');
  a.wallFacing='SW';f.unit.exports.apply(a);assert.strictEqual(a.ndAniMain.skeletonData,source);assert(one.destroyed);assert.equal(source.refs,2);
  f.unit.exports.dispose(b);assert.strictEqual(b.ndAniMain.skeletonData,source);assert(two.destroyed);assert.equal(source.refs,1);assert(!a._gateFacingRuntime&&!b._gateFacingRuntime);
 }finally{f.unit.exports.dispose(a);f.unit.exports.dispose(b);}
});

test('destroyed or pending child renderers release mirrored assets without reading their native skeleton property',()=>{
 for(const pending of [false,true]){const f=load(),L=require('../../packages/game-data-editor/worlds/legacy'),Units=require('../../packages/game-data-editor/lib/unit-assets'),prefab=L.inspect(root,'Map01'),node=prefab.info.owners.find(n=>n.slot===19),ctrl=prefab.data[node.ownerComponent],uuid=prefab.data[ctrl.ndAniMain.__id__]._N$skeletonData.__uuid__,source=f.source();source.skeletonJson=JSON.parse(fs.readFileSync(Units.index(root).uuids[uuid],'utf8'));const component=f.component(source),owner={wallFacing:'NE',ndAniMain:component};f.unit.exports.apply(owner);const clone=component.skeletonData;require('./component-lifetime-harness.cjs').protect(component,'skeletonData');if(pending)component.node.toDestroy=true;else{component.destroyed=true;component.node=null;}assert.doesNotThrow(()=>f.unit.exports.dispose(owner));assert(clone.destroyed);assert.equal(source.refs,1);assert.doesNotThrow(()=>f.unit.exports.dispose(owner));}
});
