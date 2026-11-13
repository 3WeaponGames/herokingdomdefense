'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),Stats=require('../../assets/_script/HeroEquipmentStats'),Weapons=require('../../assets/_script/HeroWeapons'),Loadout=require('../../assets/_script/HeroLoadout');
const clone=value=>structuredClone(value),near=(a,b)=>assert(Math.abs(a-b)<=Math.max(1,Math.abs(b))*1e-10,`${a} != ${b}`);
function values(cfg,level=1){return Object.fromEntries(cfg.EquipCfg.map(gear=>[gear.id,gear.levelInfo[Math.min(level,gear.levelInfo.length)-1].Parameters]));}
function user(style,cloak=1){return{personLevel:[1,1,50,50,cloak,1],heroEquipmentVersion:1,heroWeapon:{selected:style,levels:{[style]:{3:50,4:50}}}};}

test('missing style rates preserve the exact existing Cloak arithmetic at every level and never seed defaults',()=>{
 const cfg=clone(Config),before=clone(cfg);delete cfg.HeroEquipment.baseAttackRates;
 for(const {id}of Weapons.styles)for(let level=1;level<=25;level++){const gear=values(cfg,level),secondary=Stats.secondary(cfg,id,50);assert.equal(Stats.hasBaseAttackRate(cfg,id),false);assert.equal(Stats.baseAttackRate(cfg,id),cfg.EquipCfg.find(g=>g.id===5).levelInfo[0].Parameters);assert.equal(Stats.raw(cfg,id,gear,50).attackRate,gear[5]*(1+(secondary.attackRate||0)));}
 assert.deepEqual(cfg,before);assert.equal(Object.hasOwn(cfg.HeroEquipment,'baseAttackRates'),false);
});

test('six independent starting rates preserve proportional Cloak progression and apply Vanguard secondary once',()=>{
 const cfg=clone(Config),rates={skirmisher:.8,fighter:1.25,vanguard:1.6,mystic:.95,bruiser:1.1,guardian:.65};cfg.HeroEquipment.baseAttackRates={...rates,future:{keep:7}};
 const cloak=cfg.EquipCfg.find(g=>g.id===5);cloak.levelInfo[0].Parameters=2;cloak.levelInfo[12].Parameters=3;cfg.EquipCfg.reverse();const before=clone(cfg),gear=values(cfg,13),input=clone(gear);
 for(const {id}of Weapons.styles){assert.equal(Stats.hasBaseAttackRate(cfg,id),true);assert.equal(Stats.baseAttackRate(cfg,id),rates[id]);near(Stats.raw(cfg,id,gear,50).attackRate,rates[id]*1.5*(id==='vanguard'?1.1:1));near(Stats.raw(cfg,id,values(cfg),50).attackRate,rates[id]*(id==='vanguard'?1.1:1));}
 const guardian=Stats.raw(cfg,'guardian',gear,50).attackRate;cfg.HeroEquipment.baseAttackRates.fighter=3;assert.equal(Stats.raw(cfg,'guardian',gear,50).attackRate,guardian);cfg.HeroEquipment.baseAttackRates.fighter=rates.fighter;assert.deepEqual(cfg,before);assert.deepEqual(gear,input);
});

test('malformed and inherited overrides are ignored, and legacy-disabled configurations retain their original mapping',()=>{
 for(const value of [undefined,null,0,-1,NaN,Infinity,-Infinity,'2',{},[],true]){const cfg=clone(Config);cfg.HeroEquipment.baseAttackRates={fighter:value};assert.equal(Stats.hasBaseAttackRate(cfg,'fighter'),false);assert.equal(Stats.baseAttackRate(cfg,'fighter'),1);assert.equal(Stats.raw(cfg,'fighter',values(cfg,13),50).attackRate,1.5);}
 for(const table of [null,2,[],Object.create({fighter:2})]){const cfg=clone(Config);cfg.HeroEquipment.baseAttackRates=table;assert.equal(Stats.hasBaseAttackRate(cfg,'fighter'),false);assert.equal(Stats.raw(cfg,'fighter',values(cfg,13),50).attackRate,1.5);}
 const cfg=clone(Config);cfg.HeroEquipment.baseAttackRates={fighter:2,'future-style':3};assert.equal(Stats.hasBaseAttackRate(cfg,'future-style'),false);cfg.HeroEquipment.version=0;const equipment={1:100,2:10,3:20,4:300,5:1.75,6:221};assert.equal(Stats.hasBaseAttackRate(cfg,'fighter'),false);assert.equal(Stats.baseAttackRate(cfg,'fighter'),1);assert.deepEqual(Stats.raw(cfg,'fighter',equipment,50),{health:100,regen:10,damage:20,range:300,attackRate:1.75,move:221});
});

test('zero or invalid legacy Cloak baselines and overflowing overrides cannot introduce division artifacts',()=>{
 for(const baseline of [0,-1,undefined,null,'1',NaN,Infinity]){const cfg=clone(Config);cfg.EquipCfg.find(g=>g.id===5).levelInfo[0].Parameters=baseline;cfg.HeroEquipment.baseAttackRates={fighter:2};const equipment=values(cfg,13);assert.equal(Stats.raw(cfg,'fighter',equipment,50).attackRate,1.5);assert.equal(Stats.baseAttackRate(cfg,'fighter'),2,'the authoring helper retains the explicit value for validation/reset');delete cfg.HeroEquipment.baseAttackRates.fighter;assert(Object.is(Stats.baseAttackRate(cfg,'fighter'),baseline));}
 const cfg=clone(Config);cfg.HeroEquipment.baseAttackRates={fighter:Number.MAX_VALUE};assert.equal(Stats.raw(cfg,'fighter',values(cfg,25),50).attackRate,2);const baseline=cfg.EquipCfg.find(g=>g.id===5);baseline.levelInfo=[];assert.equal(Stats.raw(cfg,'fighter',{1:100,2:10,3:2,4:2,5:1.75,6:200},1).attackRate,1.75);assert.equal(Stats.baseAttackRate({},'fighter'),undefined);
});

test('shared loadout, equipped preview and CP consume the same style base before their existing upgrade policies',()=>{
 const cfg=clone(Config),legacy=clone(Config);cfg.HeroEquipment.baseAttackRates=Object.fromEntries(Weapons.styles.map(({id},i)=>[id,1.2+i*.2]));
 for(const {id}of Weapons.styles){const data=user(id,25);data.talentInfo=cfg.TalentLevelCfg.filter(t=>t.HeroStyle).map(t=>({id:t.ID,isLock:true}));const before=clone(data),statsBefore=clone(cfg),snap=Loadout.snapshot(cfg,data),old=Loadout.snapshot(legacy,data),power=Loadout.calculate(cfg,data),oldPower=Loadout.calculate(legacy,data);near(snap.attackRate/old.attackRate,cfg.HeroEquipment.baseAttackRates[id]);near(power.attackRate/oldPower.attackRate,cfg.HeroEquipment.baseAttackRates[id]);assert.equal(snap.damage,old.damage);assert.equal(snap.health,old.health);assert(power.cp>oldPower.cp);assert(power.effectiveAttackRate>oldPower.effectiveAttackRate);assert.deepEqual(data,before);assert.deepEqual(cfg,statsBefore);assert.deepEqual(cfg.GameTools,legacy.GameTools);}
});

function battle(cfg,style){
 const {setup,hero}=require('./backend-gameplay-harness.cjs'),data=user(style,25);data.talentInfo=cfg.TalentLevelCfg.filter(t=>t.HeroStyle===style).map(t=>({id:t.ID,isLock:true}));const player={data,getHeroWeapon:()=>Weapons.selected(data),getPersonLevel:slot=>Weapons.level(data,slot)};
 const h=setup({KinghtFallEnum:require('../../assets/_script/KinghtFallEnum'),KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>player})}}}),p=hero(h),manager=h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();delete p.getAttSpeed;manager.data=cfg;manager.getEquipCfgList=()=>cfg.EquipCfg;manager.getParamsCfgById=()=>3;h.e.stubs.HeroMakerRider={setCombatState(){},clearCombatState(){}};Object.assign(p.ctrPlayAni,{initView(){},setAttackEvent(){},setAttackEnd(){}});p.ctrHp.setType=()=>{};p.initData();h.d.heroStyle=style;
 p.getBuffList=()=>[{data:{addSpeed:.2}}];h.d.addTime.PlayerAttackSpeed=.1;h.d.businessAdd.AttackSpeed=.15;p.time.RebornBuff2=.1;p.time.AttackSpeed2=.05;
 h.d.treasureAdd[120014]=[.12];p._relicHaste={data:h.d,epoch:h.g._combatEpoch,relicGeneration:h.d._relicGeneration,heroGeneration:p.node._combatGeneration,remaining:2,round:h.d.round};
 const state=p._styleRuntime.state;if(style==='fighter')state.buffRemaining=10;if(style==='vanguard'){state.buffRemaining=10;state.buffStrength=.6;}if(style==='bruiser')p.hp=p.hpMax*.25;
 return{...h,p,data,player};
}

test('real combat initialization composes all six style defaults with talents, temporary buffs, relics and passives once',()=>{
 const cfg=clone(Config);cfg.HeroEquipment.baseAttackRates=Object.fromEntries(Weapons.styles.map(({id})=>[id,2.5]));const timings=clone(cfg.GameTools),before=clone(cfg);
 for(const {id}of Weapons.styles){const original=battle(clone(Config),id),changed=battle(cfg,id),snap=Loadout.snapshot(cfg,changed.player);near(changed.p.attackSpeed,snap.attackRate);near(changed.p.attackSpeed/original.p.attackSpeed,2.5);near(changed.p.getAttSpeed()/original.p.getAttSpeed(),2.5);assert(changed.p.getAttSpeed()>changed.p.attackSpeed);const current=changed.p.getAttSpeed();changed.p.initData();near(changed.p.attackSpeed,snap.attackRate);assert(changed.p.getAttSpeed()<=current,'reinitializing never compounds the previously applied style default');}
 assert.deepEqual(cfg,before);assert.deepEqual(cfg.GameTools,timings);
});
