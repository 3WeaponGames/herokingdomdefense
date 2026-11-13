'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),mirror=require('../../assets/configs/GameJsonCfg.json'),contract=require('./four-tier-building-progression.fixture.json');
const Cost=require('../../assets/_script/BuildingCost'),Assets=require('../../packages/game-data-editor/lib/asset-validation');
const statKeys=['Hp','Data','BuildSliverCost','BuildCost','VedioCount'];
const row=(category,index)=>config.BuildEnum[category].levelList.find(value=>value.index===index);
test('ten building families retain stable IDs and follow one straight four-tier path',()=>{
 assert.equal(contract.families.length,10);assert.equal(contract.families.reduce((sum,f)=>sum+f.indices.length,0),40);
 for(const family of contract.families){const seen=new Set(),category=config.BuildEnum[family.category];let next=family.indices[0];
  for(let tier=1;tier<=4;tier++){assert.equal(next,family.indices[tier-1]);assert(!seen.has(next));seen.add(next);const value=row(family.category,next);assert(value,family.family+' tier'+tier);assert.equal(value.ID,family.category);assert.equal(value.level,tier);
   if(tier<4){assert.deepEqual(value.BranchBuild,family.category===5&&tier===1?[2,5]:[family.indices[tier]]);next=value.BranchBuild[0];}else assert(!value.BranchBuild,'fourth tier is final');
  }
  assert.equal(category.levelList.filter(value=>family.indices.includes(value.index)).length,4);
 }
 assert.deepEqual(config.BuildEnum,mirror.BuildEnum,'runtime resource mirror uses the same building rows');
 for(const [category,choices]of Object.entries(contract.originalInitialChoices))assert.deepEqual(config.BuildEnum[category].InitialChoices,choices);
});
test('every existing tier1-3 HP, special value, numeric cost and ad field retains its approved value and presence',()=>{
 let checked=0;for(const family of contract.families)for(const original of family.originalStatRows){const current=row(family.category,original.index);for(const key of statKeys){assert.equal(Object.hasOwn(current,key),Object.hasOwn(original,key),family.family+' '+original.index+' '+key+' presence');if(Object.hasOwn(original,key))assert.deepEqual(current[key],original[key],family.family+' '+original.index+' '+key);}checked++;}assert.equal(checked,30);
 assert.deepEqual(config.BuildEnum[6],contract.originalWallDefinition,'three wall visuals and their original logical levels, prices, skins and blockers stay unchanged');
});
test('fourth-tier stats and destination prices extend the approved progression without reward-ad fallbacks',()=>{
 for(const family of contract.families){const category=config.BuildEnum[family.category],third=row(family.category,family.indices[2]),fourth=row(family.category,family.indices[3]);
  assert.equal(fourth.Hp,family.newTier4Hp);assert.deepEqual(fourth.Data,family.newTier4Data);assert.equal(fourth.BuildCost,family.newTier4BuildCost);assert.equal(fourth.ColliderIndex,family.colliderIndex);assert.equal(fourth.VedioCount,0);
  assert.equal(Cost.value(category,third,fourth),family.newTier4BuildCost);assert.equal(Cost.video(fourth,false),false);
  if(family.category===3){assert.equal(fourth.Data[1],third.Data[1]);assert.equal(fourth.Data[2],third.Data[2]);}
  if([4,5].includes(family.category))assert.equal(fourth.Data[1],0);
 }
});
test('all forty bodies, native skins, masks and distinct library icons resolve through actual runtime bundles',()=>{
 const icons=new Set();for(const family of contract.families)for(const index of family.indices){const value=row(family.category,index);icons.add(value.Icon);assert(Assets.imported(root,'KinghtFallIconBuild',value.Icon,'sprite'));
  if(value.Appearance){assert(Assets.imported(root,'resources',value.Appearance.sprite,'sprite'));for(const light of value.Appearance.lighting||[])if(light.sprite)assert(Assets.imported(root,'resources',light.sprite,'sprite'));}
 }
 assert.equal(icons.size,40);const docs={A:{data:config}},before=JSON.stringify(docs);assert.deepEqual(Assets.validate(root,docs,[{doc:'A',path:['BuildEnum']}]),[]);assert.equal(JSON.stringify(docs),before);
});
function buildInfo(baseLevel){
 const module={exports:{}},game={getBaseLevel:()=>baseLevel,getGameBuff:()=>null,talentAdd:{},treasureAdd:{}},deps={KinghtFallEnum:{KinghtFallEnumBuildEnum:{CastleCenter:1,ArrowTower:2,Wall:6},KinghtFallEnumBuffCfg:{},KinghtFallEnumTalentCfg:{TalenType09:9},KinghtFallEnumTreasureEnum:{}},KinghtFallUIGame:{default:{instance:{ctrGame:{gameData:game}}}},RelicRuntime:{current:()=>null,value:()=>0},RelicBattle:{applyEconomicGrowth(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallBuildInfo.js'),'utf8'),{module,exports:module.exports,require:name=>{assert(deps[name],name);return deps[name];}});return module.exports.KinghtFallBuildInfo;
}
test('actual upgrade eligibility requires castle4 for tier3 defenses and ends at tier4',()=>{
 const atThree=buildInfo(3),atFour=buildInfo(4);for(const family of contract.families){const third=row(family.category,family.indices[2]),fourth=row(family.category,family.indices[3]);
  assert.equal(new atThree(family.category,third).canUpgrade,family.category===1,family.family+' waits for castle4');assert.equal(new atFour(family.category,third).canUpgrade,true);const info=new atFour(family.category,fourth);assert.equal(info.canUpgrade,false);assert.equal(info.hpMax,fourth.Hp);
 }
});
const dataSource=fs.readFileSync(path.join(root,'assets/_script/KinghtFallGameCtrlData.js'),'utf8');
function unlockReader(){const match=/_ctor\.prototype\.initData\s*=\s*function\s*\([^)]*\)\s*\{/.exec(dataSource);assert(match);const body=match.index+match[0].length,end=dataSource.indexOf('    var r;',body);assert(end>body);return vm.runInNewContext('(function(){'+dataSource.slice(body,end)+'})');}
function canLock(){const match=/_ctor\.prototype\.canLock = (function \(t\) \{[\s\S]*?\n  \});/.exec(dataSource);assert(match);return vm.runInNewContext('('+match[1]+')');}
test('actual runtime unlock initialization keeps legacy stage data untouched and supports optional level4 purchases',()=>{
 const levelCfg={HomeLevel1Unlock:[[2,7]],HomeLevel2Unlock:[[3,9]],HomeLevel3Unlock:[[5,11]]},before=JSON.stringify(levelCfg),owner={levelCfg};unlockReader().call(owner);assert.equal(owner.buildings.length,4);assert.equal(JSON.stringify(owner.buildings.slice(0,3)),JSON.stringify([{level:1,bulidPoint:[7],bulidId:[2]},{level:2,bulidPoint:[9],bulidId:[3]},{level:3,bulidPoint:[11],bulidId:[5]}]));assert.equal(JSON.stringify(levelCfg),before);assert(!Object.hasOwn(levelCfg,'HomeLevel4Unlock'));assert.equal(owner.buildings[3].bulidPoint.length,0);
 levelCfg.HomeLevel4Unlock=[[2,99]];unlockReader().call(owner);owner.baseBuild={getLevel:()=>4};assert.equal(canLock().call(owner,99),true);owner.baseBuild.getLevel=()=>3;assert.equal(canLock().call(owner,99),false);assert.equal(canLock().call(owner,1),true);
});
