'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Baker=require('../../packages/hkd-characters/lib/native-bake'),Mounts=require('../../packages/hkd-characters/lib/mounts'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Library=require('../../packages/hkd-characters/lib/unit-library'),Core=require('../../assets/_script/CharacterPartsCore');
const assets=new Map(require('../../assets/resources/character-parts/catalog.json').parts.concat(Library.load(root).parts).map(p=>[p.id,p])),contract=require('../../assets/resources/unit-library/runtime/contracts.json').units['ally:90004:default'];
function compile(mount,skin){const profile=structuredClone(require('../../assets/resources/characters/catalog.json').profiles.cavalry);profile.base.mount=mount;profile.parts=profile.parts.filter(p=>!/^mount/.test(p.id));const description=Mounts.describe(root,profile.base,true);profile.skins={[description.layers[0].uuid]:skin||description.layers[0].skin};profile.models={[description.layers[0].uuid]:{scaleX:1.1,scaleY:.9,tint:'#80c0ff'},[description.layers[1].uuid]:{x:2,y:3,rotation:4,scaleX:.9,scaleY:1.1}};const result=Baker.bake(root,profile,'mounted-test',contract,assets,file=>fs.readFileSync(file)),file=[...result.files.keys()].find(f=>f.endsWith('.json')),rig=JSON.parse(result.files.get(file)),png=result.files.get(file.replace('.json','.png')),spine=require(Units.enginePath()),atlas=new spine.TextureAtlas(result.files.get(file.replace('.json','.atlas')),()=>new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)}));return{rig,description,data:new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(rig),spine};}
test('original cavalry horse and every hero horse skin keep animated weighted meshes, editable transforms and a saddle-bound faceless Maker rider',()=>{
 const hero=Mounts.describe(root,{source:'character-maker/Character',mount:'hero-horse'},true).layers[0];
 for(const [mount,skin]of [['legacy-cavalry','lan'],['legacy-cavalry','hong'],...hero.skins.map(s=>['hero-horse',s])]){
  const {rig,data,spine,description}=compile(mount,skin),s=new spine.Skeleton(data);assert.equal(rig.bones.find(b=>b.name==='layer1/__game_fit').parent,'layer0/bone2');
  assert.equal(rig._mountAnimationVersion,Mounts.ANIMATION_VERSION);
  if(mount==='hero-horse')assert(s.findSlot('layer0/ty').getAttachment(),'non-default horse skins inherit the default skin shadow, as in the preview');
  assert(Math.abs(Baker.duration(rig.animations.move)-Baker.duration(description.layers[1].json.animations.move))<1e-6,'mounted locomotion uses the Maker movement cycle');
  assert(rig.slots.some(slot=>slot.name.startsWith('layer0/')));assert(rig.slots.some(slot=>slot.name.includes('Rider/Body/Head/Helmet')));
  const front=new Set(description.layers[0].foregroundSlots.map(name=>'layer0/'+name));assert(front.size>0);
  const rank=slot=>front.has(slot.data.name)?3:slot.data.name.startsWith('layer0/')?0:/\/Rider\/HandRight\//.test(slot.data.name)?4:/\/Rider\/HandLeft\//.test(slot.data.name)?2:1;
  for(const [name,original]of Object.entries(contract.animations))assert.deepEqual(rig.animations[name].events||[],original.events);
  for(const animation of data.animations)for(const t of [0,.15,.35,.65,1]){
   s.setToSetupPose();animation.apply(s,0,t,true,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);s.updateWorldTransform();
   const order=s.drawOrder.map(rank);assert(order.every((value,i)=>!i||value>=order[i-1]),mount+'/'+skin+'/'+animation.name+' keeps body/rider/left/head/right draw groups');
   for(const slot of s.slots){const a=slot.getAttachment();if(Core.isFacialSlot(slot.data.name))assert.equal(a,null);if(!a)continue;const v=[];if(a instanceof spine.RegionAttachment)a.computeWorldVertices(slot.bone,v,0,2);else if(a instanceof spine.MeshAttachment)a.computeWorldVertices(slot,0,a.worldVerticesLength,v,0,2);assert(v.every(Number.isFinite),mount+'/'+skin+'/'+animation.name+'/'+slot.data.name);}
  }
  for(const name of ['idle','attack','move']){
   const animation=data.findAnimation(name),vertices=()=>{
    const points=[];for(const slot of s.slots){const a=slot.getAttachment();if(!a||slot.color.a*a.color.a<.01)continue;const v=[];if(a instanceof spine.RegionAttachment){a.computeWorldVertices(slot.bone,v,0,2);points.push(...v);}else if(a instanceof spine.MeshAttachment){a.computeWorldVertices(slot,0,a.worldVerticesLength,v,0,2);for(const index of new Set(a.triangles))points.push(v[index*2],v[index*2+1]);}}return points;
   };
   function pose(time){s.setToSetupPose();animation.apply(s,0,time,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);s.updateWorldTransform();return vertices();}
   const start=pose(0),end=pose(animation.duration);assert.equal(start.length,end.length);
   assert(start.every((value,i)=>Math.abs(value-end[i])<.001),mount+'/'+skin+'/'+name+' closes every visible weighted mesh and rider attachment without a pose jump');
  }
 }
});

test('original horse legs keep their weighted animation while each cycle matches Maker idle, attack, walk and run',()=>{
 for(const mount of ['legacy-cavalry','hero-horse']){
  const description=Mounts.describe(root,{source:'character-maker/Character',mount},true),[horse,rider]=description.layers;
  for(const name of ['idle','attack','walk','run','move'])assert(Math.abs(Mounts.duration(horse.json.animations[name])-Mounts.duration(rider.json.animations[name]))<1e-6,mount+'/'+name+' stays in phase with Maker');
  const original=JSON.parse(fs.readFileSync(path.join(root,horse.source))),from=Mounts.strideDuration(original.animations.move),to=Mounts.duration(rider.json.animations.walk),aligned=horse.json.animations.walk.bones;
  assert(Math.abs(from*2-Mounts.duration(original.animations.move))<.001,'the original contains two strides');
  assert.equal(aligned.bone.translate.filter(frame=>frame.y===-10.98).length,1,'one Maker cycle plays one horse stride');
  for(const [bone,tracks]of Object.entries(original.animations.move.bones))for(const [kind,frames]of Object.entries(tracks))for(const frame of frames.filter(frame=>(frame.time||0)<from-1e-6)){
   const next=aligned[bone][kind].find(next=>Math.abs((next.time||0)-(frame.time||0)*to/from)<1e-6);assert(next,bone+'/'+kind+' retains the first-stride key');
   const actual={...next},expected={...frame};delete actual.time;delete expected.time;assert.deepEqual(actual,expected,bone+'/'+kind+' retains the authored pose and curve');
  }
  assert(horse.json.bones.some(bone=>/horse_.*(?:q|h)_/.test(bone.name)));assert(horse.json.skins.some(skin=>Object.values(skin.attachments).some(attachments=>Object.values(attachments).some(a=>a.type==='mesh'&&a.vertices))));
 }
});
test('mount selection is explicit and unsupported horse paths cannot be read',()=>{const base={source:'character-maker/Character'};assert.equal(Mounts.describe(root,base,true).layers.length,1);assert.throws(()=>Mounts.describe(root,{...base,mount:'../../outside'},true),/existing horse/);});

test('horse head partitions preserve every source triangle, weight, UV and deform timeline without editing artwork',()=>{
 for(const mount of ['hero-horse','legacy-cavalry']){
  const horse=Mounts.describe(root,{source:'character-maker/Character',mount},true).layers[0],file=path.join(root,horse.source),before=fs.readFileSync(file),original=JSON.parse(before);
  const partitions=Object.entries(horse.json._mountHeadSources);assert(partitions.length>0);
  for(const [head,body]of partitions)for(const skin of horse.json.skins)for(const [name,front]of Object.entries(skin.attachments[head]||{})){
   const back=skin.attachments[body][name],source=original.skins.find(s=>s.name===skin.name).attachments[body][name];if(source.type!=='mesh')continue;
   assert.deepEqual(front.vertices,source.vertices);assert.deepEqual(back.vertices,source.vertices);assert.deepEqual(front.uvs,source.uvs);assert.deepEqual(back.uvs,source.uvs);
   const triangles=value=>Array.from({length:value.length/3},(_,i)=>value.slice(i*3,i*3+3).join(',')).sort();
   assert.deepEqual(triangles(front.triangles.concat(back.triangles)),triangles(source.triangles));
   for(const animation of Object.values(horse.json.animations))for(const deform of Object.values(animation.deform||{}))if(deform[body])assert.deepEqual(deform[head],deform[body]);
  }
  assert.deepEqual(fs.readFileSync(file),before);
 }
});

test('original horse resources close their movement loops for every skin, including level-one mesh deformation',()=>{
 const spine=require(Units.enginePath());
 for(const mount of ['legacy-cavalry','hero-horse']){
  const layer=Mounts.describe(root,{source:'character-maker/Character',mount},true).layers[0],json=JSON.parse(fs.readFileSync(path.join(root,layer.source))),atlas=new spine.TextureAtlas(layer.atlas,name=>{const bytes=fs.readFileSync(require('node:url').fileURLToPath(layer.pages[name]));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});}),data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json),s=new spine.Skeleton(data),clip=data.findAnimation('move');
  function pose(time){s.setToSetupPose();clip.apply(s,0,time,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);s.updateWorldTransform();const points=[];for(const slot of s.slots){const a=slot.getAttachment();if(!a||slot.color.a*a.color.a<.01)continue;const v=[];if(a instanceof spine.MeshAttachment){a.computeWorldVertices(slot,0,a.worldVerticesLength,v,0,2);for(const i of new Set(a.triangles))points.push(v[i*2],v[i*2+1]);}else if(a instanceof spine.RegionAttachment){a.computeWorldVertices(slot.bone,v,0,2);points.push(...v);}}return points;}
  for(const skin of data.skins){s.setSkinByName(skin.name);const start=pose(0),end=pose(clip.duration);assert.equal(start.length,end.length);assert(start.every((value,i)=>Number.isFinite(value)&&Math.abs(value-end[i])<.001),mount+'/'+skin.name+' closes its original two-stride loop');}
 }
});
