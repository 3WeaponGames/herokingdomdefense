'use strict';

// Keep unit health backgrounds and fills in one lossless native texture. Source
// artwork/metadata remain authorable; this returns generated assets, not writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const project=process.env.HKD_TEST_PROJECT_ROOT||path.resolve(__dirname,'../..');
const PNG=require(path.join(project,'packages/hkd-characters/lib/png-atlas'));
const folder='assets/resources/gui-pro/health',imagePath=folder+'/health-atlas.png',atlasPath=folder+'/health-atlas.plist';
function uuid(name){const value=crypto.createHash('sha256').update('hkd-health-atlas:'+name).digest();value[6]=value[6]&15|80;value[8]=value[8]&63|128;const hex=value.subarray(0,16).toString('hex');return[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');}
const json=value=>JSON.stringify(value,null,2)+'\n';
function build(root,read=fs.readFileSync){
  const names=['frame','fill-blue','fill-green','fill-red'],images={},sources=new Map(),replacements=new Map();
  for(const name of names){
    const source=folder+'/'+name+'.png',image=PNG.decode(read(path.join(root,source))),meta=JSON.parse(read(path.join(root,source+'.meta'),'utf8')),frames=Object.values(meta.subMetas||{}),frame=frames[0];
    if(frames.length!==1||!frame||meta.filterMode!=='bilinear'||meta.wrapMode!=='clamp'||meta.premultiplyAlpha||meta.genMipmaps||frame.rotated||frame.trimX||frame.trimY||frame.offsetX||frame.offsetY||frame.width!==image.width||frame.height!==image.height||frame.rawWidth!==image.width||frame.rawHeight!==image.height)throw Error('Unsupported health source frame: '+name);
    images[name]=image;sources.set(name,frame);replacements.set(frame.uuid,uuid(atlasPath+'#'+name));
  }
  const pages=PNG.packPages(images);if(pages.length!==1)throw Error('Health artwork exceeds one native atlas page');const page=pages[0],textureId=uuid(imagePath),frames={},entries=[];
  for(const name of names){
    const source={...sources.get(name)},r=page.positions[name];delete source.subMetas;
    frames[name]={...source,uuid:replacements.get(source.uuid),rawTextureUuid:textureId,trimType:'auto',trimX:r.x,trimY:r.y,spriteType:'normal',subMetas:{}};
    entries.push('<key>'+name+'</key><dict><key>frame</key><string>{{'+r.x+','+r.y+'},{'+r.width+','+r.height+'}}</string><key>offset</key><string>{0,0}</string><key>rotated</key><false/><key>trimmed</key><false/><key>sourceSize</key><string>{'+r.width+','+r.height+'}</string></dict>');
  }
  let plist='<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>frames</key><dict>'+entries.join('')+'</dict><key>metadata</key><dict><key>format</key><integer>2</integer><key>realTextureFileName</key><string>health-atlas.png</string><key>textureFileName</key><string>health-atlas.png</string><key>size</key><string>{'+page.width+','+page.height+'}</string></dict></dict></plist>\n';
  // Git may check this XML out with CRLF. Keep that existing text format so
  // an unchanged published atlas remains a no-op on every platform.
  try{const existing=read(path.join(root,atlasPath),'utf8');if(existing.includes('\r\n'))plist=plist.replace(/\n/g,'\r\n');}catch(error){if(error.code!=='ENOENT')throw error;}
  const files=new Map([
    [imagePath,PNG.encode(page)],
    [imagePath+'.meta',json({ver:'2.3.7',uuid:textureId,importer:'texture',type:'raw',wrapMode:'clamp',filterMode:'bilinear',premultiplyAlpha:false,genMipmaps:false,packable:false,width:page.width,height:page.height,platformSettings:{},subMetas:{}})],
    [atlasPath,plist],
    [atlasPath+'.meta',JSON.stringify({ver:'1.2.6',uuid:uuid(atlasPath),importer:'sprite-atlas',rawTextureUuid:textureId,size:{width:page.width,height:page.height},type:'Texture Packer',subMetas:frames},null,2)]
  ]);
  for(const relative of ['assets/KinghtFallEnemy/ItemHp.prefab','assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab']){
    const before=read(path.join(root,relative),'utf8');let after=before;
    for(const[oldId,newId]of replacements)after=after.split('"'+oldId+'"').join('"'+newId+'"');
    if(after!==before)files.set(relative,after);
  }
  return{files,replacements};
}
function main(argv){
  if(argv.length!==2||argv[0]!=='--out')throw Error('Usage: node tools/art/build-health-atlas.cjs --out <explicit-output-directory>');
  const directory=path.resolve(argv[1]),result=build(project),pending=[];
  for(const[name,value]of result.files){const file=path.join(directory,name),bytes=Buffer.isBuffer(value)?value:Buffer.from(value);if(fs.existsSync(file)){if(!fs.readFileSync(file).equals(bytes))throw Error('Output differs; choose a new explicit destination: '+file);}else pending.push({file,bytes});}
  for(const{file,bytes}of pending){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});}
  return{directory,files:[...result.files.keys()],writes:pending.length};
}
if(require.main===module){try{console.log(JSON.stringify(main(process.argv.slice(2)),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={build,main};
