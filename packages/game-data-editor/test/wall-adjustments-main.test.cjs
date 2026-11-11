'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
const manifest=require('../package.json');
function fixture(service){
    const calls=[],imports=[],broadcasts=[],panels=[],unit={exports:{}},project=path.resolve(__dirname,'../../..');
    const Editor={Project:{path:project},Panel:{open:name=>panels.push(name)},Ipc:{sendToAll:(...args)=>broadcasts.push(args)},assetdb:{refresh:(url,done)=>{imports.push(url);done();}}};
    vm.runInNewContext(source,{module:unit,Editor,require:name=>{
        if(name==='./lib/store')return{Store:class{constructor(){throw Error('Wall adjustments must not open the gameplay data store');}}};
        if(name==='./walls/service')return Object.fromEntries(['load','preview','save'].map(action=>[action,(root,request)=>{calls.push({action,root,request});return service[action](root,request);} ]));
        return require(name);
    },setTimeout,clearTimeout},{filename:'game-data-editor/main.js'});
    const invoke=(name,request)=>new Promise((resolve,reject)=>unit.exports.messages[name]({reply:(error,value)=>error?reject(Error(String(error))):resolve(value)},request));
    return{api:unit.exports,Editor,calls,imports,broadcasts,panels,project,invoke};
}
test('Wall adjustments is a standalone Tools panel and opening it does not instantiate gameplay authoring services',()=>{
    const f=fixture({});
    assert.equal(manifest['main-menu']['Tools/Hero Kingdom Defense/Wall adjustments'].message,'game-data-editor:open-wall-adjustments');
    f.api.messages['open-wall-adjustments']();
    assert.deepEqual(f.panels,['hkd-wall-adjustments']);
    assert.deepEqual(f.calls,[]);assert.deepEqual(f.imports,[]);assert.deepEqual(f.broadcasts,[]);
});
test('loading and previewing route only to the read-only wall service with the caller draft intact',async()=>{
    const value={revision:'before',data:{version:1,poses:{}}},request={tier:2,face:'NW',state:'inward',data:{version:1,poses:{'2/NW/inward':{pieces:{'door:near':{x:1,y:2}}}}}};
    const f=fixture({load:()=>value,preview:(_root,draft)=>({draft})});
    assert.equal(await f.invoke('wall-adjustments-load'),value);
    assert.equal((await f.invoke('wall-adjustments-preview',request)).draft,request);
    assert.equal(f.calls[0].root,f.project);assert.equal(f.calls[1].request,request);
    assert.deepEqual(f.imports,[]);assert.deepEqual(f.broadcasts,[]);
});
test('a no-change wall save performs no Creator imports or authoring notifications',async()=>{
    const value={revision:'same',data:{version:1,poses:{}},result:{saved:false,noChanges:true,files:[]}},f=fixture({save:()=>value});
    assert.equal(await f.invoke('wall-adjustments-save',{revision:'same',data:value.data}),value);
    assert.deepEqual(f.imports,[]);assert.deepEqual(f.broadcasts,[]);
});
test('an explicit wall save refreshes only the shared source script and notifies views after the commit',async()=>{
    const file='assets/_script/WallAdjustmentData.js',value={revision:'new',data:{version:1,poses:{}},result:{saved:true,files:[file]}},f=fixture({save:()=>value});
    assert.equal(await f.invoke('wall-adjustments-save',{revision:'old',data:value.data}),value);
    assert.deepEqual(f.imports,['db://'+file]);
    assert.deepEqual(f.broadcasts.map(row=>row[0]),['game-data-editor:wall-adjustments-changed','game-data-editor:world-changed']);
    assert.equal(f.broadcasts[0][1].revision,'new');
});
test('a conflicting wall save reports the conflict without importing or broadcasting',async()=>{
    const f=fixture({save:()=>{throw Error('The wall source changed on disk. Reload before saving.');}});
    await assert.rejects(f.invoke('wall-adjustments-save',{revision:'stale',data:{}}),/changed on disk/);
    assert.deepEqual(f.imports,[]);assert.deepEqual(f.broadcasts,[]);
});
