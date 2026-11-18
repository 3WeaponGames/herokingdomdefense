'use strict';
// Native DOM fixture: all edits, history and saves are isolated in memory.
const M=require('../worlds/model'),Client=require('../worlds/client');
const clone=M.clone;
function mount(host){
 const spawns=[1,2,3].map(id=>({id,name:'Spawn '+id,x:-160+id*40,y:180,enabled:true,radius:40,graphId:'route-a'}));
 const graphs=['route-a','route-b','route-c'].map((id,index)=>({id,name:'Path1_2_3',legacy:true,spawnIds:[1,2,3],entry:'start',nodes:[{id:'start',x:-140+index*90,y:180},{id:'goal',x:index*60,y:-120,goal:true}],edges:[{id:'edge',from:'start',to:'goal',weight:1}],future:{keep:index}}));
 function building(id,kind,name,x,y){return {id,kind,name,x,y,scale:1,angle:0,enabled:true,unlock:1,sprites:[],template:{prefab:'fixture',node:id,roots:[id]},future:{keep:true}};}
 let value={id:'A-1',variant:'A',level:1,name:'Card workflow',mapId:'Map01',hero:{x:0,y:-180},buildings:[building(1,1,'Main Hall 1',0,-100),building(7,2,'Tower 1',-100,30),building(12,4,'House 1',100,30)],specials:[],spawns,graphs,nextSpawn:4,nextBuilding:20,nextSpecial:1,config:{Level:1,Name:'Card workflow',WaveCfg:[{Wave:1,HealthCoefficient:1,AttackCoefficient:1,StartSliver:5,CommerceSliver:1,WaveReward:[],SpawnTimeline:[{id:'group',spawnId:1,unitId:1,count:3,startSeconds:0,intervalSeconds:1,routeGraphId:'route-a'}]}]}};
 let saved=clone(value),version=1,client;const undo=[],redo=[],calls=[];
 const map=M.createMap('Map01','Card test map','forest');map.size={width:600,height:700};map.playable={width:560,height:660};
 const palette=[{name:'Tower',kind:2},{name:'House',kind:4}].map((item,index)=>({catalogId:'fixture-'+index,name:item.name,variants:[{id:'default',label:item.name,placement:building(40+index,item.kind,item.name,0,0),preview:{levels:{},images:{}}}]}));
 function snapshot(key){const isStage=key.startsWith('stage:');return {key,version,value:clone(isStage?value:map),dirty:isStage&&JSON.stringify(value)!==JSON.stringify(saved),canUndo:isStage&&undo.length>0,canRedo:isStage&&redo.length>0,issues:[],affected:[],buildingPreview:{runtimePath:null,buildings:{},images:{},errors:[]}};}
 async function ipc(name,request){
  calls.push(name);
  if(name==='world-catalog')return {version,maps:[{id:map.id,name:map.name,biome:map.biome}],stages:[{id:value.id,variant:'A',level:1,name:value.name,mapId:map.id,waves:1}],library:[],images:{},buildingLooks:{},units:[{id:1,name:'Test enemy'}],interval:1,recovery:false,recoveries:[]};
  if(name==='world-buildings')return palette.map(item=>({...item.variants[0].placement,catalogId:item.catalogId}));
  if(name==='world-building-placements')return clone(palette);
  if(name==='world-load'||name==='world-refresh')return snapshot(request.key);
  if(['world-change','world-undo','world-redo','world-save','world-discard'].includes(name)){
   if(request.key!=='stage:A-1'||request.version!==version)throw Error('Stale stage card fixture revision.');
   if(name==='world-change'){undo.push(clone(value));value=clone(request.value);redo.length=0;}
   if(name==='world-undo'){if(undo.length){redo.push(clone(value));value=undo.pop();}}
   if(name==='world-redo'){if(redo.length){undo.push(clone(value));value=redo.pop();}}
   if(name==='world-save')saved=clone(value);
   if(name==='world-discard'){value=clone(saved);undo.length=redo.length=0;}
   version++;return {...snapshot(request.key),result:name==='world-save'?{saved:true,files:['memory-only-stage.json']}:undefined};
  }
  throw Error('Forbidden stage card fixture IPC: '+name);
 }
 function start(){client=Client.mount(host,{kind:'stages',ipc});}
 start();
 return {get client(){return client;},get state(){return client._state;},get value(){return value;},get saved(){return saved;},calls,async reopen(){client.destroy();value=clone(saved);undo.length=redo.length=0;start();await client.ready;return client;},destroy(){client.destroy();}};
}
module.exports={mount};
