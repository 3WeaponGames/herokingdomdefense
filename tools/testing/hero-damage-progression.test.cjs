'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),Stats=require('../../assets/_script/HeroEquipmentStats'),Weapons=require('../../assets/_script/HeroWeapons'),Loadout=require('../../assets/_script/HeroLoadout');
const clone=value=>JSON.parse(JSON.stringify(value));
function profile(baseDamage,gain){return{baseDamage,gains:Array(49).fill(gain)};}
function user(style,level=1){return{personLevel:[1,1,1,1,1,1],heroEquipmentVersion:1,heroWeapon:{selected:style,levels:{[style]:{3:1,4:level}}}};}
test('absent independent curves preserve every current damage value and never seed configuration or progress',()=>{
 const config=clone(Config);delete config.HeroEquipment.damageProgressions;const before=JSON.stringify(config);
 for(const style of Weapons.styles)for(let level=1;level<=50;level++){
  const data=user(style.id,level),saved=JSON.stringify(data),expected=Math.ceil(config.EquipCfg[3].levelInfo[level-1].Parameters*Stats.multiplier(config,style.id)-1e-9);
  assert.equal(Stats.damageAtLevel(config,style.id,level),expected);assert.equal(Loadout.snapshot(config,data).damage,expected);assert.equal(JSON.stringify(data),saved);
 }
 assert.equal(JSON.stringify(config),before);
});
test('independent starting damage, flat increases and special upgrades agree across Gear, CP and actual combat setup',()=>{
 const config=clone(Config);config.HeroEquipment.damageProgressions={skirmisher:profile(18,2),fighter:profile(21,2),bruiser:profile(25,3)};
 config.HeroEquipment.damageProgressions.fighter.gains[3]=3;const before=JSON.stringify(config),context={exports:{},require:name=>({HeroEquipmentStats:Stats,HeroWeapons:Weapons,HeroLoadout:Loadout,HeroStyleRuntime:{install(){}}})[name]};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroWeaponCombat.js'),'utf8'),context);
 for(const [style,base,gain]of [['skirmisher',18,2],['fighter',21,2],['bruiser',25,3]])for(const level of [1,2,4,5,10,25,50]){
  const data=user(style,level),prior=JSON.stringify(data),expected=base+(level-1)*gain+(style==='fighter'&&level>=5?1:0),snapshot=Loadout.snapshot(config,data);
  assert.equal(snapshot.damage,expected);assert.equal(Stats.fields(config,4,level,style)[0].value,expected);assert.equal(Loadout.calculate(config,data).damage,expected);
  const actor={};context.exports.configure(actor,{data,getHeroWeapon:()=>Weapons.selected(data),getPersonLevel:slot=>Weapons.level(data,slot)},config);
  assert.equal(actor.attack,expected);assert.equal(actor.attack,snapshot.damage);assert.equal(JSON.stringify(data),prior);
 }
 assert.equal(Stats.damageAtLevel(config,'fighter',1),21);assert.equal(Stats.damageAtLevel(config,'fighter',5),30);assert.equal(Stats.damageAtLevel(config,'bruiser',50),172);
 assert.equal(Stats.damageAtLevel(config,'guardian',50),115,'A style without a custom curve retains its current multiplier');assert.equal(JSON.stringify(config),before);
});
test('main upgrade identity is explicit even when shared raw values repeat, and secondary levels do not change damage',()=>{
 const config=clone(Config);config.HeroEquipment.damageProgressions={fighter:profile(21,2)};config.EquipCfg[3].levelInfo.forEach(row=>row.Parameters=2);
 const values=Object.fromEntries(config.EquipCfg.map(gear=>[gear.id,gear.levelInfo[0].Parameters]));
 assert.equal(Stats.raw(config,'fighter',values,1,20).damage,59);assert.equal(Stats.raw(config,'fighter',values,50,20).damage,59);
 const data=user('fighter',20);data.heroWeapon.levels.fighter[3]=50;assert.equal(Loadout.snapshot(config,data).damage,59);
});
test('malformed damage profiles fall back without repair, while unknown configuration fields and legacy mapping survive',()=>{
 for(const invalid of [null,[],{},profile(-1,2),profile(1.5,2),profile(2,-1),{baseDamage:2,gains:[2]},profile(Number.MAX_SAFE_INTEGER,2),profile(2,NaN)]){
  const config=clone(Config);config.HeroEquipment.damageProgressions={fighter:invalid,futureStyle:{keep:true}};const before=JSON.stringify(config);
  assert.equal(Stats.hasDamageProgression(config,'fighter'),false);assert.equal(Stats.damageAtLevel(config,'fighter',10),26);assert.equal(JSON.stringify(config),before);
 }
 const config=clone(Config);config.HeroEquipment.damageProgressions={fighter:{...profile(21,2),future:{keep:1}}};const before=JSON.stringify(config);
 const copy=Stats.damageProgression(config,'fighter');copy.gains[0]=999;assert.equal(Stats.damageAtLevel(config,'fighter',2),23);assert.equal(JSON.stringify(config),before);
 delete config.HeroEquipment;assert.deepEqual(Stats.raw(config,'fighter',{1:100,2:10,3:20,4:300,5:1,6:221},1,10),{health:100,regen:10,damage:20,range:300,attackRate:1,move:221});
});
