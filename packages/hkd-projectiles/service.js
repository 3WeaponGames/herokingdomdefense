'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),url=require('url');
const Document=require('../game-data-editor/lib/json-document');
const Records=require('../game-data-editor/lib/unit-records');
const UnitAttack=require('../../assets/_script/UnitAttackRules');
const {commit}=require('../hkd-characters/lib/asset-transaction');
const clone=value=>JSON.parse(JSON.stringify(value));
const parse=text=>JSON.parse(text.replace(/^\uFEFF/,''));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const timingKey=unit=>unit.key==='hero'?'hero:hero:default':['enemy','ally'].includes(unit.type)?unit.type+':'+unit.id+':'+require('../game-data-editor/lib/unit-records').form(unit.type,unit.id):unit.key;
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=10;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function towers(data){return (data.BuildEnum[2].levelList||[]).map((row,index)=>({row,index,key:'tower:2:'+(index+1)})).filter(item=>item.row.Tower&&['cannon','sniper'].includes(item.row.Tower.attackType));}
function unitTarget(data,key){
  const match=typeof key==='string'&&/^(enemy|ally):([1-9]\d*)$/.exec(key);
  if(!match||!Records.reachable(data,match[1],match[2],Records.form(match[1],match[2])))return null;
  const type=match[1],id=Number(match[2]);
  return {key,type,id,record:Records.record(data,type,id)};
}
class ProjectilesService {
  constructor(root){this.root=path.resolve(root);this.relative='assets/resources/projectiles/catalog.json';this.file=path.join(this.root,this.relative);this.version=0;this.focusedUnits=new Set();this.reload();}
  invalidateAssets(){
    this.trailDefaults=new Map();this.shotSpeeds=new Map();this.portraits=new Map();this.modelDefaults=new Map();this.nativeFrames=new Map();this.spriteFrames=null;
    require('../game-data-editor/lib/unit-assets').invalidate();
  }
  reload(){
    this.invalidateAssets();this.catalogs=new Map();this.text=fs.readFileSync(this.file,'utf8');this.original=parse(this.text);this.data=clone(this.original);this.revision=hash(this.text);
    this.configRelative='assets/KinghtFallConfig/GameJsonCfg.json';this.configFile=path.join(this.root,this.configRelative);this.configText=fs.readFileSync(this.configFile,'utf8');this.configData=parse(this.configText);this.configRevision=hash(this.configText);
    this.originalSpeeds=Object.fromEntries(towers(this.configData).map(item=>[item.key,require('../../assets/_script/TowerCombat').settings(item.row).projectileSpeed]));this.speeds=clone(this.originalSpeeds);this.timings={};
    for(const who of this.units()){
      const delay=this.savedTiming(who);
      if(delay!==undefined)this.timings[who.key]=delay;
    }
    this.originalTimings=clone(this.timings);this.version++;return this.snapshot();
  }
  savedTiming(who){
    const animated=['hero','enemy','ally'].includes(who.type),settings=this.configData.GameTools||{};
    const saved=animated?settings.timings&&settings.timings[timingKey(who)]:this.data.assignments[who.key],field=animated?'attack':'launchDelay';
    const inherited=animated&&object(saved)&&saved.inherit===true&&!own(saved,'attack');
    if(saved===undefined||inherited||!animated&&!own(saved,field))return undefined;
    // Keep malformed overrides resettable without changing their saved bytes.
    const delay=saved&&saved[field];
    return finite(delay)?delay:0;
  }
  focusUnit(key){
    if(!this.dirty()&&hash(fs.readFileSync(this.configFile))!==this.configRevision)this.reload();
    const target=unitTarget(this.configData,key);
    if(!target)throw Error('Choose an existing unit. Save newly created units before assigning a projectile.');
    if(UnitAttack.attackType(target.record)!==2&&!this.focusedUnits.has(key)){
      // The Units panel can open this assignment while its ranged delivery is a draft.
      this.focusedUnits.add(key);
      const delay=this.savedTiming(target);
      if(delay!==undefined)this.timings[key]=this.originalTimings[key]=delay;
    }
    return key;
  }
  config(){return clone(this.configData);}
  readCatalog(relative,fallback){
    const file=path.join(this.root,relative);if(fallback&&!fs.existsSync(file))return fallback;
    const stat=fs.statSync(file),revision=stat.mtimeMs+':'+stat.ctimeMs+':'+stat.size,previous=this.catalogs.get(file);
    if(previous&&previous.revision===revision)return previous.data;
    const data=parse(fs.readFileSync(file,'utf8'));this.catalogs.set(file,{revision,data});return data;
  }
  portrait(who){
    if(!this.portraits)this.portraits=new Map();if(this.portraits.has(who.key))return this.portraits.get(who.key);
    const data=this.configData,record=who.type==='enemy'?data.SoldierCfg[who.id]:who.type==='ally'?(data.AllyCfg||{})[who.id]:null;
    const building=who.type==='building'&&data.BuildEnum[who.id],level=building&&(building.levelList||[])[who.levelIndex||0];
    const reference=who.type==='hero'?'@icon/Stats Icons/hero-skirmisher-health':who.type==='wall'?((((data.BuildEnum||{})[6]||{}).levelList||[])[0]||{}).Icon:record&&record.loadIcon||level&&level.Icon;
    let result=null;
    if(reference)try{const asset=require('../game-data-editor/lib/asset-validation').imported(this.root,record?'KinghtFallEnemy':'KinghtFallIconBuild',reference,'sprite');result=path.relative(this.root,asset.file).replace(/\\/g,'/');}catch(_){/* Unavailable legacy portraits retain a readable initials fallback. */}
    this.portraits.set(who.key,result);return result;
  }
  defaultTrail(who){
    if(!this.trailDefaults)this.trailDefaults=new Map();const cacheKey=who.type+':'+(who.id||'');if(this.trailDefaults.has(cacheKey))return this.trailDefaults.get(cacheKey);
    let result=false;
    try{
      const data=this.configData,record=who.type==='enemy'?data.SoldierCfg[who.id]:data.AllyCfg&&data.AllyCfg[who.id];
      const file=who.type==='wall'?'assets/gad_prefabs/bullets/PBT_Bullet_1.prefab':['hero','building'].includes(who.type)?'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab':'assets/KinghtFallEnemy/'+(who.type==='ally'?'Play':'')+record.prefab+'.prefab';
      const prefab=parse(fs.readFileSync(path.join(this.root,file),'utf8')),controller=prefab.find(item=>who.type==='building'?item.buildBullet:item.ctrArr),component=controller&&prefab[(who.type==='building'?controller.buildBullet:controller.ctrArr).__id__];
      if(component&&typeof component.speed==='number'&&component.speed>0){if(!this.shotSpeeds)this.shotSpeeds=new Map();this.shotSpeeds.set(cacheKey,component.speed);}
      const root=component&&component.node&&component.node.__id__,nodes=new Set();
      function collect(id){if(id===undefined||nodes.has(id))return;nodes.add(id);for(const child of prefab[id]._children||[])collect(child.__id__);}
      if(root===undefined&&who.type==='wall')collect(1);else collect(root);
      const streak=prefab.find(item=>item.__type__==='cc.MotionStreak'&&item.node&&nodes.has(item.node.__id__));
      if(streak&&streak._texture){const id='trail:'+streak._texture.__uuid__;if((this.data.trails||[]).some(trail=>trail.id===id))result=id;}
    }catch(_){/* An unavailable draft model has no inherited trail. */}
    this.trailDefaults.set(cacheKey,result);return result;
  }
  units(){
    const data=this.configData,settings=data.GameTools||{},entries=this.readCatalog('assets/resources/localization/catalog.json').entries;
    const label=text=>String(text||'').replace(/\[\[loc:([^\]]+)\]\]/g,(_,key)=>entries[key]&&entries[key].en||key);
    const items=this.readCatalog('assets/resources/hero-items/catalog.json',{assignments:{},profiles:{}});
    const {select,selectSource,fallbackFlight}=require('../../assets/_script/ProjectileLooks'),Fighting=require('../game-data-editor/lib/fighting-profiles');
    const ranged=(row,side)=>UnitAttack.attackType(row)===2||this.focusedUnits.has(side+':'+row.ID);
    const previewTiers=data.EquipCfg.find(row=>row.id===3).levelInfo.map(level=>{const profile=items.profiles[items.assignments['3:'+level.Level]],choice=select({assets:this.data.assets,assignments:{},heroArrowLayer:this.data.heroArrowLayer,heroArrowTiers:this.data.heroArrowTiers},'hero',level.Level,profile,level.EquipSkin);return {level:level.Level,flight:choice.flight||'hero-skin:'+level.EquipSkin,tint:choice.tint};});
    const enemyProjectiles=Object.values(data.SoldierCfg).filter(row=>ranged(row,'enemy')).map(row=>{
      let defaults=this.modelDefaults.get(row.ID);if(!defaults){defaults={};if(row.MonsterPack==='fantasy-bosses')try{const json=require('../game-data-editor/lib/unit-assets').describe(this.root,{type:'enemy',id:row.ID,noRuntime:true,noShared:true,documents:{A:{data}}}).layers[0].json;defaults=json._fantasy&&json._fantasy.effects&&json._fantasy.effects.projectile||{};}catch(_){/* Missing draft model keeps the original preview. */}this.modelDefaults.set(row.ID,defaults);}
      const family=Fighting.familyFor(settings,row.ID),role=(settings.unitTypeAssignments||{})['enemy:'+row.ID+':'+Records.form('enemy',row.ID)],roleName=role&&((settings.unitTypes||{})[role]||{}).name,legacy=settings.unitProfiles&&settings.unitProfiles.aliases&&settings.unitProfiles.aliases[row.ID],behavior=Records.behavior(row,row.ID);
      return {key:'enemy:'+row.ID,type:'enemy',id:row.ID,name:(family?family.name:label(row.Name))+' · Enemy'+(family&&role?' · '+label(roleName||role):'')+(legacy?' · Legacy '+row.ID:''),speed:500,defaultFlight:defaults.flight||(behavior===90008?'original:fireball':behavior===90005?'original:stone':'original:arrow'),defaultLaunch:defaults.launch,defaultImpact:defaults.impact,defaultSize:defaults.size};
    });
    const buildings=[1,2].flatMap(id=>(data.BuildEnum[id].levelList||[]).map((row,index)=>({key:'tower:'+id+':'+(index+1),type:'building',id,levelIndex:index,name:label(row.Name)+' · '+(id===1?'Castle':'Tower'),speed:this.speeds['tower:'+id+':'+(index+1)]||row.Tower&&row.Tower.projectileSpeed||550,...(row.Tower&&['cannon','sniper'].includes(row.Tower.attackType)?{speedEditable:true,builtinFlight:row.Tower.attackType}:{}),defaultFlight:'original:arrow'})));
    for(const [index,row]of ((data.BuildEnum[5]||{}).levelList||[]).entries())if(row.MillDefense&&row.MillDefense.kind==='scarecrow')buildings.push({key:'tower:5:'+(index+1),type:'building',id:5,levelIndex:index,name:label(row.Name)+' · Scarecrow defense',speed:450,defaultFlight:'original:arrow'});
    const units=[{key:'hero',type:'hero',id:'hero',name:'Skirmisher hero',speed:500,defaultFlight:previewTiers[0].flight,previewTiers},{key:'tower',type:'building',id:2,levelIndex:0,name:'Castle & arrow towers · shared default',speed:550,defaultFlight:'original:arrow'}].concat(buildings,[{key:'wall-defense',type:'wall',name:'Wall-defense mode · all cards',speed:500,defaultFlight:'original:wall-arrow'}],enemyProjectiles,Object.values(data.AllyCfg||{}).filter(row=>ranged(row,'ally')).map(row=>({key:'ally:'+row.ID,type:'ally',id:row.ID,name:label(row.Name)+' · Ally',speed:500,defaultFlight:'original:arrow'})));
    return units.map(who=>{
      const key=timingKey(who),saved=settings.timingDefaults&&settings.timingDefaults[key],custom=this.timings&&this.timings[who.key],effectiveAssignment=selectSource(this.data,who.key,who.type==='enemy'?{cfg:data.SoldierCfg[who.id]}:null,settings),shared=/^tower:/.test(who.key)&&this.timings&&this.timings.tower;
      const defaultDelay=who.type==='building'?(finite(shared)?shared:0):saved&&finite(saved.attack)?saved.attack:0;
      const delay=custom===undefined?defaultDelay:custom;
      const defaultTrail=this.defaultTrail(who),authoredSpeed=['hero','enemy','ally'].includes(who.type)&&this.shotSpeeds&&this.shotSpeeds.get(who.type+':'+(who.id||''))||who.speed;let override=settings.projectileSpeeds&&settings.projectileSpeeds[key];
      if(override===undefined&&who.type==='enemy'&&(who.id>=100000||data.SoldierCfg[who.id].ProfileBaseID))for(const id of require('../../assets/_script/EnemyStageProfiles').referenceIds(data.SoldierCfg[who.id],settings)){const inherited=settings.projectileSpeeds&&settings.projectileSpeeds['enemy:'+id+':'+Records.form('enemy',id)];if(inherited!==undefined){override=inherited;break;}}
      const speed=['hero','enemy','ally'].includes(who.type)&&typeof override==='number'&&Number.isFinite(override)&&override>=1&&override<=20000?override:authoredSpeed;
      const inheritedData={...this.data,assignments:{...this.data.assignments,[who.key]:{}}},inheritedAssignment=selectSource(inheritedData,who.key,who.type==='enemy'?{cfg:data.SoldierCfg[who.id]}:null,settings);
      return {...who,scaleFallback:fallbackFlight(who.key,who.type==='enemy'?data.SoldierCfg[who.id]:null),portrait:this.portrait(who),speed,timingKey:key,launchDelay:finite(delay)?delay:0,defaultDelay,defaultTrail,effectiveAssignment,inheritedAssignment,...(effectiveAssignment.set?{set:effectiveAssignment.set}:{})};
    });
  }
  dirty(){return !Document.equal(this.original,this.data)||!Document.equal(this.originalSpeeds,this.speeds)||!Document.equal(this.originalTimings||{},this.timings||{});}
  snapshot(){
    if(!this.spriteFrames)this.spriteFrames=require('./battle-artwork').catalogSpriteFrames(this.root,this.data.assets);
    return {version:this.version,revision:this.revision,data:clone(this.data),speeds:clone(this.speeds),timings:clone(this.timings||{}),dirty:this.dirty(),units:this.units(),spriteFrames:clone(this.spriteFrames)};
  }
  check(request){if(!request||request.version!==this.version)throw Error('Another panel changed the projectile drafts. Reload before editing.');}
  load(){if(!this.dirty()&&(hash(fs.readFileSync(this.file))!==this.revision||hash(fs.readFileSync(this.configFile))!==this.configRevision))return this.reload();this.invalidateAssets();return this.snapshot();}
  validate(data){
    if(!object(data)||data.version!==1||!object(data.assignments))throw Error('Invalid projectile catalog');
    if(!Document.equal(data.assets,this.original.assets)||!Document.equal(data.sets,this.original.sets)||!Document.equal(data.trails,this.original.trails)||!Document.equal(data.source,this.original.source)||!Document.equal(data.heroArrowTiers,this.original.heroArrowTiers)||data.heroArrowLayer!==this.original.heroArrowLayer)throw Error('Projectile library entries are read-only; reimport assets using the importer.');
    const units=new Set(this.units().map(u=>u.key)),assets=new Map(data.assets.map(a=>[a.id,a]));
    for(const [key,value]of Object.entries(data.assignments)){
      // Preserve future/legacy assignments unchanged; validate every real edit.
      if(Document.equal(value,this.original.assignments[key]))continue;
      if(!units.has(key)||!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose an existing ranged unit: '+key);
      const previous=this.original.assignments[key]||{},edited=field=>!Document.equal(value[field],previous[field]);
      for(const field of ['flight','launch','impact'])if(edited(field)&&value[field]!==undefined&&value[field]!==''){
        if(typeof value[field]!=='string')throw Error('Choose a valid projectile asset for '+field+'.');
        const asset=assets.get(value[field]);if(!asset)throw Error('Missing projectile asset '+value[field]);
        if(field!=='flight'&&!['flipbook','spine','sprite'].includes(asset.kind))throw Error('Choose a playable launch or impact effect.');
      }
      if(edited('size')&&value.size!==undefined&&(!Number.isFinite(value.size)||value.size<4||value.size>512))throw Error('Visual size must be between 4 and 512.');
      if(edited('scale')&&value.scale!==undefined&&(!Number.isFinite(value.scale)||value.scale<.1||value.scale>10))throw Error('Projectile scale must be between 0.1 and 10.');
      if(edited('rotation')&&value.rotation!==undefined&&(!Number.isFinite(value.rotation)||Math.abs(value.rotation)>360))throw Error('Visual rotation must be between -360 and 360.');
      if(edited('tint')&&value.tint!==undefined&&!/^#[a-f0-9]{6}$/i.test(value.tint))throw Error('Choose a valid projectile tint.');
      if(edited('trailColor')&&value.trailColor!==undefined&&(typeof value.trailColor!=='string'||!/^#[a-f0-9]{6}$/i.test(value.trailColor)))throw Error('Choose a valid trail color (#RRGGBB).');
      if(edited('launchDelay')&&value.launchDelay!==undefined&&!finite(value.launchDelay))throw Error('Launch delay must be between 0 and 10 seconds.');
      if(edited('set')&&value.set!==undefined&&!(data.sets||[]).some(set=>set.id===value.set))throw Error('Choose an existing projectile set.');
      if(edited('trail')&&value.trail!==undefined&&value.trail!==false&&!(data.trails||[]).some(trail=>trail.id===value.trail))throw Error('Choose an existing projectile trail.');
    }
    return true;
  }
  validateSpeeds(speeds){if(!object(speeds)||Object.keys(speeds).length!==Object.keys(this.originalSpeeds).length)throw Error('Invalid tower speed drafts.');for(const [key,value]of Object.entries(speeds)){if(!Object.prototype.hasOwnProperty.call(this.originalSpeeds,key)||!Number.isFinite(value)||value<1||value>20000)throw Error('Projectile speed must be between 1 and 20000: '+key);}}
  validateTimingEdits(timings){
    const changed=this.units().filter(who=>['hero','enemy','ally'].includes(who.type)&&timings[who.key]!==this.timings[who.key]);if(!changed.length)return;
    const settings=this.configData.GameTools;
    if(settings!==undefined&&!object(settings))throw Error('GameTools settings have an invalid format. Launch delay drafts were not changed.');
    if(settings&&settings.timings!==undefined&&!object(settings.timings))throw Error('Attack timings have an invalid format. Launch delay drafts were not changed.');
    for(const who of changed){const profile=who.type==='enemy'&&settings&&settings.unitProfiles&&settings.unitProfiles.entries&&settings.unitProfiles.entries[who.id];if(object(profile)&&profile.timing!==undefined&&!object(profile.timing))throw Error('Unit profile timing has an invalid format. Launch delay drafts were not changed.');}
  }
  change(request){
    this.check(request);this.validate(request.data);const speeds=request.speeds===undefined?this.speeds:request.speeds,inputTimings=request.timings===undefined?this.timings:request.timings;this.validateSpeeds(speeds);
    if(!object(inputTimings))throw Error('Invalid launch delay drafts.');const roster=this.units(),units=new Set(roster.map(who=>who.key));for(const [key,delay]of Object.entries(inputTimings))if(!units.has(key)||!finite(delay))throw Error('Launch delay must be between 0 and 10 seconds: '+key);
    const timings=clone(inputTimings);
    // Catalog-shaped API edits and the panel's timing drafts share one clock.
    // Reflect an edited static launch marker immediately, before explicit Save.
    for(const who of roster)if(!['hero','enemy','ally'].includes(who.type)){
      const previous=this.data.assignments[who.key]||{},next=request.data.assignments[who.key]||{};
      if(!Document.equal(previous.launchDelay,next.launchDelay)){
        const delay=own(next,'launchDelay')?next.launchDelay:undefined;
        if(inputTimings[who.key]!==this.timings[who.key]&&inputTimings[who.key]!==delay)throw Error('Conflicting launch delay drafts: '+who.key);
        if(delay===undefined)delete timings[who.key];else timings[who.key]=delay;
      }
    }
    this.validateTimingEdits(timings);if(!Document.equal(this.data,request.data)||!Document.equal(this.speeds,speeds)||!Document.equal(this.timings,timings)){this.data=clone(request.data);this.speeds=clone(speeds);this.timings=timings;this.version++;}return this.snapshot();
  }
  discard(request){this.check(request);return this.reload();}
  save(request){
    this.check(request);if(!this.dirty())return {...this.snapshot(),result:{saved:false,files:[]}};
    this.validate(this.data);const before=fs.readFileSync(this.file);if(hash(before)!==this.revision)throw Error('Projectile catalog changed outside this draft. Save cancelled; drafts retained.');
    this.validateSpeeds(this.speeds);const configBefore=fs.readFileSync(this.configFile);
    const files=new Map(),catalog=clone(this.data),data=clone(this.configData);
    for(const who of this.units())if(this.timings[who.key]!==this.originalTimings[who.key]){
      const delay=this.timings[who.key];
      if(['hero','enemy','ally'].includes(who.type)){
        data.GameTools=data.GameTools||{version:1};data.GameTools.timings=data.GameTools.timings||{};
        const key=timingKey(who),timing=object(data.GameTools.timings[key])?Object.assign({},data.GameTools.timings[key]):{};
        if(delay===undefined){delete timing.attack;if(Object.keys(timing).length)timing.inherit=true;}else{timing.attack=delay;delete timing.inherit;}
        if(Object.keys(timing).length)data.GameTools.timings[key]=timing;else delete data.GameTools.timings[key];
        // Profiles materialize their resolved timing on later Units edits. Keep
        // this explicit edit in that same metadata so it cannot be reverted.
        const profile=who.type==='enemy'&&data.GameTools.unitProfiles&&data.GameTools.unitProfiles.entries&&data.GameTools.unitProfiles.entries[who.id];
        if(object(profile))profile.timing=Object.assign({},object(profile.timing)?profile.timing:{},{saved:clone(data.GameTools.timingDefaults&&data.GameTools.timingDefaults[key]||null),custom:clone(data.GameTools.timings[key]||null)});
      }else{
        const assignment=Object.assign({},catalog.assignments[who.key]||{});
        if(delay===undefined)delete assignment.launchDelay;else assignment.launchDelay=delay;
        if(Object.keys(assignment).length)catalog.assignments[who.key]=assignment;else delete catalog.assignments[who.key];
      }
    }
    if(!Document.equal(this.original,catalog))files.set(this.relative,Document.patch(this.text,this.original,catalog));
    if(!Document.equal(this.originalSpeeds,this.speeds))for(const item of towers(data))if(this.speeds[item.key]!==this.originalSpeeds[item.key])item.row.Tower.projectileSpeed=this.speeds[item.key];
    const writesConfig=!Document.equal(this.configData,data);
    if(hash(configBefore)!==this.configRevision){
      // Units can save its attack draft while a separate appearance draft is open.
      const published=parse(configBefore.toString('utf8'));
      const edited=[...new Set([...Object.keys(catalog.assignments),...Object.keys(this.original.assignments)])].filter(key=>!Document.equal(catalog.assignments[key],this.original.assignments[key]));
      if(writesConfig||!edited.length||edited.some(key=>!unitTarget(published,key)))throw Error('Game data changed outside this draft. Save cancelled; projectile drafts retained.');
    }
    if(writesConfig)files.set(this.configRelative,Document.patch(this.configText,this.configData,data));
    const result=commit(this.root,files,[[this.file,before],[this.configFile,configBefore]],this.relative);
    this.reload();return {...this.snapshot(),result:{saved:true,...result}};
  }
  describe(request){
    const asset=this.data.assets.find(a=>a.id===request.id);if(!asset)throw Error('Choose a projectile');
    return this.describeAsset(asset);
  }
  describeUnit(request){
    if(request.key==='preview-hit'||request.key==='preview-wall-hit'){const wall=request.key==='preview-wall-hit',animation=wall?'jian_1':'jian_lv1',effect=this.describeAsset({id:request.key,name:wall?'Default wall hit':'Default hit',kind:'spine',bundle:wall?'gad_prefabs':'KinghtFallEffect',resource:wall?'_res/Skeleton/GAD_UIGame/wq_swcq_sjdx':'wqyl_being_hurt/wqyl_being_hurt',animation});return {...effect,type:'effect',key:request.key,animation};}
    const units=this.units(),who=request.key==='preview-target'?{type:'enemy',id:90001,key:'preview-target'}:units.find(unit=>unit.key===request.key);if(!who)throw Error('Choose an existing ranged unit.');
    const type=who.type==='wall'?'hero':who.type==='building'?'building':who.type,Assets=require('../game-data-editor/lib/unit-assets');
    const level=type==='ally'?(request.level===undefined?require('../game-data-editor/lib/unit-records').levels(this.configData,type,who.id)[0]:request.level):undefined;
    const description=Assets.describe(this.root,{type,id:who.id||'hero',levelIndex:who.levelIndex||0,level,heroStyle:'skirmisher',noShared:true,battleSpace:true,documents:{A:{data:this.configData}}});
    if(description.projectile&&typeof who.speed==='number')description.projectile={...description.projectile,speed:who.speed};
    const record=type==='enemy'?this.configData.SoldierCfg[who.id]:type==='ally'?this.configData.AllyCfg[who.id]:{};
    const tower=type==='building'?require('../../assets/_script/TowerCombat').settings(this.configData.BuildEnum[who.id].levelList[who.levelIndex||0]):null;
    const profile=require('../game-data-editor/lib/attack-profile').describe(description,this.configData.GameTools||{},{type,id:who.id,record});profile.hitTime=who.launchDelay===undefined?profile.hitTime:who.launchDelay;
    const settings=this.configData.GameTools||{},visuals=clone(settings.visuals&&settings.visuals[description.key]||{});
    let launcher=null;
    if(request.key!=='preview-target'){
      const gear=type==='hero'&&this.configData.EquipCfg.find(row=>row.id===3);
      const legacyArrowSkin=gear&&gear.levelInfo[0].EquipSkin;
      launcher=require('./battle-artwork').describeLauncher(this.root,{...who,legacyArrowSkin},description,this.data.assets,this.nativeFrames);
    }
    const worldScale=type==='building'?require('../../assets/_script/BuildingWorldScale').value(this.configData.BuildEnum[who.id].levelList[who.levelIndex||0]):1;
    return {...description,key:request.key,profile,visuals,launcher,worldScale,referenceDelay:description.defaultTiming,launchDelay:profile.hitTime,...(who.type==='wall'?{defaultHitKey:'preview-wall-hit',defaultHitAnimation:'jian_1'}:{}),...(type==='enemy'&&require('../game-data-editor/lib/unit-records').behavior(record,who.id)===90008?{defaultHitAnimation:false}:{}),...(tower&&tower.attackType==='cannon'?{defaultHitAnimation:false,defaultHit:{kind:'cannon',splashRadius:tower.splashRadius}}:{}),...(type==='building'?{artwork:require('../game-data-editor/preview/building-artwork').geometry(description.appearance,0)}:{})};
  }
  describeAsset(asset){
    if(asset.kind!=='spine')return {asset,layers:[]};
    const file=path.join(this.root,'assets',asset.bundle||'resources',asset.resource+'.json'),atlas=fs.readFileSync(file.replace(/\.json$/,'.atlas'),'utf8'),pages={};
    const lines=atlas.split(/\r?\n/);lines.forEach((line,i)=>{if(line.trim()&&(!i||!lines[i-1].trim())&&/^(size|format):/.test((lines[i+1]||'').trim()))pages[line.trim()]=url.pathToFileURL(path.join(path.dirname(file),line.trim())).href;});
    const metadata=fs.existsSync(file+'.meta')?parse(fs.readFileSync(file+'.meta','utf8')):{};
    return {asset,runtimePath:require('../game-data-editor/lib/unit-assets').enginePath(),layers:[{name:asset.name,json:parse(fs.readFileSync(file,'utf8')),atlas,pages,skin:asset.skin,x:0,y:0,scaleX:1,scaleY:1,importScale:metadata.scale>0?metadata.scale:1}]};
  }
}
module.exports={ProjectilesService};
