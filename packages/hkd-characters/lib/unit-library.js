'use strict';
const fs=require('fs'),path=require('path'),url=require('url');
const Units=require('../../game-data-editor/lib/unit-assets');
const Packs=require('./unit-packs'),packs=Packs.packs.map(pack=>pack.id);
const cached=new Map();
function load(root){
  const sources=[],parts=[];
  for(const pack of packs){
    const file=path.join(root,'assets/resources/unit-library',pack,'catalog.json');
    if(!fs.existsSync(file))continue;
    const stat=fs.statSync(file),stamp=stat.mtimeMs+':'+stat.size,prior=cached.get(file);
    if(prior&&prior.stamp===stamp){sources.push(...prior.sources);parts.push(...prior.parts);continue;}
    const catalog=JSON.parse(fs.readFileSync(file,'utf8')),entries=[],thumbs=new Map(catalog.parts.filter(part=>/\/Thumbnail\//.test(part.image)).map(part=>[path.basename(part.image),part]));
    sources.push(...catalog.units);
    for(const part of catalog.parts){
      if(/\/Thumbnail\//.test(part.image)||/\/Sprites\/UI\//.test(part.image))continue;
      const marker=pack==='character-maker'?/\/(Character|Parts|Mount)\/(.+)$/:/\/ResourcesData\/Sprites\/(.+)$/;
      const match=marker.exec(part.image);
      if(!match&&pack==='character-maker'&&!/\/Common\/Sprites\/(Character|Other)\//.test(part.image))continue;
      const folder=pack.startsWith('fantasy-')?'Body parts':(match&&match[1]==='Mount'?'Mount/':'')+path.dirname(match?match[match.length-1]:part.image).replace(/\\/g,'/');
      const category=Packs.info(pack).label+'/'+folder;
      const thumb=thumbs.get(path.basename(part.image));
      entries.push(Object.assign({},part,{category,thumbnail:thumb?thumb.image:part.image,sourcePack:pack}));
    }
    cached.set(file,{stamp,sources:catalog.units,parts:entries});parts.push(...entries);
  }
  return {sources,parts};
}
function describe(root,id,noRuntime){
  const unit=load(root).sources.find(source=>source.id===id);
  if(!unit)throw Error('Choose an imported character or monster base.');
  const file=path.join(root,unit.skeleton),json=JSON.parse(fs.readFileSync(file,'utf8'));
  const atlas=fs.readFileSync(file.replace(/\.json$/,'.atlas'),'utf8'),pages={};
  const lines=atlas.split(/\r?\n/);
  lines.forEach((line,index)=>{if(line.trim()&&(!index||!lines[index-1].trim())&&/\.png$/i.test(line.trim()))pages[line.trim()]=url.pathToFileURL(path.resolve(path.dirname(file),line.trim())).href;});
  const layer={name:unit.name,uuid:unit.uuid,json,atlas,pages,skins:json.skins.map(s=>s.name),animations:Object.keys(json.animations).filter(name=>name!=='__fx_ambient'),skin:'default',x:0,y:0,scaleX:1,scaleY:1,angle:0};
  return {source:unit.skeleton,sourceUnit:unit.id,sourcePack:unit.pack,layers:[layer],runtimePath:noRuntime?null:Units.enginePath()};
}
module.exports={load,describe};
