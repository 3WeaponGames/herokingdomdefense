'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),url=require('url');
const Document=require('../game-data-editor/lib/json-document');
const {commit}=require('../hkd-characters/lib/asset-transaction');
const clone=value=>JSON.parse(JSON.stringify(value));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function towers(data){return (data.BuildEnum[2].levelList||[]).map((row,index)=>({row,index,key:'tower:2:'+(index+1)})).filter(item=>item.row.Tower&&['cannon','sniper'].includes(item.row.Tower.attackType));}
class ProjectilesService {
  constructor(root){this.root=path.resolve(root);this.relative='assets/resources/projectiles/catalog.json';this.file=path.join(this.root,this.relative);this.version=0;this.reload();}
  reload(){this.text=fs.readFileSync(this.file,'utf8');this.original=JSON.parse(this.text);this.data=clone(this.original);this.revision=hash(this.text);this.configRelative='assets/KinghtFallConfig/GameJsonCfg.json';this.configFile=path.join(this.root,this.configRelative);this.configText=fs.readFileSync(this.configFile,'utf8');this.configData=JSON.parse(this.configText);this.configRevision=hash(this.configText);this.originalSpeeds=Object.fromEntries(towers(this.configData).map(item=>[item.key,require('../../assets/_script/TowerCombat').settings(item.row).projectileSpeed]));this.speeds=clone(this.originalSpeeds);this.version++;return this.snapshot();}
  config(){return clone(this.configData);}
  units(){
    const data=this.config(),entries=JSON.parse(fs.readFileSync(path.join(this.root,'assets/resources/localization/catalog.json'),'utf8')).entries;
    const label=text=>String(text||'').replace(/\[\[loc:([^\]]+)\]\]/g,(_,key)=>entries[key]&&entries[key].en||key);
    const itemFile=path.join(this.root,'assets/resources/hero-items/catalog.json'),items=fs.existsSync(itemFile)?JSON.parse(fs.readFileSync(itemFile,'utf8')):{assignments:{},profiles:{}};
    const select=require('../../assets/_script/ProjectileLooks').select;
    const previewTiers=data.EquipCfg.find(row=>row.id===3).levelInfo.map(level=>{const profile=items.profiles[items.assignments['3:'+level.Level]],choice=select({assets:this.data.assets,assignments:{},heroArrowLayer:this.data.heroArrowLayer},'hero',level.Level,profile);return {level:level.Level,flight:choice.flight||'hero-skin:'+level.EquipSkin,tint:choice.tint};});
    return [{key:'hero',name:'Hero · follows equipped Arrow item',speed:500,defaultFlight:previewTiers[0].flight,previewTiers},{key:'tower',name:'Castle & arrow towers',speed:550,defaultFlight:'original:arrow'}].concat(towers(data).map(item=>({key:item.key,name:label(item.row.Name),speed:this.speeds[item.key],speedEditable:true,builtinFlight:item.row.Tower.attackType})),[{key:'wall-defense',name:'Wall-defense mode · all cards',speed:'Authored battle setting',defaultFlight:'original:wall-arrow'}],Object.values(data.SoldierCfg).filter(row=>row.AttackType===2).map(row=>({key:'enemy:'+row.ID,name:label(row.Name)+' · Enemy',speed:500,defaultFlight:row.ID===90008?'original:fireball':row.ID===90005?'original:stone':'original:arrow'})),Object.values(data.AllyCfg||{}).filter(row=>row.AttackType===2).map(row=>({key:'ally:'+row.ID,name:label(row.Name)+' · Ally',speed:500,defaultFlight:'original:arrow'})));
  }
  dirty(){return !Document.equal(this.original,this.data)||!Document.equal(this.originalSpeeds,this.speeds);}
  snapshot(){return {version:this.version,revision:this.revision,data:clone(this.data),speeds:clone(this.speeds),dirty:this.dirty(),units:this.units()};}
  check(request){if(!request||request.version!==this.version)throw Error('Another panel changed the projectile drafts. Reload before editing.');}
  load(){if(!this.dirty()&&(hash(fs.readFileSync(this.file))!==this.revision||hash(fs.readFileSync(this.configFile))!==this.configRevision))return this.reload();return this.snapshot();}
  validate(data){
    if(!data||data.version!==1||!data.assignments||Array.isArray(data.assignments))throw Error('Invalid projectile catalog');
    if(!Document.equal(data.assets,this.original.assets)||!Document.equal(data.source,this.original.source)||data.heroArrowLayer!==this.original.heroArrowLayer)throw Error('Projectile library entries are read-only; reimport assets using the importer.');
    const units=new Set(this.units().map(u=>u.key)),assets=new Map(data.assets.map(a=>[a.id,a]));
    for(const [key,value]of Object.entries(data.assignments)){
      // Preserve future/legacy assignments unchanged; validate every real edit.
      if(Document.equal(value,this.original.assignments[key]))continue;
      if(!units.has(key)||!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose an existing ranged unit: '+key);
      for(const field of ['flight','launch','impact'])if(value[field]){
        const asset=assets.get(value[field]);if(!asset)throw Error('Missing projectile asset '+value[field]);
        if(field!=='flight'&&asset.kind!=='flipbook')throw Error('Launch and impact effects must be finite flipbook clips.');
      }
      if(value.size!==undefined&&(!Number.isFinite(value.size)||value.size<4||value.size>512))throw Error('Visual size must be between 4 and 512.');
      if(value.rotation!==undefined&&(!Number.isFinite(value.rotation)||Math.abs(value.rotation)>360))throw Error('Visual rotation must be between -360 and 360.');
      if(value.tint!==undefined&&!/^#[a-f0-9]{6}$/i.test(value.tint))throw Error('Choose a valid projectile tint.');
    }
    return true;
  }
  validateSpeeds(speeds){if(!speeds||Array.isArray(speeds)||Object.keys(speeds).length!==Object.keys(this.originalSpeeds).length)throw Error('Invalid tower speed drafts.');for(const [key,value]of Object.entries(speeds)){if(!Object.prototype.hasOwnProperty.call(this.originalSpeeds,key)||!Number.isFinite(value)||value<1||value>20000)throw Error('Projectile speed must be between 1 and 20000: '+key);}}
  change(request){this.check(request);this.validate(request.data);const speeds=request.speeds===undefined?this.speeds:request.speeds;this.validateSpeeds(speeds);if(!Document.equal(this.data,request.data)||!Document.equal(this.speeds,speeds)){this.data=clone(request.data);this.speeds=clone(speeds);this.version++;}return this.snapshot();}
  discard(request){this.check(request);return this.reload();}
  save(request){
    this.check(request);if(!this.dirty())return {...this.snapshot(),result:{saved:false,files:[]}};
    this.validate(this.data);const before=fs.readFileSync(this.file);if(hash(before)!==this.revision)throw Error('Projectile catalog changed outside this draft. Save cancelled; drafts retained.');
    this.validateSpeeds(this.speeds);const configBefore=fs.readFileSync(this.configFile);if(hash(configBefore)!==this.configRevision)throw Error('Building data changed outside this draft. Save cancelled; projectile drafts retained.');
    const files=new Map();if(!Document.equal(this.original,this.data))files.set(this.relative,Document.patch(this.text,this.original,this.data));
    if(!Document.equal(this.originalSpeeds,this.speeds)){const data=clone(this.configData);for(const item of towers(data))if(this.speeds[item.key]!==this.originalSpeeds[item.key])item.row.Tower.projectileSpeed=this.speeds[item.key];files.set(this.configRelative,Document.patch(this.configText,this.configData,data));}
    const result=commit(this.root,files,[[this.file,before],[this.configFile,configBefore]],this.relative);
    this.reload();return {...this.snapshot(),result:{saved:true,...result}};
  }
  describe(request){
    const asset=this.data.assets.find(a=>a.id===request.id);if(!asset)throw Error('Choose a projectile');
    if(asset.kind!=='spine')return {asset,layers:[]};
    const file=path.join(this.root,'assets',asset.bundle||'resources',asset.resource+'.json'),atlas=fs.readFileSync(file.replace(/\.json$/,'.atlas'),'utf8'),pages={};
    const lines=atlas.split(/\r?\n/);lines.forEach((line,i)=>{if(line.trim()&&(!i||!lines[i-1].trim())&&/^(size|format):/.test((lines[i+1]||'').trim()))pages[line.trim()]=url.pathToFileURL(path.join(path.dirname(file),line.trim())).href;});
    return {asset,runtimePath:require('../game-data-editor/lib/unit-assets').enginePath(),layers:[{name:asset.name,json:JSON.parse(fs.readFileSync(file,'utf8')),atlas,pages,skin:asset.skin,x:0,y:0,scaleX:1,scaleY:1,rotation:asset.rotation||0}]};
  }
}
module.exports={ProjectilesService};
