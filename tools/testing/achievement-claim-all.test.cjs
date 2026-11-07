'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..');
function fixture(){
  const claimed=new Set(),grants=[],events=[],progress={silver:100,kills:100};
  const config=[{ID:1,Type:1,Argument:10,Item:[2002,10]},{ID:2,Type:1,Argument:100,Item:[2002,20]},{ID:3,Type:1,Argument:200,Item:[2002,30]},{ID:4,Type:2,Argument:50,Item:[2001,5]}];
  const mission={getAchInfoByType:type=>({num:type===1?progress.silver:progress.kills,reward:[...claimed]}),getAchRew:(type,id)=>claimed.add(id),getTaskNum:()=>progress.kills};
  const player={getMissionData:()=>mission,claimRewards(rewards,multiplier,position,mark,eligible){if(!eligible())return false;grants.push(JSON.parse(JSON.stringify(rewards)));if(this.duringGrant)this.duringGrant();mark();return true;}};
  function Base(){}Base.prototype.sendEvent=(...args)=>events.push(args);
  const node=()=>{const children=new Map(),component={};return{active:true,on(name,fn,target){this.click=()=>fn.call(target);},getComponent:()=>component,getChildByName(name){if(!children.has(name))children.set(name,node());return children.get(name);},convertToWorldSpaceAR:p=>p};};
  const modules={BaseUI:{default:Base},List:{default:function(){}},KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getAchievementCfg:()=>config})}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>player}},KinghtFallEnum:{KinghtFallEnumAchiEnum:{EnemyKill:2}},KinghtFallMissionData:{KinghtFallTaskCountName:{Kill:'kills'}},KinghtFallConfig:{KinghtFallEventName:{UpdateRedPoint:'red'}}};
  const context={exports:{},require:name=>modules[name]||{},cc:{Node:{EventType:{TOUCH_END:'tap'}},Button:function(){},v2:(x,y)=>({x,y}),_decorator:{ccclass:v=>v,property:()=>()=>{}}},__extends:(ctor,base)=>Object.setPrototypeOf(ctor.prototype,base.prototype),__decorate:(d,target,key)=>key===undefined?target:undefined};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIAchievement.js'),'utf8'),context);const ui=new context.exports.default();ui.btnClose=node();ui.btnClaimAll=node();ui.ctrList={tmpNode:node()};ui.start();return{ui,claimed,grants,events,progress,player};
}
test('Achievement Claim All grants eligible rewards together once and excludes incomplete/already claimed rows',()=>{
  const f=fixture();f.claimed.add(1);f.ui.initView();f.ui.onClaimAll();assert.deepEqual(f.grants,[[{id:2002,num:20},{id:2001,num:5}]]);assert.deepEqual([...f.claimed],[1,2,4]);assert.equal(f.ui.btnClaimAll.getComponent().interactable,false);f.ui.onClaimAll();assert.equal(f.grants.length,1);assert.deepEqual(f.events,[['red',4]]);
  f.progress.silver=200;f.ui.initView();assert(f.ui.btnClaimAll.getComponent().interactable);f.ui.onClaimAll();assert.deepEqual(f.grants[1],[{id:2002,num:30}]);
});
test('Achievement Claim All combines identical currencies and prevents reentrant duplicate claims',()=>{
  const f=fixture();f.player.duringGrant=()=>f.ui.onClaimAll();f.ui.onClaimAll();assert.deepEqual(f.grants,[[{id:2002,num:30},{id:2001,num:5}]]);assert.equal(f.claimed.size,3);
});
test('Achievements uses the localized Playtime footer, centered below the scrolling list',()=>{
  const d=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/homePop/KinghtFallUIAchievement.prefab'))),ui=d.find(x=>x.ctrList&&x.btnClose),button=d[ui.btnClaimAll.__id__],scroll=d.find(x=>x._name==='New ScrollView');
  assert.equal(button._trs.array[0],0);assert.equal(button._parent.__id__,scroll._parent.__id__);assert(button._trs.array[1]+button._contentSize.height/2<scroll._trs.array[1]-scroll._contentSize.height/2);assert(d.some(x=>x._string==='[[loc:common.claimAll]]'));
});
