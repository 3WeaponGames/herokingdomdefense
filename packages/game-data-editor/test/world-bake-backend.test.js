'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),M=require('../worlds/model'),B=require('../worlds/baker'),Terrain=require('../worlds/terrain'),Budget=require('../worlds/budget'),Runtime=require('../worlds/runtime-assets'),temporary=require('./owned-temp');
test('world backend: explicit refresh invalidates script UUID conversions for only its project',()=>{
 const L=require('../worlds/legacy'),roots=[temporary('hkd-script-cache-'),temporary('hkd-script-cache-')],first='11111111-2222-4333-a444-555555555555',second='aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeeee';
 const files=roots.map(root=>path.join(root,'assets/_script/MapTerrainLayer.js.meta'));for(const file of files){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({uuid:first}));}
 for(const root of roots)assert.equal(L.script(root,'MapTerrainLayer'),L.compress(first));
 for(const file of files)fs.writeFileSync(file,JSON.stringify({uuid:second}));
 L.invalidateScripts(roots[0]);assert.equal(L.script(roots[0],'MapTerrainLayer'),L.compress(second));assert.equal(L.script(roots[1],'MapTerrainLayer'),L.compress(first),'another project keeps its cached identity');L.invalidateScripts(roots[1]);
});

test('world backend: erase-only brush records never require source artwork',()=>{
 const map=M.createMap('erase','Erase','forest');map.ground.foundation.strokes.push({size:20,hardness:1,opacity:1,op:'erase',assetId:'removed-artwork',points:[{x:0,y:0}]});
 assert.deepEqual(M.validateMap(map,{}),[]);assert.deepEqual(Terrain.strokeAssets(map.ground.foundation.strokes[0]),[]);assert.deepEqual(B.spec('',map,[]).images,{});
});
test('world backend: sprite estimates count placements while sharing atlas textures',()=>{
 let map=M.createMap('budget','Budget','forest');const asset={id:'tree',name:'Tree',width:80,height:120,anchor:{x:.5,y:0},depth:'world'};map=M.createLayer(map,'Trees');
 for(let i=0;i<3;i++)map=M.place(map,map.layers[1].id,asset,{x:i*40,y:0},1,1,0).map;
 const budget=Budget.estimate(map,{tree:asset},{});assert.equal(budget.atlasPages,1);assert.equal(budget.sprites,3+budget.groundTextures);
});
test('world backend: runtime atlas dependencies import their PNG before the plist and prefab',()=>{
 const root=temporary('hkd-atlas-dependencies-'),assets=path.join(root,'assets'),png=path.join(assets,'texture.png'),plist=path.join(assets,'atlas.plist'),prefab=path.join(assets,'KinghtFallEnemy/unit.prefab');
 for(const [file,bytes,meta] of [[png,'image',{uuid:'texture'}],[plist,'plist',{uuid:'atlas',rawTextureUuid:'texture',subMetas:{frame:{uuid:'frame',rawTextureUuid:'texture'}}}],[prefab,JSON.stringify([{_spriteFrame:{__uuid__:'frame'}}]),{uuid:'unit'}]]){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);fs.writeFileSync(file+'.meta',JSON.stringify(meta));}
 const deps=Runtime.dependencies(root,['unit']);assert.deepEqual(deps.map(v=>v.file),[png,plist,prefab]);
});
