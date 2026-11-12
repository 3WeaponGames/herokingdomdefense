'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),Loadout=require('../../assets/_script/HeroLoadout'),Weapons=require('../../assets/_script/HeroWeapons'),Core=require('../../assets/_script/CombatPower');
const source=path.resolve(__dirname,'../../assets/_script/HeroWeaponCombat.js');
test('hero CP shares the exact unit formula and independent weapon levels, with no stale read cache or progression writes',()=>{
 const data={personLevel:[1,1,10,10,1,1],heroWeapon:{selected:'fighter',levels:{skirmisher:{3:10,4:10},fighter:{3:1,4:1}}},future:{keep:7}},before=JSON.stringify(data),cfg=JSON.stringify(config);
 const sword=Loadout.calculate(config,data);assert.equal(sword.damage,20);assert.equal(sword.health,100);assert.equal(sword.attackRate,1);assert.equal(sword.healingHps,0);assert.equal(sword.cp,Core.calculate({health:100,directDps:20}).cp);assert.equal(sword.reason,null);assert.equal(JSON.stringify(data),before);assert.equal(JSON.stringify(config),cfg);
 data.heroWeapon.levels.skirmisher={3:50,4:25};assert.deepEqual(Loadout.calculate(config,data),sword);Weapons.select(data,'skirmisher');const bow=Loadout.calculate(config,data);assert.equal(bow.levels[3],50);assert.equal(bow.levels[4],25);assert(bow.cp>sword.cp);Weapons.select(data,'fighter');assert.equal(Loadout.calculate(config,data).cp,sword.cp);
});
test('the CP loadout and actual runtime style setup apply only owned active-style bonuses, once',()=>{
 const data={personLevel:[4,2,10,10,3,2],heroWeapon:{selected:'fighter',levels:{fighter:{3:1,4:1}}},talentInfo:config.TalentLevelCfg.filter(row=>row.HeroStyle==='skirmisher').map(row=>({id:row.ID,isLock:true}))},user={data,getHeroWeapon:()=>Weapons.selected(data)};
 const exports={};vm.runInNewContext(fs.readFileSync(source,'utf8'),{exports,require:name=>{assert.equal(name,'HeroLoadout');return Loadout;}});const read=()=>{const snap=Loadout.snapshot(config,user),hero={baseHp:snap.raw.health,attack:snap.raw.damage,attackSpeed:snap.raw.attackRate,attackRange:snap.raw.range};exports.configure(hero,user,config);assert.equal(hero.baseHp,snap.baseHealth);assert.equal(hero.attack,snap.damage);assert.equal(hero.attackSpeed,snap.attackRate);assert.equal(hero.attackRange,snap.range);return snap;};
 const base=read();data.talentInfo.push(...config.TalentLevelCfg.filter(row=>row.HeroStyle==='fighter').map(row=>({id:row.ID,isLock:true})));const boosted=read();assert(boosted.damage>base.damage);assert(boosted.health>base.health);assert(boosted.attackRate>base.attackRate);assert.deepEqual(read(),boosted);
});
test('owned permanent HP and critical relics use runtime parameters without inventing random proc damage or continuous regeneration',()=>{
 const data={personLevel:[1,1,1,1,1,1],treasureInfo:[{id:120031,level:1},{id:120035,level:1},{id:120036,level:1},{id:120044,level:1},{id:120028,level:3}]},before=JSON.stringify(data),value=Loadout.calculate(config,data);
 assert.equal(value.health,103);assert.equal(value.criticalChance,.01);assert.equal(value.criticalMultiplier,1.5*1.05);assert.equal(value.expectedDamage,20*(1+.01*(1.5*1.05-1)));assert.equal(value.range,309);assert.equal(value.healingHps,0);assert.equal(value.splashDps,0);assert.equal(JSON.stringify(data),before);
 const utilized=Loadout.calculate(config,data,{heroHealingUtilization:.25});assert.equal(utilized.healingHps,2.5);assert.equal(utilized.cp,Math.sqrt(103*(value.directDps+2.5)));
});
test('snapshot bounds reads safely, rejects malformed outputs and remains independent of attack animation playback',()=>{
 const data={personLevel:[99999,1,99999,99999,1,1],heroWeapon:{selected:'fighter',levels:{fighter:{3:99999,4:0}}}},before=JSON.stringify(data),value=Loadout.calculate(config,data);assert.equal(value.levels[1],config.EquipCfg.find(row=>row.id===1).levelInfo.length);assert.equal(value.levels[3],50);assert.equal(value.levels[4],1);assert.equal(JSON.stringify(data),before);assert.equal(value.reason,null);
 const bad=structuredClone(config);bad.EquipCfg.find(row=>row.id===1).levelInfo[0].Parameters=Infinity;const invalid=Loadout.calculate(bad,{personLevel:[1,1,1,1,1,1]});assert.equal(invalid.cp,null);assert.match(invalid.reason,/invalid/);assert.equal(Loadout.calculate(config,data,{heroHealingUtilization:2}).cp,null);
 const missingCritical=structuredClone(config);delete missingCritical.ParameterCfg[60015];const ownedCrit={personLevel:[1,1,1,1,1,1],treasureInfo:[{id:120031,level:1}]};assert.equal(Loadout.calculate(missingCritical,ownedCrit).cp,null);assert.equal(Loadout.calculate(missingCritical,{personLevel:[1,1,1,1,1,1]}).cp,Math.sqrt(100*20));
});

test('actual hero combat initialization follows the equipped weapon through bow-to-sword switches and repeated initialization',()=>{
 const {setup,hero}=require('./backend-gameplay-harness.cjs'),data={personLevel:[1,1,10,10,1,1],heroWeapon:{selected:'skirmisher',levels:{skirmisher:{3:10,4:10},fighter:{3:1,4:1}}},talentInfo:config.TalentLevelCfg.filter(row=>row.HeroStyle==='skirmisher').map(row=>({id:row.ID,isLock:true}))};
 const user={data,getHeroWeapon:()=>Weapons.selected(data),getPersonLevel:slot=>Weapons.level(data,slot)},h=setup({KinghtFallEnum:require('../../assets/_script/KinghtFallEnum'),KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}}}),p=hero(h),manager=h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();manager.data=config;manager.getEquipCfgList=()=>config.EquipCfg;manager.getParamsCfgById=()=>3;
 Object.assign(p.ctrPlayAni,{initView(){},setAttackEvent(){},setAttackEnd(){}});p.ctrHp.setType=()=>{};
 const check=()=>{const before=JSON.stringify(data),snap=Loadout.snapshot(config,user);p.initData();assert.equal(p.hpMax,snap.health);assert.equal(p.attack,snap.damage);assert.equal(p.attackSpeed,snap.attackRate);assert.equal(p.attackRange,snap.range);assert.equal(JSON.stringify(data),before);return snap;};
 const bow=check();Weapons.select(data,'fighter');const sword=check();assert.equal(sword.damage,20);assert(sword.damage<bow.damage);for(let i=0;i<3;i++)assert.deepEqual(check(),sword);Weapons.select(data,'skirmisher');assert.deepEqual(check(),bow);
});
