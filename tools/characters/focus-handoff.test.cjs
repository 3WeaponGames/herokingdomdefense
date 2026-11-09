'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),clone=value=>JSON.parse(JSON.stringify(value));
const mainFile=path.join(root,'packages/hkd-characters/main.js'),mainSource=fs.readFileSync(mainFile,'utf8'),requireMain=createRequire(mainFile);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const calls={loads:0,units:0,opened:[],broadcasts:[],forwarded:[]},original={version:1,profiles:{guard:{name:'Unsaved guard',base:{type:'ally',id:'90001'},parts:[],unknown:{keep:true}}},assignments:{'ally:90001:default':'guard'}},units=[{type:'hero',id:'hero',key:'hero:hero:default'},{type:'ally',id:'90001',key:'ally:90001:default',levels:[1,2,3]},{type:'ally',id:'90002',key:'ally:90002:default',levels:[1,2,3]},{type:'enemy',id:'90001',key:'enemy:90001:default'}];
  let store;
  class Service{
    constructor(project){this.root=path.resolve(project);this.version=8;this.data=clone(original);store=this;}
    units(){calls.units++;return clone(units);}
    snapshot(){return{version:this.version,data:clone(this.data),savedData:{version:1,profiles:{},assignments:{}},dirty:true};}
    load(){calls.loads++;return{...this.snapshot(),units:clone(units),parts:[],sources:[]};}
    change(){throw Error('Focus must not stage data.');}save(){throw Error('Focus must not save data.');}discard(){throw Error('Focus must not discard data.');}
  }
  const editor={Project:{path:root},Panel:{open:async name=>calls.opened.push(name)},Ipc:{sendToAll:(...args)=>calls.broadcasts.push(args)},warn(){}};
  const context={module:{exports:{}},Editor:editor,require:name=>name==='./lib/service'?{Service}:requireMain(name)};
  vm.runInNewContext(mainSource,context,{filename:mainFile});const api=context.module.exports;
  const invoke=(name,request)=>new Promise(resolve=>api.messages[name]({reply:(error,value)=>resolve({error,value})},request));
  editor.Ipc.sendToMain=(message,request,callback)=>{calls.forwarded.push({message,request});assert.equal(message,'hkd-characters:focus');api.messages.focus({reply:callback},request);};
  return{api,editor,calls,invoke,original,get store(){return store;}};
}

test('cold Characters startup consumes the validated unit level through load without changing its shared draft',async()=>{
  const f=fixture(),focus=await f.invoke('focus',{type:'ally',id:90001,level:2,ignored:'discard'});assert.equal(focus.error,null);assert.equal(focus.value.focused,true);
  assert.deepEqual(f.calls.opened,['hkd-characters']);assert.equal(f.calls.broadcasts[0][0],'hkd-characters:focus-available');
  const loaded=await f.invoke('load');assert.deepEqual(clone(loaded.value.focus),{type:'ally',id:'90001',level:2,sequence:1});assert.equal((await f.invoke('take-focus')).value,null);
  assert.deepEqual(f.store.data,f.original);assert.equal(f.store.version,8);assert.equal(loaded.value.dirty,true);
});

test('mounted panels claim only the newest focus request without reloading or clearing draft history',async()=>{
  const f=fixture();await f.invoke('focus',{type:'ally',id:'90001',level:1});await f.invoke('focus',{type:'ally',id:'90002',level:3});
  const target=await f.invoke('take-focus');assert.deepEqual(clone(target.value),{type:'ally',id:'90002',level:3,sequence:2});assert.equal((await f.invoke('take-focus')).value,null);
  assert.equal(f.calls.loads,0);assert.deepEqual(f.store.data,f.original);assert.equal(f.store.version,8);
});

test('invalid focus targets neither open a panel nor replace an already queued valid target',async()=>{
  const f=fixture();await f.invoke('focus',{type:'ally',id:'90001',level:2});
  for(const request of [{type:'ally',id:'missing',level:1},{type:'ally',id:'90001',level:4},{type:'ally',id:'90001',level:'2'},{type:'enemy',id:'90001',level:1},{type:'hero',id:'hero',level:1}]){
    const result=await f.invoke('focus',request);assert.match(result.error,/existing character/);
  }
  assert.equal(f.calls.opened.length,1);assert.equal((await f.invoke('take-focus')).value.level,2);assert.deepEqual(f.store.data,f.original);
});

test('game-tools routes exact appearance targets through Characters validation and retains plain open behavior',async()=>{
  const f=fixture(),filename=path.join(root,'packages/game-data-editor/main.js'),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,Editor:f.editor,require:createRequire(filename),setTimeout,clearTimeout,process},{filename});
  const invoke=request=>new Promise(resolve=>module.exports.messages['open-characters']({reply:(error,value)=>resolve({error,value})},request));
  const target={type:'ally',id:'90002',level:3},focused=await invoke(target);assert.equal(focused.error,null);assert.equal(focused.value.focused,true);assert.deepEqual(f.calls.forwarded,[{message:'hkd-characters:focus',request:target}]);
  assert.equal((await f.invoke('take-focus')).value.level,3);const invalid=await invoke({...target,level:9});assert.match(invalid.error,/existing character level/);
  const opened=await invoke();assert.equal(opened.error,null);assert.equal(opened.value,true);assert.equal(f.calls.forwarded.length,2);assert.deepEqual(f.store.data,f.original);assert.equal(f.store.version,8);
});

test('a Characters panel claims notifications before or after ready without loading data again',async()=>{
  const filename=path.join(root,'packages/hkd-characters/panel.js'),calls=[],focused=[];let spec,pending={type:'ally',id:'90001',level:3};
  const client={focusUnit:async request=>focused.push(request),destroy:()=>calls.push('destroy')},Editor={Project:{path:root},Panel:{extend:value=>{spec=value;}},Ipc:{sendToMain(message,_payload,callback){calls.push(message);const value=pending;pending=null;callback(null,value);}},warn:message=>{throw Error(message);}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{Editor,require:name=>name==='./client'?{mount:()=>client}:name==='../game-data-editor/preview/spine-renderer'?{}:name==='../../assets/_script/CharacterPartsCore'?{}:require(name),__dirname:path.dirname(filename)},{filename});
  const panel=Object.assign({},spec,{$root:{}});panel.messages['hkd-characters:focus-available'].call(panel);assert.equal(calls.length,0);panel.ready();await tick();
  assert.deepEqual(focused,[{type:'ally',id:'90001',level:3}]);assert.deepEqual(calls,['hkd-characters:take-focus']);
  pending={type:'ally',id:'90002',level:1};panel.messages['hkd-characters:focus-available'].call(panel);await tick();assert.equal(focused[1].id,'90002');panel.close();
  panel.messages['hkd-characters:focus-available'].call(panel);await tick();assert.equal(focused.length,2);assert.equal(calls.filter(x=>x==='hkd-characters:load').length,0);
});
