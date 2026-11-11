'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const F=require('./spine-renderer-fixture');
function renderer(){
 const counters={canvases:0,sourceDraws:0,reads:0,writes:0};
 const document={createElement(){counters.canvases++;const canvas={};const context={drawImage(image){counters.sourceDraws++;canvas.rgba=new Uint8ClampedArray(image.rgba);},getImageData(){counters.reads++;return{data:new Uint8ClampedArray(canvas.rgba)};},createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)};},putImageData(pixels){counters.writes++;canvas.rgba=new Uint8ClampedArray(pixels.data);}};canvas.getContext=()=>context;return canvas;}};
 const scope={module:{exports:{}},document};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preview/spine-renderer.js'),'utf8')+'\nmodule.exports.testOnly={tintedImage,textureTransform};',scope);
 return{R:scope.module.exports,counters};
}
test('preview tint multiplies RGB while preserving every source alpha, including black102 shadows',()=>{
 const{R,counters}=renderer(),rgba=new Uint8ClampedArray([0,0,0,102,200,100,50,255,100,20,220,1,77,111,233,0,255,255,255,127]),image={width:5,height:1,rgba},before=Buffer.from(rgba),color={r:167/255,g:90/255,b:221/255,a:.1};
 const result=R.testOnly.tintedImage(image,color),expected=new Uint8ClampedArray(rgba);
 for(let i=0;i<expected.length;i+=4){expected[i]*=167/255;expected[i+1]*=90/255;expected[i+2]*=221/255;}
 assert.deepEqual(Buffer.from(result.rgba),Buffer.from(expected));assert.deepEqual(Array.from(result.rgba.slice(0,4)),[0,0,0,102]);assert.deepEqual(Buffer.from(rgba),before);
 assert.equal(R.testOnly.tintedImage(image,{...color,a:.9}),result,'Slot alpha must not be baked into cached texture alpha');
 assert.equal(counters.reads,1);assert.equal(counters.writes,1);assert.equal(counters.canvases,1);
});
test('the actual native wall post shadow retains its original102 alpha and black RGB at night',()=>{
 const{R}=renderer(),PNG=require('../../hkd-characters/lib/png-atlas'),directory=path.resolve(__dirname,'../../../assets/KinghtFallIconMap/com/Ani/cq/cq1'),atlas=fs.readFileSync(path.join(directory,'cq1.atlas'),'utf8'),match=atlas.match(/rts_wall_post_2\r?\n\s+rotate: false\r?\n\s+xy: (\d+), (\d+)/);
 assert(match,'native post region remains available');const image=PNG.decode(fs.readFileSync(path.join(directory,'wall-rts.png'))),at=((Number(match[2])+61)*image.width+Number(match[1])+19)*4,rgba=image.rgba.slice(at,at+4);
 assert.deepEqual(Array.from(rgba),[0,0,0,102]);const output=R.testOnly.tintedImage({width:1,height:1,rgba},{r:167/255,g:167/255,b:167/255});assert.deepEqual(Array.from(output.rgba),[0,0,0,102]);
});
test('white tint is allocation-free and source readback stays once per image across bounded color cache misses',()=>{
 const{R,counters}=renderer(),image={width:1,height:1,rgba:new Uint8ClampedArray([180,120,60,102])};
 assert.equal(R.testOnly.tintedImage(image,{r:1,g:1,b:1}),image);assert.equal(counters.canvases,0);
 const colors=Array.from({length:25},(_,r)=>({r:r/255,g:0,b:0})),first=R.testOnly.tintedImage(image,colors[0]);
 for(const c of colors.slice(1))R.testOnly.tintedImage(image,c);
 assert.equal(counters.reads,1);assert.equal(counters.sourceDraws,1);
 const count=counters.canvases,last=R.testOnly.tintedImage(image,colors[24]);assert.equal(counters.canvases,count);assert.equal(R.testOnly.tintedImage(image,colors[24]),last);
 assert.notEqual(R.testOnly.tintedImage(image,colors[0]),first,'The existing24color bound still evicts the oldest tint');assert.equal(counters.canvases,count+1);assert.equal(counters.reads,1);
 const replacement={...image,rgba:new Uint8ClampedArray([1,2,3,102])};R.testOnly.tintedImage(replacement,colors[0]);assert.equal(counters.reads,2,'Replacement decoded images cannot reuse stale pixel data');
});
test('one affine region maps every atlas corner exactly through rotations and mirroring',()=>{
 const{R}=renderer(),base=[10,80,30,10,130,40,110,110],uvs=[[100,280,100,200,130,200,130,280],[130,280,100,280,100,200,130,200]];
 for(const sign of[1,-1])for(const texture of uvs){const positions=base.map((value,i)=>i%2?value:value*sign),matrix=R.testOnly.textureTransform(positions,texture);for(let i=0;i<8;i+=2){assert(Math.abs(matrix[0]*texture[i]+matrix[2]*texture[i+1]+matrix[4]-positions[i])<1e-9);assert(Math.abs(matrix[1]*texture[i]+matrix[3]*texture[i+1]+matrix[5]-positions[i+1])<1e-9);}}
 assert.equal(R.testOnly.textureTransform(base,[0,0,0,0,0,0]),null);
});
function context(){const draws=[],ctx={globalAlpha:1,globalCompositeOperation:'source-over',save(){},restore(){},translate(){},scale(){},rotate(){},transform(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},getTransform:()=>({a:1,b:0,c:0,d:1}),drawImage(image){draws.push({image,alpha:this.globalAlpha,blend:this.globalCompositeOperation});}};return{ctx,draws};}
test('unclipped regions draw once while deforming and clipped attachments retain triangle rendering and slot opacity',()=>{
 const{R}=renderer(),image={width:8,height:8},vertices=[1,9,2,1,10,2,9,10],region=new F.spine.RegionAttachment(image,vertices),mesh=new F.spine.MeshAttachment(image,vertices);
 assert.equal(R.geometry(F.spine,F.layer(region))[0].rigidRegion,true);
 assert.equal(R.geometry(F.spine,F.layer(mesh))[0].rigidRegion,false);
 assert.equal(R.geometry(F.spine,F.layer(region,{clip:true}))[0].rigidRegion,false);
 for(const[attachment,clip,count]of[[region,false,1],[mesh,false,2],[region,true,2]]){const{ctx,draws}=context();R.drawWorld(F.spine,ctx,[F.layer(attachment,{clip,color:{r:1,g:1,b:1,a:.5},opacity:.4,blend:2})]);assert.equal(draws.length,count);for(const draw of draws){assert.equal(draw.alpha,.2);assert.equal(draw.blend,'multiply');assert.equal(draw.image,image);}}
});
