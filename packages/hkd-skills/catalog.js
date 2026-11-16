'use strict';
const fs=require('fs'),path=require('path'),url=require('url');
const AUDIO=/\.(wav|mp3|ogg|m4a|aac|flac|aif|aiff|opus|webm)$/i;
function read(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function walk(folder,visit){if(!fs.existsSync(folder))return;for(const entry of fs.readdirSync(folder,{withFileTypes:true})){if(entry.isSymbolicLink())continue;const file=path.join(folder,entry.name);if(entry.isDirectory())walk(file,visit);else visit(file);}}
function bundle(root,file){
  for(let folder=path.dirname(file);folder.startsWith(path.join(root,'assets')+path.sep);folder=path.dirname(folder)){
    if(folder===path.join(root,'assets','resources'))return {bundle:'resources',path:path.relative(folder,file).replace(/\\/g,'/').replace(/\.[^.]+$/,'')};
    try{const meta=read(folder+'.meta');if(meta.isBundle)return {bundle:meta.bundleName||path.basename(folder),path:path.relative(folder,file).replace(/\\/g,'/').replace(/\.[^.]+$/,'')};}catch(_){}
  }
  return null;
}
function spine(root,asset){
  const file=path.join(root,asset.file),json=read(file),atlasFile=file.replace(/\.json$/i,'.atlas'),atlas=fs.readFileSync(atlasFile,'utf8'),pages={},lines=atlas.split(/\r?\n/);
  for(let i=0;i<lines.length;i++)if(lines[i].trim()&&(i===0||!lines[i-1].trim())&&/^(size|format):/.test((lines[i+1]||'').trim())){
    const name=lines[i].trim(),texture=path.resolve(path.dirname(file),name);if(path.dirname(texture)!==path.dirname(file)||!fs.existsSync(texture))throw Error('Missing VFX atlas page '+name);pages[name]=url.pathToFileURL(texture).href;
  }
  return {layers:[{uuid:asset.uuid,source:asset.file,name:asset.name,json,atlas,pages,skin:asset.skin||(json.skins||[])[0]?.name||'default',animation:asset.animation||asset.animations[0]||'',x:0,y:0,scaleX:1,scaleY:1,skins:(json.skins||[]).map(s=>s.name),animations:asset.animations}]};
}
function projectileAssets(root){
  const file=path.join(root,'assets/resources/projectiles/catalog.json');if(!fs.existsSync(file))return [];
  const data=read(file),assets=data.assets||[],result=[];
  for(const asset of assets.filter(row=>row.role==='flight'))try{
    const kind=asset.kind==='spine'?'spine':'sprite',bundleName=asset.bundle||'resources',source=require('../game-data-editor/lib/asset-validation').imported(root,bundleName,asset.resource,kind);
    const uuid=kind==='spine'?source.meta.uuid:Object.values(source.meta.subMetas||{}).find(row=>row.importer==='sprite-frame').uuid;
    const item={id:asset.id,uuid,name:asset.name,category:asset.category,kind,bundle:bundleName,path:asset.resource,file:path.relative(root,source.file).replace(/\\/g,'/'),url:url.pathToFileURL(source.file).href,rotation:asset.rotation||0};
    if(kind==='spine')Object.assign(item,{skin:asset.skin,animation:asset.animation,animations:Object.keys(source.data.animations)});
    if(asset.kind==='flipbook')item.flipbook={frames:asset.frames,columns:asset.columns,cell:asset.cell,fps:asset.fps,loop:!!asset.loop};
    if(typeof asset.premultipliedAlpha==='boolean')item.premultipliedAlpha=asset.premultipliedAlpha;
    const trail=(data.trails||[]).find(trail=>trail.id===asset.trail);if(trail)item.trail=trail;
    result.push(item);
  }catch(_){/* Unavailable imported assets stay out of new selections. */}
  return result;
}
function index(root){
  root=path.resolve(root);const audio=[],vfx=[],seen=new Set();
  let projectiles=[];try{projectiles=read(path.join(root,'assets/resources/projectiles/catalog.json')).assets||[];}catch(_){}
  try{projectiles=projectiles.concat(read(path.join(root,'assets/resources/vfx/hero-skills/catalog.json')).clips||[]);}catch(_){}
  function record(file,kind){
    let meta;try{meta=read(file+'.meta');}catch(_){return;}
    const location=bundle(root,file);if(!location)return;
    let uuid=meta.uuid;
    if(kind==='sprite'){const sub=Object.values(meta.subMetas||{}).find(row=>row.importer==='sprite-frame');if(!sub)return;uuid=sub.uuid;}
    if(typeof uuid!=='string'||seen.has(uuid))return;seen.add(uuid);
    const item={id:uuid,uuid,file:path.relative(root,file).replace(/\\/g,'/'),name:path.basename(file,path.extname(file)).replace(/[_-]+/g,' '),url:url.pathToFileURL(file).href,...location};
    if(location.bundle==='resources')item.resource=location.path;
    if(kind==='audio')audio.push(item);
    else {item.kind=kind;if(kind==='spine'){let json;try{json=read(file);if(!json.skeleton||!json.animations)return;}catch(_){return;}item.animations=Object.keys(json.animations);}else{const authored=projectiles.find(row=>row.kind==='flipbook'&&row.resource===location.path&&(row.bundle||'resources')===location.bundle);if(authored){const value=require('../../assets/_script/HeroSkillSettings').flipbook({resourceFrames:authored.frames,resourceColumns:authored.columns,resourceCell:authored.cell,resourceFps:authored.fps,resourceLoop:!!authored.loop});if(value)item.flipbook=value;item.name=authored.name||item.name;item.skillVfx=authored.slot;item.clipId=authored.id;}}vfx.push(item);}
  }
  ['assets/KinghtFallAudio','assets/audio','assets/gad_audios','assets/resources/sfx','assets/resources/voices'].forEach(folder=>walk(path.join(root,folder),file=>{if(AUDIO.test(file))record(file,'audio');}));
  const effectsFolders=['assets/KinghtFallEffect','assets/resources/projectiles','assets/resources/vfx'];
  const library=path.join(root,'assets/resources/unit-library');if(fs.existsSync(library))for(const pack of fs.readdirSync(library,{withFileTypes:true}))if(pack.isDirectory()&&!pack.isSymbolicLink())for(const section of fs.readdirSync(path.join(library,pack.name),{withFileTypes:true}))if(section.isDirectory()&&/^effects?$/i.test(section.name))effectsFolders.push('assets/resources/unit-library/'+pack.name+'/'+section.name);
  effectsFolders.forEach(folder=>walk(path.join(root,folder),file=>{
    if(/\.json$/i.test(file)){let meta;try{meta=read(file+'.meta');}catch(_){return;}if(meta.importer==='spine')record(file,'spine');}
    else if(/\.png$/i.test(file)){
      // A Spine atlas page is not a standalone effect sprite.
      const paired=file.replace(/\.png$/i,'.json');if(fs.existsSync(paired+'.meta'))try{if(read(paired+'.meta').importer==='spine')return;}catch(_){}
      record(file,'sprite');
    }
  }));
  let heroArrowTiers=[];try{heroArrowTiers=read(path.join(root,'assets/resources/projectiles/catalog.json')).heroArrowTiers||[];}catch(_){}
  const sorted=rows=>rows.sort((a,b)=>a.file.localeCompare(b.file));return {audio:sorted(audio),vfx:sorted(vfx),projectiles:projectileAssets(root),heroArrowTiers};
}
module.exports={index,bundle,spine,projectiles:projectileAssets};
