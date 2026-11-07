'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),url=require('url');
const Units=require('../../game-data-editor/lib/unit-assets');
const JSONDocument=require('../../game-data-editor/lib/json-document');
const clone=value=>JSON.parse(JSON.stringify(value)),hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function read(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
class Service{
  constructor(root,options){this.root=path.resolve(root);this.relativeFile=options&&options.file||'assets/resources/characters/catalog.json';this.file=path.join(this.root,this.relativeFile);this.version=0;this.reload();}
  reload(){this.text=fs.readFileSync(this.file,'utf8');this.revision=hash(this.text);this.original=JSON.parse(this.text);this.data=clone(this.original);this.version++;return this.snapshot();}
  snapshot(){return {version:this.version,revision:this.revision,dirty:!JSONDocument.equal(this.original,this.data),data:clone(this.data),savedData:clone(this.original)};}
  check(request){if(!request||request.version!==this.version)throw Error('The character draft changed in another window. Reload the latest draft before editing.');}
  assets(){return read(path.join(this.root,'assets/resources/character-parts/catalog.json'));}
  units(){
    const cfg=read(path.join(this.root,'assets/KinghtFallConfig/GameJsonCfg.json')),entries=read(path.join(this.root,'assets/resources/localization/catalog.json')).entries;
    const text=value=>String(value||'').replace(/\[\[loc:([^\]]+)\]\]/g,(m,key)=>entries[key]&&entries[key].en||m);
    const result=[{type:'hero',id:'hero',key:'hero:hero:default',name:'Hero',group:'Hero'}];
    for(const type of ['ally','enemy'])for(const row of Object.values(cfg.SoldierCfg)){
      if(type==='ally'&&(!row.prefab||!fs.existsSync(path.join(this.root,'assets/KinghtFallEnemy/Play'+row.prefab+'.prefab'))))continue;
      const boss=type==='enemy'&&row.ID>=90010,form=boss?String(row.ID-90009):'default';
      result.push({type,id:String(row.ID),key:type+':'+row.ID+':'+form,name:text(row.Name||row.name)||row.prefab||'Boss form '+form,group:type==='ally'?'Allies':'Enemies'});
    }
    return result;
  }
  describe(base,noRuntime){if(!this.units().some(u=>u.type===base.type&&u.id===String(base.id)))throw Error('Choose an existing character base.');return Units.describe(this.root,{type:base.type,id:base.id,noRuntime:!!noRuntime});}
  load(){return {...this.snapshot(),parts:this.assets().parts,units:this.units()};}
  validate(data){
    if(!data||data.version!==1||!data.profiles||typeof data.profiles!=='object'||Array.isArray(data.profiles)||!data.assignments||typeof data.assignments!=='object'||Array.isArray(data.assignments))throw Error('Invalid character document.');
    const assets=new Map(this.assets().parts.map(p=>[p.id,p])),units=this.units();
    for(const [id,profile]of Object.entries(data.profiles)){
      if(!/^[a-z][a-z0-9_-]{0,63}$/.test(id)||!profile||typeof profile.name!=='string'||!profile.name.trim()||profile.name.length>100)throw Error('Choose a valid character name and identifier.');
      if(!profile.base||!Array.isArray(profile.parts)||profile.parts.length>40)throw Error('Invalid character base or part list.');
      const rig=this.describe(profile.base,true),layers=new Map(rig.layers.map(l=>[l.uuid,l])),ids=new Set(),targets=new Set();
      if(profile.scale!==undefined&&(typeof profile.scale!=='number'||!Number.isFinite(profile.scale)||profile.scale<.1||profile.scale>4))throw Error(profile.name+': character size must be between 0.1 and 4.');
      for(const [layer,skin]of Object.entries(profile.skins||{}))if(!layers.has(layer)||!layers.get(layer).skins.includes(skin))throw Error(profile.name+': missing model skin.');
      for(const [layer,model]of Object.entries(profile.models||{})){
        if(!layers.has(layer)||!model||typeof model!=='object'||Array.isArray(model))throw Error(profile.name+': missing original model layer.');
        for(const key of ['x','y','rotation','scaleX','scaleY','opacity'])if(model[key]!==undefined){
          const value=model[key];if(typeof value!=='number'||!Number.isFinite(value)||(['x','y'].includes(key)&&Math.abs(value)>4096)||(key==='rotation'&&Math.abs(value)>3600)||(['scaleX','scaleY'].includes(key)&&(value<.01||value>20))||(key==='opacity'&&(value<0||value>1)))throw Error(profile.name+': invalid model '+key+'.');
        }
      }
      for(const p of profile.parts){
        if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id))throw Error(profile.name+': part identifiers must be unique.');ids.add(p.id);
        if(!assets.has(p.sprite))throw Error(profile.name+': missing imported part '+p.sprite);
        const layer=layers.get(p.layer);if(!layer)throw Error(profile.name+': choose a model layer for '+p.id);
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
    for(const [key,id]of Object.entries(data.assignments)){
      const unit=units.find(u=>u.key===key),profile=data.profiles[id];
      if(!unit||!profile||profile.base.type!==unit.type||String(profile.base.id)!==unit.id)throw Error('A character look can only be assigned to its matching base: '+key);
    }
    return true;
  }
  change(request){this.check(request);this.validate(request.data);this.data=clone(request.data);this.version++;return this.snapshot();}
  discard(request){this.check(request);return this.reload();}
  save(request){
    this.check(request);if(JSONDocument.equal(this.original,this.data))return {...this.snapshot(),result:{saved:false,files:[]}};
    this.validate(this.data);
    const before=fs.readFileSync(this.file,'utf8');if(hash(before)!==this.revision)throw Error('The saved character file changed outside this draft. Your draft is intact; reload or copy it before saving.');
    const output=JSONDocument.patch(before,this.original,this.data),backup=path.join(this.root,'local/character-editor/backups',Date.now()+'-'+this.revision.slice(0,12)+'.json');
    fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,before,{flag:'wx'});
    const temp=this.file+'.'+crypto.randomBytes(12).toString('hex')+'.tmp';
    try{fs.writeFileSync(temp,output,{flag:'wx'});if(hash(fs.readFileSync(this.file,'utf8'))!==this.revision)throw Error('Another editor saved first. Your draft has been kept.');fs.renameSync(temp,this.file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
    this.text=output;this.revision=hash(output);this.original=clone(this.data);this.version++;
    return {...this.snapshot(),result:{saved:true,files:[this.relativeFile],backup:path.relative(this.root,backup).replace(/\\/g,'/')}};
  }
  partImage(part){return url.pathToFileURL(path.join(this.root,part.image)).href;}
}
module.exports={Service};
