'use strict';
// The hero keeps its seven native renderers and gameplay event contract. Each
// rider layer uses the same Maker bones, so independently upgraded equipment
// follows the same pose in the lobby, editors, web and JSB builds.
const fs=require('fs'),path=require('path'),url=require('url');
const Bake=require('./native-bake'),PNG=require('./png-atlas'),Library=require('./unit-library'),Document=require('../../game-data-editor/lib/json-document');
const Weapons=require('../../../assets/_script/HeroWeapons'),Placement=require('./placement');
const clone=value=>JSON.parse(JSON.stringify(value));
const folder='assets/resources/hero-maker',equipmentFolder=folder+'/equipment';
const roles={shenti:0,doupeng:1,tou:2,jian:3,gong:4,shou:5};
const family={skirmisher:'Bow',fighter:'Sword',vanguard:'Spear',mystic:'Staff',bruiser:'Axe',guardian:'Blunt'};
function source(root,name,read){
  const file='assets/KinghtFallEnemyAni/wqyl_lead/wqyl_lead_'+name+'/wqyl_lead_'+name+'.json',atlas=read(path.join(root,file.replace('.json','.atlas'))).toString('utf8'),pages={};
  atlas.split(/\r?\n/).forEach((line,i,lines)=>{if(line.trim()&&(!i||!lines[i-1].trim())&&/\.png$/i.test(line.trim()))pages[line.trim()]=url.pathToFileURL(path.join(root,path.dirname(file),line.trim())).href;});
  return {name:'wqyl_lead_'+name,uuid:JSON.parse(read(path.join(root,file+'.meta'))).uuid,json:JSON.parse(read(path.join(root,file))),atlas,pages};
}
function expand(rig){
  const extras=[
    {name:'Rider/Body/Cape',parent:'Rider/Body',x:-26,y:10,rotation:-15},
    {name:'Rider/Body/Boots',parent:'Rider/Body',x:-11,y:-24},
    ...Object.entries(family).map(([style,type])=>({name:'Rider/Gloves/'+style,parent:'Rider/HandRight/'+type,x:10,y:0}))
  ];
  // Bow's visible item is a child of its aiming bone. Other weapons use their
  // own animated pivot directly. Boots and cape follow the torso's motion.
  for(const bone of extras){rig.bones.push(bone);const slot={name:bone.name,bone:bone.name,color:'ffffffff'};const at=/Cape$/.test(bone.name)?rig.slots.findIndex(s=>s.name==='Rider/Body'):rig.slots.length;rig.slots.splice(at,0,slot);}
  for(const clip of Object.values(rig.animations)){
    const length=Bake.duration(clip);if(!length)continue;
    clip.bones=clip.bones||{};clip.bones['Rider/Body/Cape']={rotate:[{time:0,angle:0},{time:length*.25,angle:4},{time:length*.5,angle:0},{time:length*.75,angle:-4},{time:length,angle:0}]};
  }
  return rig;
}
function belongs(name,role){
  if(role===0)return name==='Rider/Body'||/\/Boots$|^Rider\/Dead\//.test(name);
  if(role===1)return /\/Chest$|\/Cape$/.test(name);
  if(role===2)return /^Rider\/Body\/Head(?:\/|$)/.test(name);
  if(role===3)return /\/Arrow$|\/Bolt$/.test(name);
  if(role===4)return /^Rider\/HandRight\//.test(name)&&!(/\/Arrow$|\/Bolt$/.test(name))||/^Rider\/HandLeft\//.test(name);
  return /^Rider\/Gloves\//.test(name);
}
function mapTime(clip,target,peak){
  const from=Bake.duration(clip),result=clone(clip),release=.1667;
  function visit(value){if(!value||typeof value!=='object')return;if(typeof value.time==='number')value.time=Number((peak?(value.time<=peak?value.time*release/peak:release+(value.time-peak)*(target-release)/(from-peak)):value.time*target/from).toFixed(7));Object.values(value).forEach(visit);}visit(result);return result;
}
function repeatCycle(source){
  const period=Bake.duration(source),result=clone(source);
  function visit(value){if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){
    if(Array.isArray(child)&&child.length&&child.every(frame=>frame&&typeof frame==='object'&&!Array.isArray(frame))&&child.some(frame=>typeof frame.time==='number')){
      value[key]=child.filter(frame=>(frame.time||0)<period-1e-7).concat(child.map(frame=>({...clone(frame),time:(frame.time||0)+period})));
    }else if(!Array.isArray(child))visit(child);
  }}visit(result);return result;
}
function animations(rig,original){
  const source=rig.animations,result={};
  for(const [name,contract]of Object.entries(original.animations)){
    const action=name==='move'?'walk':name==='wqyl_lead_die'?'dead1':name==='wqyl_lead_rise'?'idle':name==='wqyl_lead_up'?'victory':name;
    const clip=name==='move'?repeatCycle(source.walk):source[action]||source.idle;result[name]=mapTime(clip,Bake.duration(contract),name==='attack'?.95:0);
    if(contract.events)result[name].events=clone(contract.events);else delete result[name].events;
  }
  for(const style of Weapons.styles){if(style.id==='skirmisher')continue;const clip=mapTime(source.attack,Bake.duration(original.animations.attack),7/6);clip.events=clone(original.animations.attack.events||[]);result['attack_'+style.id]=clip;}
  rig.animations=result;rig.events=clone(original.events||{});return rig;
}
function slotFor(type){return type==='Bow'?'Rider/HandRight/Bow/Bow':type==='Arrow'?'Rider/HandRight/Bow/Arrow':type==='Chest'?'Rider/Body/Chest':type==='Helmet'?'Rider/Body/Head/Helmet':type==='Shield'?'Rider/HandLeft/Shield':'Rider/HandRight/'+type;}
function attachment(asset,slot,id){return {id:id||asset.id.replace(/[^a-z0-9]/gi,'_'),sprite:asset.id,slot,bone:slot,x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,order:0,hideSlots:[],forceVisible:true,...Placement.intended(asset)};}
function customEquipment(root,files,read){
  const entries=[];
  for(const [name,category]of [['doupeng','Cape'],['shou','Gloves'],['shenti','Boots']]){
    const original=source(root,name,read),cut=Bake.readAtlas(original,read);
    for(const skin of original.json.skins){
      const pair=Object.entries(skin.attachments).find(([slot])=>category!=='Boots'||slot==='humanr_foot');if(!pair)continue;
      const [slot,variants]=pair,[key,value]=Object.entries(variants)[0],image=cut(value.path||value.name||key),file=equipmentFolder+'/'+category.toLowerCase()+'-'+skin.name+'.png';
      files.set(file,PNG.encode(image));files.set(file+'.meta',JSON.stringify(Bake.textureMeta(file,image.width,image.height),null,2)+'\n');
      const scale=category==='Cape'?.24:category==='Gloves'?.22:.38;
      entries.push({id:'Hero/'+category+'/'+skin.name,name:'Hero '+category+' '+skin.name,category,image:file,thumbnail:file,resource:file.slice('assets/resources/'.length,-4),width:image.width,height:image.height,pixelsPerUnit:100/scale});
    }
  }
  return entries;
}
function writeRig(root,files,read,name,rig,pictures){
  const base=folder+'/wqyl_lead_'+name,image=PNG.pack(pictures),lines=['',path.basename(base)+'.png','size: '+image.width+','+image.height,'format: RGBA8888','filter: Linear,Linear','repeat: none'];
  for(const [key,p]of Object.entries(image.positions))lines.push(key,'  rotate: false','  xy: '+p.x+', '+p.y,'  size: '+p.width+', '+p.height,'  orig: '+p.width+', '+p.height,'  offset: 0, 0','  index: -1');
  files.set(base+'.json',JSON.stringify(rig,null,2)+'\n');files.set(base+'.atlas',lines.join('\n')+'\n');files.set(base+'.png',PNG.encode(image));
  files.set(base+'.json.meta',JSON.stringify({ver:'1.2.5',uuid:Bake.uuid(base+'.json'),importer:'spine',textures:[Bake.uuid(base+'.png')],scale:1,subMetas:{}},null,2)+'\n');
  files.set(base+'.atlas.meta',JSON.stringify({ver:'1.0.3',uuid:Bake.uuid(base+'.atlas'),importer:'asset',subMetas:{}},null,2)+'\n');files.set(base+'.png.meta',JSON.stringify(Bake.textureMeta(base+'.png',image.width,image.height),null,2)+'\n');
  return {base,uuid:Bake.uuid(base+'.json')};
}
function plan(root){
  const files=new Map(),reads=new Map(),read=file=>{file=path.resolve(file);const relative=path.relative(root,file).replace(/\\/g,'/');if(files.has(relative))return Buffer.from(files.get(relative));if(!reads.has(file))reads.set(file,fs.readFileSync(file));return reads.get(file);};
  const images=new Map(),decode=bytes=>{const key=require('crypto').createHash('sha256').update(bytes).digest('hex');if(!images.has(key))images.set(key,PNG.decode(bytes));return images.get(key);};
  const library=Library.describe(root,'character-maker/Character',true),maker=clone(library.layers[0]);read(path.join(root,library.source));read(path.join(root,library.source.replace('.json','.atlas')));expand(maker.json);
  const catalogFile='assets/resources/character-parts/catalog.json',text=read(path.join(root,catalogFile)).toString('utf8'),catalog=JSON.parse(text),custom=customEquipment(root,files,read),assets=new Map(catalog.parts.concat(custom).map(asset=>[asset.id,asset]));
  const replacements=new Map(),icons={},gearAssets=type=>[...assets.values()].filter(a=>a.id.startsWith(type+'/'));
  const choose=(type,tier)=>{const list=gearAssets(type);if(!list.length)throw Error('Missing Maker '+type);return list[Math.min(list.length-1,(tier-1)*3)];};
  const weapon=(style,tier)=>style==='guardian'?assets.get('HandRight/Blunt/FA_WP_Main_Blunt_'+['017_DarkGreen','017_Red','017_Sky','024_GoldPurple'][tier-1]):choose('HandRight/'+family[style],tier);
  for(const [name,role]of Object.entries(roles)){
    const original=source(root,name,read),base=clone(maker),originalUuid=original.uuid;base.uuid=Bake.uuid(folder+'/wqyl_lead_'+name+'.json');
    // 30% larger than the .6 cavalry rider, retaining the full-size hero horse.
    base.x=-12;base.y=55;base.scaleX=base.scaleY=.78;
    base.json.slots.forEach(slot=>{if(!belongs(slot.name,role))delete slot.attachment;});
    base.json.skins.forEach(skin=>{for(const slot of Object.keys(skin.attachments))if(!belongs(slot,role))delete skin.attachments[slot];});
    animations(base.json,original.json);
    const skins=role===0?['default']:role===3||role===4||role===5?['lv1','lv2','lv3','lv4','vip1','vip2',...Weapons.styles.flatMap(style=>['lv1','lv2','lv3','lv4','vip1','vip2'].map(tier=>Weapons.skin(style.id,tier)))]:['lv1','lv2','lv3','lv4'];
    let rig,pictures={};
    for(const skin of skins){
      const match=/^(skirmisher|fighter|vanguard|mystic|bruiser|guardian)_(.+)$/.exec(skin),style=match?match[1]:'skirmisher',tierName=match?match[2]:skin,tier=/^vip/.test(tierName)?4:Math.min(4,Number(tierName.replace(/\D/g,''))||1),parts=[];
      function add(asset,slot,overrides){if(!asset)throw Error('Missing hero equipment for '+slot);parts.push({...attachment(asset,slot,slot.replace(/[^a-z0-9]/gi,'_')+'_'+skin),layer:base.uuid,...overrides});}
      if(role===0)add(assets.get('Hero/Boots/default'),'Rider/Body/Boots');
      if(role===1){add(tier===1?assets.get('Chest/FA_Chest_032_Blue'):choose('Chest',tier),slotFor('Chest'),{x:-19.9,y:-5.5});add(assets.get('Hero/Cape/lv'+tier),'Rider/Body/Cape');}
      if(role===2)add(tier===1?assets.get('Helmet/FA_Helmet_047_White'):choose('Helmet',tier),slotFor('Helmet'));
      if(role===3&&style==='skirmisher')add(choose('HandRight/Arrow',tier),slotFor('Arrow'),{forceVisible:false});
      if(role===4){const type=family[style];add(weapon(style,tier),slotFor(type));if(style==='guardian')add(assets.get('HandLeft/Shield/FA_WP_Sub_Shield_012_Blue')||choose('HandLeft/Shield',tier),slotFor('Shield'));}
      if(role===5)add(assets.get('Hero/Gloves/lv'+tier),'Rider/Gloves/'+style);
      if(parts.length&&role){const asset=assets.get(parts[0].sprite);(icons[role]||(icons[role]={}))[skin]={resource:asset.resource,width:asset.width,height:asset.height,id:asset.id};}
      if(role===3&&style!=='skirmisher'){const asset=weapon(style,tier);(icons[role]||(icons[role]={}))[skin]={resource:asset.resource,width:asset.width,height:asset.height,id:asset.id};}
      const variant=clone(base);if(role===4)for(const skin of variant.json.skins)for(const slot of Object.keys(skin.attachments))if(/Bow_Line|Crossbow_Line/.test(slot)&&!(style==='skirmisher'&&/\/Bow\//.test(slot)))delete skin.attachments[slot];
      const compiled=Bake.bake(root,{base:{type:'hero',id:'hero',currentModel:true,source:'character-maker/Character'},parts,faceless:true,skinTint:'#ffbdab'},'hero-maker',{height:120,animations:{}},assets,read,{raw:true,decode,description:{layers:[variant],fitHeight:120}});
      const current=compiled.rig.skins[0];current.name=skin;
      if(!rig){rig=compiled.rig;rig.skins=[];}rig.skins.push(current);Object.assign(pictures,compiled.pictures);
      // Slot attachments differ between style skins. Each slot's stable name
      // is shared across skins, just as with the original independently skinned gear.
      for(const slot of rig.slots){const own=compiled.rig.slots.find(s=>s.name===slot.name);if(own.attachment&&own.attachment.startsWith('part_')){const variants=current.attachments[slot.name];if(variants){const [key,value]=Object.entries(variants)[0];const stable='hero_'+slot.name.replace(/[^a-z0-9]/gi,'_');delete variants[key];variants[stable]={...value,path:value.path||key};slot.attachment=stable;}}}
    }
    // A skin chooses which item is present; it must not inherit the first
    // (bow) skin's hidden shield or alternate-weapon visibility tracks.
    // The arrow alone retains its authored draw/release fade.
    if(role!==3)for(const slot of rig.slots.filter(slot=>(slot.attachment||'').startsWith('hero_'))){
      slot.color=(slot.color||'ffffffff').slice(0,6)+'ff';
      for(const clip of Object.values(rig.animations)){
        const body=clip.slots&&clip.slots['Rider/Body'],target=(clip.slots||(clip.slots={}))[slot.name]||((clip.slots)[slot.name]={});
        if(body&&body.color)target.color=body.color.map(frame=>({time:frame.time,color:slot.color.slice(0,6)+frame.color.slice(6,8)}));
        else if(target.color)target.color=target.color.map(frame=>({...frame,color:frame.color.slice(0,6)+'ff'}));
      }
    }
    rig._heroMaker={version:1,role,source:'character-maker/Character',riderScale:.78,saddle:{x:-23.13477412559174,y:63.84370483579855}};
    const written=writeRig(root,files,read,name,rig,pictures);replacements.set(originalUuid,written.uuid);
  }
  require('./current-model').folderMetadata(root,folder,files,read);require('./current-model').folderMetadata(root,equipmentFolder,files,read);
  const iconFile=folder+'/catalog.json';files.set(iconFile,JSON.stringify({version:1,icons},null,2)+'\n');files.set(iconFile+'.meta',JSON.stringify({ver:'1.3.0',uuid:Bake.uuid(iconFile),importer:'json',subMetas:{}},null,2)+'\n');
  const next=clone(catalog);for(const asset of custom){const at=next.parts.findIndex(p=>p.id===asset.id);if(at<0)next.parts.push(asset);else next.parts[at]={...next.parts[at],...asset};}files.set(catalogFile,Document.patch(text,catalog,next));
  // Update only the hero's render assets. Other prefab fields remain byte stable.
  for(const file of ['assets/KinghtFallEnemyAni/ndPlay.prefab','assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomePersonCtrl.prefab','assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab']){
    const text=read(path.join(root,file)).toString('utf8');let output=text;for(const [from,to]of replacements)output=output.split(from).join(to);files.set(file,output);
  }
  // Keep the old, unassigned helmet example usable on the new sockets. This
  // is an explicit export, never a migration triggered by opening an editor.
  const itemFile='assets/resources/hero-items/catalog.json',itemText=read(path.join(root,itemFile)).toString('utf8'),items=JSON.parse(itemText),nextItems=clone(items);
  for(const profile of Object.values(nextItems.profiles))for(const part of profile.parts)if(replacements.has(part.layer)){
    const role=Placement.role(assets.get(part.sprite)||{});if(role!=='Helmet')throw Error('Fit existing hero gear before replacing its legacy model.');
    Object.assign(part,{layer:replacements.get(part.layer),slot:slotFor('Helmet'),bone:slotFor('Helmet'),...Placement.intended(assets.get(part.sprite)),hideSlots:[]});delete profile.bakedLayers;delete profile.bakedVersion;
  }
  files.set(itemFile,Document.patch(itemText,items,nextItems));Bake.preserveMetadata(root,files,read);
  for(const relative of files.keys()){const file=path.join(root,relative);if(!reads.has(file))reads.set(file,fs.existsSync(file)?fs.readFileSync(file):null);}
  return {files,reads};
}
module.exports={plan,expand,animations,belongs,folder,family,slotFor};
