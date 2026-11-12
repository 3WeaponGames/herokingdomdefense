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
  const Weapons=require('../../assets/_script/HeroWeapons'),levels=[10,2,1,1,1,1],user={data:{personLevel:levels},getGoldNum:()=>100000,getMaxStage:()=>2,getMaxOrder:()=>1,getPersonLevel:id=>Weapons.level(user.data,id),getHeroWeapon:()=>Weapons.selected(user.data),getHeroWeaponLevel:(style,id)=>Weapons.level(user.data,id,style)};
  const Label=function(){},Sprite=function(){},Button=function(){},noop=()=>{};
  function node(id){
    const original=prefab[id],label={string:'stale'},sprite={},button={interactable:true};
    const result={name:original._name,active:true,handlers:{},on(type,handler){this.handlers[type]=handler;},children:(original._children||[]).map(r=>node(r.__id__)),getChildByName:name=>result.children.find(n=>n.name===name),getComponent:Type=>Type===Label?label:Type===Sprite?sprite:button,getComponentInChildren:()=>result.children[0].getComponent(Label)};
    return result;
  }
  const deps={BaseCtrl:{default:function(){}},BaseButton:{BaseButton:Button},Utils:{Utils:{StringFormat:(text,value)=>text+value}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}},KinghtFallEnum:{KinghtFallEnumEquipEnum:{Body:1,Head:2,Arrow:3,Bow:4,Gloves:5,horse:6}},KinghtFallConfig:{KinghtFallBundelName:{IconCharacter:'icons',IconGood:'goods'}},KinghtFallTextConfig:{KinghtFallTextConfig:{HomeTrea02:'level',HomePerson04:'locked'}}};
  deps.KinghtFallModle={default:{getInstance:()=>({numberFomat:String})}};
  deps.HeroWeapons=require('../../assets/_script/HeroWeapons');
  deps.HeroLoadout=require('../../assets/_script/HeroLoadout');
  deps.KinghtFallDataMgr={KinghtFallDataMgr:{getInstance:()=>({data,getEquipCfgList:()=>data.EquipCfg})}};
  const context={exports:{},require:id=>deps[id]||{},cc:{_decorator:{ccclass:x=>x,property:()=>noop},Label,Sprite,Node:{EventType:{TOUCH_END:'tap'}},ScrollView:function(){}},sp:{Skeleton:function(){}},__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(decorators,value)=>value};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallHomePersonCtrl.js'),'utf8'),context);
  const owner=new context.exports.default();
  owner.levelLimit=10;owner.T=value=>value;owner.loadSpriteFrame=noop;owner.ctrPlayAni={initView:noop};owner.labPower={string:''};owner.node={};
  owner.nodeInfo=data.EquipCfg.map((cfg,index)=>({type:cfg.id,cfg,labNum:{string:'stale'},ndItem:node([50,64,78,92,106,120][index]),ndInfo:node([168,237,306,375,444,513][index])}));
  return {owner,levels,data,Label,deps,user,context};
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

test('Gear account CP follows only the equipped weapon and retains owned style contributions through repeated refreshes',()=>{
  const f=fixture(),Weapons=f.deps.HeroWeapons,Loadout=f.deps.HeroLoadout;f.levels.fill(1);Weapons.upgrade(f.user.data,3,10,'skirmisher');Weapons.upgrade(f.user.data,4,10,'skirmisher');
  f.user.data.talentInfo=f.data.TalentLevelCfg.filter(row=>row.HeroStyle==='skirmisher').map(row=>({id:row.ID,isLock:true}));
  f.owner.initView();const bow=f.owner._combatPower;assert.equal(f.owner.labPower.string,String(Math.round(Loadout.calculate(f.data,f.user).cp*100)/100));assert.equal(bow.levels[3],10);assert.equal(bow.levels[4],10);
  Weapons.select(f.user.data,'fighter');const before=JSON.stringify(f.user.data),config=JSON.stringify(f.data);f.owner.initView();const sword=f.owner._combatPower;assert.equal(sword.style,'fighter');assert.equal(sword.levels[3],1);assert.equal(sword.levels[4],1);assert.equal(sword.raw.damage,20);assert.equal(sword.damage,20.2);assert.equal(sword.attackRate,1.01);assert.equal(f.owner.labPower.string,String(Math.round(Loadout.calculate(f.data,f.user).cp*100)/100));assert(sword.cp<bow.cp);
  for(let i=0;i<5;i++){f.owner.initView();assert.equal(f.owner._combatPower.cp,sword.cp);}assert.equal(JSON.stringify(f.user.data),before);assert.equal(JSON.stringify(f.data),config);
  Weapons.upgrade(f.user.data,3,50,'skirmisher');Weapons.upgrade(f.user.data,4,25,'skirmisher');f.owner.initView();assert.equal(f.owner._combatPower.cp,sword.cp,'unequipped bow upgrades do not affect sword power');
});

test('Gear CP uses the same six combat stats at locked and unlocked stages and handles invalid stats without showing NaN',()=>{
  const f=fixture();f.levels.fill(1);f.user.getMaxStage=()=>1;f.user.getMaxOrder=()=>1;f.owner.initView();const cp=f.owner.labPower.string;assert.equal(cp,String(Math.round(f.deps.HeroLoadout.calculate(f.data,f.user).cp*100)/100));
  f.user.getMaxStage=()=>100;f.owner.initView();assert.equal(f.owner.labPower.string,cp,'unlocking an existing stat slot cannot add a second copy to power');
  f.data.EquipCfg.find(row=>row.id===3).levelInfo[0].Parameters=NaN;f.owner.initView();assert.equal(f.owner.labPower.string,'—');assert.match(f.owner._combatPower.reason,/invalid/);
});

test('cached Gear refreshes account-wide upgrade contributions after purchases and tab return',()=>{
  const f=fixture(),owner=f.owner,Weapons=f.deps.HeroWeapons;f.levels.fill(1);Weapons.select(f.user.data,'vanguard');owner.initView();const baseline=owner._combatPower.cp;
  f.user.data.talentInfo=f.data.TalentLevelCfg.filter(row=>row.HeroStyle==='fighter').map(row=>({id:row.ID,isLock:true}));owner.initBtnView();const crossType=owner._combatPower.cp;assert(crossType>baseline,'owned Fighter talents contribute their discounted value to account CP');
  const fighterDamage=f.data.TalentLevelCfg.filter(row=>row.HeroStyle==='fighter'&&row.HeroStat==='damage').reduce((sum,row)=>sum+row.EffectNumber[0],0);
  assert.equal(owner._combatPower.mode,'account-wide');assert(Math.abs(owner._combatPower.bonuses.damage-fighterDamage*.2)<1e-12);
  assert.equal(f.deps.HeroLoadout.snapshot(f.data,f.user).bonuses.damage,0,'account credit must not grant Fighter damage to actual Vanguard gameplay');
  f.user.data.talentInfo.push(...f.data.TalentLevelCfg.filter(row=>row.HeroStyle==='vanguard').map(row=>({id:row.ID,isLock:true})));owner.initBtnView();const trained=owner._combatPower.cp;assert(trained>crossType);
  f.user.data.treasureInfo=[{id:120031,level:1},{id:120036,level:1}];owner._homeTabReady=true;owner.layoutScrollToFooter=owner.refreshEquipmentLimits=owner.scheduleHomeGuide=()=>{};const before=JSON.stringify(f.user.data);owner.onEnable();const relicPower=owner._combatPower.cp;assert(relicPower>trained);owner.onEnable();assert.equal(owner._combatPower.cp,relicPower);assert.equal(JSON.stringify(f.user.data),before);
  f.user.data.treasureInfo[0].level=3;owner.initBtnView();assert(owner._combatPower.cp>relicPower,'relic upgrade uses its new level immediately');
});

test('Gear CP includes the saved hero animation speed and refreshes paused attacks without writing progress',()=>{
  const f=fixture();f.levels.fill(1);let relative=.5;
  f.context.cc.resources={};f.deps.CharacterAppearance={animationSpeed(actor,team){assert.equal(actor,f.owner);assert.equal(team,'hero');return relative;}};
  const before=JSON.stringify(f.user.data),config=JSON.stringify(f.data),hit=f.data.GameTools.timingDefaults['hero:hero:default'].attack;
  f.owner.refreshCombatPower();const slow=f.owner._combatPower;
  assert.equal(slow.effectiveAttackRate,1/(1+hit/.5));assert.equal(slow.directDps,20*slow.effectiveAttackRate);
  relative=1;f.owner.refreshCombatPower();assert(f.owner._combatPower.cp>slow.cp);
  relative=0;f.owner.refreshCombatPower();assert.equal(f.owner._combatPower.effectiveAttackRate,0);assert.equal(f.owner._combatPower.directDps,0);assert.equal(f.owner.labPower.string,'0');
  assert.equal(JSON.stringify(f.user.data),before);assert.equal(JSON.stringify(f.data),config);
});
