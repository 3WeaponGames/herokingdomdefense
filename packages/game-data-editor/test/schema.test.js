'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const Schema=require('../lib/schema');
const root=path.resolve(__dirname,'../../..');
const original={};
['A','B','D'].forEach(key=>original[key]={data:JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig'+(key==='A'?'':key)+'/GameJsonCfg.json'),'utf8'))});
original.catalog={data:JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'),'utf8'))};
original.overrides={data:Schema.clone(original.A.data.GameTools||{version:1,timings:{},parameters:{},perks:{}})};
const legacyOriginal=Schema.clone(original);
for(const key of ['A','B','D'])for(const stage of legacyOriginal[key].data.LevelCfg)for(const wave of stage.WaveCfg)delete wave.SpawnTimeline;
const baseline=Schema.validate(original),legacyBaseline=Schema.validate(legacyOriginal),fingerprint=i=>i.doc+':'+JSON.stringify(i.path)+':'+i.message,known=new Set(baseline.concat(legacyBaseline).map(fingerprint));
const fixture=()=>Schema.clone(original);
const legacyFixture=()=>Schema.clone(legacyOriginal);
const introduced=docs=>Schema.validate(docs).filter(i=>!known.has(fingerprint(i))&&i.severity==='error');
let passed=0;function test(name,fn){fn();passed++;console.log('✓ '+name);}
test('validation leaves every source field unchanged',()=>{const before=JSON.stringify(original);Schema.validate(original);assert.strictEqual(JSON.stringify(original),before);});
test('all campaign spawn strings round trip including waits without normalization',()=>{let waits=0;['A','B','D'].forEach(variant=>original[variant].data.LevelCfg.forEach(stage=>stage.WaveCfg.forEach(wave=>wave.RefreshSoldierKind.forEach(text=>{const row=Schema.parseSpawn(text);assert.strictEqual(Schema.encodeSpawn(row),text);waits+=row.groups.filter(g=>g.unit===-1).length;}))));assert(waits>0);});
test('converted schedules validate cleanly while legacy diagnostics still identify original duplicate lanes',()=>{assert.deepStrictEqual(baseline,[]);assert(legacyBaseline.length>0);assert(legacyBaseline.every(i=>i.message.indexOf('Duplicate spawn lane')===0));});
test('changing one legacy wave count remains valid',()=>{const d=legacyFixture();d.A.data.LevelCfg[0].WaveCfg[0].RefreshSoldierKind[0]='1#90001,10';assert.deepStrictEqual(introduced(d),[]);});
test('a legacy wait consumes spawn ticks and may precede a real unit',()=>{const d=legacyFixture();d.A.data.LevelCfg[0].WaveCfg[0].RefreshSoldierKind[0]='1#-1,10;90001,5';assert.deepStrictEqual(introduced(d),[]);});
test('duplicate legacy lanes cannot be introduced silently',()=>{const d=legacyFixture();d.A.data.LevelCfg[0].WaveCfg[0].RefreshSoldierKind.push('1#90002,1');assert(introduced(d).some(i=>/Duplicate spawn lane/.test(i.message)));});
test('legacy spawn counts are positive integers and units need spawnable prefabs',()=>{const d=legacyFixture();d.B.data.LevelCfg[0].WaveCfg[0].RefreshSoldierKind=['1#90011,0'];const errors=introduced(d);assert(errors.some(i=>/cannot spawn/.test(i.message)));assert(errors.some(i=>/positive whole/.test(i.message)));});
test('legacy map lane maximum follows the actual playable map',()=>{const d=legacyFixture();d.A.data.LevelCfg[0].WaveCfg[0].RefreshSoldierKind=['10#90001,1'];assert(introduced(d).some(i=>/1–9/.test(i.message)));d.A.data.LevelCfg[0].prefab='Map04';assert(!introduced(d).some(i=>/authored lane/.test(i.message)));});
test('active timed schedules validate counts, timing and units independently of retained legacy strings',()=>{const d=fixture(),wave=d.A.data.LevelCfg[0].WaveCfg[0];wave.RefreshSoldierKind=['999#90011,0'];assert.deepStrictEqual(introduced(d),[]);Object.assign(wave.SpawnTimeline[0],{unitId:90011,count:0,startSeconds:-1,intervalSeconds:-1});const errors=introduced(d);for(const field of ['unitId','count','startSeconds','intervalSeconds'])assert(errors.some(i=>i.path[i.path.length-1]===field),field);});
test('wave order is validated rather than silently reindexed',()=>{const d=fixture();d.D.data.LevelCfg[0].WaveCfg[0].Wave=2;assert(introduced(d).some(i=>/Wave number/.test(i.message)));assert.strictEqual(d.D.data.LevelCfg[0].WaveCfg[0].Wave,2);});

test('timed quantities remain exactly representable and their final spawn must be reachable',()=>{
 for(const patch of [{count:Number.MAX_SAFE_INTEGER+1},{spawnId:Number.MAX_SAFE_INTEGER+1},{unitId:Number.MAX_SAFE_INTEGER+1},{count:3,intervalSeconds:1e308}]){
  const d=fixture(),entry=d.A.data.LevelCfg[0].WaveCfg[0].SpawnTimeline[0];Object.assign(entry,patch);const before=JSON.stringify(d);assert(introduced(d).some(i=>/safe whole|final spawn time/.test(i.message)));assert.strictEqual(JSON.stringify(d),before);
 }
});

test('malformed wave arrays and groups produce editable diagnostics without changing their source',()=>{
 for(const mutate of [w=>w.SpawnTimeline={},w=>w.SpawnTimeline=[null],w=>{delete w.SpawnTimeline;w.RefreshSoldierKind={};}]){const d=fixture();mutate(d.A.data.LevelCfg[0].WaveCfg[0]);const before=JSON.stringify(d);assert(introduced(d).length);assert.strictEqual(JSON.stringify(d),before);}
 const d=fixture();d.A.data.LevelCfg[0].WaveCfg=[null];assert(introduced(d).some(i=>/wave must be an object/.test(i.message)));
});

test('reward JSON shape errors are diagnostics rather than crashing shared-stage snapshots',()=>{
 for(const value of [{},null,17,'bad']){const d=fixture();d.A.data.LevelCfg[0].WaveCfg[0].WaveReward=value;const before=JSON.stringify(d);assert(introduced(d).some(i=>i.path.includes('WaveReward')));assert.strictEqual(JSON.stringify(d),before);}
 for(const value of [{},null,[{}],[null]]){const d=fixture();d.A.data.LevelCfg[0].ChallengeReward=value;const before=JSON.stringify(d);assert(introduced(d).some(i=>i.path.includes('ChallengeReward')));assert.strictEqual(JSON.stringify(d),before);}
});
test('building branch cycles and unknown barracks units are rejected',()=>{const d=fixture();d.A.data.BuildEnum['1'].levelList[2].BranchBuild=[1];d.A.data.BuildEnum['3'].levelList[0].Data[1]=123;const errors=introduced(d);assert(errors.some(i=>/cycle/.test(i.message)));assert(errors.some(i=>/Barracks unit/.test(i.message)));});
test('hero equipment stat edits preserve identifiers and source schema',()=>{const d=fixture();d.A.data.EquipCfg[0].levelInfo[0].Parameters=150;assert.deepStrictEqual(introduced(d),[]);d.A.data.EquipCfg[0].levelInfo[0].Level=2;assert(introduced(d).some(i=>/Equipment level/.test(i.message)));});
test('talent row gaps and missing effect references are rejected',()=>{const d=fixture();d.A.data.TalentLevelCfg[0].Level=2;d.A.data.TalentLevelCfg[0].kindID=999;const errors=introduced(d);assert(errors.some(i=>/skipped progression/.test(i.message)));assert(errors.some(i=>/Talent effect does not exist/.test(i.message)));});

test('optional hero style talents retain independent IDs and progression without changing legacy rows',()=>{
 const d=fixture(),before=JSON.stringify(d),legacy=d.A.data.TalentLevelCfg.filter(row=>!row.OptionalBranch),optional=d.A.data.TalentLevelCfg.filter(row=>row.OptionalBranch);
 assert.equal(legacy.length,140);assert.equal(optional.length,18);assert.deepStrictEqual(Schema.validate(d).filter(i=>i.path[0]==='TalentLevelCfg'),[]);assert.equal(JSON.stringify(d),before);
 // The runtime groups branches by Level, independently of their array position.
 d.A.data.TalentLevelCfg=legacy.flatMap(row=>[row,...optional.filter(branch=>branch.Level===row.Level&&legacy.find(center=>center.Level===row.Level)===row)]);
 assert.deepStrictEqual(Schema.validate(d).filter(i=>i.path[0]==='TalentLevelCfg'),[]);assert.deepStrictEqual(d.A.data.TalentLevelCfg.filter(row=>!row.OptionalBranch),legacy);
});

test('hero style branch validation rejects unsupported metadata while retaining common talent checks',()=>{
 const mutations=[['ID',5,/independent range/],['ID',10001,/unique/],['OptionalBranch',false,/remain optional/],['HeroStyle','missing-style',/weapon style/],['HeroStat','armor',/style bonus/],['Level',999,/existing progression/],['Level',3.5,/existing progression/],['BranchColumn',0,/left or right/],['EffectNumber',[.05,.1],/one bonus/],['GoldCost',-1,/zero or greater/],['kindID',999,/Talent effect does not exist/]];
 for(const [key,value,message]of mutations){const d=fixture(),row=d.A.data.TalentLevelCfg.find(row=>row.ID===10002);row[key]=value;const before=JSON.stringify(d),issues=Schema.validate(d).filter(i=>i.path[0]==='TalentLevelCfg');assert(issues.some(i=>message.test(i.message)),key+': '+issues.map(i=>i.message).join('; '));assert.equal(JSON.stringify(d),before);}
 const legacy=fixture();Object.assign(legacy.A.data.TalentLevelCfg[0],{OptionalBranch:true,HeroStyle:'fighter',HeroStat:'damage',BranchColumn:-1});assert(Schema.validate(legacy).some(i=>i.path[0]==='TalentLevelCfg'&&/independent range/.test(i.message)),'optional metadata cannot bypass legacy identifier protection');
});
test('percentage preview renders the existing parameter and localization together',()=>{const d=fixture(),p=d.A.data.BuffCfg.find(x=>x.ID===50053);p.Pamer[0]=.15;assert(Schema.formatEffect(p,d.catalog.data,'en').includes('15%'));assert.strictEqual(Schema.dataDescriptor({table:'SoldierCfg',id:90009},0).percent,true);});
test('translation edits preserve numbered parameter placeholders',()=>{const d=fixture(),p=d.A.data.BuffCfg[1],key=Schema.token(p.Describe);d.catalog.data.entries[key].en='No values';assert(introduced(d).some(i=>/placeholders/.test(i.message)));});
test('global settings preserve their existing string storage type',()=>{const d=fixture();d.A.data.ParameterCfg['60018'].Value=.6;assert(introduced(d).some(i=>/string storage/.test(i.message)));d.A.data.ParameterCfg['60018'].Value='0.6';assert.deepStrictEqual(introduced(d),[]);});
test('optional build timing and scoped attack overrides validate without defaults',()=>{const d=fixture();d.overrides.data.parameters.buildStandTime=1.2;d.overrides.data.timings['enemy:90001:default']={attack:.25};assert.deepStrictEqual(introduced(d),[]);d.overrides.data.parameters.buildStandTime=0;d.overrides.data.timings['enemy:90001:default'].attack=11;assert(introduced(d).some(i=>/0.001/.test(i.message)));assert(introduced(d).some(i=>/10 seconds/.test(i.message)));});
test('authored attack defaults validate independently from custom timings',()=>{const d=fixture();d.overrides.data.timingDefaults=require('../lib/attack-timing-defaults').collect(root,require('./fixtures/legacy-units')(root,d));assert.deepStrictEqual(introduced(d),[]);d.overrides.data.timings['enemy:90001:default']={attack:0};assert.deepStrictEqual(introduced(d),[]);d.overrides.data.timingDefaults['enemy:90001:default'].attack=-1;assert(introduced(d).some(i=>i.path[0]==='timingDefaults'&&/10 seconds/.test(i.message)));});
test('timing defaults must be a table of bounded numeric markers',()=>{const d=fixture();for(const bad of [null,[],5]){d.overrides.data.timingDefaults=bad;assert(introduced(d).some(i=>/unit timing table/.test(i.message)));}d.overrides.data.timingDefaults={'enemy:90001:default':{attack:NaN}};assert(introduced(d).some(i=>/10 seconds/.test(i.message)));});
test('disabling the entire available perk pool is rejected',()=>{const d=fixture();d.A.data.BuffCfg.forEach(p=>d.overrides.data.perks[p.ID]={enabled:false});const errors=introduced(d);assert(errors.some(i=>/at least three/.test(i.message)));assert(errors.some(i=>/guaranteed/.test(i.message)));});
test('unused targeting metadata is read-only rather than a nonfunctional editor control',()=>{assert.strictEqual(Schema.descriptor('AttackPriority').readOnly,true);assert(/does not read/.test(Schema.descriptor('AttackPriority').help));});
test('stage wave removal validates dependent equipment unlocks',()=>{const d=fixture();d.A.data.LevelCfg[0].WaveCfg.pop();const issues=Schema.validate(d,[{doc:'A',path:['LevelCfg',0,'WaveCfg']}]);assert(issues.some(i=>i.severity==='error'&&/Equipment unlock/.test(i.message)));});
test('composite shared settings reject negative, malformed and unknown reward values without changing authored sentinel locks',()=>{const good=fixture();assert(!Schema.validate(good).some(i=>i.path[0]==='ParameterCfg'));for(const [id,value]of [['60005','-5,15'],['60005','5,NaN'],['60005','5'],['60009','999999,10'],['60009','2002,-1'],['60008','-2,0'],['60008','1,-1']]){const d=fixture();d.A.data.ParameterCfg[id].Value=value;assert(Schema.validate(d).some(i=>i.path[0]==='ParameterCfg'&&i.path[1]===id&&i.severity==='error'),id+':'+value);}const legacy=fixture();legacy.A.data.ParameterCfg['60005'].Value='-5,15';const issues=Schema.validate(legacy,[{doc:'A',path:['ParameterCfg','60018','Value']}]).filter(i=>i.path[0]==='ParameterCfg'&&i.path[1]==='60005');assert(issues.length&&issues.every(i=>i.severity==='warning'));});
test('saved attack playback validates per side and form without seeding any defaults',()=>{
 const d=fixture(),defaults=JSON.stringify(d.overrides.data.timingDefaults);d.overrides.data.animationSpeeds={'enemy:90001:default':1.2,'ally:90004:default':.8,'hero:hero:default':1.1,'enemy:90011:2':1.5};
 assert.deepStrictEqual(introduced(d),[]);assert.equal(JSON.stringify(d.overrides.data.timingDefaults),defaults);
 for(const [key,value]of [['enemy:90001:default',0],['enemy:90001:default',4.1],['enemy:90001:default','1.2'],['ally:90012:default',1],['enemy:90011:default',1],['hero:wrong:default',1]]){const bad=fixture();bad.overrides.data.animationSpeeds={[key]:value};assert(introduced(bad).some(x=>x.path[0]==='animationSpeeds'));}
});
console.log(passed+' editor schema tests passed.');
