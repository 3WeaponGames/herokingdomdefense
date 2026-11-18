'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./building-part-scale-fixture.cjs');
const root=path.resolve(process.env.HKD_PARTSCALE_PROJECT_ROOT||path.join(__dirname,'../..'));
const sourceRoot=path.resolve(process.env.HKD_PARTSCALE_SOURCE_DIR||path.join(root,'assets/_script'));
const read=name=>fs.readFileSync(path.join(sourceRoot,name+'.js'),'utf8');
function block(source,needle){const start=source.indexOf(needle);assert(start>=0,needle);const begin=source.indexOf('{',start);let end=begin+1,depth=1;while(depth){if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;assert(end<=source.length,'balanced SDK method');}return source.slice(begin,end);}
function load(name,context){const exports={};vm.runInNewContext(read(name),{exports,...context},{filename:name+'.js'});return exports;}
function setup(options){const f=fixture(options),Parts=load('BuildingPartScale',f);return{f,Parts,apply:row=>Parts.apply(f.component,row),retire:state=>Parts.dispose&&Parts.dispose(state)};}
const row={PartScale:{farmBeds:.7,scarecrows:1.5}};
test('native default sizes allocate no owner/copy/source credit',()=>{
 const {f,apply}=setup();for(let i=0;i<20;i++)apply({});assert.equal(f.stats.owners,0);assert.equal(f.stats.copies,0);assert.equal(f.stats.pins,0);assert.equal(f.currentSlots()[0].getAttachment(),f.bed);
});
test('private Skin acquires every native copy before resizing and retains immutable source assets',()=>{
 const {f,Parts,apply}=setup({requireOwned:true}),before=f.sourceShape(),textures=f.source.textures.slice();apply(row);
 const state=f.component._buildingPartScale;assert(state.ownerData,'native copies require an owner');assert.equal(f.stats.owners,1);assert.equal(f.stats.pins,1);assert.equal(f.stats.copies,2);assert.equal(f.sourceShape(),before);assert.deepEqual(f.source.textures,textures);
 assert(f.events.indexOf('skin-own')<f.events.indexOf('resize'));Parts.dispose(state);assert.equal(f.stats.deletedCopies,2);assert.equal(f.stats.pins,f.stats.unpins);assert.equal(f.currentSlots()[0].getAttachment(),f.bed);
});
test('steady native draws reuse copy ownership without extra native validity, resize, parse or pin work',()=>{
 const {f,apply,retire}=setup();apply(row);const state=f.component._buildingPartScale,before={...f.stats};for(let i=0;i<1000;i++)apply(row);
 for(const key of ['owners','copies','resizes','pins','unpins','validity'])assert.equal(f.stats[key],before[key],key+' remains unchanged');retire(state);
});
test('cached inactive skin resizes when returning under an unchanged new factor',()=>{
 const {f,apply,retire}=setup();apply({PartScale:{farmBeds:.7}});const a=f.currentSlots()[0].getAttachment(),slot=f.currentSlots()[0];slot.setAttachment(f.other);
 apply({PartScale:{farmBeds:1.4}});const b=slot.getAttachment();slot.setAttachment(f.bed);apply({PartScale:{farmBeds:1.4}});
 assert.equal(slot.getAttachment(),a);assert.equal(a.scaleX,1.4);assert.equal(b.scaleX,1.4);assert.equal(f.stats.copies,2);assert.equal(f.stats.owners,1);
 apply({});assert.equal(slot.getAttachment(),f.bed);assert(!f.owners[0].destroyed,'factor1 retains a bounded owner until rig retirement');retire(f.component._buildingPartScale);assert.equal(f.stats.deletedCopies,2);
});
for(const target of ['component','node'])test('queued '+target+' destruction restores live native borrowers before freeing their Skin',()=>{
 const {f,apply,retire}=setup();apply(row);const state=f.component._buildingPartScale;(target==='component'?f.component:f.component.node).queued=true;
 assert.equal(f.cc.isValid(target==='component'?f.component:f.component.node,true),false);retire(state);
 assert.equal(f.currentSlots()[0].getAttachment(),f.bed);assert.equal(f.stats.deletedCopies,2);assert.equal(f.stats.pins,f.stats.unpins);
});
test('actual native rig retirement skips all stale getters and still frees owned copies once',()=>{
 const {f,apply,retire}=setup();apply(row);const state=f.component._buildingPartScale;f.retireRig(f.component._skeleton);f.component.destroyed=true;f.component.node.destroyed=true;
 retire(state);retire(state);assert.equal(f.stats.deletedCopies,2);assert.equal(f.stats.pins,1);assert.equal(f.stats.unpins,1);
});
test('data=null with a custom factor retires owner and never scans the adapter stale _skeleton wrapper',()=>{
 const {f,apply}=setup();apply(row);const stale=f.component._skeleton;f.component.skeletonData=null;assert.equal(f.component._skeleton,stale,'native adapter leaves its old wrapper');
 apply(row);assert.equal(f.stats.deletedCopies,2);assert.equal(f.stats.pins,f.stats.unpins);assert.equal(f.stats.owners,1);assert.equal(f.component._buildingPartScale,undefined);
});
test('rig replacement retires old ownership and gives the fresh rig independent copies',()=>{
 const {f,apply,retire}=setup();apply(row);const state=f.component._buildingPartScale,copy=f.currentSlots()[0].getAttachment();f.component.skeletonData=f.source;apply(row);
 assert.equal(state.disposed,true);assert.equal(f.alive.has(copy),false);assert.equal(f.stats.deletedCopies,2);assert.equal(f.stats.owners,2);assert.equal(f.stats.pins,2);assert.equal(f.stats.unpins,1);retire(f.component._buildingPartScale);assert.equal(f.stats.unpins,2);
});
test('a throwing Slot restoration retains its owner and source pin for a safe idempotent retry',()=>{
 const {f,apply,retire}=setup();apply(row);const state=f.component._buildingPartScale,copy=f.currentSlots()[0].getAttachment();f.options.throwRestore=true;
 assert.throws(()=>retire(state),/planned restore/);assert.equal(state.disposed,undefined);assert.equal(f.owners[0].destroyed,undefined);assert.equal(f.alive.has(copy),true);assert.equal(f.stats.unpins,0);
 f.options.throwRestore=false;retire(state);retire(state);assert.equal(f.stats.deletedCopies,2);assert.equal(f.stats.unpins,1);
});
function runtime(f,Parts){const {Runtime}=load('MillFieldDefense',{...f,require:name=>name==='BuildingPartScale'?Parts:name==='MillFieldPresentation'?{clear(){}}:{}});const owner={node:new f.Node('mill'),ndAniDown:f.component,buildInfo:{cfg:row},getIsWork:()=>true};return new Runtime(owner,{});}
test('first Runtime apply exception still retains and retires the exact acquired attachment owner',()=>{
 const {f,Parts}=setup({throwResize:true}),rt=runtime(f,Parts);assert.throws(()=>rt.apply(),/planned offset/);
 assert.equal(rt.partScaleState,f.component._buildingPartScale,'finally retains the published state when apply throws');assert(rt.partScaleState.ownerData);rt.destroy();assert.equal(f.stats.deletedCopies,1);assert.equal(f.stats.pins,f.stats.unpins);
});
const engine=process.env.COCOS_ENGINE_DIR||process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const sdkObject=path.join(engine,'cocos2d/core/platform/CCObject.js'),sdkNode=path.join(engine,'cocos2d/core/utils/base-node.js'),hasSdk=fs.existsSync(sdkObject)&&fs.existsSync(sdkNode);
test('actual SDK child-first destruction and compileDestruct cannot erase the parent Runtime lease',{skip:hasSdk?false:'Install Creator 2.4.13 for SDK destruction integration'},()=>{
 const {f,Parts}=setup({throwResize:true}),rt=runtime(f,Parts);assert.throws(()=>rt.apply(),/planned offset/);const captured=rt.partScaleState;
 const object=fs.readFileSync(sdkObject,'utf8'),node=fs.readFileSync(sdkNode,'utf8');
 const at=object.indexOf('function compileDestruct '),end=object.indexOf('\n}\n',at)+2,compiler=vm.runInNewContext('('+object.slice(at,end)+')',{cc:{_BaseNode:function(){},Component:function(){},Class:{_isCCClass:()=>false}},CC_SUPPORT_JIT:false});
 const immediate=vm.runInNewContext('(function()'+block(object,'prototype._destroyImmediate = function ()')+')',{cc:{engine:{_isPlaying:true},errorID(){assert.fail('duplicate SDK destruction');}},CC_TEST:false,CC_EDITOR:false,Destroyed:2});
 const before=vm.runInNewContext('(function()'+block(node,'    _onPreDestroy () {')+')',{cc:f.cc,CC_EDITOR:false,CC_TEST:false,Destroying:1});
 function objectFor(value,onPreDestroy){value._objFlags=0;value._onPreDestroy=onPreDestroy;value._destruct=function(){compiler(this,this.constructor)(this);};value._destroyImmediate=immediate;return value;}
 function nodeFor(children,components){return objectFor({_children:children,_components:components,__eventTargets:[],_parent:null},before);}
 objectFor(f.component,function(){f.retireRig(this._skeleton);this._nativeSkeleton=null;});
 const child=nodeFor([],[f.component]),parentComponent=objectFor({runtime:rt},function(){this.runtime.destroy();}),parent=nodeFor([child],[parentComponent]);child._parent=parent;
 parent._destroyImmediate();assert.equal(f.component._buildingPartScale,null,'actual SDK clears object references');assert.equal(captured.disposed,true);assert.equal(f.stats.deletedCopies,1);assert.equal(f.stats.pins,f.stats.unpins);
});
function shadow(f,Parts,fail){
 const modules={BuildingPartScale:Parts,BuildingDropShadow:{resolve:()=>({mode:'ground',active:true,settings:{}})},BuildingDropShadowRuntime:{sources:owner=>owner.ndAniOther,capture(){if(fail==='capture')throw Error('planned capture failure');return{pixelWidth:1,pixelHeight:1,alpha:new Uint8Array([255])};},prepareEntry:()=>({}),releaseEntry(){}},BuildingShadowRuntime:{releaseEntry(){}},BuildingWorldScale:{value:()=>1},GateFacing:{reverse:()=>false,animation:()=> 'idle'}};
 const api=load('BuildingShadowPreparation',{...f,setTimeout,require:name=>{assert(modules[name],name);return modules[name];}}),node=new f.Node('template');f.component.node.parent=node;
 const template={node,ID:5,ndAniMain:f.component,ndAniOther:[]};node.getComponent=()=>template;
 const prefab={data:{getChildByName:()=>({children:[node]}),getComponentsInChildren:()=>[]}},config={BuildEnum:{5:{levelList:[{...row,ID:5,index:1,Skin:'mf-2-1'}]}}},level={HomeLevel1Unlock:[[5,5]]};
 return api.prepare(prefab,config,level,{current:()=>true,assets:{}});
}
for(const mode of ['normal','capture','apply'])test('shadow preparation '+mode+' path releases copies/source pin before data=null',async()=>{
 const {f,Parts}=setup({throwResize:mode==='apply'}),work=shadow(f,Parts,mode);if(mode==='normal'){const prepared=await work;prepared.dispose();}else await assert.rejects(work,mode==='apply'?/planned offset/:/planned capture/);
 assert(f.stats.owners>0);assert.equal(f.stats.pins,f.stats.unpins);assert(f.owners.every(o=>o.destroyed));assert(f.events.indexOf('owner-destroy')<f.events.indexOf('data-null'));assert.equal(f.stats.deletedCopies,mode==='apply'?1:2);
});
