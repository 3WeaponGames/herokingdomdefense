'use strict';
// Data-only conversion of the selected Spine 3.8 binary effects. Source art,
// key times and cubic handles are retained; every rendered pose is verified.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Module=require('node:module');
const ROOT=path.resolve(__dirname,'../..'),PNG=require('../../packages/hkd-characters/lib/png-atlas'),renderer=require('../../packages/game-data-editor/preview/spine-renderer');
const SOURCES=[
  ['guardian-sp162-gold-shield','301060_skill_hit','Guardian Golden Shield','guardian','physicalShield']
];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function runtime(){
  const file=require('../../packages/game-data-editor/lib/unit-assets').enginePath();let code=fs.readFileSync(file,'utf8');
  const begin=code.indexOf('BinaryInput.prototype.readString ='),end=code.indexOf('BinaryInput.prototype.readFloat =',begin);assert(begin>=0&&end>begin,'Expected official Spine 3.8 string reader');
  const block=code.slice(begin,end),fixed=block.replace('var b = this.readByte();','var b = this.readByte() & 255;');assert.notEqual(block,fixed,'Expected UTF-8 lead-byte read');
  // Creator's signed-byte reader must treat UTF-8 lead bytes as unsigned.
  // This local conversion module leaves the installed runtime untouched.
  code=code.slice(0,begin)+fixed+code.slice(end);const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(path.dirname(file));loaded._compile(code,file);return loaded.exports;
}
function binary(spine,raw,loader){
  const reader=new spine.SkeletonBinary(loader),base=reader.readCurve;
  reader.readCurve=function(input,index,timeline){
    const kind=input.readByte();timeline._sourceCurves=timeline._sourceCurves||{};
    if(kind===spine.SkeletonBinary.CURVE_STEPPED){timeline.setStepped(index);timeline._sourceCurves[index]='stepped';}
    else if(kind===spine.SkeletonBinary.CURVE_BEZIER){const curve=[input.readFloat(),input.readFloat(),input.readFloat(),input.readFloat()];this.setCurve(timeline,index,...curve);timeline._sourceCurves[index]=curve;}
    else assert.equal(kind,0,'Unknown source curve type');
  };
  assert.equal(typeof base,'function');return reader.readSkeletonData(Uint8Array.from(raw));
}
function color(value){return [value.r,value.g,value.b,value.a].map(n=>Math.round(n*255).toString(16).padStart(2,'0')).join('');}
function convert(spine,data){
  assert(data.version.startsWith('3.8.'),'Only Spine 3.8 supported');assert.equal(data.ikConstraints.length+data.transformConstraints.length+data.pathConstraints.length+data.events.length,0,'Unsupported source constraints/events');
  const transforms=['normal','onlyTranslation','noRotationOrReflection','noScale','noScaleOrReflection'],blends=['normal','additive','multiply','screen'];
  const json={skeleton:{hash:data.hash,spine:data.version,x:data.x,y:data.y,width:data.width,height:data.height,fps:data.fps,images:data.imagesPath},bones:[],slots:[],skins:[],animations:{}};
  for(const bone of data.bones){const row={name:bone.name};if(bone.parent)row.parent=bone.parent.name;for(const key of ['length','x','y','rotation','scaleX','scaleY','shearX','shearY'])row[key]=bone[key];row.transform=transforms[bone.transformMode];row.skin=bone.skinRequired;assert(row.transform);json.bones.push(row);}
  for(const slot of data.slots){assert(!slot.darkColor,'Unsupported two-color setup slot');const row={name:slot.name,bone:slot.boneData.name,color:color(slot.color),blend:blends[slot.blendMode]};assert(row.blend);if(slot.attachmentName!==null)row.attachment=slot.attachmentName;json.slots.push(row);}
  for(const skin of data.skins){assert.equal(skin.bones.length+skin.constraints.length,0,'Unsupported constrained skin');const row={name:skin.name,attachments:{}};skin.attachments.forEach((attachments,index)=>{if(!attachments)return;const target=row.attachments[data.slots[index].name]={};for(const [name,attachment] of Object.entries(attachments)){
    assert(attachment instanceof spine.RegionAttachment,'Unsupported attachment type '+attachment.constructor.name);const value={type:'region',path:attachment.path,color:color(attachment.color)};for(const key of ['x','y','scaleX','scaleY','rotation','width','height'])value[key]=attachment[key];target[name]=value;
  }});json.skins.push(row);}
  for(const animation of data.animations){const out={slots:{},bones:{}};for(const timeline of animation.timelines){const kind=timeline.constructor.name;let rows,target,key,entries;
    if(kind==='AttachmentTimeline'){target=out.slots[data.slots[timeline.slotIndex].name]||(out.slots[data.slots[timeline.slotIndex].name]={});key='attachment';rows=Array.from(timeline.frames,(time,index)=>({time,name:timeline.attachmentNames[index]}));}
    else if(kind==='ColorTimeline'){target=out.slots[data.slots[timeline.slotIndex].name]||(out.slots[data.slots[timeline.slotIndex].name]={});key='color';entries=5;rows=[];for(let i=0;i<timeline.frames.length;i+=entries)rows.push({time:timeline.frames[i],color:color({r:timeline.frames[i+1],g:timeline.frames[i+2],b:timeline.frames[i+3],a:timeline.frames[i+4]})});}
    else if(['TranslateTimeline','ScaleTimeline'].includes(kind)){target=out.bones[data.bones[timeline.boneIndex].name]||(out.bones[data.bones[timeline.boneIndex].name]={});key=kind==='ScaleTimeline'?'scale':'translate';entries=3;rows=[];for(let i=0;i<timeline.frames.length;i+=entries)rows.push({time:timeline.frames[i],x:timeline.frames[i+1],y:timeline.frames[i+2]});}
    else throw Error('Unsupported source timeline '+kind);
    for(const [index,curve] of Object.entries(timeline._sourceCurves||{}))rows[index].curve=curve;assert(!target[key],'Duplicate timeline');target[key]=rows;
  }json.animations[animation.name]=out;}return json;
}
function pose(spine,data,animation,time){const skeleton=new spine.Skeleton(data);skeleton.setToSetupPose();data.findAnimation(animation).apply(skeleton,0,time,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();return renderer.geometry(spine,{skeleton,description:{x:0,y:0,scaleX:1,scaleY:1}});}
function painted(piece){if(piece.color.a<=0)return false;let area=0;for(let i=0;i<piece.triangles.length;i+=3){const a=piece.triangles[i]*2,b=piece.triangles[i+1]*2,c=piece.triangles[i+2]*2;area+=Math.abs((piece.vertices[b]-piece.vertices[a])*(piece.vertices[c+1]-piece.vertices[a+1])-(piece.vertices[c]-piece.vertices[a])*(piece.vertices[b+1]-piece.vertices[a+1]));}if(area<1e-9)return false;
  const image=piece.image,us=[],vs=[];for(let i=0;i<piece.uvs.length;i+=2){us.push(piece.uvs[i]);vs.push(piece.uvs[i+1]);}for(let y=Math.max(0,Math.floor(Math.min(...vs)*image.height));y<Math.min(image.height,Math.ceil(Math.max(...vs)*image.height));y++)for(let x=Math.max(0,Math.floor(Math.min(...us)*image.width));x<Math.min(image.width,Math.ceil(Math.max(...us)*image.width));x++)if(image.rgba[(y*image.width+x)*4+3])return true;return false;
}
function verify(spine,original,derived,animation){
  const duration=original.findAnimation(animation).duration,points=new Set([0,duration]);for(let i=0;i<=Math.ceil(duration*240);i++)points.add(Math.min(duration,i/240));
  for(const track of original.findAnimation(animation).timelines){const entries=track.constructor.name==='ColorTimeline'?5:['TranslateTimeline','ScaleTimeline'].includes(track.constructor.name)?3:1;for(let i=0;i<track.frames.length;i+=entries)for(const delta of [-1e-7,0,1e-7])points.add(Math.max(0,Math.min(duration,track.frames[i]+delta)));}
  let firstVisible=null,lastVisible=null,bounds=[Infinity,Infinity,-Infinity,-Infinity],maxError=0;
  for(const time of [...points].sort((a,b)=>a-b)){const left=pose(spine,original,animation,time),right=pose(spine,derived,animation,time);assert.equal(left.length,right.length,'Geometry piece count at '+time);for(let i=0;i<left.length;i++){for(const key of ['slot','blend'])assert.equal(left[i][key],right[i][key]);for(const key of ['vertices','uvs','triangles']){assert.equal(left[i][key].length,right[i][key].length);for(let j=0;j<left[i][key].length;j++){const error=Math.abs(left[i][key][j]-right[i][key][j]);maxError=Math.max(maxError,error);assert(error<1e-6,'Geometry drift '+key+' at '+time);}}for(const channel of ['r','g','b','a'])assert(Math.abs(left[i].color[channel]-right[i].color[channel])<1e-6,'Source color drift');assert.equal(left[i].image,right[i].image,'Source image identity changed');if(painted(left[i])){if(firstVisible===null)firstVisible=time;lastVisible=time;for(let p=0;p<left[i].vertices.length;p+=2){bounds[0]=Math.min(bounds[0],left[i].vertices[p]);bounds[1]=Math.min(bounds[1],left[i].vertices[p+1]);bounds[2]=Math.max(bounds[2],left[i].vertices[p]);bounds[3]=Math.max(bounds[3],left[i].vertices[p+1]);}}}}
  assert(firstVisible!==null,'Effect has no painted geometry');return{samples:points.size,maxError,duration,firstVisible,lastVisible,bounds:{x:bounds[0],y:bounds[1],width:bounds[2]-bounds[0],height:bounds[3]-bounds[1]},center:{x:(bounds[0]+bounds[2])/2,y:(bounds[1]+bounds[3])/2}};
}
function prepare(source,destination){
  source=path.resolve(source);destination=path.resolve(destination);const relative=path.relative(ROOT,destination);assert(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Conversion outputs must stay outside project');assert(!fs.existsSync(path.join(destination,'manifest.json')),'Use a new staging folder');fs.mkdirSync(destination,{recursive:true});const spine=runtime(),clips=[];
  for(const [id,name,label,style,slot] of SOURCES){const dir=path.join(source,'Effects',name),raw=fs.readFileSync(path.join(dir,name+'.skel.bytes')),atlasRaw=fs.readFileSync(path.join(dir,name+'.atlas.txt')),pages=[];const atlas=new spine.TextureAtlas(atlasRaw.toString('utf8'),file=>{assert.equal(path.basename(file),file,'External atlas page');const buffer=fs.readFileSync(path.join(dir,file)),image=PNG.decode(buffer);pages.push({file,raw:buffer,width:image.width,height:image.height,sha256:sha(buffer)});return new spine.FakeTexture(image);}),loader=new spine.AtlasAttachmentLoader(atlas),data=binary(spine,raw,loader),json=convert(spine,data);json.skeleton.name=name;
    const derived=new spine.SkeletonJson(loader).readSkeletonData(json),report=verify(spine,data,derived,'play'),folder=path.join(destination,id);fs.mkdirSync(folder,{recursive:true});const jsonRaw=Buffer.from(JSON.stringify(json,null,2)+'\n');fs.writeFileSync(path.join(folder,id+'.json'),jsonRaw);fs.writeFileSync(path.join(folder,id+'.atlas'),atlasRaw);for(const page of pages)fs.writeFileSync(path.join(folder,page.file),page.raw);
    const clip={id,name:label,style,slot,phase:'once',group:id,loop:false,frames:Math.round(report.duration*120),fps:120,kind:'spine',bundle:'resources',resource:'vfx/hero-skills/'+id+'/'+id,animation:'play',duration:report.duration,width:report.bounds.width,height:report.bounds.height,anchorX:-report.bounds.x/report.bounds.width,anchorY:-report.bounds.y/report.bounds.height,decodedBytes:pages.reduce((n,p)=>n+p.width*p.height*4,0),premultipliedAlpha:false,sha256:sha(raw),trimStart:0,source:{directory:dir,skeleton:name,binarySha256:sha(raw),atlasSha256:sha(atlasRaw),conversion:'Exact Spine3.8 region/timeline JSON; key-boundary and240Hz geometry verified'},verification:report,pages:pages.map(({raw,...p})=>p),jsonSha256:sha(jsonRaw)};
    // Runtime lead-in trim uses the existing painted-pixel 120Hz policy.
    for(let i=0;i<=Math.ceil(report.duration*120);i++)if(pose(spine,derived,'play',i/120).some(painted)){clip.trimStart=i/120;break;}
    clip.sourceCenterX=report.center.x;clip.sourceCenterY=report.center.y;
    if(style==='guardian'){clip.loop=true;clip.phase='loop';clip.sourceFrameStart=15;clip.sourceFrameEnd=140;clip.authoringFrameRate=60;clip.sourceStart=15/60;clip.sourceEnd=140/60;assert(clip.sourceEnd<=clip.duration,'Requested source loop exceeds animation');}
    clips.push(clip);console.log(JSON.stringify({id,animation:clip.animation,duration:clip.duration,trimStart:clip.trimStart,bounds:report.bounds,center:report.center,samples:report.samples,maxError:report.maxError,decodedBytes:clip.decodedBytes}));
  }
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({version:1,clips},null,2)+'\n');return clips;
}
if(require.main===module){assert(process.argv[2]&&process.argv[3],'Usage: node prepare-sp162.cjs <SP162 source> <external staging>');prepare(process.argv[2],process.argv[3]);}
module.exports={runtime,binary,convert,pose,painted,verify,prepare,SOURCES};
