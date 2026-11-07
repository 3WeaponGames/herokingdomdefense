'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const JSONDocument=require('../../packages/game-data-editor/lib/json-document');
function uuid(name){const h=crypto.createHash('sha256').update('hkd-character-parts:'+name).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
function unpack(file){
  const bytes=zlib.gunzipSync(Buffer.isBuffer(file)?file:fs.readFileSync(file),{maxOutputLength:128*1024*1024}),groups=new Map();
  for(let p=0;p+512<=bytes.length;){
    const name=bytes.toString('utf8',p,p+100).split('\0')[0];if(!name)break;
    const size=parseInt(bytes.toString('ascii',p+124,p+136).split('\0')[0].trim()||'0',8);
    if(!Number.isSafeInteger(size)||size<0||p+512+size>bytes.length)throw Error('Invalid Unity archive entry');
    const slash=name.indexOf('/');if(slash>=0){const id=name.slice(0,slash);if(!groups.has(id))groups.set(id,{});groups.get(id)[name.slice(slash+1)]=bytes.subarray(p+512,p+512+size);}
    p+=512+Math.ceil(size/512)*512;
  }
  return [...groups.values()].filter(g=>g.pathname&&g.asset).map(g=>({name:g.pathname.toString('utf8').split(/\r?\n|\0/)[0],bytes:g.asset}));
}
function importParts(root,file){
  root=path.resolve(root);
  const target=path.join(root,'assets/resources/character-parts'),plans=new Map(),reads=new Map(),hash=bytes=>bytes===null?null:crypto.createHash('sha256').update(bytes).digest('hex');
  function safe(output){const relative=path.relative(root,output);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Import path leaves project');let current=root;for(const segment of relative.split(path.sep)){current=path.join(current,segment);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Import destination contains a symbolic link: '+relative);}return output;}
  function current(output){safe(output);return fs.existsSync(output)?fs.readFileSync(output):null;}
  function before(output){if(!reads.has(output))reads.set(output,current(output));return reads.get(output);}
  function stage(output,bytes){safe(output);bytes=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);const old=before(output);if(hash(old)!==hash(bytes))plans.set(output,{file:output,path:path.relative(root,output),before:old,after:bytes});}
  function json(output,value,update){const old=before(output);if(old===null){stage(output,JSON.stringify(value,null,2)+'\n');return value;}const data=JSON.parse(old.toString('utf8').replace(/^\uFEFF/,''));if(!data||Array.isArray(data)||typeof data!=='object')throw Error('Invalid import metadata: '+output);if(!update)return data;const next=update(data);if(!JSONDocument.equal(data,next))stage(output,JSONDocument.patch(old.toString('utf8'),data,next));return next;}
  function folder(dir){safe(dir);json(dir+'.meta',{ver:'1.1.3',uuid:uuid(path.relative(target,dir)),importer:'folder',isBundle:false,bundleName:'',priority:1,compressionType:{},optimizeHotUpdate:{},inlineSpriteFrames:{},isRemoteBundle:{},subMetas:{}});}
  const catalogFile=path.join(target,'catalog.json'),oldCatalog=before(catalogFile),original=oldCatalog===null?{}:JSON.parse(oldCatalog.toString('utf8').replace(/^\uFEFF/,''));
  if(!original||typeof original!=='object'||Array.isArray(original)||original.parts!==undefined&&!Array.isArray(original.parts))throw Error('Invalid existing part catalog');
  const archive=fs.readFileSync(file),manifest=Object.assign({},original,{version:1,source:Object.assign({},original.source,{publisher:'Layer Lab',package:path.basename(file),sha256:hash(archive)}),parts:[]});
  const existingParts=new Map((original.parts||[]).map(part=>[part.id,part]));
  const files=unpack(archive).filter(v=>/\.png$/i.test(v.name)),images=new Map();
  const destinations=new Set();
  for(const entry of files){const suffix=entry.name.split('/Parts Pack Vol.1/')[1];if(!suffix||!/^(Parts|Thumbnail)\/[A-Za-z0-9_ /.-]+\.png$/.test(suffix)||suffix.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe or unexpected asset path: '+entry.name);const key=suffix.toLowerCase();if(destinations.has(key))throw Error('Duplicate image path');destinations.add(key);images.set(suffix,entry);if(entry.bytes.length<24||entry.bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||entry.bytes.toString('ascii',12,16)!=='IHDR'||!entry.bytes.readUInt32BE(16)||!entry.bytes.readUInt32BE(20))throw Error('Invalid PNG: '+suffix);}
  folder(target);
  for(const [relative,entry]of images){
    const output=path.join(target,relative),width=entry.bytes.readUInt32BE(16),height=entry.bytes.readUInt32BE(20),stem=path.basename(relative,'.png');
    let directory=target;for(const segment of path.dirname(relative).split('/')){directory=path.join(directory,segment);folder(directory);}
    stage(output,entry.bytes);
    const id=uuid(relative),sprite=uuid(relative+'#sprite');
    const texture={ver:'2.3.7',uuid:id,importer:'texture',type:'sprite',wrapMode:'clamp',filterMode:'bilinear',premultiplyAlpha:false,genMipmaps:false,packable:true,width,height,platformSettings:{},subMetas:{[stem]:{ver:'1.0.6',uuid:sprite,importer:'sprite-frame',rawTextureUuid:id,trimType:'none',trimThreshold:1,rotated:false,offsetX:0,offsetY:0,trimX:0,trimY:0,width,height,rawWidth:width,rawHeight:height,borderTop:0,borderBottom:0,borderLeft:0,borderRight:0,subMetas:{}}}};
    json(output+'.meta',texture,old=>{const frame=Object.assign({},texture.subMetas[stem],old.subMetas&&old.subMetas[stem],{rawTextureUuid:old.uuid||id,rawWidth:width,rawHeight:height});if(frame.trimType==='none'){frame.width=width;frame.height=height;}return Object.assign({},old,{width,height,subMetas:Object.assign({},old.subMetas,{[stem]:frame})});});
    if(relative.startsWith('Parts/')){
      const thumbnail=[...images.keys()].find(k=>k.startsWith('Thumbnail/')&&path.basename(k)===path.basename(relative));
      const partId=relative.slice(6,-4);existingParts.set(partId,Object.assign({},existingParts.get(partId),{id:partId,name:stem.replace(/^FA_/,'').replace(/_/g,' '),category:relative.split('/').slice(1,-1).join('/'),resource:'character-parts/'+relative.slice(0,-4),image:'assets/resources/character-parts/'+relative,thumbnail:'assets/resources/character-parts/'+(thumbnail||relative),width,height,sha256:hash(entry.bytes)}));
    }
  }
  manifest.parts=[...existingParts.values()].sort((a,b)=>a.id.localeCompare(b.id));
  json(catalogFile,manifest,()=>manifest);
  json(catalogFile+'.meta',{ver:'1.2.7',uuid:uuid('catalog.json'),importer:'json',subMetas:{}});
  const result={parts:manifest.parts.length,thumbnails:[...images.keys()].filter(k=>k.startsWith('Thumbnail/')).length,images:files.length};
  if(!plans.size)return Object.assign(result,{noChanges:true});
  // Preflight and revision snapshots are complete before any import write.
  const stamp=Date.now()+'-'+crypto.randomBytes(6).toString('hex'),backup=safe(path.join(root,'local/character-parts-import/backups',stamp));
  fs.mkdirSync(backup,{recursive:true});
  const journal={version:1,status:'prepared',files:[...plans.values()].map(p=>({path:p.path,before:hash(p.before),after:hash(p.after)}))},journalFile=path.join(backup,'transaction.json'),committed=[];
  try{
    for(const p of plans.values()){if(p.before!==null){const saved=path.join(backup,'original',p.path);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.writeFileSync(saved,p.before,{flag:'wx'});}p.temp=path.join(backup,'staged',p.path);fs.mkdirSync(path.dirname(p.temp),{recursive:true});fs.writeFileSync(p.temp,p.after,{flag:'wx'});}
    fs.writeFileSync(journalFile,JSON.stringify(journal,null,2)+'\n',{flag:'wx'});
    for(const [output,bytes]of reads)if(hash(current(output))!==hash(bytes))throw Error('File changed during import: '+path.relative(root,output));
    for(const p of plans.values()){if(hash(current(p.file))!==hash(p.before))throw Error('File changed during import: '+p.path);fs.mkdirSync(path.dirname(p.file),{recursive:true});fs.renameSync(p.temp,p.file);committed.push(p);}
    journal.status='complete';fs.writeFileSync(journalFile,JSON.stringify(journal,null,2)+'\n');
  }catch(error){
    const conflicts=[];for(const p of committed.reverse()){try{if(hash(current(p.file))!==hash(p.after)){conflicts.push(p.path);continue;}if(p.before===null)fs.unlinkSync(p.file);else fs.writeFileSync(p.file,p.before);}catch(issue){conflicts.push(p.path);}}
    journal.status=conflicts.length?'recovery-required':'rolled-back';journal.conflicts=conflicts;journal.error=error.message;fs.writeFileSync(journalFile,JSON.stringify(journal,null,2)+'\n');throw Error(error.message+' Import backup: '+backup);
  }
  return Object.assign(result,{backup});
}
if(require.main===module){const file=process.argv[2];if(!file)throw Error('Usage: node tools/characters/import-parts.cjs <unitypackage>');console.log(JSON.stringify(importParts(path.resolve(__dirname,'../..'),path.resolve(file)),null,2));}
module.exports={unpack,importParts,uuid};
