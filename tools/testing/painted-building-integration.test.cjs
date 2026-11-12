'use strict';
// Current approved art, actual Spine CPU poses only. No game scene, audio,
// importer, progress, generated artwork or repository writes are involved.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {decode}=require('../../packages/hkd-characters/lib/png-atlas');
const C=require('./painted-building-contract.cjs'),{fixture,sha,hash,clone}=C;
const root=path.resolve(__dirname,'../..'),dir=rig=>'assets/KinghtFallIconMap/com/Ani/'+rig+'/';
const bytes=file=>fs.readFileSync(path.resolve(root,file)),read=file=>JSON.parse(bytes(file).toString('utf8').replace(/^\uFEFF/,''));
const runtime=path.join(process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','extensions/spine/lib/spine.js');
const engine={skip:!fs.existsSync(runtime)&&!process.env.COCOS_ENGINE_ROOT?'Creator 2.4.13 supplies actual Spine 3.8 parsing':false};
const skins={cb:[1,2,3,4].map(n=>'cb-painted-'+n),by:['royal','heavy','crossbow','stable'].flatMap(f=>[1,2,3,4].map(n=>'by-painted-'+f+'-'+n)),mf:['mf-1','mf-2-1','mf-2-2','mf-3'],td:['mf-1','mf-2-1','mf-2-2','mf-3'],mz:['mz-1','mz-2-1','mz-2-2','mz-3']};
function player(spine,rig){
  const json=read(dir(rig)+rig+'.json'),text=bytes(dir(rig)+rig+'.atlas').toString('utf8');
  const atlas=new spine.TextureAtlas(text,page=>{const png=bytes(dir(rig)+page);return{setFilters(){},setWraps(){},getImage:()=>({width:png.readUInt32BE(16),height:png.readUInt32BE(20)})};});
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json),skeleton=new spine.Skeleton(data),state=new spine.AnimationState(new spine.AnimationStateData(data));
  return{json,data,skeleton,state,pose(skin,clip,time){skeleton.setSkinByName(skin);skeleton.setToSetupPose();state.clearTracks();state.setAnimation(0,clip,false);state.update(time);state.apply(skeleton);skeleton.updateWorldTransform();return skeleton;}};
}
function vertices(spine,slot){
  const a=slot.getAttachment(),v=[];if(!a)return v;
  if(a instanceof spine.RegionAttachment)a.computeWorldVertices(slot.bone,v,0,2);
  else if(a instanceof spine.MeshAttachment)a.computeWorldVertices(slot,0,a.worldVerticesLength,v,0,2);
  assert(v.length&&v.every(Number.isFinite),'finite actual posed vertices');assert([...a.uvs].every(Number.isFinite),'finite original sampling');assert(a.region?.page,'all drawable attachments resolve an imported atlas page');return v;
}
function artSlots(rig,skin){return Object.keys(skin.attachments).filter(slot=>rig==='td'?slot.startsWith('td__'):true);}

test('painted contract reverses only reviewed deltas before the unchanged native-source contracts',()=>{
  assert.equal(require('./building-spine-fit.fixture.json').paintedIntegration.contract,'painted-building-integration.fixture.json');
  for(const rig of Object.keys(fixture.rigs)){
    const json=read(dir(rig)+rig+'.json');C.withoutPainted(rig,json);
    C.withoutPaintedMetadata(rig,read(dir(rig)+rig+'.json.meta'));
    C.withoutPaintedAtlas(rig,bytes(dir(rig)+rig+'.atlas').toString('utf8'));
  }
});

test('reviewed painted atlas pixels, regions, UUIDs and sampling cannot drift independently',()=>{
  for(const contract of Object.values(fixture.rigs))for(const page of contract.pages){
    assert.equal(sha(bytes(page.file)),page.sha256,page.file+' approved pixel/hash guard');
    const meta=read(page.file+'.meta'),image=decode(bytes(page.file));assert.equal(hash(meta),page.metadata,'page metadata contract');
    assert.equal(meta.uuid,page.uuid);assert.deepEqual([meta.width,meta.height],[image.width,image.height]);assert.equal(meta.premultiplyAlpha,false);assert.equal(meta.packable,false);assert.equal(meta.filterMode,'bilinear');assert.equal(meta.wrapMode,'clamp');
  }
});

test('all40 approved library icons retain their pixels, Cocos identities and unclipped transparent frames',()=>{
  assert.equal(fixture.icons.length,40);
  for(const icon of fixture.icons){
    const image=decode(bytes(icon.file)),meta=read(icon.file+'.meta'),frame=meta.subMetas[icon.name];assert(frame,icon.name);
    assert.equal(sha(bytes(icon.file)),icon.sha256,'approved icon pixels');assert.equal(frame.rawTextureUuid,meta.uuid);
    assert.deepEqual([meta.width,meta.height],[image.width,image.height]);assert.deepEqual([frame.rawWidth,frame.rawHeight],[image.width,image.height]);
    assert.equal(meta.premultiplyAlpha,false);assert.equal(frame.rotated,false);assert.equal(image.rgba[3],0);
    assert([frame.trimX,frame.trimY,frame.width,frame.height].every(Number.isSafeInteger));
    assert(frame.trimX>=0&&frame.trimY>=0&&frame.trimX+frame.width<=image.width&&frame.trimY+frame.height<=image.height);
    assert(Math.abs(frame.offsetX-(frame.trimX+frame.width/2-frame.rawWidth/2))<.000001);assert(Math.abs(frame.offsetY-(frame.rawHeight/2-frame.trimY-frame.height/2))<.000001);
    let visible=0;for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(image.rgba[(y*image.width+x)*4+3]>(frame.trimThreshold||0)){visible++;assert(x>=frame.trimX&&x<frame.trimX+frame.width&&y>=frame.trimY&&y<frame.trimY+frame.height,'auto crop cannot clip visible approved artwork');}assert(visible>100);
    for(const value of Object.values(meta.subMetas))if(value.trimType==='auto')for(const key of ['offsetX','offsetY','trimX','trimY','width','height'])delete value[key];
    assert.equal(hash(meta),icon.metadata,'UUIDs, sampling, unknown metadata and raw frame geometry stay strict');
  }
});

test('all40 active family tiers retain original row values, authorized routes and separate tower weapons',()=>{
  for(const file of Object.keys(fixture.config)){
    const config=read(file);C.assertConfig(file,config);
    const rows=Object.entries(config.BuildEnum).filter(([id])=>!['0','6'].includes(id)).flatMap(([,f])=>f.levelList);
    assert.equal(rows.length,40);assert.equal(rows.filter(r=>r.level===4).length,10);
    for(const family of [config.BuildEnum['1'],config.BuildEnum['4'],config.BuildEnum['5']])assert.deepEqual(family.levelList.map(r=>r.level),[1,2,3,4]);
    for(const row of rows.filter(r=>r.ID!==2))assert.equal(row.Appearance,undefined,'non-tower artwork uses native animated attachments');
    for(const row of rows.filter(r=>r.ID===2&&r.Tower))assert(row.Appearance.weapon?.sprite,'sniper/cannon preserve separate rotating weapon binding');
  }
});

test('normalization rejects original changes, painted changes, extra pages and unknown gameplay edits',()=>{
  const original=read(dir('mf')+'mf.json'),changed=clone(original);changed.bones[0].x=(changed.bones[0].x||0)+1;
  assert.throws(()=>C.withoutPainted('mf',changed),/native skeleton/);
  const timing=clone(original);timing.animations.idle.bones.bone5.rotate[1].time+=.01;assert.throws(()=>C.withoutPainted('mf',timing),/native skeleton/);
  const painted=clone(original);painted.skins.find(s=>s.name==='mf-1').attachments.mf_1.mf_1.width++;assert.throws(()=>C.withoutPainted('mf',painted),/attachment transform/);
  const added=clone(original);added.skins.find(s=>s.name==='mf-3').attachments.mf_3.mf_3.width++;assert.throws(()=>C.withoutPainted('mf',added),/changed approved skins/);
  const atlas=bytes(dir('mf')+'mf.atlas').toString('utf8');assert.throws(()=>C.withoutPaintedAtlas('mf',atlas+'\nunknown.png\nsize: 4,4\n'),/unknown appended/);
  const file=Object.keys(fixture.config)[0],config=read(file);config.BuildEnum['3'].levelList[0].futureGameplayField=12;assert.throws(()=>C.assertConfig(file,config),/original stats/);
  const metadata=read(dir('mf')+'mf.json.meta');metadata.textures.push('unknown');assert.throws(()=>C.withoutPaintedMetadata('mf',metadata),/binds exactly/);
});

for(const rig of Object.keys(skins))test(rig+' actual approved tiers build, upgrade, shade, light and clear on destruction',engine,t=>{
  const spine=require(runtime),p=player(spine,rig);let poses=0,drawables=0;
  const before=C.withoutPainted(rig,p.json);
  function duration(value){return value&&typeof value==='object'?Math.max(value.time||0,...Object.values(value).map(duration)):0;}
  for(const [name,animation]of Object.entries(p.json.animations))assert.equal(duration(animation),duration(before.animations[name]),name+' authored duration retained');
  for(const skinName of skins[rig]){
    const skin=p.json.skins.find(s=>s.name===skinName);assert(skin);const slots=artSlots(rig,skin);assert(slots.length);
    for(const clip of Object.keys(p.json.animations))for(const time of clip==='destroy'?[0,.4,1.2]:[0,.25,.5,1,2.1]){
      const skeleton=p.pose(skinName,clip,time);
      for(const slot of skeleton.drawOrder)if(slot.getAttachment()){vertices(spine,slot);drawables++;}
      if(clip==='destroy'&&time>=.4)for(const name of slots){const slot=skeleton.findSlot(name);assert(!slot.getAttachment()||slot.color.a<.000001,skinName+'/'+name+' must leave no painted body, farm, rotor, flag, flame or light ghost');}
      if(clip==='idle'||clip==='idle_night'){
        const bodies=slots.filter(name=>Object.values(skin.attachments[name]).some(a=>(a.path||'').includes('painted')&&!/(night|light|flag|flame|pole|emissive)/.test(a.path)));
        assert(bodies.length,skinName+' has approved daytime art');
        for(const name of bodies){const slot=skeleton.findSlot(name);assert(slot.getAttachment());assert(slot.color.a>.9,skinName+'/'+clip+'/'+name+' body remains opaque');if(clip==='idle_night')assert(slot.color.r<.8,skinName+' receives original native night shading');}
        for(const name of slots.filter(n=>n.endsWith('_night')||n.endsWith('_lantern_emissive'))){const light=skeleton.findSlot(name);assert(light.getAttachment());assert(clip==='idle'?light.color.a<.000001:light.color.a>.7,'native night transition controls aperture opacity');}
      }
      poses++;
    }
    p.pose(skinName,'destroy',1.2);const restored=p.pose(skinName,'idle',0);
    for(const name of slots)assert(restored.findSlot(name).getAttachment(),skinName+' restores original attachment setup on rebuild');
  }
  t.diagnostic(poses+' actual native lifecycle poses, '+drawables+' resolved drawable attachments');
});

test('each painted castle/barracks tier has visible bounded native night pixels, with reversible fixtures kept separate',engine,()=>{
  const spine=require(runtime),pages=new Map();let lanterns=0;
  const optional=fixture.optionalNightFixtures;assert.equal(optional.count,8);assert.equal(sha(bytes(optional.source)),optional.sourceSha256,'original existing lantern source remains unchanged');
  for(const rig of ['cb','by']){
    const p=player(spine,rig);
    for(const name of skins[rig]){
      const skin=p.json.skins.find(s=>s.name===name);p.pose(name,'idle_night',.5);let lit=0;
      for(const slotName of Object.keys(skin.attachments).filter(n=>n.endsWith('_night')||n.endsWith('_lantern_emissive')||n.endsWith('_flame'))){
        const slot=p.skeleton.findSlot(slotName),a=slot.getAttachment();assert(a&&slot.color.a>.7);const r=a.region,key=rig+'/'+r.page.name;
        if(!pages.has(key))pages.set(key,decode(bytes(dir(rig)+r.page.name)));const image=pages.get(key);
        assert(!r.rotate,'new transparent light masks use unrotated atlas rectangles');
        for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++)if(image.rgba[(y*image.width+x)*4+3]>16)lit++;
        if(slotName.endsWith('_lantern_emissive')){lanterns++;const fixtureName=slotName.replace(/_emissive$/,'_fixture');assert(skin.attachments[fixtureName],'day fixture and native night pane are separate attachments');}
      }
      assert(lit>0,name+' needs actual emissive artwork, not an empty opacity timeline');
    }
  }
  assert.equal(lanterns,8);
});

test('mill farm counts are2/3/4/4 at their authored anchors and use one identical shared tile',engine,()=>{
  const spine=require(runtime),p=player(spine,'td'),counts=[];
  for(const name of skins.td){const skin=p.json.skins.find(s=>s.name===name),plots=Object.keys(skin.attachments).filter(n=>n.startsWith('td__'));counts.push(plots.length);p.pose(name,'idle',0);
    for(const slot of plots){const a=p.skeleton.findSlot(slot).getAttachment();assert.equal(a.path,'painted-farm');assert.equal(a.width,328);assert.equal(a.height,286);}
  }
  assert.deepEqual(counts,[2,3,4,4]);
  p.pose('mf-2-2','idle',0);const third=Object.keys(p.json.skins.find(s=>s.name==='mf-2-2').attachments).filter(n=>n.startsWith('td__')).map(n=>({name:n,v:vertices(spine,p.skeleton.findSlot(n))}));
  p.pose('mf-3','idle',0);assert.deepEqual(third.map(v=>({name:v.name,v:vertices(spine,p.skeleton.findSlot(v.name))})),third,'T4 retains all four exact native plot anchors/angles');
});

test('mill sails and cloth flags remain separate animated geometry and disappear with destruction',engine,()=>{
  const spine=require(runtime),mill=player(spine,'mf');
  for(const name of ['mf-2-2','mf-3']){
    mill.pose(name,'idle',0);const first=vertices(spine,mill.skeleton.findSlot('fengshang_3'));
    mill.pose(name,'idle',.25);assert.notDeepEqual(vertices(spine,mill.skeleton.findSlot('fengshang_3')),first,'native rotor really rotates independently');
    mill.pose(name,'destroy',.4);assert.equal(mill.skeleton.findSlot('fengshang_3').getAttachment(),null);
  }
  for(const rig of ['cb','by']){const p=player(spine,rig);for(const name of skins[rig]){
    const skin=p.json.skins.find(s=>s.name===name),flags=Object.keys(skin.attachments).filter(n=>n.endsWith('_flag'));if(!flags.length)continue;
    p.pose(name,'idle',0);const first=flags.map(n=>vertices(spine,p.skeleton.findSlot(n)));
    p.pose(name,'idle',.4);assert.notDeepEqual(flags.map(n=>vertices(spine,p.skeleton.findSlot(n))),first,name+' weighted cloth really waves');
  }}
});
