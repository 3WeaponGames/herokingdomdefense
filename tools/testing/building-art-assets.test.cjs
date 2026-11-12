'use strict';
// Check actual runtime resources, source fidelity and the unchanged native weapons.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),views=require('../../assets/_script/BuildingWeaponPose').views,PNG=require('../../packages/hkd-characters/lib/png-atlas');
const fixture=require('./tower-native-weapon-assets.fixture.json');
const rows=config.BuildEnum[2].levelList.filter(row=>/^buildings\/redesign\/towers\/(archer|sniper|cannon)-[1-4]$/.test(row.Appearance?.sprite));
function file(resource){return path.join(root,'assets/resources',resource+'.png');}
function inspect(resource,width,height){
 const name=file(resource),bytes=fs.readFileSync(name),meta=JSON.parse(fs.readFileSync(name+'.meta','utf8'));
 assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(bytes[25],6,resource+' requires an RGBA cutout');
 const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);if(width!==undefined)assert.equal(w,Math.round(width),resource+' native width');if(height!==undefined)assert.equal(h,Math.round(height),resource+' native height');
 assert.equal(meta.width,w);assert.equal(meta.height,h);const frame=Object.values(meta.subMetas)[0];
 assert(frame.uuid&&meta.uuid&&frame.rawTextureUuid===meta.uuid);assert.equal(frame.trimType,'none','keep authored canvas pivots');
 assert.deepEqual([frame.width,frame.height,frame.rawWidth,frame.rawHeight],[w,h,w,h]);assert.deepEqual([frame.trimX,frame.trimY,frame.offsetX,frame.offsetY],[0,0,0,0]);
 return {width:w,height:h,bytes};
}
function components(pixels,width,height){
 const seen=new Uint8Array(width*height),queue=new Uint32Array(width*height);let count=0;
 for(let index=0;index<seen.length;index++)if(!seen[index]&&pixels[index*4+3]){
  let read=0,write=1;queue[0]=index;seen[index]=1;
  while(read<write){const at=queue[read++],x=at%width,y=Math.floor(at/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const next=yy*width+xx;if(!seen[next]&&pixels[next*4+3]){seen[next]=1;queue[write++]=next;}}}
  // Tiny dark grain islands inside a reviewed aperture are not extra windows.
  if(write>=100)count++;
 }
 return count;
}
test('all twelve accepted tower bodies ship exact approved pixels with uniform display proportions',()=>{
 assert.equal(rows.length,12);assert.equal(fixture.paintedBases.length,12);
 for(const row of rows){const art=row.Appearance,ref=fixture.paintedBases.find(x=>'assets/resources/'+art.sprite+'.png'===x.path);assert(ref,art.sprite);
  const image=inspect(art.sprite);assert(Math.abs(art.width/image.width-art.height/image.height)<1e-6,art.sprite+' must not stretch');
  assert.equal(crypto.createHash('sha256').update(image.bytes).digest('hex'),ref.sha256);assert.equal(art.lifecycle,'native-tower','retain the authored collapse, dust and persistent rubble');if(ref.originalDestroyed)assert.deepEqual(art.destroyed,ref.originalDestroyed,'retain each original per-tier ruin; only fourth tier reuses third');
 }
});
test('six retained native bases and all forty-five weapon frames keep their native metadata geometry',()=>{
 const heights={cannon:[212,224,230],sniper:[230,218,230]};let checked=0;
 for(const family of ['cannon','sniper'])for(let tier=1;tier<=3;tier++){inspect('buildings/towers/'+family+'-'+tier,187,heights[family][tier-1]);checked++;}
 const frames=new Map();for(const row of rows)if(row.Appearance.weapon)for(const layer of Object.values(views(row.Appearance.weapon))){frames.set(layer.sprite,layer);if(layer.emptySprite)frames.set(layer.emptySprite,{...layer,sprite:layer.emptySprite});}
 assert.equal(frames.size,45);for(const layer of frames.values()){inspect(layer.sprite,layer.width,layer.height);checked++;}assert.equal(checked,51);
});
test('original base, destroyed, weapon, metadata and Archer Spine sources remain byte-identical',()=>{
 assert.equal(fixture.nativeSources.filter(x=>/-weapon[^/]*\.png$/.test(x.path)).length,45);assert.equal(fixture.nativeSources.length,120);
 for(const ref of fixture.nativeSources){const bytes=fs.readFileSync(path.join(root,ref.path));assert.equal(bytes.length,ref.bytes,ref.path);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),ref.sha256,ref.path);}
});
test('night masks fit each accepted body, light only approved dark apertures and leave doors dark',()=>{
 let apertures=0;
 for(const row of rows){const art=row.Appearance,ref=fixture.paintedBases.find(x=>'assets/resources/'+art.sprite+'.png'===x.path);assert.equal(art.nightTint,'#A7A7A7');assert.equal(art.lighting.length,1);
  const light=art.lighting[0];assert.equal('assets/resources/'+light.sprite+'.png',ref.maskPath);assert.deepEqual([light.width,light.height,light.offsetX,light.offsetY],[art.width,art.height,0,0]);
  assert.equal(light.color,'#FFE89A');assert.equal(light.opacity,240);assert.equal(light.glows.length,ref.apertures);
  const base=PNG.decode(fs.readFileSync(file(art.sprite))),maskFile=inspect(light.sprite,base.width,base.height),mask=PNG.decode(maskFile.bytes);assert.equal(crypto.createHash('sha256').update(maskFile.bytes).digest('hex'),ref.maskSha256);
  let lit=0;for(let i=0;i<mask.rgba.length;i+=4)if(mask.rgba[i+3]){lit++;assert(base.rgba[i+3]>=240&&Math.max(...base.rgba.subarray(i,i+3))<=35,'mask must stay inside an opaque dark source aperture');const x=(i/4)%base.width,y=Math.floor(i/4/base.width);assert(ref.windowSourceBounds.some(b=>x>=b[0]&&x<b[2]&&y>=b[1]&&y<b[3]),'mask leaves its approved window');const d=ref.excludedDoorSourceBounds;assert(!d||x<d[0]||x>=d[2]||y<d[1]||y>=d[3],'door must stay dark');}
  assert(lit>0);assert.equal(components(mask.rgba,mask.width,mask.height),ref.apertures);apertures+=ref.apertures;
 }
 assert.equal(apertures,16);
});
