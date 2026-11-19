'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const reset=require('../../assets/_script/ProgressReset');
function storage(values){const data=new Map(values);return {data,get length(){return data.size;},key:i=>Array.from(data.keys())[i]??null,getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};}
function cache(store){const unit={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/CacheUtils.js'),'utf8'),{exports:unit.exports,localStorage:store,console,require:name=>name==='PlatformManager'?{PlatformManager:{currentPlatform:0}}:name==='BasePlatform'?{Platform:{WECHAT:1,BYTEDANCE:2}}:{}});return unit.exports.CacheUtils;}
test('Browser reset clears all game namespaces and journals while keeping unrelated settings',()=>{
  const store=storage([['KinghtFall:UserData','user'],['KinghtFall:GuideData','guide'],['KinghtFall:UserData.rewardJournal','pending'],['KinghtFall:gad_udata','wall'],['KinghtFall:future','unknown'],['MUSICVOLUME','.3'],['project-cocos.language','zh'],['other:save','kept']]),before=reset.snapshot(store);
  assert.equal(reset.clear(store,before,['KinghtFall:'],'new generation'),5);
  assert.equal(store.getItem('KinghtFall:UserData.rewardJournal'),null);assert.equal(store.getItem('MUSICVOLUME'),'.3');assert.equal(store.getItem('project-cocos.language'),'zh');assert.equal(store.getItem('other:save'),'kept');
});
test('an older Browser game cannot restore its cached save or reward journal after reset',()=>{
  const store=storage([['KinghtFall:UserData','old user']]),older=cache(store);
  assert.equal(older.saveData('KinghtFall:GuideData','old guide'),true);
  reset.clear(store,reset.snapshot(store),['KinghtFall:'],'new generation');
  for(const key of ['KinghtFall:UserData','KinghtFall:UserData.rewardJournal'])assert.equal(older.saveData(key,'stale state'),false);
  assert.equal(older.clearAll(),false);
  const fresh=cache(store);assert.equal(fresh.saveData('KinghtFall:UserData','new user'),true);assert.equal(store.getItem('KinghtFall:UserData'),'new user');
});

test('clearing a progressed player reloads the original tutorial, Stage 1 and starting progression through the real saved data classes',()=>{
  const {harness}=require('./persistence-harness.cjs'),old=harness(),p=old.player;
  Object.assign(p.udata.data,{curStage:24,maxStage:24,maxOrder:8,goldNum:999999,diamondNum:999,wallDefenseBestWave:50,treasureInfo:[{id:120001,level:5,frame:12}],talentInfo:[{id:1,isLock:true}],personLevel:[25,25,25,50,25,25]});
  Object.assign(p.guideData.data,{GroupId:7,stepId:3,tips:[0,1,1,1,1,1],listTime:{gift:1}});
  Object.assign(p.gameData.data,{levelNum:24,roundNum:8,coin:1000});p.rewardRecords().forEach(row=>row.saveData());
  old.storage.set(p.rewardJournalKey(),'old pending reward');old.storage.set('testgad_udata','old wall defense');old.storage.set('project-cocos.language','en');
  const store=storage(Array.from(old.storage));reset.clear(store,reset.snapshot(store),['test'],'reset');
  const fresh=harness(Object.fromEntries(store.data)),user=fresh.player.udata,guide=fresh.player.guideData;
  assert.equal(user.getStage(),1);assert.equal(user.getMaxStage(),1);assert.equal(user.getMaxOrder(),0);assert.equal(user.getGoldNum(),0);assert.equal(user.getDiamondNum(),0);assert.equal(user.data.wallDefenseBestWave,0);
  assert.equal(guide.getGroupId(),1);assert.equal(guide.getStepId(),0);assert.equal(guide.data.tips.length,0);assert.equal(user.data.talentInfo.length,0);assert.equal(user.data.treasureInfo.length,0);
  assert.equal(fresh.player.gameData.data.levelNum,-1);assert(!store.data.has(p.rewardJournalKey()));assert.equal(store.getItem('project-cocos.language'),'en');
});

test('the Browser reset page intercepts startup before preloads, player initialization or audio playback',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../assets/_script/Loading.js'),'utf8'),unit={exports:{}};
  const component=function(){};component.prototype={};
  vm.runInNewContext(source,{exports:unit.exports,require:name=>name==='ProgressReset'?{openIfRequested:()=>true}:{},__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(_d,target,key)=>key===undefined?target:undefined,cc:{Component:component,_decorator:{ccclass:value=>value,property:()=>()=>{}}}});
  const loader=new unit.exports.default();assert.doesNotThrow(()=>loader.onLoad());assert.equal(loader._resetProgressPage,true);assert.doesNotThrow(()=>loader.start());assert.equal(loader.gameStarted,undefined);
  const start={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/StartScreen.js'),'utf8'),{module:start,require:name=>name==='ProgressReset'?{openIfRequested:()=>true}:{},cc:{Class:definition=>definition}});
  assert.doesNotThrow(()=>start.exports.onLoad());assert.equal(start.exports._resetProgressPage,true);assert.doesNotThrow(()=>start.exports.beginLoading());
});
test('a changed Browser save cancels before any deletion and an interrupted deletion restores all original progress',()=>{
  const store=storage([['KinghtFall:user','original'],['KinghtFall:guide','step']]),before=reset.snapshot(store);store.setItem('KinghtFall:user','changed');
  assert.throws(()=>reset.clear(store,before,['KinghtFall:'],'new'),/save changed/);assert.equal(store.getItem(reset.EPOCH_KEY),null);
  const current=reset.snapshot(store),remove=store.removeItem;store.removeItem=key=>{if(key.endsWith('user'))throw Error('storage blocked');return remove(key);};
  assert.throws(()=>reset.clear(store,current,['KinghtFall:'],'new'),/storage blocked/);assert.equal(store.getItem('KinghtFall:user'),'changed');assert.equal(store.getItem('KinghtFall:guide'),'step');
});
test('opening normal games, release builds, the editor and native games never opens a reset page or mutates progress',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../assets/_script/ProgressReset.js'),'utf8');
  for(const flags of [{},{CC_DEBUG:true,CC_EDITOR:true},{CC_DEBUG:true,native:true},{CC_PREVIEW:true}]){
    const store=storage([['KinghtFall:user','saved']]),unit={exports:{}};let nodes=0;
    vm.runInNewContext(source,{exports:unit.exports,...flags,URL,window:{location:{href:'http://localhost:7456/',origin:'http://localhost:7456'}},document:{createElement(){nodes++;throw Error('Unexpected reset UI');}},cc:{sys:{isNative:!!flags.native,localStorage:store}}});
    assert.equal(unit.exports.openIfRequested(),false);assert.equal(nodes,0);assert.equal(store.getItem('KinghtFall:user'),'saved');assert.equal(store.data.size,1);
  }
});
