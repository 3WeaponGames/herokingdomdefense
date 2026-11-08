'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),url=require('url'),B=require('../worlds/baker'),M=require('../worlds/model'),temporary=require('./owned-temp');
function fixture(){
 const root=temporary('hkd-bake-sources-'),file=path.join(root,'source.png');fs.writeFileSync(file,'original source');
 const map=M.createMap('source-audit','Source audit','forest');map.ground.foundation.baseAsset='source';
 return {root,file,map,library:[{id:'source',url:url.pathToFileURL(file).href,width:16,height:16}]};
}
const empty=()=>({files:[],assets:{},ground:[]});
test('bake detects source image changes and removals while rendering without publishing output',async()=>{
 for(const operation of ['change','delete']){
  const f=fixture();
  await assert.rejects(B.bake(f.root,f.map,f.library,{render:async()=>{if(operation==='change')fs.writeFileSync(f.file,'new source');else fs.unlinkSync(f.file);return empty();}}),/Source artwork changed during baking/);
  assert(!fs.existsSync(path.join(f.root,'assets')));
 }
});
test('bake detects frame metadata edits, creations and removals while rendering',async()=>{
 for(const operation of ['change','create','delete']){
  const f=fixture(),meta=f.file+'.meta';if(operation!=='create')fs.writeFileSync(meta,'original frame metadata');
  await assert.rejects(B.bake(f.root,f.map,f.library,{render:async()=>{if(operation==='delete')fs.unlinkSync(meta);else fs.writeFileSync(meta,'new frame metadata');return empty();}}),/Source artwork changed during baking/);
 }
});
test('unchanged file sources and in-memory image URLs bake without rewriting sources or altering data',async()=>{
 const f=fixture(),before=JSON.stringify(f.map),source=fs.readFileSync(f.file),result=await B.bake(f.root,f.map,f.library,{render:async()=>empty()});
 assert.deepEqual(result.writes,[]);assert.equal(JSON.stringify(f.map),before);assert(fs.readFileSync(f.file).equals(source));
 f.library[0].url='data:image/png;base64,fixture';assert.deepEqual((await B.bake(f.root,f.map,f.library,{render:async()=>empty()})).writes,[]);
});
