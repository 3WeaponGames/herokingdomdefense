'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),path=require('node:path');
const Compact=require('./compact-secondary-equipment.cjs'),Config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),Stats=require('../../assets/_script/HeroEquipmentStats'),Tiers=require('../../assets/_script/EquipmentTiers'),Weapons=require('../../assets/_script/HeroWeapons');
const clone=value=>JSON.parse(JSON.stringify(value));
test('compaction keeps each even authored step, five tiers, unknown fields and exactly half of the full gold cost',()=>{
 const old={HeroEquipment:{future:{keep:true}},EquipCfg:[{id:3,future:'keep',levelInfo:Array.from({length:50},(_,i)=>({ID:3,Level:i+1,EquipSkin:'tier'+Math.floor(i/10),GoldCost:i===49?0:1000+i*100,Parameters:20+i,SecondaryStats:{fighter:{healthRegen:(i+1)/10,future:i}},future:{at:i+1}}))},{id:4,levelInfo:[{Parameters:2}]}]},before=clone(old),next=clone(old),report=Compact.compact(next),gear=next.EquipCfg[0];
 assert.deepEqual(gear.levelInfo.map(row=>row.Level),Array.from({length:25},(_,i)=>i+1));assert.deepEqual(Tiers.tiers(gear).map(tier=>tier.levels.length),[5,5,5,5,5]);
 gear.levelInfo.forEach((row,i)=>{const expected=clone(before.EquipCfg[0].levelInfo[i*2+1]),actual=clone(row);delete expected.Level;delete expected.GoldCost;delete actual.Level;delete actual.GoldCost;assert.deepEqual(actual,expected);});
 assert.equal(gear.levelInfo.reduce((sum,row)=>sum+row.GoldCost,0),Math.round(before.EquipCfg[0].levelInfo.reduce((sum,row)=>sum+row.GoldCost,0)/2));assert.equal(report.levels,25);assert.equal(gear.levelInfo.at(-1).GoldCost,0);assert.deepEqual(next.EquipCfg[1],before.EquipCfg[1]);assert.deepEqual(next.HeroEquipment.future,before.HeroEquipment.future);assert.equal(Compact.compact(next),null);
});
test('published offhands expose 25 upgrades and the old final bonuses with half the original gold budget in both configs',()=>{
 const mirror=require('../../assets/configs/GameJsonCfg.json');assert.deepEqual(Config.EquipCfg,mirror.EquipCfg);
 const gear=Config.EquipCfg.find(row=>row.id===3),rule=Config.HeroEquipment.secondaryProgression;assert.equal(gear.levelInfo.length,25);assert.deepEqual(Tiers.tiers(gear).map(tier=>tier.levels.length),[5,5,5,5,5]);assert.equal(gear.levelInfo.reduce((sum,row)=>sum+row.GoldCost,0),rule.originalTotalGold/2);assert.equal(rule.totalGold,4138875);
 for(const [style,expected]of Object.entries({fighter:{healthRegenPercent:.05},skirmisher:{range:200,criticalChance:.1},vanguard:{move:.2,attackRate:.1},bruiser:{lifeSteal:.1},guardian:{damageReduction:.2},mystic:{splashDamage:.5}})){const actual=Stats.secondary(Config,style,25);for(const [key,value]of Object.entries(expected))assert.equal(actual[key],value);}
 assert.equal(Config.EquipCfg.find(row=>row.id===4).levelInfo.length,50);assert.equal(Config.EquipCfg.find(row=>row.id===1).levelInfo.length,50);assert.equal(Compact.plan(path.resolve(__dirname,'../..')).files.size,0);
});
test('all old offhand levels migrate once without weaker bonuses, currency changes or unknown-field loss',()=>{
 for(let level=1;level<=50;level++){
  const data={personLevel:[7,8,level,23,9,10],heroWeapon:{selected:'guardian',levels:Object.fromEntries(Weapons.styles.map(style=>[style.id,{3:level,4:17,future:'keep'}]))},goldNum:12345,future:{keep:1}},before=clone(data);
  data.heroWeapon.levels.futureStyle={3:47,future:true};Stats.migrateSecondary(data,Config);assert.equal(data.personLevel[2],Math.ceil(level/2));
  for(const style of Weapons.styles){assert.equal(data.heroWeapon.levels[style.id][3],Math.ceil(level/2));assert.equal(data.heroWeapon.levels[style.id][4],17);assert.equal(data.heroWeapon.levels[style.id].future,'keep');}
  assert.deepEqual(data.heroWeapon.levels.futureStyle,{3:47,future:true});assert.equal(data.goldNum,before.goldNum);assert.deepEqual(data.future,before.future);assert.equal(data.heroWeapon.selected,'guardian');assert.deepEqual(data.personLevel.filter((_v,i)=>i!==2),before.personLevel.filter((_v,i)=>i!==2));
  const range=Stats.secondary(Config,'skirmisher',data.personLevel[2]).range;assert(range>=level*4);const once=JSON.stringify(data);Stats.migrateSecondary(data,Config);assert.equal(JSON.stringify(data),once);
 }
 const untouched={personLevel:[1,1,20]};Stats.migrateSecondary(untouched,{EquipCfg:Config.EquipCfg});assert.deepEqual(untouched,{personLevel:[1,1,20]});
});
