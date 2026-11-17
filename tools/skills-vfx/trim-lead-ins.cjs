'use strict';
// Analyze original pixels/Spine poses, leaving source sheets, UUIDs and all
// authored contact events intact. Only the catalog's source-time trim changes.
const fs=require('node:fs'),path=require('node:path'),PNG=require('../../packages/hkd-characters/lib/png-atlas');
function firstFrame(image,clip){
  for(let frame=0;frame<clip.frames;frame++){const x=frame%clip.columns*clip.cell,y=Math.floor(frame/clip.columns)*clip.cell;
    for(let row=0;row<clip.cell;row++)for(let col=0;col<clip.cell;col++)if(image.rgba[((y+row)*image.width+x+col)*4+3])return frame;
  }return null;
}
function spineStart(root,clip,spine){
  const file=path.join(root,'assets',clip.bundle||'resources',clip.resource+'.json'),json=JSON.parse(fs.readFileSync(file)),atlasText=fs.readFileSync(file.replace(/\.json$/,'.atlas'),'utf8'),images=new Map();
  const atlas=new spine.TextureAtlas(atlasText,name=>{const image=PNG.decode(fs.readFileSync(path.resolve(path.dirname(file),name)));images.set(name,image);return new spine.FakeTexture(image);});
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json),skeleton=new spine.Skeleton(data),animation=data.findAnimation(clip.animation),renderer=require('../../packages/game-data-editor/preview/spine-renderer');
  if(!animation)throw Error('Missing source animation '+clip.id);
  function visible(piece){if(piece.color.a<=0)return false;let area=0;for(let i=0;i<piece.triangles.length;i+=3){const a=piece.triangles[i]*2,b=piece.triangles[i+1]*2,c=piece.triangles[i+2]*2;area+=Math.abs((piece.vertices[b]-piece.vertices[a])*(piece.vertices[c+1]-piece.vertices[a+1])-(piece.vertices[c]-piece.vertices[a])*(piece.vertices[b+1]-piece.vertices[a+1]));}if(area<1e-9)return false;
    const image=piece.image,us=[],vs=[];for(let i=0;i<piece.uvs.length;i+=2){us.push(piece.uvs[i]);vs.push(piece.uvs[i+1]);}const x0=Math.max(0,Math.floor(Math.min(...us)*image.width)),x1=Math.min(image.width,Math.ceil(Math.max(...us)*image.width)),y0=Math.max(0,Math.floor(Math.min(...vs)*image.height)),y1=Math.min(image.height,Math.ceil(Math.max(...vs)*image.height));for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(image.rgba[(y*image.width+x)*4+3])return true;return false;}
  for(let i=0;i<=Math.ceil(animation.duration*120);i++){skeleton.setToSetupPose();animation.apply(skeleton,0,i/120,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();const layer={skeleton,description:{x:0,y:0,scaleX:1,scaleY:1}};if(renderer.geometry(spine,layer).some(visible))return i/120;}
  throw Error('Empty native VFX '+clip.id);
}
function sheetStart(root,clip){const frame=firstFrame(PNG.decode(fs.readFileSync(path.join(root,'assets',clip.bundle||'resources',clip.resource+'.png'))),clip);return frame===null?NaN:frame/clip.fps;}
function annotate(root,catalog,spine){return catalog.clips.map(clip=>{const trimStart=clip.kind==='flipbook'?sheetStart(root,clip):clip.kind==='spine'?spineStart(root,clip,spine):0;if(!Number.isFinite(trimStart))throw Error('Empty effect '+clip.id);return{id:clip.id,trimStart:trimStart};});}
if(require.main===module){const root=path.resolve(__dirname,'../..'),file=path.join(root,'assets/resources/vfx/hero-skills/catalog.json'),bytes=fs.readFileSync(file),catalog=JSON.parse(bytes),spine=require(require('../../packages/game-data-editor/lib/unit-assets').enginePath()),rows=annotate(root,catalog,spine);
  if(process.argv.includes('--write')){if(!fs.readFileSync(file).equals(bytes))throw Error('Catalog changed during analysis');for(const row of rows)Object.assign(catalog.clips.find(clip=>clip.id===row.id),{trimStart:row.trimStart});const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');write(file,catalog);fs.writeFileSync(path.join(root,'assets/_script/HeroSkillVFXCatalog.js'),'"use strict";\n// Generated skill VFX catalog, including measured blank-frame source trims.\nmodule.exports = '+JSON.stringify(catalog,null,2)+';\n');
    for(const relative of ['tools/skills-vfx/native-clips.json','tools/skills-vfx/sheet-clips.json']){const p=path.join(root,relative),values=JSON.parse(fs.readFileSync(p));for(const value of values){const row=rows.find(row=>row.id===value.id);if(row)value.trimStart=row.trimStart;}write(p,values);}}
  process.stdout.write(JSON.stringify(rows,null,2)+'\n');
}
module.exports={firstFrame,spineStart,annotate};
