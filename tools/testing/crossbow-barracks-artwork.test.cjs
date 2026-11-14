'use strict';
// User-selected crossbowmen artwork must retain registration and fitted night layers.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),fixture=require('./painted-building-integration.fixture.json');
const PNG=require('../../packages/hkd-characters/lib/png-atlas');
const folder='assets/KinghtFallIconMap/com/Ani/by/',bytes=file=>fs.readFileSync(path.join(root,file));
const json=JSON.parse(bytes(folder+'by.json')),atlas=bytes(folder+'by.atlas').toString(),page=PNG.decode(bytes(folder+'by-painted-crossbow.png'));
function rect(name){const m=atlas.match(new RegExp('(?:^|\\n)'+name+'\\n  rotate: false\\n  xy: (\\d+), (\\d+)\\n  size: (\\d+), (\\d+)'));assert(m,name);return m.slice(1).map(Number);}
const spec=fixture.crossbowSelectedArtwork;

test('four selected crossbow tiers keep original native ground anchors with uniformly scaled bodies',()=>{
 assert.equal(spec.tiers.length,4);
 for(const ref of spec.tiers){
  const n=ref.tier,skin=json.skins.find(s=>s.name==='by-painted-crossbow-'+n),body=skin.attachments[ref.bodySlot][ref.bodySlot],[w,h]=ref.bodyPixelSize;
  assert.equal(body.path,'crossbow_painted_'+n+'_body');assert.deepEqual(rect(body.path).slice(2),[w,h]);
  assert(Math.abs(body.width/w-body.height/h)<1e-9,'art must not stretch');
  const ground=[body.x+(ref.footPixel[0]-w/2)*body.width/w,body.y+(h/2-ref.footPixel[1])*body.height/h];
  assert(Math.hypot(...ground.map((v,i)=>v-ref.nativeFootAnchor[i]))<1e-6,'native per-tier placement retained');
  const night=skin.attachments['painted_crossbow_'+n+'_night']['painted_crossbow_'+n+'_night'];
  for(const key of ['x','y','width','height'])assert.equal(night[key],body[key],'body and light frame stay registered');
  assert.equal(json.slots.find(s=>s.name===ref.bodySlot).bone,'bone3');
  for(const file of ['assets/KinghtFallConfig/GameJsonCfg.json','assets/configs/GameJsonCfg.json']){
   const row=JSON.parse(bytes(file)).BuildEnum['3'].levelList.find(r=>r.index===[17,18,19,25][n-1]);
   assert.equal(row.Skin,skin.name);assert.equal(row.Icon,'painted-crossbow-'+n);
  }
 }
});

test('crossbow night masks stay on the new dark apertures and obsolete hall windows are removed',()=>{
 for(const ref of spec.tiers){
  const n=ref.tier,b=rect('crossbow_painted_'+n+'_body'),l=rect('crossbow_painted_'+n+'_night');assert.deepEqual(b.slice(2),l.slice(2));let lit=0;
  for(let y=0;y<l[3];y++)for(let x=0;x<l[2];x++){
   const li=((l[1]+y)*page.width+l[0]+x)*4;if(page.rgba[li+3]<=24)continue;
   const bi=((b[1]+y)*page.width+b[0]+x)*4;
   assert(page.rgba[bi+3]>200,'light cannot float outside the supplied building');
   assert(Math.max(...page.rgba.subarray(bi,bi+3))<140,'light cannot wash over stone or wood frames');
   // Round source bounds out to pixel cells before allowing the one-pixel resampling fringe.
   assert(ref.nightApertureBounds.some(([x0,y0,x1,y1])=>x>=Math.floor(x0)-1&&x<Math.ceil(x1)+1&&y>=Math.floor(y0)-1&&y<Math.ceil(y1)+1),'light stays in authored source aperture');lit++;
  }
  if(n<3){
   assert.equal(lit,0,'the old empty full-body mask remains unchanged; original projected sprites supply the light');
   const skin=json.skins.find(s=>s.name==='by-painted-crossbow-'+n);
   for(const kind of ['fixture','emissive'])assert.deepEqual(skin.attachments['painted_crossbow_'+n+'_lantern_'+kind],{},'standalone lantern artwork was deliberately removed');
   assert.deepEqual(skin.attachments.building_aperture_cores||{},{},'the substituted flat doorway fill stays removed');
   const lighting=require('./building-night-light-contract.cjs').fixture,openings=lighting.openings.filter(o=>o.rig==='by'&&o.skin===skin.name),ray=skin.attachments.building_aperture_rays?.building_aperture_rays;
   assert(openings.some(o=>o.kind==='door'),'the actual dark doorway retains its registered original light');
   assert(ray,'the actual doorway keeps its outward spill');assert.equal(ray.vertices.length,14*openings.length);
   for(let i=0;i<openings.length;i++)assert.deepEqual(ray.uvs.slice(i*14,(i+1)*14),lighting.source.mesh.uvs,'the complete original sprite remains unmodified');
  }else assert(lit>40&&lit<1200,'restrained visible fitted night illumination');
 }
});
