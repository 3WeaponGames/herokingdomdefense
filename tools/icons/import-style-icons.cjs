'use strict';
// Export selected generated artwork at the same 128px canvas size as the
// existing stat library. Prompt/source manifests stay outside the repository.
const fs=require('node:fs'),path=require('node:path'),PNG=require('../../packages/hkd-characters/lib/png-atlas'),Bake=require('../../packages/hkd-characters/lib/native-bake'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
function resize(image,size){
 const data=Buffer.alloc(size*size*4),sx=image.width/size,sy=image.height/size;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const left=x*sx,right=(x+1)*sx,top=y*sy,bottom=(y+1)*sy;let alpha=0,r=0,g=0,b=0;
  for(let iy=Math.floor(top);iy<Math.ceil(bottom);iy++)for(let ix=Math.floor(left);ix<Math.ceil(right);ix++){
   const weight=(Math.min(right,ix+1)-Math.max(left,ix))*(Math.min(bottom,iy+1)-Math.max(top,iy)),at=(iy*image.width+ix)*4,a=image.rgba[at+3]*weight;
   alpha+=a;r+=image.rgba[at]*a;g+=image.rgba[at+1]*a;b+=image.rgba[at+2]*a;
  }
  const at=(y*size+x)*4;if(alpha){data[at]=Math.round(r/alpha);data[at+1]=Math.round(g/alpha);data[at+2]=Math.round(b/alpha);data[at+3]=Math.round(alpha/(sx*sy));}
 }
 return {width:size,height:size,rgba:data};
}
function generate(root,manifest){
 const entries=JSON.parse(fs.readFileSync(manifest,'utf8')),files=new Map(),reads=new Map(),read=file=>{file=path.resolve(file);if(!reads.has(file))reads.set(file,fs.readFileSync(file));return reads.get(file);};
 if(entries.length!==18||new Set(entries.map(e=>e.id)).size!==18)throw Error('Supply all eighteen distinct style/stat icons.');
 for(const entry of entries){
  if(!/^(skirmisher|fighter|vanguard|mystic|bruiser|guardian)-(damage|speed|health)$/.test(entry.id))throw Error('Unknown style icon '+entry.id);
  const image=PNG.decode(read(path.resolve(entry.source)));if(!image.rgba.some((value,index)=>index%4===3&&value===0))throw Error('The icon must have a transparent background: '+entry.id);
  const file='assets/resources/Stats Icons/hero-'+entry.id+'.png';files.set(file,PNG.encode(resize(image,128)));files.set(file+'.meta',JSON.stringify(Bake.textureMeta(file,128,128),null,2)+'\n');
 }
 Bake.preserveMetadata(root,files,read);for(const file of files.keys()){const absolute=path.join(root,file);if(!reads.has(absolute))reads.set(absolute,fs.existsSync(absolute)?fs.readFileSync(absolute):null);}
 const registryFile='tools/icons/stats-icons.catalog.json',registry=JSON.parse(read(path.join(root,registryFile))),previous=new Map(registry.icons.map(icon=>[icon.id,icon]));let number=Math.max(...registry.icons.map(icon=>icon.number||0));
 for(const entry of entries){const id='hero-'+entry.id,file='assets/resources/Stats Icons/'+id+'.png',before=previous.get(id),icon={...(before||{}),number:before?before.number:++number,id,meaning:entry.id.split('-').join(' ')+' talent',image:file,reference:'@icon/Stats Icons/'+id,width:128,height:128,sha256:require('node:crypto').createHash('sha256').update(files.get(file)).digest('hex')};if(before)registry.icons[registry.icons.indexOf(before)]=icon;else registry.icons.push(icon);}
 files.set(registryFile,JSON.stringify(registry,null,2)+'\n');
 return Tx.commit(root,files,reads,files.keys().next().value);
}
module.exports={resize,generate};if(require.main===module){if(!process.argv[2])throw Error('Pass an external icon manifest path.');console.log(generate(path.resolve(__dirname,'../..'),path.resolve(process.argv[2])));}
