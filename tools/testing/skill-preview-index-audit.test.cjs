'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Assets=require('../../packages/game-data-editor/lib/unit-assets');
const temporary=require('../../packages/game-data-editor/test/owned-temp');

test('Spine-only preview indexing avoids image metadata and leaves the full public index intact',()=>{
 const root=temporary('hkd-skill-preview-index-'),assets=path.join(root,'assets');fs.mkdirSync(assets);
 const spine=path.join(assets,'hero.json'),image=path.join(assets,'hero.png');
 fs.writeFileSync(spine+'.meta',JSON.stringify({uuid:'spine'}));fs.writeFileSync(image+'.meta',JSON.stringify({uuid:'image'}));
 const read=fs.readFileSync,reads=[];fs.readFileSync=function(file,...args){reads.push(String(file));return read.call(this,file,...args);};
 try{
  Assets.invalidate();const preview=Assets.index(root,true);assert.deepEqual(preview.uuids,{spine});assert.equal(reads.length,1);assert.match(reads[0],/\.json\.meta$/);
  reads.length=0;assert.equal(Assets.index(root,true),preview);assert.equal(reads.length,0);
  const full=Assets.index(root);assert.deepEqual(full.uuids,{spine,image});assert.equal(reads.length,2);assert.deepEqual(full.files,preview.files);
  fs.writeFileSync(spine+'.meta',JSON.stringify({uuid:'replacement'}));Assets.invalidate();assert.deepEqual(Assets.index(root,true).uuids,{replacement:spine});assert.deepEqual(Assets.index(root).uuids,{replacement:spine,image});
 }finally{fs.readFileSync=read;Assets.invalidate();}
});

test('static preview requests never enumerate unrelated assets',()=>{
 const root=temporary('hkd-skill-static-preview-'),read=fs.readdirSync;fs.readdirSync=()=>{throw Error('Unrelated asset enumeration');};
 try{const result=Assets.describe(root,{type:'building',id:'1',documents:{A:{data:{}}},record:{levelList:[]},noRuntime:true});assert.equal(result.image,null);assert.deepEqual(result.layers,[]);}finally{fs.readdirSync=read;Assets.invalidate();}
});
