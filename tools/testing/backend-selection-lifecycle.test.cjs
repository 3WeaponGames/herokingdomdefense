'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setup:gameplaySetup,Node,Vec2,authored}=require('./backend-gameplay-harness.cjs');
const AuthoredSpawnPlan=require('../../assets/_script/AuthoredSpawnPlan');
const setup=(overrides={})=>gameplaySetup({AuthoredSpawnPlan,...overrides});
const source=path.resolve(__dirname,'../../assets/_script');
function load(name,cc,modules){const exports={};function Base(){};
 vm.runInNewContext(fs.readFileSync(path.join(source,name+'.js'),'utf8'),{exports,require:n=>modules[n]||{default:Base},cc,sp:{Skeleton:function(){}},console:{log(){}},
 __extends:(C,B)=>{Object.setPrototypeOf(C,B);C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(_ds,t,k)=>k===undefined?t:undefined,__spreadArrays:(...xs)=>[].concat(...xs)});return exports;
}
function node(){return {active:true,handlers:{},on(type,cb){this.handlers[type]=cb;},setPosition(){},getChildByName(){return node();}};}
function tweens(cc){const pending=[];cc.tween=()=>{let done;const chain={to(){return chain;},set(){return chain;},delay(){return chain;},call(fn){done=fn;return chain;},start(){if(done)pending.push(done);return chain;}};return chain;};return ()=>{while(pending.length)pending.shift()();};}
function perkDialog(immediate=false){
 const h=setup(),cc=h.e.cc,requests=[],chosen=[],scheduled=[];cc.Enum=x=>x;cc.Node.EventType={TOUCH_END:'touchend'};cc.instantiate=node;const flush=tweens(cc);
 const mods={...h.e.stubs,SdkMgr:{SdkMgr:{getInstance:()=>({playVideo(_type,yes,no){requests.push({yes,no});if(immediate)yes();}})},AdType:{AdFreeTime:1}},PlayerMgr:{PlayerMgr:{getInstance:()=>({getTrackData:()=>({youmengTrack(){}})})}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getMaxStage:()=>1})})}},UIMgr:{UIMgr:{getInstance:()=>({closeUI(){}})}},GameTrackDataEvent:{TrackId:{}}};
 mods.BaseUI=load('BaseUI',cc,mods);const B=load('KinghtFallUIBuff',cc,mods).default,b=new B();let refreshed=0;
 Object.assign(b,{node:node(),ndItem:node(),ndParent:node(),btnRefresh:node(),btnGetAll:node(),selInfo:[50001,50002,50003],initData(){},initBtnView(){},onRefreshBuff(){refreshed++;},showItem(){},showAni(){},startGuide(){},callBack:result=>chosen.push(Array.from(result)),scheduleOnce:fn=>scheduled.push(fn),release(){},offEvents(){}});
 b.onOpened();b.start();return {b,requests,chosen,flush,scheduled,refreshed:()=>refreshed};
}
test('Perk take-all and actual round completion each commit once',()=>{
 const p=perkDialog(true);p.b.btnGetAll.handlers.touchend();p.b.btnGetAll.handlers.touchend();p.b.clickItem(0);p.b.btnRefresh.handlers.touchend();p.flush();
 assert.equal(p.requests.length,1);assert.deepEqual(p.chosen,[[50001,50002,50003]]);assert(p.b.isclose);
 const h=setup(),cc=h.e.cc;h.e.stubs.KinghtFallConfig.KinghtFallUIID={UIBuff:1};h.e.stubs.KinghtFallModle.KinghtFallGameStage.End=4;tweens(cc);
 const U=load('KinghtFallUIGame',cc,{...h.e.stubs,BaseUI:{default:function(){}},AudioMgr:{AudioMgr:{getInstance:()=>({playMusic(){}})}}}).default,u=new U();let callback,buffs=0;
 Object.assign(h.d,{levelCfg:authored.LevelCfg[0],round:1,coin:0,addTime:{},getGameBuff:()=>null,upMap(){},addGameBuff(){buffs++;}});
 Object.assign(h.g,{endRoundGame:()=>h.d.loadMonster(),saveGame(){},ctrPlay:{endRoundGame(){},ctrPlayAni:{setLevelUp(){}}}});
 Object.assign(u,{btnBuildInfo:{},ctrGame:h.g,ctrUI:{},scheduleOnce:fn=>fn(),onPauseGame(){},openBattleDialog(_dialog,_id,_ready,done){callback=done;},initView(){},initBtnView(){}});
 u.endRoundGame();callback([50001]);callback([50001]);assert.equal(h.d.round,2);assert.equal(buffs,1);assert.equal(h.d.coin,authored.LevelCfg[0].WaveCfg[1].StartSliver);
 assert(h.d.authoredTimeline instanceof AuthoredSpawnPlan.Timeline);
});
test('Pending perk ads block competing choice; failure releases choice and duplicates are ignored',()=>{
 const p=perkDialog();p.b.btnGetAll.handlers.touchend();p.b.clickItem(0);p.b.btnRefresh.handlers.touchend();assert.equal(p.requests.length,1);
 p.requests[0].no();p.requests[0].yes();p.b.clickItem(1);p.b.btnGetAll.handlers.touchend();p.b.selInfo[1]=99999;p.flush();
 assert.deepEqual(p.chosen,[[50002]]);assert.equal(p.requests.length,1);
});
test('Refresh callbacks and selection tweens cannot act after close or reopen',()=>{
 for(const reopen of [false,true]){
  const p=perkDialog();p.b.btnRefresh.handlers.touchend();const before=p.refreshed();p.b.closeUI();if(reopen)p.b.onOpened();p.requests[0].yes();assert.equal(p.refreshed(),before);assert.equal(p.chosen.length,0);
  if(reopen){p.b.clickItem(0);p.b.closeUI();p.b.onOpened();p.flush();assert.equal(p.chosen.length,0);}
 }
 const p=perkDialog();p.b.btnRefresh.handlers.touchend();p.requests[0].yes();p.requests[0].yes();assert.equal(p.refreshed(),2);p.b.clickItem(2);p.flush();assert.deepEqual(p.chosen,[[50003]]);
});
test('Empty authored perk pool completes once and honors close ownership',()=>{
 const p=perkDialog();p.b._customPerkPool=true;p.b.canOutBuff=[];p.b.start();const finish=p.scheduled.at(-1);finish();finish();assert.deepEqual(p.chosen,[[]]);
 const q=perkDialog();q.b._customPerkPool=true;q.b.canOutBuff=[];q.b.start();q.b.closeUI();q.scheduled[0]();assert.equal(q.chosen.length,0);
});
test('Barracks saved ownership survives first start and real roster refresh',()=>{
 const h=setup();function Base(){};Base.prototype.start=function(){};Base.prototype.setSave=function(save){this.index=save.level;};Base.prototype.reset=function(){};
 h.e.stubs.KinghtFallBuildBase={default:Base};h.e.stubs.Utils={Utils:{randomRang:()=>100}};const B=h.load('KinghtFallBuildBarracks').default,b=new B();
 Object.assign(b,{ID:7,node:new Node(),ndPro:{},ndVideoSoldier:{SolID:90001},buildInfo:{cfg:{Data:[10,90001,8]}},init(){},getPos:()=>new Vec2(),canAddVideoSoldier:()=>true});
 const removed=[];h.d.delSoldier=unit=>removed.push(unit);h.g.addSoldier=(id,done)=>done({cfg:{ID:id},node:new Node(),setParent(){},setNew(){},initBuffData(){},isDead:()=>false});
 b.setSave({point:7,level:4,data:3});b.initSoldier();assert.equal(b.enemyList.filter(Boolean).length,13);b.start();b.initSoldier();assert.equal(b.getSave().data,3);assert.equal(b.enemyList.filter(Boolean).length,13);assert.equal(removed.length,0);
 b.initBuffData=()=>{};b.reset(true);assert.equal(b.VideoTimes,0);assert.equal(b.enemyList.length,0);assert.equal(new B().VideoTimes,0);
});
test('Wall Defense pause ignores lottery, results, and unrelated pause owners',()=>{
 const h=setup();let state='Pause',opens=0;const game={_cardCtrl:{},_resourceGeneration:1};
 const C=load('GAD_UIGameView',h.e.cc,{...h.e.stubs,GAD_UIGame:{default:{script:game}},GAD_Configs:{emGADGameState:{Game:'Game',Pause:'Pause'}},GAD_PlayerMgr:{default:{getInstance:()=>({getState:()=>state,setState:s=>state=s})}},UIMgr:{UIMgr:{getInstance:()=>({openUIWithOwner(){opens++;}})}}}).default,u=new C();
 for(const other of ['Pause','Lottery','Over']){state=other;u.webPause();assert.equal(state,other);}
 assert.equal(opens,0);
});
