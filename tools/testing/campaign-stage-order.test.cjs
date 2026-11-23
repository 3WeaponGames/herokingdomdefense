'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const Art=require('../../assets/_script/StageLoadingArt'),Lobby=require('../../assets/_script/LobbyStageArt'),Music=require('../../assets/_script/BattleMusic');
const biomes=['forest','forest','desert','desert','deep-forest','deep-forest','snow','snow','autumn','autumn','ice','ice','fire','fire','lava','lava','forest','desert','deep-forest','snow','autumn','ice','fire','lava'];
const campaign=read('assets/KinghtFallConfig/GameJsonCfg.json');

test('campaign: the main campaign exposes 24 named stages in the authored biome order',()=>{
 const catalog=read('assets/resources/localization/catalog.json'),names=new Set();
 assert.equal(campaign.LevelCfg.length,24);
 assert(!Object.hasOwn(read('assets/configs/GameJsonCfg.json'),'LevelCfg'));
 for(const folder of ['KinghtFallConfigB','KinghtFallConfigD'])assert(!fs.existsSync(path.join(root,'assets',folder,'GameJsonCfg.json')));
 campaign.LevelCfg.forEach((stage,i)=>{
   assert.equal(stage.Level,i+1);assert.equal(stage.EnvironmentBiome,biomes[i]);assert.equal(stage.EnvironmentBiomeOverride,true);
   assert.equal(stage.Name,'[[loc:data.levelcfg.'+(i+1)+'.name]]');
   const entry=catalog.entries['data.levelcfg.'+(i+1)+'.name'];assert(entry.en.startsWith((i+1)+'. '));assert(entry.zh);
   names.add(entry.en.replace(/^\d+\. /,''));
   assert.equal(Art.resource(stage),'stage-loading/'+biomes[i]);assert.equal(Music.biome(stage),biomes[i]);
   assert(fs.existsSync(path.join(root,'assets/KinghtFallIconMap',stage.prefab+'.prefab')),'Missing runtime stage '+stage.Level);
 });
 assert.equal(names.size,24);
});

test('campaign: all stages resolve to their current maps and distinct runtime layouts',()=>{
 const prefabs=new Set();
 for(const cfg of campaign.LevelCfg){
  const id='A-'+cfg.Level,stage=read('authoring/worlds/stages/'+id+'.json');
  assert.equal(stage.mapId,cfg.EnvironmentMapId);
  assert.equal(stage.level,cfg.Level);assert.equal(stage.id,id);
  assert.equal(cfg.StageLayoutId,id);assert.equal(cfg.prefab,'Generated/Stages/'+id);
  assert.equal(Lobby.resource(cfg),cfg.StageThumbnail||'Thumbnails/biome-'+cfg.EnvironmentBiome);
  const meta=read('assets/KinghtFallIconMap/'+cfg.prefab+'.prefab.meta');assert(!prefabs.has(meta.uuid));prefabs.add(meta.uuid);
  assert(fs.existsSync(path.join(root,'assets/KinghtFallIconMap',cfg.Map+'.png')),'Missing map thumbnail for stage '+cfg.Level);
 }
 assert.equal(prefabs.size,24);
});

test('campaign: every existing experiment assignment loads the same stage table',()=>{
 const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallDataMgr.js'),'utf8');
 for(const assignment of ['A','B','C','D']){
  let finished=0,released=0;
  const loads=[],exports={},cc={JsonAsset:function JsonAsset() {}};
  const dependencies={
   PlayerMgr:{PlayerMgr:{getInstance:()=>({getAbType:()=>assignment})}},
   ResourceMgr:{ResourceMgr:{getInstance:()=>({
    loadRes(bundle,name,type,loaded){
     loads.push([bundle,name,type]);assert.equal(bundle,'KinghtFallConfig');
     loaded({json:campaign,decRef(){released++;}});
    }
   })}},
  };
  vm.runInNewContext(source,{exports,cc,require:name=>dependencies[name]});
  const manager=exports.KinghtFallDataMgr.getInstance();
  manager.preload(()=>{assert.equal(manager.data.LevelCfg,campaign.LevelCfg);finished++;});
  assert.deepEqual(loads,[['KinghtFallConfig','GameJsonCfg',cc.JsonAsset]]);
  assert.equal(finished,1);assert.equal(released,1);
 }
});
