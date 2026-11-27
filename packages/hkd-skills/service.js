'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const Settings=require('../../assets/_script/HeroSkillSettings'),Authoring=require('../../assets/_script/HeroSkillAuthoring'),Document=require('../game-data-editor/lib/json-document'),Catalog=require('./catalog');
const Enemy=require('./enemy');
const VanguardSpear=require('../../assets/_script/VanguardSpearVFX');
const {pathToFileURL}=require('url');
const FILES=['assets/KinghtFallConfig/GameJsonCfg.json','assets/configs/GameJsonCfg.json'];
const FRAME_KEYS=['Frames','Columns','Cell','Fps','Loop'];
const RESOURCE_PREFIXES=Settings.resourcePrefixes;
const resourceKeys=prefix=>[prefix,prefix+'Bundle',prefix+'Path',prefix+'Kind',prefix+'Animation'].concat(FRAME_KEYS.map(key=>prefix+key));
const clone=value=>JSON.parse(JSON.stringify(value)),object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function prefabBodyOffset(prefab,hero){
  if(!Array.isArray(prefab))return undefined;
  const actor=prefab.find(row=>row&&row.node&&(hero?row.ctrPlayAni&&row.ctrHp:row.ndHp)),owner=actor&&prefab[actor.node.__id__],hp=hero&&actor&&prefab[actor.ctrHp.__id__];
  const bar=hero?hp&&hp.node:actor&&actor.ndHp;let node=bar&&prefab[bar.__id__],x=0,y=0,z=0,guard=0;if(!owner||!node)return undefined;
  while(node&&node!==owner&&guard++<32){
    const t=node._trs&&node._trs.array||[0,0,0,0,0,0,1,1,1,1],px=x*(t[7]===undefined?1:t[7]),py=y*(t[8]===undefined?1:t[8]),pz=z*(t[9]===undefined?1:t[9]),qx=t[3]||0,qy=t[4]||0,qz=t[5]||0,qw=t[6]===undefined?1:t[6];
    x=(t[0]||0)+(1-2*(qy*qy+qz*qz))*px+2*(qx*qy-qw*qz)*py+2*(qx*qz+qw*qy)*pz;
    y=(t[1]||0)+2*(qx*qy+qw*qz)*px+(1-2*(qx*qx+qz*qz))*py+2*(qy*qz-qw*qx)*pz;
    z=(t[2]||0)+2*(qx*qz-qw*qy)*px+2*(qy*qz+qw*qx)*py+(1-2*(qx*qx+qy*qy))*pz;
    node=node._parent&&prefab[node._parent.__id__];
  }
  return node===owner?{x:x*.55,y:y*.55}:undefined;
}
function bodyOffset(root,description,hero){
  const sources=hero?['assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab']:[];if(description&&description.source)sources.push(description.source);
  for(const source of sources)try{const value=prefabBodyOffset(JSON.parse(fs.readFileSync(path.join(root,source),'utf8')),hero&&source==='assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab');if(value)return value;}catch(_){}
  return undefined;
}
function projectileData(asset){const result={};for(const key of ['id','uuid','kind','bundle','path','skin','animation','rotation','flipbook','premultipliedAlpha','trail'])if(asset[key]!==undefined)result[key]=clone(asset[key]);return result;}
function leaves(before,after,prefix=[],result=[]){
  if(Document.equal(before,after))return result;
  if((object(before)||before===undefined)&&(object(after)||after===undefined))for(const key of new Set(Object.keys(before||{}).concat(Object.keys(after||{}))))leaves(before&&before[key],after&&after[key],prefix.concat(key),result);
  else result.push({path:prefix,value:after});return result;
}
function remove(object,pathParts){const key=pathParts[0];if(pathParts.length===1)delete object[key];else if(object[key]&&typeof object[key]==='object'){remove(object[key],pathParts.slice(1));if(!Object.keys(object[key]).length)delete object[key];}}
function containers(value,pathParts,label){
  let parent=value;
  for(const key of pathParts.slice(0,-1)){
    const next=parent&&parent[key];if(next!==undefined&&!object(next))throw Error('Invalid skill section in '+label+'. The existing data was preserved; correct that section before saving.');
    parent=next;
  }
}
function ensureUnchanged(original,latest,next,paths,relative){
  const values=data=>paths.map(parts=>Settings.get(data,parts.join('.')));
  const current=values(latest);
  if(!Document.equal(values(original),current)&&!Document.equal(values(next),current)){
    throw Error('Game data changed outside this draft at '+paths[0].join(' / ')+' in '+relative+'. Your changes are intact.');
  }
}
function applyChanges(target,changes,relative){
  for(const change of changes){
    containers(target,change.path,relative);
    if(change.value===undefined)remove(target,change.path);
    else Settings.set(target,change.path.join('.'),clone(change.value));
  }
}
class SkillService{
  constructor(root,options={}){this.root=path.resolve(root);this.options=options;this.commit=options.commit||require('../hkd-characters/lib/asset-transaction').commit;this.version=0;this.read();this.catalogs=options.catalogs||Catalog.index(this.root);this.catalogTime=Date.now();}
  disk(){return FILES.map(relative=>{const file=path.join(this.root,relative),bytes=fs.readFileSync(file),text=bytes.toString('utf8'),config=JSON.parse(text.replace(/^\uFEFF/,''));return {relative,file,bytes,text,config};});}
  read(){
    this.saved=this.disk();const config=this.saved[0].config;
    if(config.HeroSkills!==undefined&&!object(config.HeroSkills))throw Error('The saved HeroSkills section must be an object.');
    if(config.EnemySkillVisuals!==undefined&&!object(config.EnemySkillVisuals))throw Error('The saved EnemySkillVisuals section must be an object.');
    this.original=clone(config.HeroSkills||{});this.data=clone(this.original);
    this.originalEnemy=clone(config.EnemySkillVisuals||{});this.enemyData=clone(this.originalEnemy);
    this.enemyModels=Enemy.models(this.root,config);
    this.revision=crypto.createHash('sha256').update(Buffer.concat(this.saved.map(row=>row.bytes))).digest('hex');
    this.undoStack=[];this.redoStack=[];this.version++;
  }
  dirty(){return !Document.equal(this.original,this.data)||!Document.equal(this.originalEnemy,this.enemyData);}
  snapshot(result){
    const fields={},effective={},entries={};
    for(const style of Settings.styles){fields[style.id]=Settings.fields(style.id);entries[style.id]=Authoring.entries(style.id);effective[style.id]=Settings.effective(style.id,{HeroSkills:this.data});}
    for(const style of Enemy.styles){const id=Enemy.idOf(style.id);fields[style.id]=Enemy.fields(style.id);effective[style.id]={visual:Enemy.Visuals.effective(id,this.enemyData[id])};}
    return {version:this.version,revision:this.revision,data:clone(this.data),effective,dirty:this.dirty(),canUndo:!!this.undoStack.length,canRedo:!!this.redoStack.length,styles:clone(Settings.styles),
      enemyStyles:clone(Enemy.styles),enemyModels:clone(this.enemyModels),fields,entries,catalogs:this.catalogs,result:result||null};
  }
  load(){if(!this.dirty()){const latest=this.disk();if(latest.some((row,i)=>!row.bytes.equals(this.saved[i].bytes)))this.read();}if(!this.options.catalogs&&Date.now()-this.catalogTime>1000){this.catalogs=Catalog.index(this.root);this.catalogTime=Date.now();}return this.snapshot();}
  check(request){if(!request||request.version!==this.version||request.revision!==this.revision)throw Error('The skills draft changed in another panel. Reload the latest draft before editing.');}
  field(request){if(!Settings.styles.some(row=>row.id===request.style))throw Error('Choose one of the six hero skills.');const field=Settings.descriptors(request.style).find(row=>row.path===request.path);if(!field)throw Error('Choose an editable skill field.');return field;}
  remember(stack){stack.push({data:clone(this.data),enemyData:clone(this.enemyData)});if(stack.length>100)stack.shift();}
  changeEnemy(request,reset){
    this.check(request);
    const id=Enemy.idOf(request.style),field=Enemy.fields(request.style).find(row=>row.path===request.path);
    if(!field||!reset&&!Enemy.Visuals.valid(field,request.value))throw Error('Choose a valid enemy skill visual setting.');
    if(!reset&&field.key!=='resource'&&Document.equal(Enemy.Visuals.effective(id,this.enemyData[id])[field.key],request.value))return this.snapshot();
    const data=clone(this.enemyData);
    if(data[id]!==undefined&&!object(data[id]))throw Error('Invalid saved enemy skill visual.');
    const record=data[id]||{};
    if(reset)delete record[field.key];
    else record[field.key]=request.value;
    if(field.key==='resource'){
      const asset=Enemy.selection(this.catalogs,record.resource);
      delete record.resourceBundle;delete record.resourcePath;
      if(asset){record.resourceBundle=asset.bundle;record.resourcePath=asset.path;}
      if(record.resourceAnimation&&(!asset||!asset.animations.includes(record.resourceAnimation)))delete record.resourceAnimation;
    }else if(field.key==='resourceAnimation'&&record.resourceAnimation)Enemy.selection(this.catalogs,record.resource,record.resourceAnimation);
    if(Object.keys(record).length)data[id]=record;else delete data[id];
    if(Document.equal(data,this.enemyData))return this.snapshot();
    this.remember(this.undoStack);this.redoStack=[];this.enemyData=data;this.version++;
    return this.snapshot();
  }
  asset(kind,id){return (this.catalogs[kind]||[]).find(row=>row.id===id)||null;}
  animations(style,value,phase,previous){
    for(const prefix of RESOURCE_PREFIXES){const clip=Settings.get(value,'visual.'+prefix+'Animation'),edited=!previous||resourceKeys(prefix).some(key=>!Document.equal(Settings.get(value,'visual.'+key),Settings.get(previous,'visual.'+key)));if(clip&&phase!=='rider'&&edited){const asset=this.asset('vfx',Settings.get(value,'visual.'+prefix));if(!asset||asset.kind!=='spine'||!asset.animations.includes(clip))throw Error('The selected VFX animation is no longer available. Choose another animation or Reset before saving.');}}
    const animation=Settings.get(value,'visual.animation');
    if(animation&&phase!=='vfx'&&(!previous||animation!==Settings.get(previous,'visual.animation'))){const describe=this.options.describe||require('../game-data-editor/lib/unit-assets').describe,description=describe(this.root,{type:'hero',id:'hero',heroStyle:style,noRuntime:true});if(!Settings.riderAnimations(description).includes(animation))throw Error('Choose an authored attack animation supplied by every rider layer.');}
  }
  change(request){
    if(Enemy.hasStyle(request&&request.style))return this.changeEnemy(request,false);
    if(Object.prototype.hasOwnProperty.call(request||{},'changes'))return this.changeMany(request);
    this.check(request);const field=this.field(request);if(!Settings.valid(field,request.value))throw Error(field.label+': choose a valid value.');
    if(!['audio','vfx','projectile'].includes(field.type)&&Document.equal(Settings.get(Settings.effective(request.style,{HeroSkills:this.data}),request.path),request.value))return this.snapshot();
    const data=clone(this.data);containers(data,[request.style].concat(request.path.split('.')),'the draft');if(!object(data[request.style]))data[request.style]={};
    Settings.set(data[request.style],request.path,request.value);
    if(field.type==='projectile'){
      const asset=request.value&&this.asset('projectiles',request.value);if(request.value&&!asset)throw Error('Choose a flight asset from the Projectile editor.');
      if(asset)Settings.set(data[request.style],'visual.projectileAsset',projectileData(asset));else remove(data[request.style],['visual','projectileAsset']);
    }
    if(field.type==='audio'||field.type==='vfx'){
      const audio=field.type==='audio',asset=request.value&&this.asset(audio?'audio':'vfx',request.value);if(request.value&&!asset)throw Error('Choose an existing imported '+(audio?'sound':'VFX')+' asset.');
      if(audio){const prefix=request.path.slice(0,-5);for(const key of ['bundle','path'])if(asset)Settings.set(data[request.style],prefix+'.'+key,asset[key]);else remove(data[request.style],(prefix+'.'+key).split('.'));}
      else {const prefix=request.path.split('.').pop();for(const [key,source]of [['Bundle','bundle'],['Path','path'],['Kind','kind']])if(asset)Settings.set(data[request.style],'visual.'+prefix+key,asset[source]);else remove(data[request.style],['visual',prefix+key]);
        for(const key of FRAME_KEYS){const source=key[0].toLowerCase()+key.slice(1);if(asset&&asset.flipbook)Settings.set(data[request.style],'visual.'+prefix+key,asset.flipbook[source]);else remove(data[request.style],['visual',prefix+key]);}
        const animationPath='visual.'+prefix+'Animation',clip=Settings.get(Settings.effective(request.style,{HeroSkills:this.data}),animationPath);if(clip&&(!asset||asset.kind!=='spine'||!asset.animations.includes(clip)))Settings.set(data[request.style],animationPath,'');}
    }
    if(field.type==='effect-animation'&&request.value){const id=Settings.get(data[request.style],field.resourcePath||'visual.resource'),asset=this.asset('vfx',id);if(!asset||asset.kind!=='spine'||!asset.animations.includes(request.value))throw Error('Choose an animation from the selected VFX asset.');}
    if(request.path==='visual.animation'&&request.value)this.animations(request.style,data[request.style],'rider');
    if(Document.equal(data,this.data))return this.snapshot();this.remember(this.undoStack);this.redoStack=[];this.data=data;this.version++;return this.snapshot();
  }
  // A preview gesture can move both axes, or resize/rotate a selected effect.
  // Validate its entire numeric patch before publishing one shared-draft edit.
  // Intermediate pointer positions remain local to the preview, so Escape
  // needs no compensating edits and one Undo restores the complete gesture.
  changeMany(request){
    this.check(request);
    if(!Settings.styles.some(row=>row.id===request.style))throw Error('Choose one of the six hero skills.');
    if(!Array.isArray(request.changes)||request.changes.length>32)throw Error('A skill gesture must contain up to 32 numeric fields.');
    const seen=new Set(),edits=request.changes.map(edit=>{
      if(!object(edit)||typeof edit.path!=='string'||seen.has(edit.path))throw Error('Choose distinct editable fields for the skill gesture.');
      seen.add(edit.path);const field=this.field({style:request.style,path:edit.path});
      if(field.type!=='number'||!Settings.valid(field,edit.value))throw Error(field.label+': choose a valid numeric value.');
      return {path:edit.path,value:edit.value};
    }),effective=Settings.effective(request.style,{HeroSkills:this.data}),changed=edits.filter(edit=>!Document.equal(Settings.get(effective,edit.path),edit.value));
    if(!changed.length)return this.snapshot();
    const data=clone(this.data);
    for(const edit of changed){
      containers(data,[request.style].concat(edit.path.split('.')),'the draft');
      if(!object(data[request.style]))data[request.style]={};
      Settings.set(data[request.style],edit.path,edit.value);
    }
    if(Document.equal(data,this.data))return this.snapshot();
    this.remember(this.undoStack);this.redoStack=[];this.data=data;this.version++;return this.snapshot();
  }
  reset(request){if(Enemy.hasStyle(request&&request.style))return this.changeEnemy(request,true);this.check(request);this.field(request);const data=clone(this.data);containers(data,[request.style].concat(request.path.split('.')),'the draft');if(!data[request.style])return this.snapshot();remove(data[request.style],request.path.split('.'));if(request.path==='visual.projectile')remove(data[request.style],['visual','projectileAsset']);const resource=RESOURCE_PREFIXES.find(prefix=>request.path==='visual.'+prefix);if(resource)for(const key of resourceKeys(resource))remove(data[request.style],['visual',key]);if(/^audio\.(cast|impact|channel)\.clip$/.test(request.path)){const prefix=request.path.split('.').slice(0,-1);for(const key of ['bundle','path'])remove(data[request.style],prefix.concat(key));}if(!Object.keys(data[request.style]).length)delete data[request.style];if(Document.equal(data,this.data))return this.snapshot();this.remember(this.undoStack);this.redoStack=[];this.data=data;this.version++;return this.snapshot();}

  undo(request){this.check(request);if(!this.undoStack.length)return this.snapshot();this.remember(this.redoStack);Object.assign(this,this.undoStack.pop());this.version++;return this.snapshot();}
  redo(request){this.check(request);if(!this.redoStack.length)return this.snapshot();this.remember(this.undoStack);Object.assign(this,this.redoStack.pop());this.version++;return this.snapshot();}
  discard(request){this.check(request);this.read();return this.snapshot({discarded:true});}
  save(request){
    this.check(request);if(!this.dirty())return this.snapshot({saved:false,files:[]});
    const disk=this.disk();
    if(!this.options.catalogs)this.catalogs=Catalog.index(this.root);
    const changes=leaves(this.original,this.data),enemyChanges=leaves(this.originalEnemy,this.enemyData),files=new Map(),expected=new Map();
    const enemyResources=['resource','resourceBundle','resourcePath','resourceAnimation'];
    const enemyResourceChanges=new Set(enemyChanges.filter(change=>enemyResources.includes(change.path[1])).map(change=>change.path[0]));
    for(const id of enemyResourceChanges){
      const record=this.enemyData[id];if(!record||!record.resource)continue;
      const asset=Enemy.selection(this.catalogs,record.resource,record.resourceAnimation);
      if(asset.bundle!==record.resourceBundle||asset.path!==record.resourcePath)throw Error('The enemy skill effect moved. Select it again before saving.');
    }
    const projectileStyles=new Set(changes.filter(change=>change.path[1]==='visual'&&['projectile','projectileAsset'].includes(change.path[2])).map(change=>change.path[0]));
    for(const style of projectileStyles){const id=Settings.get(this.data[style],'visual.projectile');if(!id)continue;const asset=this.asset('projectiles',id);if(!asset)throw Error('The selected projectile is no longer available.');if(!Document.equal(Settings.get(this.data[style],'visual.projectileAsset'),projectileData(asset)))throw Error('The selected projectile changed after selection. Choose it again before saving.');}
    const resourceGroups=new Map();for(const change of changes)for(const prefix of RESOURCE_PREFIXES)if(change.path[1]==='visual'&&change.path[2]!==prefix+'Animation'&&resourceKeys(prefix).includes(change.path[2]))resourceGroups.set(change.path[0]+':'+prefix,[change.path[0],prefix]);
    const audioGroups=new Map(changes.filter(change=>change.path[1]==='audio'&&Settings.audioPhases.includes(change.path[2])&&['clip','bundle','path'].includes(change.path[3])).map(change=>[change.path[0]+':'+change.path[2],[change.path[0],change.path[2]]]));
    if(changes.length)for(const row of disk)if(row.config.HeroSkills!==undefined&&!object(row.config.HeroSkills))throw Error('Invalid HeroSkills section in '+row.relative+'. Nothing was saved.');
    for(const style of new Set(changes.map(change=>change.path[0])))if(this.data[style])this.animations(style,this.data[style],undefined,this.original[style]||{});
    for(const change of changes){const [style,...parts]=change.path,field=Settings.descriptors(style).find(row=>row.path===parts.join('.'));if(field&&change.value!==undefined){if(!Settings.valid(field,change.value))throw Error('Invalid '+field.label);if((field.type==='audio'||field.type==='vfx')&&change.value&&!this.asset(field.type==='audio'?'audio':'vfx',change.value))throw Error('A selected skill asset is no longer available.');}}
    for(const style of new Set(changes.map(change=>change.path[0]))){const value=this.data[style];if(!value)continue;for(const field of Settings.descriptors(style).filter(row=>row.type==='audio'||row.type==='vfx')){const audio=field.type==='audio',selected=audio?audioGroups.has(style+':'+field.path.split('.')[1]):resourceGroups.has(style+':'+field.path.split('.')[1]);if(!selected)continue;const id=Settings.get(value,field.path);if(!id)continue;const asset=this.asset(audio?'audio':'vfx',id);if(!asset)throw Error('A selected skill asset is no longer available.');const prefix=audio?field.path.slice(0,-5):field.path;for(const [saved,source]of audio?[['bundle','bundle'],['path','path']]:[['Bundle','bundle'],['Path','path'],['Kind','kind']]){const derived=Settings.get(value,prefix+(audio?'.':'')+saved);if(derived!==undefined&&derived!==asset[source])throw Error('A selected skill asset moved after selection. Your draft is intact; choose that asset again before saving.');}if(!audio)for(const key of FRAME_KEYS){const derived=Settings.get(value,prefix+key),source=key[0].toLowerCase()+key.slice(1);if(derived!==undefined&&(!asset.flipbook||derived!==asset.flipbook[source]))throw Error('The selected VFX animation layout changed after selection. Your draft is intact; choose that asset again before saving.');}}}
    for(const [index,row] of disk.entries()){
      if(!changes.length&&row.relative!==FILES[0])continue;
      const original=this.saved[index].config;
      const next=clone(row.config);
      if(enemyChanges.length&&row.relative===FILES[0]){
        if(next.EnemySkillVisuals!==undefined&&!object(next.EnemySkillVisuals))throw Error('Invalid EnemySkillVisuals section in '+row.relative+'. Nothing was saved.');
        next.EnemySkillVisuals=next.EnemySkillVisuals||{};
        applyChanges(next.EnemySkillVisuals,enemyChanges,row.relative);
        for(const change of enemyChanges)ensureUnchanged(original.EnemySkillVisuals,row.config.EnemySkillVisuals,next.EnemySkillVisuals,[change.path],row.relative);
        for(const id of enemyResourceChanges)ensureUnchanged(original.EnemySkillVisuals,row.config.EnemySkillVisuals,this.enemyData,enemyResources.map(key=>[id,key]),row.relative);
        if(!Object.keys(next.EnemySkillVisuals).length)delete next.EnemySkillVisuals;
      }
      if(changes.length){
      next.HeroSkills=next.HeroSkills||{};
      applyChanges(next.HeroSkills,changes,row.relative);
      // Selecting/resetting an asset owns its complete layout in every config
      // copy. A mirror may contain old flipbook fields absent from the primary.
      // Keep unrelated visual extensions while replacing this derived group.
      for(const [style,prefix]of resourceGroups.values()){for(const key of resourceKeys(prefix))remove(next.HeroSkills,[style,'visual',key]);for(const key of resourceKeys(prefix)){const value=Settings.get(this.data[style],'visual.'+key);if(value!==undefined)Settings.set(next.HeroSkills,style+'.visual.'+key,clone(value));}}
      // A sound selection owns its whole identity in every copy. Independent
      // volume, delay and extension fields still belong to their own drafts.
      for(const [style,phase]of audioGroups.values()){for(const key of ['clip','bundle','path'])remove(next.HeroSkills,[style,'audio',phase,key]);for(const key of ['clip','bundle','path']){const value=Settings.get(this.data[style],'audio.'+phase+'.'+key);if(value!==undefined)Settings.set(next.HeroSkills,style+'.audio.'+phase+'.'+key,clone(value));}}
      for(const style of projectileStyles)for(const key of ['projectile','projectileAsset']){remove(next.HeroSkills,[style,'visual',key]);const value=Settings.get(this.data[style],'visual.'+key);if(value!==undefined)Settings.set(next.HeroSkills,style+'.visual.'+key,clone(value));}
      const guard=paths=>ensureUnchanged(original.HeroSkills,row.config.HeroSkills,next.HeroSkills,paths,row.relative);
      for(const change of changes)guard([change.path]);
      for(const [style,phase]of audioGroups.values())guard(['clip','bundle','path'].map(key=>[style,'audio',phase,key]));
      for(const style of projectileStyles)guard(['projectile','projectileAsset'].map(key=>[style,'visual',key]));
      for(const change of changes)for(const prefix of RESOURCE_PREFIXES){
        const keys=resourceKeys(prefix);
        if(change.path[1]==='visual'&&keys.includes(change.path[2]))guard(keys.map(key=>[change.path[0],'visual',key]));
      }
      if(!Object.keys(next.HeroSkills).length)delete next.HeroSkills;
      }
      const text=Document.patch(row.text,row.config,next);
      if(text!==row.text)files.set(row.relative,text);
      expected.set(row.file,row.bytes);
    }
    const result=files.size?this.commit(this.root,files,expected,FILES[0]):{files:[]};
    this.read();return this.snapshot(Object.assign({saved:!!result.files.length},result));
  }
  describe(request){
    if(Enemy.hasStyle(request&&request.style))return Enemy.describe(this,request);
    if(!request||!Settings.styles.some(row=>row.id===request.style))throw Error('Choose one of the six hero skills.');
    const Units=require('../game-data-editor/lib/unit-assets'),describe=this.options.describe||Units.describe;
    const result=describe(this.root,{type:'hero',id:'hero',heroStyle:request.style,noRuntime:!!request.noRuntime,battleSpace:true});
    result.skillHeroBodyOffset=bodyOffset(this.root,result,true);
    const config=this.saved[0].config,enemy=Object.values(config.SoldierCfg||{}).find(row=>row.ID&&row.prefab),rawVisual=Settings.effective(request.style,{HeroSkills:this.data}).visual;
    const projectile=request.style==='skirmisher'&&require('../../assets/_script/ProjectileLooks').tierFlight({assets:this.catalogs.projectiles||[],heroArrowTiers:this.catalogs.heroArrowTiers||[]},1);
    const visual=projectile?Settings.projectileVisual({...rawVisual,projectile:projectile.id,projectileAsset:projectileData(projectile)}):rawVisual;
    if(projectile)result.projectileAsset=projectileData(projectile);
    if(request.style==='skirmisher'){
      const speed=config.GameTools&&config.GameTools.projectileSpeeds&&config.GameTools.projectileSpeeds['hero:hero:default'];
      if(typeof speed==='number'&&speed>=1&&speed<=20000)result.skillProjectileSpeed=speed;
    }
    // An isolated preview has no player save. Use the saved starting offhand
    // instead of silently granting the maximum-level Bruiser charm's lifesteal.
    result.skillSecondaryStats=require('../../assets/_script/HeroEquipmentStats').secondary(config,request.style,1);
    const styleInfo=require('../../assets/_script/HeroWeapons').find(request.style),baseRange=config.HeroEquipment&&config.HeroEquipment.version===1?config.HeroEquipment.baseRange+(result.skillSecondaryStats.range||0):undefined;
    if(typeof baseRange==='number'&&Number.isFinite(baseRange)&&styleInfo)result.skillAttackRange=baseRange*styleInfo.reach;
    const authored=config.GameTools&&config.GameTools.animationSpeeds&&config.GameTools.animationSpeeds[result.key];
    result.skillAttackPlayback=typeof result.unitAnimationSpeed==='number'?result.unitAnimationSpeed:typeof authored==='number'&&Number.isFinite(authored)&&authored>=.1&&authored<=4?authored:1;
    let gold=config.GameTools&&config.GameTools.timings&&config.GameTools.timings[result.key];if(gold===undefined)gold=config.GameTools&&config.GameTools.timingDefaults&&config.GameTools.timingDefaults[result.key];
    const delay=gold&&gold.attack;result.skillBasicImpactDelay=typeof delay==='number'&&Number.isFinite(delay)&&delay>0&&delay<=10&&result.skillAttackPlayback>0?delay/result.skillAttackPlayback:0;
    const sounds=require('../../assets/_script/BattleSoundCatalog').effects,release=request.style==='bruiser'?null:{fighter:'sword-light-swing',vanguard:'sword-light-swing',mystic:'enemy-magic-projectile',guardian:'sword-heavy-swing'}[request.style]||'bow-arrow-release';
    const impact=request.style==='mystic'?'magic-impact':request.style==='skirmisher'?'arrow-impact-flesh':'impact-flesh-light';
    const defaultSounds={release:request.style==='skirmisher'?'skirmisher-active-release':request.style==='guardian'?'shield-activate':release,basicRelease:release,channel:release,impact:request.style==='skirmisher'?'skirmisher-active-hit':impact};
    if(request.style==='skirmisher')defaultSounds.basicImpact=impact;
    if(request.style==='bruiser')defaultSounds.basicImpact='impact-bruiser-basic';
    result.defaultSounds={};for(const [phase,id]of Object.entries(defaultSounds)){const sound=sounds[id],asset=sound&&this.catalogs.audio.find(row=>row.bundle==='KinghtFallAudio'&&row.path===sound.path);if(asset)result.defaultSounds[phase]={clip:asset.id,volume:sound.gain===undefined?1:sound.gain,delay:0};}
    if(request.style==='guardian'){const ally=Object.values(config.AllyCfg||{}).find(row=>row.ID&&row.prefab);if(ally)try{result.ally=describe(this.root,{type:'ally',id:ally.ID,noRuntime:!!request.noRuntime});result.ally.projectileTargetOffset=bodyOffset(this.root,result.ally);}catch(_){}}
    if(enemy)try{result.target=describe(this.root,{type:'enemy',id:enemy.ID,noRuntime:!!request.noRuntime});
      if(result.target.source){const prefab=JSON.parse(fs.readFileSync(path.join(this.root,result.target.source),'utf8')),actor=prefab.find(row=>row.ndHp&&row.node),bar=actor&&prefab[actor.ndHp.__id__];if(bar){let x=0,y=0,node=bar,guard=0;while(node&&node!==prefab[actor.node.__id__]&&guard++<32){const t=node._trs&&node._trs.array||[0,0,0,0,0,0,1,1,1],r=2*Math.atan2(t[5]||0,t[6]===undefined?1:t[6]),c=Math.cos(r),sn=Math.sin(r),px=x*(t[7]===undefined?1:t[7]),py=y*(t[8]===undefined?1:t[8]);x=(t[0]||0)+px*c-py*sn;y=(t[1]||0)+px*sn+py*c;node=node._parent&&prefab[node._parent.__id__];}result.target.projectileTargetOffset={x:x*.55,y:y*.55};}}
    }catch(_){}
    for(const prefix of RESOURCE_PREFIXES){if(prefix==='resource'&&projectile){result.effects=[{...projectile,id:projectile.uuid,...(projectile.kind==='spine'?{description:Catalog.spine(this.root,projectile)}:{})}];continue;}const id=(request.style!=='skirmisher'||prefix==='impactResource')&&Object.prototype.hasOwnProperty.call(request,prefix)?request[prefix]:visual[prefix],resourceField=Settings.visualFields.find(field=>field.path==='visual.'+prefix);if(!Settings.valid(resourceField,id))throw Error('Choose a valid VFX asset.');const asset=id&&this.asset('vfx',id);if(id&&!asset)throw Error('Choose an existing imported VFX asset.');result[prefix==='resource'?'effects':prefix==='impactResource'?'impactEffects':prefix+'Effects']=asset?[Object.assign({},asset,asset.kind==='spine'?{description:Catalog.spine(this.root,asset)}:{})]:[];}
    // Include the phase-linked atlas parts for the preview, without changing
    // saved resource identities or asking the panel to write defaults.
    const VFX=require('../../assets/_script/HeroSkillVFXCatalog');result.styleEffects=[];
    for(const prefix of RESOURCE_PREFIXES.slice(2)){
      const id=Object.prototype.hasOwnProperty.call(request,prefix)?request[prefix]:visual[prefix],selected=VFX.clips.find(clip=>clip.uuid===id),asset=id&&this.asset('vfx',id);
      if(!asset)continue;
      const clips=selected?VFX.clips.filter(clip=>clip.slot===selected.slot&&(clip.group===selected.group||selected.slot==='beam')):[];
      for(const candidate of clips.length?clips.map(clip=>this.asset('vfx',clip.uuid)).filter(Boolean):[asset]){
        if(result.styleEffects.some(row=>row.id===candidate.id))continue;
        const descriptor={...candidate};
        if(candidate.kind==='spine')descriptor.description=Catalog.spine(this.root,candidate);
        if(request.style==='vanguard'&&prefix==='castResource'&&VanguardSpear.selected(selected))descriptor.spearAccentsUrl=pathToFileURL(path.join(this.root,'assets/resources',VanguardSpear.accentsResource+'.png')).href;
        result.styleEffects.push(descriptor);
      }
    }
    result.skill=Settings.styles.find(row=>row.id===request.style);result.settings=Settings.effective(request.style,{HeroSkills:this.data});return result;
  }
}
module.exports={SkillService,Service:SkillService,FILES};
