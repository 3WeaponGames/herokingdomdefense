'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const temporary=require('./owned-temp'),Service=require('../worlds/service').Service;

test('saved building skin changes refresh previews without replacing cached authoring data or unsaved drafts',()=>{
 const folder=temporary('hkd-building-source-refresh-'),root=path.join(folder,'project');
 const write=(variant,value)=>{const file=path.join(root,'assets/KinghtFallConfig'+(variant==='A'?'':variant)+'/GameJsonCfg.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));return file;};
 const saved={BuildEnum:{1:{levelList:[{Skin:'cb-1',Hp:500,future:{keep:true}}]},6:{levelList:[{Skin:'cq-1'}]}}},file=write('A',saved);write('B',{SoldierCfg:{}});write('D',{BuildEnum:{1:{levelList:[{Skin:'variant-castle'}]}}});
 const service=new Service(root,{artifacts:path.join(folder,'recovery')}),cached={documents:{A:JSON.parse(JSON.stringify(saved))}};
 service.indexData=cached;service.version=9;service.docs={'stage:A-1':{data:{hero:{x:17,y:23},future:{keep:'draft'}},original:{hero:{x:0,y:0}}}};service.undo=[{key:'stage:A-1',before:'retained'}];
 const before=JSON.stringify({cached,docs:service.docs,undo:service.undo}),first=service.previewConfig('A');assert.equal(first.BuildEnum[1].levelList[0].Skin,'cb-1');assert.strictEqual(service.previewConfig('A'),first);
 saved.BuildEnum[1].levelList[0].Skin='cb-rts-1';saved.BuildEnum[6].levelList[0].Skin='cq-rts-1';write('A',saved);const bytes=fs.readFileSync(file),updated=service.previewConfig('A');
 assert.notStrictEqual(updated,first);assert.equal(updated.BuildEnum[1].levelList[0].Skin,'cb-rts-1');assert.equal(updated.BuildEnum[6].levelList[0].Skin,'cq-rts-1');assert.strictEqual(service.previewConfig('A'),updated);assert.strictEqual(service.previewConfig('B'),updated,'variants without their own buildings use the current A configuration');assert.equal(service.previewConfig('D').BuildEnum[1].levelList[0].Skin,'variant-castle');
 assert.strictEqual(service.indexData,cached);assert.equal(service.version,9);assert.equal(JSON.stringify({cached,docs:service.docs,undo:service.undo}),before);assert.deepEqual(fs.readFileSync(file),bytes);assert(!fs.existsSync(service.recovery),'previewing cannot write draft recovery or gameplay data');
});

const client=fs.readFileSync(path.join(__dirname,'../worlds/client.js'),'utf8'),sharedChange=client.slice(client.indexOf(' function changed(){'),client.indexOf(' async function save(){'));
for(const changed of [true,false])test('shared stage refresh '+(changed?'accepts changed artwork':'reuses unchanged artwork')+' at the same authoring version without edit or save requests',async()=>{
 const value={id:'A-1',mapId:'Map01',hero:{x:12,y:34},future:{keep:true}},before=JSON.stringify(value),snapshot={version:7,key:'stage:A-1',value,dirty:true,buildingPreview:{revision:'old-art'}},next={...snapshot,buildingPreview:{revision:changed?'new-art':'old-art'}},calls=[];
 const context={layerTreeDrag:null,state:{closed:false,active:true,snap:snapshot},stageMode:true,sharedScheduled:false,pendingShared:false,currentKey:()=>snapshot.key,currentContext:()=>({key:snapshot.key}),isCurrent:()=>true,
  options:{async ipc(name,request){calls.push(name);if(name==='world-load')return request.key.startsWith('stage:')?next:{value:{id:'Map01'}};if(name==='world-catalog')return {};throw Error('Unexpected write/operation: '+name);}},
  enqueue(fn){context.pending=fn();return context.pending;},readPlacementUpdate:async()=>null,applyPlacementUpdate(){},syncCatalog(){},setMap(){},apply(result){context.applied=result;context.state.snap=result;}};
 vm.createContext(context);vm.runInContext(sharedChange,context);context.changed();await context.pending;
 assert.equal(!!context.applied,changed);assert.equal(context.state.snap.version,7);assert.equal(context.state.snap.dirty,true);assert.equal(JSON.stringify(context.state.snap.value),before);assert.equal(context.sharedScheduled,false);assert(calls.every(name=>['world-load','world-catalog'].includes(name)));assert.equal(calls.filter(name=>name==='world-catalog').length,changed?1:0);
});
