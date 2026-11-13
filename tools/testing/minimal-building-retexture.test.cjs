'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),spec=require('./painted-building-integration.fixture.json').minimalRetexture;
const {decode}=require('../../packages/hkd-characters/lib/png-atlas'),bytes=f=>fs.readFileSync(path.join(root,f)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const spineRuntime=path.join(process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','extensions/spine/lib/spine.js');

test('approved catalog covers every four-tier building family without replacing native rigs',()=>{
 assert.equal(spec.buildingTiers,40);assert.equal(spec.families,10);assert.equal(spec.wallTiers,3);assert(spec.sharedFarmPlot);
 assert.equal(spec.sourceMasters.length,62);assert.equal(new Set(spec.sourceMasters.map(m=>m.id)).size,62);
 for(const[file,hash]of Object.entries(spec.unchangedRigSha256))assert.equal(sha(bytes(file)),hash,'retexture must retain native bones, meshes, flags and animation keys: '+file);
 const plots=spec.approvedMillPlotLayout;assert.equal(sha(bytes(plots.file)),plots.sha256);
 const td=JSON.parse(bytes(plots.file));for(const name of plots.skins){const skin=td.skins.find(s=>s.name===name);assert.equal(Object.keys(skin.attachments).filter(n=>n.startsWith('td__')).length,3,'approved tier3 layout retains three native farm plots');}
 for(const name of ['mf-3','mf-bomb-4'])assert.equal(Object.keys(td.skins.find(s=>s.name===name).attachments).filter(n=>n.startsWith('td__')).length,4,'tier4 retains four native farm plots');
 assert.equal(sha(bytes(spec.approvedFlagDirection.file)),spec.approvedFlagDirection.sha256);
 for(const p of spec.unchangedPages)assert.equal(sha(bytes(p.file)),p.sha256,'separate farm defense textures stay intact');
});

test('every modular wall and gate repaint preserves its precise alpha geometry',()=>{
 const pages=new Map();assert.equal(spec.preservedWallAlpha.length,21);
 for(const r of spec.preservedWallAlpha){
  if(!pages.has(r.page))pages.set(r.page,decode(bytes(r.page)));const p=pages.get(r.page),[x,y,w,h]=r.rect,a=Buffer.alloc(w*h);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++)a[j*w+i]=p.rgba[((y+j)*p.width+x+i)*4+3];
  assert.equal(sha(a),r.alphaSha256,r.region+' cannot move a hinge, floor edge, post or connection pixel');
 }
});

test('all twelve tower bodies use the approved mobile-sized repaint frames',()=>{
 assert.equal(spec.towerBodies.length,12);
 for(const t of spec.towerBodies){const p=decode(bytes(t.file));assert.equal(sha(bytes(t.file)),t.sha256);assert.deepEqual([p.width,p.height],t.size);}
});

test('all animated building flags share the castle wind and keep their hoists attached',{skip:!fs.existsSync(spineRuntime)?'Creator 2.4.13 supplies the actual Spine runtime':false},()=>{
 const spine=require(spineRuntime),data={};
 for(const rig of ['cb','by']){
  const base='assets/KinghtFallIconMap/com/Ani/'+rig+'/',j=JSON.parse(bytes(base+rig+'.json'));
  const atlas=new spine.TextureAtlas(bytes(base+rig+'.atlas').toString(),p=>{const png=bytes(base+p);return{setFilters(){},setWraps(){},getImage:()=>({width:png.readUInt32BE(16),height:png.readUInt32BE(20)})};});
  const sd=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(j);data[rig]={j,sd};
 }
 const reference=data.cb.j;
 for(const[n,family,rig]of [[2,'castle','cb'],[3,'castle','cb'],[4,'castle','cb'],[1,'royal','by'],[2,'royal','by'],[3,'royal','by'],[4,'royal','by'],[3,'stable','by'],[4,'stable','by']]){
  const {j,sd}=data[rig],prefix='painted_'+family+'_'+n+'_flag',skin=family==='castle'?'cb-painted-'+n:'by-painted-'+family+'-'+n;
  for(const clip of ['idle','idle_night'])for(let i=0;i<4;i++)assert.deepEqual(j.animations[clip].bones[prefix+'_wave_'+i],reference.animations[clip].bones['painted_castle_3_flag_wave_'+i],'shared wind phase and wave curves');
  if(family==='stable')continue; // Vertical banners retain their existing pinned top edge.
  for(const time of [0,.25,.5,.75,1,1.5]){
   const skeleton=new spine.Skeleton(sd),state=new spine.AnimationState(new spine.AnimationStateData(sd));skeleton.setSkinByName(skin);skeleton.setToSetupPose();state.setAnimation(0,'idle',true);state.update(time);state.apply(skeleton);skeleton.updateWorldTransform();
   const slot=skeleton.findSlot(prefix),a=slot.getAttachment(),v=[];a.computeWorldVertices(slot,0,a.worldVerticesLength,v,0,2);
   const pin=[0,8,16].map(i=>v[i*2]),tail=[7,15,23].map(i=>v[i*2]);assert(tail.reduce((s,v)=>s+v,0)>pin.reduce((s,v)=>s+v,0),'free cloth extends with the castle wind at '+skin+'/'+time);
   if(family==='royal'){
    const pole=skeleton.findSlot(prefix+'_pole'),p=[];pole.getAttachment().computeWorldVertices(pole.bone,p,0,2);const center=(Math.min(...p.filter((_,i)=>i%2===0))+Math.max(...p.filter((_,i)=>i%2===0)))/2;
    assert(pin.every(x=>Math.abs(x-center)<3),'horizontal reflection keeps the cloth hoist on its original pole');
   }
  }
 }
});
