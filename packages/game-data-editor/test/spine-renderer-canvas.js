'use strict';
// Real Canvas pixel regressions, run by a coordinated silent editor test page.
// Synthetic attachments only: no game launch, authoring save or player state.
const Renderer=require('../preview/spine-renderer'),F=require('./spine-renderer-fixture');
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const pixel=(c,x,y)=>Array.from(c.getContext('2d').getImageData(Math.floor(x),Math.floor(y),1,1).data);
function verifyTint(renderer=Renderer){
 const checks=[],assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);},source=canvas(5,1),g=source.getContext('2d'),input=g.createImageData(5,1);
 input.data.set([0,0,0,102,200,100,50,255,100,20,220,1,77,111,233,0,255,255,255,127]);g.putImageData(input,0,0);
 const baseline=g.getImageData(0,0,5,1).data,attachment=new F.spine.RegionAttachment(source,[0,1,0,0,5,0,5,1]),color={r:167/255,g:90/255,b:221/255,a:1},layer=F.layer(attachment,{color}),out=canvas(5,1),ctx=out.getContext('2d');ctx.imageSmoothingEnabled=false;renderer.drawWorld(F.spine,ctx,[layer]);
 assert(pixel(out,0,0).join(',')==='0,0,0,102','night tint keeps the original black102 shadow instead of creating pale gray');
 for(let x=0;x<5;x++){const p=pixel(out,x,0),at=x*4;assert(p[3]===baseline[at+3],'tint preserves exact source alpha '+baseline[at+3]);for(let n=0;n<3;n++){const expected=baseline[at+n]*[color.r,color.g,color.b][n]*p[3]/255;assert(Math.abs(p[n]*p[3]/255-expected)<=1,'straight RGB multiplication retains correct premultiplied channel '+x+':'+n);}}
 layer.skeleton.drawOrder[0].color.a=.5;layer.description.opacity=.5;ctx.clearRect(0,0,5,1);renderer.drawWorld(F.spine,ctx,[layer]);
 for(let x=0;x<5;x++)assert(Math.abs(pixel(out,x,0)[3]-baseline[x*4+3]*.25)<=1,'slot alpha and layer opacity apply once after texture tint '+x);
 return{checks};
}
function verifyRegions(renderer=Renderer){
 const checks=[],assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);},solid=canvas(24,24),g=solid.getContext('2d');g.fillStyle='rgb(210,90,40)';g.fillRect(0,0,24,24);
 let interiorPixels=0;
 for(let i=0;i<8;i++){
  const o={x:50.23+i*.137,y:10.31+i*.191},a={x:80.42+i*2,y:20.33-i*.25},b={x:-30.41+i*.1,y:90.77-i},points=[o.x+b.x,o.y+b.y,o.x,o.y,o.x+a.x,o.y+a.y,o.x+a.x+b.x,o.y+a.y+b.y],out=canvas(200,160),ctx=out.getContext('2d');
  renderer.drawWorld(F.spine,ctx,[F.layer(new F.spine.RegionAttachment(solid,points))]);const data=ctx.getImageData(0,0,200,160).data;
  let leaks=0;
  for(let y=0;y<160;y++)for(let x=0;x<200;x++){
   const distances=[];for(let n=0;n<4;n++){const next=(n+1)%4,dx=points[next*2]-points[n*2],dy=points[next*2+1]-points[n*2+1];distances.push((dx*(y+.5-points[n*2+1])-dy*(x+.5-points[n*2]))/Math.hypot(dx,dy));}
   if(!(distances.every(d=>d>3)||distances.every(d=>d< -3)))continue;
   interiorPixels++;if(data[(y*200+x)*4+3]!==255)leaks++;
  }
  assert(leaks===0,'opaque affine region has no internal diagonal background leaks at fractional pose '+i);
 }
 assert(interiorPixels>40000,'the seam regression samples the entire interior rather than a few convenient texels');
 const atlas=canvas(24,32),ag=atlas.getContext('2d'),colors=['#ff0000','#00ff00','#0000ff','#ffff00'];ag.fillStyle='#ff00ff';ag.fillRect(0,0,24,32);
 for(let y=0;y<2;y++)for(let x=0;x<2;x++){ag.fillStyle=colors[y*2+x];ag.fillRect(4+x*4,6+y*6,4,6);}
 const normal=[4/24,18/32,4/24,6/32,12/24,6/32,12/24,18/32],rotated=[12/24,18/32,4/24,18/32,4/24,6/32,12/24,6/32];
 for(const[rotation,uvs]of[['normal',normal],['rotated',rotated]])for(const mirror of[false,true]){
  const points=[10,60,10,10,60,10,60,60].map((v,i)=>mirror&&i%2===0?70-v:v),out=canvas(70,70);renderer.drawWorld(F.spine,out.getContext('2d'),[F.layer(new F.spine.RegionAttachment(atlas,points,uvs))]);
  for(const u of[.25,.75])for(const v of[.25,.75]){
   const x=points[0]+u*(points[6]-points[0])+v*(points[2]-points[0]),y=points[1]+u*(points[7]-points[1])+v*(points[3]-points[1]),sx=(uvs[0]+u*(uvs[6]-uvs[0])+v*(uvs[2]-uvs[0]))*atlas.width,sy=(uvs[1]+u*(uvs[7]-uvs[1])+v*(uvs[3]-uvs[1]))*atlas.height;
   assert(pixel(out,x,y).join(',')===pixel(atlas,sx,sy).join(','),rotation+' atlas crop retains its painted corner under mirror='+mirror+' at '+u+','+v);
  }
 }
 return{checks,interiorPixels};
}
async function verify(){const tint=verifyTint(),regions=verifyRegions();return{checks:tint.checks.concat(regions.checks),interiorPixels:regions.interiorPixels};}
module.exports={verify,verifyTint,verifyRegions};
