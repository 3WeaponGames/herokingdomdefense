'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),url=require('url');
const Units=require('../../game-data-editor/lib/unit-assets');
const JSONDocument=require('../../game-data-editor/lib/json-document');
const UnitLibrary=require('./unit-library');
const Levels=require('./character-levels');
const Catalog=require('./character-catalog');
const Packs=require('./unit-packs'),Boss=require('./boss-model');
const clone=value=>JSON.parse(JSON.stringify(value)),hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function read(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
class Service{
  constructor(root,options){this.root=path.resolve(root);this.relativeFile=options&&options.file||'assets/resources/characters/catalog.json';this.file=path.join(this.root,this.relativeFile);this.version=0;this.reload();}
  reload(){const text=fs.readFileSync(this.file,'utf8'),original=JSON.parse(text);this.text=text;this.revision=hash(text);this.original=original;this.data=clone(original);this.undoStack=[];this.redoStack=[];this.version++;return this.snapshot();}
  snapshot(){return {version:this.version,revision:this.revision,dirty:!JSONDocument.equal(this.original,this.data),canUndo:!!this.undoStack.length,canRedo:!!this.redoStack.length,data:clone(this.data),savedData:clone(this.original)};}
  check(request){if(!request||request.version!==this.version)throw Error('The character draft changed in another window. Reload the latest draft before editing.');}
  assets(){const original=read(path.join(this.root,'assets/resources/character-parts/catalog.json'));const mounts=this.relativeFile==='assets/resources/characters/catalog.json'&&fs.existsSync(path.join(this.root,'assets/KinghtFallEnemyAni/wqyl_qb/wqyl_qb.json'))?require('./original-mounts').assets():[];return Object.assign({},original,{parts:original.parts.concat(UnitLibrary.load(this.root).parts,mounts)});}
  units(){
    const cfg=read(path.join(this.root,'assets/KinghtFallConfig/GameJsonCfg.json')),entries=read(path.join(this.root,'assets/resources/localization/catalog.json')).entries;
    const text=value=>String(value||'').replace(/\[\[loc:([^\]]+)\]\]/g,(m,key)=>entries[key]&&entries[key].en||m);
    const result=[{type:'hero',id:'hero',key:'hero:hero:default',name:'Hero',group:'Hero',sourcePack:'character-maker'}];
    for(const type of ['ally','enemy'])for(const row of Object.values(type==='ally'&&cfg.AllyCfg||cfg.SoldierCfg)){
      if(type==='enemy'&&cfg.GameTools&&cfg.GameTools.unitProfiles&&cfg.GameTools.unitProfiles.entries&&cfg.GameTools.unitProfiles.entries[row.ID]&&cfg.GameTools.unitProfiles.entries[row.ID].created)continue;
      if(type==='ally'&&(!row.prefab||!fs.existsSync(path.join(this.root,'assets/KinghtFallEnemy/Play'+row.prefab+'.prefab'))))continue;
      const boss=type==='enemy'&&[90010,90011,90012].includes(row.ID),form=boss?String(row.ID-90009):'default';
      const levels=type==='ally'?[...new Set(Object.values(cfg.BuildEnum||{}).flatMap(build=>(build.levelList||[]).filter(level=>level.Data&&Number(level.Data[1])===Number(row.ID)&&Number.isInteger(level.level)&&level.level>0).map(level=>level.level)))].sort((a,b)=>a-b):[];
      const key=type+':'+row.ID+':'+form,p=this.original.profiles[this.original.assignments[key]],source=type==='enemy'&&(row.MonsterSource||row.AppearanceSourceUnit&&cfg.SoldierCfg[row.AppearanceSourceUnit]&&cfg.SoldierCfg[row.AppearanceSourceUnit].MonsterSource||p&&(p.base.appearance||p.base.source||p.baked&&p.baked.source));
      result.push({type,id:String(row.ID),key,name:text(row.Name||row.name)||row.prefab||'Boss form '+form,group:type==='ally'?'Allies':'Enemies',sourcePack:type==='ally'?'character-maker':row.MonsterPack||source&&source.split('/')[0]||'original',...(type==='ally'?{levels:levels.length?levels:[1]}:{}),...(source?{appearance:source}:{})});
    }
    return result;
  }
  describe(base,noRuntime){if(!this.units().some(u=>u.type===base.type&&u.id===String(base.id)))throw Error('Choose an existing character base.');if(base.model)return require('./current-model').describe(this.root,base,noRuntime);if(base.source)return require('./mounts').describe(this.root,base,noRuntime);return Units.describe(this.root,{type:base.type,id:base.id,noRuntime:!!noRuntime});}
  load(){return {...this.snapshot(),parts:this.assets().parts,units:this.units(),sources:UnitLibrary.load(this.root).sources};}
  validate(data){
    if(!data||data.version!==1||!data.profiles||typeof data.profiles!=='object'||Array.isArray(data.profiles)||!data.assignments||typeof data.assignments!=='object'||Array.isArray(data.assignments))throw Error('Invalid character document.');
    const assets=new Map(this.assets().parts.map(p=>[p.id,p])),units=this.units();
    for(const [id,profile]of Object.entries(data.profiles)){
      if(!/^[a-z][a-z0-9_-]{0,63}$/.test(id)||!profile||typeof profile.name!=='string'||!profile.name.trim()||profile.name.length>100)throw Error('Choose a valid character name and identifier.');
      if(!profile.base||!Array.isArray(profile.parts)||profile.parts.length>40)throw Error('Invalid character base or part list.');
      if(profile.base.currentModel!==undefined&&typeof profile.base.currentModel!=='boolean')throw Error('Invalid current character model.');
      if(profile.base.model&&!profile.base.currentModel)throw Error('Finished model snapshots require a current unit model.');
      if(profile.mount!==undefined){const mount=assets.get(profile.mount);if(!mount||!mount.mount||mount.mount!==profile.base.mount)throw Error('Choose an existing library mount.');}
      if(profile.base.level!==undefined){const unit=units.find(u=>u.type===profile.base.type&&u.id===String(profile.base.id));if(!Number.isInteger(profile.base.level)||!Levels.levels(unit).includes(profile.base.level))throw Error(profile.name+': choose an existing ally level.');}
      if(profile.faceless!==undefined&&typeof profile.faceless!=='boolean')throw Error('Faceless must be enabled or disabled.');
      if(profile.skinTint!==undefined&&!/^#[a-f0-9]{6}$/i.test(profile.skinTint))throw Error(profile.name+': choose a valid skin tint.');
      const rig=this.describe(profile.base,true),layers=new Map(rig.layers.map(l=>[l.uuid,l])),ids=new Set(),targets=new Set();
      const unit=units.find(unit=>unit.type===profile.base.type&&unit.id===String(profile.base.id)),mode=this.relativeFile==='assets/resources/characters/catalog.json'?Packs.forUnit(unit).mode:'maker';
      Boss.validate(rig.layers[0].json,profile.boss);
      if(mode==='fixed'){
        const previous=this.original.profiles[id];
        for(const key of ['parts','models','skins','faceless','skinTint','mount','boss','scale']){
          const fallback=key==='parts'?[]:key==='scale'?1:undefined;
          if(!JSONDocument.equal(profile[key]===undefined?fallback:profile[key],previous&&previous[key]!==undefined?previous[key]:fallback))throw Error(profile.name+': this pack supplies finished models without appearance customization.');
        }
        if(profile.base.mount||profile.base.source&&(!previous||profile.base.source!==previous.base.source))throw Error('Choose a finished model from this monster pack.');
      }
      if(mode==='modular'&&profile.parts.length)throw Error(profile.name+': choose the compatible body parts supplied with this Fantasy model.');
      if(mode==='modular'&&profile.base.source){const meta=Boss.metadata(UnitLibrary.describe(this.root,unit.appearance,true).layers[0].json);if(!meta.presets.some(preset=>preset.id===profile.base.source))throw Error('Choose an outfit supplied for this unit.');}
      if(profile.scale!==undefined&&(typeof profile.scale!=='number'||!Number.isFinite(profile.scale)||profile.scale<.1||profile.scale>4))throw Error(profile.name+': character size must be between 0.1 and 4.');
      for(const [layer,skin]of Object.entries(profile.skins||{}))if(!layers.has(layer)||!layers.get(layer).skins.includes(skin))throw Error(profile.name+': missing model skin.');
      for(const [layer,model]of Object.entries(profile.models||{})){
        if(!layers.has(layer)||!model||typeof model!=='object'||Array.isArray(model))throw Error(profile.name+': missing original model layer.');
        if(model.tint!==undefined&&!/^#[a-f0-9]{6}$/i.test(model.tint))throw Error(profile.name+': choose a valid model tint.');
        for(const key of ['x','y','rotation','scaleX','scaleY','opacity'])if(model[key]!==undefined){
          const value=model[key];if(typeof value!=='number'||!Number.isFinite(value)||(['x','y'].includes(key)&&Math.abs(value)>4096)||(key==='rotation'&&Math.abs(value)>3600)||(['scaleX','scaleY'].includes(key)&&(value<.01||value>20))||(key==='opacity'&&(value<0||value>1)))throw Error(profile.name+': invalid model '+key+'.');
        }
      }
      if(profile.parts.some(p=>!p||typeof p!=='object'||Array.isArray(p)))throw Error(profile.name+': choose a valid equipment part.');
      for(const p of profile.parts){
        if(p.forceVisible!==undefined&&typeof p.forceVisible!=='boolean')throw Error(profile.name+': part visibility must be enabled or disabled.');
        if(p.tint!==undefined&&!/^#[a-f0-9]{6}$/i.test(p.tint))throw Error(profile.name+': choose a valid part tint.');
        if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id))throw Error(profile.name+': part identifiers must be unique.');ids.add(p.id);
        if(!assets.has(p.sprite))throw Error(profile.name+': missing imported part '+p.sprite);
        const layer=layers.get(p.layer);if(!layer)throw Error(profile.name+': choose a model layer for '+p.id);
        if(layer.mount)throw Error(profile.name+': equipment belongs to the rider. Choose horses from the Mount library.');
        if(!layer.json.slots.some(s=>s.name===p.slot)||!layer.json.bones.some(b=>b.name===p.bone))throw Error(profile.name+': choose an existing slot and anchor bone for '+p.id);
        if(targets.has(p.layer+':'+p.slot))throw Error(profile.name+': two parts replace the same slot.');targets.add(p.layer+':'+p.slot);
        for(const field of ['x','y','rotation','scaleX','scaleY','opacity','order']){
          if(typeof p[field]!=='number'||!Number.isFinite(p[field]))throw Error(profile.name+': '+field+' must be a finite number.');
        }
        if(Math.abs(p.x)>4096||Math.abs(p.y)>4096||Math.abs(p.rotation)>3600||Math.abs(p.scaleX)<.01||Math.abs(p.scaleY)<.01||Math.abs(p.scaleX)>20||Math.abs(p.scaleY)>20||p.opacity<0||p.opacity>1||!Number.isInteger(p.order)||Math.abs(p.order)>layer.json.slots.length)throw Error(profile.name+': a part transform is outside its supported range.');
        if(!Array.isArray(p.hideSlots)||p.hideSlots.some(name=>name===p.slot||!layer.json.slots.some(s=>s.name===name)))throw Error(profile.name+': invalid hidden slot.');
        if(profile.parts.some(other=>other!==p&&other.layer===p.layer&&p.hideSlots.includes(other.slot)))throw Error(profile.name+': one part hides another part’s target.');
      }
    }
    if(data.characters!==undefined){
      if(!data.characters||typeof data.characters!=='object'||Array.isArray(data.characters))throw Error('Invalid created character list.');
      const owned=new Set();for(const [id,entry]of Object.entries(data.characters)){
        const profile=data.profiles[id];if(!profile||profile.base.level!==undefined||!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('Invalid created character.');
        if(owned.has(id))throw Error('A character can only belong to one list entry.');owned.add(id);
        if(entry.levels!==undefined&&(!entry.levels||typeof entry.levels!=='object'||Array.isArray(entry.levels)))throw Error('Invalid created character levels.');
        for(const [level,target]of Object.entries(entry.levels||{})){const p=data.profiles[target];if(!p||String(p.base.level)!==level||p.base.type!==profile.base.type||String(p.base.id)!==String(profile.base.id)||owned.has(target))throw Error('A character level must belong to its character.');owned.add(target);}
      }
    }
    for(const [key,id]of Object.entries(data.assignments)){
      const target=Levels.target(units,key),unit=target&&target.unit,profile=data.profiles[id];
      if(!unit||!profile||profile.base.type!==unit.type||String(profile.base.id)!==unit.id||profile.base.level!==target.level)throw Error('A character look can only be assigned to its matching base and level: '+key);
    }
    return true;
  }
  // History stays in the shared draft and never publishes assets. Bound the
  // full-document snapshots so long fitting sessions do not grow indefinitely.
  remember(stack,value){stack.push(clone(value));if(stack.length>100)stack.shift();}
  change(request){this.check(request);this.validate(request.data);if(JSONDocument.equal(this.data,request.data))return this.snapshot();this.remember(this.undoStack,this.data);this.redoStack=[];this.data=clone(request.data);this.version++;return this.snapshot();}
  undo(request){this.check(request);if(!this.undoStack.length)return this.snapshot();this.remember(this.redoStack,this.data);this.data=this.undoStack.pop();this.version++;return this.snapshot();}
  redo(request){this.check(request);if(!this.redoStack.length)return this.snapshot();this.remember(this.undoStack,this.data);this.data=this.redoStack.pop();this.version++;return this.snapshot();}
  discard(request){this.check(request);return this.reload();}
  publication(){
    const data=clone(this.data);if(this.relativeFile!=='assets/resources/characters/catalog.json')return data;
    // Roster and campaign records may share one monster appearance while
    // retaining separate combat records. Publish the visual to each member.
    for(const group of Catalog.listed(data,this.units())){
      if(group.type!=='enemy'||!group.members||group.members.length<2)continue;const id=data.assignments[group.key],profile=data.profiles[id];
      const visual=p=>p&&['parts','skins','models','scale','faceless','skinTint'].map(key=>p[key]).concat(p.base.mount);
      if(!profile||JSONDocument.equal(visual(profile),visual(this.original.profiles[id])))continue;
      const from=this.describe(profile.base,true).layers[0].uuid;
      for(const unit of group.members.filter(unit=>unit.key!==group.key)){
        let target=data.assignments[unit.key];if(!target){target='enemy-'+unit.id;for(let suffix=2;data.profiles[target];suffix++)target='enemy-'+unit.id+'-'+suffix;}
        const old=data.profiles[target],base={type:'enemy',id:unit.id,currentModel:true,appearance:unit.appearance,...(old&&old.base.model?{model:clone(old.base.model)}:{})},to=this.describe(base,true).layers[0].uuid;
        const next={...(old||{}),name:profile.name,base};for(const key of ['parts','skins','models','scale','faceless','skinTint']){if(profile[key]===undefined)delete next[key];else next[key]=clone(profile[key]);}
        next.parts.forEach(part=>{if(part.layer===from)part.layer=to;});for(const key of ['skins','models'])if(next[key]&&next[key][from]!==undefined&&from!==to){next[key][to]=next[key][from];delete next[key][from];}
        data.profiles[target]=next;data.assignments[unit.key]=target;
      }
    }
    this.validate(data);return data;
  }
  save(request){
    this.check(request);if(JSONDocument.equal(this.original,this.data))return {...this.snapshot(),result:{saved:false,files:[]}};
    this.validate(this.data);
    const before=fs.readFileSync(this.file,'utf8');if(hash(before)!==this.revision)throw Error('The saved character file changed outside this draft. Your draft is intact; reload or copy it before saving.');
    const baked=require('./appearance-build').plan(this.root,this.publication(),this.assets().parts,this.original,this.relativeFile==='assets/resources/characters/catalog.json'?'characters':'items');
    const output=JSONDocument.patch(before,this.original,baked.data),files=baked.files;
    files.set(this.relativeFile,output);baked.reads.set(this.file,Buffer.from(before));
    const result=require('./asset-transaction').commit(this.root,files,baked.reads,this.relativeFile);
    Units.invalidate();
    this.data=baked.data;this.text=output;this.revision=hash(output);this.original=clone(this.data);this.undoStack=[];this.redoStack=[];this.version++;
    return {...this.snapshot(),result:Object.assign({saved:true},result)};
  }
  partImage(part){return url.pathToFileURL(path.join(this.root,part.image)).href;}
}
module.exports={Service};
