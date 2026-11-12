'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../assets/_script/RelicEligibility'),Runtime=require('../../assets/_script/RelicRuntime');
const config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const {setup}=require('./backend-gameplay-harness.cjs');
const restricted={11:['guardian'],14:['fighter'],18:['fighter','vanguard','bruiser','guardian'],24:['vanguard'],25:['skirmisher'],26:['guardian'],27:['fighter'],29:['mystic'],30:['mystic'],33:['mystic'],34:['bruiser'],35:['bruiser'],36:['mystic'],39:['vanguard'],40:['guardian'],41:['vanguard'],42:['bruiser'],44:['skirmisher'],48:['skirmisher'],49:['guardian']};

test('all fifty relics have distinct identities, with exactly the intended style requirements',()=>{
 assert.equal(new Set(config.TreasureCfg.map(r=>r.EffectKey)).size,50);
 for(const row of config.TreasureCfg){
  assert.match(row.EffectKey,/^[a-z][a-zA-Z]+$/);
  const expected=restricted[row.ID-120000]||E.ids;
  assert.deepEqual(E.stylesFor(row.ID,row),expected);
  assert.deepEqual(E.stylesFor(row.ID),expected,'legacy ID-only caller '+row.ID);
  assert.deepEqual(E.stylesFor(row.ID,{ID:row.ID,levelInfo:row.levelInfo}),expected,'legacy definition '+row.ID);
  if(expected.length<6)assert.deepEqual(row.RequiredHeroStyles,expected);
  for(const id of E.ids){
   const data={heroStyle:id,treasureAdd:{[row.ID]:row.levelInfo[2].param},relicDefinitions:{[row.ID]:row}};
   assert.equal(Runtime.value(data,row.ID),expected.includes(id)?row.levelInfo[2].param[0]:0,row.ID+' / '+id);
   delete data.relicDefinitions;
   assert.equal(Runtime.value(data,row.ID),expected.includes(id)?row.levelInfo[2].param[0]:0,'snapshot fallback '+row.ID+' / '+id);
  }
 }
});

test('every localized relic magnitude references an available level parameter',()=>{
 const entries=require('../../assets/resources/localization/catalog.json').entries;
 for(const row of config.TreasureCfg){
  const key=/^\[\[loc:([^\]]+)\]\]$/.exec(row.Describe)[1];
  for(const language of ['en','zh'])for(const match of entries[key][language].matchAll(/\{(\d+)\}/g))
   for(const level of row.levelInfo)assert(Number(match[1])<level.param.length,key+' '+language+' '+match[0]);
 }
});

test('requirements support authored overrides and legacy players without mutating their data',()=>{
 const user={data:{future:{keep:true}},getHeroWeapon:()=>({id:'mystic'})},before=JSON.stringify(user.data);
 assert.equal(E.selected(user).id,'mystic');assert.equal(E.selected({}).id,'skirmisher');
 assert.equal(E.eligible(120030,'guardian'),false);
 assert.equal(E.eligible(120030,'guardian',{RequiredType:'hero'}),true,'an explicit authored override replaces the default');
 assert.equal(E.required({RequiredHeroStyles:['mystic'],RequiredAttackType:2},'mystic'),true);
 assert.equal(E.required({RequiredHeroStyles:['mystic'],RequiredAttackType:1},'mystic'),false);
 assert.equal(E.required({RequiredType:'melee'},'skirmisher'),false);
 assert.equal(JSON.stringify(user.data),before);
});

function initialize(styleId, saved){
 const h=setup(),user={data:{heroWeapon:{selected:styleId},treasureInfo:config.TreasureCfg.map(r=>({id:r.ID,level:3,frame:2})),unknown:{preserve:1}},getTreasureLevel(id){return this.data.treasureInfo.find(r=>r.id===id);},getTalent(){return [];}};
 const untouched=JSON.stringify(user.data),configBefore=JSON.stringify(config);
 const mgr=h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
 mgr.getGameTask=()=>({MissionType:1,MissionID:[],Award:[]});mgr.getTreasureCfg=()=>config.TreasureCfg;mgr.getParamsCfgById=()=>1;
 h.e.stubs.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData=()=>user;
 h.d.levelCfg={Level:1,HomeLevel1Unlock:[],HomeLevel2Unlock:[],HomeLevel3Unlock:[]};
 h.d.loadMonster=restoring=>assert.equal(restoring,!!saved);
 h.d.initData(!!saved);
 if(saved)h.load('RelicRuntime').restore(h.d,saved);
 assert.equal(JSON.stringify(user.data),untouched);assert.equal(JSON.stringify(config),configBefore);
 return h;
}
test('new battle and Continue rebuild the actual relic snapshot for all six equipped styles without changing ownership',()=>{
 for(const styleId of E.ids){
  const h=initialize(styleId);assert.equal(h.d.heroStyle,styleId);
  for(const row of config.TreasureCfg)assert.equal(!!h.d.treasureAdd[row.ID],E.eligible(row.ID,styleId,row),row.ID+' / '+styleId);
  const saved={phoenixUsed:true,completedWaves:{1:true},futureField:{keep:2}},continued=initialize(styleId,saved);
  assert.equal(continued.d.heroStyle,styleId);
  assert.deepEqual(JSON.parse(JSON.stringify(continued.d.relicState)),saved);
  for(const row of config.TreasureCfg)assert.equal(!!continued.d.treasureAdd[row.ID],E.eligible(row.ID,styleId,row));
 }
 const previous=initialize('mystic');assert(previous.d.treasureAdd[120030]);assert(!previous.d.treasureAdd[120024]);
 const next=initialize('vanguard',{heroAttackCount:7,phoenixUsed:true});
 assert(!next.d.treasureAdd[120030]);assert(next.d.treasureAdd[120024]);assert.equal(next.d.relicState.phoenixUsed,true);
});

test('Frost eligibility requires a current temporary control effect, independently of global Slowing Charm',()=>{
 const enemy={node:{_combatGeneration:2},debuffInfo:[]},data={heroStyle:'mystic',treasureAdd:{120002:[.5]}};
 assert.equal(Runtime.slowed(enemy,data),true);assert.equal(Runtime.controlled(enemy),false);
 Runtime.applyControl(enemy,1);assert.equal(Runtime.controlled(enemy),true);
 enemy.node._combatGeneration++;assert.equal(Runtime.controlled(enemy),false,'pooled control belongs to its original lifetime');
 enemy.debuffInfo=[{type:3,data:{subNum:.2}}];assert.equal(Runtime.controlled(enemy),true);
 enemy.debuffInfo=[{type:4,data:{subNum:.2}}];assert.equal(Runtime.controlled(enemy),false);
});
