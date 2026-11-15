'use strict';
// Test input only: describe the exact imported visual prefabs and their UUID
// dependencies for an isolated real-engine scene. Never writes project data.
const fs=require('node:fs'),path=require('node:path');
function records(root){
  root=path.resolve(root);const indexed=new Map(),assets={},prefabs={},missing=[];
  const relative=file=>path.relative(root,file).replace(/\\/g,'/');
  function scan(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,item.name);if(item.isDirectory())scan(file);else if(file.endsWith('.meta')){
      const meta=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')),source=file.slice(0,-5);
      if(!fs.existsSync(source)||!fs.statSync(source).isFile())continue;
      if(meta.uuid)indexed.set(meta.uuid,{file:source,meta});
      function sub(entries){for(const value of Object.values(entries||{})){if(value.uuid)indexed.set(value.uuid,{file:source,meta:value});sub(value.subMetas);}}
      sub(meta.subMetas);
    }
  }}
  scan(path.join(root,'assets/gad_prefabs'));
  function references(value){
    if(!value||typeof value!=='object')return;
    if(typeof value.__uuid__==='string')resolve(value.__uuid__);
    for(const child of Object.values(value))references(child);
  }
  function resolve(uuid){
    if(Object.prototype.hasOwnProperty.call(assets,uuid))return;
    const source=indexed.get(uuid);
    if(!source){
      // Sprite materials are supplied by the isolated internal engine bundle.
      // The absent particle source is obsolete on custom emitters: all of its
      // authored values and SpriteFrame are serialized directly in the prefab.
      assets[uuid]={kind:uuid==='eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432'?'builtin-material':'missing',uuid};
      if(assets[uuid].kind==='missing')missing.push(uuid);return;
    }
    const {file,meta}=source,extension=path.extname(file),entry=assets[uuid]={uuid,meta,file:relative(file)};
    if(extension==='.png'){
      entry.kind=meta.importer==='sprite-frame'?'sprite-frame':'texture';entry.image=relative(file);
      if(meta.rawTextureUuid)resolve(meta.rawTextureUuid);
    }else if(extension==='.anim'){
      entry.kind='animation';entry.data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));references(entry.data);
    }else if(extension==='.plist'){
      entry.kind='particle';entry.text=fs.readFileSync(file,'utf8');
    }else if(extension==='.mtl'){
      entry.kind='material';entry.data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));references(entry.data);
    }else throw Error('Unexpected projectile prefab dependency '+relative(file));
  }
  for(let index=1;index<=18;index++){
    const resource='bullets/PBT_Bullet_'+index,file=path.join(root,'assets/gad_prefabs',resource+'.prefab'),data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
    prefabs[resource]=data;references(data);
  }
  const file=path.join(root,'assets/_script/GAD_BulletEffect.js'),module={source:fs.readFileSync(file,'utf8'),uuid:JSON.parse(fs.readFileSync(file+'.meta','utf8').replace(/^\uFEFF/,'')).uuid};
  return {prefabs,assets,missing:missing.sort(),modules:{GAD_BulletEffect:module}};
}
module.exports={records};
