'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const Stats=require('../../assets/_script/UnitLevelStats');
const {environment,near}=require('../navigation/runtime-harness.cjs');

const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(id=90001){
  const e=environment();e.stubs.UnitLevelStats=Stats;
  Object.assign(e.cfg,{ID:id,Speed:70,AttackType:1});
  const manager=e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
  manager.data.GameTools={timingDefaults:{'ally:90001:default':{attack:.27}},timings:{'ally:90001:default':{attack:.31}}};
  const actor=e.actor('KinghtFallSoldierItem01');delete actor.getAttSpeed;delete actor.getSpeed;
  actor.initData(id);actor.setParent({index:51,buildInfo:{cfg:{level:1}}});actor.initBuffData();
  return {...e,actor,settings:manager.data.GameTools};
}
function stats(actor){return{hp:actor.hpMax,attack:actor.getAttack(),range:actor.attackRange,rate:actor.getAttSpeed(),speed:actor.getSpeed(),colliders:actor.node.getComponents(actor._cc.CircleCollider).map(c=>c.radius)};}

test('tier stats use the same authored barracks level as character appearances, never the branch index',()=>{
  for(const level of [1,2,3])assert.equal(Stats.level({outBuild:{index:50+level,buildInfo:{cfg:{level}},getLevel:()=>99}}),level);
  assert.equal(Stats.level({outBuild:{getLevel:()=>2}}),2);
  for(const level of [0,-1,1.5,'2',NaN,Infinity])assert.equal(Stats.level({outBuild:{buildInfo:{cfg:{level}},getLevel:()=>3}}),null);
  assert.equal(Stats.level(null),null);assert.equal(Stats.key(90003,2),'ally:90003:level:2');
});

test('sparse overrides preserve identifiers, unknown fields and unconfigured base stats without mutating shared records',()=>{
  const unknown=Object.freeze({preserve:19}),base=Object.freeze({ID:90001,Health:40,AttackDamage:10,AttackInterval:1,AttackRange:50,SearchRange:220,Speed:102,Unknown:unknown});
  const settings={unitLevels:{'ally:90001:level:2':{Health:75,AttackDamage:18,ID:12345,Unknown:{discard:true},AttackRange:'100'}}};
  const before=clone(settings),resolved=Stats.resolve(base,settings,2);
  assert.notEqual(resolved,base);assert.equal(resolved.Health,75);assert.equal(resolved.AttackDamage,18);assert.equal(resolved.AttackRange,50);assert.equal(resolved.ID,90001);assert.equal(resolved.Unknown,unknown);assert.deepEqual(settings,before);
  for(const value of [1,3,0,-1,'2',Infinity,NaN])assert.equal(Stats.resolve(base,settings,value),base);
  assert.equal(Stats.resolve(base,{unitLevels:{'ally:90001:level:2':{Health:40,Speed:102}}},2),base,'same-value overrides retain the existing config identity');
  assert.equal(Stats.resolve(base,{},2),base);assert.equal(Stats.resolve(base,null,2),base);
});

test('malformed runtime overrides are ignored and valid zero damage, range and movement remain supported',()=>{
  const base={ID:90001,Health:40,AttackDamage:10,AttackInterval:1,AttackRange:50,SearchRange:220,Speed:102};
  for(const invalid of [null,[],7,'bad'])assert.equal(Stats.resolve(base,{unitLevels:{'ally:90001:level:2':invalid}},2),base);
  assert.equal(Stats.resolve(base,{unitLevels:{'ally:90001:level:2':{Health:0,AttackInterval:0,AttackRange:NaN,Speed:-1,AttackDamage:Infinity}}},2),base);
  const result=Stats.resolve(base,{unitLevels:{'ally:90001:level:2':{AttackDamage:0,AttackRange:0,SearchRange:0,Speed:0}}},2);
  for(const field of ['AttackDamage','AttackRange','SearchRange','Speed'])assert.equal(result[field],0);
  assert.equal(Stats.valid('Unknown',1),false);
});

test('optional sight overrides preserve virtual defaults and independently inherit or override each allied level',()=>{
  const base=Object.freeze({ID:90001,AttackRange:50,SearchRange:220,Future:{keep:true}}),empty={unitLevels:{[Stats.key(90001,2)]:{future:{keep:true}}}};assert(Stats.FIELDS.includes('SightRange'));assert.equal(Stats.resolve(base,empty,2),base);assert.equal(Object.hasOwn(base,'SightRange'),false);
  for(const invalid of [-1,NaN,Infinity,'240',null]){assert.equal(Stats.valid('SightRange',invalid),false);assert.equal(Stats.resolve(base,{unitLevels:{[Stats.key(90001,2)]:{SightRange:invalid}}},2),base);}
  for(const value of [0,240,450]){const settings={unitLevels:{[Stats.key(90001,2)]:{SightRange:value}}},before=clone(settings),resolved=Stats.resolve(base,settings,2);assert.equal(resolved.SightRange,value);assert.equal(resolved.AttackRange,50);assert.equal(resolved.SearchRange,220);assert.equal(resolved.Future,base.Future);assert.equal(Stats.resolve(base,settings,1),base);assert.deepEqual(settings,before);}
  const configured=Object.freeze({...base,SightRange:400});assert.equal(Stats.resolve(configured,{unitLevels:{[Stats.key(90001,2)]:{SightRange:400}}},2),configured);
});

test('retained allies upgrade through all three tiers with their HP, damage, cadence, range, colliders and speed',()=>{
  const f=fixture(),u=f.actor,before=clone(f.cfg);u._cc=f.cc;
  f.settings.unitLevels={};
  for(const level of [1,2,3])f.settings.unitLevels[Stats.key(90001,level)]={Health:100*level,AttackDamage:7*level,AttackInterval:.5*level,AttackRange:30*level,SearchRange:40+level,Speed:60+level};
  for(const level of [1,2,3]){
    u.outBuild.buildInfo.cfg.level=level;u.setNew();
    assert.deepEqual(stats(u),{hp:100*level,attack:7*level,range:30*level,rate:.5*level,speed:60+level,colliders:[30*level,Math.max(30*level,u.cfg.SightRange===undefined?240:u.cfg.SightRange)]});
    assert.equal(u.hp,u.hpMax);assert.equal(u.cfg.ID,90001);assert.notEqual(u.cfg,f.cfg);
  }
  assert.deepEqual(f.cfg,before,'tier upgrades never mutate the shared base unit');
});

test('respawns retain their tier while pooling and unconfigured tiers restore inherited stats without stale parents',()=>{
  const f=fixture(),u=f.actor;u._cc=f.cc;
  f.settings.unitLevels={'ally:90001:level:1':{Health:120,AttackDamage:8},'ally:90001:level:3':{Health:300,AttackDamage:30,AttackInterval:2,AttackRange:150,Speed:110}};
  u.outBuild.buildInfo.cfg.level=3;u.setNew();u.hp=1;u.node.active=false;u.setNew();assert.equal(u.hp,300);assert.equal(u.getAttack(),30);
  u.initData(90001);assert.equal(u.cfg,f.cfg,'pooled initialization starts from the base record, even before the new barracks parent is assigned');assert.equal(u.hpMax,100);assert.equal(u.attSpeed,1);
  u.setParent({index:22,buildInfo:{cfg:{level:1}}});u.setNew();assert.equal(u.hpMax,120);assert.equal(u.getAttack(),8);assert.equal(u.attackRange,20);assert.equal(u.attSpeed,1);
  u.outBuild.buildInfo.cfg.level=2;u.setNew();assert.equal(u.cfg,f.cfg);assert.equal(u.hpMax,100);assert.equal(u.getAttack(),5);assert.equal(u.attackRange,20);assert.equal(u.getSpeed(),70);
});

test('the shipped barracks roster refresh upgrades existing same-ID soldiers without replacing them',()=>{
  const f=fixture(),u=f.actor,build={buildInfo:{cfg:{level:1,Data:[1,90001,8]}},VideoTimes:0,enemyList:[u],_rosterRequests:{},ndVideoSoldier:{SolID:90001}};
  u.setParent(build);f.settings.unitLevels={};for(const level of [1,2,3])f.settings.unitLevels[Stats.key(90001,level)]={Health:100+level,AttackDamage:10+level,AttackRange:40+level};
  const update=f.load('KinghtFallBuildBarracks').default.prototype.initSoldier;
  for(const level of [1,2,3]){build.buildInfo.cfg.level=level;update.call(build);assert.equal(build.enemyList[0],u);assert.equal(u.hpMax,100+level);assert.equal(u.getAttack(),10+level);assert.equal(u.attackRange,40+level);assert.equal(Stats.level(u),level);}
  assert.equal(build._rosterSignature,'90001:1','unchanged ID/count does not prevent a tier stat refresh');
});

test('a dead soldier upgraded while respawning clears Follow pickup state before new tier HP restores it',()=>{
  const f=fixture(),u=f.actor,observed=[];
  f.settings.unitLevels={'ally:90001:level:2':{Health:240,AttackDamage:24}};
  Object.assign(f.game,{_separateArmyCommands:true,isAgg:true});
  u._personalRallyPoint={pos:{x:11,y:12}};u._followSelected=true;u._followPickupBlocked=false;u.isAgg=true;u.hp=0;
  u.isDead=function(){observed.push(this.hp);return this.hp<=0;};u.outBuild.buildInfo.cfg.level=2;
  u.setNew();
  assert.equal(observed[0],0,'respawn state must be captured before applying upgraded HP');
  assert.equal(u.hp,240);assert.equal(u.hpMax,240);assert.equal(u.getAttack(),24);
  assert.equal(u._followSelected,false);assert.equal(u._followPickupBlocked,true);assert.equal(u.isAgg,false);
  assert.deepEqual(u._personalRallyPoint,{pos:{x:11,y:12}});
});

test('tier stats remain the base for talents, perks, ranged haste and conditional modifiers after the army relic rework',()=>{
  const f=fixture(90003),u=f.actor,data=f.game.gameData;f.cfg.AttackType=2;
  const enums=f.stubs.KinghtFallEnum,talents=enums.KinghtFallEnumTalentCfg,buffs=enums.KinghtFallEnumBuffCfg,treasures=enums.KinghtFallEnumTreasureEnum,time=f.stubs.KinghtFallGameCtrlData.KinghtFallTimeType;
  data.talentAdd[talents.TalenType02]=[[.2],[.3]];data.talentAdd[talents.TalenType03]=[[.2]];data.talentAdd[talents.TalenType01]=[[.05]];data.talentAdd[talents.TalenType05]=[[.2]];
  data.treasureAdd[treasures.BowmanStrike]=[.1,.2];data.treasureAdd[treasures.DartingTalisman]=[.25];data.treasureAdd[treasures.WindstormBoots]=[.05];
  // The minimal harness exposes string enums for talent/treasure IDs. Time
  // keys are explicit so independent runtime conditionals remain separate.
  Object.assign(time,{SoldierMaxHp:'maxHp',SoldierDamage:'damage',SoldierDamage1:'damage1',SoldierDamage2:'damage2'});
  Object.assign(data.addTime,{maxHp:.1,damage:.2,damage1:.1,damage2:.2});
  const active={};for(const [id,p]of[[buffs.Buff32,[.1]],[buffs.Buff53,[.05]],[buffs.Buff45,[.25,.1]],[buffs.Buff43,[.15]],[buffs.Buff44,[.1,.1]],[buffs.Buff31,[.2]],[buffs.Buff52,[.15]]])active[id]={Pamer:p};data.getGameBuff=id=>active[id]||null;
  f.settings.unitLevels={'ally:90003:level:2':{Health:200,AttackDamage:20,AttackInterval:.8,AttackRange:100,SearchRange:30,Speed:80}};
  u.outBuild.buildInfo.cfg.level=2;u.setNew();
  near(u.hpMax,270);near(u.attack,28);near(u.getAttack(),34);near(u.attackRange,145);near(u.attSpeed,1.2);near(u.getAttSpeed(),1.62);near(u.getSpeed(),104);
  assert.deepEqual(clone(f.settings.timingDefaults),{'ally:90001:default':{attack:.27}});assert.deepEqual(clone(f.settings.timings),{'ally:90001:default':{attack:.31}});
});

test('without authored tier overrides, every level keeps the exact original unit record and existing values',()=>{
  const f=fixture(),u=f.actor,before=clone(f.settings);u._cc=f.cc;
  const expected=stats(u);
  for(const level of [1,2,3]){u.outBuild.buildInfo.cfg.level=level;u.setNew();u.initBuffData();assert.equal(u.cfg,f.cfg);assert.deepEqual(stats(u),expected);}
  assert.deepEqual(f.settings,before);assert.equal(u._unitBaseCfg,f.cfg);
});
