'use strict';

const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),vm=require('node:vm');
const {setup,hero}=require('./backend-gameplay-harness.cjs');
const {Node}=require('../navigation/runtime-harness.cjs');
const rules=require('../../assets/_script/EnemyTransform');
const warmup=require('../../assets/_script/StageAssetWarmup');
const roster=require('../../assets/KinghtFallConfig/GameJsonCfg.json').SoldierCfg;

function fixture(preload,settings={TransformSkill:{unitId:91090,delay:.5}},formIds) {
  const units=formIds?Object.fromEntries(formIds.map(id=>[id,roster[id]])):{91001:{...roster[91001],...settings},
    91090:{...roster[91090],TransformSkill:{unitId:91002,delay:1}},91002:roster[91002]};
  const spawns=[],h=setup({EnemyTransform:rules,KinghtFallMissionData:{KinghtFallTaskCountName:{Kill:'Kill'}},
    BattleSounds:{spawnEnemy(actor){spawns.push(actor.cfg.ID);}}});
  if(Object.values(units).some(unit=>unit.EnemySkills)){
    const file=require.resolve('../../assets/_script/EnemySkills'),exports={};
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports,cc:h.e.cc,require:h.e.load},{filename:file});
    h.e.stubs.EnemySkills=exports;
  }
  const manager=h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
  manager.data={SoldierCfg:units};manager.getSoldierCfgById=id=>units[id];
  h.e.stubs.KinghtFallConfig.KinghtFallBundelName.Enemy='Enemy';
  h.g.gameStatus=1;
  h.d.getHpAdd=()=>1;h.d.getAttAdd=()=>1;
  h.d.getGameBuff=()=>({Pamer:[2,1]});h.d.addTime.KillSoldier1=0;
  h.d.tryEndGame=()=>assert.fail('Changing form must not finish the wave');
  const pathList=[new Node('entry',h.g.ndPath,20,10),new Node('next',h.g.ndPath,90,30)];
  h.g.setPath=lane=>({bornIndex:lane,nodeIndex:0,pathList});
  let serial=0;
  const prefab=()=>{
    const actor=h.e.actor('KinghtFallEnemyBase',0,0,null);
    actor.node.components.push(actor);actor.uuid='enemy:'+ ++serial;
    actor.setLeft=function(left){this._visualLeft=left;};
    return actor.node;
  };
  if(preload)h.g._stageAssets={assets:Object.fromEntries(Object.values(units).map(unit=>['Enemy/'+unit.prefab+':prefab',prefab]))};
  h.g.addEnemy(formIds?formIds[0]:91001,2);
  h.pending.shift()(prefab);
  h.g.setPath=()=>assert.fail('Transform must keep the existing route');
  return {...h,units,spawns,prefab,pathList,source:h.d.enemyList[0]};
}

test('Transform swaps through the real enemy pool, keeps position and route progress, and awards no kill',()=>{
  const h=fixture(true),source=h.source;
  source.hp=2;source.node.setPosition(32,48);source.bornInfo.nodeIndex=1;source.setLeft(true);
  source.updateCombatTimers(.25);
  assert.equal(h.d.enemyList[0],source);
  assert.equal(source.updateCombatTimers(.25),false);
  assert.equal(h.d.enemyList.length,1);
  const next=h.d.enemyList[0];
  assert.equal(next.cfg.ID,91090);assert.equal(next.hp, h.units[91090].Health);
  assert.equal(next.node.x,32);assert.equal(next.node.y,48);assert(next._visualLeft);
  assert.equal(next.bornInfo.bornIndex,2);assert.equal(next.bornInfo.nodeIndex,1);
  assert.equal(next.bornInfo.pathList,h.pathList);assert(source._isPooled);
  assert.equal(next.updateCombatTimers(1),false);
  assert.equal(h.d.enemyList.length,1);assert.equal(h.d.enemyList[0].cfg.ID,91002);
  assert.deepEqual(h.spawns,[91001]);assert.equal(h.d.addTime.KillSoldier1,0);
  assert.equal(h.d.pendingEnemySpawns,0);assert.equal(h.pending.length,0);
});

test('a deferred Transform uses the live position and cannot replace an enemy that has died or left the battle',()=>{
  for(const outcome of ['moved','died','closed']){
    const h=fixture(false),source=h.source;
    source.updateCombatTimers(.5);
    assert.equal(h.pending.length,1);assert.equal(h.d.pendingEnemySpawns,0);
    source.updateCombatTimers(.5);assert.equal(h.pending.length,1);
    source.node.setPosition(41,12);
    if(outcome==='died')source.hp=0;
    if(outcome==='closed')h.g._combatEpoch++;
    h.pending.shift()(h.prefab);
    assert.equal(h.d.enemyList.length,1);
    if(outcome==='moved'){
      assert.equal(h.d.enemyList[0].cfg.ID,91090);assert.equal(h.d.enemyList[0].node.x,41);
    }else assert.equal(h.d.enemyList[0],source);
  }
});

test('the health trigger uses scaled maximum HP and remembers a qualifying hit until the combat update',()=>{
  const h=fixture(true,{TransformSkill:{unitId:91090,trigger:'health',healthPercent:50,delay:1}}),source=h.source;
  source.hp=source.hpMax=200;
  source.updateCombatTimers(10);
  assert.equal(h.d.enemyList[0],source);
  source.onAttacked(99,null,true);
  source.updateCombatTimers(.1);
  assert.equal(source.hp,101);
  assert.equal(h.d.enemyList[0],source);
  source.onAttacked(1,null,true);
  assert.equal(source.hp,100);
  source.hp=150;
  assert.equal(source.updateCombatTimers(.1),false);
  assert.equal(h.d.enemyList[0].cfg.ID,91090);
});

test('a lethal hit ends the life of an enemy equipped with a health-triggered Transform',()=>{
  const h=fixture(true,{TransformSkill:{unitId:91090,trigger:'health',healthPercent:100}}),source=h.source;
  const player=h.e.stubs.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
  player.getMissionData=()=>({recordQuestEvent(){},addTaskNum(){}});
  source.playDeath=()=>{};
  source.onAttacked(source.hp,null,true);
  assert.equal(source.hp,0);
  assert.equal(source.updateCombatTimers(1),false);
  assert.equal(h.d.enemyList[0],source);
});

test('Black Goat survives lethal hits at its 50% threshold and enters phase two with Crimson Regent stats and skills',()=>{
  const h=fixture(true,undefined,[91025,91188]),source=h.source;
  source.hp=source.hpMax=200;
  assert.equal(source.onAttacked(99,null,true),99);
  source.updateCombatTimers(.016);
  assert.equal(h.d.enemyList[0],source);
  assert.equal(source.onAttacked(1000,null,true),1);
  assert.equal(source.hp,100);
  assert.equal(source.onAttacked(1000,null,true),0);
  assert.equal(source.updateCombatTimers(.016),false);
  assert.equal(h.d.enemyList.length,1);
  const regent=h.d.enemyList[0];
  assert.equal(regent.cfg.ID,91188);
  assert.equal(regent.hp,h.units[91188].Health);
  assert.equal(regent.attack,Math.round(h.units[91188].AttackDamage));
  assert.equal(regent.cfg.UnitAttack.onHit.burn.percent,.15);
  assert(regent.time.EnemySkills.some(skill=>skill.id==='weaken'));
});

test('equipped support skills use their own intervals, ranges, and eligible targets',()=>{
  const h=fixture(true,{EnemySkills:{heal:{interval:1,radius:40,maxTargets:1,percent:30},
    haste:{interval:2,radius:40,maxTargets:1,percent:25,duration:3},
    damage:{interval:2,radius:40,maxTargets:1,percent:35,duration:3},
    move:{interval:2,radius:40,maxTargets:1,percent:45,duration:4},
    weaken:{interval:2,radius:40,maxTargets:2,percent:50,duration:5}}});
  const {source}=h;
  source.node.setPosition(0,0);source.hp=1;
  const target=(x,hp=100)=>({node:new Node('recipient',h.g.ndMain,x,0),hp,hpMax:100,buffs:[],
    addHpPro(value){this.hp+=value*this.hpMax;},addBuff(type,value){this.buffs.push({type,...value});}});
  const healthy=target(5),wounded=target(10,40),far=target(50,10),tower=target(70);
  h.d.enemyList.push(healthy,wounded,far);
  h.g.ctrPlay=target(20);
  tower.getAttackTargetParts=()=>[{points:[{x:30,y:-5},{x:80,y:-5},{x:80,y:5},{x:30,y:5}]}];
  h.d.getAttackableBuildList=()=>[tower];
  const types=h.e.load('KinghtFallInterface').KinghtFallEnemyBuffType;
  source.updateCombatTimers(1);
  assert.equal(wounded.hp,70);assert.equal(far.hp,10);assert.equal(source.hp,1);
  assert.equal(healthy.buffs.length,0);assert.equal(h.g.ctrPlay.buffs.length,0);
  source.updateCombatTimers(1);
  assert.deepEqual(healthy.buffs,[{type:types.AttackSpeed,addSpeed:.25,time:3},
    {type:types.DamageAdd,addNum:.35,time:3},{type:types.MoveSpeedAdd,addSpeed:.45,time:4}]);
  for(const opponent of [h.g.ctrPlay,tower])assert.deepEqual(opponent.buffs,[{type:types.DamageCut,subNum:.5,time:5}]);
});

test('opposing speed debuffs affect the closest eligible defenders and expire independently',()=>{
  const h=fixture(true,{EnemySkills:{
    attackSlow:{interval:1,radius:40,maxTargets:1,percent:30,duration:1},
    moveSlow:{interval:1,radius:40,maxTargets:2,percent:50,duration:2}
  }}), player=hero(h), troop=h.e.actor('KinghtFallSoldierBase',25,0,h.g.ndMain);
  h.d.getGameBuff=()=>null;
  h.source.node.setPosition(0,0);
  player.node.setParent(h.g.ndMain);player.node.setPosition(10,0);player._regenerationDisabled=true;
  delete player.getAttSpeed;player.attackSpeed=2;player.moveSpeed=100;
  delete troop.getSpeed;delete troop.getAttSpeed;troop.cfg={...troop.cfg,Speed:80};troop.attSpeed=3;
  const ally={node:new Node('caster ally',h.g.ndMain,2,0),hp:100,addBuff(){assert.fail('A caster ally received a debuff');}};
  const far={node:new Node('outside radius',h.g.ndMain,41,0),hp:100,addBuff(){assert.fail('Out of range');}};
  h.d.enemyList.push(ally);h.d.soldierList.push(troop,far);
  h.d.getAttackableBuildList=()=>[{node:new Node('tower',h.g.ndMain,1,0),hp:100,addBuff(){assert.fail('A tower received a unit debuff');}}];
  h.source.updateCombatTimers(1);
  assert.equal(player.getAttSpeed(),1.4);
  assert.equal(player.getSpeed(),50);
  assert.equal(troop.getAttSpeed(),3);
  assert.equal(troop.getSpeed(),40);
  const types=h.load('KinghtFallInterface').KinghtFallEnemyBuffType;
  player.onUpdata(.5);
  player.addBuff(types.MoveSlow,{subNum:.5,time:2},'moveSlow');
  assert.equal(player.getBuffList(types.MoveSlow).length,1);
  player.addBuff(types.MoveSlow,{subNum:.8,time:.5},'moveSlow');
  assert(Math.abs(player.getSpeed()-20)<1e-9);
  player.onUpdata(.5);
  assert.equal(player.getAttSpeed(),2);
  assert.equal(player.getSpeed(),50);
  player.onUpdata(1.5);
  assert.equal(player.getSpeed(),100);
});

function prepareOpponentForm(h, formId) {
  class Skeleton {
    findAnimation(name) { return ['idle','move'].includes(name); }
    setSkin(name) { this.skin=name; }
    setAnimation(_track,name) { this.animation=name; }
  }
  h.e.cc.Node=class extends Node{
    constructor(name){super(name);this.opacity=255;}
    destroy(){this.destroyed=true;this.setParent(null);}
  };
  const file=require.resolve('../../assets/_script/EnemyPolymorph'),exports={};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports,cc:h.e.cc,sp:{Skeleton},require:h.e.load},{filename:file});
  h.e.stubs.EnemyPolymorph=exports;
  h.e.stubs.EnemySkillVisuals=require('../../assets/_script/EnemySkillVisuals');
  h.units[formId]=roster[formId];
  h.g._stageAssets.options={config:{SoldierCfg:h.units},names:{Enemy:'Enemy'}};
  const data=new Node('form prefab'),art=new Node('spAni',data),skeleton=art.addComponent(Skeleton);
  skeleton.skeletonData={formId};skeleton.defaultSkin='default';art.scaleX=art.scaleY=.5;
  h.g._stageAssets.assets['Enemy/'+roster[formId].prefab+':prefab']={data};
  return skeleton.skeletonData;
}

test('Transform opponents replaces only the look, interrupts pending attacks, and restores the hero and troops',()=>{
  const h=fixture(true,{EnemySkills:{polymorph:{interval:1,radius:40,maxTargets:2,unitId:91014,duration:2}}});
  const form=prepareOpponentForm(h,91014), scheduler=h.load('GameToolsOverrides');
  h.e.stubs.GameToolsOverrides=scheduler;
  h.e.stubs.HeroMakerRider={clearCombatState(){}};
  const config=h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data;
  config.GameTools={timingDefaults:{'hero:hero:default':{attack:.8}}};
  const player=hero(h),troop=h.e.actor('KinghtFallSoldierItem03',25,0,h.g.ndMain);
  h.d.getGameBuff=()=>null;
  h.source.node.setPosition(0,0);
  player.node.setParent(h.g.ndMain);player.node.setPosition(10,0);
  player._combatGame=h.g;player._regenerationDisabled=true;player.heroStyle='mystic';
  player.ctrPlayAni.node=new h.e.cc.Node('hero art');player.ctrPlayAni.node.setParent(player.node);player.ctrPlayAni.node.opacity=192;
  h.load('HeroStyleRuntime').install(player,{});
  const runtime=player._styleRuntime;
  runtime.state.active={kind:'mystic-impact'};runtime.channelTarget=h.source;runtime.beamTarget=h.source;
  scheduler.attack(player,'hero',()=>assert.fail('The pending windup survived'));
  assert(scheduler.isPending(player));
  troop.spAni.node=new h.e.cc.Node('troop art');troop.spAni.node.setParent(troop.node);
  troop.ctrArr={node:new Node()};troop._targetRefresh=0;
  const Status=h.e.load('KinghtFallSoldierBase').KinghtFallSoldierStatus;
  troop.state=Status.Attack;
  h.d.soldierList.push(troop);
  const troopNode=troop.node,playerHp=player.hp,formPosition=player.node.getPosition();
  h.source.updateCombatTimers(1);
  assert(!scheduler.isPending(player));assert.equal(runtime.state.active,null);assert.equal(runtime.beamTarget,null);assert.equal(runtime.canCast(),false);
  assert.equal(player.hp,playerHp);assert.deepEqual(player.node.getPosition(),formPosition);
  assert.equal(troop.node,troopNode);assert.equal(troop.hp,100);assert.equal(troop.state,Status.Idle);
  const heroForm=player._opposingForm,troopForm=troop._opposingForm;
  assert.equal(heroForm.renderer.skeletonData,form);assert.equal(troopForm.renderer.skeletonData,form);
  assert.equal(player.ctrPlayAni.node.opacity,0);assert.equal(troop.spAni.node.opacity,0);
  assert.equal(h.d.soldierList[0],troop);
  assert.equal(troop.captureAttackTarget(),false);assert.equal(player.doAttack(),undefined);assert.equal(troop.doAttack(),undefined);
  troop.doMove();assert.equal(troopForm.renderer.animation,'move');
  troop.setPause(true);assert.equal(troopForm.renderer.paused,true);troop.setPause(false);
  player.onUpdata(2);troop.onUpdate(2);
  assert.equal(player._opposingForm,undefined);assert.equal(troop._opposingForm,undefined);
  assert.equal(player.ctrPlayAni.node.opacity,192);assert.equal(troop.spAni.node.opacity,255);
  assert(heroForm.node.destroyed&&troopForm.node.destroyed);
});

test('the damage and movement buffs affect actual enemy stats until they expire',()=>{
  const h=fixture(true,{}),unit=h.source,base=h.e.load('KinghtFallEnemyBase').default.prototype;
  h.d.getGameBuff=()=>null;
  const types=h.e.load('KinghtFallInterface').KinghtFallEnemyBuffType;
  unit.addBuff(types.DamageAdd,{addNum:.25,time:1},'damage');
  unit.addBuff(types.MoveSpeedAdd,{addSpeed:.5,time:1},'move');
  assert.equal(unit.getAttack(),unit.attack*1.25);
  assert.equal(base.getSpeed.call(unit),unit.cfg.Speed*1.5);
  unit.updateCombatTimers(1);
  assert.equal(unit.getAttack(),unit.attack);
  assert.equal(base.getSpeed.call(unit),unit.cfg.Speed);
});

test('overlapping skill tints restore the earlier buff and then the unit’s authored color',()=>{
  const h=fixture(true,{}),unit=h.source,types=h.e.load('KinghtFallInterface').KinghtFallEnemyBuffType;
  const visuals=require('../../assets/_script/EnemySkillVisuals');
  h.e.stubs.EnemySkillVisuals=visuals;
  h.e.cc.Color=class { fromHEX(hex){this.hex=hex;return this;} };
  h.g._stageAssets.options={config:{EnemySkillVisuals:{damage:{tint:'#a2b3c4'}}}};
  unit.body={color:{hex:'#446688'}};
  unit.addBuff(types.DamageAdd,{addNum:.1,time:2},'damage');
  unit.addBuff(types.MoveSpeedAdd,{addSpeed:.1,time:1},'move');
  assert.equal(unit.body.color.hex,'#75d8ed');
  unit.delBuffIdx(1);assert.equal(unit.body.color.hex,'#a2b3c4');
  unit.delBuffIdx(0);assert.equal(unit.body.color.hex,'#446688');
});

test('overlapping boost effects follow the recipient overhead and disappear on expiry or retirement',()=>{
  const h=fixture(true,{TransformSkill:{unitId:91090,delay:1}}),unit=h.source,{cc}=h.e;
  const types=h.e.load('KinghtFallInterface').KinghtFallEnemyBuffType;
  const file=require.resolve('../../assets/_script/EnemySkillVisuals'),visuals={};
  cc.Node=class extends Node {
    setContentSize(width,height){Object.assign(this,{width,height});}
    setScale(scale){this.scaleX=this.scaleY=scale;}
    destroy(){this.destroyed=true;this.setParent(null);}
  };
  cc.Sprite=class {static SizeMode={CUSTOM:0};};
  cc.Color=class {fromHEX(hex){return {hex};}};
  const renderer={skeletonData:{}},bar=new Node('Hero health bar');
  let body={minX:-18,maxX:26,maxY:62};
  unit.getSpAni=()=>renderer;h.g.ctrPlay.ctrHp={node:bar};bar.active=false;
  const depth={unitBounds(source,root){assert.equal(source,renderer);assert.equal(root,unit.node);return body;},
    unitReferenceSize(source,root){assert.equal(source,bar);assert.equal(root,unit.node);return {height:12};}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports:visuals,cc,require:()=>depth},{filename:file});
  h.e.stubs.EnemySkillVisuals=visuals;
  h.g._stageAssets.options={config:{EnemySkillVisuals:{move:{indicatorColor:'#a2b3c4',indicatorY:-20}}}};
  const frames=['haste','damage','move'].map(id=>({id}));
  for(const frame of frames)h.g._stageAssets.assets['resources/'+visuals.indicatorPath(frame.id)+':frame']=frame;
  unit.addBuff(types.AttackSpeed,{addSpeed:.25,time:.125}); // Innate support cast has no authored skill ID.
  unit.addBuff(types.AttackSpeed,{addSpeed:.25,time:.25},'haste');
  unit.addBuff(types.DamageAdd,{addNum:.25,time:.5},'damage');
  unit.addBuff(types.MoveSpeedAdd,{addSpeed:.25,time:1},'move');
  const [haste,damage,move]=unit._enemySkillEffects;
  [haste,damage,move].forEach((node,index)=>{
    assert.equal(node.parent,unit.node);
    assert.equal(node.getComponent(cc.Sprite).spriteFrame,frames[index]);
    assert.equal(node.width,visuals.indicatorSize);
  });
  const iconBottom=node=>node.y-node.height*node.scaleY/2;
  assert.deepEqual([haste.x,damage.x,move.x],[-20,4,28]);
  assert.equal(move.color.hex,'#a2b3c4');
  for(const node of [haste,damage,move])assert(iconBottom(node)>body.maxY+12*1.4);
  const firstY=damage.y;
  bar.active=true;unit.lateUpdate();assert.equal(damage.y,firstY);
  body={minX:-7,maxX:31,maxY:92};unit.lateUpdate();
  assert.equal(damage.y,firstY+30);assert.equal(damage.x,12);
  unit.updateCombatTimers(.125);
  unit.lateUpdate();
  assert.equal(haste.destroyed,undefined);assert.notEqual(move.x,36);
  unit.updateCombatTimers(.125);
  assert.equal(haste.destroyed,true);assert.equal(damage.destroyed,undefined);
  unit.updateCombatTimers(.25);
  assert.equal(damage.destroyed,true);assert.equal(move.destroyed,undefined);
  assert.equal(unit.updateCombatTimers(.5),false); // Transform cleans up the previous form's remaining effect.
  assert.equal(move.destroyed,true);assert.equal(unit._enemyBuffIndicators,undefined);
});

test('the built-in support cast is active by default and can be replaced or unequipped',()=>{
  const rules=require('../../assets/_script/EnemySkills');
  const unit=roster[90009],defaults=rules.definitions.find(skill=>skill.id==='heal').defaults;
  assert.equal(rules.innate(unit),'heal');
  assert(rules.originalEnabled(unit));
  assert(!rules.originalEnabled({...unit,EnemySkills:{heal:false}}));
  assert(!rules.originalEnabled({...unit,EnemySkills:{heal:defaults}}));
  assert(rules.originalEnabled({...unit,EnemySkills:{haste:rules.definitions.find(skill=>skill.id==='haste').defaults}}));
});

test('stage preparation includes every reachable form and selection rejects loops and missing forms',()=>{
  const units={91001:{...roster[91001],TransformSkill:{unitId:91090,delay:2}},
    91090:{...roster[91090],TransformSkill:{unitId:91002,trigger:'health',healthPercent:30}},91002:roster[91002]};
  const config={BuildEnum:{},SoldierCfg:units};
  const stage={WaveCfg:[{SpawnTimeline:[{unitId:91001}]}]};
  const plan=warmup.plan(config,stage,{Enemy:'Enemy'});
  assert.deepEqual(plan.enemies,['91001','91090','91002']);
  for(const unit of Object.values(units))assert(plan.items.some(asset=>asset.key==='Enemy/'+unit.prefab+':prefab'));
  assert.match(rules.issue(units[91002],{unitId:91001,delay:1},units),/previous form/);
  assert.match(rules.issue(units[91002],{unitId:90011,delay:1},units),/available enemy/);
  assert.match(rules.issue(units[91002],{unitId:91001,delay:0},units),/greater than zero/);
  assert.match(rules.issue(units[91002],{unitId:91001,trigger:'health',healthPercent:101},units),/up to 100/);
});

test('stage preparation loads the chosen form without adding its abilities to the stage',()=>{
  const skills=require('../../assets/_script/EnemySkills'),form={...roster[91014],TransformSkill:{unitId:91002,delay:1}};
  const setting={interval:2,duration:1,maxTargets:1,radius:200,unitId:91014};
  const units={91001:{...roster[91001],EnemySkills:{polymorph:setting}},91014:form,91002:roster[91002]};
  const plan=warmup.plan({BuildEnum:{},SoldierCfg:units},{WaveCfg:[{SpawnTimeline:[{unitId:91001}]}]},{Enemy:'Enemy'});
  assert.deepEqual(plan.enemies,['91001']);
  assert(plan.items.some(asset=>asset.key==='Enemy/'+form.prefab+':prefab'));
  assert(!plan.items.some(asset=>asset.key==='Enemy/'+units[91002].prefab+':prefab'));
  assert.match(skills.issue({polymorph:{...setting,unitId:90011}},units,{}),/available unit model/);
});

test('stage preparation loads authored enemy effects used by direct and transformed units',()=>{
  const skills=require('../../assets/_script/EnemySkills');
  const damage=skills.definitions.find(def=>def.id==='damage').defaults;
  const units={91001:{...roster[91001],TransformSkill:{unitId:91090,delay:2}},
    91090:{...roster[91090],EnemySkills:{damage}}};
  const effect=path=>({resource:'a6f0930f-9b57-49be-b467-a0497ee829da',resourceBundle:'resources',resourcePath:path});
  const config={BuildEnum:{},SoldierCfg:units,EnemySkillVisuals:{transform:effect('vfx/transform'),damage:effect('vfx/boost'),move:effect('vfx/move')}};
  const plan=warmup.plan(config,{WaveCfg:[{SpawnTimeline:[{unitId:91001}]}]},{Enemy:'Enemy'});
  assert(plan.items.some(asset=>asset.key==='resources/vfx/transform:spine'));
  assert(plan.items.some(asset=>asset.key==='resources/vfx/boost:spine'));
  assert(!plan.items.some(asset=>asset.key==='resources/vfx/move:spine'));
});

test('stage preparation loads only the enabled boost images used by native or equipped skills',()=>{
  const skills=require('../../assets/_script/EnemySkills'),visuals=require('../../assets/_script/EnemySkillVisuals');
  const boosts=Object.fromEntries(skills.definitions.filter(skill=>['damage','move'].includes(skill.id)).map(skill=>[skill.id,skill.defaults]));
  const units={90006:roster[90006],91001:{...roster[91001],EnemySkills:boosts}};
  const stage={WaveCfg:[{SpawnTimeline:[{unitId:90006},{unitId:91001}]}]},config={BuildEnum:{},SoldierCfg:units};
  const loaded=(manifest,id)=>manifest.items.some(asset=>asset.key==='resources/'+visuals.indicatorPath(id)+':frame');
  const defaults=warmup.plan(config,stage,{Enemy:'Enemy'});
  assert(['haste','damage','move'].every(id=>loaded(defaults,id)));
  const custom=warmup.plan({...config,EnemySkillVisuals:{damage:{showIndicator:false},move:{indicatorOpacity:0}}},stage,{Enemy:'Enemy'});
  assert(loaded(custom,'haste'));assert(!loaded(custom,'damage'));assert(!loaded(custom,'move'));
});

test('stage preparation preloads the healing Spine for innate and equipped healers',()=>{
  const {healingEffect}=require('../../assets/_script/EnemySkillVisuals');
  const key=healingEffect.resourceBundle+'/'+healingEffect.resourcePath+':spine';
  const heal=require('../../assets/_script/EnemySkills').definitions.find(skill=>skill.id==='heal').defaults;
  const units={90009:roster[90009],91001:{...roster[91001],EnemySkills:{heal}},91002:roster[91002]};
  const config={BuildEnum:{},SoldierCfg:units};
  const planned=(unitId,cfg=config)=>warmup.plan(cfg,{WaveCfg:[{SpawnTimeline:[{unitId}]}]},{Enemy:'Enemy'}).items;
  assert(planned(90009).some(asset=>asset.key===key));
  assert(planned(91001).some(asset=>asset.key===key));
  assert(!planned(91002).some(asset=>asset.key===key));
  assert(!planned(90009,{...config,EnemySkillVisuals:{heal:{showBuiltin:false}}}).some(asset=>asset.key===key));
});

test('saved skill effects use the stage-owned clip and release it with the recipient',()=>{
  const file=require.resolve('../../assets/_script/EnemySkillVisuals'),exports={};
  class Node {
    setPosition(x,y){this.position=[x,y];}
    setScale(scale){this.scale=scale;}
    setParent(parent){this.parent=parent;}
    addComponent(){return this.spine={setCompleteListener(done){this.done=done;},setAnimation(track,name,loop){this.animation={track,name,loop};}};}
    destroy(){this.destroyed=true;}
  }
  class Color{fromHEX(value){this.value=value;return this;}}
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports,cc:{Node,Color,isValid:object=>!!object&&!object.destroyed},sp:{Skeleton:class{}}},{filename:file});
  const visual={resource:'a6f0930f-9b57-49be-b467-a0497ee829da',resourceBundle:'resources',resourcePath:'vfx/boost',
    resourceAnimation:'pulse',offsetX:7,offsetY:12,scale:.8,rotation:10,opacity:.5,playback:1.5,color:'#112233'};
  const asset={skeletonJson:{animations:{intro:{},pulse:{}}}},owner={node:new Node()};
  const game={_stageAssets:{assets:{'resources/vfx/boost:spine':asset},options:{config:{EnemySkillVisuals:{damage:visual}}}}};
  exports.show(owner,game,exports.fromGame(game,'damage'));
  const [node]=owner._enemySkillEffects;
  assert.equal(node.parent,owner.node);assert.equal(node.spine.skeletonData,asset);
  assert.deepEqual(node.spine.animation,{track:0,name:'pulse',loop:false});assert.deepEqual(node.position,[7,12]);
  assert.equal(node.scale,.8);assert.equal(node.angle,10);assert.equal(node.opacity,128);assert.equal(node.spine.timeScale,1.5);
  node.spine.done();assert(node.destroyed);assert.equal(owner._enemySkillEffects.size,0);
  exports.show(owner,game,exports.fromGame(game,'damage'));
  const [pending]=owner._enemySkillEffects;exports.clear(owner);assert(pending.destroyed);assert.equal(owner._enemySkillEffects,undefined);
});
