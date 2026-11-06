'use strict';
// Exercise actual Creator 2.4.13 Spine AnimationState/timelines, with a small
// Creator component/asset adapter. Set COCOS_ENGINE_ROOT on other installations.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const engine=process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const spine=require(path.join(engine,'extensions/spine/lib/spine.js'));
const source=fs.readFileSync(path.join(__dirname,'../../assets/_script/LocalizedArtwork.js'),'utf8');
function runtimeData(){
  const data=new spine.SkeletonData();data.bones.push(new spine.BoneData(0,'root',null));
  const skin=new spine.Skin('default'),blue=new spine.Skin('blue');data.skins.push(skin,blue);data.defaultSkin=skin;
  ['victory','idle','overlay'].forEach((name,i)=>{const timeline=new spine.RotateTimeline(2);timeline.boneIndex=0;timeline.setFrame(0,0,0);timeline.setFrame(1,2,80+i*20);data.animations.push(new spine.Animation(name,[timeline],2));});
  return data;
}
function fixture(native=false){
  const requests=[],warnings=[];
  class Texture{constructor(uuid,width=256,height=128){this._uuid=uuid;this.width=width;this.height=height;this.refs=0;}addRef(){this.refs++;return this;}}
  class Data{constructor(){this._uuid='';this.name='settlement';this.skeletonJson={bones:[{name:'root'}]};this.atlasText='page.png\n';this.textureNames=['page.png'];this.textures=[];this.scale=1;this.refs=0;}getRuntimeData(){return this.runtime||(this.runtime=runtimeData());}addRef(){this.refs++;return this;}}
  class Skeleton{
    constructor(cached=false){this.cached=cached;this.node={width:500,height:200,x:7,y:-23,scaleX:0.7,scaleY:0.9,angle:11,anchorX:0.2,anchorY:0.6,setContentSize(w,h){this.width=w;this.height=h;}};this.loop=false;this.paused=false;this.timeScale=1;this.defaultSkin='';this.defaultAnimation='';this._animationQueue=[];this.setCalls=0;this.destroyCalls=0;}
    get skeletonData(){return this._N$skeletonData;}
    set skeletonData(value){this._N$skeletonData=value;this.setCalls++;this.defaultSkin='';this.defaultAnimation='';this._skeleton=value?new spine.Skeleton(value.getRuntimeData()):null;const state=value?new spine.AnimationState(new spine.AnimationStateData(value.getRuntimeData())):null;this._state=native?null:state;this._nativeState=native?state:null;if(this._listener&&state)state.addListener(this._listener);this._animationQueue=[];this.node.setContentSize(99,33);}
    isAnimationCached(){return this.cached;}
    setSkin(name){this._skeleton.setSkinByName(name);}
    nativeEntry(entry){if(native)['trackTime','animationLast','timeScale','alpha','delay','mixTime','mixDuration','animationStart','animationEnd','trackEnd'].forEach(key=>{entry['set'+key[0].toUpperCase()+key.slice(1)]=value=>{entry[key]=value;};});return entry;}
    getState(){return native?this._nativeState:this._state;}
    setAnimation(index,name,loop){this._animationName=name;this._playTimes=loop?0:1;if(this.cached){this._accTime=0;this._playCount=0;this._isAniComplete=false;this._frameCache={frames:[],updateToFrame(n){while(this.frames.length<=n)this.frames.push({index:this.frames.length});}};this._frameCache.updateToFrame(0);this._curFrame=this._frameCache.frames[0];return null;}const entry=this.getState().setAnimation(index,name,loop);this.getState().apply(this._skeleton);return this.nativeEntry(entry);}
    addAnimation(index,name,loop,delay){return this.nativeEntry(this.getState().addAnimation(index,name,loop,delay));}
    getCurrent(index){return this.getState().getCurrent(index);}
    setTrackCompleteListener(entry,callback){entry.listener={complete:callback};}
    setMix(from,to,duration){this.getState().data.setMix(from,to,duration);}
    onEnable(){}onDestroy(){this.destroyCalls++;}
  }
  const cc={Texture2D:Texture,isValid:v=>!!v&&!v.destroyed,warn(...args){warnings.push(args);},resources:{load(url,type,callback){requests.push({url,callback});}},assetManager:{loadAny(url,callback){requests.push({url,callback});}},director:{getScene(){return null;}}};
  const context={cc,sp:{Skeleton,SkeletonData:Data},exports:{},CC_EDITOR:false,CC_JSB:native};vm.runInNewContext(source,context);
  const manager={ready:true,currentLan:'en',_missing:{},catalog:{entries:{victory:{en:'VICTORY',zh:'胜利'},defeat:{en:'DEFEAT',zh:'失败'}},spineImages:{page:{template:'settlement_atlas',preserveOriginal:{zh:{victory:'胜利',defeat:'失败'}}}},artTemplates:{settlement_atlas:{width:256,height:128}}},getCurrentLanguage(){return this.currentLan;},_entry(key,language){return this.catalog.entries[key][language];}};
  const service=new context.exports.SpineArtwork();service.install(manager);
  const original=new Data();original._uuid='settlement';original.textures=[new Texture('page')];
  function component(cached=false){const s=new Skeleton(cached);s.skeletonData=original;s.node.setContentSize(500,200);return s;}
  function language(value){manager.currentLan=value;service.refresh();}
  return{context,manager,service,original,Texture,Data,Skeleton,component,language,requests,warnings};
}
function shape(s){return JSON.stringify(Object.fromEntries(Object.entries(s.node).filter(([,v])=>typeof v!=='function')));}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}

test('Spine scanning descends from Scene without reading its unsupported component getter',()=>{
  const f=fixture();let sceneReads=0,refreshes=0;
  class Scene{get getComponent(){sceneReads++;throw Error('Scene has no components');}}
  f.context.cc.Scene=Scene;const scene=new Scene(),component={};
  scene.children=[{getComponent(Type){assert.equal(Type,f.Skeleton);return component;},children:[]}];
  f.context.cc.director.getScene=()=>scene;f.service.refreshSkeleton=value=>{assert.equal(value,component);refreshes++;};
  f.service.refresh();f.service.refresh();assert.equal(refreshes,2);assert.equal(sceneReads,0);
});
test('Clones atlas assets without modifying shared originals; preserves active tracks, queues, skin, timing and node geometry',()=>{
  const f=fixture(),a=f.component(),b=f.component(),before=shape(a),originalData=f.original.getRuntimeData(),originalAnimations=originalData.animations.slice();
  let starts=0,completed=0;const listener={start(){starts++;},complete(){completed++;}};a._listener=listener;a._state.addListener(listener);
  const active=a.setAnimation(0,'victory',false);active.trackTime=1.2;active.animationLast=1.1;active.nextAnimationLast=1.1;active.trackLast=1.1;active.nextTrackLast=1.1;active.timeScale=0.8;active.listener={complete(){completed++;}};
  const queue=a.addAnimation(0,'idle',true,0.6);queue.timeScale=0.6;const overlay=a.setAnimation(1,'overlay',true);overlay.trackTime=0.4;
  a.setSkin('blue');a.defaultSkin='default';a.defaultAnimation='victory';a.loop=false;a.paused=true;a.timeScale=0.7;
  a._state.data.defaultMix=0.15;a._state.data.setMix('victory','idle',0.4);const startsBefore=starts;
  const localized=new f.Texture('en');assert.equal(f.requests.length,1,'shared atlas has one in-flight load');f.requests[0].callback(null,localized);
  assert.notEqual(a.skeletonData,f.original);assert.equal(a.skeletonData,b.skeletonData);assert.equal(a.skeletonData.textures[0],localized);
  assert.equal(f.original.textures[0]._uuid,'page');assert.equal(f.original.getRuntimeData(),originalData);assert.deepEqual(originalData.animations,originalAnimations);
  assert.notEqual(a.skeletonData.textureNames,f.original.textureNames);assert.equal(a.skeletonData.atlasText,f.original.atlasText);assert.equal(a.skeletonData.skeletonJson,f.original.skeletonJson);
  assert.equal(a.getCurrent(0).animation.name,'victory');assert.equal(a.getCurrent(0).trackTime,1.2);assert.equal(a.getCurrent(0).animationLast,1.1);assert.equal(a.getCurrent(0).timeScale,0.8);assert.equal(a.getCurrent(0).listener,active.listener);
  assert.equal(a.getCurrent(0).next.animation.name,'idle');assert.equal(a.getCurrent(0).next.delay,queue.delay);assert.equal(a.getCurrent(0).next.timeScale,0.6);assert.equal(a.getCurrent(1).trackTime,0.4);
  assert.equal(a._skeleton.skin.name,'blue');assert.equal(a._state.data.defaultMix,0.15);assert.equal(a._state.data.getMix(a.findAnimation?.('victory')||a._skeleton.data.findAnimation('victory'),a._skeleton.data.findAnimation('idle')),0.4);
  assert.equal(a.paused,true);assert.equal(a.timeScale,0.7);assert.equal(a.loop,false);assert.equal(shape(a),before);assert.equal(starts,startsBefore);assert.equal(completed,0);
  const calls=a.setCalls;f.service.refresh();assert.equal(a.setCalls,calls,'refresh does not restart the same animation');
  f.language('zh');assert.equal(a.skeletonData,f.original);assert.equal(a.getCurrent(0).trackTime,1.2);assert.equal(shape(a),before);
});
test('Language races, external data replacement and destruction reject late asynchronous swaps',()=>{
  const f=fixture(),a=f.component();f.language('zh');f.requests[0].callback(null,new f.Texture('late-en'));assert.equal(a.skeletonData,f.original);
  f.language('en');assert.notEqual(a.skeletonData,f.original,'cached locale switches synchronously');
  f.manager.catalog.entries.victory.zh='全新胜利';f.language('zh');const late=f.requests.at(-1),replacement=new f.Data();replacement._uuid='unrelated';replacement.textures=[new f.Texture('unmapped')];a.skeletonData=replacement;
  late.callback(null,new f.Texture('late-zh'));assert.equal(a.skeletonData,replacement);assert.equal(f.service.components.has(a),false);
  const b=f.component();f.language('en');b.onDestroy();assert.equal(f.service.components.has(b),false);assert.equal(b.destroyCalls,1);
  const g=fixture(),c=g.component();c.node.destroyed=true;g.requests[0].callback(null,new g.Texture('late'));assert.equal(c.skeletonData,g.original);
});
test('Matching Chinese/pending/excluded templates retain source; edited Chinese loads generated atlas',()=>{
  const f=fixture();f.manager.currentLan='zh';const a=f.component();assert.equal(f.requests.length,0);assert.equal(a.skeletonData,f.original);
  f.manager.catalog.entries.defeat.zh='新失败';f.service.refreshSkeleton(a);assert.equal(f.requests[0].url,'localization/generated/zh/settlement_atlas');f.requests[0].callback(null,new f.Texture('edited-zh'));assert.notEqual(a.skeletonData,f.original);
  f.manager.catalog.artTemplates.settlement_atlas.pending=true;f.service.refreshSkeleton(a);assert.equal(a.skeletonData,f.original);
  f.manager.catalog.artTemplates.settlement_atlas.pending=false;f.manager.catalog.artTemplates.settlement_atlas.languages=['en'];f.service.refreshSkeleton(a);assert.equal(a.skeletonData,f.original);assert.equal(f.requests.length,1);
});
test('Failed/malformed/wrong-size atlases retain source and audit failures; retry can recover',()=>{
  const f=fixture(),a=f.component();f.requests[0].callback(new Error('not found'));assert.equal(a.skeletonData,f.original);assert(f.service.getAudit().errors['localization/generated/en/settlement_atlas']);
  f.service.refreshSkeleton(a);f.requests.at(-1).callback(null,{});assert.equal(a.skeletonData,f.original);
  f.service.refreshSkeleton(a);f.requests.at(-1).callback(null,new f.Texture('wrong-size',10,10));assert.equal(a.skeletonData,f.original);
  // The resource cache must evict a dimension mismatch to allow an asset correction.
  f.service.refreshSkeleton(a);f.requests.at(-1).callback(null,new f.Texture('fixed'));assert.notEqual(a.skeletonData,f.original);
});
test('Cached animations retain current frame, completed state and queued animations',()=>{
  const f=fixture(),a=f.component(true),before=shape(a);a.setAnimation(0,'victory',false);a._frameCache.updateToFrame(30);a._curFrame=a._frameCache.frames[30];a._accTime=0.5;a._playCount=2;a._playTimes=1;a._isAniComplete=true;a._animationQueue=[{animationName:'idle',loop:true,delay:0.2}];a._headAniInfo={animationName:'overlay',loop:false,delay:0.1};a.paused=true;a.timeScale=0.3;a.setSkin('blue');
  f.requests[0].callback(null,new f.Texture('en'));assert.equal(a._curFrame.index,30);assert.equal(a._accTime,0.5);assert.equal(a._playCount,2);assert.equal(a._playTimes,1);assert.equal(a._isAniComplete,true);assert.equal(a._animationQueue[0].animationName,'idle');assert.equal(a._headAniInfo.animationName,'overlay');assert.equal(a.paused,true);assert.equal(a.timeScale,0.3);assert.equal(a._skeleton.skin.name,'blue');assert.equal(shape(a),before);
});
test('Result-banner completion callbacks still fire once and advance to the queued idle animation',()=>{
  const f=fixture(),a=f.component();let completed=0;
  const entry=a.setAnimation(0,'victory',false);entry.trackTime=0.8;entry.trackLast=0.75;entry.nextTrackLast=0.75;entry.animationLast=0.75;entry.nextAnimationLast=0.75;entry.listener={complete(){completed++;}};
  a.addAnimation(0,'idle',true,0);f.requests[0].callback(null,new f.Texture('en'));assert.equal(completed,0);
  a._state.update(1.3);a._state.apply(a._skeleton);assert.equal(completed,1);a._state.update(0.1);a._state.apply(a._skeleton);assert.equal(a.getCurrent(0).animation.name,'idle');assert.equal(completed,1);
  f.language('zh');assert.equal(a.getCurrent(0).animation.name,'idle');assert.equal(completed,1);
});
test('Preloading skips unfinished atlases and reuses loaded textures',()=>{
  const f=fixture();let called=0;f.service.preload(errors=>{assert.equal(errors.length,0);called++;});assert.equal(f.requests.length,1);f.requests[0].callback(null,new f.Texture('en'));assert.equal(called,1);const a=f.component();assert.notEqual(a.skeletonData,f.original);assert.equal(f.requests.length,1);
  const h=fixture();h.manager.catalog.artTemplates.settlement_atlas.pending=true;h.service.preload(errors=>{assert.equal(errors.length,0);called++;});assert.equal(h.requests.length,0);assert.equal(called,2);
});
test('Native adapter-shaped state uses supported getters/setters and retains completion callbacks',()=>{
  const f=fixture(true),a=f.component(),before=shape(a);let completed=0;const entry=a.setAnimation(0,'victory',false);entry.trackTime=0.8;entry.animationLast=0.75;a.addAnimation(0,'idle',true,0);a.setTrackCompleteListener(entry,()=>completed++);a.setMix('victory','idle',0.2);a.setSkin('blue');a.paused=true;a.timeScale=0.7;
  f.requests[0].callback(null,new f.Texture('native-en'));assert.notEqual(a.skeletonData,f.original);assert.equal(a.getCurrent(0).trackTime,0.8);assert.equal(a.getCurrent(0).animationLast,0.75);assert.equal(a.getCurrent(0).next.animation.name,'idle');assert.equal(a._skeleton.skin.name,'blue');assert.equal(a.paused,true);assert.equal(a.timeScale,0.7);assert.equal(shape(a),before);assert.equal(completed,0);
  a.getState().update(1.3);a.getState().apply(a._skeleton);assert.equal(completed,1);f.language('zh');assert.equal(a.skeletonData,f.original);assert.equal(completed,1);assert.equal(f.warnings.length,0);
});
console.log(passed+' Spine artwork checks passed using the installed Creator Spine 3.8 runtime.');
