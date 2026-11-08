'use strict';

// Import reviewed, individual 128px stat icons. Generation prompts and raw
// artwork stay outside the project; this catalog describes production assets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Bake=require('../../packages/hkd-characters/lib/native-bake');
const PNG=require('../../packages/hkd-characters/lib/png-atlas');
const Tx=require('../../packages/hkd-characters/lib/asset-transaction');
const target='assets/resources/Stats Icons',manifest='tools/icons/stats-icons.catalog.json';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function plan(root,sourceDir,catalog){
  root=path.resolve(root);sourceDir=path.resolve(sourceDir);
  const records=Array.isArray(catalog)?catalog:catalog&&catalog.icons;
  if(!Array.isArray(records)||records.length!==80)throw Error('The stat icon catalog must contain exactly 80 icons.');
  const ids=new Set(),numbers=new Set(),ordered=records.slice().sort((a,b)=>a.number-b.number);
  for(const record of ordered){
    if(!record||!/^[a-z][a-z0-9-]{0,63}$/.test(record.id)||ids.has(record.id))throw Error('Stat icons need unique, safe lowercase IDs.');
    if(!Number.isInteger(record.number)||record.number<1||record.number>80||numbers.has(record.number))throw Error('Stat icons need the unique catalog numbers 1–80.');
    if(typeof record.meaning!=='string'||!record.meaning.trim())throw Error('Each stat icon needs a named meaning.');
    ids.add(record.id);numbers.add(record.number);
  }
  const sourceNames=fs.readdirSync(sourceDir).filter(name=>/\.png$/i.test(name));
  if(sourceNames.length!==80||sourceNames.some(name=>!ids.has(name.slice(0,-4))||!name.endsWith('.png')))throw Error('The prepared folder must contain exactly the catalog’s 80 named PNG files.');
  const files=new Map(),reads=new Map(),uuids=new Set();
  const read=file=>{file=path.resolve(file);if(!reads.has(file))reads.set(file,fs.existsSync(file)?fs.readFileSync(file):null);return reads.get(file);};
  function parse(bytes,label){try{return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}catch(_){throw Error('Invalid existing metadata or catalog: '+label);}}
  function frameMetadata(meta,label){
    const frames=Object.values(meta.subMetas||{}).filter(frame=>frame.importer==='sprite-frame');
    if(meta.importer!=='texture'||meta.type!=='sprite'||meta.width!==128||meta.height!==128||frames.length!==1||frames[0].rawTextureUuid!==meta.uuid||frames[0].rawWidth!==128||frames[0].rawHeight!==128)throw Error('Existing stat icon metadata must retain a valid 128px SpriteFrame: '+label);
    for(const uuid of [meta.uuid,frames[0].uuid]){if(typeof uuid!=='string'||!uuid||uuids.has(uuid))throw Error('Stat icon metadata contains a missing or duplicate UUID: '+label);uuids.add(uuid);}
  }
  const oldCatalogBytes=read(path.join(root,manifest)),oldCatalog=oldCatalogBytes?parse(oldCatalogBytes,manifest):{};
  const oldIcons=new Map((oldCatalog.icons||[]).map(icon=>[icon.id,icon]));
  const icons=ordered.map(record=>{
    const source=path.join(sourceDir,record.id+'.png'),bytes=read(source);
    if(!bytes||bytes.length<33||bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==128||bytes.readUInt32BE(20)!==128||bytes[24]!==8||bytes[25]!==6)throw Error('Use a 128×128 8-bit RGBA PNG: '+record.id);
    const pixels=PNG.decode(bytes).rgba;let transparent=false,visible=false;
    for(let index=3;index<pixels.length;index+=4){if(pixels[index]===0)transparent=true;if(pixels[index]>64)visible=true;}
    if(!transparent||!visible)throw Error('Stat artwork needs transparent padding and visible pixels: '+record.id);
    const relative=target+'/'+record.id+'.png',existing=read(path.join(root,relative));
    if(existing&&!existing.equals(bytes))throw Error('Stat icon changed locally; refusing to overwrite '+relative);
    files.set(relative,bytes);
    const metaPath=relative+'.meta',oldMeta=read(path.join(root,metaPath)),meta=oldMeta?parse(oldMeta,metaPath):Bake.textureMeta(relative,128,128);
    frameMetadata(meta,metaPath);files.set(metaPath,oldMeta||JSON.stringify(meta,null,2)+'\n');
    const icon=Object.assign({},oldIcons.get(record.id),{number:record.number,id:record.id,meaning:record.meaning,image:relative,reference:'@icon/Stats Icons/'+record.id,width:128,height:128,sha256:sha(bytes)});
    return icon;
  });
  const folderMeta=target+'.meta',existingFolder=read(path.join(root,folderMeta));
  if(existingFolder){const meta=parse(existingFolder,folderMeta);if(meta.importer!=='folder'||meta.isBundle)throw Error('Stats Icons must remain a resources folder, not a separate bundle.');}
  files.set(folderMeta,existingFolder||JSON.stringify({ver:'1.1.3',uuid:Bake.uuid(folderMeta),importer:'folder',isBundle:false,bundleName:'',priority:1,compressionType:{},optimizeHotUpdate:{},inlineSpriteFrames:{},isRemoteBundle:{},subMetas:{}},null,2)+'\n');
  const registry=Object.assign({},oldCatalog,{version:1,resolution:128,icons});
  files.set(manifest,JSON.stringify(registry,null,2)+'\n');
  return{count:icons.length,files,reads,registry,manifest};
}
function importPack(root,sourceDir,catalog){const planned=plan(root,sourceDir,catalog);return{count:planned.count,...Tx.commit(root,planned.files,planned.reads,manifest)};}
module.exports={plan,importPack,target,manifest};
if(require.main===module){
  if(!process.argv[2]||!process.argv[3])throw Error('Usage: node tools/icons/import-stats-icons.cjs <prepared-folder> <catalog.json>');
  const result=importPack(path.resolve(__dirname,'../..'),process.argv[2],JSON.parse(fs.readFileSync(process.argv[3],'utf8')));
  console.log(JSON.stringify({count:result.count,changedFiles:result.files.length,transaction:result.transaction}));
}
