'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const Settings=require('../../assets/_script/HeroSkillSettings'),Document=require('../game-data-editor/lib/json-document'),Catalog=require('./catalog');
const FILES=['assets/KinghtFallConfig/GameJsonCfg.json','assets/configs/GameJsonCfg.json'];
const clone=value=>JSON.parse(JSON.stringify(value)),object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function leaves(before,after,prefix=[],result=[]){
  if(Document.equal(before,after))return result;
  if((object(before)||before===undefined)&&(object(after)||after===undefined))for(const key of new Set(Object.keys(before||{}).concat(Object.keys(after||{}))))leaves(before&&before[key],after&&after[key],prefix.concat(key),result);
  else result.push({path:prefix,value:after});return result;
}
function remove(object,pathParts){const key=pathParts[0];if(pathParts.length===1)delete object[key];else if(object[key]&&typeof object[key]==='object'){remove(object[key],pathParts.slice(1));if(!Object.keys(object[key]).length)delete object[key];}}
class SkillService{
  constructor(root,options={}){this.root=path.resolve(root);this.options=options;this.commit=options.commit||require('../hkd-characters/lib/asset-transaction').commit;this.version=0;this.read();this.catalogs=options.catalogs||Catalog.index(this.root);this.catalogTime=Date.now();}
  disk(){return FILES.map(relative=>{const file=path.join(this.root,relative),bytes=fs.readFileSync(file),text=bytes.toString('utf8'),config=JSON.parse(text.replace(/^\uFEFF/,''));return {relative,file,bytes,text,config};});}
  read(){this.saved=this.disk();const original=this.saved[0].config.HeroSkills;if(original!==undefined&&!object(original))throw Error('The saved HeroSkills section must be an object.');this.original=clone(original||{});this.data=clone(this.original);this.revision=crypto.createHash('sha256').update(Buffer.concat(this.saved.map(row=>row.bytes))).digest('hex');this.undoStack=[];this.redoStack=[];this.version++;}
  dirty(){return !Document.equal(this.original,this.data);}
  snapshot(result){const fields={},effective={};for(const style of Settings.styles){fields[style.id]=Settings.fields(style.id);effective[style.id]=Settings.effective(style.id,{HeroSkills:this.data});}return {version:this.version,revision:this.revision,data:clone(this.data),effective,dirty:this.dirty(),canUndo:!!this.undoStack.length,canRedo:!!this.redoStack.length,styles:clone(Settings.styles),fields,catalogs:this.catalogs,result:result||null};}
  load(){if(!this.dirty()){const latest=this.disk();if(latest.some((row,i)=>!row.bytes.equals(this.saved[i].bytes)))this.read();}if(!this.options.catalogs&&Date.now()-this.catalogTime>1000){this.catalogs=Catalog.index(this.root);this.catalogTime=Date.now();}return this.snapshot();}
  check(request){if(!request||request.version!==this.version||request.revision!==this.revision)throw Error('The skills draft changed in another panel. Reload the latest draft before editing.');}
  field(request){if(!Settings.styles.some(row=>row.id===request.style))throw Error('Choose one of the six hero skills.');const field=Settings.descriptors(request.style).find(row=>row.path===request.path);if(!field)throw Error('Choose an editable skill field.');return field;}
  remember(stack){stack.push(clone(this.data));if(stack.length>100)stack.shift();}
  asset(kind,id){return this.catalogs[kind].find(row=>row.id===id)||null;}
  change(request){
    this.check(request);const field=this.field(request);if(!Settings.valid(field,request.value))throw Error(field.label+': choose a valid value.');
    if(field.type!=='audio'&&field.type!=='vfx'&&Document.equal(Settings.get(Settings.effective(request.style,{HeroSkills:this.data}),request.path),request.value))return this.snapshot();
    const data=clone(this.data);if(!object(data[request.style]))data[request.style]={};
    Settings.set(data[request.style],request.path,request.value);
    if(field.type==='audio'||field.type==='vfx'){
      const audio=field.type==='audio',asset=request.value&&this.asset(audio?'audio':'vfx',request.value);if(request.value&&!asset)throw Error('Choose an existing imported '+(audio?'sound':'VFX')+' asset.');
      if(audio){const prefix=request.path.slice(0,-5);for(const key of ['bundle','path'])if(asset)Settings.set(data[request.style],prefix+'.'+key,asset[key]);else remove(data[request.style],(prefix+'.'+key).split('.'));}
      else for(const [key,source]of [['resourceBundle','bundle'],['resourcePath','path'],['resourceKind','kind']])if(asset)Settings.set(data[request.style],'visual.'+key,asset[source]);else remove(data[request.style],['visual',key]);
      if(!audio){const clip=Settings.get(data[request.style],'visual.resourceAnimation');if(clip&&(!asset||asset.kind!=='spine'||!asset.animations.includes(clip)))remove(data[request.style],['visual','resourceAnimation']);}
    }
    if(request.path==='visual.resourceAnimation'&&request.value){const id=Settings.get(data[request.style],'visual.resource'),asset=this.asset('vfx',id);if(!asset||asset.kind!=='spine'||!asset.animations.includes(request.value))throw Error('Choose an animation from the selected VFX asset.');}
    if(request.path==='visual.animation'&&request.value){const describe=this.options.describe||require('../game-data-editor/lib/unit-assets').describe,description=describe(this.root,{type:'hero',id:'hero',heroStyle:request.style,noRuntime:true});if(!Settings.riderAnimations(description).includes(request.value))throw Error('Choose an animation supplied by every rider layer.');}
    if(Document.equal(data,this.data))return this.snapshot();this.remember(this.undoStack);this.redoStack=[];this.data=data;this.version++;return this.snapshot();
  }
  reset(request){this.check(request);this.field(request);const data=clone(this.data);if(!data[request.style])return this.snapshot();remove(data[request.style],request.path.split('.'));if(request.path==='visual.resource')for(const key of ['resourceBundle','resourcePath','resourceKind','resourceAnimation'])remove(data[request.style],['visual',key]);if(/^audio\.(cast|impact|channel)\.clip$/.test(request.path)){const prefix=request.path.split('.').slice(0,-1);for(const key of ['bundle','path'])remove(data[request.style],prefix.concat(key));}if(!Object.keys(data[request.style]).length)delete data[request.style];if(Document.equal(data,this.data))return this.snapshot();this.remember(this.undoStack);this.redoStack=[];this.data=data;this.version++;return this.snapshot();}
  undo(request){this.check(request);if(!this.undoStack.length)return this.snapshot();this.remember(this.redoStack);this.data=this.undoStack.pop();this.version++;return this.snapshot();}
  redo(request){this.check(request);if(!this.redoStack.length)return this.snapshot();this.remember(this.undoStack);this.data=this.redoStack.pop();this.version++;return this.snapshot();}
  discard(request){this.check(request);this.read();return this.snapshot({discarded:true});}
  save(request){
    this.check(request);if(!this.dirty())return this.snapshot({saved:false,files:[]});
    const disk=this.disk();if(disk.some((row,i)=>!row.bytes.equals(this.saved[i].bytes)))throw Error('Game data changed outside this draft. Your changes are intact; reload or discard before saving.');
    if(!this.options.catalogs)this.catalogs=Catalog.index(this.root);
    const changes=leaves(this.original,this.data),files=new Map(),expected=new Map();
    for(const change of changes){const [style,...parts]=change.path,field=Settings.descriptors(style).find(row=>row.path===parts.join('.'));if(field&&change.value!==undefined){if(!Settings.valid(field,change.value))throw Error('Invalid '+field.label);if((field.type==='audio'||field.type==='vfx')&&change.value&&!this.asset(field.type==='audio'?'audio':'vfx',change.value))throw Error('A selected skill asset is no longer available.');}}
    for(const style of new Set(changes.map(change=>change.path[0]))){const value=this.data[style];if(!value)continue;for(const field of Settings.descriptors(style).filter(row=>row.type==='audio'||row.type==='vfx')){const id=Settings.get(value,field.path);if(!id)continue;const asset=this.asset(field.type==='audio'?'audio':'vfx',id),before=Settings.get(this.original[style],field.path);if(!asset){if(id!==before)throw Error('A selected skill asset is no longer available.');continue;}const prefix=field.type==='audio'?field.path.slice(0,-5):'visual';for(const [saved,source]of field.type==='audio'?[['bundle','bundle'],['path','path']]:[['resourceBundle','bundle'],['resourcePath','path'],['resourceKind','kind']]){const derived=Settings.get(value,prefix+'.'+saved);if(derived!==undefined&&derived!==asset[source])throw Error('A selected skill asset moved after selection. Your draft is intact; choose that asset again before saving.');}}}
    for(const row of disk){const next=clone(row.config);if(!object(next.HeroSkills))next.HeroSkills={};for(const change of changes){if(change.value===undefined)remove(next.HeroSkills,change.path);else Settings.set(next.HeroSkills,change.path.join('.'),clone(change.value));}if(!Object.keys(next.HeroSkills).length)delete next.HeroSkills;const text=Document.patch(row.text,row.config,next);files.set(row.relative,text);expected.set(row.file,row.bytes);}
    const result=this.commit(this.root,files,expected,FILES[0]);this.read();return this.snapshot(Object.assign({saved:true},result));
  }
  describe(request){
    if(!request||!Settings.styles.some(row=>row.id===request.style))throw Error('Choose one of the six hero skills.');
    const Units=require('../game-data-editor/lib/unit-assets'),describe=this.options.describe||Units.describe;
    const result=describe(this.root,{type:'hero',id:'hero',heroStyle:request.style,noRuntime:!!request.noRuntime});
    const config=this.saved[0].config,enemy=Object.values(config.SoldierCfg||{}).find(row=>row.ID&&row.prefab),visual=Settings.effective(request.style,{HeroSkills:this.data}).visual;
    const authored=config.GameTools&&config.GameTools.animationSpeeds&&config.GameTools.animationSpeeds[result.key];
    result.skillAttackPlayback=typeof result.unitAnimationSpeed==='number'?result.unitAnimationSpeed:typeof authored==='number'&&Number.isFinite(authored)&&authored>=.1&&authored<=4?authored:1;
    if(enemy)try{result.target=describe(this.root,{type:'enemy',id:enemy.ID,noRuntime:!!request.noRuntime});}catch(_){}
    const id=Object.prototype.hasOwnProperty.call(request,'resource')?request.resource:visual.resource;
    const resourceField=Settings.visualFields.find(field=>field.path==='visual.resource');if(!Settings.valid(resourceField,id))throw Error('Choose a valid VFX asset.');
    const asset=id&&this.asset('vfx',id);if(id&&!asset)throw Error('Choose an existing imported VFX asset.');result.effects=asset?[Object.assign({},asset,asset.kind==='spine'?{description:Catalog.spine(this.root,asset)}:{})]:[];
    result.skill=Settings.styles.find(row=>row.id===request.style);result.settings=Settings.effective(request.style,{HeroSkills:this.data});return result;
  }
}
module.exports={SkillService,Service:SkillService,FILES};
