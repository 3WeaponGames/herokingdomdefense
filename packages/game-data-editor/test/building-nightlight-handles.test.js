'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),H=require('../buildings/nightlight-handles'),T=require('../../../assets/_script/BuildingNightlight'),Maps=require('../lib/map-assets');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`),point=(a,b)=>{near(a.x,b.x);near(a.y,b.y);},identity=[1,0,0,1,0,0];
const sprite={id:'sprite:0:0',matrix:identity,glow:{x:25,y:35,width:40,height:70,shearX:0,shearY:0,angle:0}},base=T.value({},sprite.id);
function target(f,h,x,y){const anchor=Maps.point(f.matrix,h.anchor);return{x:anchor.x+(h.x-anchor.x)*x,y:anchor.y+(h.y-anchor.y)*y};}
test('brush picking respects the actual rotated and mirrored transform box instead of its surrounding rectangle',()=>{
 const entry={matrix:[.8,.2,-.1,.9,21,-13],glow:T.glow({type:'circle'})},v={...T.value({},'light:1'),angle:37,scaleX:1.8,scaleY:.4,flipX:true},f=H.frame(entry,v);
 assert(H.contains(f,f.center));for(const p of [{x:-34,y:-34},{x:34,y:34},{x:0,y:0}])assert(H.contains(f,Maps.point(f.matrix,p)));for(const p of [{x:36,y:0},{x:0,y:-36},{x:50,y:50}])assert(!H.contains(f,Maps.point(f.matrix,p)));assert(!H.contains(f,{x:NaN,y:0}));
});
test('corners resize both dimensions while edges resize only their own axis and keep the opposite handle fixed',()=>{
 for(const h of H.frame(sprite,base).handles){const f=H.frame(sprite,base),before=JSON.stringify({sprite,base}),p=target(f,h,h.axisX?1.6:1,h.axisY?1.3:1),next=H.resize(sprite,base,h,p),after=H.frame(sprite,{...base,...next});near(next.scaleX,h.axisX?1.6:1);near(next.scaleY,h.axisY?1.3:1);point(Maps.point(f.matrix,h.anchor),Maps.point(after.matrix,h.anchor));point(after.handles[h.index],p);assert.equal(JSON.stringify({sprite,base}),before);}
});
test('sprite resize follows rotation, mirroring, native shear and reflected nonuniform owner transforms',()=>{
 for(const angle of [-120,0,36,90])for(const flipX of [false,true])for(const flipY of [false,true]){
  const entry={...sprite,matrix:[-1.3,.2,.5,.8,70,-15],glow:{...sprite.glow,angle:25,shearX:24,shearY:-12}},v={...base,x:13,y:-27,angle,scaleX:1.2,scaleY:.7,flipX,flipY},f=H.frame(entry,v);
  for(const h of f.handles){const pivot=Maps.point(f.local,h.anchor),desired={...v,scaleX:h.axisX?1.9:v.scaleX,scaleY:h.axisY?1.5:v.scaleY},raw=H.frame(entry,desired),moved=Maps.point(raw.local,h.anchor);desired.x+=pivot.x-moved.x;desired.y+=pivot.y-moved.y;const p=H.frame(entry,desired).handles[h.index],next=H.resize(entry,v,h,p),after=H.frame(entry,{...v,...next});near(next.scaleX,desired.scaleX);near(next.scaleY,desired.scaleY);point(Maps.point(f.matrix,h.anchor),Maps.point(after.matrix,h.anchor));point(after.handles[h.index],p);}
  // The frame encloses the same sheared sprite corners the runtime renders.
  const m=Maps.multiply(entry.matrix,T.glowMatrix(entry.glow,v)),inverse=Maps.inverse(f.matrix);for(const x of [-20,20])for(const y of [-35,35]){const p=Maps.point(inverse,Maps.point(m,{x,y}));assert(p.x>=f.bounds.minX-1e-7&&p.x<=f.bounds.maxX+1e-7&&p.y>=f.bounds.minY-1e-7&&p.y<=f.bounds.maxY+1e-7);}
 }
});
test('mesh lights use their original pivot and resizing remains finite at limits without changing flip or rotation',()=>{
 const entry={id:'mesh:building_aperture_rays:0',matrix:identity,center:{x:10,y:30},vertices:[-15,5,35,5,35,55,-15,55]},v={...base,angle:38,flipX:true},f=H.frame(entry,v);
 for(const h of f.handles){const next=H.resize(entry,v,h,{x:h.x,y:h.y});near(next.x,v.x);near(next.y,v.y);near(next.scaleX,v.scaleX);near(next.scaleY,v.scaleY);}
 const h=f.handles[2],fixed=Maps.point(f.matrix,h.anchor);for(const p of [fixed,{x:1e9,y:-1e9},{x:-1e9,y:1e9}]){const next=H.resize(entry,v,h,p);assert.equal(T.issues({version:1,lights:{[entry.id]:{...v,...next}}}).length,0);assert.equal(next.flipX,undefined);assert.equal(next.angle,undefined);}
 assert.equal(H.resize(entry,v,h,{x:NaN,y:0}),null);assert.equal(H.frame({...entry,vertices:[10,30,10,30]},v).handles.length,0);
 assert.equal(H.cursor({x:10,y:0},{x:0,y:0}),'ew-resize');assert.equal(H.cursor({x:0,y:10},{x:0,y:0}),'ns-resize');assert.equal(H.cursor({x:10,y:-10},{x:0,y:0}),'nwse-resize');
});
