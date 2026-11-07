'use strict';
// Lossless import of the complete 128px GUI PRO pictogram set.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Bake=require('../../packages/hkd-characters/lib/native-bake'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function importPack(root,pack,options={}){
 const sourcePath=options.source||'ResourcesData/Sprite/Component/Icon_PictoIcons(x2)/128',target='assets/resources/icons/'+(options.folder||'Pictograms');
 const source=path.resolve(pack,sourcePath),files=new Map(),reads=new Map(),registry={version:1,pack:'GUI PRO Kit - Casual Game',size:128,icons:[]};
 const read=file=>{file=path.resolve(file);if(!reads.has(file))reads.set(file,fs.existsSync(file)?fs.readFileSync(file):null);return reads.get(file);};
 const names=fs.readdirSync(source).filter(name=>/\.png$/i.test(name)).sort();if(!names.length)throw Error('No 128px pictograms found.');
 for(const name of names){
  const original=path.join(source,name),bytes=read(original),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||width!==128||height!==128)throw Error('Invalid 128px pictogram: '+name);
  const relative=target+'/'+name.replace(/\.png$/i,'.png'),destination=path.resolve(root,relative),old=read(destination);if(old&&!old.equals(bytes))throw Error('Icon changed locally; refusing to overwrite '+relative);
  files.set(relative,bytes);const meta=relative+'.meta',existing=read(path.resolve(root,meta));files.set(meta,existing||JSON.stringify(Bake.textureMeta(relative,width,height),null,2)+'\n');
  const unity=read(original+'.meta'),guid=unity&&/^guid:\s*(\S+)/m.exec(unity.toString());
  registry.icons.push({name:path.basename(relative,'.png'),source:sourcePath+'/'+name,unityGuid:guid&&guid[1]||null,image:relative,reference:'@icon/'+relative.slice('assets/resources/'.length,-4),width,height,sha256:sha(bytes)});
 }
 for(let parent=target;parent.startsWith('assets/resources/icons/');parent=path.posix.dirname(parent)){const folder=parent+'.meta';files.set(folder,read(path.resolve(root,folder))||JSON.stringify({ver:'1.1.3',uuid:Bake.uuid(folder),importer:'folder',isBundle:false,bundleName:'',priority:1,compressionType:{},optimizeHotUpdate:{},inlineSpriteFrames:{},isRemoteBundle:{},subMetas:{}},null,2)+'\n');}
 const catalog=options.registry||'tools/icons/pictograms.catalog.json';read(path.resolve(root,catalog));files.set(catalog,JSON.stringify(registry,null,2)+'\n');
 return{count:registry.icons.length,...Tx.commit(root,files,reads,catalog)};
}
module.exports={importPack};
if(require.main===module){if(!process.argv[2])throw Error('Usage: node tools/icons/import-pictograms.cjs "path/to/GUI PRO Kit - Casual Game"');const result=importPack(path.resolve(__dirname,'../..'),process.argv[2]);console.log(JSON.stringify({count:result.count,changedFiles:result.files.length,transaction:result.transaction}));}
