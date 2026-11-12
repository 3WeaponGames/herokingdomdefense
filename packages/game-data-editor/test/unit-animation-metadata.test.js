'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test');
const Assets=require('../lib/unit-assets');
const root=path.resolve(__dirname,'../../..'),file=path.join(root,'assets/resources/characters/catalog.json');
test('unit preview metadata reads saved unit/form/level animation speeds without changing source rigs or catalog bytes',()=>{
 const read=fs.readFileSync,bytes=read(file),catalog=JSON.parse(bytes);let speeds;
 fs.readFileSync=function(target,...args){if(path.resolve(String(target))===file){const text=JSON.stringify({...catalog,unitAnimationSpeeds:speeds});return args[0]==='utf8'?text:Buffer.from(text);}return read.call(this,target,...args);};
 const describe=request=>Assets.describe(root,{noRuntime:true,noShared:true,...request});
 try{
  const original=describe({type:'enemy',id:90001});assert.equal(original.unitAnimationSpeed,undefined);
  speeds={'enemy:90001:default':.7,'enemy:90011:2':0,'ally:90001:default':1.5,'ally:90001:level:2':0};
  const enemy=describe({type:'enemy',id:90001});assert.equal(enemy.unitAnimationSpeed,.7);assert.deepEqual(enemy.layers,original.layers);
  assert.equal(describe({type:'enemy',id:90002}).unitAnimationSpeed,undefined);assert.equal(describe({type:'enemy',id:90011}).unitAnimationSpeed,0);
  assert.equal(describe({type:'ally',id:90001,level:1}).unitAnimationSpeed,1.5);assert.equal(describe({type:'ally',id:90001,level:2}).unitAnimationSpeed,0);
  assert.equal(describe({type:'ally',id:90001}).unitAnimationSpeed,1.5);
  speeds={'enemy:90001:default':-1,'ally:90001:default':1.4,'ally:90001:level:2':'2'};assert.equal(describe({type:'enemy',id:90001}).unitAnimationSpeed,undefined);assert.equal(describe({type:'ally',id:90001,level:2}).unitAnimationSpeed,1.4);
 }finally{fs.readFileSync=read;}
 assert.deepEqual(read(file),bytes);
});
