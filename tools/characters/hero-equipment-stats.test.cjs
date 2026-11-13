'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),Stats=require('../../assets/_script/HeroEquipmentStats'),Weapons=require('../../assets/_script/HeroWeapons'),Loadout=require('../../assets/_script/HeroLoadout'),Tiers=require('../../assets/_script/EquipmentTiers');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,a+' != '+b);
test('all fifty main-weapon levels grant two damage each, retain five tiers and preserve explicit publication idempotence',()=>{
 const main=config.EquipCfg.find(gear=>gear.id===4);assert.equal(main.levelInfo.length,50);assert.deepEqual(Tiers.tiers(main).map(tier=>tier.levels.length),[10,10,10,10,10]);main.levelInfo.forEach((row,index)=>{assert.equal(row.Parameters,(index+1)*2);assert.equal(row.ID,4);});
 assert.equal(main.levelInfo[0].GoldCost,650,'Early damage upgrades retain their affordable damage-track price');assert.equal(main.levelInfo.at(-1).GoldCost,0);assert.equal(config.HeroEquipment.upgradePricingVersion,1);
 const plan=require('./hero-equipment-stats.cjs').plan(root);assert.equal(plan.files.size,0);assert.equal(config.GameTools.timingDefaults===undefined,false);
});
test('secondary levels affect only the equipped style and never supply flat weapon damage or change progress during a read',()=>{
 const caps={fighter:{lifeSteal:.1},skirmisher:{range:200,criticalChance:.1},vanguard:{move:.2,attackRate:.1},bruiser:{attackRate:.1,criticalDamage:.5},guardian:{damageReduction:.2},mystic:{splashDamage:.5}};
 for(const style of Weapons.styles){const data={personLevel:[1,1,1,1,1,1],heroEquipmentVersion:1,heroWeapon:{selected:style.id,levels:{[style.id]:{3:50,4:1}}}},before=JSON.stringify(data),snap=Loadout.snapshot(config,data);near(snap.damage,Math.ceil(2*Stats.multiplier(config,style.id)-1e-9));for(const [key,value]of Object.entries(caps[style.id]))near(snap.secondary[key],value);assert.equal(JSON.stringify(data),before);
  data.heroWeapon.levels[style.id][4]=50;near(Loadout.snapshot(config,data).damage,Math.ceil(100*Stats.multiplier(config,style.id)-1e-9));data.heroWeapon.levels[style.id][3]=1;near(Loadout.snapshot(config,data).damage,Math.ceil(100*Stats.multiplier(config,style.id)-1e-9));
 }
 const old={EquipCfg:config.EquipCfg};assert.equal(Stats.enabled(old),false);assert.deepEqual(Stats.raw(old,'fighter',{1:100,2:10,3:20,4:300,5:1,6:221},50),{health:100,regen:10,damage:20,range:300,attackRate:1,move:221});
});
test('migration retains earned main progression and previous damage for each existing style without granting unstarted styles or repeating',()=>{
 const data={equipmentProgressionVersion:1,personLevel:[10,20,50,1,6,8],goldNum:4321,heroWeapon:{selected:'fighter',levels:{skirmisher:{3:50,4:1,keep:7},fighter:{3:1,4:25}}},future:{keep:true}};
 Stats.migrate(data,config);assert.equal(data.personLevel[3],50);assert.equal(data.heroWeapon.levels.skirmisher[4],50);assert.equal(data.heroWeapon.levels.skirmisher.keep,7);assert.equal(data.heroWeapon.levels.fighter[4],50);assert.equal(Weapons.level(data,4,'mystic'),1);assert.equal(data.heroWeapon.levels.fighter[3],1);assert.equal(data.goldNum,4321);assert.deepEqual(data.future,{keep:true});
 const before=structuredClone(data);Stats.migrate(data,config);assert.deepEqual(data,before);
 const early={personLevel:[1,1,1,20,1,1]};Stats.migrate(early,config);assert.equal(early.personLevel[3],50);
 const inactive={personLevel:[1,1,40,25,1,1]};Stats.migrate(inactive,{});assert.equal(inactive.personLevel[3],25);assert.equal(inactive.heroEquipmentVersion,undefined);
 const equal={equipmentProgressionVersion:1,heroWeapon:{selected:'fighter',levels:{fighter:{3:20,4:1},skirmisher:{3:20,4:1}}}};Stats.migrate(equal,config);assert.equal(equal.heroWeapon.levels.fighter[4],equal.heroWeapon.levels.skirmisher[4]);
});
test('legacy per-level appearances move together while named tier looks and other gear remain assigned',()=>{
 const data={assignments:{'4:2:fighter':'a','4:4:fighter':'b','4:tier:lv2:fighter':'c','3:2:fighter':'d'},profiles:{a:{base:{id:'4:2:fighter'}},b:{base:{id:'4:4:fighter'}},c:{},d:{}}};require('./hero-equipment-stats.cjs').migrateLooks(data);assert.equal(data.assignments['4:4:fighter'],'a');assert.equal(data.assignments['4:8:fighter'],'b');assert.equal(data.profiles.b.base.id,'4:8:fighter');assert.equal(data.assignments['4:tier:lv2:fighter'],'c');assert.equal(data.assignments['3:2:fighter'],'d');
});
test('the Archer remains the damage baseline while melee styles compensate for reach and Mystic earns its group-damage role',()=>{
 const get=style=>Loadout.calculate(config,{personLevel:[50,50,50,50,25,25],heroWeapon:{selected:style,levels:{[style]:{3:50,4:50}}}},{splashTargets:2}),bow=get('skirmisher'),fighter=get('fighter'),spear=get('vanguard'),axe=get('bruiser'),shield=get('guardian'),staff=get('mystic');
 assert.deepEqual([bow.damage,fighter.damage,spear.damage,axe.damage,shield.damage,staff.damage],[100,130,120,150,115,85]);
 for(const melee of [fighter,spear,axe,shield])assert(melee.primaryDps>bow.primaryDps);assert(staff.primaryDps<bow.primaryDps);assert(staff.primaryDps+staff.equipmentSplashDps>axe.primaryDps);assert.equal(spear.range>fighter.range,true);assert(shield.preventedDps>0);assert(fighter.lifeStealHps>0);
 for(let level=1;level<=50;level++)for(const style of ['fighter','vanguard','bruiser','guardian'])assert(Stats.fields(config,4,level,style)[0].value>level*2,style+' beats the Bow hit damage at level '+level);
});
function battle(style){
 const {setup,hero,Node,Vec2}=require('../testing/backend-gameplay-harness.cjs'),data={heroEquipmentVersion:1,personLevel:[1,1,1,1,1,1],heroWeapon:{selected:style,levels:{[style]:{3:50,4:50}}}},user={data,getHeroWeapon:()=>Weapons.selected(data),getPersonLevel:slot=>Weapons.level(data,slot)};
 const h=setup({KinghtFallMissionData:{KinghtFallTaskCountName:{Kill:'Kill'}},KinghtFallEnum:require('../../assets/_script/KinghtFallEnum'),KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user,getMissionData:()=>({getTaskInfo:()=>({type:'none'}),addTaskNum(){}})})}}}),p=hero(h),manager=h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();manager.data=config;manager.getEquipCfgList=()=>config.EquipCfg;manager.getParamsCfgById=()=>3;
 Object.assign(p.ctrPlayAni,{initView(){},setAttackEvent(){},setAttackEnd(){}});p.ctrHp.setType=()=>{};p.initData();p.critDam=1.5;p.node._combatGeneration=1;p.node.setPosition(0,0);h.d.heroStyle=style;h.ui.ctrEffect={showDamageNum(){},onMonsterAttack(){}};
 const Combat=h.load('RelicCombat');
 function enemy(x,hp=1000){const target=h.e.actor('KinghtFallEnemyBase',x,0);target.cfg={ID:90001,AttackType:1};target.hp=target.hpMax=hp;target.node._combatGeneration=1;target.node._combatActor=target;target.isDead=()=>target.state===4;target.delAllBuff=()=>{};target.playDeath=()=>{};h.d.enemyList.push(target);return target;}
 function hit(target,amount=100){const context=Combat.primaryContext(p,target,amount,false);return target.onAttacked(amount,p,false,context);}
 return {...h,p,data,user,Combat,enemy,hit,Node,Vec2};
}
test('actual combat initialization and repeated style changes agree with the shared equipment calculation, including speed and crit',()=>{
 const h=battle('fighter');for(const style of Weapons.styles){h.data.heroWeapon.selected=style.id;h.data.heroWeapon.levels[style.id]={3:50,4:50};for(let i=0;i<2;i++){h.p.initData();h.p.initBuffData();h.p.critDam=1.5;const snap=Loadout.snapshot(config,h.user);near(h.p.attack,snap.damage);near(h.p.attackRange,snap.range);near(h.p.attackSpeed,snap.attackRate);near(h.p.moveSpeed,snap.move);near(h.p.crit,snap.criticalChance);near(h.p.getCriticalDamage(),snap.criticalMultiplier);}}
});
test('fighter life steal heals actual primary damage once, excludes overkill and secondary hits, caps at maximum HP and cannot revive',()=>{
 const h=battle('fighter');h.p.hp=50;const target=h.enemy(20,10);h.hit(target);near(h.p.hp,51);
 const other=h.enemy(30);other.onAttacked(100,h.p,true);near(h.p.hp,51);h.p.hp=99;h.hit(other);near(h.p.hp,100);h.p.hp=0;h.hit(other);near(h.p.hp,0);
});
test('mystic splash reaches all living neighbors in its radius once, excludes the main target, and cannot recurse',()=>{
 const h=battle('mystic'),primary=h.enemy(20),nearby=h.enemy(40),edge=h.enemy(120),outside=h.enemy(121),pooled=h.enemy(25);pooled._isPooled=true;
 h.hit(primary);near(primary.hp,900);near(nearby.hp,950);near(edge.hp,950);near(outside.hp,1000);near(pooled.hp,1000);near(h.p.hp,100);
});
test('guardian reduction composes with existing defenses under their cap; CP includes gear healing and area damage',()=>{
 const h=battle('guardian');near(h.Combat.heroIncoming(h.p,100,null),80);h.d.treasureAdd[120026]=[.75];near(h.Combat.heroIncoming(h.p,100,null),20);
 const state=style=>({personLevel:[1,1,1,1,1,1],heroWeapon:{selected:style,levels:{[style]:{3:50,4:50}}}});
 const fighter=Loadout.calculate(config,state('fighter'),{heroTriggeredHealingUtilization:1}),mystic=Loadout.calculate(config,state('mystic'),{splashTargets:2});assert(fighter.lifeStealHps>0);assert(mystic.equipmentSplashDps>0);near(mystic.equipmentSplashDps,mystic.primaryDps);near(Loadout.calculate(config,state('guardian')).averageReduction,.2);
});
