'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const PNG=require('./png-atlas'),Library=require('./unit-library'),Core=require('../../../assets/_script/CharacterPartsCore');
const Document=require('../../game-data-editor/lib/json-document');
const clone=value=>JSON.parse(JSON.stringify(value));
const uuid=value=>{const h=crypto.createHash('sha256').update('hkd-native-unit:'+value).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
function duration(animation){let result=0;function visit(value){if(!value||typeof value!=='object')return;if(typeof value.time==='number')result=Math.max(result,value.time);Object.values(value).forEach(visit);}visit(animation);return result;}
function readAtlas(layer,read){
  const regions={},lines=layer.atlas.split(/\r?\n/);let page=null,current=null;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];if(!line.trim()){current=null;continue;}
    if(!line.includes(':')){
      if(!i||!lines[i-1].trim()){page=require('url').fileURLToPath(layer.pages[line.trim()]);current=null;}
      else{current={page,rotate:false};regions[line.trim()]=current;}
    }else if(current){const at=line.indexOf(':'),key=line.slice(0,at).trim(),value=line.slice(at+1).trim();if(key==='xy'||key==='size'||key==='orig'||key==='offset')current[key]=value.split(',').map(Number);if(key==='rotate')current.rotate=value==='true';}
  }
  const decoded=new Map();
  return name=>{const r=regions[name];if(!r)throw Error('Missing imported atlas region: '+name);if(!decoded.has(r.page))decoded.set(r.page,PNG.decode(read(r.page)));const image=decoded.get(r.page);return PNG.crop(image,r.xy[0],r.xy[1],r.rotate?r.size[1]:r.size[0],r.rotate?r.size[0]:r.size[1],r.rotate);};
}
function textureMeta(relative,width,height){return{ver:'2.3.7',uuid:uuid(relative),importer:'texture',type:'sprite',wrapMode:'clamp',filterMode:'bilinear',premultiplyAlpha:false,genMipmaps:false,packable:false,width,height,platformSettings:{},subMetas:{[path.basename(relative,'.png')]:{ver:'1.0.6',uuid:uuid(relative+'#sprite'),importer:'sprite-frame',rawTextureUuid:uuid(relative),trimType:'none',trimThreshold:1,rotated:false,offsetX:0,offsetY:0,trimX:0,trimY:0,width,height,rawWidth:width,rawHeight:height,borderTop:0,borderBottom:0,borderLeft:0,borderRight:0,subMetas:{}}}};}
function preserveMetadata(root,files,read){
  const previous=file=>fs.existsSync(path.join(root,file))?JSON.parse(read(path.join(root,file))):{},textures=new Map();
  for(const [file,bytes]of [...files])if(file.endsWith('.png.meta')){
    const next=JSON.parse(bytes),old=previous(file),result=Object.assign({},next,old,{width:next.width,height:next.height,subMetas:Object.assign({},old.subMetas)});
    for(const [name,frame]of Object.entries(next.subMetas)){result.subMetas[name]=Object.assign({},frame,(old.subMetas||{})[name],{rawTextureUuid:result.uuid,width:frame.width,height:frame.height,rawWidth:frame.rawWidth,rawHeight:frame.rawHeight});}
    textures.set(next.uuid,result.uuid);files.set(file,JSON.stringify(result,null,2)+'\n');
  }
  for(const [file,bytes]of [...files])if(file.endsWith('.meta')&&!file.endsWith('.png.meta')){
    const next=JSON.parse(bytes),result=Object.assign({},next,previous(file));if(next.textures)result.textures=next.textures.map(id=>textures.get(id)||id);files.set(file,JSON.stringify(result,null,2)+'\n');
  }
}
function retime(rig,contract){
  const hit=require('./hit-animation').reaction(rig);
  const animations={};for(const [name,original]of Object.entries(contract.animations)){
    const source=rig.animations[name]||rig.animations[name==='die'?'dead1':'idle'];if(!source)throw Error('Replacement model has no '+name+' animation');
    const result=clone(source),from=duration(source),to=original.duration;
    function visit(value){if(!value||typeof value!=='object')return;if(typeof value.time==='number')value.time=Number((from?value.time*to/from:value.time).toFixed(7));Object.values(value).forEach(visit);}visit(result);
    if(original.events&&original.events.length)result.events=clone(original.events);else delete result.events;animations[name]=result;
  }animations.hit=hit;rig.animations=animations;rig.events=clone(contract.events||{});
}
function bake(root,profile,id,contract,assets,read,options){
  if(!options&&profile.base.source){
    const source=Library.load(root).sources.find(s=>s.id===profile.base.source);
    if(source){read(path.join(root,source.skeleton));read(path.join(root,source.skeleton.replace(/\.json$/,'.atlas')));}
    if(profile.base.mount){const horse=profile.base.mount==='legacy-cavalry'?'assets/KinghtFallEnemyAni/wqyl_qb/wqyl_qb.json':'assets/KinghtFallEnemyAni/wqyl_lead/wqyl_lead_ma/wqyl_lead_ma.json';read(path.join(root,horse));read(path.join(root,horse.replace(/\.json$/,'.atlas')));}
  }
  const description=options&&options.description||(profile.base.source?require('./mounts').describe(root,profile.base,true):null);
  if(description&&description.layers.length>1){
    const pieces=description.layers.map(layer=>bake(root,Object.assign({},profile,{parts:profile.parts.filter(p=>p.layer===layer.uuid)}),id,contract,assets,read,{raw:true,description:{layers:[layer],fitHeight:description.fitHeight}}));
    const mounts=require('./mounts'),merged=mounts.merge(pieces);mounts.bindRider(root,merged,description);merged.rig._unitSource=profile.base.source;merged.rig._unitLook=id;return outputFiles(root,profile,id,merged.rig,merged.pictures,read);
  }
  if(!description)throw Error('Choose a Character Maker or monster base before saving this unit');
  const layer=description.layers[0],rig=clone(layer.json),cut=readAtlas(layer,read),pictures={};
  const skinName=profile.skins&&profile.skins[layer.uuid]||layer.skin||'default';
  rig.skins=[clone(rig.skins.find(s=>s.name===skinName)||rig.skins[0])];rig.skins[0].name='default';
  for(const animation of Object.values(rig.animations))if(animation.deform){const deform=animation.deform[skinName];animation.deform=deform?{default:deform}:{};}
  const attachments=rig.skins[0].attachments,slots=new Map(rig.slots.map(slot=>[slot.name,slot])),replaced=new Set(),hidden=new Set();
  for(const part of profile.parts){
    if(part.layer!==layer.uuid)throw Error('Part belongs to a different imported base: '+part.id);
    const slot=slots.get(part.slot),asset=assets.get(part.sprite);if(!slot||!asset)throw Error('Missing part or equipment slot: '+part.id);
    const region='part_'+part.id,texture=PNG.decode(read(path.join(root,asset.image)));pictures[region]=texture;
    slot.bone=part.bone;slot.attachment=region;
    attachments[slot.name]={[region]:{path:region,x:part.x,y:part.y,rotation:part.rotation,scaleX:part.scaleX,scaleY:part.scaleY,width:asset.width,height:asset.height,color:(part.tint||'#ffffff').slice(1)+Math.round(part.opacity*255).toString(16).padStart(2,'0')}};
    const visibility=/^Rider\//.test(slot.name)&&slots.get('Rider/Body');
    if(part.forceVisible)slot.color=(slot.color||'ffffffff').slice(0,6)+(visibility?(visibility.color||'ffffffff').slice(6,8):'ff');
    for(const anim of Object.values(rig.animations)){
      if(anim.slots&&anim.slots[slot.name]){delete anim.slots[slot.name].attachment;if(part.forceVisible){const source=visibility&&anim.slots[visibility.name]&&anim.slots[visibility.name].color;if(source)anim.slots[slot.name].color=source.map(frame=>({time:frame.time,color:(slot.color||'ffffffff').slice(0,6)+frame.color.slice(6,8)}));else if(anim.slots[slot.name].color)for(const frame of anim.slots[slot.name].color)frame.color=frame.color.slice(0,6)+'ff';}}
      if(anim.deform)for(const skin of Object.values(anim.deform))delete skin[slot.name];
    }
    replaced.add(slot.name);(part.hideSlots||[]).forEach(name=>hidden.add(name));
  }
  if(profile.faceless)for(const slot of rig.slots)if(Core.isFacialSlot(slot.name))hidden.add(slot.name);
  for(const name of hidden){const slot=slots.get(name);if(!slot)continue;delete slot.attachment;attachments[name]={};for(const anim of Object.values(rig.animations))if(anim.slots&&anim.slots[name]){delete anim.slots[name].attachment;}}
  for(const part of profile.parts){const at=rig.slots.findIndex(slot=>slot.name===part.slot);if(at>=0&&part.order){const slot=rig.slots.splice(at,1)[0];rig.slots.splice(Math.max(0,Math.min(rig.slots.length,at+part.order)),0,slot);}}
  for(const [slotName,variants]of Object.entries(attachments))for(const [name,attachment]of Object.entries(variants)){
    const region=attachment.path||attachment.name||name;if(!pictures[region])pictures[region]=cut(region);
  }
  const skinTint=Core.skinTint(profile);
  if(skinTint){
    const tint=color=>[0,2,4].map(at=>Math.round(parseInt(color.slice(at,at+2),16)*parseInt(skinTint.slice(at+1,at+3),16)/255).toString(16).padStart(2,'0')).join('')+color.slice(6,8);
    for(const slot of rig.slots)if(Core.isSkinSlot(slot.name))slot.color=tint(slot.color||'ffffffff');
    for(const animation of Object.values(rig.animations))for(const [name,slot]of Object.entries(animation.slots||{}))if(Core.isSkinSlot(name))for(const frame of slot.color||[])frame.color=tint(frame.color);
  }
  retime(rig,contract);
  // Preserve the old unit's world footprint, callback duration and hit events.
  // The hero and every combat statistic/timing table are left untouched.
  const factor=contract.height/(description.fitHeight||rig.skeleton.height||120),model=profile.models&&profile.models[layer.uuid]||{},scale=profile.scale||1;
  rig.bones.unshift({name:'__game_fit',x:((layer.x||0)*scale+(model.x||0))*factor,y:((layer.y||0)*scale+(model.y||0))*factor,rotation:(layer.angle||0)+(model.rotation||0),scaleX:factor*scale*(layer.scaleX===undefined?1:layer.scaleX)*(model.scaleX===undefined?1:model.scaleX),scaleY:factor*scale*(layer.scaleY===undefined?1:layer.scaleY)*(model.scaleY===undefined?1:model.scaleY)});for(let i=1;i<rig.bones.length;i++)if(!rig.bones[i].parent)rig.bones[i].parent='__game_fit';
  for(const skin of rig.skins)for(const variants of Object.values(skin.attachments))for(const a of Object.values(variants))if(a.vertices&&a.uvs&&a.vertices.length!==a.uvs.length)for(let i=0;i<a.vertices.length;){const count=a.vertices[i++];for(let j=0;j<count;j++){a.vertices[i]++;i+=4;}}
  if(model.opacity!==undefined){const fade=color=>color.slice(0,6)+Math.round(parseInt(color.slice(6,8),16)*model.opacity).toString(16).padStart(2,'0');for(const slot of rig.slots)slot.color=fade(slot.color||'ffffffff');for(const anim of Object.values(rig.animations))for(const slot of Object.values(anim.slots||{}))for(const key of slot.color||[])key.color=fade(key.color);}
  if(model.tint){const tint=color=>[0,2,4].map(at=>Math.round(parseInt(color.slice(at,at+2),16)*parseInt(model.tint.slice(at+1,at+3),16)/255).toString(16).padStart(2,'0')).join('')+color.slice(6,8);for(const slot of rig.slots)slot.color=tint(slot.color||'ffffffff');for(const anim of Object.values(rig.animations))for(const slot of Object.values(anim.slots||{}))for(const frame of slot.color||[])frame.color=tint(frame.color);}
  rig._unitSource=profile.base.source;rig._unitLook=id;rig.skeleton.height=contract.height;rig.skeleton.width*=factor;
  if(options&&options.raw)return{rig,pictures};
  return outputFiles(root,profile,id,rig,pictures,read);
}
function outputFiles(root,profile,id,rig,pictures,read){
  const image=PNG.pack(pictures),output='assets/resources/unit-library/runtime/'+id.replace(/[^a-zA-Z0-9_-]/g,'_'),atlasName=path.basename(output)+'.png';
  const lines=['',atlasName,'size: '+image.width+','+image.height,'format: RGBA8888','filter: Linear,Linear','repeat: none'];
  for(const [name,p]of Object.entries(image.positions))lines.push(name,'  rotate: false','  xy: '+p.x+', '+p.y,'  size: '+p.width+', '+p.height,'  orig: '+p.width+', '+p.height,'  offset: 0, 0','  index: -1');
  const files=new Map([[output+'.json',JSON.stringify(rig,null,2)+'\n'],[output+'.atlas',lines.join('\n')+'\n'],[output+'.png',PNG.encode(image)],
    [output+'.json.meta',JSON.stringify({ver:'1.2.5',uuid:uuid(output+'.json'),importer:'spine',textures:[uuid(output+'.png')],scale:1,subMetas:{}},null,2)+'\n'],
    [output+'.atlas.meta',JSON.stringify({ver:'1.0.3',uuid:uuid(output+'.atlas'),importer:'asset',subMetas:{}},null,2)+'\n'],
    [output+'.png.meta',JSON.stringify(textureMeta(output+'.png',image.width,image.height),null,2)+'\n']]);
  preserveMetadata(root,files,read);
  return{uuid:JSON.parse(files.get(output+'.json.meta')).uuid,files,source:profile.base.source};
}
function plan(root,data,assets,original){
  const contractFile=path.join(root,'assets/resources/unit-library/runtime/contracts.json');
  if(!fs.existsSync(contractFile))return{data,files:new Map(),reads:new Map()};
  const contracts=JSON.parse(fs.readFileSync(contractFile,'utf8')),files=new Map(),reads=new Map(),prefabs=new Map(),updated=clone(data);
  if(!contracts.enabled)return{data,files,reads};
  const read=file=>{file=path.resolve(file);if(!reads.has(file))reads.set(file,fs.readFileSync(file));return reads.get(file);};
  read(contractFile);
  for(const [key,contract]of Object.entries(contracts.units)){
    const id=data.assignments[key],profile=id&&updated.profiles[id];let target=contract.defaultUuid;
    if(profile&&profile.base.source){
      if(profile.baked&&original&&Document.equal(original.profiles[id],profile))target=profile.baked.uuid;
      else{const result=bake(root,profile,id,contract,new Map(assets.map(p=>[p.id,p])),read);for(const [file,bytes]of result.files)files.set(file,bytes);target=result.uuid;profile.baked=Object.assign({},profile.baked,{uuid:result.uuid,source:result.source});}
    }
    const file=path.join(root,contract.prefab);if(!prefabs.has(file)){const text=read(file).toString('utf8');prefabs.set(file,{text,original:JSON.parse(text),data:JSON.parse(text)});}
    const prefab=prefabs.get(file).data,component=prefab[contract.component];component._N$skeletonData={__uuid__:target};component.defaultSkin='default';
  }
  for(const [file,prefab]of prefabs)if(!Document.equal(prefab.original,prefab.data))files.set(path.relative(root,file),Document.patch(prefab.text,prefab.original,prefab.data));
  return{data:updated,files,reads};
}
module.exports={bake,plan,retime,duration,uuid,textureMeta,readAtlas,preserveMetadata};
