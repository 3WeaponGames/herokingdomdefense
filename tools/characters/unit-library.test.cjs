'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Library=require('../../packages/hkd-characters/lib/unit-library'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Core=require('../../assets/_script/CharacterPartsCore'),Bake=require('../../packages/hkd-characters/lib/native-bake'),PNG=require('../../packages/hkd-characters/lib/png-atlas');
test('all three licensed imports keep exact sprite bytes, pivot data, metadata and conversion hashes',()=>{
  let total=0;
  for(const pack of ['character-maker','monster1','monster2']){
    const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/unit-library',pack,'catalog.json')));
    for(const part of catalog.parts){const bytes=fs.readFileSync(path.join(root,part.image));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),part.sha256);assert(part.pixelsPerUnit>0);assert(Number.isFinite(part.pivot.x));assert.equal(JSON.parse(fs.readFileSync(path.join(root,part.image+'.meta'))).importer,'texture');total++;}
    for(const [file,hash]of Object.entries(catalog.importedFiles))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,file);
  }assert.equal(total,1769);
});
const engine=Units.enginePath();

test('locomotion keeps authored run cadence, death clips survive baking, and attacks retain their approved events',()=>{
 const original={animations:{
  idle:{bones:{body:{translate:[{time:0},{time:1}]}}},
  move:{bones:{body:{translate:[{time:0},{time:1.4}]}}},
  run:{bones:{body:{translate:[{time:0},{time:.35}]}}},
  attack:{bones:{body:{rotate:[{time:0},{time:2}]}}},
  dead1:{bones:{body:{translate:[{time:0},{time:.9,y:-10}]}}}
 }};
 const contract={events:{hit:{}},animations:{idle:{duration:1,events:[]},move:{duration:1.4,events:[]},attack:{duration:.8,events:[{time:.22,name:'hit'}]}}};
 const rig=structuredClone(original);Bake.retime(rig,contract);
 assert.equal(Bake.duration(rig.animations.move),.35);assert.equal(Bake.duration(rig.animations.die),.9);
 assert.equal(Bake.duration(rig.animations.attack),.8);assert.deepEqual(rig.animations.attack.events,contract.animations.attack.events);
 const mounted=structuredClone(original);Bake.retime(mounted,contract,true);assert.equal(Bake.duration(mounted.animations.move),1.4);
 assert.equal(Bake.duration(original.animations.attack),2,'Source animation data is unchanged');
});
test('101 imported bases and every converted animation parse and produce finite live Spine geometry',{skip:!fs.existsSync(engine)},()=>{
  const spine=require(engine),library=Library.load(root);assert.equal(library.sources.length,101);
  for(const source of library.sources){
    const layer=Library.describe(root,source.id,true).layers[0],atlas=new spine.TextureAtlas(layer.atlas,name=>{const png=fs.readFileSync(require('node:url').fileURLToPath(layer.pages[name]));return new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)});}),data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(layer.json),skeleton=new spine.Skeleton(data);
    const faceless=source.pack==='character-maker'?Core.prepare(spine,skeleton,[],{}, {},{faceless:true}):null;
    for(const clip of data.animations){assert(Number.isFinite(clip.duration)&&clip.duration>0,source.id+'/'+clip.name);for(const t of [0,clip.duration*.5,clip.duration]){
      if(faceless)Core.restore(faceless);skeleton.setToSetupPose();clip.apply(skeleton,0,t,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();if(faceless)Core.apply(faceless);
      for(const slot of skeleton.slots){if(faceless&&Core.isFacialSlot(slot.data.name)){assert.equal(slot.getAttachment(),null);continue;}const a=slot.getAttachment();if(!a||slot.color.a<.01)continue;const v=[];if(a instanceof spine.RegionAttachment)a.computeWorldVertices(slot.bone,v,0,2);else if(a instanceof spine.MeshAttachment)a.computeWorldVertices(slot,0,a.worldVerticesLength,v,0,2);assert(v.every(Number.isFinite),source.id+'/'+clip.name+'/'+slot.data.name);}
    }}
  }
});
test('native atlas copying retains pixels, rotation and extrusion without stretching',()=>{
  const original={width:2,height:3,rgba:Buffer.from(Array.from({length:24},(_,i)=>i*9%256))};assert.deepEqual(PNG.decode(PNG.encode(original)),original);
  const rotated=PNG.crop(original,0,0,2,3,true);assert.equal(rotated.width,3);assert.equal(rotated.height,2);assert.deepEqual([...rotated.rgba.subarray(0,4)],[...original.rgba.subarray(16,20)]);
  const packed=PNG.pack({a:original}),p=packed.positions.a;assert.deepEqual(PNG.crop(packed,p.x,p.y,2,3,false),original);assert.deepEqual([...packed.rgba.subarray(((p.y-1)*packed.width+p.x-1)*4,((p.y-1)*packed.width+p.x-1)*4+4)],[...original.rgba.subarray(0,4)]);
});

test('unrotating atlas regions agrees with the actual Spine mesh UV transform at every pixel',()=>{
  const spine=require(Units.enginePath()),original={width:3,height:2,rgba:Buffer.from(Array.from({length:24},(_,i)=>(i*17)%256))};
  const atlas=new spine.TextureAtlas('\nsource.png\nsize: 3,2\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\npart\n  rotate: true\n  xy: 0,0\n  size: 2,3\n  orig: 2,3\n  offset: 0,0\n  index: -1\n',()=>new spine.FakeTexture({width:3,height:2}));
  const mesh=new spine.MeshAttachment('part');mesh.region=atlas.findRegion('part');const restored=PNG.crop(original,0,0,3,2,true);
  for(let y=0;y<restored.height;y++)for(let x=0;x<restored.width;x++){
    mesh.regionUVs=[(x+.5)/restored.width,(y+.5)/restored.height];mesh.updateUVs();const sx=Math.floor(mesh.uvs[0]*original.width),sy=Math.floor(mesh.uvs[1]*original.height),source=(sy*original.width+sx)*4,target=(y*restored.width+x)*4;
    assert.deepEqual(restored.rgba.subarray(target,target+4),original.rgba.subarray(source,source+4));
  }
});
test('rebaking preserves Creator texture settings and authored UUIDs while updating dimensions and linked references',()=>{
  const base='assets/resources/unit-library/runtime/default_royal-guard',texture=JSON.parse(fs.readFileSync(path.join(root,base+'.png.meta'))),model=JSON.parse(fs.readFileSync(path.join(root,base+'.json.meta'))),next=Bake.textureMeta(base+'.png',512,256);
  const files=new Map([[base+'.png.meta',JSON.stringify(next)],[base+'.json.meta',JSON.stringify({...model,textures:[next.uuid]})]]);
  const read=file=>{if(file.endsWith('default_royal-guard.png.meta'))return Buffer.from(JSON.stringify({...texture,uuid:'authored-texture',filterMode:'nearest',format:6,future:{keep:7}}));if(file.endsWith('default_royal-guard.json.meta'))return Buffer.from(JSON.stringify({...model,uuid:'authored-skeleton',future:true}));return fs.readFileSync(file);};
  Bake.preserveMetadata(root,files,read);const image=JSON.parse(files.get(base+'.png.meta')),rig=JSON.parse(files.get(base+'.json.meta'));
  assert.equal(image.filterMode,'nearest');assert.equal(image.format,6);assert.equal(image.future.keep,7);assert.equal(image.width,512);assert.equal(image.height,256);assert.equal(rig.uuid,'authored-skeleton');assert(rig.future);assert.deepEqual(rig.textures,['authored-texture']);assert(Object.values(image.subMetas).every(frame=>frame.rawTextureUuid==='authored-texture'&&frame.rawWidth===512&&frame.rawHeight===256));
});
test('the native bake keeps saved gameplay animation durations and authored event times',()=>{
  const rig={animations:{idle:{bones:{root:{translate:[{time:0,x:1},{time:2,x:3}]}}},attack:{bones:{root:{rotate:[{time:0,angle:1},{time:2,angle:30}]}}}}};
  const contract={events:{hit:{}},animations:{idle:{duration:1,events:[]},attack:{duration:.8,events:[{time:.22,name:'hit'}]}}};Bake.retime(rig,contract);assert.equal(Bake.duration(rig.animations.attack),.8);assert.deepEqual(rig.animations.attack.events,contract.animations.attack.events);assert(!('events'in rig.animations.idle));
});
test('part and model tints survive native baking and use the same RGB multiplication as the preview',()=>{
  const profile=JSON.parse(JSON.stringify(require('../../assets/resources/characters/catalog.json').profiles['royal-guard'])),layer=Library.describe(root,profile.base.source,true).layers[0],contracts=require('../../assets/resources/unit-library/runtime/contracts.json');
  profile.parts[0].tint='#80c0ff';profile.models={[layer.uuid]:{tint:'#ff8040'}};
  const assets=new Map(require('../../assets/resources/character-parts/catalog.json').parts.concat(Library.load(root).parts).map(asset=>[asset.id,asset])),result=Bake.bake(root,profile,'test-tint',contracts.units['ally:90001:default'],assets,file=>fs.readFileSync(file)),rig=JSON.parse(result.files.get('assets/resources/unit-library/runtime/test-tint.json'));
  assert.equal(rig.skins[0].attachments[profile.parts[0].slot]['part_'+profile.parts[0].id].color,'80c0ffff');assert.equal(rig.slots.find(slot=>slot.name===profile.parts[0].slot).color.slice(0,6),'ff8040');
  const spine=require(engine),skeleton={findBone:()=>({})},asset=assets.get(profile.parts[0].sprite),part=Core.createAttachment(spine,skeleton,profile.parts[0],asset,new spine.FakeTexture({width:asset.width,height:asset.height}));
  assert.equal(part.color.r,128/255);assert.equal(part.color.g,192/255);assert.equal(part.color.b,1);
});
test('the deployed roster uses faceless Maker allies and monster enemies with the original gameplay event contracts',()=>{
  const contracts=require('../../assets/resources/unit-library/runtime/contracts.json'),looks=require('../../assets/resources/characters/catalog.json');assert(contracts.enabled);assert(Object.keys(contracts.units).length>=16);
  for(const [key,contract]of Object.entries(contracts.units)){
    const profile=looks.profiles[looks.assignments[key]],prefab=JSON.parse(fs.readFileSync(path.join(root,contract.prefab))),component=prefab[contract.component];assert.equal(component._N$skeletonData.__uuid__,profile.baked.uuid);
    if(key.startsWith('ally:')){assert.equal(profile.base.source,'character-maker/Character');assert(profile.faceless);}else{assert(profile.base.currentModel);assert(profile.base.model);}
    const rig=Units.describe(root,{type:profile.base.type,id:profile.base.id,noRuntime:true}).layers[0].json;
    for(const [name,original]of Object.entries(contract.animations)){if(name!=='move')assert(Math.abs(Bake.duration(rig.animations[name])-original.duration)<1e-6);assert.deepEqual(rig.animations[name].events||[],original.events);}
    assert(rig.animations.die,'The deployed unit retains its death animation');
    if(profile.faceless)for(const skin of rig.skins)for(const [name,attachments]of Object.entries(skin.attachments))if(Core.isFacialSlot(name))assert.equal(Object.keys(attachments).length,0);
  }
  const hero=Units.describe(root,{type:'hero',id:'hero',noRuntime:true}),horse=hero.layers[0],riders=hero.layers.slice(1),originalHorse='assets/KinghtFallEnemyAni/wqyl_lead/wqyl_lead_ma/wqyl_lead_ma.json';assert.equal(hero.layers.length,7);
  assert.equal(horse.source,'assets/resources/hero-maker/wqyl_lead_ma.json');assert.deepEqual(horse.json._heroMakerMount,{version:1,source:JSON.parse(fs.readFileSync(path.join(root,originalHorse+'.meta'))).uuid});
  assert.deepEqual(horse.skins,JSON.parse(fs.readFileSync(path.join(root,originalHorse))).skins.map(skin=>skin.name),'The synchronized Maker mount retains every original upgraded horse skin');assert(horse.json.bones.some(bone=>bone.name==='bone2'),'The mount keeps its animated saddle anchor');
  assert.deepEqual(riders.map(layer=>layer.json._heroMaker.role).sort(),[0,1,2,3,4,5]);
  for(const layer of riders){const maker=layer.json._heroMaker;assert.equal(maker.version,2);assert.equal(maker.source,'character-maker/Character');assert.equal(maker.riderScale,.78);assert(Number.isFinite(maker.saddle.x)&&Number.isFinite(maker.saddle.y));assert.deepEqual(maker.saddle,riders[0].json._heroMaker.saddle,'All six rider layers follow the same mount saddle');}
});
