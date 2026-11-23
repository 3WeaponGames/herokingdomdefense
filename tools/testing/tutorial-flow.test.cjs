'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const clone=value=>JSON.parse(JSON.stringify(value)),noop=()=>{},single=value=>({getInstance:()=>value});
function fixture(){
 const requests=[],shown=[],pickers=[],scheduled=[],modules={},ids={UIHome:'home',UIGame:'game',UIBuff:'buff',UITreasureReward:'rewards',UITreasureInfo:'relic-info',UITalentInfo:'talent-info',UIAddCurrency:'currency',UINewModular:'unlock',UIExchangeCode:'code'},visibleUI=new Map();
 let writes=0,failSave=false;
 function Base(){}Base.prototype.saveData=function(){writes++;return !failSave;};
 const node=name=>({name,active:true,activeInHierarchy:true,width:100,height:100,getChildByName(){return null;}});
 const cc={Node:function(){},Component:function(){},Vec2:function(x=0,y=0){this.x=x;this.y=y;},Size:function(w=0,h=0){this.width=w;this.height=h;},v2:(x=0,y=0)=>({x,y}),_decorator:{ccclass:x=>x,property:()=>noop},Enum:x=>x,isValid:x=>!!x&&!x.destroyed};cc.Node.EventType={TOUCH_END:'end'};
 const manager={isopening:false,getUIById:id=>visibleUI.get(id),openUIWithOwner(id,from,callbacks,cfg){const request={id,from,callbacks,cfg};requests.push(request);return{cancel(){callbacks.onCancel();}};}};
 const data={data:config,getGuideCfgById:group=>config.GuideCfg.filter(row=>row.GuideGroup===group).sort((a,b)=>a.GuideStep-b.GuideStep)};
 const player={getGuideData:()=>guide,getUserData:()=>({getTreasureLevel:id=>ownedRelics.has(id)})},ownedRelics=new Set();
 Object.assign(modules,{BaseUI:{default:Base},BaseCtrl:{default:Base},BaseData:{BaseData:Base},BaseButton:{BaseButton:function(){}},Config:{UIID:{UIGuide:'guide'}},UIMgr:{UIMgr:single(manager)},KinghtFallConfig:{KinghtFallUIID:ids,KinghtFallEventName:{NewbieGuide:'guide-event'}},KinghtFallDataMgr:{KinghtFallDataMgr:single(data)},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:single(player)},PlayerMgr:{PlayerMgr:single({getTrackData:()=>({youmengTrack:noop})})},GameTrackDataEvent:{TrackId:{}},PlatformSetting:{PlatformSetting:{currentPlatform:'editor'}},BasePlatform:{Platform:{WEB_LINK:'weblink'}},Appcfg:{BaseEventName:{CloseUI:'closed'}},HeroItemLooks:{},HeroWeaponPicker:{},EarnedAds:{},TestMode:{},AudioMgr:{},BattleHud:{layout:noop}});
 function load(name){if(modules[name])return modules[name];const exports=modules[name]={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8'),{exports,require:id=>{if(id==='TutorialFlow'||id==='UIGuide')return load(id);return modules[id]||{};},cc,sp:{Skeleton:function(){}},console,__extends(C,B){Object.setPrototypeOf(C,B);C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(_d,value,key)=>key===undefined?value:undefined,__spreadArrays:(...a)=>[].concat(...a),Set,Number},{filename:name+'.js'});return exports;}
 modules.Config.GameConfig={AppCacheName:'tutorial-test'};modules.KinghtFallConfig.KinghtFallParameter={AppCacheName:'kingdom'};
 modules.KinghtFallEnum={KinghtFallEnumTreasureEnum:{EconomyBook:120012}};
 modules.HeroWeaponPicker.open=gear=>{
   const tutorial=gear.getWeaponPickerTutorial();
   assert(tutorial);
   pickers.push(tutorial);
   shown.push(tutorial.text);
 };
 const Guide=load('KinghtFallGuideData').KinghtFallGuideData,guide=new Guide();guide.createData();
 function owner(name,uid){const C=load(name).default,o=new C();o.uid=uid;o.node=node(uid);o.scheduleOnce=fn=>scheduled.push(()=>fn.call(o));o.unschedule=noop;o.sendEvent=(event,...args)=>{if(event==='guide-event')home.startGuide(...args);};return o;}
 const home=owner('KinghtFallUIHome',ids.UIHome);home.canGuide=true;home.isLock=()=>false;home.showView=noop;home.togCon={toggleItems:[0,1,2,3,4].map(i=>({node:node('Toggle'+i),isChecked:false}))};home.tagNode={getComponent:()=>({btnBattle:node('campaign')}),getComponentsInChildren:()=>[]};
 const game=owner('KinghtFallUIGame',ids.UIGame);game.ndCoin=node('silver');game.ndLevelInfo=node('wave');game.btnStartFight=node('fight');game.btnAgg=node('rally');game.btnFollow=node('follow');game.enemyIconInfo={one:{ndItem:node('enemies')}};let mainLevel=0;const pad=node('current-purchase-pad');game.ctrGame={gameData:{baseBuild:{getLevel:()=>mainLevel,getPurchaseField:()=>pad,ndLockList:[]}},setAudioPaused:noop};game.ctrUI={setGuide:noop};
 const buff=owner('KinghtFallUIBuff',ids.UIBuff);buff.ndParent=node('perk-cards');
 function ready(request=requests.at(-1)){assert(request,'Expected a guide request');if(!request.callbacks.isCurrent()){request.callbacks.onCancel();return false;}visibleUI.set('guide',{node:node('guide'),cfg:request.cfg});if(request.callbacks.onOpened)request.callbacks.onOpened();shown.push(request.cfg.tipstring);return request;}
 function close(request=requests.at(-1)){visibleUI.delete('guide');request.cfg.onClosed();}
 function acknowledge(request=requests.at(-1)){assert.equal(request.cfg.onComplete(),true);if(request.cfg.callBack)request.cfg.callBack();close(request);}
 function position(group,step=0){guide.data.GroupId=group;guide.data.stepId=step;}
 return{requests,shown,pickers,scheduled,node,load,cc,manager,visibleUI,data,player,guide,home,game,buff,pad,ownedRelics,owner,ready,close,acknowledge,position,setMainLevel:value=>mainLevel=value,writes:()=>writes,failSave:value=>failSave=value,flush(){let count=0;while(scheduled.length){assert(count++<30,'Unexpected guide scheduling loop');scheduled.shift()();}}};
}

test('tutorial content keeps the original IDs and includes both translated weapon lessons',()=>{
 const expected=[2,4,1,4,3,3,1,1,1,1,1],catalog=require('../../assets/resources/localization/catalog.json');
 assert.deepEqual(config.GuideCfg.map(r=>r.ID),Array.from({length:22},(_,i)=>i+1));
 assert.deepEqual(config.GuideCfg.filter(row=>row.GuideGroup===4).map(row=>row.ID),[8,9,21,22]);
 assert.deepEqual(require('../../assets/configs/GameJsonCfg.json').GuideCfg,config.GuideCfg);
 expected.forEach((count,i)=>{const rows=config.GuideCfg.filter(r=>r.GuideGroup===i+1);assert.equal(rows.length,count);assert.deepEqual(rows.map(r=>r.GuideStep),Array.from({length:count},(_,i)=>i+1));});
 for(const row of config.GuideCfg){const key=/^\[\[loc:(.+)\]\]$/.exec(row.Describe)[1];for(const language of ['en','zh'])assert(catalog.entries[key][language]);}
 const king=require('../../assets/resources/characters/retired-king-portrait.json');
 const kingMeta=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/characters/retired-king-portrait.json.meta'),'utf8'));
 const prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/prefabs/ui/UIGuide.prefab'),'utf8'));
 const portrait=prefab.find(node=>node.__type__==='sp.Skeleton' && node._N$skeletonData?.__uuid__===kingMeta.uuid);
 assert.equal(king._unitLook,'character-retired-king');
 const profile=require('../../assets/resources/characters/catalog.json').profiles[king._unitLook];
 const title=catalog.entries['ui.layout.uiguide.27'];
 assert.equal(profile.name,title.en);
 for(const language of ['en','zh']) assert.equal(title[language],catalog.entries['ui.uiguide.labname.27'][language]);
 assert(king.animations.idle.bones);
 assert.equal(portrait.defaultAnimation,'idle');
 const scale=prefab[portrait.node.__id__]._trs.array.slice(7,9);
 assert.equal(scale[0],scale[1],'The portrait uses a uniform scale');
});

test('tutorial progression commits on acknowledgement, preserves a resumed step and rejects duplicate/stale callbacks',()=>{
 const h=fixture();h.home.startGuide();const request=h.ready();assert.equal(h.guide.getStepId(),0);assert.equal(h.writes(),0);
 h.acknowledge(request);assert.equal(h.guide.getStepId(),1);assert.equal(h.writes(),1);assert.equal(request.cfg.onComplete(),false);assert.equal(h.writes(),1);
 h.guide.initData();assert.equal(h.guide.getStepId(),1);h.home.startGuide();const pending=h.requests.at(-1);h.home.node.activeInHierarchy=false;assert.equal(h.ready(pending),false);assert.equal(h.guide.getStepId(),1);
});

test('tutorial cancellation and a failed progress save never consume a lesson or unlock unrelated input',()=>{
 const h=fixture();h.home.startGuide();const pending=h.requests.at(-1);pending.callbacks.onCancel();assert.equal(h.guide.getStepId(),0);assert.equal(h.home._tutorialOpen,null);
 h.home.startGuide();h.ready();h.failSave(true);assert.equal(h.requests.at(-1).cfg.onComplete(),false);assert.equal(h.guide.getStepId(),0);assert(h.home._tutorialOpen);h.failSave(false);h.acknowledge();assert.equal(h.guide.getStepId(),1);
});

test('home lessons wait for a loading or visible detail dialog instead of covering its controls',()=>{
 const h=fixture();h.position(6,0);h.manager.isopening=true;h.home.startGuide();assert.equal(h.requests.length,0);assert.equal(h.guide.getStepId(),0);
 h.manager.isopening=false;h.visibleUI.set('relic-info',{node:h.node('details')});h.flush();assert.equal(h.requests.length,0);h.visibleUI.clear();h.home.startGuide();assert(h.ready());assert.equal(h.guide.getStepId(),0);
});

test('battle tutorial uses the current purchase field and waits for construction without pausing movement',()=>{
 const h=fixture();h.position(2,1);h.game.startGuide();const request=h.ready();assert.equal(request.cfg.distNode,h.pad);assert.equal(h.game.isPauset,false);h.acknowledge();assert.equal(h.guide.getStepId(),2);
 const count=h.requests.length;h.game.startGuide();assert.equal(h.requests.length,count);h.setMainLevel(1);h.game.startGuide();assert.equal(h.ready().cfg.distNode,h.game.enemyIconInfo.one.ndItem);
});

test('a resumed built castle needs no extra tier upgrade and an empty authored wave has a visible fallback',()=>{
 const h=fixture();h.position(2,1);h.setMainLevel(1);h.game.enemyIconInfo={};h.game.startGuide();const request=h.ready();assert.equal(h.guide.getStepId(),2);assert.equal(request.cfg.distNode,h.game.ndLevelInfo);h.acknowledge();h.game.startGuide();assert.equal(h.ready().cfg.distNode,h.game.btnStartFight);
});

test('building help queues during core lessons and perk decisions and records only acknowledged tips',()=>{
 const h=fixture();h.position(2,0);h.game.startGuide(7);h.ready();assert.equal(h.guide.getGuideTips(7),0);h.acknowledge();assert(h.game._pendingGuideTips.has(7));
 h.position(4);h.game._battleDialog={kind:'perk'};const count=h.requests.length;h.game.startGuide(8);assert.equal(h.requests.length,count);h.game._battleDialog=null;h.game.startGuide();const first=h.ready();assert.equal(h.guide.getGuideTips(7),0);h.acknowledge(first);assert.equal(h.guide.getGuideTips(7),1);h.game.startGuide();h.ready();h.acknowledge();assert.equal(h.guide.getGuideTips(8),1);
});

test('all 22 lessons can be acknowledged through current home, battle, perk, equipment, relic and talent handlers',()=>{
 const h=fixture();
 for(let step=0;step<2;step++){h.home.startGuide();h.ready();h.acknowledge();}
 h.game.startGuide();h.ready();h.acknowledge();h.game.startGuide();h.ready();h.acknowledge();h.setMainLevel(1);
 for(let step=2;step<4;step++){h.game.startGuide();h.ready();h.acknowledge();}
 h.buff.startGuide();h.ready();h.acknowledge();
 h.home.startGuide();h.ready();h.acknowledge();
 const gear=h.owner('KinghtFallHomePersonCtrl','gear');gear.nodeInfo=[{ndInfo:{active:true,activeInHierarchy:true,getChildByName:()=>h.node('upgrade')}}];gear.showHomeGuide();h.ready();h.acknowledge();
 gear._weaponSwitch=h.node('switch fighting style');gear.showHomeGuide();
 const spotlight=h.ready();
 assert.equal(spotlight.cfg.distNode,gear._weaponSwitch);
 assert.equal(spotlight.cfg.hideMask,false);
 assert.equal(spotlight.cfg.isWeek,false);
 assert.equal(spotlight.cfg.showAni,true);
 assert.equal(h.pickers.length,0);
 h.acknowledge(spotlight);
 assert.equal(h.guide.getStepId(),3);
 assert.equal(h.pickers[0].text,'[[loc:data.guidecfg.22.describe]]');
 assert.equal(h.pickers[0].onComplete(),true);
 h.home.startGuide();h.ready();h.acknowledge();
 const relic=h.owner('KinghtFallHomeTreasureCtrl','relics');relic.btnOne=h.node('draw');relic.ndInfo=[{cfg:{ID:120001},node:h.node('relic')}];let draws=0,details;
 relic.getReward=()=>{draws++;h.ownedRelics.add(120001);h.guide.setGuideTips(5);};relic.onClick=cfg=>details=cfg;
 relic.showHomeGuide();h.ready();h.acknowledge();assert.equal(draws,1);relic.showHomeGuide();h.ready();h.acknowledge();assert.deepEqual(details,{ID:120001});assert.equal(draws,1);
 h.home.startGuide();h.ready();h.acknowledge();
 const talents=h.owner('KinghtFallHomeTalentCtrl','talents');talents.nodeInfo=[{cfgList:[{ID:1000000001}],ndItem:[h.node('sparse-talent')]}];talents.canUnlock=()=>3;talents.showHomeGuide();h.ready();h.acknowledge();
 const info=h.owner('KinghtFallUITalentInfo','talent-info');info.cfg={kindID:1000000001,GoldCost:1};h.data.getTalentCfg=()=>({});info.btnGold=h.node('gold');info.btnGold.active=false;info.btnVideo=h.node('video');info.btnClose=h.node('close');info.initView=info.initBtnListener=noop;info.start();assert.equal(h.ready().cfg.distNode,info.btnVideo);h.acknowledge();assert.equal(h.guide.getGroupId(),7);
 for(const id of [7,8,9,10,11]){h.game.startGuide(id);h.ready();h.acknowledge();}
 assert.equal(h.shown.length,22);assert.equal(h.guide.getGuideEnd(),true);
});

test('cached relic page resumes details on an owned relic and never binds the draw button to the details step',()=>{
 const h=fixture();h.position(5,2);const relic=h.owner('KinghtFallHomeTreasureCtrl','relics'),first={ID:120001},second={ID:120002};relic.ndInfo=[{cfg:first,node:h.node('unowned')},{cfg:second,node:h.node('owned')}];relic.btnOne=h.node('draw');h.ownedRelics.add(second.ID);let shown;relic.onClick=cfg=>shown=cfg;relic.showHomeGuide();const request=h.ready();assert.equal(request.cfg.distNode,relic.ndInfo[1].node);h.acknowledge();assert.equal(shown,second);
});

test('equipment tutorial finds an available slot rather than forcing the hidden first upgrade',()=>{
 const h=fixture();h.position(4,1);const gear=h.owner('KinghtFallHomePersonCtrl','gear'),hidden=h.node('first'),available=h.node('second');hidden.active=false;gear.nodeInfo=[{ndInfo:{getChildByName:()=>hidden}},{ndInfo:{getChildByName:()=>available}}];gear.showHomeGuide();assert.equal(h.ready().cfg.distNode,available);h.acknowledge();assert.equal(h.guide.getStepId(),2);
});

test('the interrupted weapon picker resumes in Gear and finishes only on a saved acknowledgement',()=>{
 const h=fixture();
 h.position(4,3);
 h.guide.initData();
 const gear=h.owner('KinghtFallHomePersonCtrl','gear');
 gear._weaponSwitch=h.node('switch fighting style');
 gear.showHomeGuide();
 const picker=h.pickers[0];
 assert.equal(picker.text,'[[loc:data.guidecfg.22.describe]]');
 assert.equal(h.writes(),0);
 gear.node.activeInHierarchy=false;
 assert.equal(picker.onComplete(),false);
 assert.equal(h.guide.getStepId(),3);
 gear.node.activeInHierarchy=true;
 gear.showHomeGuide();
 const resumed=h.pickers[1];
 h.failSave(true);
 assert.equal(resumed.onComplete(),false);
 assert.equal(h.guide.getStepId(),3);
 h.failSave(false);
 assert.equal(resumed.onComplete(),true);
 assert.equal(h.guide.getGroupId(),5);
 assert.equal(resumed.onComplete(),false);
 assert.equal(gear.getWeaponPickerTutorial(),null);
});

test('malformed saved tutorial positions are recoverable without replacing tips or unknown save fields',()=>{
 const h=fixture();h.guide.data.GroupId=2;h.guide.data.stepId=900;h.guide.data.Future={keep:9};h.guide.data.tips[11]=1;h.guide.initData();assert.equal(h.guide.getStepId(),0);assert.equal(h.guide.getGuideTips(11),1);assert.deepEqual(h.guide.data.Future,{keep:9});assert.equal(h.writes(),0);
});

test('tutorial scrolling uses a Cocos vector and reveals an early talent in the expanded tree',()=>{
 const h=fixture();h.cc.v2=(x,y)=>new h.cc.Vec2(x,y);let stopped=false,offset;
 const content={height:22235.371,width:750,anchorX:.5,anchorY:0,parent:{width:750,height:1218.9},convertToNodeSpaceAR:point=>point};
 const target={convertToWorldSpaceAR(point){assert(point instanceof h.cc.Vec2,'Cocos treats an ordinary object as a Vec3 with an undefined Z coordinate');return{x:-.235,y:235.371};}};
 const scroll={content,getMaxScrollOffset:()=>({x:0,y:21016.471}),stopAutoScroll(){stopped=true;},scrollToOffset(value){assert(stopped);offset=value;}};
 h.load('TutorialFlow').scrollTo({ndParent:scroll},target);assert(offset instanceof h.cc.Vec2);assert.equal(offset.x,0);assert.equal(offset.y,21016.471);
});
