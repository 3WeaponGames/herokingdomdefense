'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const Config={...require('../../assets/KinghtFallConfig/GameJsonCfg.json'),GameTools:{}},Effects=require('../../assets/_script/HeroUpgradeEffects'),Loadout=require('../../assets/_script/HeroLoadout'),Core=require('../../assets/_script/CombatPower');
const clone=value=>structuredClone(value),close=(a,b)=>assert(Math.abs(a-b)<=Math.max(1,Math.abs(b))*1e-10,`${a} != ${b}`);
function user(ids=[],style='fighter',level=1){return{personLevel:[1,1,1,1,1,1],heroWeapon:{selected:style,levels:{[style]:{3:1,4:1}}},treasureInfo:ids.map(id=>({id,level}))};}
function set(config,id,value){config.TreasureCfg.find(row=>row.ID===id).levelInfo[0].param[0]=value;}

test('the account ledger includes authored upgrades while unsupported army, building and perk unlock effects stay outside CP',()=>{
 const rows=Effects.inventory(Config);assert.equal(rows.length,Config.TalentLevelCfg.length+Config.TreasureCfg.length);
 const data=user([120007,120010,120019,120032,120045,120049],'vanguard');data.talentInfo=Config.TalentLevelCfg.filter(row=>Number(row.kindID)>=100006&&Number(row.kindID)<=100027).map(row=>({id:row.ID,isLock:true}));
 const value=Loadout.calculate(Config,data),base=Loadout.calculate(Config,user([],'vanguard'));assert.equal(value.cp,base.cp);assert.equal(value.criticalChance,0);
 for(const record of value.upgrades.records.filter(row=>row.owned)){assert.equal(record.cpEligible,false);assert(record.reason);}
 assert(value.upgrades.records.some(row=>row.scope==='run-perk-unlock'&&row.owned&&/does not activate/.test(row.reason)));
});

test('type restrictions credit twenty percent for every equipped style while gameplay stays fully conditional',()=>{
 const data=user([120036,120031],'fighter');data.talentInfo=Config.TalentLevelCfg.filter(row=>row.HeroStyle==='vanguard').map(row=>({id:row.ID,isLock:true}));
 const config=clone(Config);config.TreasureCfg.find(row=>row.ID===120036).RequiredHeroStyle='vanguard';config.TreasureCfg.find(row=>row.ID===120031).RequiredType='ranged';
 const fighter=Loadout.calculate(config,data);close(fighter.health,101);close(fighter.barrierPreventedDps,101*.03*.2/30);close(fighter.damage,20.2);close(fighter.attackRate,1.01);close(fighter.criticalChance,.002);assert.equal(fighter.mode,'account-wide');assert.equal(Loadout.snapshot(config,data).health,100);
 data.heroWeapon.selected='vanguard';const vanguard=Loadout.calculate(config,data);assert.equal(vanguard.cp,fighter.cp);const actual=Loadout.snapshot(config,data);close(actual.health,105);close(actual.damage,21);close(actual.attackRate,1.05);assert.equal(actual.criticalChance,0);
 data.heroWeapon.selected='mystic';const mystic=Loadout.calculate(config,data);assert.equal(mystic.cp,fighter.cp);assert.equal(Loadout.snapshot(config,data).criticalChance,.01);
 config.TreasureCfg.find(row=>row.ID===120031).RequiredUnitType='archer';close(Loadout.calculate(config,data).criticalChance,.002);assert.equal(Loadout.snapshot(config,data).criticalChance,0,'gameplay still requires its actual type');
});

test('all owned style branches receive the same twenty-percent credit, including the currently equipped branch',()=>{
 const data=user(),beforeConfig=JSON.stringify(Config);data.talentInfo=Config.TalentLevelCfg.filter(row=>row.HeroStyle).map(row=>({id:row.ID,isLock:true}));
 for(const style of ['fighter','vanguard','skirmisher','mystic','bruiser','guardian']){
  data.heroWeapon.selected=style;const before=JSON.stringify(data),value=Loadout.calculate(Config,data),actual=Loadout.snapshot(Config,data);
  close(value.health,106);close(value.damage,21.2);close(value.attackRate,1.06);close(actual.health,105);close(actual.damage,21);close(actual.attackRate,1.05);
  assert(value.upgrades.records.filter(row=>row.owned).every(row=>row.typeRestricted&&row.weight===.2));assert.equal(JSON.stringify(data),before);
 }
 assert.equal(JSON.stringify(Config),beforeConfig);
});

test('account stat proxies retain army talents and ranged soldier haste without borrowing repurposed relic stats',()=>{
 const data=user([120015]),kinds=[100001,100002,100003,100004,100005];
 data.talentInfo=kinds.map(kind=>({id:Config.TalentLevelCfg.find(row=>row.kindID===kind).ID,isLock:true}));
 const before=JSON.stringify(data),value=Loadout.calculate(Config,data),actual=Loadout.snapshot(Config,data);
 close(value.health,105);close(value.damage,21);close(value.attackRate,1.07);close(value.range,105*1.012);close(value.averageReduction,.012);close(value.preventedDps,.12);
 assert.equal(actual.health,100);assert.equal(actual.damage,20);assert.equal(actual.attackRate,1);assert.equal(actual.range,105);
 for(const row of value.upgrades.records.filter(row=>row.owned)){assert.equal(row.scope,'army');assert.equal(row.gameplayEligible,false);assert.equal(row.cpEligible,true);assert.equal(row.weight,row.implicitTypeRestriction?.2:1);}
 assert.equal(JSON.stringify(data),before);
});

test('an explicit restriction on a supported army stat applies once and never compounds an implicit restriction',()=>{
 const config=clone(Config),talent=config.TalentLevelCfg.find(row=>row.kindID===100001);talent.RequiredType='vanguard';
 config.TreasureCfg.find(row=>row.ID===120015).RequiredHeroStyle='fighter';const data=user([120015]);data.talentInfo=[{id:talent.ID,isLock:true}];
 const value=Loadout.calculate(config,data);close(value.creditedStats.damage,.05*.2);close(value.creditedStats.attackRate,.1*.2);close(value.creditedStats.health,0);
 const relic=value.upgrades.records.find(row=>row.id===120015);assert.equal(relic.weight,.2);assert.equal(relic.implicitTypeRestriction,true);assert.equal(relic.typeRestricted,true);
});

test('close, slowed and boss damage match runtime additive target modifiers and multiplicative attack bonus',()=>{
 const value=Loadout.calculate(Config,user([120018,120029,120034]));
 const multiplier=(1+.1*.2*.5)*(1+.05*.2*.25+.03*.2*.25);close(value.conditionalDamageMultiplier,multiplier);close(value.directDps,20*multiplier);close(value.cp,Math.sqrt(100*20*multiplier));
 const none=Loadout.calculate(Config,user([120018,120029,120034]),{heroCloseTargetFraction:0,heroSlowedTargetFraction:0,heroBossTargetFraction:0});assert.equal(none.directDps,20);
});

test('Thunder uses noncritical getAttack damage once per eighth release and never reuses primary target bonuses',()=>{
 const data=user([120018,120029,120030,120031,120034,120035],'fighter',3),value=Loadout.calculate(Config,data);
 const expected=20*(1+.3*.2*.5)*.4*.2/8*2;close(value.chainDps,expected);assert(value.splashDps>value.chainDps,'cleave remains its own separate secondary effect');assert(value.expectedDamage>20);
 const withoutPrimary=user([120018,120030],'fighter',3);close(Loadout.calculate(Config,withoutPrimary).chainDps,value.chainDps);
 assert.equal(Loadout.calculate(Config,data,{splashTargets:0}).chainDps,0);close(Loadout.calculate(Config,data,{splashTargets:100}).chainDps,expected);
});

test('defenses clamp each moving/ranged state and reflection uses actual post-defense and post-shield ranged damage',()=>{
 const config=clone(Config);set(config,120033,3.5);set(config,120041,3.5);set(config,120040,1);set(config,120011,2.5);
 const data=user([120033,120041,120040,120011]),value=Loadout.calculate(config,data,{heroMovingFraction:.5,heroRangedDamageFraction:.5,heroIncomingDps:100});
 close(value.averageReduction,.55);close(value.shieldFraction,.6);close(value.preventedDps,55+45*.6);close(value.reflectionDps,100*.5*(.5*.3+.5*.2)*.4*.2);
 const melee=Loadout.calculate(config,data,{heroRangedDamageFraction:0});assert.equal(melee.reflectionDps,0);
 const empty=Loadout.calculate(config,data,{heroIncomingDps:0});assert.equal(empty.preventedDps,0);assert.equal(empty.reflectionDps,0);
 const expected=Core.calculate({health:value.health,directDps:value.directDps,healingHps:value.healingHps,splashDps:value.splashDps,reflectionDps:value.reflectionDps,preventedDps:value.preventedDps});assert.equal(value.cp,expected.cp);
});

test('primary kill healing remains capped and the emergency flask now heals once during dangerous combat',()=>{
 const data=user([120042,120043],'fighter',3),value=Loadout.calculate(Config,data,{heroKillsPerSecond:20,heroHealingUtilization:.25,heroTriggeredHealingUtilization:.5});
 close(value.killHealingHps,100*.1/30*.5);assert.equal(value.waveHealingHps,0);close(value.regenerationHps,2.5);close(value.emergencyHealingHps,100*.16/30*.5);close(value.healingHps,2.5+value.killHealingHps+value.emergencyHealingHps);
 assert.equal(Loadout.calculate(Config,data,{heroTriggeredHealingUtilization:0}).healingHps,0);
 const plain=Loadout.calculate(Config,user()),flask=Loadout.calculate(Config,user([120043],'fighter',3));assert(flask.cp>plain.cp);assert.equal(Loadout.calculate(Config,data,{heroIncomingDps:0}).emergencyHealingHps,0);
});

test('the permanent slow remains utility and never enables the temporary-control damage bonus',()=>{
 const ordinary=Loadout.calculate(Config,user([120029]));close(ordinary.directDps,20*(1+.05*.2*.25));
 assert.equal(Loadout.calculate(Config,user([120002])).cp,Math.sqrt(2000));
 const combined=Loadout.calculate(Config,user([120002,120029]));assert.equal(combined.effectiveSlowedTargetFraction,.25);assert.equal(combined.directDps,ordinary.directDps);
 const config=clone(Config);config.TreasureCfg.find(row=>row.ID===120002).RequiredHeroStyle='vanguard';const fighter=Loadout.calculate(config,user([120002,120029]));assert.equal(fighter.effectiveSlowedTargetFraction,.25);assert.equal(fighter.directDps,ordinary.directDps);close(fighter.upgrades.effects.enemySlow[0],.2*.2);assert.equal(Loadout.snapshot(config,user([120002,120029])).upgrades.effects.enemySlow,undefined);
 const vanguard=Loadout.calculate(config,user([120002,120029],'vanguard'));assert.equal(vanguard.cp,fighter.cp);assert.equal(vanguard.effectiveSlowedTargetFraction,.25);
});

test('utility upgrades remain visible without adding unrelated power and ownership reads are pure and repeatable',()=>{
 const data=user([120001,120002,120039,120044]),before=JSON.stringify(data),config=JSON.stringify(Config),value=Loadout.calculate(Config,data);
 assert.equal(value.cp,Math.sqrt(2000));close(value.move,221*1.006);close(value.range,300*.35*1.006);assert.equal(value.upgrades.effects.reviveSeconds[0],1);
 assert.deepEqual(Loadout.calculate(Config,data),value);assert.equal(JSON.stringify(data),before);assert.equal(JSON.stringify(Config),config);
});

test('invalid scenario inputs produce unavailable CP without NaN displays or input repair',()=>{
 const data=user([120011,120030,120033,120040,120041,120042,120043]),before=JSON.stringify(data);
 for(const input of [null,{heroWaveSeconds:0},{heroIncomingDps:-1},{heroMovingFraction:1.1},{heroIncomingHitsPerSecond:Infinity},{heroKillsPerSecond:NaN},{heroTriggeredHealingUtilization:-1},{splashTargets:.5},{heroOpeningTargetFraction:2},{heroFocusStacks:4}]){const value=Loadout.calculate(Config,data,input);assert.equal(value.cp,null);assert(value.reason);}
 assert.equal(JSON.stringify(data),before);
});

test('the five old army relics now have independent hero mechanics with no HP, attack or crit-damage proxy',()=>{
 const ids=[120014,120024,120025,120026,120027,120035,120036],data=user(ids),value=Loadout.calculate(Config,data);
 assert.equal(value.damage,20);assert.equal(value.health,100);assert.equal(value.attackRate,1);assert.equal(value.criticalMultiplier,1.5);
 for(const row of value.upgrades.records.filter(row=>ids.includes(row.id))){assert.equal(row.scope,'hero');assert.deepEqual(row.cpStatMappings,{});assert.equal(row.weight,.2);}
 assert.equal(value.upgrades.effects.health,undefined);assert.equal(value.upgrades.effects.criticalDamage,undefined);
 for(const style of ['fighter','vanguard','skirmisher','mystic','bruiser','guardian']){
  const actual=Effects.resolve(Config,user(ids,style));
  for(const row of actual.records.filter(row=>ids.includes(row.id)))assert.equal(row.eligible,Config.TreasureCfg.find(cfg=>cfg.ID===row.id).RequiredHeroStyles.includes(style));
 }
});

test('pierce and cleave cap at one secondary target while echo is a noncritical primary-target release',()=>{
 const base=Loadout.calculate(Config,user()),value=Loadout.calculate(Config,user([120024,120035,120048]));
 close(value.pierceDps,20*.2*.2);close(value.cleaveDps,20*.05*.2);close(value.echoDps,20*.4*.2/6);close(value.primaryDps,base.primaryDps);
 const crowded=Loadout.calculate(Config,user([120024,120035,120048]),{splashTargets:100});assert.equal(crowded.pierceDps,value.pierceDps);assert.equal(crowded.cleaveDps,value.cleaveDps);
 const alone=Loadout.calculate(Config,user([120024,120035,120048]),{splashTargets:0});assert.equal(alone.splashDps,0);assert.equal(alone.echoDps,value.echoDps);
});

test('stationary protection and wave barriers stop contributing outside their own conditions',()=>{
 const data=user([120026,120036]),still=Loadout.calculate(Config,data,{heroMovingFraction:0});close(still.averageReduction,.08*.2);close(still.barrierPreventedDps,100*.03*.2/30);
 const moving=Loadout.calculate(Config,data,{heroMovingFraction:1});assert.equal(moving.averageReduction,0);
 const calm=Loadout.calculate(Config,data,{heroIncomingDps:0});assert.equal(calm.barrierPreventedDps,0);assert.equal(calm.preventedDps,0);
 assert.equal(Loadout.calculate(Config,data).health,100,'barriers do not raise maximum hero HP');
});

test('critical haste needs critical hits and preserves the saved attack windup',()=>{
 const plain=Loadout.calculate(Config,user([120014]));assert.equal(plain.hasteUptime,0);assert.equal(plain.effectiveRelicAttackRate,plain.effectiveAttackRate);
 const config=clone(Config);config.GameTools={timings:{'hero:hero:default':{attack:.5}}};
 const value=Loadout.calculate(config,user([120014,120031]));assert(value.hasteUptime>0);assert(value.effectiveRelicAttackRate>value.effectiveAttackRate);assert(value.effectiveRelicAttackRate<value.effectiveAttackRate*(1+.08*.2));assert.equal(value.attackTiming.windup,.5);
});

test('account CP combines opening, focus, controlled and boss primary bonuses additively',()=>{
 const value=Loadout.calculate(Config,user([120018,120025,120027,120029,120034]));
 const expected=(1+.1*.2*.5)*(1+.08*.2*.25+.03*.2*1.5+.05*.2*.25+.03*.2*.25);
 close(value.conditionalDamageMultiplier,expected);close(value.primaryDps,20*expected);close(value.directDps,value.primaryDps);
});
