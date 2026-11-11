'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const {Service}=require('../../packages/hkd-characters/lib/service'),{ItemsService}=require('../../packages/hkd-items/service');
const root=path.resolve(__dirname,'../..'),clone=value=>JSON.parse(JSON.stringify(value));
function fixture(t,itemMode=false){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-character-history-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const relative=itemMode?'assets/resources/hero-items/catalog.json':'assets/resources/characters/catalog.json',file=path.join(dir,relative);
 const part={id:'helmet',sprite:'helmet',layer:'model',slot:'head',bone:'root',x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,order:0,hideSlots:[],future:{retain:true}};
 const base=itemMode?{type:'item',id:'2:1'}:{type:'ally',id:'90001'},data={version:1,future:{value:1,list:['keep',3]},profiles:{guard:{name:'Guard',base,scale:1,parts:[part],unknown:{keep:13}}},assignments:{}};
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
 const store=itemMode?new ItemsService(dir):new Service(dir);
 store.assets=()=>({parts:[{id:'helmet'}]});
 store.units=()=>[{type:base.type,id:base.id,key:itemMode?'2:1':'ally:90001:default'}];
 store.describe=()=>({layers:[{uuid:'model',skins:['default'],json:{bones:[{name:'root'}],slots:[{name:'head'},{name:'body'}]}}]});
 return{dir,file,store,original:clone(data),bytes:fs.readFileSync(file),mtime:fs.statSync(file).mtimeMs};
}
function change(store,edit){const data=store.snapshot().data;edit(data);return store.change({version:store.version,data});}
function undo(store){return store.undo({version:store.version});}
function redo(store){return store.redo({version:store.version});}
function unchanged(f){assert.deepEqual(fs.readFileSync(f.file),f.bytes);assert.equal(fs.statSync(f.file).mtimeMs,f.mtime);}

test('undo and redo restore complete character drafts, assignments and unknown fields without writing assets',t=>{
 const f=fixture(t),s=f.store;
 assert.equal(s.snapshot().canUndo,false);assert.equal(s.snapshot().canRedo,false);
 const first=change(s,d=>{d.profiles.guard.parts[0].x=7.5;d.profiles.copy=clone(d.profiles.guard);d.profiles.copy.name='Copy';d.assignments['ally:90001:default']='copy';d.future.list.push('new');});
 const second=change(s,d=>{delete d.profiles.guard;d.profiles.copy.parts[0].scaleX=-2;d.profiles.copy.unknown.keep=19;});
 assert.deepEqual(undo(s).data,first.data);assert.deepEqual(undo(s).data,f.original);
 assert.equal(s.snapshot().dirty,false);assert.equal(s.snapshot().canUndo,false);assert.equal(s.snapshot().canRedo,true);
 assert.deepEqual(redo(s).data,first.data);assert.deepEqual(redo(s).data,second.data);
 second.data.profiles.copy.name='Caller mutation';assert.equal(s.data.profiles.copy.name,'Copy','returned snapshots cannot alter the shared draft or its history');
 assert.equal(s.snapshot().canRedo,false);assert.equal(s.snapshot().dirty,true);unchanged(f);
});

test('same-value changes and empty history operations preserve revision and redo history',t=>{
 const f=fixture(t),s=f.store,initial=s.version;
 assert.equal(undo(s).version,initial);assert.equal(redo(s).version,initial);
 assert.equal(s.change({version:s.version,data:clone(s.data)}).version,initial);
 change(s,d=>d.profiles.guard.name='Renamed');undo(s);const revision=s.version;
 const noChange=s.change({version:revision,data:clone(s.data)});assert.equal(noChange.version,revision);assert.equal(noChange.canRedo,true);
 assert.equal(undo(s).version,revision);assert.equal(s.snapshot().canRedo,true);redo(s);assert.equal(s.data.profiles.guard.name,'Renamed');unchanged(f);
});

test('branching clears redo only after a valid edit, and stale undo or redo cannot replace another window draft',t=>{
 const f=fixture(t),s=f.store,stale=s.version;
 change(s,d=>d.profiles.guard.name='First');undo(s);const before=s.snapshot();
 const invalid=clone(s.data);invalid.profiles.guard.parts[0].scaleX=0;
 assert.throws(()=>s.change({version:s.version,data:invalid}),/transform/);assert.deepEqual(s.snapshot(),before);
 for(const method of ['change','undo','redo'])assert.throws(()=>s[method]({version:stale,data:clone(s.data)}),/another window/);
 assert.deepEqual(s.snapshot(),before);change(s,d=>d.profiles.guard.name='New branch');assert.equal(s.snapshot().canRedo,false);
 const version=s.version;assert.equal(redo(s).version,version);assert.equal(s.data.profiles.guard.name,'New branch');unchanged(f);
});

test('history is bounded to the last hundred document edits',t=>{
 const f=fixture(t),s=f.store;
 for(let i=1;i<=105;i++)change(s,d=>d.future.sequence=i);
 let count=0;while(s.snapshot().canUndo){undo(s);count++;}assert.equal(count,100);assert.equal(s.data.future.sequence,5);
 count=0;while(s.snapshot().canRedo){redo(s);count++;}assert.equal(count,100);assert.equal(s.data.future.sequence,105);unchanged(f);
});

test('no-change Save keeps redo, while an explicit successful Save starts history at the baked saved baseline',t=>{
 const f=fixture(t),s=f.store,Build=require('../../packages/hkd-characters/lib/appearance-build'),plan=Build.plan;
 let builds=0;Build.plan=(...args)=>{builds++;const result=plan(...args);result.data.profiles.guard.bakedVersion=7;return result;};t.after(()=>{Build.plan=plan;});
 change(s,d=>d.profiles.guard.parts[0].x=12);undo(s);const cleanVersion=s.version;
 const clean=s.save({version:cleanVersion});assert.equal(clean.result.saved,false);assert.equal(clean.version,cleanVersion);assert.equal(clean.canRedo,true);assert.equal(builds,0);unchanged(f);
 redo(s);const saved=s.save({version:s.version});assert.equal(saved.result.saved,true);assert.equal(builds,1);assert.equal(saved.canUndo,false);assert.equal(saved.canRedo,false);assert.equal(saved.data.profiles.guard.bakedVersion,7);assert.deepEqual(saved.data,saved.savedData);
 assert.deepEqual(undo(s).data,saved.data);assert.equal(JSON.parse(fs.readFileSync(f.file)).profiles.guard.parts[0].x,12);
 const bytes=fs.readFileSync(f.file),mtime=fs.statSync(f.file).mtimeMs;assert.equal(s.save({version:s.version}).result.saved,false);assert.deepEqual(fs.readFileSync(f.file),bytes);assert.equal(fs.statSync(f.file).mtimeMs,mtime);assert.equal(builds,1);
 change(s,d=>d.profiles.guard.name='After save');assert.deepEqual(undo(s).data,saved.data,'new edits undo to the baked saved baseline');
});

test('failed Save leaves history, local draft and external file changes intact',t=>{
 const f=fixture(t),s=f.store;
 change(s,d=>d.profiles.guard.name='Local draft');const before=s.snapshot(),external=clone(f.original);external.future.external=true;fs.writeFileSync(f.file,JSON.stringify(external));
 assert.throws(()=>s.save({version:s.version}),/outside this draft/);assert.deepEqual(s.snapshot(),before);assert.deepEqual(JSON.parse(fs.readFileSync(f.file)),external);
 undo(s);assert.deepEqual(s.data,f.original);redo(s);assert.equal(s.data.profiles.guard.name,'Local draft');
});

test('a failed asset transaction leaves both history directions usable',t=>{
 const f=fixture(t),s=f.store,Transaction=require('../../packages/hkd-characters/lib/asset-transaction'),commit=Transaction.commit;
 Transaction.commit=()=>{throw Error('Publish interrupted');};t.after(()=>{Transaction.commit=commit;});
 change(s,d=>d.profiles.guard.parts[0].x=3);change(s,d=>d.profiles.guard.parts[0].x=6);undo(s);const before=s.snapshot();
 assert.throws(()=>s.save({version:s.version}),/Publish interrupted/);assert.deepEqual(s.snapshot(),before);unchanged(f);
 assert.equal(redo(s).data.profiles.guard.parts[0].x,6);undo(s);assert.deepEqual(undo(s).data,f.original);
});

test('discard and explicit reload start fresh history from the current saved file',t=>{
 const f=fixture(t),s=f.store;
 change(s,d=>d.profiles.guard.name='Draft');undo(s);const external=clone(f.original);external.profiles.guard.name='External saved';fs.writeFileSync(f.file,JSON.stringify(external));const bytes=fs.readFileSync(f.file);
 const discarded=s.discard({version:s.version});assert.deepEqual(discarded.data,external);assert.equal(discarded.canUndo,false);assert.equal(discarded.canRedo,false);assert.equal(discarded.dirty,false);assert.deepEqual(fs.readFileSync(f.file),bytes);
 change(s,d=>d.profiles.guard.parts[0].x=5);const loaded=s.reload();assert.deepEqual(loaded.data,external);assert.equal(loaded.canUndo,false);assert.equal(loaded.canRedo,false);
});

test('item history reverses the automatic tier assignment together with the edited appearance',t=>{
 const f=fixture(t,true),s=f.store;
 const edited=change(s,d=>d.profiles.guard.parts[0].x=4);assert.equal(edited.data.assignments['2:1'],'guard');assert.equal(edited.canUndo,true);
 assert.deepEqual(undo(s).data,f.original,'undo must not autoassign an unchanged original item again');assert.deepEqual(redo(s).data,edited.data);unchanged(f);
});

test('item validation accepts legacy units without alias metadata and only explicitly listed tier aliases',t=>{
 const f=fixture(t,true),s=f.store;
 assert.deepEqual(s.validationUnits(),s.units());
 s.units=()=>[{type:'item',id:'2:tier:lv1',key:'2:tier:lv1',legacyKeys:['2:1','2:2']}];
 assert.deepEqual(s.validationUnits().map(unit=>unit.id),['2:tier:lv1','2:1','2:2']);
 const edited=change(s,d=>d.profiles.guard.parts[0].x=2);assert.equal(edited.data.assignments['2:1'],'guard');
 const invalid=clone(s.data);invalid.assignments['2:999']='guard';
 assert.throws(()=>s.change({version:s.version,data:invalid}),/matching base and level/);
 assert.deepEqual(s.snapshot().data,edited.data);unchanged(f);
});

for(const name of ['hkd-characters','hkd-items'])test(name+' exposes revision-checked history commands through its panel IPC',async()=>{
 const calls=[],replies=[];
 class Store{constructor(project){this.root=project;}undo(request){calls.push(['undo',request.version]);return{canUndo:false,canRedo:true};}redo(request){calls.push(['redo',request.version]);return{canUndo:true,canRedo:false};}}
 const context={module:{exports:{}},Editor:{Project:{path:root}},require:id=>id==='path'?path:/service$/.test(id)?{Service:Store,ItemsService:Store}:null};
 vm.runInNewContext(fs.readFileSync(path.join(root,'packages',name,'main.js'),'utf8'),context);
 for(const [op,version]of[['undo',7],['redo',8]])await new Promise((resolve,reject)=>context.module.exports.messages[op]({reply(error,result){if(error)reject(Error(error));else{replies.push(result);resolve();}}},{version}));
 assert.deepEqual(calls,[['undo',7],['redo',8]]);assert.equal(replies[0].canRedo,true);assert.equal(replies[1].canUndo,true);
});

test('the standalone editor accepts undo and redo through its protected API',async t=>{
 const calls=[];
 class Store{constructor(){this.version=1;}undo(request){assert.equal(request.version,this.version);calls.push('undo');return{version:++this.version,canUndo:false,canRedo:true};}redo(request){assert.equal(request.version,this.version);calls.push('redo');return{version:++this.version,canUndo:true,canRedo:false};}}
 const context={module:{exports:{}},URL,require:id=>id==='../../packages/hkd-characters/lib/service'?{Service:Store}:require(id)};
 vm.runInNewContext(fs.readFileSync(path.join(root,'tools/characters/serve-editor.cjs'),'utf8'),context);
 const server=context.module.exports.createServer(root);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const address='http://127.0.0.1:'+server.address().port;
 let version=1;for(const method of ['undo','redo']){
  const response=await fetch(address+'/api/'+method,{method:'POST',headers:{Origin:address,'Content-Type':'application/json'},body:JSON.stringify({version})});
  const result=await response.json();assert.equal(response.status,200,result.error);assert.equal(result.version,++version);assert.equal(result.canRedo,method==='undo');
 }
 assert.deepEqual(calls,['undo','redo']);
});
