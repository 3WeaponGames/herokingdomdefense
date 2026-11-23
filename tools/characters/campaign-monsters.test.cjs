'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),Migration=require('./publish-campaign-monsters.cjs'),Definition=require('./campaign-monster-placements.json'),Baseline=require('./fixtures/campaign-monster-balance.json'),Copy=require('./monster-guide-copy.json'),Fighting=require('../../packages/game-data-editor/lib/fighting-profiles');
const cfg=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),catalog=require('../../assets/resources/localization/catalog.json'),read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const retired=new Set(Definition.variants.map(unit=>unit.id)),withoutGuide=row=>{const copy=structuredClone(row);delete copy.Guide;return copy;};
// Saved stage overrides are authoritative. Only a real, matching authored
// layout exempts its queues from the historical appearance-migration plan.
// Every untouched stage still retains its exact approved packet assertions.
function projectStage(stage,variant){
 if(stage.StageLayoutId){
  const id=variant+'-'+stage.Level,file='authoring/worlds/stages/'+id+'.json';assert.equal(stage.StageLayoutId,id);assert.equal(stage.prefab,'Generated/Stages/'+id);assert(fs.existsSync(path.join(root,file)),'Missing authored override '+id);
  const saved=read(file),queues=waves=>waves.map(wave=>({Wave:wave.Wave,RefreshSoldierKind:wave.RefreshSoldierKind,SpawnTimeline:wave.SpawnTimeline}));
  assert.equal(saved.id,id);assert.equal(saved.variant,variant);assert.equal(saved.level,stage.Level);assert.equal(saved.config.Level,stage.Level);assert.deepEqual(queues(stage.WaveCfg),queues(saved.config.WaveCfg),id+' saved override queues');return;
 }
 const projected=structuredClone(stage);for(const wave of projected.WaveCfg)delete wave.SpawnTimeline;
 const remap=line=>line.replace(/(\d+)(?=,)/g,id=>String(cfg.GameTools.unitProfiles.aliases[id]||id));
 for(const row of Definition.plans[variant].filter(row=>row.stage===stage.Level)){const wave=projected.WaveCfg[row.wave-1];assert.equal(wave.RefreshSoldierKind[row.lineIndex],remap(row.proposed),variant+' stage '+stage.Level+' wave '+row.wave+' exact canonical queue');wave.RefreshSoldierKind[row.lineIndex]=row.original;}return projected;}
test('stage thirteen retains its authored Map07 fire environment',()=>{
  for(const [key,file]of Object.entries(Migration.CONFIGS)){
    const stage=read(file).LevelCfg.find(row=>row.Level===13);assert(stage,key+' stage thirteen');assert.equal(stage.EnvironmentMapId,'Map07',key);assert.equal(stage.EnvironmentBiome,'fire',key);
  }
});
test('all twenty-four stage definitions retain approved queues or matching explicitly authored overrides',()=>{
  const Profiles=require('../../assets/_script/EnemyStageProfiles'),sourceFor=id=>{const entry=cfg.GameTools.unitProfiles.entries[id];return entry?entry.baseId:Number(id);};
  for(const appearance of Definition.variants){const source=cfg.SoldierCfg[appearance.AppearanceSourceUnit];assert(source&&source.MonsterSource,'Historical campaign source model '+appearance.AppearanceSourceUnit+' must remain available');assert(fs.existsSync(path.join(root,'assets/KinghtFallEnemy',source.prefab+'.prefab')),'Historical campaign source prefab '+appearance.AppearanceSourceUnit+' must remain available');}
  for(const [key,file]of Object.entries(Migration.CONFIGS)){
    const stages=read(file).LevelCfg;assert.equal(stages.length,24);const used=new Set(),authored=new Set(stages.filter(stage=>stage.StageLayoutId).map(stage=>stage.Level));
    stages.forEach((stage,index)=>{assert.equal(stage.Level,index+1);if(authored.has(stage.Level))assert(Array.isArray(stage.WaveCfg)&&stage.WaveCfg.length);else assert.equal(stage.WaveCfg.length,10);projectStage(stage,key);const units=Profiles.records(stage,cfg.SoldierCfg,cfg.GameTools);for(const wave of stage.WaveCfg){
      const ids=(wave.SpawnTimeline||[]).map(entry=>entry.unitId);for(const line of wave.RefreshSoldierKind)for(const token of line.split('#')[1].split(';')){const id=Number(token.split(',')[0]);if(id!==-1)ids.push(id);}
      for(const id of ids){const unit=units[id];assert(unit,key+' stage '+stage.Level+' references a missing current enemy '+id);const source=sourceFor(unit.ProfileBaseID||id);if(cfg.SoldierCfg[source]&&cfg.SoldierCfg[source].MonsterSource)used.add(source);}
    }});
    if(!authored.size)assert.equal(used.size,100,key+' must feature the complete unchanged source roster');
    // Custom waves may deliberately replace historical appearances. Every
    // planned appearance in the remaining untouched stages must still occur.
    for(const row of Definition.plans[key].filter(row=>!authored.has(row.stage)))for(const token of row.proposed.split('#')[1].split(';')){const id=Number(token.split(',')[0]);if(id!==-1){const canonical=cfg.GameTools.unitProfiles.aliases[id]||id,source=sourceFor(canonical);if(cfg.SoldierCfg[source]&&cfg.SoldierCfg[source].MonsterSource)assert(used.has(source),key+' missing an unchanged planned source '+source);}}
  }
});
test('legacy templates and canonical enemies use their approved fighting balance',()=>{
  // Project the later global balance out of the original template hashes.
  for(const [id,digest]of Object.entries(Baseline.unitHashes))if(!retired.has(Number(id))&&!Fighting.familyFor(cfg.GameTools,id)){const historical=withoutGuide(cfg.SoldierCfg[id]);historical.Health/=1.2;historical.AttackDamage*=2;assert.equal(hash(historical),digest,'Compatibility combat record '+id);}
  for(const family of Object.values(cfg.GameTools.unitProfiles.families))for(const [role,id]of Object.entries(family.profiles))for(const [index,field]of Fighting.FIELDS.entries())if(family.baseline[field]!==undefined)assert(Math.abs(cfg.SoldierCfg[id][field]-family.baseline[field]*Fighting.factors(cfg.GameTools,role)[index])<1e-6,id+'/'+field);
  // Icons and global incoming-damage authoring were approved after this
  // migration. Fighting-type-damage tests cover the latter independently.
  const gameplayEntry=(table,entry)=>{const copy=structuredClone(entry);if(table==='unitTypes'){delete copy.icon;delete copy.damageTaken;}return copy;};
  for(const [table,value]of Object.entries(Baseline.settings)){if(!value||typeof value!=='object'){assert.deepEqual(cfg.GameTools[table],value);continue;}for(const [key,entry]of Object.entries(value)){if(retired.has(Number(/^enemy:(\d+):/.exec(key)?.[1]))||table==='unitTypeAssignments'&&/^enemy:9001[12]:/.test(key))continue;assert.deepEqual(gameplayEntry(table,cfg.GameTools[table][key]),gameplayEntry(table,entry),table+'/'+key);}}
});

test('rerunning the migration preserves later authored unit-type icons and unknown fields without writes',t=>{
  const temporary=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'hkd-campaign-authored-icons-'));
  t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  const before=new Map();
  for(const file of [...Object.values(Migration.CONFIGS),'assets/resources/localization/catalog.json']){
    const bytes=fs.readFileSync(path.join(root,file));
    const target=path.join(temporary,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);before.set(file,bytes);
  }
  const file=Migration.CONFIGS.A,target=path.join(temporary,file),authored=read(file);
  authored.GameTools.unitTypes.fighter.icon='@icon/custom/fighter';
  authored.GameTools.unitTypes.fighter.futurePresentation={preserved:true};
  before.set(file,Buffer.from(JSON.stringify(authored)));fs.writeFileSync(target,before.get(file));
  const plan=Migration.plan(temporary,Copy);
  assert.equal(plan.files.size,0,'A completed migration must not restore historical icons or normalize later authoring');
  for(const [file,bytes]of before)assert.deepEqual(fs.readFileSync(path.join(temporary,file)),bytes,file);
});
test('retired Campaign IDs resolve to the regular fighting profiles with the same artwork',()=>{
  for(const appearance of Definition.variants){
    const id=appearance.id,source=cfg.SoldierCfg[appearance.AppearanceSourceUnit];
    const profile=cfg.SoldierCfg[Fighting.canonicalId(cfg.GameTools,id)];
    assert.equal(cfg.SoldierCfg[id],undefined);
    assert.equal(source.MonsterSource,appearance.source);
    assert.equal(profile.prefab,source.prefab);
    assert.equal(profile.CampaignBaseUnit,undefined);
    assert.equal(Fighting.familyFor(cfg.GameTools,id),Fighting.familyFor(cfg.GameTools,source.ID));
    for(const table of ['unitTypeAssignments','visuals','timingDefaults','timings','animationSpeeds'])assert.equal(cfg.GameTools[table]?.['enemy:'+id+':default'],undefined,table+'/'+id);
  }
});
test('every enemy guide has localized true attack copy, unique source lore and resolvable names without changing stats',()=>{
  assert.equal(Object.keys(Copy.lore).length,100);assert.equal(new Set(Object.values(Copy.lore).map(v=>v.en)).size,100);
  for(const unit of Object.values(cfg.SoldierCfg))for(const field of ['description','lore']){const token=unit.Guide[field],key=/^\[\[loc:([^\]]+)\]\]$/.exec(token);assert(key,unit.ID+'/'+field);const entry=catalog.entries[key[1]];assert(entry.en.trim()&&entry.zh.trim(),unit.ID+'/'+field);}
  for(const [key,value]of Object.entries(Copy.ui))assert.deepEqual({en:catalog.entries[key].en,zh:catalog.entries[key].zh},value);
});
test('reopening or rerunning the explicit migration performs no writes and never reapplies waves or balance presets',()=>{
  const plan=Migration.plan(root,Copy);assert.equal(plan.files.size,0);assert.equal(plan.report.variants.length,0);assert.equal(plan.report.guideRows,0);
});
