'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Baker=require('../../packages/hkd-characters/lib/native-bake'),Mounts=require('../../packages/hkd-characters/lib/mounts'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Library=require('../../packages/hkd-characters/lib/unit-library');
const assets=new Map(require('../../assets/resources/character-parts/catalog.json').parts.concat(Library.load(root).parts).map(p=>[p.id,p])),contract=require('../../assets/resources/unit-library/runtime/contracts.json').units['ally:90004:default'];
function compile(mount,skin){const profile=structuredClone(require('../../assets/resources/characters/catalog.json').profiles.cavalry);profile.base.mount=mount;profile.parts=profile.parts.filter(p=>!/^mount/.test(p.id));const description=Mounts.describe(root,profile.base,true);profile.skins={[description.layers[0].uuid]:skin||description.layers[0].skin};profile.models={[description.layers[0].uuid]:{scaleX:1.1,scaleY:.9,tint:'#80c0ff'},[description.layers[1].uuid]:{x:2,y:3,rotation:4,scaleX:.9,scaleY:1.1}};const result=Baker.bake(root,profile,'mounted-test',contract,assets,file=>fs.readFileSync(file)),file=[...result.files.keys()].find(f=>f.endsWith('.json')),rig=JSON.parse(result.files.get(file)),png=result.files.get(file.replace('.json','.png')),spine=require(Units.enginePath()),atlas=new spine.TextureAtlas(result.files.get(file.replace('.json','.atlas')),()=>new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)}));return{rig,data:new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(rig),spine};}
test('original cavalry horse and every hero horse skin keep animated weighted meshes, editable transforms and a saddle-bound faceless Maker rider',()=>{
 const hero=Mounts.describe(root,{source:'character-maker/Character',mount:'hero-horse'},true).layers[0];
 for(const [mount,skin]of [['legacy-cavalry','lan'],['legacy-cavalry','hong'],...hero.skins.map(s=>['hero-horse',s])]){
  const {rig,data,spine}=compile(mount,skin),s=new spine.Skeleton(data);assert.equal(rig.bones.find(b=>b.name==='layer1/__game_fit').parent,'layer0/bone2');
  assert(rig.slots.some(slot=>slot.name.startsWith('layer0/')));assert(rig.slots.some(slot=>slot.name.includes('Rider/Body/Head/Helmet')));
  for(const [name,original]of Object.entries(contract.animations))assert.deepEqual(rig.animations[name].events||[],original.events);
  for(const animation of data.animations)for(const t of [0,.15,.35,.65,1]){
   s.setToSetupPose();animation.apply(s,0,t,true,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);s.updateWorldTransform();
   for(const slot of s.slots){const a=slot.getAttachment();if(/Eye|Beard/.test(slot.data.name))assert.equal(a,null);if(!a)continue;const v=[];if(a instanceof spine.RegionAttachment)a.computeWorldVertices(slot.bone,v,0,2);else if(a instanceof spine.MeshAttachment)a.computeWorldVertices(slot,0,a.worldVerticesLength,v,0,2);assert(v.every(Number.isFinite),mount+'/'+skin+'/'+animation.name+'/'+slot.data.name);}
  }
 }
});
test('mount selection is explicit and unsupported horse paths cannot be read',()=>{const base={source:'character-maker/Character'};assert.equal(Mounts.describe(root,base,true).layers.length,1);assert.throws(()=>Mounts.describe(root,{...base,mount:'../../outside'},true),/existing horse/);});
