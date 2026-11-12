'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const Config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),Effects=require('../../assets/_script/HeroUpgradeEffects'),Loadout=require('../../assets/_script/HeroLoadout'),Core=require('../../assets/_script/CombatPower');
const clone=value=>structuredClone(value),close=(a,b)=>assert(Math.abs(a-b)<=Math.max(1,Math.abs(b))*1e-10,`${a} != ${b}`);
function user(ids=[],style='fighter',level=1){return{personLevel:[1,1,1,1,1,1],heroWeapon:{selected:style,levels:{[style]:{3:1,4:1}}},treasureInfo:ids.map(id=>({id,level}))};}
function set(config,id,value){config.TreasureCfg.find(row=>row.ID===id).levelInfo[0].param[0]=value;}

test('the upgrade ledger includes every authored upgrade and keeps soldier/building/perk unlock effects outside hero CP',()=>{
 const rows=Effects.inventory(Config);assert.equal(rows.length,Config.TalentLevelCfg.length+Config.TreasureCfg.length);
 const data=user([120014,120015,120024,120025,120026,120027,120032,120045,120049],'vanguard');data.talentInfo=Config.TalentLevelCfg.filter(row=>!row.HeroStyle).map(row=>({id:row.ID,isLock:true}));
 const value=Loadout.calculate(Config,data),base=Loadout.calculate(Config,user([],'vanguard'));assert.equal(value.cp,base.cp);assert.equal(value.criticalChance,0);
 for(const record of value.upgrades.records.filter(row=>row.owned)){assert.equal(record.eligible,false);assert(record.reason);}
 assert(value.upgrades.records.some(row=>row.scope==='run-perk-unlock'&&row.owned&&/does not activate/.test(row.reason)));
});

test('only owned active-style bonuses and explicit matching type requirements are counted',()=>{
 const data=user([120036,120031],'fighter');data.talentInfo=Config.TalentLevelCfg.filter(row=>row.HeroStyle==='vanguard').map(row=>({id:row.ID,isLock:true}));
 const config=clone(Config);config.TreasureCfg.find(row=>row.ID===120036).RequiredHeroStyle='vanguard';config.TreasureCfg.find(row=>row.ID===120031).RequiredType='ranged';
 const fighter=Loadout.calculate(config,data);assert.equal(fighter.health,100);assert.equal(fighter.damage,20);assert.equal(fighter.criticalChance,0);assert.equal(fighter.cp,Math.sqrt(2000));
 data.heroWeapon.selected='vanguard';const vanguard=Loadout.calculate(config,data);close(vanguard.health,100*1.05*1.03);close(vanguard.damage,21);close(vanguard.attackRate,1.05);assert.equal(vanguard.criticalChance,0);
 data.heroWeapon.selected='mystic';const mystic=Loadout.calculate(config,data);assert.equal(mystic.health,100);assert.equal(mystic.criticalChance,.01);
 config.TreasureCfg.find(row=>row.ID===120031).RequiredUnitType='archer';assert.equal(Loadout.calculate(config,data).criticalChance,0,'a soldier archer requirement does not mean the hero Skirmisher/Mystic');
});

test('close, slowed and boss damage match runtime additive target modifiers and multiplicative attack bonus',()=>{
 const value=Loadout.calculate(Config,user([120018,120029,120034]));
 const multiplier=(1+.1*.5)*(1+.05*.25+.03*.25);close(value.conditionalDamageMultiplier,multiplier);close(value.directDps,20*multiplier);close(value.cp,Math.sqrt(100*20*multiplier));
 const none=Loadout.calculate(Config,user([120018,120029,120034]),{heroCloseTargetFraction:0,heroSlowedTargetFraction:0,heroBossTargetFraction:0});assert.equal(none.directDps,20);
});

test('Thunder uses noncritical getAttack damage once per eighth release and never reuses primary target bonuses',()=>{
 const data=user([120018,120029,120030,120031,120034,120035],'fighter',3),value=Loadout.calculate(Config,data);
 const expected=20*(1+.3*.5)*.4/8*2;close(value.chainDps,expected);assert.equal(value.splashDps,value.chainDps);assert(value.expectedDamage>20);
 const withoutPrimary=user([120018,120030],'fighter',3);close(Loadout.calculate(Config,withoutPrimary).chainDps,value.chainDps);
 assert.equal(Loadout.calculate(Config,data,{splashTargets:0}).chainDps,0);close(Loadout.calculate(Config,data,{splashTargets:100}).chainDps,expected);
});

test('defenses clamp each moving/ranged state and reflection uses actual post-defense and post-shield ranged damage',()=>{
 const config=clone(Config);set(config,120033,.7);set(config,120041,.7);set(config,120040,.2);set(config,120011,.5);
 const data=user([120033,120041,120040,120011]),value=Loadout.calculate(config,data,{heroMovingFraction:.5,heroRangedDamageFraction:.5,heroIncomingDps:100});
 close(value.averageReduction,.55);close(value.shieldFraction,.6);close(value.preventedDps,55+45*.6);close(value.reflectionDps,100*.5*(.5*.3+.5*.2)*.4*.2);
 const melee=Loadout.calculate(config,data,{heroRangedDamageFraction:0});assert.equal(melee.reflectionDps,0);
 const empty=Loadout.calculate(config,data,{heroIncomingDps:0});assert.equal(empty.preventedDps,0);assert.equal(empty.reflectionDps,0);
 const expected=Core.calculate({health:value.health,directDps:value.directDps,healingHps:value.healingHps,splashDps:value.splashDps,reflectionDps:value.reflectionDps,preventedDps:value.preventedDps});assert.equal(value.cp,expected.cp);
});

test('kill healing respects the ten-percent HP cap per wave and wave healing has its own interval and utilization',()=>{
 const data=user([120042,120043],'fighter',3),value=Loadout.calculate(Config,data,{heroKillsPerSecond:20,heroHealingUtilization:.25,heroTriggeredHealingUtilization:.5});
 close(value.killHealingHps,100*.1/30*.5);close(value.waveHealingHps,100*.03/30*.5);close(value.regenerationHps,2.5);close(value.healingHps,2.5+value.killHealingHps+value.waveHealingHps);
 assert.equal(Loadout.calculate(Config,data,{heroTriggeredHealingUtilization:0}).healingHps,0);
});

test('Finger of Frost enables Frost Crystal on every target, while requirement mismatches cannot activate the synergy',()=>{
 const ordinary=Loadout.calculate(Config,user([120029]));close(ordinary.directDps,20*(1+.05*.25));
 assert.equal(Loadout.calculate(Config,user([120002])).cp,Math.sqrt(2000));
 const combined=Loadout.calculate(Config,user([120002,120029]));assert.equal(combined.effectiveSlowedTargetFraction,1);close(combined.directDps,21);
 const config=clone(Config);config.TreasureCfg.find(row=>row.ID===120002).RequiredHeroStyle='vanguard';const fighter=Loadout.calculate(config,user([120002,120029]));close(fighter.directDps,ordinary.directDps);assert.equal(fighter.effectiveSlowedTargetFraction,.25);
 const vanguard=Loadout.calculate(config,user([120002,120029],'vanguard'));assert.equal(vanguard.effectiveSlowedTargetFraction,1);close(vanguard.directDps,21);
});

test('utility upgrades remain visible without adding unrelated power and ownership reads are pure and repeatable',()=>{
 const data=user([120001,120002,120039,120044]),before=JSON.stringify(data),config=JSON.stringify(Config),value=Loadout.calculate(Config,data);
 assert.equal(value.cp,Math.sqrt(2000));close(value.move,221*1.03);close(value.range,300*.35*1.03);assert.equal(value.upgrades.effects.reviveSeconds[0],1);
 assert.deepEqual(Loadout.calculate(Config,data),value);assert.equal(JSON.stringify(data),before);assert.equal(JSON.stringify(Config),config);
});

test('invalid scenario inputs produce unavailable CP without NaN displays or input repair',()=>{
 const data=user([120011,120030,120033,120040,120041,120042,120043]),before=JSON.stringify(data);
 for(const input of [null,{heroWaveSeconds:0},{heroIncomingDps:-1},{heroMovingFraction:1.1},{heroIncomingHitsPerSecond:Infinity},{heroKillsPerSecond:NaN},{heroTriggeredHealingUtilization:-1},{splashTargets:.5}]){const value=Loadout.calculate(Config,data,input);assert.equal(value.cp,null);assert(value.reason);}
 assert.equal(JSON.stringify(data),before);
});
