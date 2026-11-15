'use strict';
const fs=require('fs'),path=require('path'),url=require('url'),crypto=require('crypto'),Bake=require('../../hkd-characters/lib/native-bake');
const FOLDER='assets/KinghtFallIconMap/Thumbnails',PREFIX='Thumbnails/';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function filename(resource){if(typeof resource!=='string'||!/^Thumbnails\/[a-z0-9][a-z0-9_-]*$/i.test(resource))throw Error('Choose an image from the stage thumbnail library.');return FOLDER+'/'+resource.slice(PREFIX.length)+'.png';}
function entry(resource,file,buffer){const name=path.basename(file,'.png').replace(/-[a-f0-9]{12}$/,'').replace(/[-_]+/g,' ');return{resource,name,file,url:buffer?'data:image/png;base64,'+buffer.toString('base64'):url.pathToFileURL(file).href};}
function list(service){
 const folder=path.join(service.root,FOLDER),entries=fs.existsSync(folder)?fs.readdirSync(folder).filter(name=>/\.png$/i.test(name)).sort().map(name=>entry(PREFIX+name.slice(0,-4),path.join(folder,name))):[];
 for(const staged of service.stageThumbnailDrafts&&service.stageThumbnailDrafts.values()||[])if(!entries.some(e=>e.resource===staged.resource))entries.push(entry(staged.resource,staged.file,staged.buffer));
 return{folder,entries};
}
function stage(service,request){
 service.expect(request.version);if(typeof request.file!=='string'||!request.file)throw Error('Choose a PNG image.');
 const source=path.resolve(request.file);if(!/\.png$/i.test(source)||fs.statSync(source).size>40*1024*1024)throw Error('Choose a PNG image smaller than 40 MB.');
 const buffer=fs.readFileSync(source);if(buffer.length<24||buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Choose a valid PNG image.');
 const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);if(!width||!height||width*height>16*1024*1024)throw Error('Choose an image of 16 megapixels or less.');
 require('../../hkd-characters/lib/png-atlas').decode(buffer);
 const name=(path.basename(source,'.png').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'thumbnail')+'-'+hash(buffer).slice(0,12),resource=PREFIX+name,file=filename(resource);
 if(!service.stageThumbnailDrafts)service.stageThumbnailDrafts=new Map();service.stageThumbnailDrafts.set(resource,{resource,file,buffer,width,height});service.version++;
 return{version:service.version,entry:entry(resource,file,buffer)};
}
function issues(service,config,units){
 const errors=[];if(config.StageThumbnail!==undefined){try{const file=filename(config.StageThumbnail);if(!(service.stageThumbnailDrafts&&service.stageThumbnailDrafts.has(config.StageThumbnail))&&!fs.existsSync(path.join(service.root,file)))errors.push('The selected stage thumbnail is missing.');}catch(error){errors.push(error.message);}}
 if(config.StageFaceUnit!==undefined&&(!Number.isSafeInteger(config.StageFaceUnit)||!units[config.StageFaceUnit]||!units[config.StageFaceUnit].prefab))errors.push('Choose an existing enemy for the stage face.');return errors;
}
function plan(service,resource){
 if(!resource)return[];const file=filename(resource),staged=service.stageThumbnailDrafts&&service.stageThumbnailDrafts.get(resource);if(!staged)return[];
 const target=path.join(service.root,file);if(fs.existsSync(target)){if(hash(fs.readFileSync(target))!==hash(staged.buffer))throw Error('Another image now uses that thumbnail name. Import it again.');return[];}
 const writes=[{file,bytes:staged.buffer},{file:file+'.meta',bytes:Buffer.from(JSON.stringify(Bake.textureMeta(file,staged.width,staged.height),null,2)+'\n')}],meta=FOLDER+'.meta';
 if(!fs.existsSync(path.join(service.root,meta)))writes.push({file:meta,bytes:Buffer.from(JSON.stringify({ver:'1.1.3',uuid:Bake.uuid(meta),importer:'folder',isBundle:false,bundleName:'',priority:1,compressionType:{},optimizeHotUpdate:{},inlineSpriteFrames:{},isRemoteBundle:{},subMetas:{}},null,2)+'\n')});return writes;
}
module.exports={FOLDER,PREFIX,list,stage,issues,plan,filename};
