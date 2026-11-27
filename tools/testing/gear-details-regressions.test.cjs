'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const root=path.resolve(__dirname,'../..');
function fixture(){
  const data=require('./fixtures/legacy-hero-config.cjs')();
  const prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomePersonCtrl.prefab')));
  const Weapons=require('../../assets/_script/HeroWeapons'),levels=[10,2,1,1,1,1],user={data:{personLevel:levels},getGoldNum:()=>100000,getMaxStage:()=>2,getMaxOrder:()=>1,getPersonLevel:id=>Weapons.level(user.data,id),getHeroWeapon:()=>Weapons.selected(user.data),getHeroWeaponLevel:(_style,id)=>Weapons.level(user.data,id)};
  const Label=function(){},Sprite=function(){},Button=function(){},noop=()=>{};
  function node(id){
    const original=prefab[id],label={string:'stale'},sprite={},button={interactable:true};
    const result={name:original._name,active:true,handlers:{},on(type,handler){this.handlers[type]=handler;},children:(original._children||[]).map(r=>node(r.__id__)),getChildByName:name=>result.children.find(n=>n.name===name),getComponent:Type=>Type===Label?label:Type===Sprite?sprite:button,getComponentInChildren:()=>result.children[0].getComponent(Label)};
    return result;
  }
  const deps={BaseCtrl:{default:function(){}},BaseButton:{BaseButton:Button},Utils:{Utils:{StringFormat:(text,value)=>text+value}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}},KinghtFallEnum:{KinghtFallEnumEquipEnum:{Body:1,Head:2,Arrow:3,Bow:4,Gloves:5,horse:6}},KinghtFallConfig:{KinghtFallBundelName:{IconCharacter:'icons',IconGood:'goods'}},KinghtFallTextConfig:{KinghtFallTextConfig:{HomeTrea02:'level',HomePerson04:'locked'}}};
  deps.KinghtFallModle={default:{getInstance:()=>({numberFomat:String})}};
  deps.HeroWeapons=require('../../assets/_script/HeroWeapons');
  deps.HeroEquipmentStats=require('../../assets/_script/HeroEquipmentStats');
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

test('Gear shows and enforces each stage-clear requirement even after the last wave', () => {
  const f = fixture(), { owner, user, deps, Label } = f;
  owner.cfgEquip = require('../../assets/KinghtFallConfig/GameJsonCfg.json').EquipCfg;
  owner.nodeInfo.forEach(row => { row.cfg = owner.cfgEquip[row.type - 1]; });
  f.levels.fill(1);
  let stage = 1, purchases = 0;
  user.getGoldNum = () => 1e9;
  user.getMaxStage = () => stage;
  user.getMaxOrder = () => 12;
  deps.KinghtFallEnum.KinghtFallEnumGoodsCfg = { Coin: 2001 };
  deps.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance = () => ({
    getUserData: () => user,
    purchase() { purchases++; return false; }
  });
  for (const [slot, clearStage] of [[2, 2], [5, 3], [4, 4], [3, 5], [6, 6]]) {
    const row = owner.nodeInfo[slot - 1], lock = row.ndInfo.getChildByName('ndLock');
    const upgrade = row.ndInfo.getChildByName('btnUpgeade');
    stage = clearStage;
    owner.initView();
    assert.equal(upgrade.active, false);
    assert.equal(lock.getComponentInChildren(Label).string, 'locked' + clearStage);
    const before = purchases;
    owner.onUpgeade(slot);
    assert.equal(purchases, before);
    stage++;
    owner.initView();
    assert.equal(lock.active, false);
    assert.equal(upgrade.active, true);
    owner.onUpgeade(slot);
    assert.equal(purchases, before + 1);
  }
});

test('both upper weapon slots open the picker, lower upgrade icons have no misleading switch action, and upgrade buttons retain their action',()=>{
  const f=fixture(),owner=f.owner;let opened=0,installed=0,upgraded=0;f.deps.HeroWeaponPicker={open(){opened++;},installSwitch(){installed++;}};
  owner.ndItemTop=owner.nodeInfo.map(item=>item.ndItem);owner.ndItemDown=owner.nodeInfo.map(item=>item.ndInfo);owner.labNum=owner.nodeInfo.map(item=>item.labNum);owner.spPower={node:{}};
  for(const name of ['refreshEquipmentLimits','bindScrollFooter','layoutScrollToFooter','initView','initEventListener','scheduleHomeGuide'])owner[name]=()=>{};owner.onUpgeade=()=>upgraded++;
  owner.start();assert.equal(installed,1);for(const slot of [3,4]){owner.ndItemTop[slot-1].handlers.tap();assert.equal(owner.ndItemDown[slot-1].getChildByName('ndItem').handlers.tap,undefined);owner.ndItemDown[slot-1].getChildByName('btnUpgeade').handlers.tap();}assert.equal(opened,2);assert.equal(upgraded,2);assert.equal(owner.ndItemTop[0].handlers.tap,undefined);
});

test('Gear skill icon follows the equipped style and opens its saved active description',()=>{
  class Node {
    constructor(name) { this.name=name; this.children=[]; this.handlers={}; this.components=new Map(); }
    setParent(parent) { this.parent=parent; parent.children.push(this); }
    setPosition(x,y) { this.x=x; this.y=y; }
    setContentSize(width,height) { this.width=width; this.height=height; }
    addComponent(Type) { const component=new Type(); this.components.set(Type,component); return component; }
    on(type,handler) { this.handlers[type]=handler; }
    off(type) { delete this.handlers[type]; }
    destroy() { this.destroyed=true; this.children.forEach(child=>child.destroy()); }
    child(name) { return this.children.find(child=>child.name===name&&!child.destroyed); }
    get activeInHierarchy() { return !this.destroyed && this.active !== false && (!this.parent || this.parent.activeInHierarchy); }
  }
  Node.EventType={TOUCH_END:'tap',SIZE_CHANGED:'size'};
  class Graphics { roundRect(){} rect(){} fill(){} clear(){} }
  class Label {}
  Label.HorizontalAlign={LEFT:0}; Label.VerticalAlign={TOP:0,CENTER:1}; Label.Overflow={SHRINK:1};
  class Sprite {}
  Sprite.SizeMode={CUSTOM:0}; Sprite.Type={SIMPLE:0};
  class Mask {}
  Mask.Type={IMAGE_STENCIL:2};
  const canvas=new Node('Canvas'), info=new Node('ndPersonInfo'), preview=new Node('ndPlayAni'), actor=new Node('ndPlay');
  canvas.setContentSize(750,1334);info.setParent(canvas);preview.setParent(info);preview.setPosition(-206,-89);actor.setParent(preview);
  const owner={node:info,ctrPlayAni:{node:actor}}, loads=[];
  const data={HeroSkills:{bruiser:{cooldown:12,descriptions:{active:'Cleave. Cooldown {cooldown}s.'}}}};
  let style='bruiser', failStencil=false, deferStencil=false, pendingStencil, iconFailures=0;
  const frames = new Map();
  const cc={Node,Graphics,Label,Sprite,Mask,BlockInputEvents:class{},color:(...args)=>args,isValid:node=>!!node&&!node.destroyed,
    find:()=>canvas,resources:{load(resource,Type,done){
      loads.push(resource);
      const failIcon = resource.startsWith('skills/icons/') && iconFailures > 0;
      if (failIcon) iconFailures--;
      if (resource.endsWith('mask') && failStencil || failIcon) {
        done(Error('transient asset error'));
        return;
      }
      if (!frames.has(resource) || frames.get(resource).destroyed) frames.set(resource, {
        refs: 0, getOriginalSize: () => ({width:80,height:80}),
        addRef() { this.refs++; }, decRef() { if (--this.refs === 0) this.destroyed = true; }
      });
      const frame = frames.get(resource);
      if (resource.endsWith('mask') && deferStencil) pendingStencil = () => done(null, frame);
      else done(null, frame);
    }}};
  const deps={KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({data})}},
    KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeapon:()=>({id:style})})})}}};
  const context={exports:{},cc,require:name=>deps[name]||require('../../assets/_script/'+name)};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroWeaponPicker.js'),'utf8'),context);
  const picker=context.exports, before=JSON.stringify(data), tap=()=>({stopPropagation(){}});
  picker.refreshSkill(owner);
  const button=info.child('Fighting skill');
  assert.deepEqual([button.x,button.y,button.width],[-302,3,82]);
  assert.deepEqual(loads,['skills/rounded-icon-mask','skills/icons/bruiser']);
  assert.equal(button.child('Rounded skill icon').components.get(Mask).type,Mask.Type.IMAGE_STENCIL);
  picker.refreshSkill(owner);assert.equal(loads.length,2);
  const bruiser = frames.get('skills/icons/bruiser');
  assert.equal(bruiser.refs, 1);
  bruiser.addRef();
  bruiser.decRef();
  assert.equal(bruiser.destroyed, undefined, 'Gear keeps its frame when the battle HUD releases the same asset');
  button.handlers.tap(tap());button.handlers.tap(tap());
  const popup=canvas.child('Fighting skill details'), panel=popup.child('Skill panel outline');
  assert.equal(canvas.children.filter(child=>child.name==='Fighting skill details').length,1);
  assert.equal(panel.child('Skill name').components.get(Label).string,'Blood Cleave');
  assert.equal(panel.child('Skill description').components.get(Label).string,'Cleave. Cooldown 12s.');
  canvas.setContentSize(540,960);canvas.handlers.size();
  assert.equal(popup.width,540);assert.equal(panel.scale,(540-28)/604);
  panel.child('Close').handlers.tap(tap());
  assert.equal(canvas.child('Fighting skill details'),undefined);
  style='guardian';failStencil=true;iconFailures=2;picker.refreshSkill(owner);
  assert.equal(info.child('Fighting skill'),button);
  assert.equal(bruiser.refs, 0);
  picker.refreshSkill(owner);
  assert.equal(loads.at(-1),'skills/icons/guardian');
  const current = button.child('Rounded skill icon');
  assert.equal(current.child('Skill icon').components.get(Sprite).spriteFrame, frames.get('skills/icons/guardian'));
  button.handlers.tap(tap());
  const guardian=canvas.child('Fighting skill details');
  assert.equal(guardian.child('Skill panel outline').child('Skill name').components.get(Label).string,'Iron Bulwark');
  guardian.handlers.tap({target:guardian});
  assert.equal(canvas.child('Fighting skill details'),undefined);
  button.handlers.tap(tap());
  picker.close(owner);assert.equal(canvas.child('Fighting skill details'),undefined);assert.equal(canvas.handlers.size,undefined);
  assert.equal(frames.get('skills/icons/guardian').refs, 1);
  picker.close(owner, true);
  assert.equal(frames.get('skills/icons/guardian').refs, 0);
  style='fighter';failStencil=false;deferStencil=true;picker.refreshSkill(owner);
  const fighter = button.child('Rounded skill icon');
  info.active = false;
  pendingStencil();
  assert.equal(fighter.components.has(Mask), false);
  info.active = true;
  picker.refreshSkill(owner);
  assert.equal(fighter.components.get(Mask).type, Mask.Type.IMAGE_STENCIL);
  assert.equal(fighter.child('Skill icon').components.get(Sprite).spriteFrame, frames.get('skills/icons/fighter'));
  picker.close(owner, true);
  assert.equal(JSON.stringify(data),before);
});

test('lobby idle loops without moving the hooves or drifting from the fitted base pose',()=>{
  const root={scaleX:.8,scaleY:.8,y:40};
  const context={exports:{},require:()=>({})};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroMakerRider.js'),'utf8'),context);
  const animate=context.exports.createLobbyIdle(root,-25);
  const hoof=root.y-25*root.scaleY;
  animate(1.3);
  assert(root.scaleY>.8);
  assert(root.scaleX<.8);
  assert(Math.abs(root.y-25*root.scaleY-hoof)<1e-9);
  animate(1.3);
  assert.deepEqual(root,{scaleX:.8,scaleY:.8,y:40});
});

test('Gear refreshes both item names, shared levels and account CP after equipping another style', () => {
  const f = fixture(), {HeroWeapons: Weapons, HeroLoadout: Loadout} = f.deps;
  f.user.getMaxStage = () => 100;
  f.levels.fill(1);
  Weapons.upgrade(f.user.data, 4, 15);
  Weapons.upgrade(f.user.data, 3, 11);
  f.user.data.talentInfo = f.data.TalentLevelCfg.filter(row => row.HeroStyle === 'skirmisher').map(row => ({id: row.ID, isLock: true}));
  const label = (node, name) => node.getChildByName(name).getComponent(f.Label).string;
  const checkItem = (slot, name, level) => {
    const row = f.owner.nodeInfo[slot - 1];
    assert.equal(label(row.ndInfo, 'labName'), name);
    assert.equal(label(row.ndItem, 'labPower'), 'level' + level);
    assert.equal(label(row.ndInfo.getChildByName('ndItem'), 'labPower'), 'level' + level);
  };
  f.owner.initView();
  checkItem(4, 'Skirmisher · Bow', 15);
  checkItem(3, 'Skirmisher · Arrow', 11);
  Weapons.select(f.user.data, 'bruiser');
  const before = JSON.stringify(f.user.data), config = JSON.stringify(f.data);
  for (let i = 0; i < 3; i++) {
    f.owner.initView();
    checkItem(4, 'Bruiser · Axe', 15);
    checkItem(3, 'Bruiser · Skull Charm', 11);
    const power = f.owner._combatPower;
    assert.equal(power.style, 'bruiser');
    assert.equal(power.levels[4], 15);
    assert.equal(power.levels[3], 11);
    assert(power.bonuses.damage > 0);
    assert.equal(f.owner.labPower.string, String(Loadout.calculate(f.data, f.user).displayCp));
  }
  assert.equal(JSON.stringify(f.user.data), before);
  assert.equal(JSON.stringify(f.data), config);
});

test('Gear CP uses the same six combat stats at locked and unlocked stages and handles invalid stats without showing NaN',()=>{
  const f=fixture();f.levels.fill(1);f.user.getMaxStage=()=>1;f.user.getMaxOrder=()=>1;f.owner.initView();const cp=f.owner.labPower.string;assert.equal(cp,String(f.deps.HeroLoadout.calculate(f.data,f.user).displayCp));
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

test('each quarter-point regeneration upgrade adds exactly one whole Gear CP', () => {
  const { owner, levels } = fixture();
  for (const level of [1, 20, 49]) {
    levels.fill(level);
    owner.refreshCombatPower();
    const before = owner._combatPower;
    const displayedBefore = Number(owner.labPower.string);
    assert.equal(owner.labPower.string, String(Math.round(before.cp * 10) + Math.round(before.regen * 4)));

    levels[1]++;
    owner.refreshCombatPower();
    const after = owner._combatPower;
    assert.equal(after.regen - before.regen, .25);
    assert.equal(after.cp, before.cp);
    assert.equal(owner.labPower.string, String(displayedBefore + 1));
  }
});

test('Gear CP includes the saved hero animation speed and refreshes paused attacks without writing progress',()=>{
  const f=fixture();f.levels.fill(1);let relative=.5;
  f.context.cc.resources={};f.deps.CharacterAppearance={animationSpeed(actor,team){assert.equal(actor,f.owner);assert.equal(team,'hero');return relative;}};
  const before=JSON.stringify(f.user.data),config=JSON.stringify(f.data),hit=f.data.GameTools.timingDefaults['hero:hero:default'].attack;
  f.owner.refreshCombatPower();const slow=f.owner._combatPower;
  assert.equal(slow.effectiveAttackRate,1/(1+hit/.5));assert.equal(slow.directDps,20*slow.effectiveAttackRate);
  relative=1;f.owner.refreshCombatPower();assert(f.owner._combatPower.cp>slow.cp);
  relative=0;f.owner.refreshCombatPower();assert.equal(f.owner._combatPower.effectiveAttackRate,0);assert.equal(f.owner._combatPower.directDps,0);assert.equal(f.owner.labPower.string,'40');
  assert.equal(JSON.stringify(f.user.data),before);assert.equal(JSON.stringify(f.data),config);
});
