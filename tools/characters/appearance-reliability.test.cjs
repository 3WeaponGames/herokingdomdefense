'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),flush=()=>new Promise(r=>setImmediate(r));
for(const name of ['hkd-characters','hkd-items'])test(name+' Save returns the latest shared draft if another window edits while Creator imports',async()=>{
 let store,finish,reply;
 class Service{constructor(project){this.root=project;store=this;this.version=1;this.dirty=false;this.value='saved';}snapshot(){return{version:this.version,dirty:this.dirty,data:{value:this.value},savedData:{value:'saved'}};}save(){this.version++;return{...this.snapshot(),result:{saved:true,files:['assets/model.png']}};}}
 const context={module:{exports:{}},Editor:{Project:{path:root}},require:id=>id==='path'?path:/service$/.test(id)?{Service,ItemsService:Service}:/import-refresh$/.test(id)?{refresh:()=>new Promise(resolve=>{finish=resolve;})}:null};
 vm.runInNewContext(fs.readFileSync(path.join(root,'packages',name,'main.js'),'utf8'),context);context.module.exports.messages.save({reply(error,result){assert.equal(error,null);reply=result;}},{});await flush();assert(finish);store.version++;store.dirty=true;store.value='another window draft';finish();await flush();
 assert.equal(reply.version,3);assert.equal(reply.data.value,'another window draft');assert(reply.dirty&&reply.result.saved);
});
test('Creator imports textures, atlases, Spine data, prefab references and catalogs in order and reports importer failures',async()=>{
 const {refresh}=require('../../packages/hkd-characters/lib/import-refresh'),calls=[],callbacks=[];const editor={assetdb:{refresh(url,callback){calls.push(url);callbacks.push(callback);}}};
 const pending=refresh(editor,['assets/model.json','assets/model.png','assets/model.atlas','assets/actor.prefab','assets/resources/characters/catalog.json','assets/model.png.meta']);
 assert.deepEqual(calls,['db://assets/model.png']);for(const suffix of ['atlas','json','prefab','catalog.json']){callbacks.shift()();await flush();assert(calls.at(-1).endsWith(suffix));}callbacks.shift()();await pending;
 const count=calls.length;await refresh(editor,[]);assert.equal(calls.length,count);
 await assert.rejects(refresh({assetdb:{refresh(){throw Error('import failed');}}},['assets/model.png']),/import failed/);
});
test('native hero layers retry synchronous and empty loads, retain idle phase and eventually apply the saved asset',()=>{
 let now=0,calls=0;const original={uuid:'head'},custom={uuid:'custom'},context={exports:{},Date:{now:()=>now},sp:{SkeletonData:function(){}},cc:{resources:{load(id,type,callback){calls++;if(calls===1)throw Error('not imported');if(calls===2)callback(null,null);else callback(null,custom);}}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroBakedLooks.js'),'utf8'),context);const track={animation:{name:'idle'},loop:true,trackTime:.42},renderer={skeletonData:original,getCurrent:()=>track,setSkin(){},setAnimation(){return track;}};const profile={bakedLayers:{head:{resource:'characters/baked/head'}}};
 assert.doesNotThrow(()=>context.exports.apply([renderer],profile));now=999;context.exports.apply([renderer],profile);assert.equal(calls,1);now=1001;context.exports.apply([renderer],profile);assert.equal(renderer.skeletonData,original);now=2002;context.exports.apply([renderer],profile);assert.equal(renderer.skeletonData,custom);assert.equal(track.trackTime,.42);assert.equal(calls,3);
});
test('saved model mirroring, independent scales and tint are scoped by side/form, do not accumulate and restore after pooling',()=>{
 const data={GameTools:{visuals:{'enemy:90001:default':{mirrorX:true,scaleX:.8,scaleY:1.2,x:4,y:8,rotation:10,tint:'#80c0ff'}},timingDefaults:{approved:{attack:.3}},timings:{custom:{attack:.4}}}},before=JSON.stringify(data),context={exports:{},require:()=>({KinghtFallDataMgr:{getInstance:()=>({data})}}),cc:{color:value=>value}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/GameToolsOverrides.js'),'utf8'),context);const api=context.exports,node={x:2,y:3,scaleX:.7,scaleY:.7,angle:5,color:'original'},owner={cfg:{ID:90001}};
 api.applyModel(owner,'enemy',node,false);assert(Math.abs(node.scaleX+.56)<1e-9);assert(Math.abs(node.scaleY-.84)<1e-9);assert.equal(node.x,6);assert.equal(node.angle,15);assert.equal(node.color,'#80c0ff');
 for(let i=0;i<10;i++)api.applyModel(owner,'enemy',node,true);assert(Math.abs(node.scaleX-.56)<1e-9);assert.equal(node.x,6);assert.equal(JSON.stringify(data),before);
 api.applyModel(owner,'ally',node,false);assert.equal(node.scaleX,.7);assert.equal(node.scaleY,.7);assert.equal(node.x,2);assert.equal(node.y,3);assert.equal(node.angle,5);assert.equal(node.color,'original');
 const config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');assert.equal(Object.keys(config.GameTools.visuals).filter(k=>k.startsWith('enemy:')&&config.GameTools.visuals[k].mirrorX).length,12);
});
