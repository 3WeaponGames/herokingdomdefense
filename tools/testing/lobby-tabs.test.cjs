'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),{EventMgr}=require('../../assets/_script/EventMgr');
const single=value=>({getInstance:()=>value}),noop=()=>{};
function load(name,deps,ccExtra){
  const context={exports:{},require:id=>deps[id]||{},cc:{_decorator:{ccclass:x=>x,property:()=>noop},...ccExtra},sp:{Skeleton:function(){}},console,
    __extends(C,B){Object.setPrototypeOf(C,B);C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(ds,value)=>value,__spreadArrays:(...values)=>[].concat(...values)};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8'),context,{filename:name+'.js'});return context.exports.default;
}
function fixture(){
  function Base(){}function Controller(){this.eventList=[];}
  const events=new EventMgr(),created=[],locked=new Set(),notices=[],animations=[];
  const cc={Node:{},ToggleContainer:function(){},Prefab:function(){},isValid:value=>!!value&&!value.destroyed,Tween:{stopAllByTarget:noop},tween:()=>({set(){return this;},to(duration){animations.push(duration);return this;},start:noop}),instantiate(prefab){
    const controller=new Controller(),page={prefab,active:true,controllers:[controller],getComponentsInChildren:()=>page.controllers};
    const callback=()=>controller.deliveries=(controller.deliveries||0)+1;controller.eventList=[new Map([['gold',callback]])];events.on('gold',controller,callback);created.push(page);return page;
  }};
  const Home=load('KinghtFallUIHome',{BaseUI:{default:Base},BaseCtrl:{default:Controller},EventMgr:{EventMgr:single(events)},AudioMgr:{AudioMgr:single({playAudioButtonClicked:noop})},Config:{UIID:{UITips:'tips'}},KinghtFallTextConfig:{KinghtFallTextConfig:{}},Utils:{Utils:{StringFormat:value=>value}}},cc);
  const home=new Home();home.ndMain={};home.preWeap={id:'gear'};home.preTalent={id:'talents'};home.preBattle={id:'battle'};home.preTreasure={id:'relics'};home.openUI=(...args)=>notices.push(args);home.T=x=>x;home.lockList=Array.from({length:5},()=>[1,1]);home.isLock=index=>locked.has(index);home.togCon={toggleItems:Array.from({length:5},(_,index)=>({isChecked:true,node:{name:'Toggle'+(index+1),getChildByName:()=>({height:126})}}))};home.tag1=home.togCon.toggleItems[2];
  const visit=index=>home.showView(home.togCon.toggleItems[index]);return{home,visit,events,created,locked,notices,animations};
}
test('repeated lobby switches reuse each visited page without rebuilding, and only one page stays active',()=>{
  const f=fixture(),pages=[];for(let round=0;round<30;round++)for(const index of [2,1,0,3]){f.visit(index);if(!round)pages[index]=f.home.tagNode;else assert.equal(f.home.tagNode,pages[index]);assert.equal(f.created.filter(p=>p.active).length,1);}
  assert.equal(f.created.length,4);assert(f.animations.every(duration=>duration<=.15));
});
test('hidden lobby pages stop receiving global events and resume once without duplicate listeners',()=>{
  const f=fixture();f.visit(0);const gear=f.home.tagNode.controllers[0];f.events.emit('gold');assert.equal(gear.deliveries,1);f.visit(1);const talents=f.home.tagNode.controllers[0];f.events.emit('gold');assert.equal(gear.deliveries,1);assert.equal(talents.deliveries,1);
  for(let n=0;n<10;n++){f.visit(0);f.visit(1);}f.events.emit('gold');assert.equal(f.events.getEventNum('gold'),1);assert.equal(gear.deliveries,1);assert.equal(talents.deliveries,2);
  f.home.setTabEvents(f.home.tagNode,false);f.home.setTabEvents(f.home.tagNode,false);f.events.emit('gold');assert.equal(talents.deliveries,2);f.home.setTabEvents(f.home.tagNode,true);f.events.emit('gold');assert.equal(talents.deliveries,3);
});
test('locked, missing and already-selected tabs keep the current page; destroyed cached pages can be recreated',()=>{
  const f=fixture();f.visit(2);const battle=f.home.tagNode;f.visit(2);assert.equal(f.created.length,1);f.locked.add(1);f.visit(1);assert.equal(f.home.tagNode,battle);assert(battle.active);assert.equal(f.notices.length,1);
  f.visit(4);assert.equal(f.home.tagNode,battle);assert.equal(f.created.length,1);f.visit(0);battle.destroyed=true;battle.active=false;f.visit(2);assert.notEqual(f.home.tagNode,battle);assert.equal(f.created.length,3);
});
function controller(name,deps){
  function Base(){}const C=load(name,{BaseCtrl:{default:Base},HeroWeaponPicker:{close(){}},...deps},{v2:()=>({}),Size:function(){},Node:{},Label:function(){},Sprite:function(){},ScrollView:function(){},Graphics:function(){}}),owner=new C();
  owner.node={activeInHierarchy:true};owner.pending=new Set();owner.scheduleOnce=fn=>owner.pending.add(fn);owner.unschedule=fn=>owner.pending.delete(fn);return owner;
}
test('cached talent and relic pages refresh current data without reconstructing their lists or repeating hidden guides',()=>{
  for(const name of ['KinghtFallHomeTalentCtrl','KinghtFallHomeTreasureCtrl']){
    const owner=controller(name,{});let refreshed=0;owner.initItem=owner.initView=()=>refreshed++;owner.upView=()=>refreshed++;owner.onEnable();assert.equal(refreshed,0);owner._homeTabReady=true;owner.onEnable();assert(refreshed>0);assert.equal(owner.pending.size,1);owner.onDisable();assert.equal(owner.pending.size,0);owner.node.activeInHierarchy=false;owner.showHomeGuide();
  }
});
test('revisiting equipment reads current campaign caps and relic discounts without changing saved progression',()=>{
  let stage=2,relic=null;const user={getMaxStage:()=>stage,getTreasureLevel:()=>relic},data={getLevelCfgById2:n=>({EquipLevelCap:n*10}),getTreasureCfgById:()=>({levelInfo:[{param:[.2]}]})};
  const owner=controller('KinghtFallHomePersonCtrl',{KinghtFallPlayerMgr:{KinghtFallPlayerMgr:single({getUserData:()=>user})},KinghtFallDataMgr:{KinghtFallDataMgr:single(data)},KinghtFallEnum:{KinghtFallEnumTreasureEnum:{ForgeAmulet:1}}});owner.nodeInfo=[];owner._homeTabReady=true;owner.initView=noop;owner.onEnable();assert.equal(owner.levelLimit,20);assert.equal(owner.subNum,1);stage=4;relic={level:1};owner.onEnable();assert.equal(owner.levelLimit,40);assert.equal(owner.subNum,.8);assert.equal(stage,4);assert.equal(owner.pending.size,1);owner.onDisable();assert.equal(owner.pending.size,0);
});
