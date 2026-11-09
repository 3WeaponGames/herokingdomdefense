'use strict';
// Preserve the authored building skeleton and effects beneath the documented
// Royal Knight and cavalry layers, with the added castle-derived Royal flag rig.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),fixture=require('./building-spine-fit.fixture.json');
const {decode}=require('../../packages/hkd-characters/lib/png-atlas');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function canonical(value){
  if(typeof value==='number')return Math.round(value*1e6)/1e6;
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
const hash=value=>sha(JSON.stringify(canonical(value))),clone=value=>JSON.parse(JSON.stringify(value));
const directory=asset=>'assets/KinghtFallIconMap/com/Ani/'+asset;
const filename=(asset,ext)=>directory(asset)+'/'+asset.split('/').pop()+'.'+ext;
function atlasRegions(text){
  const regions={};let current;
  for(const line of text.split(/\r?\n/)){
    if(!line.trim())continue;
    if(!/^\s/.test(line)&&!line.includes(':')){current=line.endsWith('.png')?null:line.trim();if(current)regions[current]={name:current};}
    else if(current&&line.includes(':')){const at=line.indexOf(':'),key=line.slice(0,at).trim(),value=line.slice(at+1).trim();regions[current][key]=['xy','size','orig','offset'].includes(key)?value.split(',').map(Number):key==='rotate'?value==='true':value;}
  }
  return regions;
}
function translated(mesh,offset,sign){
  assert.equal(mesh.type,'mesh');assert.equal(mesh.vertices.length,mesh.uvs.length,'Aperture fitting must use unweighted light meshes');
  mesh.vertices=mesh.vertices.map((value,i)=>Math.round((value+sign*offset[i%2])*1e6)/1e6);
}
function sourceSkeleton(asset){
  const json=clone(read(filename(asset,'json')));
  if(asset==='by'&&fixture.royalMilitary){
    const bones=new Set(fixture.royalMilitary.bones),slots=new Set(fixture.royalMilitary.slots);
    json.bones=json.bones.filter(b=>!bones.has(b.name));json.slots=json.slots.filter(s=>!slots.has(s.name));
    for(const animation of Object.values(json.animations)){
      for(const name of bones)if(animation.bones)delete animation.bones[name];
      for(const name of slots)if(animation.slots)delete animation.slots[name];
      for(const key of ['bones','slots'])if(animation[key]&&!Object.keys(animation[key]).length)delete animation[key];
    }
  }
  if(asset==='by'&&fixture.cavalry){
    json.slots=json.slots.filter(s=>s.name!==fixture.cavalry.slot);
    for(const animation of Object.values(json.animations)){
      if(animation.slots)delete animation.slots[fixture.cavalry.slot];
      if(animation.slots&&!Object.keys(animation.slots).length)delete animation.slots;
    }
  }
  for(const fit of fixture.lightFits.filter(f=>f.asset===asset&&!fixture.aliases.some(a=>a.alias===f.skin))){
    const skin=json.skins.find(s=>s.name===fit.skin);translated(skin.attachments[fit.slot][fit.attachment],fit.logicalOffset,-1);
  }
  const aliases=new Set([...fixture.aliases,...(fixture.cavalry?.aliases||[])].map(a=>a.alias));json.skins=json.skins.filter(s=>!aliases.has(s.name));
  for(const animation of Object.values(json.animations))for(const alias of aliases)if(animation.deform)delete animation.deform[alias];
  return json;
}

for(const asset of fixture.assets){
  test(asset.asset+' keeps authored bones, slots, geometry, animation keys, UVs and light deformation',()=>{
    const source=sourceSkeleton(asset.asset);
    assert.equal(hash(source.bones),asset.bones);assert.equal(hash(source.slots),asset.slots);
    assert.equal(hash(source),asset.sourceSkeleton,'Only the documented pure light translations and Royal Guard clones may change');
  });
  test(asset.asset+' changes only its allowed art rectangles and retains every light and effect pixel',()=>{
    const text=fs.readFileSync(path.join(root,filename(asset.asset,'atlas')),'utf8').replace(/\r\n/g,'\n');
    const original=asset.asset==='by'?text.split(/\n\s*\nby-royal\.png\n/)[0].trim():text.trim();
    assert.equal(sha(original),asset.originalAtlas,'Keep all original atlas coordinates, rotations, trim offsets and sampling');
    const regions=atlasRegions(text);for(const region of asset.artRegions)assert.deepEqual(regions[region.name],region);
    const image=decode(fs.readFileSync(path.join(root,filename(asset.asset,'png'))));assert.deepEqual([image.width,image.height],asset.atlasSize);
    const unchanged=Buffer.from(image.rgba);
    for(const region of asset.artRegions){const[x,y]=region.xy,[width,height]=region.rotate?[region.size[1],region.size[0]]:region.size;for(let row=y;row<y+height;row++)unchanged.fill(0,(row*image.width+x)*4,(row*image.width+x+width)*4);}
    assert.equal(sha(unchanged),asset.nonArtPixels,'Retain original window alpha, flag cloth/pole, dust, particles and construction/upgrade/destruction effects');
  });
}

test('Royal Knight tiers have proportional independent bodies, aligned aperture layers and the source ground anchor',()=>{
  const original=sourceSkeleton('by'),json=read(filename('by','json')),atlas=atlasRegions(fs.readFileSync(path.join(root,filename('by','atlas')),'utf8'));
  for(const alias of fixture.aliases){
    const source=original.skins.find(s=>s.name===alias.skin).attachments[alias.region][alias.region];
    const actual=json.skins.find(s=>s.name===alias.alias);assert(actual);
    const body=actual.attachments[alias.region][alias.region],light=actual.attachments.royal_windows.royal_windows;
    assert.equal(body.path,alias.newRegion);assert(atlas[alias.newRegion]);
    assert.equal(body.width,source.width);assert.equal(body.x,source.x);
    assert(Math.abs((body.y-body.height/2)-(source.y-source.height/2))<.00001,'Retain the source ground anchor');
    assert(Math.abs(body.width/body.height-atlas[body.path].orig[0]/atlas[body.path].orig[1])<.00001,'Never stretch the architecture');
    assert.deepEqual(light,{...body,path:alias.newRegion+'_lights'},'Light map must use the identical body transform');
    assert.deepEqual(atlas[light.path].orig,atlas[body.path].orig);
    assert.deepEqual(Object.keys(actual.attachments).sort(),[alias.region,'royal_windows',...(alias.alias==='by-royal-3'?['royal_flag','royal_flag_pole']:[])].sort());
    for(const animation of Object.values(json.animations))assert.equal(animation.deform?.[alias.alias],undefined,'Narrow window cores use fixed masks, so no source deformation can slide them onto a wall');
  }
  const meta=read(filename('by','json.meta')),page=read(directory('by')+'/by-royal.png.meta');assert.equal(meta.textures.length,3);assert.equal(meta.textures[1],page.uuid);
  const image=decode(fs.readFileSync(path.join(root,directory('by')+'/by-royal.png')));assert.deepEqual([image.width,image.height],[page.width,page.height]);
});

test('original Cocos UUIDs, sampling, icon geometry and asset metadata stay stable',()=>{
  for(const[file,expected]of Object.entries(fixture.metadata)){
    const meta=read(file);if(file===filename('by','json.meta')){assert.equal(meta.textures.length,3);meta.textures=meta.textures.slice(0,1);}
    assert.equal(hash(meta),expected,file);
  }
});

test('all fitted icons are transparent, proportional exports within their preserved Cocos sprite frames',()=>{
  for(const icon of fixture.icons){
    const file='assets/KinghtFallIconBuild/'+icon.name+'.png',meta=read(file+'.meta'),image=decode(fs.readFileSync(path.join(root,file))),frame=meta.subMetas[icon.name];
    assert(frame,icon.name);assert.equal(frame.rawTextureUuid,meta.uuid);assert.equal(meta.premultiplyAlpha,false);assert.deepEqual([image.width,image.height],[meta.width,meta.height]);
    let opaque=0;
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(image.rgba[(y*image.width+x)*4+3]){
      opaque++;assert(x>=frame.trimX&&x<frame.trimX+frame.width&&y>=frame.trimY&&y<frame.trimY+frame.height,icon.name+' clips its sprite frame');
    }
    assert(opaque>100,icon.name+' is empty');assert.equal(image.rgba[3],0,icon.name+' needs a transparent background');
  }
});

test('building fitting preserves barracks IDs, progression, colliders, stats, timing, routes and unknown data',()=>{
  const barracks=clone(read('assets/KinghtFallConfig/GameJsonCfg.json').BuildEnum['3']);
  for(const[level,sourceSkin,sourceIcon]of [[1,'by-1','by_1'],[2,'dxby-2-1','dxby_2_1'],[3,'dxby-3-1','dxby_3_1']]){
    const row=barracks.levelList.find(row=>row.index===10+level);assert.equal(row.index,10+level);assert.equal(row.Skin,'by-royal-'+level);assert.equal(row.Icon,'royal-guard-'+level);
    row.Skin=sourceSkin;row.Icon=sourceIcon;
  }
  for(const alias of fixture.cavalry.aliases){
    const row=barracks.levelList.find(row=>row.index===alias.index);assert.equal(row.Skin,alias.alias);assert.equal(row.Icon,alias.slot);row.Skin=alias.skin;
  }
  assert.equal(barracks.levelList.find(row=>row.index===22).Skin,'qby-3-2');
  assert.equal(hash(barracks),fixture.barracks,'The fitting changes only the documented visual bindings');
});

test('cavalry revised tiers retain proportions, ground anchors, lighting transitions and asset references',()=>{
  const json=read(filename('by','json')),source=sourceSkeleton('by'),atlas=atlasRegions(fs.readFileSync(path.join(root,filename('by','atlas')),'utf8'));
  for(const alias of fixture.cavalry.aliases){
    const skin=json.skins.find(s=>s.name===alias.alias),body=skin.attachments[alias.slot][alias.slot];
    const old=source.skins.find(s=>s.name===alias.skin).attachments[alias.slot][alias.slot];
    assert.equal(body.path,alias.region);assert.equal(body.width,old.width);assert.equal(body.x,old.x);
    assert(Math.abs(body.y-body.height/2-(old.y-old.height/2))<.00001,'Ground anchor stays fixed');
    assert(Math.abs(body.width/body.height-atlas[body.path].orig[0]/atlas[body.path].orig[1])<.00001,'Artwork stays proportional');
    const light=skin.attachments.cavalry_windows.cavalry_windows;assert.deepEqual(light,{...body,path:alias.region+'_lights'});
    assert.deepEqual(atlas[light.path].orig,atlas[body.path].orig);
    assert.deepEqual(Object.keys(skin.attachments).sort(),[alias.slot,'cavalry_windows'].sort(),'No source light mesh overlays the revised building');
    for(const animation of Object.values(json.animations))assert.equal(animation.deform?.[alias.alias],undefined,'Apertures cannot slide onto walls');
  }
  assert.equal(json.slots.find(s=>s.name==='cavalry_windows').bone,'bone3');
  assert.equal(json.animations.idle.slots.cavalry_windows.color[0].color,'ffffff00');
  assert.deepEqual(json.animations.Fade_in.slots.cavalry_windows,json.animations.Fade_in.slots.royal_windows);
  assert.deepEqual(json.animations.destroy.slots.cavalry_windows.attachment,[{time:.1667,name:null}]);
  assert.deepEqual(json.animations.idle_night.slots.cavalry_windows.color.map(k=>k.time||0),[0,1,2]);
  for(const skin of json.skins.filter(s=>!s.name.startsWith('qby-revised-')))assert.equal(skin.attachments.cavalry_windows,undefined);
  const meta=read(filename('by','json.meta')),page=read(directory('by')+'/'+fixture.cavalry.page+'.meta');assert.equal(meta.textures[2],page.uuid);
  const image=decode(fs.readFileSync(path.join(root,directory('by')+'/'+fixture.cavalry.page)));assert.deepEqual([image.width,image.height],[page.width,page.height]);
});

test('cavalry tier 3 restores the exact original body pixels, icon and authored light mesh',()=>{
  const json=read(filename('by','json'));assert.equal(hash(json.skins.find(s=>s.name==='qby-3-2')),fixture.cavalry.originalTier3Skin);
  assert.equal(sha(fs.readFileSync(path.join(root,'assets/KinghtFallIconBuild/qby_3_2.png'))),fixture.cavalry.originalTier3IconSha256);
  const image=decode(fs.readFileSync(path.join(root,filename('by','png')))),region=fixture.cavalry.originalTier3Region;
  const [x,y]=region.xy,[w,h]=region.size,rows=[];
  for(let iy=0;iy<h;iy++)rows.push(image.rgba.subarray(((y+iy)*image.width+x)*4,((y+iy)*image.width+x+w)*4));
  assert.equal(sha(Buffer.concat(rows)),fixture.cavalry.originalTier3BodyPixels);
});

test('Royal Knight flag reuses the castle wave keys and all added layers follow construction, night and destruction',()=>{
  const json=read(filename('by','json')),castle=read(filename('cb','json'));
  for(const name of ['idle','idle_night','Fade_in','upgrade'])for(let i=0;i<4;i++){
    assert.deepEqual(json.animations[name].bones['royal_flag_wave_'+i],castle.animations[name].bones['bone'+(5+i)],'Reuse the authored flag easing and phase');
  }
  const mount=json.bones.find(b=>b.name==='royal_flag_mount');assert.equal(mount.parent,'bone3','Flag must inherit spawn motion');
  const body=json.skins.find(s=>s.name==='by-royal-3').attachments.dxby_3_1.dxby_3_1;
  assert(mount.x<-body.width*.25&&mount.y<body.y+body.height*.35,'Flag must sit on the front-left parapet, not the rear');
  assert.equal(json.slots.find(s=>s.name==='royal_flag_pole').bone,mount.name,'Pole and cloth must move together');
  assert.equal(json.skins.find(s=>s.name==='by-royal-3').attachments.royal_flag_pole.royal_flag_pole.path,'by_royal_flag_pole');
  const flag=json.skins.find(s=>s.name==='by-royal-3').attachments.royal_flag.royal_flag;
  assert.equal(flag.type,'mesh');assert(flag.vertices.length>flag.uvs.length,'Flag cloth must be weighted, not a baked body sprite');
  assert.equal(json.animations.idle.slots.royal_windows.color[0].color,'ffffff00');
  assert.deepEqual(json.animations.Fade_in.slots.royal_windows,json.animations.Fade_in.slots.by_1_g_1,'Retain the half-second night fade');
  const pulse=json.animations.idle_night.slots.royal_windows.color;assert.deepEqual(pulse.map(k=>k.time||0),[0,1,2]);assert.notEqual(pulse[0].color,pulse[1].color);
  for(const slot of ['royal_windows','royal_flag','royal_flag_pole'])assert.deepEqual(json.animations.destroy.slots[slot].attachment,[{time:.1667,name:null}],'No glowing windows, pole or flag left after destruction');
  for(const s of json.skins.filter(s=>!s.name.startsWith('by-royal-')))for(const name of fixture.royalMilitary.slots)assert.equal(s.attachments[name],undefined,'Other families must not acquire Royal layers');
});

test('Royal Knight light maps contain exactly three narrow apertures and no lit door hardware or roof',()=>{
  const regions=atlasRegions(fs.readFileSync(path.join(root,filename('by','atlas')),'utf8'));
  const page=decode(fs.readFileSync(path.join(root,directory('by')+'/by-royal.png')));
  for(const alias of fixture.aliases){
    const region=regions[alias.newRegion+'_lights'],[x,y]=region.xy,[w,h]=region.size,points=new Set();
    for(let iy=0;iy<h;iy++)for(let ix=0;ix<w;ix++)if(page.rgba[((y+iy)*page.width+x+ix)*4+3]>128)points.add(iy*w+ix);
    const groups=[];
    while(points.size){const seed=points.values().next().value;points.delete(seed);const pending=[seed],group=[];
      while(pending.length){const p=pending.pop();group.push(p);const px=p%w,py=Math.floor(p/w);for(const q of [px>0?p-1:-1,px<w-1?p+1:-1,py>0?p-w:-1,py<h-1?p+w:-1])if(points.delete(q))pending.push(q);}
      groups.push(group);
    }
    assert.equal(groups.length,3,'Only the three actual arrow slits should emit light');
    for(const group of groups){const xs=group.map(p=>p%w),ys=group.map(p=>Math.floor(p/w));assert(group.length>40);assert(Math.max(...ys)-Math.min(...ys)>2*(Math.max(...xs)-Math.min(...xs)),'Arrow slits stay narrow');}
  }
});
