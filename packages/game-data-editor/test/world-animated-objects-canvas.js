'use strict';
// Real client fixture. Palette assets are supplied by the host; drafts and
// explicit saves stay in memory and no production map is an IPC target.
const Client=require('../worlds/client'),M=require('../worlds/model');
function mount(host,input){
 const map=M.createMap('water-animation-check','Water animation check','forest');map.size={width:1100,height:1900};map.playable={width:1000,height:1800};
 const tile=document.createElement('canvas');tile.width=tile.height=16;const ctx=tile.getContext('2d');ctx.fillStyle='#258bb1';ctx.fillRect(0,0,16,16);
 const water={id:'fixture-water',name:'Water foundation',category:'field',biomes:M.BIOMES,width:16,height:16,anchor:{x:.5,y:.5},url:tile.toDataURL()};map.ground.foundation.baseAsset=water.id;
 const library=input.assets.concat(water),images=input.images,calls=[],undo=[],redo=[];let value=map,saved=M.clone(value),version=1,client;
 const collections=()=>({groups:[],favorites:[],dirty:false,canUndo:false,canRedo:false});
 const snapshot=()=>({key:'map:'+map.id,version,value:M.clone(value),dirty:JSON.stringify(saved)!==JSON.stringify(value),canUndo:undo.length>0,canRedo:redo.length>0,issues:[],affected:[],collections:collections()});
 async function ipc(name,request){
  calls.push(name);
  if(name==='world-catalog')return{version,maps:[{id:map.id,name:map.name,biome:map.biome}],stages:[],library,images,collections:collections(),recovery:false};
  if(name==='world-load'||name==='world-refresh')return snapshot();
  if(!['world-change','world-undo','world-redo','world-save'].includes(name))throw Error('Unexpected animation fixture IPC '+name);
  if(request.version!==version||request.key!=='map:'+map.id)throw Error('Animation fixture revision changed.');
  if(name==='world-change'){undo.push(M.clone(value));value=M.clone(request.value);redo.length=0;}
  if(name==='world-undo'&&undo.length){redo.push(M.clone(value));value=undo.pop();}
  if(name==='world-redo'&&redo.length){undo.push(M.clone(value));value=redo.pop();}
  if(name==='world-save')saved=M.clone(value);version++;return{...snapshot(),result:name==='world-save'?{saved:true,files:['in-memory-map.json']}:undefined};
 }
 function start(){client=Client.mount(host,{kind:'maps',mapId:map.id,ipc});}start();
 return{get client(){return client;},get state(){return client._state;},get value(){return value;},get saved(){return saved;},calls,async reopen(){client.destroy();value=M.clone(saved);undo.length=redo.length=0;start();await client.ready;},destroy(){client.destroy();}};
}
module.exports={mount};
