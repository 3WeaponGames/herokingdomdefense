'use strict';
// Check actual runtime resources, source fidelity and the unchanged native weapons.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),views=require('../../assets/_script/BuildingWeaponPose').views,PNG=require('../../packages/hkd-characters/lib/png-atlas');
const fixture=require('./tower-native-weapon-assets.fixture.json');
const rows=config.BuildEnum[2].levelList.filter(row=>/^buildings\/redesign\/towers\/(archer|sniper|cannon)-[1-4]$/.test(row.Appearance?.sprite));
function file(resource){return path.join(root,'assets/resources',resource+'.png');}
function assertOriginalSource(ref,bytes){
 // The retained atlas snapshot used CRLF, while Git checks it out with LF.
 // Reconstruct only that text convention; every content byte and binary asset
 // still has to match the original size and SHA, not a refreshed baseline.
 const source=ref.path.endsWith('.atlas')?Buffer.from(bytes.toString('utf8').replace(/\r?\n/g,'\r\n')):bytes;
 assert.equal(source.length,ref.bytes,ref.path);
 assert.equal(crypto.createHash('sha256').update(source).digest('hex'),ref.sha256,ref.path);
}
function inspect(resource,width,height){
 const name=file(resource),bytes=fs.readFileSync(name),meta=JSON.parse(fs.readFileSync(name+'.meta','utf8'));
 assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(bytes[25],6,resource+' requires an RGBA cutout');
 const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);if(width!==undefined)assert.equal(w,Math.round(width),resource+' native width');if(height!==undefined)assert.equal(h,Math.round(height),resource+' native height');
 assert.equal(meta.width,w);assert.equal(meta.height,h);const frame=Object.values(meta.subMetas)[0];
 assert(frame.uuid&&meta.uuid&&frame.rawTextureUuid===meta.uuid);assert.equal(frame.trimType,'none','keep authored canvas pivots');
 assert.deepEqual([frame.width,frame.height,frame.rawWidth,frame.rawHeight],[w,h,w,h]);assert.deepEqual([frame.trimX,frame.trimY,frame.offsetX,frame.offsetY],[0,0,0,0]);
 return {width:w,height:h,bytes};
}
function components(pixels,width,height,minPixels=100){
 const seen=new Uint8Array(width*height),queue=new Uint32Array(width*height);let count=0;
 for(let index=0;index<seen.length;index++)if(!seen[index]&&pixels[index*4+3]){
  let read=0,write=1;queue[0]=index;seen[index]=1;
  while(read<write){const at=queue[read++],x=at%width,y=Math.floor(at/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const next=yy*width+xx;if(!seen[next]&&pixels[next*4+3]){seen[next]=1;queue[write++]=next;}}}
  // Tiny dark grain islands inside a reviewed aperture are not extra windows.
  if(write>=minPixels)count++;
 }
 return count;
}
test('all twelve accepted tower bodies ship exact approved pixels with uniform display proportions',()=>{
 assert.equal(rows.length,12);assert.equal(fixture.paintedBases.length,12);
 for(const row of rows){const art=row.Appearance,ref=fixture.paintedBases.find(x=>'assets/resources/'+art.sprite+'.png'===x.path);assert(ref,art.sprite);
  const image=inspect(art.sprite);assert(Math.abs(art.width/image.width-art.height/image.height)<1e-6,art.sprite+' must not stretch');
  assert.equal(crypto.createHash('sha256').update(image.bytes).digest('hex'),ref.sha256);assert.equal(art.lifecycle,'native-tower','retain the authored collapse and dust');assert.equal(art.destroyed,undefined,'all towers use shared native debris');
 }
});
test('six retained native bases and all forty-five weapon frames keep their native metadata geometry',()=>{
 const heights={cannon:[212,224,230],sniper:[230,218,230]};let checked=0;
 for(const family of ['cannon','sniper'])for(let tier=1;tier<=3;tier++){inspect('buildings/towers/'+family+'-'+tier,187,heights[family][tier-1]);checked++;}
 const frames=new Map();for(const row of rows)if(row.Appearance.weapon)for(const layer of Object.values(views(row.Appearance.weapon))){frames.set(layer.sprite,layer);if(layer.emptySprite)frames.set(layer.emptySprite,{...layer,sprite:layer.emptySprite});}
 assert.equal(frames.size,45);for(const layer of frames.values()){const im=inspect(layer.sprite),family=/\/(cannon|sniper)-/.exec(layer.sprite)[1],scale=fixture.weaponDisplayScales?.[family]||1;assert(Math.abs(layer.width/im.width-scale)<1e-6&&Math.abs(layer.height/im.height-scale)<1e-6,layer.sprite+' retains native aspect ratio at its reviewed display scale');checked++;}assert.equal(checked,51);
});
test('original binary assets and Archer Spine text remain identical apart from Git atlas line endings',()=>{
 assert.equal(fixture.nativeSources.filter(x=>/-weapon[^/]*\.png$/.test(x.path)).length,45);assert.equal(fixture.nativeSources.length,120);
 for(const ref of fixture.nativeSources)assertOriginalSource(ref,fs.readFileSync(path.join(root,ref.path)));
});

test('source fidelity accepts only atlas newline substitutions and rejects changed regions or binary newlines',()=>{
 const atlas=fixture.nativeSources.find(ref=>ref.path.endsWith('.atlas')),original=fs.readFileSync(path.join(root,atlas.path)).toString('utf8'),lf=original.replace(/\r\n/g,'\n');
 for(const text of [lf,lf.replace(/\n/g,'\r\n')])assertOriginalSource(atlas,Buffer.from(text));
 const changed=lf.replace(/(xy:\s*)(\d+)/,(_,prefix,value)=>prefix+(Number(value)+1));
 assert.notEqual(changed,lf,'Actual atlas region coordinates must be covered');assert.throws(()=>assertOriginalSource(atlas,Buffer.from(changed)),assert.AssertionError);
 const png=fixture.nativeSources.find(ref=>ref.path.endsWith('.png')),bytes=fs.readFileSync(path.join(root,png.path));
 assert.equal(bytes[4],13);assert.equal(bytes[5],10);
 assert.throws(()=>assertOriginalSource(png,Buffer.concat([bytes.subarray(0,4),bytes.subarray(5)])),assert.AssertionError);
});
test('inactive aperture guides fit the source openings while original native sprites supply the light',()=>{
 let apertures=0;
 for(const row of rows){const art=row.Appearance,ref=fixture.paintedBases.find(x=>'assets/resources/'+art.sprite+'.png'===x.path);assert.equal(art.nightTint,'#A7A7A7');assert.equal(art.lighting.length,ref.family==='archer'?2:1);
  const light=art.lighting[0];assert.equal('assets/resources/'+light.sprite+'.png',ref.maskPath);assert.deepEqual([light.width,light.height,light.offsetX,light.offsetY],[art.width,art.height,0,0]);
  assert.equal(light.color,'#FFE89A');assert.equal(light.opacity,0,'flat painted fills remain disabled');assert.equal(light.glows.length,ref.glowCount||ref.apertures);
  for(const glow of light.glows){assert.equal(glow.sprite,'buildings/lighting/native-window-ray');assert.equal(glow.color,'#FFFFFF','retain original baked warm yellow rather than double-tinting');assert.equal(glow.pulse,.08);assert.equal(glow.opacity,235,'original pixels supply the visible illumination');assert.equal(glow.angle,ref.family==='archer'&&glow.x<0?-90:0);}
  const base=PNG.decode(fs.readFileSync(file(art.sprite))),maskFile=inspect(light.sprite,base.width,base.height),mask=PNG.decode(maskFile.bytes);assert.equal(crypto.createHash('sha256').update(maskFile.bytes).digest('hex'),ref.maskSha256);
  let lit=0;for(let i=0;i<mask.rgba.length;i+=4)if(mask.rgba[i+3]){lit++;assert(base.rgba[i+3]>=240&&Math.max(...base.rgba.subarray(i,i+3))<=(ref.maxWindowChannel||35),'mask must stay inside an opaque dark source aperture');const x=(i/4)%base.width,y=Math.floor(i/4/base.width);assert(ref.windowSourceBounds.some(b=>x>=b[0]&&x<b[2]&&y>=b[1]&&y<b[3]),'mask leaves its approved window');const d=ref.excludedDoorSourceBounds;assert(!d||x<d[0]||x>=d[2]||y<d[1]||y>=d[3],'door must stay dark');}
  assert(lit>0);assert.equal(components(mask.rgba,mask.width,mask.height,ref.minComponentPixels||100),ref.apertures);apertures+=ref.apertures;
 }
 assert.equal(apertures,24,'eight archer windows and sixteen lantern glass panes');
});

test('the shared soft fan is a lossless original archer atlas region with unchanged pixel falloff',()=>{
 const ref=fixture.projectedLighting,original=PNG.decode(fs.readFileSync(path.join(root,ref.source))),crop=PNG.crop(original,...ref.sourceRect,false),asset=inspect(ref.resource,crop.width,crop.height),actual=PNG.decode(asset.bytes);
 assert.deepEqual(actual.rgba,crop.rgba,'no repainting, resampling or alpha normalization of native light');
 assert.equal(crypto.createHash('sha256').update(asset.bytes).digest('hex'),ref.sha256);
 const alphas=new Set();for(let i=3;i<actual.rgba.length;i+=4)alphas.add(actual.rgba[i]);assert([...alphas].some(a=>a>0&&a<64)&&[...alphas].some(a=>a>=64&&a<192),'original transparent falloff must survive the resource copy');
});

test('only the four open archer entries receive an original projected sprite with a registered dark-aperture guide',()=>{
 let count=0;
 for(const row of rows){const art=row.Appearance,ref=fixture.paintedBases.find(x=>'assets/resources/'+art.sprite+'.png'===x.path);
  if(ref.family!=='archer'){assert.equal(art.lighting.length,1,'closed cannon/sniper wood gets no entry light');continue;}
  const door=art.lighting[1],base=PNG.decode(fs.readFileSync(file(art.sprite))),toPixel=p=>[(p.x/art.width+.5)*base.width,base.height-p.y/art.height*base.height],points=door.points.map(toPixel);
  assert.equal(door.opacity,0,'custom polygon fills are disabled');assert.equal(door.glows.length,1);assert.equal(door.glows[0].sprite,fixture.projectedLighting.resource);assert.equal(door.glows[0].opacity,235);assert.equal(door.glows[0].color,'#FFFFFF');
  for(let at=0;at<points.length;at++)for(let axis=0;axis<2;axis++)assert(Math.abs(points[at][axis]-ref.openDoorSourcePolygon[at][axis])<.00001,'registered entry vertices');
  const inside=(x,y)=>{let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const[a,b]=points[i],[c,d]=points[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit;}return hit;};
  let lit=0;for(let y=0;y<base.height;y++)for(let x=0;x<base.width;x++)if(inside(x+.5,y+.5)){const p=(y*base.width+x)*4;assert(base.rgba[p+3]>=240&&Math.max(...base.rgba.subarray(p,p+3))<60,'entry core stays off its timber or masonry frame');lit++;}
  assert(lit>200,'the original light stays registered to a substantial dark entry');count++;
 }
 assert.equal(count,4);
});
