'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Art=require('../../assets/_script/LobbyStageArt'),PNG=require('../../packages/hkd-characters/lib/png-atlas');
const root=path.resolve(__dirname,'../..'),biomes=['forest','deep-forest','autumn','desert','snow','ice','fire','lava'];
const legacy={Map01:'forest',Map02:'deep-forest',Map03:'desert',Map04:'snow',Map07:'fire'};
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));

test('the eight biome thumbnails are distinct portable transparent sprites with complete Creator metadata',()=>{
 const uuids=new Set(),resources=new Set();
 for(const biome of biomes){
  const resource=Art.resource({EnvironmentBiome:biome}),file='assets/KinghtFallIconMap/'+resource+'.png',meta=read(file+'.meta');
  assert(!resources.has(resource));resources.add(resource);
  const image=PNG.decode(fs.readFileSync(path.join(root,file))),frame=meta.subMetas[path.basename(resource)];
  assert(image.width<=2048&&image.height<=2048);assert.equal(meta.width,image.width);assert.equal(meta.height,image.height);
  assert.equal(meta.importer,'texture');assert.equal(meta.type,'sprite');assert.equal(meta.packable,false);
  assert.equal(frame.importer,'sprite-frame');assert.equal(frame.rawTextureUuid,meta.uuid);assert.equal(frame.trimType,'none');
  assert.equal(frame.width,image.width);assert.equal(frame.height,image.height);assert.equal(frame.rawWidth,image.width);assert.equal(frame.rawHeight,image.height);
  for(const uuid of [meta.uuid,frame.uuid]){assert(!uuids.has(uuid),'sprite identities must be independent');uuids.add(uuid);}
  const alpha=(x,y)=>image.rgba[(y*image.width+x)*4+3];
  for(const [x,y]of [[0,0],[image.width-1,0],[0,image.height-1],[image.width-1,image.height-1]])assert.equal(alpha(x,y),0,biome+' background must stay transparent');
  assert(alpha(Math.floor(image.width/2),Math.floor(image.height*.65))>=250,biome+' has an opaque staging area');
 }
 assert.equal(resources.size,8);
});

test('authored biomes take precedence and every legacy or generated map resolves without rewriting its stage',()=>{
 for(const biome of biomes){
  const stage={EnvironmentBiome:biome,EnvironmentMapId:'Map04',prefab:'Map03',Map:'old-preview',Future:{keep:1}},before=JSON.stringify(stage);
  assert.equal(Art.biome(stage),biome);assert.equal(Art.resource(stage),'Thumbnails/biome-'+biome);assert.equal(JSON.stringify(stage),before);
  assert.equal(Art.resource({EnvironmentMapId:'map-'+biome+'-terrain'}),'Thumbnails/biome-'+biome);
 }
 for(const [prefab,biome]of Object.entries(legacy))for(const stage of [{prefab},{EnvironmentMapId:prefab,prefab:'Map03'}])assert.equal(Art.resource(stage),'Thumbnails/biome-'+biome);
 for(const [number,biome]of ['forest','deep-forest','desert','snow'].entries())assert.equal(Art.resource({EnvironmentMapId:'map-original-0'+(number+1)+'-rebuilt',prefab:'Generated/Stages/A-'+(number+1)}),'Thumbnails/biome-'+biome);
 for(const biome of ['forest','autumn','ice'])assert.equal(Art.resource({EnvironmentMapId:'map-bridge-oblique-v2-'+biome}),'Thumbnails/biome-'+biome);
 for(const value of ['constructor','__proto__','toString',null,42]){
  assert.equal(Art.resource({EnvironmentBiome:value,EnvironmentMapId:value,prefab:'Map03'}),'Thumbnails/biome-desert');
  assert.equal(Art.resource({EnvironmentMapId:value,prefab:value,Map:'third-party-map-preview'}),'third-party-map-preview');
 }
 assert.equal(Art.resource(null),'Thumbnails/biome-forest');
});

test('explicit custom stage thumbnails retain priority over the automatic biome artwork',()=>{
 for(const biome of biomes){
  const stage={EnvironmentBiome:biome,StageThumbnail:'Thumbnails/my-custom-stage',StageFaceUnit:92039,Map:'old-preview'},before=JSON.stringify(stage);
  assert.equal(Art.resource(stage),stage.StageThumbnail);assert.equal(JSON.stringify(stage),before);
 }
});

function fixture(stages){
 const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallHomeBattleCtrl.js'),'utf8').replace(/\r\n/g,'\n'),start=source.indexOf('_ctor.prototype.initMapView = function ');
 const jobs=[],label={},spine={setAnimation(){}},user={getMaxStage:()=>99,getMaxOrder:()=>1,getStageInfo:()=>0,getStageReward:()=>false};
 const Sprite=function(){};Sprite.SizeMode={CUSTOM:0,TRIMMED:1};
 const cc={Label:function(){},Sprite,isValid:value=>!!value&&!value.destroyed};
 const icon={width:394,height:341,setContentSize(w,h){this.width=w;this.height=h;},getComponent:()=>sprite},sprite={sizeMode:Sprite.SizeMode.TRIMMED};let frame=null;
 Object.defineProperty(sprite,'spriteFrame',{get:()=>frame,set(value){frame=value;if(sprite.sizeMode!==Sprite.SizeMode.CUSTOM){const size=value.getOriginalSize();icon.width=size.width;icon.height=size.height;}}});
 const init=vm.runInNewContext('('+source.slice(source.indexOf('function ',start),source.indexOf('\n  };',start)+4)+')',{
  require(name){if(name==='LobbyStageArt')return Art;if(name==='LobbyBackground')return{showForStage(){}};throw Error('Unexpected dependency '+name);},cc,sp:{Skeleton:function(){}},
  $z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}},
  $z1KinghtFallTextConfig:{KinghtFallTextConfig:{}},$z1KinghtFallConfig:{KinghtFallBundelName:{IconMap:'maps'}},
  $z1KinghtFallEnum:{KinghtFallEnumLevelChalType:{Pass:1,NoDie:2,NoAttack:3}},$z1Utils:{Utils:{StringFormat:()=>''}}
 });
 const home={node:{},cfgList:stages.map((s,i)=>Object.assign({Level:i+1,WaveCfg:[],Challenge:[]},s)),T:x=>x,
  _lobby:{stagePreview:{getChildByName:()=>icon}},ndLevelInfo:{getChildByName:()=>({getComponent:()=>label})},
  ndBoxShow:{getChildByName:()=>({getChildByName:name=>({getComponent:()=>name==='spAni'?spine:label})})},
  loadSpriteFrame(bundle,resource,done){jobs.push({bundle,resource,done});},loadStageMonster(stage){this.monsterStage=stage;},hideBoxReward(){}
 };
 function finish(job,width=1351,height=1164){const value={resource:job.resource,getOriginalSize:()=>({width,height})};job.done(value);return value;}
 return{home,jobs,icon,sprite,finish,select(level){home.selectStage=level;init.call(home);}};
}

test('real lobby refresh selects biome art for every A/B/D stage and keeps high-resolution images inside the original preview',()=>{
 for(const variant of ['','B','D']){
  const config=read('assets/KinghtFallConfig'+variant+'/GameJsonCfg.json'),before=JSON.stringify(config),f=fixture(config.LevelCfg);
  for(const stage of config.LevelCfg.concat(config.LevelCfg.slice().reverse())){
   f.select(stage.Level);const job=f.jobs.shift(),biome=stage.EnvironmentBiome||legacy[stage.EnvironmentMapId]||legacy[stage.prefab];
   assert(biome);assert.equal(job.bundle,'maps');assert.equal(job.resource,stage.StageThumbnail||'Thumbnails/biome-'+biome);
   f.finish(job);assert.equal(f.sprite.sizeMode,0);assert(f.icon.width<=394+.001&&f.icon.height<=341+.001);
   assert(Math.abs(f.icon.width/f.icon.height-1351/1164)<1e-10);assert.equal(f.home.monsterStage.Level,stage.Level);
  }
  assert.equal(JSON.stringify(config),before,'displaying stage art must not change gameplay configuration');
 }
});

test('a custom thumbnail changes aspect ratio without shrinking subsequent biome previews',()=>{
 const f=fixture([{EnvironmentBiome:'forest'},{EnvironmentBiome:'ice',StageThumbnail:'Thumbnails/wide-custom',StageFaceUnit:92039}]);
 f.select(1);f.finish(f.jobs.shift());const initial={width:f.icon.width,height:f.icon.height};
 f.select(2);const custom=f.jobs.shift();assert.equal(custom.resource,'Thumbnails/wide-custom');f.finish(custom,1024,256);
 assert.equal(f.icon.width,394);assert.equal(f.icon.height,98.5);assert.equal(f.home.monsterStage.StageFaceUnit,92039);
 f.select(1);f.finish(f.jobs.shift());assert.equal(f.icon.width,initial.width);assert.equal(f.icon.height,initial.height);
});

test('late image loads cannot replace a newer selection, including returning to the same stage',()=>{
 const f=fixture([{EnvironmentBiome:'forest'},{EnvironmentBiome:'ice'}]);
 f.select(1);f.select(2);f.home.cfgList[0].StageThumbnail='Thumbnails/new-custom';f.select(1);
 const [oldFirst,oldSecond,current]=f.jobs,expected=f.finish(current);
 f.finish(oldSecond);f.finish(oldFirst);assert.equal(f.sprite.spriteFrame,expected);
});

test('late image loads leave destroyed controllers and preview nodes alone',()=>{
 for(const target of ['home','icon']){
  const f=fixture([{EnvironmentBiome:'forest'}]);f.select(1);f[target].destroyed=true;
  assert.doesNotThrow(()=>f.finish(f.jobs.shift()));assert.equal(f.sprite.spriteFrame,null);
 }
});
