'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const Catalog=require('../worlds/unit-catalog');
const StageProfiles=require('../worlds/stage-profile-editor');
const Threat=require('../worlds/wave-threat');

const fighter={id:1,unitType:'fighter',enemyClass:'normal',health:48,damage:5,attackRate:1,speed:100,
 attack:{delivery:'melee',pattern:'single'}};
const meleeRecord={prefab:'ItemEnemy01',AttackType:1,BuildingCross:1,Health:48,AttackDamage:5,AttackInterval:1,Speed:100};
const ranged=attack=>({...fighter,attack:{delivery:'ranged',...attack}});

test('catalog traits follow authored overrides and the original controllers',()=>{
 const config={GameTools:{unitTypeAssignments:{'enemy:19:default':'mystic'},enemyClasses:{'enemy:19:default':'elite'}},SoldierCfg:{
  19:{...meleeRecord,BuildingCross:0,UnitAttack:{delivery:'ranged',pattern:'splash',splashRadius:140}},
  90007:{...meleeRecord,ID:90007,prefab:'ItemEnemy07',Data:[20,200,5]},
  90008:{...meleeRecord,ID:90008,prefab:'ItemEnemy08',AttackType:2,BuildingCross:false},
  90010:{...meleeRecord,ID:90010,prefab:'ItemEnemy10'},
  20:{prefab:'ItemEnemy06',ID:20,AttackType:3,BehaviorTemplate:90006,Health:120},
  21:{prefab:'ItemEnemy09',ID:21,AttackType:3,BehaviorTemplate:90009,Health:120,EnemySkills:{heal:false}}
 }};
 const original=structuredClone(config);
 const rows=Threat.profiles(Catalog.rows(config,{entries:{}}));
 const authored=rows.get(19);
 assert.equal(authored.role,'mystic');
 assert.equal(authored.enemyClass,'elite');
 assert.equal(authored.flight,true);
 assert.equal(authored.delivery,'ranged');
 assert.equal(authored.pattern,'splash');
 assert.equal(authored.area,true);
 assert.equal(rows.get(90007).area,true);
 assert.equal(rows.get(90007).delivery,'melee');
 assert.equal(rows.get(90008).flight,true);
 assert.equal(rows.get(90008).pattern,'single');
 assert.equal(rows.get(90008).area,false);
 assert.equal(rows.get(90010).enemyClass,'boss');
 assert.equal(rows.get(90010).phase,6);
 assert.deepEqual(rows.get(20).skills,['haste']);
 assert.equal(rows.get(20).damage,0);
 assert.equal(rows.get(20).support,true);
 assert.equal(rows.get(21).support,false);
 assert.deepEqual(config,original);
});

test('attack coverage distinguishes single target, splash, volley, piercing and chain',()=>{
 const single=Threat.profile(ranged({pattern:'single'}));
 const variants=[
  [{pattern:'splash',splashRadius:90,splashFalloff:.2},{pattern:'splash',splashRadius:160,splashFalloff:.8}],
  [{pattern:'volley',shotsPerVolley:2},{pattern:'volley',shotsPerVolley:3}],
  [{pattern:'piercing',pierceTargets:2},{pattern:'piercing',pierceTargets:4}],
  [{pattern:'chain',chainHits:2,chainRange:80,chainDamageLoss:.5},{pattern:'chain',chainHits:3,chainRange:160,chainDamageLoss:.1}]
 ];
 for(const [small,large] of variants){
  const first=Threat.profile(ranged(small)),second=Threat.profile(ranged(large));
  assert.equal(first.area,true,small.pattern);
  assert.ok(first.weight>single.weight,small.pattern);
  assert.ok(second.weight>first.weight,large.pattern);
 }
 assert.equal(Threat.profile(ranged({pattern:'volley',shotsPerVolley:1})).weight,single.weight);
 assert.equal(Threat.profile(ranged({pattern:'piercing',pierceTargets:1})).area,false);
 assert.equal(Threat.profile(ranged({pattern:'chain',chainHits:4,chainRange:160,chainDamageLoss:1})).area,false);
 assert.equal(Threat.profile(ranged({pattern:'splash',splashRadius:0,splashFalloff:1})).area,false);
});

test('stage custom stats and wave scaling contribute to health, burst and sustained pressure',()=>{
 const unit={...fighter,id:90001,flight:true,attack:{delivery:'ranged',pattern:'single'}};
 const base=[unit];
 const local=StageProfiles.rows({EnemyProfiles:{1000000000:{baseId:90001,name:'Stage Giant',stats:{Health:130,AttackDamage:15,AttackInterval:3,AttackRange:350}}}},base);
 const stats=Threat.profiles(local,{HealthCoefficient:1.2,AttackCoefficient:1.2});
 const custom=stats.get(1000000000);
 assert.ok(custom.weight>stats.get(90001).weight);
 assert.equal(custom.health,156);
 assert.equal(custom.damage,18);
 assert.equal(custom.attackRate,3);
 assert.equal(custom.sustainedDamage,54);
 assert.equal(custom.range,350);
 assert.equal(custom.heavy,true);
 assert.equal(custom.durable,true);
 assert.equal(custom.flight,true);
 assert.equal(base[0].health,48);
});

test('hero damage modifiers leave enemy durability estimates based on enemy stats',()=>{
 const config={GameTools:{
  unitTypes:{guardian:{damageTaken:{mode:'less',percent:150}},skirmisher:{damageTaken:{mode:'more',percent:100}}},
  unitTypeAssignments:{'enemy:19:default':'guardian','enemy:20:default':'skirmisher'}
 },SoldierCfg:{19:{...meleeRecord,Health:100},20:{...meleeRecord,Health:100}}};
 const profiles=Threat.profiles(Catalog.rows(config,{entries:{}}));
 assert.equal(profiles.get(19).health,100);
 assert.equal(profiles.get(19).effectiveHealth,100);
 assert.equal(profiles.get(19).durable,false);
 assert.equal(profiles.get(20).effectiveHealth,100);
 assert.equal(profiles.get(20).durable,false);
 assert.equal(profiles.get(19).weight,profiles.get(20).weight);
});

test('regen and damage over time use scaled stats and current attack rate',()=>{
 const onHit={poison:{percent:.1,duration:3},burn:{percent:.2,duration:.5},bleed:{percent:.15,duration:2}};
 const config={SoldierCfg:{19:{...meleeRecord,HealthRegenPercent:.03,UnitAttack:{delivery:'melee',pattern:'single',onHit}}}};
 const [unit]=Catalog.rows(config,{entries:{}});
 const wave={HealthCoefficient:1.5,AttackCoefficient:1.2};
 const profile=Threat.profile(unit,wave,4);
 assert.equal(profile.health,72);
 assert.equal(profile.damage,6);
 assert.equal(profile.healthRegenPercent,.03);
 assert.ok(Math.abs(profile.effectiveHealth-80.64)<1e-9);
 assert.ok(Math.abs(profile.damageOverTime-2.1)<1e-9);
 assert.ok(Math.abs(profile.sustainedDamage-8.1)<1e-9);
 assert.ok(profile.weight>Threat.profile({...unit,healthRegenPercent:0,attack:{...unit.attack,onHit:{}}},wave,4).weight);
});

test('all six fighting roles and common special units have distinct opening priorities',()=>{
 const roles=['Vanguard','Guardian','Fighter','Skirmisher','Bruiser','Mystic'];
 const phases=roles.map(role=>Threat.profile({...fighter,unitType:role}).phase);
 assert.deepEqual(phases,[0,.5,1,2,2.5,3]);
 const ground=Threat.profile(fighter);
 const skirmisher=Threat.profile(ranged({pattern:'single'}));
 const heavy=Threat.profile({...fighter,damage:19});
 const aerial=Threat.profile({...fighter,flight:true});
 const elite=Threat.profile({...fighter,enemyClass:'elite'});
 const boss=Threat.profile({...fighter,enemyClass:'boss'});
 assert.equal(ground.weight,1);
 assert.equal(ground.frontline,true);
 assert.equal(skirmisher.backline,true);
 assert.equal(skirmisher.phase,2);
 assert.equal(heavy.heavy,true);
 assert.equal(heavy.phase,3);
 assert.equal(aerial.frontline,false);
 assert.ok(aerial.phase>heavy.phase);
 assert.ok(aerial.weight>ground.weight);
 assert.ok(elite.phase>aerial.phase);
 assert.ok(boss.phase>elite.phase);
 assert.ok(boss.weight>elite.weight);
});

test('wave scaling increases pressure without changing an ordinary fighter’s tactical role',()=>{
 const original=Threat.profile(fighter),boosted=Threat.profile(fighter,{HealthCoefficient:6,AttackCoefficient:6});
 assert.equal(boosted.health,288);
 assert.equal(boosted.damage,30);
 assert.ok(boosted.weight>original.weight);
 assert.equal(boosted.heavy,false);
 assert.equal(boosted.durable,false);
 assert.equal(boosted.phase,original.phase);
});

test('neutral values, legacy attack fallbacks, authored zero and extreme stats resolve safely',()=>{
 const unknown=Threat.profile(null);
 assert.equal(unknown.weight,1);
 assert.equal(unknown.health,null);
 assert.equal(unknown.phase,1);
 const attackFallback=Threat.recordTraits({ID:20,AttackType:3,UnitAttack:{delivery:'ranged',pattern:'single',attackDamage:15}},20);
 const fallback=Threat.profile({...attackFallback,attackRate:2});
 assert.equal(fallback.damage,15);
 assert.equal(fallback.sustainedDamage,30);
 assert.equal(fallback.range,250);
 assert.equal(Threat.profile({...attackFallback,attackRate:2,damage:0}).damage,0);
 const extreme=Threat.profile({...fighter,health:Number.MAX_VALUE,damage:Number.MAX_VALUE,attackRate:Number.MAX_VALUE});
 assert.equal(extreme.sustainedDamage,null);
 assert.ok(extreme.weight>=1&&extreme.weight<=8&&Number.isFinite(extreme.weight));
});
