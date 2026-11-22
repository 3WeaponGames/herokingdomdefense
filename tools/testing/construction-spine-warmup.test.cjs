"use strict";
const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../assets/_script/CharacterAppearance.js'),'utf8'),warmSource=fs.readFileSync(path.resolve(__dirname,'../../assets/_script/BuildingAssetWarmup.js'),'utf8');
function fixture(options={}){
 const requests=[],frames=[],timers=new Map(),parses=[],refs=[],loads=[],warnings=[],sceneListeners=[],playbacks=[];let timerId=0,frame=0,instances=0,now=0,scene={name:'Loading scene'};
 class Asset{constructor(id){this._uuid=this.uuid=this.name=id;this.refs=0;this.calls=0;this.parsed=false;this._skeletonCache=null;}addRef(){this.refs++;refs.push(this._uuid);}decRef(){this.refs--;}getRuntimeData(){this.calls++;parses.push({id:this._uuid,frame});if(this.failure)throw this.failure;if(this.empty)return null;this.parsed=true;return this._skeletonCache=this.runtime||(this.runtime={id:this._uuid});}}
 class Skeleton{constructor(){instances++;throw Error('Must never instantiate a renderer');}}
 const cc={sys:{isNative:options.native!==false},resources:{load(resource,type,callback){requests.push({resource,type,callback,done:false});loads.push(resource);}},Component:class{},Class(definition){function Component(){}Component.prototype=definition;return Component;},Node:class{constructor(){instances++;throw Error('Must never create an actor/node');}},instantiate(){instances++;throw Error('Must never instantiate prefab');},isValid:value=>!!value&&!value.destroyed,Prefab:'prefab',SpriteFrame:'frame',warn:message=>warnings.push(message),Director:{EVENT_AFTER_DRAW:'after',EVENT_BEFORE_SCENE_LAUNCH:'beforeScene'},director:{getScene:()=>scene,on(event,callback){assert.equal(event,'beforeScene');sceneListeners.push(callback);},once(event,callback){assert.equal(event,'after');frames.push(callback);},off(event,callback){const list=event==='after'?frames:sceneListeners;for(let i=list.length-1;i>=0;i--)if(list[i]===callback)list.splice(i,1);},getPhysicsManager(){throw Error('No physics during preparation');}}};
 const clock={setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,delay:delay||0});return id;},clearTimeout(id){timers.delete(id);}};
 const Core={actorKey:(actor,team)=>team+':'+actor.cfg.ID+':default'},UnitLevelStats={level(actor){const b=actor&&actor.outBuild,r=b&&b.buildInfo&&b.buildInfo.cfg,v=r&&r.level;return typeof v==='number'&&isFinite(v)&&v>0&&Math.floor(v)===v?v:null;}},context=vm.createContext({cc,sp:{Skeleton,SkeletonData:Asset},require:name=>{if(name==='CharacterPartsCore')return Core;if(name==='UnitLevelStats')return UnitLevelStats;if(name==='GameToolsOverrides')return{applyAnimationPlayback:(...args)=>playbacks.push(args)};throw Error('Unexpected gameplay import: '+name);},exports:{},Date:{now:()=>now},...clock});vm.runInContext(source,context);
 if(options.coldLibrary!==true)vm.runInContext('library = Object.create(null)',context);
 const api=context.exports,assetMap={},catalog=options.catalog||{profiles:{one:{baked:{uuid:'level-1',resource:'baked/one'}},two:{baked:{uuid:'level-2',resource:'baked/two'}},unused:{baked:{uuid:'unused',resource:'baked/unused'}}},assignments:{'ally:90001:default':'one','ally:90001:level:2':'two'}};
 const config=options.config||{BuildEnum:{3:{levelList:[{level:1,Data:[6,90001]},{level:2,Data:[6,90001]}]}},SoldierCfg:{90001:{ID:90001,prefab:'Soldier'}}};
 function zeros(){let guard=0;while([...timers.values()].some(t=>t.delay===0)){assert(++guard<2000,'timer loop');for(const[id,t]of[...timers])if(t.delay===0){timers.delete(id);t.callback();}}}
 function tick(){zeros();frame++;const current=frames.splice(0);for(const callback of current)callback();assert(parses.filter(p=>p.frame===frame).length<=1,'More than one native runtime preparation in a Loading frame');}
 function deliver(resource,error,asset){const request=requests.find(r=>!r.done&&r.resource===resource);assert(request,'No request '+resource);request.done=true;request.callback(error||null,asset||(resource==='characters/catalog'?{json:catalog}:resource==='character-parts/catalog'?{json:{parts:[]}}:assetMap[resource]||(assetMap[resource]=new Asset(resource))));return request;}
 function drive(){let guard=0;while(frames.length||[...timers.values()].some(t=>t.delay===0)||requests.some(r=>!r.done)){assert(++guard<2000,'queue did not settle');for(const request of requests.slice())if(!request.done)deliver(request.resource);if(frames.length||[...timers.values()].some(t=>t.delay===0))tick();}zeros();}
 function prefab(assets,id){return{_uuid:id,data:{getComponentsInChildren(Type){assert.equal(Type,Skeleton);return assets.map(skeletonData=>({skeletonData}));}}};}
 return{api,context,cc,Asset,Skeleton,requests,frames,timers,parses,refs,loads,warnings,playbacks,assetMap,catalog,config,tick,zeros,deliver,drive,prefab,instances:()=>instances,private:name=>vm.runInContext(name,context),advance:ms=>now+=ms,setScene:value=>scene=value,scene:()=>scene,sceneListeners,retireScene(){for(const fn of sceneListeners.slice())fn();}};
}
function frozen(value){if(value&&typeof value==='object'){Object.freeze(value);Object.keys(value).forEach(key=>frozen(value[key]));}return value;}

test('current catalog plans all sixteen reachable level bakes without loading unused profiles or modifying authoring',()=>{
 const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/KinghtFallConfig/GameJsonCfg.json'))),catalog=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/resources/characters/catalog.json'))),h=fixture({config,catalog}),before=JSON.stringify([config,catalog]);frozen(config);frozen(catalog);
 const assets=['08d8f261-3836-560b-aed5-c1a08d428ad4','b1551bb4-582b-5c6f-a797-5f59ffff2c3f','3e5ae353-47b9-511f-a3a4-107525db2a2d','94029306-c33e-5d2e-a3bb-4e52f660adc7'].map(id=>new h.Asset(id));
 const plan=Array.from(h.api.constructionPlan(config,catalog,assets));assert.equal(plan.length,16);assert.equal(new Set(plan).size,16);for(const id of [90001,90002,90003,90004])assert(plan.includes('unit-library/runtime/ally-'+id+'-level-4'));assert(plan.includes('unit-library/runtime/ally-90001-level-1-3'));assert(plan.includes('unit-library/runtime/ally-90004-level-1'));assert.equal(JSON.stringify([config,catalog]),before);assert.equal(h.loads.length,0);assert.equal(h.instances(),0);
});

test('planning respects actual AllyCfg IDs, authored levels, exact overrides and fallback defaults',()=>{
 const h=fixture(),config={BuildEnum:{3:{levelList:[{level:2,Data:[1,42]},{level:'2',Data:[1,42]},{level:2,Data:[1,42]}]},99:{levelList:[{level:2,Data:[1,99]}]}},SoldierCfg:{42:{ID:42}},AllyCfg:{42:{ID:90001}}};
 assert.deepEqual(Array.from(h.api.constructionPlan(config,h.catalog,[])),['baked/two','baked/one']);assert.deepEqual(Array.from(h.api.constructionPlan(config,h.catalog,[new h.Asset('level-2')])),['baked/one']);
 const partial={profiles:h.catalog.profiles,assignments:{'ally:90001:level:2':'missing','ally:90001:default':'one'}};assert.deepEqual(Array.from(h.api.constructionPlan(config,partial,[])),['baked/one']);
});

test('unknown/unreachable data stays untouched; only a selected malformed bake fails',()=>{
 const h=fixture(),data={profiles:{unused:{baked:{resource:32}}},assignments:{}},config={BuildEnum:{3:{levelList:[{}, {Data:[3,404],level:1}]}}};assert.deepEqual(Array.from(h.api.constructionPlan(config,data,[])),[]);
 assert.deepEqual(Array.from(h.api.constructionPlan(h.config,data,[])),[]);data.assignments['ally:90001:default']='unused';assert.throws(()=>h.api.constructionPlan(h.config,data,[]),/no baked resource/);
});

test('catalog delay, coalesced callers, actual prefab dependencies and frame budgeting hold the loading barrier',()=>{
 const h=fixture(),a=new h.Asset('default'),b=new h.Asset('dependency'),calls=[];h.cc.assetManager={dependUtil:{getDepsRecursively:()=>['extra','notSpine']},assets:{get:id=>id==='extra'?b:{}}};
 const prefab=h.prefab([a,a],'prefab');h.api.preloadConstruction(h.config,[prefab],(error,result)=>{assert.ifError(error);calls.push(result.prepared);});h.api.preloadConstruction(h.config,[prefab],(error,result)=>{assert.ifError(error);calls.push(result.prepared);});
 assert.deepEqual(h.loads,['characters/catalog']);assert.equal(h.frames.length,0);assert.equal(h.parses.length,0);h.deliver('characters/catalog');assert.equal(h.frames.length,1);assert.deepEqual(calls,[]);h.tick();assert.deepEqual(h.parses.map(p=>p.id),['default']);assert.deepEqual(calls,[]);h.drive();
 assert.deepEqual(calls,[4,4]);assert.deepEqual(h.loads,['characters/catalog','baked/one','baked/two']);assert.equal(h.assetMap['baked/one'].refs,1);assert.equal(h.assetMap['baked/two'].refs,1);assert.equal(h.instances(),0);assert.equal(h.playbacks.length,0,'Data warmup does not invoke gameplay playback');assert.equal(h.frames.length,0);assert.equal(h.timers.size,0);
});

test('two different construction plans share one global native preparation step per Loading frame',()=>{
 const h=fixture(),a=new h.Asset('prefab A'),b=new h.Asset('prefab B');let completed=0;h.api.preloadConstruction(h.config,[h.prefab([a])],()=>completed++);h.api.preloadConstruction(h.config,[h.prefab([b])],()=>completed++);h.drive();assert.equal(completed,2);assert.equal(h.loads.filter(p=>p==='baked/one').length,1);assert.equal(h.assetMap['baked/one'].refs,1);assert.equal(h.instances(),0);
});

test('Browser prepares its actually used assigned bakes and normal JS runtime cache before Loading completes',()=>{
 const h=fixture({native:false}),asset=new h.Asset('default');let result;h.api.preloadConstruction(h.config,[h.prefab([asset])],(error,value)=>{assert.ifError(error);result=value;});assert.equal(result,undefined);h.drive();assert.equal(result.native,false);assert.equal(result.prepared,3);assert.equal(result.ready,true);assert.deepEqual(h.loads,['characters/catalog','baked/one','baked/two']);assert.equal(h.parses.length,3);assert.equal(h.frames.length,0);assert.equal(h.timers.size,0);assert.equal(h.instances(),0);
});

test('runtime bakedAsset and Loading share the same in-flight asset and retained cache',()=>{
 const h=fixture();h.api.preloadConstruction(h.config,[],error=>assert.ifError(error));h.deliver('characters/catalog');h.tick();assert.deepEqual(h.loads,['characters/catalog','baked/one']);const lazy=h.private('bakedAsset');assert.equal(lazy('baked/one'),undefined);h.deliver('baked/one');h.drive();assert.equal(lazy('baked/one'),h.assetMap['baked/one']);assert.equal(h.loads.filter(p=>p==='baked/one').length,1);assert.equal(h.assetMap['baked/one'].refs,1);
 let completed=0;h.api.preloadConstruction(h.config,[],()=>completed++);h.drive();assert.equal(completed,1);assert.equal(h.loads.filter(p=>p==='baked/one').length,1);assert.equal(h.assetMap['baked/one'].refs,1);
});

test('optional bake load failure preserves prefab fallback, reports it and cannot poison immediate retry',()=>{
 const h=fixture(),results=[];h.api.preloadConstruction(h.config,[],(error,result)=>{assert.ifError(error);results.push(result);});h.deliver('characters/catalog');h.tick();const request=h.deliver('baked/one',Error('controlled load failure'));assert.deepEqual(results,[]);request.callback(null,new h.Asset('late'));h.drive();assert.equal(results[0].ready,false);assert.equal(results[0].fallbacks[0].resource,'baked/one');assert.equal(h.private('bakedAsset')('baked/one'),undefined);assert(h.warnings.length);
 h.api.preloadConstruction(h.config,[],(error,result)=>{assert.ifError(error);results.push(result);});h.drive();assert.equal(results[1].ready,true);assert.equal(h.loads.filter(p=>p==='baked/one').length,2);assert.equal(h.assetMap['baked/one'].refs,1);
});

for(const mode of ['throw','null'])test('required runtime '+mode+' reports failure, cleans frame listeners and remains retryable',()=>{
 const h=fixture(),asset=new h.Asset('default');if(mode==='throw')asset.failure=Error('parse failed');if(mode==='null')asset.empty=true;let failure,completed=0;
 h.api.preloadConstruction(h.config,[h.prefab([asset])],error=>{failure=error;});h.deliver('characters/catalog');h.tick();
 assert(failure);assert.equal(h.frames.length,0);assert.equal(h.timers.size,0);asset.failure=null;asset.empty=false;
 h.api.preloadConstruction(h.config,[h.prefab([asset])],error=>{assert.ifError(error);completed++;});h.drive();assert.equal(completed,1);assert.equal(h.instances(),0);
});

test('throwing completion waiters drain all other callers and do not lose cache readiness',()=>{
 const h=fixture(),prefab=h.prefab([new h.Asset('default')]),calls=[],first=Error('first callback');h.api.preloadConstruction(h.config,[prefab],()=>{calls.push('a');throw first;});h.api.preloadConstruction(h.config,[prefab],()=>calls.push('b'));
 assert.throws(()=>h.drive(),error=>error===first);assert.deepEqual(calls,['a','b']);assert.equal(h.frames.length,0);assert.equal(h.timers.size,0);h.api.preloadConstruction(h.config,[prefab],()=>calls.push('c'));h.drive();assert.deepEqual(calls,['a','b','c']);assert.equal(h.loads.filter(p=>p==='baked/one').length,1);
});

test('catalog preload failure drains every waiter and retries without accepting the failed snapshot',()=>{
 const h=fixture(),calls=[],first=Error('catalog failure'),consumer=Error('consumer');h.api.preload(error=>{assert.equal(error,first);calls.push('a');throw consumer;});h.api.preload(error=>{assert.equal(error,first);calls.push('b');});assert.throws(()=>h.deliver('characters/catalog',first),error=>error===consumer);assert.deepEqual(calls,['a','b']);assert.equal(h.frames.length,0);
 h.api.preloadConstruction(h.config,[],error=>{assert.ifError(error);calls.push('c');});h.drive();assert.deepEqual(calls,['a','b','c']);assert.equal(h.loads.filter(p=>p==='characters/catalog').length,2);
});

test('optional catalog failure still prepares required prefab data and reports the retained base appearance',()=>{
 const h=fixture(),asset=new h.Asset('required');let result;h.api.preloadConstruction(h.config,[h.prefab([asset])],(error,value)=>{assert.ifError(error);result=value;});h.deliver('characters/catalog',Error('catalog unavailable'));h.drive();assert.equal(asset.calls,1);assert.equal(result.prepared,1);assert.equal(result.ready,false);assert.equal(result.fallbacks[0].resource,'characters/catalog');assert.equal(h.loads.length,1);assert(h.warnings.length);
});

test('malformed optional assignment cannot hard-block required defaults or hide other valid assignments',()=>{
 const h=fixture();h.catalog.profiles.one.baked.resource=32;const asset=new h.Asset('required');let result;h.api.preloadConstruction(h.config,[h.prefab([asset])],(error,value)=>{assert.ifError(error);result=value;});h.drive();assert.equal(result.ready,false);assert.equal(result.prepared,2);assert.equal(result.fallbacks[0].resource,'one');assert(h.loads.includes('baked/two'));assert.equal(h.instances(),0);
});

test('wrong-type optional assets never enter the baked cache and remain retryable',()=>{
 const h=fixture();let result;h.api.preloadConstruction(h.config,[],(error,value)=>{assert.ifError(error);result=value;});h.deliver('characters/catalog');h.tick();h.deliver('baked/one',null,{});h.drive();assert.equal(result.ready,false);assert.equal(h.private('bakedAsset')('baked/one'),null);h.api.preloadConstruction(h.config,[],(error,value)=>{assert.ifError(error);result=value;});h.drive();assert.equal(result.ready,true);assert.equal(h.assetMap['baked/one'].refs,1);
});

test('optional native parse failure releases only its retained cache lease and falls back without losing required readiness',()=>{
 const h=fixture(),asset=new h.Asset('broken optional');asset.failure=Error('optional parse');h.assetMap['baked/one']=asset;let result;h.api.preloadConstruction(h.config,[],(error,value)=>{assert.ifError(error);result=value;});h.drive();assert.equal(result.ready,false);assert.equal(result.fallbacks[0].resource,'baked/one');assert.equal(asset.refs,0);assert.equal(h.private('bakedAsset')('baked/one'),null);asset.failure=null;asset.skeletonJson={repaired:true};h.api.preloadConstruction(h.config,[],(error,value)=>{assert.ifError(error);result=value;});h.drive();assert.equal(result.ready,true);assert.equal(asset.refs,1);
});

test('one cancelled/retired caller cannot cancel live callers; cancelling all detaches timers/frames without actors',()=>{
 const h=fixture(),calls=[],prefab=h.prefab([new h.Asset('default')]);let current=true;const a=h.api.preloadConstruction(h.config,[prefab],()=>calls.push('a')),b=h.api.preloadConstruction(h.config,[prefab],()=>calls.push('b'),()=>current);a.cancel();h.deliver('characters/catalog');current=false;h.tick();assert.deepEqual(calls,[]);assert.equal(h.frames.length,0);assert.equal(h.timers.size,0);assert.equal(h.parses.length,0);
 const c=h.api.preloadConstruction(h.config,[prefab],()=>calls.push('c')),d=h.api.preloadConstruction(h.config,[prefab],()=>calls.push('d'));c.cancel();h.drive();assert.deepEqual(calls,['d']);assert.equal(h.instances(),0);d.cancel();b.cancel();
});

test('cancellation during an asset request permits a late shared cache fill but never parses or calls retired owners',()=>{
 const h=fixture();let calls=0;const handle=h.api.preloadConstruction(h.config,[],()=>calls++);h.deliver('characters/catalog');h.tick();handle.cancel();assert.equal(h.frames.length,0);assert.equal(h.timers.size,1,'Only the bounded shared-cache request deadline remains');h.deliver('baked/one');assert.equal(h.timers.size,0);assert.equal(calls,0);assert.equal(h.parses.length,0);assert.equal(h.assetMap['baked/one'].refs,1);assert.equal(h.private('bakedAsset')('baked/one'),null);h.drive();assert.equal(h.private('bakedAsset')('baked/one'),h.assetMap['baked/one']);
});

test('a missing optional catalog callback expires, keeps required rigs playable and cannot overwrite a newer retry',()=>{
 const h=fixture(),asset=new h.Asset('required');let result;h.api.preloadConstruction(h.config,[h.prefab([asset])],(error,value)=>{assert.ifError(error);result=value;});const old=h.requests[0];old.done=true;[...h.timers.values()].find(t=>t.delay===20000).callback();h.drive();assert.equal(result.ready,false);assert.equal(result.prepared,1);assert.match(result.fallbacks[0].message,/timed out/);assert.equal(h.timers.size,0);
 const updated={profiles:h.catalog.profiles,assignments:{'ally:90001:default':'two'}};h.api.preload(()=>{});h.deliver('characters/catalog',null,{json:updated});old.callback(null,{json:h.catalog});assert.equal(h.private('looks'),updated);
});

test('a missing optional bake callback expires as fallback, drops waiters and is immediately retryable by Loading',()=>{
 const h=fixture();let result;h.api.preloadConstruction(h.config,[],(error,value)=>{assert.ifError(error);result=value;});h.deliver('characters/catalog');h.tick();const old=h.requests.find(r=>r.resource==='baked/one');old.done=true;[...h.timers.values()].find(t=>t.delay===20000).callback();h.drive();assert.equal(result.ready,false);assert.match(result.fallbacks[0].message,/timed out/);assert.equal(h.private('bakedJobs')[ 'baked/one'].waiters.length,0);old.callback(null,new h.Asset('stale'));assert.equal(h.private('bakedAsset')('baked/one'),undefined);
 h.api.preloadConstruction(h.config,[],(error,value)=>{assert.ifError(error);result=value;});h.drive();assert.equal(result.ready,true);assert.equal(h.loads.filter(p=>p==='baked/one').length,2);
});

test('current assignment changes are replanned and retired cached assets release exactly their own lease',()=>{
 const h=fixture();h.api.preloadConstruction(h.config,[],error=>assert.ifError(error));h.drive();const old=h.assetMap['baked/one'];old.destroyed=true;h.assetMap['baked/one']=new h.Asset('replacement one');h.api.preloadConstruction(h.config,[],error=>assert.ifError(error));h.drive();assert.equal(old.refs,0);assert.equal(h.assetMap['baked/one'].refs,1);assert.equal(h.loads.filter(p=>p==='baked/one').length,2);
 h.catalog.profiles.three={baked:{uuid:'three',resource:'baked/three'}};h.catalog.assignments['ally:90001:default']='three';h.api.preloadConstruction(h.config,[],error=>assert.ifError(error));h.drive();assert(h.loads.includes('baked/three'));assert.equal(h.assetMap['baked/three'].refs,1);assert.equal(h.instances(),0);
});

test('shared baked-cache callback failures drain every consumer before rethrowing and retain one ready lease',()=>{
 const h=fixture(),request=h.private('requestBakedAsset'),calls=[],first=Error('cache consumer');request('baked/shared',()=>{calls.push('a');throw first;},true);request('baked/shared',()=>calls.push('b'),true);assert.throws(()=>h.deliver('baked/shared'),error=>error===first);assert.deepEqual(calls,['a','b']);assert.equal(h.assetMap['baked/shared'].refs,1);assert.equal(h.timers.size,0);assert.equal(h.private('bakedAsset')('baked/shared'),null);h.drive();assert.equal(h.private('bakedAsset')('baked/shared'),h.assetMap['baked/shared']);
});

test('a cancelled catalog waiter performs no follow-on work; an absent frame event reports timeout and cleans up',()=>{
 const h=fixture();let calls=0;const cancelled=h.api.preloadConstruction(h.config,[],()=>calls++);cancelled.cancel();h.deliver('characters/catalog');assert.equal(h.frames.length,0);assert.equal(h.loads.length,1);
 let failure;h.api.preloadConstruction(h.config,[h.prefab([new h.Asset('required')])],error=>failure=error);const timer=[...h.timers.values()].find(t=>t.delay===25000);assert(timer);timer.callback();assert.match(failure.message,/timed out/);assert.equal(h.frames.length,0);assert.equal(h.timers.size,0);assert.equal(calls,0);
});

test('unknown prefab storage is a required preparation error and cannot silently instantiate or proceed',()=>{
 const h=fixture();let error;h.api.preloadConstruction(h.config,[{}],issue=>error=issue);h.deliver('characters/catalog');assert.match(error.message,/enumerate/);assert.equal(h.instances(),0);assert.equal(h.frames.length,0);
});

test('each prepared rig renews the inactivity deadline for the remaining construction work', () => {
 const h=fixture(), assets=[new h.Asset('first'),new h.Asset('second')];
 let result;
 h.api.preloadConstruction(h.config,[h.prefab(assets)],(error,value)=>{assert.ifError(error);result=value;});
 h.deliver('characters/catalog');
 const [initialWatchdog]=[...h.timers].find(([,timer])=>timer.delay===25000);
 h.tick();
 assert.equal(assets[0].parsed,true);
 assert.equal(assets[1].parsed,false);
 assert.equal(h.timers.has(initialWatchdog),false);
 assert([...h.timers.values()].some(timer=>timer.delay===25000));
 h.drive();
 assert.equal(result.prepared,4);
 assert.equal(h.timers.size,0);
});

function integrated(options){const h=fixture(options),resourceRequests=[],recoveries=[],menus=[],menuPaint=[],callbacks=[],manager={loadBundle(name,done){done({});},loadRes(...args){resourceRequests.push(args);},loadWithRecovery(name,operation,complete,_error,isCurrent,options){const record={name,isCurrent,options,cancelled:false,cancel(){record.cancelled=true;},retry(){if(record.cancelled||isCurrent&&!isCurrent())return;operation((error,value)=>{record.error=error;if(!record.cancelled&&(!isCurrent||isCurrent())&&!error)complete(value);});}};recoveries.push(record);record.retry();return record;},showRuntimeRecovery(error,retry){recoveries.push({name:'resource',error,retry});}},modules={KinghtFallConfig:{KinghtFallBundelName:{Enemy:'units',EnemyAni:'ani',IconMap:'maps',IconBuild:'icons'},KinghtFallUIID:{UIBuildSel:7}},KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({data:h.config})}},ResourceMgr:{ResourceMgr:{getInstance:()=>manager}},CharacterAppearance:h.api,UIMgr:{UIMgr:{getInstance:()=>({getUICnf(){return {};},preLoadUI(id,done){menus.push(done);}})}},PreparedBuildingMenus:{prepare(config,ui,done){menuPaint.push(done);}}},context={exports:{},cc:h.cc,require:name=>{assert(modules[name],name);return modules[name];},setTimeout:(fn,delay)=>{const id=Symbol();h.timers.set(id,{callback:fn,delay:delay||0});return id;},clearTimeout:id=>h.timers.delete(id)};vm.runInNewContext(warmSource,context);
 function resources(){let at=0;while(resourceRequests[at]){const request=resourceRequests[at++];request[3](request[2]==='prefab'?h.prefab([new h.Asset('default')]):{});h.zeros();}}
 return Object.assign(h,{warm:context.exports,resourceRequests,recoveries,menus,menuPaint,callbacks,resources,manager});}

test('existing Loading integration blocks menu preparation and success until required native data is ready',()=>{
 const h=integrated();h.warm.preload(()=>h.callbacks.push('done'));h.resources();assert.equal(h.menus.length,0);assert.equal(h.recoveries[0].name,'Construction menu preparation');assert.equal(h.recoveries[0].options.idleTimeoutMs,0);assert.deepEqual(h.callbacks,[]);h.drive();assert.equal(h.menus.length,1);assert.deepEqual(h.callbacks,[]);h.menus[0]();assert.equal(h.menuPaint.length,1);h.menuPaint[0](null,{ready:true});assert.deepEqual(h.callbacks,['done']);assert.equal(h.instances(),0);
});

test('a native runtime failure uses ResourceMgr recovery and retry without reloading queued assets',()=>{
 const h=integrated();h.warm.preload(()=>h.callbacks.push('done'));let at=0,asset;while(h.resourceRequests[at]){const request=h.resourceRequests[at++];if(request[2]==='prefab'){asset=new h.Asset('default');asset.failure=Error('required native parse');request[3](h.prefab([asset]));}else request[3]({});h.zeros();}h.deliver('characters/catalog');h.tick();assert.match(h.recoveries[0].error.message,/required native parse/);assert.equal(h.menus.length,0);assert.deepEqual(h.callbacks,[]);const count=h.resourceRequests.length;asset.failure=null;h.recoveries[0].retry();h.drive();assert.equal(h.resourceRequests.length,count);assert.equal(h.menus.length,1);h.menus[0]();h.menuPaint[0](null,{ready:true});assert.deepEqual(h.callbacks,['done']);
});

test('native required prefab failure stays in the existing recovery path and does not advance the resource queue',()=>{
 const h=integrated();h.warm.preload(()=>h.callbacks.push('done'));const request=h.resourceRequests[0];assert.equal(request[2],'prefab');let retries=0;const count=h.resourceRequests.length;request[7].onError(Error('prefab missing'),()=>retries++);assert.equal(h.resourceRequests.length,count);assert.equal(h.menus.length,0);assert.equal(h.recoveries[0].name,'resource');h.recoveries[0].retry();assert.equal(retries,1);assert.deepEqual(h.callbacks,[]);
});

test('queued prefab planning respects AllyCfg prefab overrides without mutating either table',()=>{
 const h=integrated();h.config.AllyCfg={90001:{ID:90001,prefab:'Override'}};const before=JSON.stringify(h.config),plan=Array.from(h.warm.plan(h.config,{Enemy:'units',IconBuild:'icons'}));assert(plan.some(row=>row.path==='PlayOverride'));assert(!plan.some(row=>row.path==='PlaySoldier'));assert.equal(JSON.stringify(h.config),before);
});

test('actual BuildingWarmup retires native work at BEFORE_SCENE_LAUNCH while getScene still returns the old pointer',()=>{
 const h=integrated(),original=h.api.preloadConstruction;let cancels=0;h.api.preloadConstruction=function(...args){assert.equal(typeof args[3],'function');const handle=original(...args);return{cancel(){cancels++;handle.cancel();}};};
 Object.defineProperty(h.scene(),'activeInHierarchy',{get(){throw Error('Abstract Scene getter must not be used');}});
 h.warm.preload(()=>h.callbacks.push('old'));h.resources();h.deliver('characters/catalog');assert.equal(h.frames.length,1);const old=h.scene(),recovery=h.recoveries[0];assert.equal(recovery.isCurrent(),true);
 h.retireScene();assert.equal(h.scene(),old);assert.equal(cancels,1);assert.equal(recovery.cancelled,true);assert.equal(recovery.isCurrent(),false);assert.equal(h.frames.length,0);assert.equal(h.sceneListeners.length,0);assert.deepEqual(h.callbacks,[]);assert.equal(h.menus.length,0);
 const loaded=h.resourceRequests.length;h.setScene({name:'new Loading'});h.warm.preload(()=>h.callbacks.push('new'));h.zeros();h.drive();assert.equal(h.resourceRequests.length,loaded,'Retained asset cache survives retired owners');assert.equal(h.menus.length,1);h.menus[0]();h.menuPaint[0](null,{ready:true});assert.deepEqual(h.callbacks,['new']);
});

test('late preLoadUI callbacks from a retired Loading cannot prepare menus or complete a new owner',()=>{
 const h=integrated();h.warm.preload(()=>h.callbacks.push('old'));h.resources();h.drive();assert.equal(h.menus.length,1);h.retireScene();h.menus[0]();assert.equal(h.menuPaint.length,0);assert.deepEqual(h.callbacks,[]);
 h.setScene({name:'replacement'});h.warm.preload(()=>h.callbacks.push('new'));h.zeros();h.drive();assert.equal(h.menus.length,2);h.menus[1]();h.menuPaint[0](null,{ready:true});assert.deepEqual(h.callbacks,['new']);assert.equal(h.sceneListeners.length,0);
});

test('coalesced valid Loading callers survive an earlier owner invalidation and completed cache survives Main handoff',()=>{
 const h=integrated();let oldLive=true;h.warm.preload(()=>h.callbacks.push('old'),()=>oldLive);h.warm.preload(()=>h.callbacks.push('live'),()=>true);oldLive=false;h.resources();h.drive();h.menus[0]();h.menuPaint[0](null,{ready:true});assert.deepEqual(h.callbacks,['live']);assert.equal(h.sceneListeners.length,0);
 const count=h.resourceRequests.length,parses=h.parses.length;h.retireScene();h.setScene({name:'Main'});h.warm.preload(()=>h.callbacks.push('cached'));assert.deepEqual(h.callbacks,['live','cached']);assert.equal(h.resourceRequests.length,count);assert.equal(h.parses.length,parses);
});

test('retired resource callbacks cannot create recovery UI or resume menu preparation',()=>{
 const h=integrated();h.warm.preload(()=>h.callbacks.push('old'));const resource=h.resourceRequests[0];assert.equal(typeof resource[7].isCurrent,'function');h.retireScene();const before=h.recoveries.length;resource[7].onError(Error('late'),()=>{});resource[3](h.prefab([new h.Asset('late cache')]));h.zeros();assert.equal(h.recoveries.length,before);assert.equal(h.menus.length,0);assert.deepEqual(h.callbacks,[]);
});

for(const native of[true,false])test((native?'Native':'Browser')+' failed baked targets stay unpublished through repeated real lateUpdate calls after backoff, then validated repair applies',()=>{
 const h=fixture({native}),bad=new h.Asset('level-1');bad.failure=Error('bad runtime data');bad.skeletonJson={broken:true};h.assetMap['baked/one']=bad;h.catalog.profiles.one.parts=[];
 h.api.preloadConstruction(h.config,[],error=>assert.ifError(error));h.drive();assert.equal(bad.refs,0);assert.equal(bad.calls,1);h.private('library={}');
 let data={uuid:'original',skeletonJson:{}},applied=[];const renderer={node:{activeInHierarchy:true},defaultSkin:'default',defaultAnimation:'idle',get skeletonData(){return data;},set skeletonData(value){applied.push(value);data=value;},getCurrent(index){return index?null:{animation:{name:'idle'},loop:true,trackTime:.5,timeScale:1};},setSkin(){},setAnimation(){return{trackTime:0,timeScale:1};}},actor={node:{activeInHierarchy:true},cfg:{ID:90001},outBuild:{buildInfo:{cfg:{level:1}}},spAni:renderer},appearance={owner:actor,team:'ally',states:[],models:[],clear(){}};
 const update=h.api.component.prototype.lateUpdate;
 for(let i=0;i<5;i++){h.advance(2000);update.call(appearance);h.drive();update.call(appearance);assert.deepEqual(applied,[]);assert.equal(bad.calls,1,'A failed same-asset revision is not reparsed every retry');}
 bad.failure=null;bad.skeletonJson={_unitLook:'one',repaired:true};h.advance(2000);update.call(appearance);h.drive();update.call(appearance);assert.deepEqual(applied,[],'Loaded is not native-runtime-ready');h.drive();update.call(appearance);assert.deepEqual(applied,[bad]);assert.equal(bad.calls,2);assert.equal(bad.refs,1);assert.equal(h.instances(),0);
});

function harmlessAppearance(h){const original={uuid:'prefab',skeletonJson:{}},actor={node:{activeInHierarchy:true},cfg:{ID:90001},spAni:{node:{activeInHierarchy:true},skeletonData:original},outBuild:{buildInfo:{cfg:{level:1}}}};return{actor,appearance:{owner:actor,team:'ally',states:[],models:[],clear(){}}};}
for(const json of[null,undefined,[],42,'wrong'])test('unusable catalog root '+String(json)+' reports fallback and actual lateUpdate remains playable',()=>{
 const h=fixture(),required=new h.Asset('required');let result;h.api.preloadConstruction(h.config,[h.prefab([required])],(error,value)=>{assert.ifError(error);result=value;});h.deliver('characters/catalog',null,{json});h.drive();assert.equal(result.ready,false);assert.equal(result.requiredReady,true);assert.match(result.fallbacks[0].message,/usable table/);assert.equal(required.parsed,true);h.private('library={}');const actor=harmlessAppearance(h);assert.doesNotThrow(()=>h.api.component.prototype.lateUpdate.call(actor.appearance));assert.equal(actor.actor.spAni.skeletonData.uuid,'prefab');assert.equal(h.instances(),0);
});

for(const badMaps of[{}, {profiles:[],assignments:{}}, {profiles:{},assignments:'bad'}, {profiles:null,assignments:{}}])test('invalid appearance maps preserve valid animation speeds/unknown fields and quarantine only appearance',()=>{
 const catalog={...badMaps,unitAnimationSpeeds:{'ally:90001:default':.6},unknown:{keep:['unchanged']}},before=JSON.stringify(catalog),h=fixture({catalog}),required=new h.Asset('required');let result;frozen(catalog);h.api.preloadConstruction(h.config,[h.prefab([required])],(error,value)=>{assert.ifError(error);result=value;});h.drive();assert.equal(result.ready,false);assert.equal(result.requiredReady,true);assert.equal(result.fallbacks[0].resource,'characters/catalog');const actor=harmlessAppearance(h);assert.equal(h.api.animationSpeed(actor.actor,'ally'),.6);assert.equal(h.private('looks'),catalog);h.private('library={}');assert.doesNotThrow(()=>h.api.component.prototype.lateUpdate.call(actor.appearance));assert.equal(h.playbacks.length,1,'Explicit speed playback remains active despite appearance quarantine');assert.equal(h.playbacks[0][0],actor.actor);assert.equal(JSON.stringify(catalog),before);assert.equal(actor.actor.spAni.skeletonData.uuid,'prefab');assert.equal(h.instances(),0);
});

test('global optional deadline completes with explicit fallbacks once every required default is ready',()=>{
 const h=fixture(),required=new h.Asset('required');let result;h.api.preloadConstruction(h.config,[h.prefab([required])],(error,value)=>{assert.ifError(error);result=value;});h.deliver('characters/catalog');h.tick();assert.equal(required.parsed,true);const timer=[...h.timers.values()].find(t=>t.delay===25000);timer.callback();assert.equal(result.requiredReady,true);assert.equal(result.ready,false);assert.equal(result.prepared,1);assert.deepEqual(Array.from(result.fallbacks,row=>row.resource),['baked/one','baked/two']);assert(result.fallbacks.every(row=>/timed out/.test(row.message)));assert.equal(h.frames.length,0);assert.equal(h.timers.size,0);assert.equal(h.instances(),0);
});

test('runtime publication never parses all newly loaded bakes inside resource callbacks',()=>{
 const h=fixture(),request=h.private('requestBakedAsset'),lazy=h.private('bakedAsset'),paths=['runtime/A','runtime/B','runtime/C','runtime/D'];for(const resource of paths)request(resource,null,true);for(const resource of paths)h.deliver(resource);assert.equal(h.parses.length,0);for(const resource of paths)assert.equal(lazy(resource),null);assert.equal(h.frames.length,1);h.drive();assert.equal(h.parses.length,4);assert.equal(new Set(h.parses.map(row=>row.frame)).size,4);for(const resource of paths)assert.equal(lazy(resource),h.assetMap[resource]);assert.equal(h.instances(),0);
});

test('actual Browser lateUpdate selects the assigned level bake without a post-Loading request or parse',()=>{
 const h=fixture({native:false,coldLibrary:true}),baked=new h.Asset('level-1');baked.skeletonJson={_unitLook:'one'};h.assetMap['baked/one']=baked;h.catalog.profiles.one.parts=[];let result;h.api.preloadConstruction(h.config,[],(error,value)=>{assert.ifError(error);result=value;});h.drive();assert.equal(result.ready,true);assert.equal(result.native,false);assert.equal(baked.parsed,true);assert(h.private('library'));
 const loads=h.loads.length,parses=h.parses.length,applied=[];let data={uuid:'prefab',skeletonJson:{}};const renderer={node:{activeInHierarchy:true},defaultSkin:'default',defaultAnimation:'idle',get skeletonData(){return data;},set skeletonData(value){assert.equal(value.parsed,true);applied.push(value);data=value;},getCurrent(index){return index?null:{animation:{name:'idle'},loop:true,trackTime:.75,timeScale:1};},setSkin(){},setAnimation(){return{trackTime:0,timeScale:1};}},appearance={owner:{node:{activeInHierarchy:true},cfg:{ID:90001},outBuild:{buildInfo:{cfg:{level:1}}},spAni:renderer},team:'ally',states:[],models:[],clear(){}};
 h.api.component.prototype.lateUpdate.call(appearance);assert.deepEqual(applied,[baked]);assert.equal(h.loads.length,loads);assert.equal(h.parses.length,parses);assert.equal(h.instances(),0);
});

for(const native of[true,false])test((native?'Native':'Browser')+' cold construction and lazy appearance share metadata/id map and complete it before any Loading release',()=>{
 const h=fixture({native,coldLibrary:true}),part=frozen({id:'Chest/one',resource:'parts/one',unknown:{keep:1}}),json=frozen({parts:[part],unknown:['preserved']}),before=JSON.stringify(json),required=new h.Asset('required');let result;
 h.private('load')();h.api.preloadConstruction(h.config,[h.prefab([required])],(error,value)=>{assert.ifError(error);result=value;});
 assert.equal(h.loads.filter(p=>p==='character-parts/catalog').length,1);h.deliver('characters/catalog');assert.equal(result,undefined);assert.equal(h.frames.length,0);assert.equal(h.private('library'),null);
 h.deliver('character-parts/catalog',null,{json});assert.equal(h.private('library')[part.id],part);assert.equal(Object.getPrototypeOf(h.private('library')),null);h.drive();assert.equal(result.ready,true);assert.equal(required.parsed,true);assert.equal(h.loads.filter(p=>p==='character-parts/catalog').length,1);assert.equal(h.loads.filter(p=>p==='parts/one').length,0);assert.equal(JSON.stringify(json),before);assert.equal(h.instances(),0);assert.equal(h.timers.size,0);
});

for(const json of[null,{}, {parts:null}, {parts:[null]}, {parts:[{id:'part'}]}, {parts:[{id:1,resource:'parts/one'}]}])test('invalid parts metadata '+JSON.stringify(json)+' is optional, unpublished and safe in actual lateUpdate',()=>{
 const h=fixture({coldLibrary:true,catalog:{unitAnimationSpeeds:{'ally:90001:default':.5},unknown:7}}),required=new h.Asset('required');let result;
 h.api.preloadConstruction(h.config,[h.prefab([required])],(error,value)=>{assert.ifError(error);result=value;});h.deliver('characters/catalog');h.deliver('character-parts/catalog',null,{json});h.drive();
 assert.equal(result.requiredReady,true);assert.equal(result.ready,false);assert(result.fallbacks.some(row=>row.resource==='character-parts/catalog'));assert.equal(h.private('library'),null);assert.equal(required.parsed,true);
 const actor=harmlessAppearance(h),requests=h.loads.length;for(let i=0;i<4;i++)assert.doesNotThrow(()=>h.api.component.prototype.lateUpdate.call(actor.appearance));assert.equal(h.loads.length,requests,'Bad metadata obeys backoff');assert.equal(actor.actor.spAni.skeletonData.uuid,'prefab');assert.equal(h.api.animationSpeed(actor.actor,'ally'),.5);assert.equal(h.instances(),0);
});

test('parts deadline drains all waiters, rejects stale replies, and retry publishes only a validated new map',()=>{
 const h=fixture({coldLibrary:true}),preload=h.private('preloadLibrary'),calls=[],first=Error('consumer');preload(error=>{assert.match(error.message,/timed out/);calls.push('a');throw first;},true);preload(error=>{assert.match(error.message,/timed out/);calls.push('b');},true);const old=h.requests[0];old.done=true;const timer=[...h.timers.values()].find(t=>t.delay===20000);assert.throws(()=>timer.callback(),error=>error===first);assert.deepEqual(calls,['a','b']);assert.equal(h.private('library'),null);assert.equal(h.timers.size,0);
 preload(error=>assert.ifError(error),true);h.deliver('character-parts/catalog',null,{json:{parts:[{id:'new',resource:'parts/new'}]}});old.callback(null,{json:{parts:[{id:'stale',resource:'parts/stale'}]}});assert(h.private('library').new);assert.equal(h.private('library').stale,undefined);assert.equal(h.timers.size,0);assert.equal(h.instances(),0);
});

test('cancelled metadata owner cannot advance stale construction while a valid coalesced owner survives',()=>{
 const h=fixture({coldLibrary:true}),calls=[],prefab=h.prefab([new h.Asset('required')]);const old=h.api.preloadConstruction(h.config,[prefab],()=>calls.push('old')),live=h.api.preloadConstruction(h.config,[prefab],()=>calls.push('live'));h.deliver('characters/catalog');assert.equal(h.loads.filter(p=>p==='character-parts/catalog').length,1);old.cancel();h.deliver('character-parts/catalog');h.drive();assert.deepEqual(calls,['live']);assert.equal(h.instances(),0);live.cancel();
});

test('actual BuildingWarmup metadata waiter retires before Scene pointer changes and cannot prepare stale menus',()=>{
 const h=integrated({coldLibrary:true});h.warm.preload(()=>h.callbacks.push('old'));h.resources();h.deliver('characters/catalog');const request=h.requests.find(r=>r.resource==='character-parts/catalog');assert(request);const oldScene=h.scene();h.retireScene();assert.equal(h.scene(),oldScene);h.deliver('character-parts/catalog');assert.equal(h.frames.length,0);assert.equal(h.menus.length,0);assert.deepEqual(h.callbacks,[]);assert.equal(h.sceneListeners.length,0);
 h.setScene({name:'replacement Loading'});h.warm.preload(()=>h.callbacks.push('new'));h.zeros();h.drive();assert.equal(h.loads.filter(p=>p==='character-parts/catalog').length,1);assert.equal(h.menus.length,1);h.menus[0]();h.menuPaint[0](null,{ready:true});assert.deepEqual(h.callbacks,['new']);assert.equal(h.instances(),0);
});

test('parts request callback failures drain remaining waiters without losing a valid cache',()=>{
 const h=fixture({coldLibrary:true}),preload=h.private('preloadLibrary'),calls=[],first=Error('first');preload(()=>{calls.push(1);throw first;},true);preload(()=>calls.push(2),true);assert.throws(()=>h.deliver('character-parts/catalog'),error=>error===first);assert.deepEqual(calls,[1,2]);assert(h.private('library'));assert.equal(h.timers.size,0);preload(()=>calls.push(3));assert.deepEqual(calls,[1,2,3]);assert.equal(h.loads.length,1);
});

test('actual published 694-part metadata satisfies the minimal readonly schema with every unknown field preserved',()=>{
 const h=fixture({coldLibrary:true}),json=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/resources/character-parts/catalog.json'))),before=JSON.stringify(json);frozen(json);let called=0;h.private('preloadLibrary')(error=>{assert.ifError(error);called++;},true);h.deliver('character-parts/catalog',null,{json});assert.equal(called,1);assert(json.parts.length>0);assert.equal(Object.keys(h.private('library')).length,json.parts.length);for(const part of json.parts)assert.equal(h.private('library')[part.id],part);assert.equal(JSON.stringify(json),before);assert.deepEqual(h.loads,['character-parts/catalog']);assert.equal(h.instances(),0);assert.equal(h.parses.length,0);
});

for(const shape of['_uuid','uuid'])test('already selected '+shape+' baked SkeletonData bypasses resource lookup and double overlay without a marker',()=>{
 const catalog={assignments:{'ally:90001:default':'selected'},profiles:{selected:{baked:{uuid:'selected-bake',resource:'never/load'},parts:[{layer:'selected-bake',sprite:'unused'}]}}},h=fixture({native:false,catalog}),original={skeletonJson:{},[shape]:'selected-bake'},actor={node:{activeInHierarchy:true},cfg:{ID:90001},spAni:{node:{activeInHierarchy:true},skeletonData:original}};h.api.preload(error=>assert.ifError(error));h.deliver('characters/catalog');const appearance={owner:actor,team:'ally',models:[],states:[],clear(){throw Error('Already baked must not prepare or clear overlays');}};
 assert.doesNotThrow(()=>h.api.component.prototype.lateUpdate.call(appearance));assert.equal(actor.spAni.skeletonData,original);assert.deepEqual(h.loads,['characters/catalog']);assert.equal(h.parses.length,0);assert.equal(h.instances(),0);
});

for(const shape of['_uuid','uuid'])test('nonbaked '+shape+' data routes parts, transforms and skins using saved asset IDs',()=>{
 const layer='source-layer',part={layer,sprite:'hat'},catalog={assignments:{'ally:90001:default':'custom'},profiles:{custom:{parts:[part],models:{[layer]:{x:7,y:-8,rotation:11,opacity:.5,scaleX:1.5,scaleY:.75}},skins:{[layer]:'alternate'}}}},h=fixture({native:false,catalog}),core=h.private('Core'),prepared=[],skinned=[];core.skinTint=()=>null;core.restore=()=>{};core.apply=()=>{};core.prepare=(_runtime,skeleton,parts)=>{prepared.push({skeleton,parts});return{skeleton};};h.private('textureJobs.hat = { texture: {} }');h.api.preload(error=>assert.ifError(error));h.deliver('characters/catalog');
 const data={[shape]:layer,skeletonJson:{}},node={activeInHierarchy:true,scaleX:-2,scaleY:3,x:10,y:20,angle:4,opacity:200},renderer={uuid:'renderer-id',node,skeletonData:data,_skeleton:{skin:{name:'default'}},setSlotsToSetupPose(){},setSkin(name){skinned.push(name);this._skeleton.skin={name};}},actor={node:{activeInHierarchy:true},cfg:{ID:90001},spAni:renderer},appearance={owner:actor,team:'ally',states:[],models:[],signature:'',clear:h.api.component.prototype.clear};
 h.api.component.prototype.lateUpdate.call(appearance);assert.equal(prepared.length,1);assert.equal(prepared[0].parts.length,1);assert.equal(prepared[0].parts[0],part);assert.deepEqual(skinned,['alternate']);assert.equal(node.x,17);assert.equal(node.y,12);assert.equal(node.angle,15);assert.equal(node.opacity,100);assert.equal(node.scaleX,-3);assert.equal(node.scaleY,2.25);assert.match(appearance.signature,/renderer-id:source-layer/);assert.deepEqual(h.loads,['characters/catalog']);assert.equal(h.instances(),0);
});

for(const shape of['_uuid','uuid'])test('nonbaked '+shape+' asset replacement invalidates the saved appearance signature',()=>{
 const catalog={assignments:{'ally:90001:default':'custom'},profiles:{custom:{parts:[]}}},h=fixture({native:false,catalog}),core=h.private('Core');core.skinTint=()=>null;core.restore=()=>{};core.apply=()=>{};h.api.preload(error=>assert.ifError(error));h.deliver('characters/catalog');let clears=0;const node={activeInHierarchy:true,scaleX:1,scaleY:1},renderer={uuid:'same-renderer',node,skeletonData:{[shape]:'source-A',skeletonJson:{}},_skeleton:{}},actor={node:{activeInHierarchy:true},cfg:{ID:90001},spAni:renderer},appearance={owner:actor,team:'ally',states:[],models:[],clear(){clears++;h.api.component.prototype.clear.call(this);}};
 h.api.component.prototype.lateUpdate.call(appearance);assert.match(appearance.signature,/same-renderer:source-A/);renderer.skeletonData={[shape]:'source-B',skeletonJson:{}};h.api.component.prototype.lateUpdate.call(appearance);assert.match(appearance.signature,/same-renderer:source-B/);assert.equal(clears,2);assert.equal(h.instances(),0);
});

test('runtime _uuid takes precedence over a compatibility uuid alias without changing saved DTOs',()=>{
 const h=fixture(),asset={_uuid:'runtime-id',uuid:'compatibility-id'},reader=h.private('skeletonDataId');assert.equal(reader(asset),'runtime-id');assert.equal(reader({uuid:'legacy'}),'legacy');assert.equal(reader(null),null);assert.deepEqual(asset,{_uuid:'runtime-id',uuid:'compatibility-id'});
});

test('stage priming preserves retained construction bakes without pinning unrelated stage effects',()=>{
 const h=fixture(),completed=[];h.api.preloadConstruction(h.config,[],(error,status)=>completed.push({error,status}));h.drive();
 assert.equal(completed.length,1);assert.ifError(completed[0].error);
 const one=h.assetMap['baked/one'],two=h.assetMap['baked/two'],effect=new h.Asset('stage-effect'),requests=h.requests.length,parses=h.parses.length;
 effect.getRuntimeData();const before=JSON.stringify(h.catalog);
 for(let i=0;i<3;i++)h.api.prime(h.catalog,{parts:[]},{'resources/baked/one:spine':one,'resources/stage-effect:spine':effect});
 assert.equal(one.refs,1,'priming must not discard or duplicate the existing cache lease');assert.equal(two.refs,1,'another prepared construction level remains owned');
 assert.equal(effect.refs,0,'only the stage owns unrelated effects');assert.equal(h.requests.length,requests);assert.equal(h.frames.length,0,'decoded stage assets need no deferred preparation');
 assert.equal(h.parses.length,parses+1,'priming inspects the existing runtime cache without a second parse');
 assert.equal(h.private("bakedJobs['baked/one'].runtimeReady"),true);assert.equal(h.private("bakedJobs['baked/two'].runtimeReady"),true);assert.equal(JSON.stringify(h.catalog),before);
});

test('stage priming settles an in-flight baked request once while coalesced construction owners retain cancellation',()=>{
 const h=fixture(),retired=[],live=[];
 const first=h.api.preloadConstruction(h.config,[],(error,status)=>retired.push({error,status}));h.api.preloadConstruction(h.config,[],(error,status)=>live.push({error,status}));
 h.deliver('characters/catalog');h.tick();assert(h.requests.some(request=>request.resource==='baked/one'&&!request.done));
 const one=new h.Asset('level-1'),two=new h.Asset('level-2'),late=new h.Asset('late-old-request');one.getRuntimeData();two.getRuntimeData();
 h.api.prime(h.catalog,{parts:[]},{'resources/baked/one:spine':one,'resources/baked/two:spine':two});first.cancel();
 h.deliver('baked/one',null,late);h.drive();
 assert.equal(retired.length,0);assert.equal(live.length,1);assert.ifError(live[0].error);assert.equal(live[0].status.ready,true);
 assert.equal(one.refs,1);assert.equal(two.refs,1,'consuming a stage-lent bake acquires one appearance-cache lease');assert.equal(late.refs,0,'a late reply cannot retain or replace another stage asset');
 assert.equal(h.private("bakedJobs['baked/one'].asset"),one);assert.equal(h.timers.size,0);
});

test('stage priming completes pending catalog owners and rejects late older catalog replies',()=>{
 const h=fixture({coldLibrary:true}),calls=[],catalog={profiles:{},assignments:{},StageField:{keep:true}},parts={parts:[{id:'stage-part',resource:'parts/stage',FutureField:17}]};
 h.api.preloadConstruction(h.config,[],(error,status)=>{assert.ifError(error);assert(status.ready);calls.push('construction');});
 h.api.preload(error=>{assert.ifError(error);calls.push('catalog');});
 h.api.prime(catalog,parts,{});
 assert.equal(h.private('looksLoading'),false);assert.equal(h.private('looksCallbacks.length'),0);assert.deepEqual(calls,['catalog']);
 h.drive();assert.deepEqual(calls,['catalog','construction']);assert.equal(h.private('looks'),catalog);assert.equal(h.private("library['stage-part']"),parts.parts[0]);
 assert.deepEqual(h.loads,['characters/catalog'],'primed metadata must not issue another parts request');assert.equal(h.timers.size,0);
});

test('stage priming completes pending parts owners without reviving cancelled owners or replacing stage metadata',()=>{
 const h=fixture({coldLibrary:true}),calls=[],catalog={profiles:{},assignments:{}},parts={parts:[{id:'stage-part',resource:'parts/stage',FutureField:{keep:true}}]},before=JSON.stringify(parts);
 const retired=h.api.preloadConstruction(h.config,[],()=>calls.push('retired'));h.api.preloadConstruction(h.config,[],(error,status)=>{assert.ifError(error);assert(status.ready);calls.push('live');});
 h.deliver('characters/catalog');assert(h.requests.some(request=>request.resource==='character-parts/catalog'&&!request.done));retired.cancel();
 h.api.prime(catalog,parts,{});assert.equal(h.private('libraryJob'),null);
 h.drive();assert.deepEqual(calls,['live']);assert.equal(h.private("library['stage-part']"),parts.parts[0]);assert.equal(h.private('looks'),catalog);
 assert.equal(h.loads.filter(resource=>resource==='character-parts/catalog').length,1);assert.equal(h.timers.size,0);assert.equal(JSON.stringify(parts),before);
});

test('stage priming drains both metadata jobs even when one consumer throws and late replies stay retired',()=>{
 const h=fixture({coldLibrary:true}),calls=[],first=Error('parts consumer'),second=Error('catalog consumer'),catalog={profiles:{},assignments:{}},parts={parts:[{id:'stage-part',resource:'parts/stage'}]};
 h.api.preload(()=>{calls.push('catalog-a');throw second;});h.api.preload(()=>calls.push('catalog-b'));
 const preload=h.private('preloadLibrary');preload(()=>{calls.push('parts-a');throw first;},true);preload(()=>calls.push('parts-b'),true);
 assert.throws(()=>h.api.prime(catalog,parts,{}),error=>error===first);assert.deepEqual(calls,['parts-a','parts-b','catalog-a','catalog-b']);
 assert.equal(h.private('looksLoading'),false);assert.equal(h.private('libraryJob'),null);assert.equal(h.timers.size,0);
 h.deliver('characters/catalog');h.deliver('character-parts/catalog');assert.equal(calls.length,4);
 assert.equal(h.private('looks'),catalog);assert.equal(h.private("library['stage-part']"),parts.parts[0]);
});

for(const native of[true,false])for(const failed of[true,false])test((native?'Native':'Browser')+' stage priming keeps '+(failed?'quarantined':'cold')+' null-runtime bakes out of actual appearance publication',()=>{
 const h=fixture({native}),bad=new h.Asset('level-1');bad.empty=true;h.assetMap['baked/one']=bad;h.catalog.profiles.one.parts=[];
 if(failed){let result;h.api.preloadConstruction(h.config,[],(error,value)=>{assert.ifError(error);result=value;});h.drive();assert.equal(result.ready,false);}
 assert.equal(bad.getRuntimeData(),null,'Match StageAssetWarmup.decode accepting a nonthrowing typed Spine failure');const parses=bad.calls;
 h.api.prime(h.catalog,{parts:[]},{'resources/baked/one:spine':bad});
 let data={uuid:'prefab',skeletonJson:{}},applied=[];const renderer={node:{activeInHierarchy:true},defaultSkin:'default',defaultAnimation:'idle',get skeletonData(){return data;},set skeletonData(value){applied.push(value);data=value;},getCurrent(index){return index?null:{animation:{name:'idle'},loop:true,trackTime:.5,timeScale:1};},setSkin(){},setAnimation(){return{};}},appearance={owner:{node:{activeInHierarchy:true},cfg:{ID:90001},outBuild:{buildInfo:{cfg:{level:1}}},spAni:renderer},team:'ally',states:[],models:[],clear(){}};
 for(let i=0;i<3;i++){h.api.component.prototype.lateUpdate.call(appearance);h.advance(2000);h.drive();}
 assert.deepEqual(applied,[]);assert.equal(data.uuid,'prefab');assert.equal(bad.calls,parses,'prime and same-revision retries must not parse or publish a known failed bake');assert.equal(bad.refs,0);assert(h.warnings.length);
});
