'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
  const storage=new Map(),events=[],modules={Config:{GameConfig:{AppCacheName:'test'}},PlatformManager:{PlatformManager:{currentPlatform:'web'}},BasePlatform:{Platform:{WECHAT:'wx',BYTEDANCE:'tt',WEB_LINK:'link'}},ServerDataMgr:{ServerdataMgr:{getNeedSaveServer:()=>false}},EventMgr:{EventMgr:{getInstance:()=>({emit:(...args)=>events.push(args)})}}};
  const math=Object.create(Math);math.random=()=>.123456789;
  function load(name){if(modules[name])return modules[name];const context={exports:modules[name]={},require:load,Math:math,Date,console:{error(){},warn(){}},localStorage:{setItem:(key,value)=>storage.set(key,value),getItem:key=>storage.get(key)||null},cc:{game:{on(){}}},__extends(C,B){Object.setPrototypeOf(C.prototype,B.prototype);}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script',name+'.js'),'utf8'),context,{filename:name});return context.exports;}
  return{load,storage,events};
}
test('encrypted ASCII JSON preserves its exact legacy cipher bytes with the same random salt',()=>{
  const h=fixture(),utils=h.load('Utils').Utils,cache=h.load('CacheUtils').CacheUtils,text='{"name":"Soren","future":{"keep":true}}';
  assert.equal(cache.saveDataEncrypt('record',text,'SFPLAY'),true);assert.equal(h.storage.get('record'),utils.encrypt(text,'SFPLAY'));
  assert.equal(cache.getDataDecrypt('record','SFPLAY'),text);
});
test('optional encrypted records preserve Unicode player and unknown fields without changing the legacy reader',()=>{
  const h=fixture(),Base=h.load('BaseData').BaseData,record=new Base();record.gameKey='record';record.ecrypt=true;
  record.data={name:'Søren 王国 🙂',future:{text:'日本語 / Ελληνικά',nested:['汉字','🚀']}};assert.equal(record.saveData(),true);
  const decoded=record.readSaveRecord(h.storage.get('record'),'record','local',true);assert.equal(decoded.name,record.data.name);assert.equal(decoded.future.text,record.data.future.text);assert.deepEqual(Array.from(decoded.future.nested),record.data.future.nested);
  assert.equal(h.load('CacheUtils').CacheUtils.getDataDecrypt('record','SFPLAY').includes('\\u'),true);
});
test('segmented encrypted JSON preserves Unicode in head and tail chunks',()=>{
  const h=fixture(),Segment=h.load('SegBaseData').SegBaseData,record=new Segment();record.gameKey='chunks';record.ecrypt=true;record.ListName='items';record.len=2;
  const names=['王国','🙂','Ελληνικά','漢字','🚀'];record.data={items:names.map((name,id)=>({id,name})),maxNum:0,future:{label:'未知'}};assert.equal(record.saveData(-1),true);
  const head=record.readSegment(h.storage.get('chunks0'),'chunks0','local',0),tail1=record.readSegment(h.storage.get('chunks1'),'chunks1','local',1),tail2=record.readSegment(h.storage.get('chunks2'),'chunks2','local',2);
  assert.equal(head.future.label,'未知');assert.deepEqual(Array.from(head.items).concat(Array.from(tail1.list),Array.from(tail2.list)).map(row=>row.name),names);
});
