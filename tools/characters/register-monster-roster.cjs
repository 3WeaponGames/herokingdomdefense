'use strict';
// Explicit, repeatable content import. This is never called by opening a panel.
// Existing registered records and their authoring overrides are left intact.
const fs=require('node:fs'),path=require('node:path');
const Definitions=require('./monster-roster-definitions.json');
const Portrait=require('./export-head-icons.cjs');
const PNG=require('../../packages/hkd-characters/lib/png-atlas');
const Bake=require('../../packages/hkd-characters/lib/native-bake');
const Document=require('../../packages/game-data-editor/lib/json-document');
const Transaction=require('../../packages/hkd-characters/lib/asset-transaction');
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function duration(animation){let maximum=0;function visit(value){if(!value||typeof value!=='object')return;if(typeof value.time==='number')maximum=Math.max(maximum,value.time);Object.values(value).forEach(visit);}visit(animation);return maximum;}
function sourceName(source){return source.split('/')[1];}
function iconPath(source){return 'icons/monster-roster/'+source.split('/')[0]+'/'+sourceName(source).replace(/_/g,'-').toLowerCase();}
function prefabName(source){return source.replace(/^monster/,'Monster').replace('/','_');}
function chinese(source,fallback){
  const specific={Animal_Cat:'猫',Animal_Dog:'狗',Animal_Fox:'狐狸',Bear_Grizzly:'灰熊',Bear_White:'白熊',Golem_Iron:'钢铁魔像',Golem_Tree:'树人魔像',Alien_Wizard:'异星巫师',Alien_Vampire:'异星吸血鬼',Plant_Nepenthes:'猪笼草',Turtle_Alligator:'鳄龟',Bird_Eagle:'鹰',Bird_Gull:'海鸥',Bird_Owl:'猫头鹰',Bird_Parrot:'鹦鹉',Bird_Toucan:'巨嘴鸟'};
  const raw=sourceName(source);if(specific[raw])return specific[raw];const [family,variant]=raw.split('_');
  const families={Bear:'熊',Beetle:'甲虫',Bird:'鸟',Blowfish:'刺鲀',Buffalo:'野牛',Crab:'蟹',Goat:'山羊',Goby:'虾虎鱼',Jellyfish:'水母',Lizard:'蜥蜴',Octopus:'章鱼',Slime:'史莱姆',Snail:'蜗牛',Snake:'蛇',Turtle:'龟',Wolf:'狼',Ant:'蚂蚁',Bat:'蝙蝠',Bee:'蜂',Bud:'芽灵',Cactus:'仙人掌',Dragonfly:'蜻蜓',Fairy:'仙灵',Fly:'苍蝇',Ghost:'幽灵',Mantis:'螳螂',Plant:'食人花',Scorpion:'蝎子',Skeleton:'骷髅',Spider:'蜘蛛',Walker:'行走者'};
  const variants={Blood:'血色',Ice:'冰霜',Iron:'铁甲',Red:'红色',Snow:'冰雪',Angry:'愤怒',Beast:'野兽',Disco:'迪斯科',Wild:'野生',Rock:'岩石',Black:'黑色',Mushroom:'蘑菇',Helmet:'铁盔',Mad:'狂怒',Bouncy:'弹跳',Fire:'火焰',Horn:'尖角',Snail:'蜗牛',Pirate:'海盗',Ringed:'环纹',Green:'绿色',Purple:'紫色',Blue:'蓝色',Conch:'海螺',Bell:'铃铛',Tower:'高塔',Volcano:'火山',Demon:'恶魔',Gray:'灰色',Honey:'蜂蜜',Jelly:'果冻',Worker:'工',Yellow:'黄色',Cave:'洞穴',Pig:'猪鼻',Skull:'颅骨',Devil:'恶魔',Hornet:'胡蜂',Bomb:'炸弹',Flower:'花朵',Armor:'装甲',Bot:'机械',Dust:'星尘',Lamp:'灯笼',Bigeye:'大眼',Dumb:'呆呆',Glow:'荧光',Palm:'棕榈',Baby:'幼年',Mask:'面具',Spiky:'尖刺',Stone:'石头',Soldier:'士兵',Warlord:'督军',Warrior:'战士',Frozen:'冰冻',Venom:'剧毒',Box:'箱子',Candle:'蜡烛',Stump:'树桩'};
  return families[family]&&variants[variant]?variants[variant]+families[family]:fallback;
}
function plan(root,definitions=Definitions){
  root=path.resolve(root);const files=new Map(),reads=new Map(),decoded=new Map();
  const read=file=>{file=path.resolve(file);if(!reads.has(file))reads.set(file,fs.existsSync(file)?fs.readFileSync(file):null);const value=reads.get(file);if(value===null)throw Error('Required source is missing: '+file);return value;};
  const cfgFile=path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),cfgText=read(cfgFile).toString('utf8'),before=JSON.parse(cfgText),cfg=structuredClone(before);
  const catFile=path.join(root,'assets/resources/localization/catalog.json'),catText=read(catFile).toString('utf8'),oldCatalog=JSON.parse(catText),catalog=structuredClone(oldCatalog);
  const sourceUnits=new Map();for(const pack of new Set(definitions.units.map(unit=>unit.source.split('/')[0]))){const file=path.join(root,'assets/resources/unit-library',pack,'catalog.json');for(const unit of JSON.parse(read(file)).units)sourceUnits.set(unit.id,unit);}
  const bySource=new Map();for(const record of Object.values(cfg.SoldierCfg))if(record.MonsterSource){if(bySource.has(record.MonsterSource))throw Error('Duplicate imported monster record: '+record.MonsterSource);bySource.set(record.MonsterSource,record);}
  const imported=[];
  function stage(relative,value){const absolute=path.join(root,relative);if(!reads.has(absolute))reads.set(absolute,fs.existsSync(absolute)?fs.readFileSync(absolute):null);files.set(relative,value);}
  function stageNew(relative,value){if(fs.existsSync(path.join(root,relative)))throw Error('Refusing to overwrite an unregistered monster asset: '+relative);stage(relative,value);}
  function folder(relative){const file=relative+'.meta';if(fs.existsSync(path.join(root,file)))return;stageNew(file,JSON.stringify({ver:'1.1.3',uuid:Bake.uuid(relative),importer:'folder',isBundle:false,bundleName:'',priority:1,compressionType:{},optimizeHotUpdate:{},inlineSpriteFrames:{},isRemoteBundle:{},subMetas:{}},null,2)+'\n');}
  for(const definition of definitions.units){
    const source=sourceUnits.get(definition.source);if(!source)throw Error('Missing imported source: '+definition.source);
    const existing=bySource.get(definition.source);if(existing){if(existing.ID!==definition.id)throw Error('Stable source ID changed: '+definition.source);continue;}
    if(cfg.SoldierCfg[definition.id])throw Error('Refusing to replace existing unit '+definition.id);
    const template=before.SoldierCfg[definition.behaviorTemplate];if(!template||![90001,90002,90003,90006,90009].includes(definition.behaviorTemplate))throw Error('Unsupported controller template');
    if(!cfg.GameTools||!cfg.GameTools.unitTypes||!own(cfg.GameTools.unitTypes,definition.role))throw Error('Unknown monster combat role: '+definition.role);
    const rig=JSON.parse(read(path.join(root,source.skeleton))),rigMeta=JSON.parse(read(path.join(root,source.skeleton+'.meta')));
    read(path.join(root,source.skeleton.replace(/\.json$/,'.atlas')));
    for(const action of ['idle','move','attack','hit','die'])if(!rig.animations[action]||duration(rig.animations[action])<=0)throw Error('Missing playable '+action+' for '+source.id);
    const name=prefabName(source.id),prefabFile='assets/KinghtFallEnemy/'+name+'.prefab',uuid=Bake.uuid(prefabFile);
    const prefab=JSON.parse(read(path.join(root,'assets/KinghtFallEnemy',template.prefab+'.prefab')));
    prefab[0]._name=name;const rootNode=prefab[prefab[0].data.__id__];rootNode._name=name;rootNode._id=uuid;
    const skeletons=prefab.filter(component=>component.__type__==='sp.Skeleton');if(skeletons.length!==1)throw Error('Controller template must have one display layer');
    const renderer=skeletons[0];renderer._N$skeletonData={__uuid__:rigMeta.uuid};renderer.defaultSkin='default';renderer.defaultAnimation='idle';renderer._animationName='idle';renderer._preCacheMode=0;
    const modelNode=prefab[renderer.node.__id__];if(modelNode._contentSize){modelNode._contentSize.width=rig.skeleton.width;modelNode._contentSize.height=rig.skeleton.height;}
    stageNew(prefabFile,JSON.stringify(prefab,null,2)+'\n');stageNew(prefabFile+'.meta',JSON.stringify({ver:'1.3.2',uuid,importer:'prefab',optimizationPolicy:'AUTO',asyncLoadAssets:false,readonly:false,subMetas:{}},null,2)+'\n');
    const portrait=definition.portrait,selection=[source.id,new RegExp(portrait.pattern),portrait.cropHeight,portrait.cropWidth];
    const picture=Portrait.portrait(root,selection,read,decoded);if(!picture.rgba.some((value,index)=>index%4===3&&value>0))throw Error('Empty portrait '+source.id);
    const icon=iconPath(source.id),iconFile='assets/resources/'+icon+'.png';folder('assets/resources/icons/monster-roster');folder('assets/resources/icons/monster-roster/'+source.pack);
    stageNew(iconFile,PNG.encode(picture));stageNew(iconFile+'.meta',JSON.stringify(Bake.textureMeta(iconFile,128,128),null,2)+'\n');
    const record=structuredClone(template),key='data.monster-roster.'+definition.id+'.name';record.ID=definition.id;record.Name='[[loc:'+key+']]';record.prefab=name;record.loadIcon='@icon/'+icon;record.MonsterSource=source.id;record.MonsterPack=source.pack;record.BehaviorTemplate=definition.behaviorTemplate;
    record.DeathAni=Number(duration(rig.animations.die).toFixed(7));record.BuildingCross=definition.aerial?0:1;delete record.Suppressed;record.CounterType='';
    if(definition.passive)record.AttackDamage=0;
    if(definition.role==='vanguard')record.Speed=Math.max(record.Speed,150);
    if(definition.role==='bruiser'){record.Health=Math.max(record.Health,100);record.AttackDamage=Math.max(record.AttackDamage||0,25);record.AttackInterval=Math.min(record.AttackInterval,.67);}
    if(record.AttackType===3){record.AttackDamage=0;record.AttackRange=definition.behaviorTemplate===90006?record.Data[2]:record.Data[1];}
    cfg.SoldierCfg[definition.id]=record;catalog.entries[key]={en:definition.name,zh:chinese(source.id,definition.name),context:'Imported '+source.pack+' monster · '+source.id};
    cfg.GameTools=cfg.GameTools||{};const unitKey='enemy:'+definition.id+':default';
    const hits=(rig.animations.attack.events||[]).filter(event=>event.name==='attack'),windup=hits.length===1?hits[0].time:duration(rig.animations.attack)/2;
    for(const [table,value]of [['visuals',{mirrorX:true}],['unitTypeAssignments',definition.role],['timingDefaults',{attack:Number(windup.toFixed(7))}]]){cfg.GameTools[table]=cfg.GameTools[table]||{};if(!own(cfg.GameTools[table],unitKey))cfg.GameTools[table][unitKey]=value;}
    imported.push({id:record.ID,source:source.id,prefab:name,icon,attackWindup:cfg.GameTools.timingDefaults[unitKey].attack});
  }
  if(imported.length){stage('assets/KinghtFallConfig/GameJsonCfg.json',Document.patch(cfgText,before,cfg));stage('assets/resources/localization/catalog.json',Document.patch(catText,oldCatalog,catalog));}
  return{root,files,reads,imported};
}
function register(root){const result=plan(root);const transaction=Transaction.commit(result.root,result.files,result.reads,'assets/KinghtFallConfig/GameJsonCfg.json');return{imported:result.imported,transaction};}
module.exports={plan,register,prefabName,iconPath,duration};
if(require.main===module)console.log(JSON.stringify(register(path.resolve(__dirname,'../..')),null,2));
