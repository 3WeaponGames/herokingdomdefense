'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const Art=require('../../assets/_script/StageLoadingArt'),Lobby=require('../../assets/_script/LobbyStageArt'),Music=require('../../assets/_script/BattleMusic');
const biomes=['forest','forest','desert','desert','deep-forest','deep-forest','snow','snow','autumn','autumn','ice','ice','fire','fire','lava','lava','forest','desert','deep-forest','snow','autumn','ice','fire','lava'];

test('campaign: all configurations expose 24 named stages in the authored biome order',()=>{
 const catalog=read('assets/resources/localization/catalog.json'),names=new Set();
 for(const folder of ['KinghtFallConfig','KinghtFallConfigB','KinghtFallConfigD','configs']){
  const stages=read('assets/'+folder+'/GameJsonCfg.json').LevelCfg;
  assert.equal(stages.length,24,folder);
  stages.forEach((stage,i)=>{
   assert.equal(stage.Level,i+1);assert.equal(stage.EnvironmentBiome,biomes[i]);assert.equal(stage.EnvironmentBiomeOverride,true);
   assert.equal(stage.Name,'[[loc:data.levelcfg.'+(i+1)+'.name]]');
   const entry=catalog.entries['data.levelcfg.'+(i+1)+'.name'];assert(entry.en.startsWith((i+1)+'. '));assert(entry.zh);
   names.add(entry.en.replace(/^\d+\. /,''));
   assert.equal(Art.resource(stage),'stage-loading/'+biomes[i]);assert.equal(Music.biome(stage),biomes[i]);
   assert(fs.existsSync(path.join(root,'assets/KinghtFallIconMap',stage.prefab+'.prefab')),'Missing runtime stage '+stage.Level);
  });
 }
 assert.equal(names.size,24);
});

test('campaign: stages 21–24 reuse shared maps and retain independent mode layouts',()=>{
 const sharedMaps=['map-original-01-rebuilt','Map02','Map03','Map04'],maps=new Set(),prefabs=new Set();
 for(const variant of ['A','B','D']){
  const stages=read('assets/KinghtFallConfig'+(variant==='A'?'':variant)+'/GameJsonCfg.json').LevelCfg;
  for(const cfg of stages.slice(20)){
   const stage=read('authoring/worlds/stages/'+variant+'-'+cfg.Level+'.json'),map=read('authoring/worlds/maps/'+cfg.EnvironmentMapId+'.json');
   assert.equal(cfg.EnvironmentMapId,sharedMaps[cfg.Level-21]);assert.equal(stage.mapId,map.id);
   assert.equal(cfg.Map,'Generated/Maps/'+map.id+'/thumbnail');
   assert.deepEqual(stage.config,cfg);assert.equal(stage.level,cfg.Level);assert.equal(stage.id,variant+'-'+cfg.Level);
   for(const wave of cfg.WaveCfg)if(Object.hasOwn(wave,'id'))assert.equal(wave.id,cfg.Level);
   assert.equal(Lobby.resource(cfg),'Thumbnails/biome-'+cfg.EnvironmentBiome);
   const meta=read('assets/KinghtFallIconMap/'+cfg.prefab+'.prefab.meta');assert(!prefabs.has(meta.uuid));prefabs.add(meta.uuid);maps.add(map.id);
   assert(fs.existsSync(path.join(root,'assets/KinghtFallIconMap',cfg.Map+'.png')),'Missing map thumbnail');
  }
 }
 assert.equal(maps.size,4);assert.equal(prefabs.size,12);
});
