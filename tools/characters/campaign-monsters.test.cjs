'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),Migration=require('./publish-campaign-monsters.cjs'),Definition=require('./campaign-monster-placements.json'),Baseline=require('./fixtures/campaign-monster-balance.json'),Copy=require('./monster-guide-copy.json'),Bake=require('../../packages/hkd-characters/lib/native-bake'),Units=require('../../packages/game-data-editor/lib/unit-assets');
const cfg=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),catalog=require('../../assets/resources/localization/catalog.json'),read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const aliases=Object.values(cfg.SoldierCfg).filter(row=>row.CampaignBaseUnit),withoutGuide=row=>{const copy=structuredClone(row);delete copy.Guide;return copy;};
// Later map/biome authoring has its own assertion; every wave and other stage field still uses the original balance hash.
function projectStage(stage){const projected=structuredClone(stage);delete projected.EnvironmentMapId;delete projected.EnvironmentBiome;for(const wave of projected.WaveCfg)wave.RefreshSoldierKind=wave.RefreshSoldierKind.map(line=>line.replace(/\b(92\d{3})(?=,)/g,id=>{assert(cfg.SoldierCfg[id]&&cfg.SoldierCfg[id].CampaignBaseUnit,'Unknown appearance '+id);return String(cfg.SoldierCfg[id].CampaignBaseUnit);}));return projected;}
test('stage seven retains its explicitly authored Map07 fire environment in every campaign variant',()=>{
  for(const [key,file]of Object.entries(Migration.CONFIGS)){
    const stage=read(file).LevelCfg.find(row=>row.Level===7);assert(stage,key+' stage seven');assert.equal(stage.EnvironmentMapId,'Map07',key);assert.equal(stage.EnvironmentBiome,'fire',key);
  }
});
test('all sixty stage definitions retain every wave field and exact spawn queues after projecting cosmetic IDs',()=>{
  for(const [key,file]of Object.entries(Migration.CONFIGS)){
    const stages=read(file).LevelCfg;assert.equal(stages.length,20);const used=new Set();
    stages.forEach((stage,index)=>{assert.equal(stage.WaveCfg.length,10);assert.equal(hash(projectStage(stage)),Baseline.stageHashes[key][index],key+' stage '+stage.Level+' changed difficulty/order/delays/rewards');for(const wave of stage.WaveCfg)for(const line of wave.RefreshSoldierKind)for(const token of line.split('#')[1].split(';')){const id=Number(token.split(',')[0]);const row=cfg.SoldierCfg[id];if(row&&row.AppearanceSourceUnit)used.add(row.AppearanceSourceUnit);}});
    assert.equal(used.size,100,key+' must feature the complete source roster');
  }
});
test('all legacy and source roster combat records and existing gameplay settings remain byte-value equivalent',()=>{
  for(const [id,digest]of Object.entries(Baseline.unitHashes))assert.equal(hash(withoutGuide(cfg.SoldierCfg[id])),digest,'Existing combat record '+id);
  // Unit-type icons were intentionally reauthored after this migration. Keep
  // the historical combat/settings contract without freezing that artwork.
  const gameplayEntry=(table,entry)=>{const copy=structuredClone(entry);if(table==='unitTypes')delete copy.icon;return copy;};
  for(const [table,value]of Object.entries(Baseline.settings)){if(!value||typeof value!=='object'){assert.deepEqual(cfg.GameTools[table],value);continue;}for(const [key,entry]of Object.entries(value))assert.deepEqual(gameplayEntry(table,cfg.GameTools[table][key]),gameplayEntry(table,entry),table+'/'+key);}
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
test('each campaign variant preserves every baseline combat field, counter, movement setting and gameplay clock',()=>{
  assert.equal(aliases.length,Definition.variants.length);assert.equal(aliases.length,127);
  const ignored=new Set(['ID','Name','prefab','loadIcon','Guide','CampaignBaseUnit','AppearanceSourceUnit','BehaviorTemplate']);
  for(const row of aliases){
    const base=cfg.SoldierCfg[row.CampaignBaseUnit],source=cfg.SoldierCfg[row.AppearanceSourceUnit];assert(base&&source&&source.MonsterSource);assert.equal(row.BehaviorTemplate,base.ID);assert.equal(row.loadIcon,source.loadIcon);assert(!row.MonsterSource&&!row.MonsterPack);
    const combat=unit=>Object.fromEntries(Object.entries(unit).filter(([key])=>!ignored.has(key)));assert.deepEqual(combat(row),combat(base),row.ID+' combat');
    for(const table of ['unitTypeAssignments','visuals','timingDefaults','timings','animationSpeeds'])assert.deepEqual(cfg.GameTools[table]&&cfg.GameTools[table]['enemy:'+row.ID+':default'],cfg.GameTools[table]&&cfg.GameTools[table]['enemy:'+base.ID+':default'],row.ID+'/'+table);
  }
});
test('campaign prefabs keep controller, projectile, physics and transforms while every model retains legacy attack/hit/death durations',()=>{
  const descriptions=new Map(),describe=id=>{if(!descriptions.has(id))descriptions.set(id,Units.describe(root,{type:'enemy',id,noRuntime:true}));return descriptions.get(id);};
  for(const row of aliases){
    const base=cfg.SoldierCfg[row.CampaignBaseUnit],actual=read('assets/KinghtFallEnemy/'+row.prefab+'.prefab'),expected=read('assets/KinghtFallEnemy/'+base.prefab+'.prefab');
    const oldLayer=describe(base.ID).layers[0],newLayer=describe(row.ID).layers[0];
    actual[0]._name=expected[0]._name;actual[actual[0].data.__id__]._name=expected[expected[0].data.__id__]._name;actual[actual[0].data.__id__]._id=expected[expected[0].data.__id__]._id;
    const renderer=actual.find(c=>c.__type__==='sp.Skeleton'&&c._N$skeletonData.__uuid__===newLayer.uuid),old=expected.find(c=>c.__type__==='sp.Skeleton'&&c._N$skeletonData.__uuid__===oldLayer.uuid);
    renderer._N$skeletonData=old._N$skeletonData;renderer.defaultSkin=old.defaultSkin;renderer.defaultAnimation=old.defaultAnimation;renderer._animationName=old._animationName;renderer._preCacheMode=old._preCacheMode;
    assert.deepEqual(actual,expected,row.ID+' prefab graph changed beyond the model');
    for(const clip of ['idle','move','attack','hit','die']){assert(Math.abs(Bake.duration(newLayer.json.animations[clip])-Bake.duration(oldLayer.json.animations[clip]))<1e-6,row.ID+'/'+clip);assert(!newLayer.json.animations[clip].events,'No fabricated authored reference');}
    const measured=Migration.bounds(newLayer,newLayer.json,fs.readFileSync),reference=Migration.bounds(oldLayer,oldLayer.json,fs.readFileSync);
    assert(Math.abs(measured.height-reference.height)<.0002,row.ID+' height fit');assert(Math.abs(measured.minY-reference.minY)<.0002,row.ID+' foot position');
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
