'use strict';
// Build the production blue team material from the unchanged cavalry atlas.
// This is a texture/material export only; no game, animation or audio starts.
const fs=require('node:fs'),path=require('node:path'),url=require('node:url'),Material=require('../../packages/hkd-characters/lib/cavalry-material'),Bake=require('../../packages/hkd-characters/lib/native-bake'),PNG=require('../../packages/hkd-characters/lib/png-atlas'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
function generate(root){
 const files=new Map(),reads=new Map(),read=file=>{file=path.resolve(file);if(!reads.has(file))reads.set(file,fs.readFileSync(file));return reads.get(file);},source=path.join(root,'assets/KinghtFallEnemyAni/wqyl_qb/wqyl_qb.atlas'),atlas=read(source).toString('utf8'),pages={};
 atlas.split(/\r?\n/).forEach((line,i,lines)=>{if(line.trim()&&(!i||!lines[i-1].trim())&&/\.png$/i.test(line.trim()))pages[line.trim()]=url.pathToFileURL(path.join(path.dirname(source),line.trim())).href;});
 const image=Material.blueCloth(Bake.readAtlas({atlas,pages},read)('qb_lan_12'));require('../../packages/hkd-characters/lib/current-model').folderMetadata(root,path.dirname(Material.texture).replace(/\\/g,'/'),files,read);files.set(Material.texture,PNG.encode(image));
 const meta=Material.texture+'.meta',existing=path.join(root,meta);files.set(meta,fs.existsSync(existing)?read(existing):JSON.stringify(Bake.textureMeta(Material.texture,image.width,image.height),null,2)+'\n');
 for(const relative of files.keys()){const file=path.join(root,relative);if(!reads.has(file))reads.set(file,fs.existsSync(file)?read(file):null);}return Tx.commit(root,files,reads,Material.texture);
}
module.exports={generate};
if(require.main===module)console.log(generate(path.resolve(__dirname,'../..')));
