'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const root=path.resolve(__dirname,'../..'),levels=require('../../assets/KinghtFallConfig/GameJsonCfg.json').LevelCfg;
const exportsConfig={};
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallConfig.js'),'utf8'),{exports:exportsConfig,require:()=>({OrderLayer:{}})});
const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIGame.js'),'utf8').replace(/\r\n/g,'\n');
const start=source.indexOf('_ctor.prototype.playPlanningMusic = function'),end=source.indexOf('\n  };',start);
function fixture(){
 const calls=[];
 const method=vm.runInNewContext('('+source.slice(source.indexOf('function',start),end+4)+')',{
  $z1KinghtFallConfig:exportsConfig,
  BattleMusic:require('../../assets/_script/BattleMusic'),
  $z1KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getLevelCfgById:id=>levels[id-1]})}},
  $z1AudioMgr:{AudioMgr:{getInstance:()=>({playMusic:(id,channel,...options)=>calls.push({id,channel,options})})}}
 });return {calls,method};
}
test('all authored stages select their biome theme on initial planning entry',()=>{
 const h=fixture();
 for(const level of levels){
  h.method.call({levelId:level.Level});
  const call=h.calls.at(-1),asset=exportsConfig.KinghtFallAudioCF[call.id];
  const biome=level.EnvironmentBiome||({Map01:'forest',Map02:'deep-forest',Map03:'desert',Map07:'fire'})[level.EnvironmentMapId||level.prefab]||'forest';
  assert.equal(asset.path,'music/planning-'+biome,'stage '+level.Level);
  assert.equal(call.channel,exportsConfig.KinghtFallParameter.BGMusic);
  assert.equal(call.options.length,0,'retain AudioMgr looping and player Music volume defaults');
  assert.ok(fs.existsSync(path.join(root,'assets',asset.bundle,asset.path+'.ogg')));
 }
});
test('returning to planning follows the loaded map configuration',()=>{
 const h=fixture(),ui={levelId:1,ctrGame:{gameData:{levelCfg:{prefab:'Map03'}}}};
 h.method.call(ui);assert.equal(exportsConfig.KinghtFallAudioCF[h.calls.at(-1).id].path,'music/planning-desert');
 ui.ctrGame.gameData.levelCfg={prefab:'Map02'};h.method.call(ui);
 assert.equal(exportsConfig.KinghtFallAudioCF[h.calls.at(-1).id].path,'music/planning-deep-forest');
 assert.equal(exportsConfig.KinghtFallAudioCF[exportsConfig.KinghtFallAudioId.fight_bgm].path,'music/battle-1');
 assert.equal(exportsConfig.KinghtFallAudioCF[exportsConfig.KinghtFallAudioId.menu_bgm].path,'music/menu');
});

test('snow planning music follows explicit biomes and legacy maps without replacing battle music',()=>{
 const h=fixture();
 for(const [config,expected]of [
  [{prefab:'Generated/Stages/A-20',EnvironmentBiome:'snow'},'music/planning-snow'],
  [{prefab:'Generated/Stages/custom',EnvironmentMapId:'snow'},'music/planning-snow'],
  [{prefab:'Generated/Stages/custom',EnvironmentBiome:'snow'},'music/planning-snow'],
  [{prefab:'Map03',EnvironmentBiome:'snow'},'music/planning-snow'],
  [{prefab:'Map07',EnvironmentBiome:'ice'},'music/planning-ice'],
  [{prefab:'Map07',EnvironmentBiome:'forest'},'music/planning-forest'],
  [{prefab:'Map07',EnvironmentBiome:'desert'},'music/planning-desert']
 ]){
  h.method.call({ctrGame:{gameData:{levelCfg:config}}});
  assert.equal(exportsConfig.KinghtFallAudioCF[h.calls.at(-1).id].path,expected,JSON.stringify(config));
 }
 const meta=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallAudio/music/planning-snow.ogg.meta'),'utf8'));
 assert.equal(meta.importer,'audio-clip');assert(meta.duration>100);
 assert.equal(exportsConfig.KinghtFallAudioCF[exportsConfig.KinghtFallAudioId.fight_bgm].path,'music/battle-1');
});
