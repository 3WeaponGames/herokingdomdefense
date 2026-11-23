'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),scripts=path.join(root,'assets/_script');
const Music=require('../../assets/_script/BattleMusic'),Mix=require('../../assets/_script/AudioMixCatalog');
const biomes=['forest','deep-forest','autumn','desert','snow','ice','fire','lava'];
const ids={forest:'ready_bgm','deep-forest':'deep_forest_ready_bgm',autumn:'autumn_ready_bgm',desert:'desert_ready_bgm',snow:'snow_ready_bgm',ice:'ice_ready_bgm',fire:'fire_ready_bgm',lava:'lava_ready_bgm'};
test('each biome has a planning cue and explicit biomes override legacy or generated map names',()=>{
 for(const biome of biomes){assert.equal(Music.planning({EnvironmentBiome:biome,prefab:'Map03'}),ids[biome]);assert.equal(Music.planning({EnvironmentMapId:biome}),ids[biome]);}
 for(const [prefab,id]of Object.entries({Map01:'ready_bgm',Map02:'deep_forest_ready_bgm',Map03:'desert_ready_bgm',Map07:'fire_ready_bgm'}))assert.equal(Music.planning({prefab}),id);
 assert.equal(Music.planning({EnvironmentMapId:'unknown',prefab:'Map03'}),'desert_ready_bgm');assert.equal(Music.planning({}),'ready_bgm');
});
test('regular waves cycle all three tracks with a stage offset and stable resume or restart selection',()=>{
 for(let stage=1;stage<=6;stage++){
  const data={levelCfg:{Level:stage,WaveCfg:Array.from({length:10},()=>({SpawnTimeline:[]}))}},before=JSON.stringify(data);
  const got=[];for(let round=1;round<=6;round++){data.round=round;const cue=Music.battle(data,{});got.push(cue);assert.equal(Music.battle(data,{}),cue);}
  const regular=['fight_bgm','fight_bgm_2','fight_bgm_3'];assert.deepEqual(got,Array.from({length:6},(_,n)=>regular[(stage+n-1)%3]));
  delete data.round;assert.equal(JSON.stringify(data),before);
 }
});
test('boss detection follows flags, templates, shared variants and stage-local Custom profiles',()=>{
 const config={SoldierCfg:{40:{BehaviorTemplate:90010},41:{CampaignBaseUnit:90012},42:{IsBoss:true},43:{Boss:'1'},44:{Boss:'false'},45:{ProfileBaseID:40}},GameTools:{unitProfiles:{entries:{50:{baseId:45}},bossForms:{51:{source:90011}},}}},level={EnemyProfiles:{1000000000:{baseId:50}}};
 for(const id of [90010,90011,90012,40,41,42,43,45,50,51,1000000000])assert.equal(Music.bossUnit(id,config,level),true,String(id));
 for(const id of [-1,0,44,99])assert.equal(Music.bossUnit(id,config,level),false);
 config.SoldierCfg[60]={ProfileBaseID:61};config.SoldierCfg[61]={ProfileBaseID:60};assert.equal(Music.bossUnit(60,config,level),false);
});
test('Boss and Elite music follows saved enemy classes and profile inheritance', () => {
  const config = {
    SoldierCfg: { 40: {}, 41: {}, 42: {}, 43: {}, 44: { ProfileBaseID: 40 }, 45: { BehaviorTemplate: 40 }, 46: {} },
    GameTools: {
      enemyClasses: { 'enemy:40:default': 'elite', 'enemy:41:default': 'boss', 'enemy:46:default': 'normal' },
      unitProfiles: {
        entries: { 42: { baseId: 40 }, 43: { baseId: 45, enemyClass: 'elite' }, 46: { baseId: 40, enemyClass: 'elite' } },
        aliases: { 60: 40 }
      }
    }
  };
  const level = { EnemyProfiles: { 1000000000: { baseId: 42 } } };
  for (const unitId of [40, 41, 42, 43, 44, 60, 1000000000]) {
    assert.equal(Music.waveHasBossOrElite({ SpawnTimeline: [{ unitId, count: 1 }] }, config, level), true, String(unitId));
  }
  for (const unitId of [45, 46]) {
    assert.equal(Music.waveHasBossOrElite({ SpawnTimeline: [{ unitId, count: 1 }] }, config, level), false, String(unitId));
  }
});
test('Boss and Elite music uses live schedule entries and respects legacy lane replacements', () => {
  const config = { GameTools: { enemyClasses: { 'enemy:90001:default': 'elite' } } };
  assert.equal(Music.waveHasBossOrElite({ SpawnTimeline: [], RefreshSoldierKind: ['1#90010,1'] }, config), false);
  assert.equal(Music.waveHasBossOrElite({ SpawnTimeline: [{ unitId: 90001, count: 0 }, { unitId: -1, count: 1 }] }, config), false);
  assert.equal(Music.waveHasBossOrElite({ SpawnTimeline: [{ unitId: 90001, count: 1, startSeconds: 120 }] }, config), true);
  assert.equal(Music.waveHasBossOrElite({ RefreshSoldierKind: ['1#90010,1', '1#90002,2'] }, config), false);
  assert.equal(Music.waveHasBossOrElite({ RefreshSoldierKind: ['1#-1,5;90001,1'] }, config), true);
});
test('the last wave of the last campaign stage has priority over Boss and Elite music', () => {
  const eliteWave = { SpawnTimeline: [{ unitId: 90001, count: 1 }] };
  const bossWave = { SpawnTimeline: [{ unitId: 90010, count: 1 }] };
  const earlier = { Level: 2, WaveCfg: [{}, eliteWave] };
  const final = { Level: 20, WaveCfg: [eliteWave, bossWave] };
  const config = { LevelCfg: [earlier, final], GameTools: { enemyClasses: { 'enemy:90001:default': 'elite' } } };
  assert.equal(Music.battle({ round: 2, levelCfg: earlier }, config), 'boss_fight_bgm');
  earlier.WaveCfg[1] = bossWave;
  assert.equal(Music.battle({ round: 2, levelCfg: earlier }, config), 'boss_fight_bgm');
  earlier.WaveCfg[1] = {};
  assert.equal(Music.battle({ round: 2, levelCfg: earlier }, config), 'fight_bgm_3');
  assert.equal(Music.battle({ round: 1, levelCfg: final }, config), 'boss_fight_bgm');
  const finale = { round: 2, levelCfg: { ...final } };
  assert.equal(Music.battle(finale, config), 'final_wave_bgm');
  assert.equal(Music.battle(finale, config, true), 'final_wave_bgm');
});

test('the actual game UI selects the wave cue and preserves final-wave precedence on boss announcements',()=>{
 const source=fs.readFileSync(path.join(scripts,'KinghtFallUIGame.js'),'utf8').replace(/\r\n/g,'\n'),config={};
 vm.runInNewContext(fs.readFileSync(path.join(scripts,'KinghtFallConfig.js'),'utf8'),{exports:config,require:()=>({OrderLayer:{}})});
 const calls=[],data={round:1,levelCfg:{Level:2,WaveCfg:[{SpawnTimeline:[]},{SpawnTimeline:[{unitId:90010,count:1}]}]}},ui={ctrGame:{gameData:data}};
 const campaign={LevelCfg:[{Level:1},data.levelCfg]};
 const start=source.indexOf('_ctor.prototype.playBattleMusic = function'),end=source.indexOf('\n  };',start);
 const method=vm.runInNewContext('('+source.slice(source.indexOf('function',start),end+4)+')',{BattleMusic:Music,$z1KinghtFallConfig:config,$z1KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({data:campaign})}},$z1AudioMgr:{AudioMgr:{getInstance:()=>({playMusic:(...args)=>calls.push(args)})}}});
 method.call(ui);assert.equal(calls.at(-1)[0],config.KinghtFallAudioId.fight_bgm_2);
 method.call(ui,true);assert.equal(calls.at(-1)[0],config.KinghtFallAudioId.boss_fight_bgm);
 data.round=2;method.call(ui,true);assert.equal(calls.at(-1)[0],config.KinghtFallAudioId.final_wave_bgm);
 assert(calls.every(row=>row[1]===config.KinghtFallParameter.BGMusic));
});
test('all 17 music assets use continuous Ogg loops and measured music loudness stays within 0.3 LUFS',()=>{
 const rows=Object.entries(Mix.clips).filter(([,row])=>row.loopCrossfade);
 assert.equal(rows.length,17);
 for(const [uuid,row]of rows){
  const file=path.join(root,'assets',row.bundle,row.path+'.ogg'),meta=JSON.parse(fs.readFileSync(file+'.meta'));
  assert.equal(fs.readFileSync(file).toString('ascii',0,4),'OggS');assert.equal(meta.uuid,uuid);assert(meta.duration>10);
  assert(Math.abs(row.integrated+24)<.3,row.path+' loudness '+row.integrated);assert(row.peak<=-1,row.path+' peak');assert.equal(row.loopCrossfade,1.2);
 }
 const config={};vm.runInNewContext(fs.readFileSync(path.join(scripts,'KinghtFallConfig.js'),'utf8'),{exports:config,require:()=>({OrderLayer:{}})});
 for(const property of [...Object.values(ids),'fight_bgm','fight_bgm_2','fight_bgm_3','boss_fight_bgm','final_wave_bgm']){
  const cue=config.KinghtFallAudioCF[config.KinghtFallAudioId[property]];assert(cue.continuous);assert(fs.existsSync(path.join(root,'assets',cue.bundle,cue.path+'.ogg')));
 }
});
test('all sound gains are finite and peak-safe at their authored defaults, with separate preview attenuation',()=>{
 for(const row of Object.values(Mix.clips)){
  assert(Number.isFinite(row.gain)&&row.gain>0);assert(row.referenceGain>0);
  assert(row.gain*row.referenceGain<=1.000001);
  assert(row.previewGain>0&&row.previewGain<=1);
  const effective=row.integrated+20*Math.log10(row.gain*row.referenceGain);assert(effective<=-23.98&&effective>=-25,row.path);
 }
 assert.equal(Mix.gain({bundle:'unknown',path:'new'},{}),1);
});
function fixture(){
 const pending=[],states={STOPPED:3,PLAYING:1,PAUSED:2,ERROR:-1};
 class Source{constructor(){this.state=3;this.loop=false;this._volume=1;this.volumeWrites=0;this.plays=0;this.audio={getState:()=>this.state};}get volume(){return this._volume;}set volume(v){this._volume=v;this.volumeWrites++;}get isPlaying(){return this.state===1;}play(){this.state=1;this.plays++;}stop(){this.state=3;}pause(){this.state=2;}resume(){if(this.state===2)this.state=1;}}
 const prefs={music:true,effects:true},modules={AudioMixCatalog:Mix,BaseMgr:{default:function(){}},CacheUtils:{CacheUtils:{getData:()=>null,saveData(){throw Error('Unexpected preference write');},canPlayMusin:()=>prefs.music,canPlayEffect:()=>prefs.effects}},ResourceMgr:{ResourceMgr:{getInstance:()=>({loadRes(bundle,file,type,done){pending.push({bundle,file,done});}})}},LogMgr:{LogMgr:{getInstance:()=>({error(){}})}}},context={exports:{},require:id=>modules[id],cc:{AudioSource:Source,AudioClip:function(){},_Audio:{State:states},isValid:()=>true,game:{on(){}}},__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;}};
 vm.runInNewContext(fs.readFileSync(path.join(scripts,'AudioMgr.js'),'utf8'),context);
 const manager=context.exports.AudioMgr.getInstance();manager.init({a:{bundle:'KinghtFallAudio',path:'music/battle-1',continuous:true},b:{bundle:'KinghtFallAudio',path:'music/battle-boss',continuous:true}});
 return{manager,pending,prefs,finish(index){const row=pending[index],profile=Object.entries(Mix.clips).find(([,v])=>v.bundle===row.bundle&&v.path===row.file);row.done({_uuid:profile&&profile[0],duration:100});}};
}
test('music retains the old clip and mix until a replacement loads; repeated boss cues keep their cursor',()=>{
 const f=fixture(),m=f.manager;m.playMusic('a','bg');f.finish(0);const s=m.getAudioSource('bg'),old=s.volume;
 m.playMusic('b','bg');assert.equal(s.volume,old);assert.equal(s.plays,1);f.finish(1);assert.equal(s.plays,2);
 for(let i=0;i<20;i++)m.playMusic('b','bg');assert.equal(s.plays,2);assert.equal(f.pending.length,2);
 m.pauseAllMusic();m.playMusic('b','bg');assert.equal(s.isPlaying,false);m.resumeAllMusic();assert.equal(s.isPlaying,true);
 m.stopMusic('bg');assert.equal(s.isPlaying,false);m.onAudioHide();m.onAudioShow();assert.equal(s.isPlaying,false);
});
test('measured effects gain and master volume apply once and steady refreshes do not restart iOS audio',()=>{
 const f=fixture(),m=f.manager;const row=Object.values(Mix.clips).find(x=>x.path==='sfx/boss-arrival');m.effectVolume=.5;
 const s=m.getAudioSource('effect'),level=.65*.5;
 m.playSource(s,{bundle:row.bundle,path:row.path},'effect',false,false,()=>level);f.finish(0);
 assert(Math.abs(s.volume-level*row.gain)<1e-6);const writes=s.volumeWrites;
 for(let i=0;i<100;i++)m.refreshSourceVolume(s);assert.equal(s.volumeWrites,writes);assert.equal(s.plays,1);
 m.setChannelGain('effect',.5);assert(Math.abs(s.volume-level*row.gain*.5)<1e-6);assert.equal(s.plays,1);
});
