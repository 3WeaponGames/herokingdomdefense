'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const scripts=path.resolve(__dirname,'../../assets/_script');
function fixture(segmented=false){
 const state={now:100000,enabled:true,intervals:[],hides:[],requests:[],storage:new Map(),throws:false,failLocal:false};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[state.now]));}static now(){return state.now;}}
 const modules={CacheUtils:{CacheUtils:{getData:key=>state.storage.get(key),saveData(key,value){if(state.failLocal)return false;state.storage.set(key,value);return true;},removeData:key=>state.storage.delete(key)}},Config:{GameConfig:{AppCacheName:'test',WebCacheName:'web'}},PlatformManager:{PlatformManager:{currentPlatform:0}},BasePlatform:{Platform:{WECHAT:1,WEB_LINK:2}},Utils:{Utils:{renameObjectKeys:x=>x,restoreObjectKeys:x=>x}},EventMgr:{EventMgr:{getInstance:()=>({on(){},emit(){}})}},ServerDataMgr:{ServerdataMgr:{getDataByKey:()=>null,getNeedSaveServer:()=>state.enabled,saveData(key,value,done){state.requests.push({key,value:JSON.parse(value),done});if(state.throws)throw Error('adapter dispatch failed');}}}};
 function load(name){if(modules[name])return modules[name];const context={exports:{},require:load,Date:Clock,console:{error(){}},setInterval:fn=>state.intervals.push(fn),cc:{game:{EVENT_HIDE:'hide',on:(_event,fn)=>state.hides.push(fn)}},__extends:(C,B)=>{Object.setPrototypeOf(C,B);C.prototype=Object.create(B.prototype);C.prototype.constructor=C;}};vm.runInNewContext(fs.readFileSync(path.join(scripts,name+'.js'),'utf8'),context);return modules[name]=context.exports;}
 const C=segmented?load('SegBaseData').SegBaseData:load('BaseData').BaseData,record=new C();record.gameKey='progress';record.ListName='list';record.createData=()=>segmented?{maxNum:0,list:[{gold:1}],future:'preserved'}:{gold:1,future:'preserved'};record.getData();
 function mutate(value,replace=false){if(segmented){if(replace)record.data={...record.data,list:[{gold:value}]};else record.data.list[0].gold=value;}else if(replace)record.data={...record.data,gold:value};else record.data.gold=value;return record.saveData();}
 return {record,state,mutate,read:request=>segmented?request.value.list[0].gold:request.value.gold,dirty:()=>segmented?record.saveMap.size>0:record.isneedSave,
 tick(seconds){for(let i=0;i<seconds;i++){state.now+=1000;state.intervals.forEach(fn=>fn());}},hide(){state.hides.forEach(fn=>fn());},reload(){if(segmented)record.loadlocaldata(false);else record.loaddata(null,record.gameKey);}};
}
for(const segmented of [false,true]){
 const kind=segmented?'segmented':'single';
 test(kind+' terminal cloud failure retries while idle, respecting delay even after hide',()=>{
  const f=fixture(segmented);f.mutate(2);assert.equal(f.state.requests.length,1);f.state.requests[0].done(null,Error('terminal failure'));assert(f.dirty());
  for(let i=0;i<9;i++){f.hide();f.tick(1);}assert.equal(f.state.requests.length,1);f.tick(1);assert.equal(f.state.requests.length,2);assert.equal(f.read(f.state.requests[1]),2);
  f.state.requests[1].done({ok:true});assert(!f.dirty());f.tick(100);f.hide();assert.equal(f.state.requests.length,2);
 });
 for(const firstFails of [false,true])test(kind+' acknowledgement races retain the newest durable record ('+(firstFails?'error':'success')+')',()=>{
  const f=fixture(segmented);f.mutate(2);const old=f.state.requests[0];f.mutate(3,true);f.tick(40);assert.equal(f.state.requests.length,1,'concurrent upload escaped in-flight ownership');
  old.done(firstFails?null:{ok:true},firstFails?Error('offline'):undefined);f.tick(10);assert.equal(f.state.requests.length,2);const next=f.state.requests[1];assert.equal(f.read(next),3);assert.equal(next.value.future,'preserved');
  old.done(null,Error('duplicate obsolete callback'));next.done({ok:true});f.tick(100);assert.equal(f.state.requests.length,2);assert(!f.dirty());
 });
 for(const action of ['clear','reload'])test(kind+' '+action+' invalidates old failures without canceling a newer save',()=>{
  const f=fixture(segmented);f.mutate(2);const old=f.state.requests[0];if(action==='clear')f.record.clearData();else f.reload();
  old.done(null,Error('obsolete'));assert(!f.dirty());f.tick(40);assert.equal(f.state.requests.length,1);
  f.mutate(9,true);f.tick(10);assert.equal(f.state.requests.length,2);old.done(null,Error('duplicate obsolete'));f.state.requests[1].done({ok:true});f.tick(100);assert.equal(f.state.requests.length,2);assert(!f.dirty());
 });
 test(kind+' denied/paused cloud and repeated terminal failures cannot hot-loop',()=>{
  const f=fixture(segmented);f.mutate(2);f.state.requests[0].done(false);f.state.enabled=false;f.tick(100);f.hide();assert.equal(f.state.requests.length,1);
  f.state.enabled=true;f.record.pause=true;f.tick(100);assert.equal(f.state.requests.length,1);f.record.pause=false;f.state.throws=true;f.tick(100);
  assert(f.state.requests.length>=2&&f.state.requests.length<=11);assert(f.dirty());assert.equal(f.record.localSavePending,false);
 });
 test(kind+' a terminal error never uploads a local write that failed durability',()=>{
  const f=fixture(segmented);f.mutate(2);f.state.failLocal=true;assert.equal(f.mutate(3),false);f.state.requests[0].done(null,Error('offline'));f.tick(100);assert.equal(f.state.requests.length,1);
  f.state.failLocal=false;f.tick(1);assert.equal(f.state.requests.length,2);assert.equal(f.read(f.state.requests[1]),3);
 });
}
test('Segment uploads retry independently and preserve latest tail/unknown fields',()=>{
 const f=fixture(true);f.record.data.list=Array.from({length:31},(_,gold)=>({gold}));f.record.segmentRecords.set(1,{futureTail:{keep:true}});f.record.saveData(-1);assert.equal(f.state.requests.length,2);
 const head=f.state.requests.find(x=>x.key==='progress0'),tail=f.state.requests.find(x=>x.key==='progress1');head.done({ok:true});tail.done(null,Error('tail offline'));
 f.record.data.list[30].gold=99;f.record.saveData(1);f.tick(10);assert.equal(f.state.requests.length,3);const retry=f.state.requests[2];assert.equal(retry.key,'progress1');assert.equal(retry.value.list[0].gold,99);assert.equal(retry.value.futureTail.keep,true);retry.done({ok:true});f.tick(40);assert.equal(f.state.requests.length,3);
});
