'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm');
const {Store,files,hash}=require('../lib/store');
const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
const temporary=[];
function fixture(){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-main-save-'));temporary.push(root);
    const data={A:{value:1},B:{value:1},D:{value:1},catalog:{entries:{hello:{en:'Hello'}}}};
    Object.keys(files).forEach(id=>{const file=path.join(root,files[id]);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data[id])+'\n');});
    const store=new Store(root),imports=[],broadcasts=[],timers=new Map(),module={exports:{}};let timerId=0;
    const editor={Project:{path:root},Ipc:{sendToAll:(...args)=>broadcasts.push(args)},assetdb:{refresh:(url,callback)=>imports.push({url,callback})}};
    // Exercise the real disk transaction through the main-process IPC handler.
    // Domain validation has its own suites; this fixture focuses on post-save
    // Creator import, reply lifetime and concurrent draft preservation.
    vm.runInNewContext(source,{module,Editor:editor,require:name=>name==='./lib/store'?{Store:class{constructor(){return store;}}}:require(name),setTimeout:(callback,ms)=>{const id=++timerId;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id)},{filename:'game-data-editor/main.js'});
    const api=module.exports;
    function invoke(action,request){const replies=[];let resolve;const result=new Promise(r=>{resolve=r;});api.messages[action]({reply:(error,value)=>{replies.push({error,value});resolve({error,value});}},request);return{result,replies};}
    function expire(){const active=Array.from(timers.values());assert(active.length,'Expected an import deadline');active.forEach(timer=>{assert.equal(timer.ms,10000);timer.callback();});}
    function edit(doc,value){store.change({version:store.version,edits:[{doc,path:['value'],value}]});}
    return{root,store,editor,imports,broadcasts,timers,invoke,expire,edit,read:id=>fs.readFileSync(path.join(root,files[id]),'utf8')};
}
let checks=0;
async function test(name,run){await run();checks++;console.log('PASS '+name);}
(async()=>{
    await test('committed save replies after a single 10-second import deadline and ignores late callbacks',async()=>{
        const f=fixture();f.edit('A',2);f.edit('B',3);
        const call=f.invoke('save',{version:f.store.version});
        assert.equal(JSON.parse(f.read('A')).value,2);assert.equal(JSON.parse(f.read('B')).value,3);
        assert.equal(f.imports.length,2);assert.equal(f.timers.size,1,'One deadline covers the whole import batch');assert.equal(call.replies.length,0);
        f.expire();const reply=await call.result;
        assert.ifError(reply.error);assert(reply.value.result.saved);assert(reply.value.result.warning.includes('within 10 seconds'));assert(reply.value.result.warning.includes(files.A));assert(reply.value.result.warning.includes(files.B));assert.equal(reply.value.dirty,false);assert.equal(f.timers.size,0);assert.equal(f.broadcasts.length,1);
        f.imports.forEach(item=>{item.callback();item.callback(Error('late import failure'));});await Promise.resolve();
        assert.equal(call.replies.length,1);assert.equal(f.broadcasts.length,1);assert.equal(f.timers.size,0);assert.equal(JSON.parse(f.read('A')).value,2);
    });
    await test('successful imports finish immediately and clear their deadline',async()=>{
        const f=fixture();f.edit('A',2);const call=f.invoke('save',{version:f.store.version});f.imports[0].callback();const reply=await call.result;
        assert.ifError(reply.error);assert(reply.value.result.saved);assert.equal(reply.value.result.warning,undefined);assert.equal(f.timers.size,0);assert.equal(call.replies.length,1);
    });
    await test('import callback errors and synchronous throws remain warnings after a successful disk save',async()=>{
        const f=fixture();f.edit('A',2);f.edit('B',3);
        f.editor.assetdb.refresh=(url,callback)=>{if(url==='db://'+files.A)throw Error('asset database offline');callback('import rejected');};
        const reply=await f.invoke('save',{version:f.store.version}).result;
        assert.ifError(reply.error);assert(reply.value.result.saved);assert(reply.value.result.warning.includes('asset database offline'));assert(reply.value.result.warning.includes('import rejected'));assert.equal(f.timers.size,0);assert.equal(JSON.parse(f.read('A')).value,2);assert.equal(JSON.parse(f.read('B')).value,3);
    });
    await test('a draft created in another panel while importing survives the save reply',async()=>{
        const f=fixture();f.edit('A',2);const call=f.invoke('save',{version:f.store.version});f.edit('B',9);const version=f.store.version;f.imports[0].callback();const reply=await call.result;
        assert.ifError(reply.error);assert(reply.value.result.saved);assert(reply.value.dirty);assert.equal(reply.value.version,version);assert.equal(reply.value.documents.B.data.value,9);assert.equal(JSON.parse(f.read('B')).value,1);assert.equal(reply.value.changes.length,1);assert.equal(reply.value.changes[0].doc,'B');
    });
    await test('a no-change Save makes no import request, timer or backup',async()=>{
        const f=fixture(),before=f.read('A');const reply=await f.invoke('save',{version:f.store.version}).result;
        assert.ifError(reply.error);assert(reply.value.result.noChanges);assert.equal(f.imports.length,0);assert.equal(f.timers.size,0);assert.equal(f.read('A'),before);assert(!fs.existsSync(path.join(f.root,'local')));
    });
    await test('recovery also reports completed disk recovery when Creator import stalls',async()=>{
        const f=fixture(),before=f.read('A'),after=before.replace('1','2'),id='interrupted-fixture',folder=path.join(f.root,'local/game-data-editor/backups',id);
        fs.mkdirSync(path.dirname(path.join(folder,files.A)),{recursive:true});fs.writeFileSync(path.join(folder,files.A),before);fs.writeFileSync(path.join(f.root,files.A),after);fs.writeFileSync(path.join(folder,'transaction.json'),JSON.stringify({status:'prepared',files:[{path:files.A,before:hash(before),after:hash(after)}]}));
        const call=f.invoke('recover',{version:f.store.version,id});assert.equal(f.read('A'),before);f.expire();const reply=await call.result;
        assert.ifError(reply.error);assert(reply.value.result.recovered);assert(reply.value.result.warning.startsWith('Recovered on disk;'));assert(reply.value.result.warning.includes('within 10 seconds'));assert.equal(f.timers.size,0);assert.equal(call.replies.length,1);assert.equal(reply.value.recoveries.length,0);
    });
    console.log(checks+' main-process save/import checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
    temporary.forEach(root=>{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));assert(path.basename(root).startsWith('hkd-main-save-'));fs.rmSync(root,{recursive:true,force:true});});
});
