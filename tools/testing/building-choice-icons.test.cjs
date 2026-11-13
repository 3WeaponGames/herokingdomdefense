'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),cfg=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),art=require('./painted-building-integration.fixture.json').completeTowerIcons;
const PNG=require('../../packages/hkd-characters/lib/png-atlas'),Pose=require('../../assets/_script/BuildingWeaponPose'),bytes=f=>fs.readFileSync(path.join(root,f)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');

test('all sniper and cannon portrait tiers include visible mounted artwork above the base',()=>{
 assert.equal(art.towers.length,8);
 for(const family of ['cannon','sniper'])for(let tier=1;tier<=4;tier++){
  const name='painted-'+family+'-'+tier,row=cfg.BuildEnum[2].levelList.find(r=>r.Icon===name),ref=art.towers.find(r=>r.icon==='assets/KinghtFallIconBuild/'+name+'.png');assert(ref,name);
  assert.deepEqual(ref.pose,Pose.pose(row.Appearance.weapon),'portrait uses the actual idle weapon view and mount geometry');
  assert.equal(sha(bytes(ref.body)),ref.bodySha256);assert.equal(sha(bytes(ref.weapon)),ref.weaponSha256);assert.equal(sha(bytes(ref.icon)),ref.sha256);
  const im=PNG.decode(bytes(ref.icon));assert.deepEqual([im.width,im.height],[256,256]);let mounted=0;
  const[x0,y0,x1,y1]=ref.aboveBody;assert(y1>8,'mount must project above the roof');
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(im.rgba[(y*im.width+x)*4+3]>200)mounted++;
  assert(mounted>100,'a base-only export must not replace the complete weapon portrait');
 }
});

test('level2 mill choice icons reuse the existing scarecrow and bomb sprites with valid Cocos identities',()=>{
 assert.equal(art.millChoices.length,2);
 for(const ref of art.millChoices){
  const page=PNG.decode(bytes(ref.sourcePage)),[x,y,w,h]=ref.sourceRect,pixels=Buffer.alloc(w*h*4);
  for(let row=0;row<h;row++)page.rgba.copy(pixels,row*w*4,((y+row)*page.width+x)*4,((y+row)*page.width+x+w)*4);
  assert.equal(sha(pixels),ref.sourceRgbaSha256);assert.equal(sha(bytes(ref.icon)),ref.sha256);
  const im=PNG.decode(bytes(ref.icon)),meta=JSON.parse(bytes(ref.icon+'.meta')),frame=Object.values(meta.subMetas)[0];
  assert.deepEqual([im.width,im.height],[256,256]);assert.equal(frame.rawTextureUuid,meta.uuid);assert.equal(frame.trimType,'none');assert.deepEqual([frame.rawWidth,frame.rawHeight],[256,256]);
 }
});

test('all building tiers have descriptive localized names instead of level-number suffixes',()=>{
 const names=require('../../assets/resources/localization/catalog.json').entries,rows=Object.values(cfg.BuildEnum).flatMap(f=>f.levelList||[]),seen=new Set();assert.equal(rows.length,46);
 for(const row of rows){const key=row.Name.replace(/^\[\[loc:|\]\]$/g,''),entry=names[key];assert(entry&&entry.en&&entry.zh);assert(!/\bLv\.?\s*\d|\bLevel\s*\d|\d\s*级/i.test(entry.en+' '+entry.zh),'tier numbers belong in level badges: '+entry.en);assert(!seen.has(entry.en),'each upgraded design has a distinct name');seen.add(entry.en);}
 const title=index=>names[cfg.BuildEnum[2].levelList.find(r=>r.index===index).Name.slice(6,-2)].en;
 assert.equal(title(4),'Cannon Tower');assert.equal(title(7),'Sniper Tower');assert.equal(title(10),'Royal Archer Tower');
});
