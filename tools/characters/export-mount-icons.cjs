'use strict';
// Production library thumbnails, rendered from the original weighted meshes.
// This uses only Spine geometry and decoded pixels; no game or audio runs.
const fs=require('node:fs'),path=require('node:path'),url=require('node:url');
const Mounts=require('../../packages/hkd-characters/lib/mounts'),Entries=require('../../packages/hkd-characters/lib/original-mounts'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Renderer=require('../../packages/game-data-editor/preview/spine-renderer'),PNG=require('../../packages/hkd-characters/lib/png-atlas'),Bake=require('../../packages/hkd-characters/lib/native-bake'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
function render(root,entry,read){
 const spine=require(Units.enginePath()),layer=Mounts.describe(root,{source:'character-maker/Character',mount:entry.mount},true).layers[0];read(path.join(root,layer.source));read(path.join(root,layer.source.replace(/\.json$/,'.atlas')));
 const atlas=new spine.TextureAtlas(layer.atlas,name=>new spine.FakeTexture(PNG.decode(read(url.fileURLToPath(layer.pages[name]))))),data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(layer.json),skeleton=new spine.Skeleton(data);
 skeleton.setSkinByName(entry.skin);skeleton.setToSetupPose();data.findAnimation('idle').apply(skeleton,0,0,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();
 const pieces=Renderer.geometry(spine,{skeleton}).filter(piece=>piece.color.a>0),xs=pieces.flatMap(piece=>Array.from(piece.vertices).filter((v,i)=>!(i%2))),ys=pieces.flatMap(piece=>Array.from(piece.vertices).filter((v,i)=>i%2)),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=112/Math.max(maxX-minX,maxY-minY),cx=(minX+maxX)/2,cy=(minY+maxY)/2,image={width:128,height:128,rgba:Buffer.alloc(128*128*4)};
 for(const piece of pieces)for(let i=0;i<piece.triangles.length;i+=3){
  const ids=piece.triangles.slice(i,i+3),points=ids.map(id=>({x:64+(piece.vertices[id*2]-cx)*scale,y:64-(piece.vertices[id*2+1]-cy)*scale})),[a,b,c]=points,det=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(Math.abs(det)<1e-8)continue;
  for(let y=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))));y<Math.min(128,Math.ceil(Math.max(...points.map(p=>p.y))));y++)for(let x=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x))));x<Math.min(128,Math.ceil(Math.max(...points.map(p=>p.x))));x++){
   const px=x+.5-a.x,py=y+.5-a.y,v=(px*(c.y-a.y)-py*(c.x-a.x))/det,w=((b.x-a.x)*py-(b.y-a.y)*px)/det,u=1-v-w;if(u<0||v<0||w<0)continue;
   const weights=[u,v,w],tx=Math.max(0,Math.min(piece.image.width-1,Math.floor(ids.reduce((sum,id,j)=>sum+piece.uvs[id*2]*weights[j],0)*piece.image.width))),ty=Math.max(0,Math.min(piece.image.height-1,Math.floor(ids.reduce((sum,id,j)=>sum+piece.uvs[id*2+1]*weights[j],0)*piece.image.height))),from=(ty*piece.image.width+tx)*4,to=(y*128+x)*4,alpha=piece.image.rgba[from+3]/255*piece.color.a,old=image.rgba[to+3]/255,total=alpha+old*(1-alpha);if(!total)continue;
   for(let k=0;k<3;k++)image.rgba[to+k]=Math.round((piece.image.rgba[from+k]*[piece.color.r,piece.color.g,piece.color.b][k]*alpha+image.rgba[to+k]*old*(1-alpha))/total);image.rgba[to+3]=Math.round(total*255);
  }
 }
 return image;
}
function generate(root){const files=new Map(),reads=new Map(),read=file=>{file=path.resolve(file);if(!reads.has(file))reads.set(file,fs.readFileSync(file));return reads.get(file);};require('../../packages/hkd-characters/lib/current-model').folderMetadata(root,'assets/resources/unit-library/mount-icons',files,read);for(const entry of Entries.assets()){files.set(entry.image,PNG.encode(render(root,entry,read)));const meta=path.join(root,entry.image+'.meta');files.set(entry.image+'.meta',fs.existsSync(meta)?read(meta):JSON.stringify(Bake.textureMeta(entry.image,128,128),null,2)+'\n');}for(const relative of files.keys()){const file=path.join(root,relative);if(!reads.has(file))reads.set(file,fs.existsSync(file)?read(file):null);}return Tx.commit(root,files,reads,Entries.assets()[0].image);}
module.exports={render,generate};
if(require.main===module)console.log(generate(path.resolve(__dirname,'../..')));
