'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const root=path.resolve(__dirname,'../..');
function fixture(){
  const data=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json')));
  const prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomePersonCtrl.prefab')));
  const levels=[10,2,1,1,1,1],user={getGoldNum:()=>100000,getMaxStage:()=>2,getMaxOrder:()=>1,getPersonLevel:id=>levels[id-1],getHeroWeapon:()=>require('../../assets/_script/HeroWeapons').styles[0]};
  const Label=function(){},Sprite=function(){},Button=function(){},noop=()=>{};
  function node(id){
    const original=prefab[id],label={string:'stale'},sprite={},button={interactable:true};
    const result={name:original._name,active:true,handlers:{},on(type,handler){this.handlers[type]=handler;},children:(original._children||[]).map(r=>node(r.__id__)),getChildByName:name=>result.children.find(n=>n.name===name),getComponent:Type=>Type===Label?label:Type===Sprite?sprite:button,getComponentInChildren:()=>result.children[0].getComponent(Label)};
    return result;
  }
  const deps={BaseCtrl:{default:function(){}},BaseButton:{BaseButton:Button},Utils:{Utils:{StringFormat:(text,value)=>text+value}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}},KinghtFallEnum:{KinghtFallEnumEquipEnum:{Body:1,Head:2,Arrow:3,Bow:4,Gloves:5,horse:6}},KinghtFallConfig:{KinghtFallBundelName:{IconCharacter:'icons',IconGood:'goods'}},KinghtFallTextConfig:{KinghtFallTextConfig:{HomeTrea02:'level',HomePerson04:'locked'}}};
  deps.KinghtFallModle={default:{getInstance:()=>({numberFomat:String})}};
  deps.HeroWeapons=require('../../assets/_script/HeroWeapons');
  deps.KinghtFallDataMgr={KinghtFallDataMgr:{getInstance:()=>({getEquipCfgList:()=>data.EquipCfg})}};
  const context={exports:{},require:id=>deps[id]||{},cc:{_decorator:{ccclass:x=>x,property:()=>noop},Label,Sprite,Node:{EventType:{TOUCH_END:'tap'}},ScrollView:function(){}},sp:{Skeleton:function(){}},__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(decorators,value)=>value};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallHomePersonCtrl.js'),'utf8'),context);
  const owner=new context.exports.default();
  owner.levelLimit=10;owner.T=value=>value;owner.loadSpriteFrame=noop;owner.ctrPlayAni={initView:noop};owner.labPower={string:''};owner.node={};
  owner.nodeInfo=data.EquipCfg.map((cfg,index)=>({type:cfg.id,cfg,labNum:{string:'stale'},ndItem:node([50,64,78,92,106,120][index]),ndInfo:node([168,237,306,375,444,513][index])}));
  return {owner,levels,data,Label,deps};
}
test('equipment refresh shows numeric totals and the true next level at a campaign cap, without changing data',()=>{
  const f=fixture(),before=JSON.stringify(f.data),levels=f.levels.slice();
  f.owner.initView();
  for(const item of f.owner.nodeInfo){
    const current=item.cfg.levelInfo[f.levels[item.type-1]-1].Parameters;
    assert.equal(item.labNum.string,String(current));
    assert.equal(item.ndInfo.getChildByName('ndLay').getChildByName('labNum1').getComponent(f.Label).string,String(current));
  }
  const cloak=f.owner.nodeInfo[0],comparison=cloak.ndInfo.getChildByName('ndLay');
  assert.equal(comparison.getChildByName('labNum2').getComponent(f.Label).string,String(cloak.cfg.levelInfo[f.levels[0]].Parameters));
  assert.equal(cloak.ndInfo.getChildByName('btnLock').active,true);
  assert.equal(cloak.ndInfo.getChildByName('btnUpgeade').active,false);
  assert.equal(comparison.getChildByName('ndArr').active,true);
  assert.deepEqual(f.levels,levels);assert.equal(JSON.stringify(f.data),before);
});
test('max-level and locked equipment states recover correctly when the cached Gear page refreshes',()=>{
  const f=fixture(),cloak=f.owner.nodeInfo[0],comparison=cloak.ndInfo.getChildByName('ndLay');
  f.levels[0]=cloak.cfg.levelInfo.length;f.owner.initView();
  assert.equal(comparison.getChildByName('ndArr').active,false);assert.equal(comparison.getChildByName('labNum2').active,false);
  assert.equal(cloak.ndInfo.getChildByName('btnLock').active,false);assert.equal(cloak.ndInfo.getChildByName('btnUpgeade').active,false);
  const bow=f.owner.nodeInfo[3];assert.equal(bow.ndInfo.getChildByName('ndLock').active,true);assert.equal(bow.ndInfo.getChildByName('ndLay').active,false);
  f.levels[0]=1;f.owner.initView();
  assert.equal(comparison.getChildByName('ndArr').active,true);assert.equal(comparison.getChildByName('labNum2').active,true);
  assert.equal(cloak.ndInfo.getChildByName('btnLock').active,false);assert.equal(cloak.ndInfo.getChildByName('btnUpgeade').active,true);
});

test('both upper weapon slots open the picker, lower upgrade icons have no misleading switch action, and upgrade buttons retain their action',()=>{
  const f=fixture(),owner=f.owner;let opened=0,installed=0,upgraded=0;f.deps.HeroWeaponPicker={open(){opened++;},installSwitch(){installed++;}};
  owner.ndItemTop=owner.nodeInfo.map(item=>item.ndItem);owner.ndItemDown=owner.nodeInfo.map(item=>item.ndInfo);owner.labNum=owner.nodeInfo.map(item=>item.labNum);owner.spPower={node:{}};
  for(const name of ['refreshEquipmentLimits','bindScrollFooter','layoutScrollToFooter','initView','initEventListener','scheduleHomeGuide'])owner[name]=()=>{};owner.onUpgeade=()=>upgraded++;
  owner.start();assert.equal(installed,1);for(const slot of [3,4]){owner.ndItemTop[slot-1].handlers.tap();assert.equal(owner.ndItemDown[slot-1].getChildByName('ndItem').handlers.tap,undefined);owner.ndItemDown[slot-1].getChildByName('btnUpgeade').handlers.tap();}assert.equal(opened,2);assert.equal(upgraded,2);assert.equal(owner.ndItemTop[0].handlers.tap,undefined);
});
