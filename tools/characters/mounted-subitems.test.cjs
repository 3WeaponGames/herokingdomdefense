'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),{ItemsService}=require('../../packages/hkd-items/service'),Placement=require('../../packages/hkd-characters/lib/placement'),Sockets=require('../../packages/hkd-characters/lib/hero-sub-items'),Bake=require('../../packages/hkd-characters/lib/hero-bake'),Units=require('../../packages/game-data-editor/lib/unit-assets');
const spine=require(Units.enginePath()),Core=require('../../assets/_script/CharacterPartsCore');
const blue='HandLeft/Sub_Item/FA_WP_Sub_Water_Blue';
function rigData(layer){const atlas=new spine.TextureAtlas(layer.atlas,name=>{const png=fs.readFileSync(require('node:url').fileURLToPath(layer.pages[name]));return new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)});});return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(layer.json);}
test('every Fighter/Bruiser tier defaults to the horse torso, every Vanguard tier to its head, and browsing performs no writes',()=>{
 const service=new ItemsService(root),assets=service.assets().parts,item=assets.find(asset=>asset.id===blue),before=service.snapshot(),files=['assets/resources/hero-items/catalog.json','assets/KinghtFallConfig/GameJsonCfg.json','assets/resources/characters/catalog.json'].map(file=>[file,fs.readFileSync(path.join(root,file))]);
 for(const style of ['fighter','vanguard','bruiser'])for(const tier of ['lv1','lv2','lv3','lv4']){
  const description=service.describe({type:'item',id:'3:tier:'+tier+':'+style},true),layer=Placement.layerFor(description,item),slot=Placement.socket(layer,item),expected=Sockets.target(style);
  assert.equal(layer.name,'wqyl_lead_ma');assert.equal(layer.uuid,description.defaultLayer);assert.equal(slot.name,expected.name);assert.equal(slot.bone,expected.name);assert(Placement.compatible(slot));assert.equal(layer.json.bones.find(bone=>bone.name===slot.bone).parent,style==='vanguard'?'horse_s_7':'horse_s_3');
  assert.equal(Placement.layerFor(description,{id:'Helmet/New',category:'Helmet'}).name,'wqyl_lead_tou','Normal rider equipment still uses the rider');
 }
 for(const style of ['skirmisher','mystic','guardian'])assert.equal(Placement.layerFor(service.describe({type:'item',id:'3:tier:lv1'+(style==='skirmisher'?'':':'+style)},true),item).name,'wqyl_lead_jian');
 assert.deepEqual(service.snapshot(),before);for(const[file,bytes]of files)assert.deepEqual(fs.readFileSync(path.join(root,file)),bytes);
});
test('adding the empty sockets is idempotent and leaves existing bones, skins and every authored animation untouched',()=>{
 const rig=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/hero-maker/wqyl_lead_ma.json'))),names=new Set(Object.values(Sockets.sockets).map(socket=>socket.name));rig.bones=rig.bones.filter(bone=>!names.has(bone.name));rig.slots=rig.slots.filter(slot=>!names.has(slot.name));const before=structuredClone(rig);
 Sockets.ensure(rig);assert.deepEqual(rig.bones.slice(0,before.bones.length),before.bones);assert.deepEqual(rig.slots.slice(0,before.slots.length),before.slots);assert.deepEqual(rig.animations,before.animations);assert.deepEqual(rig.skins,before.skins);const once=structuredClone(rig);Sockets.ensure(rig);assert.deepEqual(rig,once);
});
test('saved sub-items bake onto the horse and follow the real torso/head through idle, movement and every weapon attack',()=>{
 const service=new ItemsService(root),assets=service.assets().parts,asset=assets.find(asset=>asset.id===blue),lookup=new Map(assets.map(asset=>[asset.id,asset]));
 for(const style of ['fighter','vanguard','bruiser']){
  const description=service.describe({type:'item',id:'3:tier:lv1:'+style},true),layer=Placement.layerFor(description,asset),slot=Placement.socket(layer,asset),part={id:'charm',sprite:asset.id,layer:layer.uuid,slot:slot.name,bone:slot.bone,...Placement.intended(asset),opacity:1,order:0,hideSlots:[],forceVisible:true},profile={name:'Mounted '+style,base:{type:'item',id:description.item.key},scale:1,parts:[part]},before=JSON.stringify(layer.json);
  const draft=structuredClone(service.data);draft.profiles['mounted-'+style]=profile;service.change({version:service.version,data:draft});
  const result=Bake.bake(root,profile,'mounted-test-'+style,description,lookup,file=>fs.readFileSync(file)),file=Object.keys(result.bakedLayers).map(id=>result.bakedLayers[id].resource+'.json').map(file=>'assets/resources/'+file)[0],json=JSON.parse(result.files.get(file));assert.equal(Object.keys(result.bakedLayers)[0],layer.uuid);assert.equal(json.slots.find(value=>value.name===slot.name).bone,part.bone);assert.equal(JSON.stringify(layer.json),before);assert.deepEqual(json.animations,layer.json.animations);
  const png=result.files.get(file.replace('.json','.png')),atlas=new spine.TextureAtlas(result.files.get(file.replace('.json','.atlas')).toString(),()=>new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)})),nativeData=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json),webData=rigData(layer),native=new spine.Skeleton(nativeData),web=new spine.Skeleton(webData),texture=new spine.FakeTexture({width:asset.width,height:asset.height});
  for(const skin of ['lv1','lv2','lv3','lv4','vip1','vip2']){
   native.setSkinByName(skin);native.setToSetupPose();web.setSkinByName(skin);web.setToSetupPose();const state=Core.prepare(spine,web,[part],Object.fromEntries(lookup),{[asset.id]:texture});
   for(const action of ['idle','move','attack_fighter','attack_vanguard','attack_bruiser'])for(const time of [0,.1667,.4,.8333,1.3333]){
    native.setToSetupPose();web.setToSetupPose();nativeData.findAnimation(action).apply(native,0,time,true,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);webData.findAnimation(action).apply(web,0,time,true,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);native.updateWorldTransform();web.updateWorldTransform();Core.apply(state);
    const nslot=native.findSlot(part.slot),wslot=web.findSlot(part.slot),nv=[],wv=[];nslot.getAttachment().computeWorldVertices(nslot.bone,nv,0,2);wslot.getAttachment().computeWorldVertices(wslot.bone,wv,0,2);assert(nv.every((value,i)=>Math.abs(value-wv[i])<.001),style+' '+skin+' '+action+' matches editor fitting');
    const bone=native.findBone(part.bone),parent=bone.parent,definition=Sockets.target(style);assert(Math.abs(bone.worldX-(parent.worldX+definition.x*parent.a+definition.y*parent.b))<.001);assert(Math.abs(bone.worldY-(parent.worldY+definition.x*parent.c+definition.y*parent.d))<.001);
   }Core.restore(state);
  }
 }
});
