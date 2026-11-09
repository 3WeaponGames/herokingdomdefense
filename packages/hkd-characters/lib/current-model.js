'use strict';
// A finished model is captured only on explicit Save. Subsequent edits use
// that fixed foundation, so removing fitted gear cannot reveal an older bake.
const fs=require('fs'),path=require('path'),url=require('url'),crypto=require('crypto'),Units=require('../../game-data-editor/lib/unit-assets');
const clone=value=>JSON.parse(JSON.stringify(value));
function uuid(value){const h=crypto.createHash('sha256').update('hkd-character-model:'+value).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
function modelFile(root,file){if(typeof file!=='string'||!/^assets\/resources\/unit-library\/models\/[a-f0-9]{24}\/model\.json$/.test(file))throw Error('Invalid finished character model.');return path.join(root,file);}
function folderMetadata(root,folder,files,read){const file=path.join(root,folder+'.meta');if(fs.existsSync(file)){read(file);return;}files.set(folder+'.meta',JSON.stringify({ver:'1.1.3',uuid:uuid(folder),importer:'folder',isBundle:false,bundleName:'',priority:1,compressionType:{},optimizeHotUpdate:{},inlineSpriteFrames:{},isRemoteBundle:{},subMetas:{}},null,2)+'\n');}
function describe(root,base,noRuntime,read){
  read=read||((file)=>fs.readFileSync(file));const model=base.model;if(!model||!Array.isArray(model.layers)||!model.layers.length)throw Error('Missing finished character model.');
  const layers=model.layers.map(saved=>{const file=modelFile(root,saved.file),json=JSON.parse(read(file).toString('utf8')),atlas=read(file.replace(/\.json$/,'.atlas')).toString('utf8'),pages={};
    atlas.split(/\r?\n/).forEach((line,i,lines)=>{if(line.trim()&&(!i||!lines[i-1].trim())&&lines[i+1]&&/^(size|format):/.test(lines[i+1].trim())){if(path.basename(line.trim())!==line.trim())throw Error('Invalid finished model texture.');pages[line.trim()]=url.pathToFileURL(path.join(path.dirname(file),line.trim())).href;}});
    return {...saved,json,atlas,pages,skins:json.skins.map(skin=>skin.name),animations:Object.keys(json.animations)};
  });return {layers,defaultLayer:model.defaultLayer,runtimePath:noRuntime?null:Units.enginePath()};
}
function capture(root,base,files,read){
  folderMetadata(root,'assets/resources/unit-library/models',files,read);
  if(base.model){for(const layer of base.model.layers){modelFile(root,layer.file);folderMetadata(root,path.posix.dirname(layer.file),files,read);}return describe(root,base,true,read);}
  read(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'));
  const description=Units.describe(root,{type:base.type,id:base.id,noRuntime:true}),saved=[],prefab=JSON.parse(read(path.join(root,description.source)).toString('utf8'));
  if(description.layers.some(layer=>!prefab.some(component=>component._N$skeletonData&&component._N$skeletonData.__uuid__===layer.uuid)))throw Error('The unit model changed while capturing its appearance.');
  for(const layer of description.layers){
    const source=path.join(root,layer.source),json=read(source),atlas=read(source.replace(/\.json$/,'.atlas')),pictures=Object.fromEntries(Object.entries(layer.pages).map(([name,source])=>[name,{file:url.fileURLToPath(source),bytes:read(url.fileURLToPath(source))}]));
    const hash=crypto.createHash('sha256').update(json).update(atlas);Object.values(pictures).forEach(picture=>hash.update(picture.bytes));
    const folder='assets/resources/unit-library/models/'+hash.digest('hex').slice(0,24),relative=folder+'/model.json',textureIds=[];
    folderMetadata(root,folder,files,read);
    const put=(file,bytes)=>{const absolute=path.join(root,file);if(fs.existsSync(absolute)){if(!Buffer.from(read(absolute)).equals(Buffer.from(bytes)))throw Error('The finished model snapshot changed: '+file);}else files.set(file,bytes);};
    for(const [name,picture]of Object.entries(pictures)){
      if(path.basename(name)!==name)throw Error('Invalid finished model texture name.');
      const target=folder+'/'+name,id=uuid(target);textureIds.push(id);put(target,picture.bytes);
      const old=fs.existsSync(picture.file+'.meta')?JSON.parse(read(picture.file+'.meta').toString('utf8')):{ver:'2.3.7',importer:'texture',type:'sprite',subMetas:{}};
      const meta=clone(old);meta.uuid=id;for(const [key,frame]of Object.entries(meta.subMetas||{})){frame.uuid=uuid(target+'#'+key);frame.rawTextureUuid=id;}
      put(target+'.meta',JSON.stringify(meta,null,2)+'\n');
    }
    put(relative,json);put(folder+'/model.atlas',atlas);
    put(relative+'.meta',JSON.stringify({ver:'1.2.5',uuid:uuid(relative),importer:'spine',textures:textureIds,scale:1,subMetas:{}},null,2)+'\n');
    put(folder+'/model.atlas.meta',JSON.stringify({ver:'1.0.3',uuid:uuid(folder+'/model.atlas'),importer:'asset',subMetas:{}},null,2)+'\n');
    saved.push({file:relative,uuid:layer.uuid,name:layer.name,skin:layer.skin,x:layer.x,y:layer.y,scaleX:layer.scaleX,scaleY:layer.scaleY,angle:layer.angle||0});
  }
  base.model={defaultLayer:description.defaultLayer,layers:saved};return description;
}
module.exports={describe,capture,modelFile,folderMetadata};
