'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Prepare=require('./prepare-sp162.cjs'),PNG=require('../../packages/hkd-characters/lib/png-atlas'),renderer=require('../../packages/game-data-editor/preview/spine-renderer');
function verify(sourceFile,derivedFile){
  const spine=Prepare.runtime(),source=JSON.parse(fs.readFileSync(sourceFile)),derived=JSON.parse(fs.readFileSync(derivedFile)),selected=new Set(derived.slots.map(slot=>slot.name));
  assert.equal([...selected].filter(slot=>slot.includes('jujijian')).length,3);assert.equal([...selected].filter(slot=>slot.includes('fashe')).length,2);
  const atlas=new spine.TextureAtlas(fs.readFileSync(sourceFile.replace(/\.json$/,'.atlas'),'utf8'),file=>new spine.FakeTexture(PNG.decode(fs.readFileSync(path.join(path.dirname(sourceFile),file))))),loader=new spine.AtlasAttachmentLoader(atlas),original=new spine.SkeletonJson(loader).readSkeletonData(source),result=new spine.SkeletonJson(loader).readSkeletonData(derived),clip=result.findAnimation('single_volley'),times=new Set([0,.56]);
  for(let i=0;i<=560;i++)times.add(i/1000);
  const boundaries=[];for(const track of original.findAnimation('animation').timelines){const stride=track.constructor.name==='ColorTimeline'?5:track.constructor.name==='DeformTimeline'?1:1;for(let i=0;i<track.frames.length;i+=stride){const t=track.frames[i]-1.44;if(t<0||t>.56)continue;boundaries.push(t);for(const epsilon of [-1e-6,0,1e-6])times.add(Math.max(0,Math.min(.56,t+epsilon)));}}
  let maxDrift=0,pieces=0;
  function pose(data,name,time){const skeleton=new spine.Skeleton(data);skeleton.setToSetupPose();data.findAnimation(name).apply(skeleton,0,time,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();return renderer.geometry(spine,{skeleton,description:{}}).filter(piece=>selected.has(piece.slot)&&Prepare.painted(piece));}
  // Both readers store float32 keys. Rebasing 1.44 changes the last few bits;
  // compare on the same side of each key, with separate +/-1us boundary probes.
  for(const t of times){const sampled=t<.56&&boundaries.some(key=>Math.abs(key-t)<2e-7)?t+4e-7:t,a=pose(original,'animation',sampled+1.44),b=pose(result,'single_volley',t===.56?clip.duration:sampled);assert.equal(a.length,b.length,'Piece count at '+t);for(let i=0;i<a.length;i++){assert.equal(a[i].slot,b[i].slot);assert.equal(a[i].blend,b[i].blend);assert.equal(a[i].image,b[i].image);for(const key of ['vertices','uvs','triangles']){assert.equal(a[i][key].length,b[i][key].length);for(let j=0;j<a[i][key].length;j++){const drift=Math.abs(a[i][key][j]-b[i][key][j]);maxDrift=Math.max(maxDrift,drift);assert(drift<.001,'Crop geometry drift '+key+' at '+t+': '+drift);}}for(const channel of ['r','g','b','a'])assert(Math.abs(a[i].color[channel]-b[i].color[channel])<1/255+1e-7,'Crop color drift');pieces++;}}
  assert(Math.abs(clip.duration-.56)<1e-6);assert(pieces>0,'A crop with no visible source geometry is invalid');
  return{sourceStart:1.44,sourceEnd:2,duration:.56,arrows:3,flashLayers:2,samples:times.size,pieces,maxDrift,sharedOriginalTextures:true};
}
if(require.main===module){const report=verify(process.argv[2],process.argv[3]);fs.writeFileSync(process.argv[4],JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
module.exports={verify};
