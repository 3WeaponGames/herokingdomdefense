'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('./building-night-light-contract.cjs'),P=require('../../packages/hkd-characters/lib/png-atlas'),F=C.fixture,R=path.resolve(__dirname,'../..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(R,rel),'utf8')),sha=x=>crypto.createHash('sha256').update(x).digest('hex'),hash=x=>sha(JSON.stringify(x)),dir=a=>'assets/KinghtFallIconMap/com/Ani/'+a+'/',slot='building_aperture_rays';
const runtime=path.join(process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','extensions/spine/lib/spine.js');

test('all new opening lights use the complete original sprite and no custom flat fill',()=>{
 const image=P.decode(fs.readFileSync(path.join(R,'assets/resources/buildings/lighting/native-window-ray.png')));assert.equal(sha(image.rgba),F.source.rgbaSha256);
 for(const [rig]of Object.entries(F.rigs)){const json=read(dir(rig)+rig+'.json');for(const skin of json.skins){const openings=F.openings.filter(o=>o.rig===rig&&o.skin===skin.name);if(!openings.length)continue;const mesh=skin.attachments[slot][slot];openings.forEach((o,i)=>{assert.deepEqual(mesh.uvs.slice(i*14,(i+1)*14),F.source.mesh.uvs);const size=F.source.mesh.triangles.length;assert.deepEqual(mesh.triangles.slice(i*size,(i+1)*size),F.source.mesh.triangles.map(v=>v+i*7));});if(rig!=='mf')assert.deepEqual(skin.attachments.building_aperture_cores||{},{});else{const fit=F.originalWindowFits.find(f=>f.skin===skin.name);assert(fit);assert.deepEqual(skin.attachments.building_aperture_cores.building_aperture_cores.uvs,fit.sourceMesh.uvs);}}}
 for(const file of ['assets/KinghtFallConfig/GameJsonCfg.json','assets/configs/GameJsonCfg.json'])for(const row of read(file).BuildEnum[2].levelList){for(const light of row.Appearance?.lighting||[]){assert.equal(light.opacity,0,'custom tower masks stay off');for(const glow of (light.glow?[light.glow]:[]).concat(light.glows||[])){assert.equal(glow.sprite,'buildings/lighting/native-window-ray');assert.equal(glow.color,'#FFFFFF','original colored pixels are not retinted');assert(glow.opacity>=200);}}}
});

test('the original mill light is only rescaled/repositioned while retaining its pixels, UVs and mesh topology',()=>{
 assert.equal(F.originalWindowFits.length,7);const json=read(dir('mf')+'mf.json');for(const fit of F.originalWindowFits){const mesh=json.skins.find(s=>s.name===fit.skin).attachments[fit.renderSlot||fit.slot][fit.renderAttachment||fit.name];assert.deepEqual(mesh.uvs,fit.sourceMesh.uvs);assert.deepEqual(mesh.triangles,fit.sourceMesh.triangles);assert.equal(mesh.path,fit.sourceMesh.path||fit.name);assert(mesh.vertices.every(Number.isFinite));}
});
test('native light additions reverse exactly without changing a body pixel or original gameplay animation',()=>{
 for(const[a,c]of Object.entries(F.rigs)){
  const json=read(dir(a)+a+'.json');assert.equal(hash(C.skeleton(a,json)),c.beforeSkeleton);
  assert.deepEqual(json.slots.slice(-2).map(s=>s.name),F.presentation.fixedSlotNames,'two same-atlas exposures have a fixed trailing slot order');
  for(const name of F.presentation.fixedSlotNames)assert.equal(json.slots.find(s=>s.name===name).attachment,undefined,'setup pose cannot inflate bounds before an animation begins');
  assert.equal(json.slots.find(s=>s.name===slot).blend,undefined,'original fans use normal-alpha blending');
  const page=fs.readFileSync(path.join(R,c.page));assert.equal(sha(page),c.pageSha256);
  const im=P.decode(page),pixels=P.crop(im,2,2,70,70,false);assert.equal(sha(pixels.rgba),F.source.rgbaSha256,'copy original arrowtower fan pixels exactly');
  const meta=read(c.page+'.meta');assert.equal(meta.uuid,c.rayTextureUuid);assert.deepEqual([meta.width,meta.height],[128,128]);
  assert.equal(read(dir(a)+a+'.json.meta').textures.filter(id=>id===meta.uuid).length,1);
 }
});
test('added lantern fixtures and their emissive glass are removed while native door light stays available',()=>{
 let count=0;for(const[a,c]of Object.entries(F.rigs))for(const p of c.patches.filter(p=>p.path[0]==='skins'&&/lantern_(fixture|emissive)$/.test(String(p.path.at(-1))))){let actual=read(dir(a)+a+'.json');for(const key of p.path)actual=actual[key];assert.deepEqual(actual,{});count++;}
 assert.equal(count,16,'eight physical lanterns and eight emissive overlays');assert(F.openings.some(o=>o.kind==='door'));assert.equal(F.openings.filter(o=>o.kind==='lantern').length,0,'removed lanterns must not leave a detached floating light fan');assert.equal(F.openings.length,56);assert.equal(F.openings.filter(o=>o.coreVertices>0).length,0,'custom solid fills are removed');assert(F.openings.every(o=>o.originalFullSprite));
 const castle=read(dir('cb')+'cb.json').skins.find(s=>s.name==='cb-painted-1');assert.deepEqual(castle.attachments[slot],{},'a closed plank doorway has no substitute ghost-lantern ray');assert.equal(castle.attachments.building_aperture_cores,undefined);
});

test('open entries emit rays across houses, mills, castles and barracks without adding light behind closed wood',()=>{
 const doors=F.openings.filter(o=>o.kind==='door');for(const a of ['mz','mf','by','cb'])assert(doors.some(o=>o.rig===a));
 assert.equal(new Set(doors.filter(o=>o.rig==='mz').map(o=>o.skin)).size,4);assert.equal(new Set(doors.filter(o=>o.rig==='mf').map(o=>o.skin)).size,7,'all ordinary and bomb mill variants');
 assert(!doors.some(o=>o.skin==='cb-painted-1'),'closed castle plank entry stays unlit');
 for(const skin of ['by-painted-royal-1','by-painted-royal-2','by-painted-royal-3','by-painted-royal-4','by-painted-crossbow-1','by-painted-crossbow-2','by-painted-crossbow-4','by-painted-stable-1','by-painted-heavy-1','by-painted-heavy-2'])assert(doors.some(o=>o.skin===skin),skin+' visible open entry receives light');
 for(const o of F.openings){assert(o.local.width>0&&o.local.height>0);assert(Object.values(o.local).every(Number.isFinite));}
});
test('all native projection meshes are finite and use the same original ray topology',()=>{
 for(const[a]of Object.entries(F.rigs)){const j=read(dir(a)+a+'.json');for(const s of j.skins){const m=s.attachments[slot]?.[slot];if(!m)continue;const openings=F.openings.filter(o=>o.rig===a&&o.skin===s.name),count=openings.length,coreVertices=openings.reduce((n,o)=>n+(o.coreVertices||0),0),coreTriangles=openings.reduce((n,o)=>n+Math.max(0,(o.coreVertices||0)-2)*3,0);assert.equal(m.vertices.length,F.source.mesh.vertices.length*count);assert.equal(m.triangles.length,F.source.mesh.triangles.length*count);const core=s.attachments.building_aperture_cores?.building_aperture_cores;const original=a==='mf'&&F.originalWindowFits.find(f=>f.skin===s.name);assert.equal(core?.vertices.length||0,original?original.sourceMesh.vertices.length:2*coreVertices);assert.equal(core?.triangles.length||0,original?original.sourceMesh.triangles.length:coreTriangles);for(const mesh of [m,core].filter(Boolean)){assert.equal(mesh.uvs.length,mesh.vertices.length);assert(mesh.vertices.every(Number.isFinite));assert(mesh.uvs.every(v=>v>=0&&v<=1));assert(mesh.triangles.every(i=>i>=0&&i<mesh.vertices.length/2));}if(core){assert(original,'only the complete original mill window occupies the legacy core slot');assert.deepEqual(core.uvs,original.sourceMesh.uvs);assert.deepEqual(core.triangles,original.sourceMesh.triangles);}}}
});
test('actual Creator Spine keeps light day/night, fade, skin switching, opacity breathing and destruction lifecycle', {skip:!fs.existsSync(runtime)?'Creator Spine is optional on CI':false},()=>{
 const spine=require(runtime);let poses=0;
 for(const[a]of Object.entries(F.rigs)){
  const j=read(dir(a)+a+'.json'),atlas=new spine.TextureAtlas(fs.readFileSync(path.join(R,dir(a)+a+'.atlas'),'utf8'),page=>{const b=fs.readFileSync(path.join(R,dir(a)+page));return {setFilters(){},setWraps(){},getImage:()=>({width:b.readUInt32BE(16),height:b.readUInt32BE(20)})};}),data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(j),skeleton=new spine.Skeleton(data);
  const skins=[...new Set(F.openings.filter(o=>o.rig===a).map(o=>o.skin))];
  function pose(name,clip,time){skeleton.setSkinByName(name);skeleton.setToSetupPose();data.findAnimation(clip).apply(skeleton,0,time,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();poses++;return skeleton.findSlot(slot);}
  for(const name of skins){
   for(const clip of ['idle','create','upgrade']){pose(name,clip,.3);for(const key of F.presentation.fixedSlotNames){const day=skeleton.findSlot(key);assert.equal(day.color.a,0,name+' day lights off');assert.equal(day.getAttachment(),null,'day rays cannot inflate building bounds or occlusion captures');}}
   assert.equal(pose(name,'Fade_in',0).color.a,0);const halfway=pose(name,'Fade_in',.25).color.a;assert(halfway>0&&halfway<1);assert(Math.abs(pose(name,'Fade_in',.5).color.a-1)<1e-6);
   const light=pose(name,'idle_night',.3),mesh=light.getAttachment(),v0=[],alpha=light.color.a;assert(mesh instanceof spine.MeshAttachment);mesh.computeWorldVertices(light,0,mesh.worldVerticesLength,v0,0,2);assert(v0.every(Number.isFinite));assert(alpha>=.85&&alpha<=1);assert.equal(light.deform.length,0,'emissive geometry cannot lose a native deformation vector during scoped occlusion bounds');const window=skeleton.findSlot('building_aperture_cores');if(a==='mf'){assert(window.getAttachment() instanceof spine.MeshAttachment);assert(window.deform.length>0&&window.deform.every(Number.isFinite),'the original window breathing deformation is preserved');}else assert.equal(window.deform.length,0);
   pose(name,'idle_night',1);const v1=[];mesh.computeWorldVertices(light,0,mesh.worldVerticesLength,v1,0,2);assert.deepEqual(v0,v1,name+' has fixed low-cost light geometry');assert(light.color.a>alpha,'the original 2-second opacity breathing supplies movement without geometry updates');
   assert.equal(pose(name,'destroy',.4).getAttachment(),null);assert(pose(name,'idle_night',0).getAttachment(),'rebuild restores rays');
  }
  const untouched=j.skins.find(s=>!s.attachments[slot]);if(untouched)assert.equal(pose(untouched.name,'idle_night',.3).getAttachment(),null,'no rays leak onto an unrelated skin');
  if(a==='cb')for(const clip of ['idle','create','upgrade','Fade_in','idle_night','destroy']){pose('cb-painted-1',clip,.3);for(const key of F.presentation.fixedSlotNames)assert.equal(skeleton.findSlot(key).getAttachment(),null,'closed castle entry has no ghost light in any lifecycle phase');for(const key of ['painted_castle_1_lantern_fixture','painted_castle_1_lantern_emissive'])assert.equal(skeleton.findSlot(key).getAttachment(),null,'removed lantern cannot return during a phase or rebuild');}
 }
 assert(poses>=250);
});
