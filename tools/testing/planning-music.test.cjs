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
  $z1KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getLevelCfgById:id=>levels[id-1]})}},
  $z1AudioMgr:{AudioMgr:{getInstance:()=>({playMusic:(id,channel,...options)=>calls.push({id,channel,options})})}}
 });return {calls,method};
}
test('all authored desert stages select Sands of the Keep on initial planning entry',()=>{
 const h=fixture();
 for(const level of levels){
  h.method.call({levelId:level.Level});
  const call=h.calls.at(-1),asset=exportsConfig.KinghtFallAudioCF[call.id];
  assert.equal(asset.path,[3,7,11,15,19].includes(level.Level)?'Sands_of_the_Keep':'Skybound_Horns','stage '+level.Level);
  assert.equal(call.channel,exportsConfig.KinghtFallParameter.BGMusic);
  assert.equal(call.options.length,0,'retain AudioMgr looping and player Music volume defaults');
  assert.ok(fs.existsSync(path.join(root,'assets',asset.bundle,asset.path+'.mp3')));
 }
});
test('returning to planning follows the loaded map configuration',()=>{
 const h=fixture(),ui={levelId:1,ctrGame:{gameData:{levelCfg:{prefab:'Map03'}}}};
 h.method.call(ui);assert.equal(exportsConfig.KinghtFallAudioCF[h.calls.at(-1).id].path,'Sands_of_the_Keep');
 ui.ctrGame.gameData.levelCfg={prefab:'Map02'};h.method.call(ui);
 assert.equal(exportsConfig.KinghtFallAudioCF[h.calls.at(-1).id].path,'Skybound_Horns');
 assert.equal(exportsConfig.KinghtFallAudioCF[exportsConfig.KinghtFallAudioId.fight_bgm].path,'fight_bgm');
 assert.equal(exportsConfig.KinghtFallAudioCF[exportsConfig.KinghtFallAudioId.menu_bgm].path,'menu_bgm');
});
