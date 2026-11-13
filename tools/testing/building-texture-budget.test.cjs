'use strict';
// Presentation assets must stay within the reviewed mobile texture budget.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const painted=require('./painted-building-integration.fixture.json');
const png=resource=>{const b=fs.readFileSync(path.join(root,resource));return [b.readUInt32BE(16),b.readUInt32BE(20)];};
test('all40 building tiers share a mobile texture budget below24MiB without changing native geometry',()=>{
 const files=new Set(Object.values(painted.rigs).flatMap(r=>r.pages.map(p=>p.file)));
 for(const row of config.BuildEnum[2].levelList){
  for(const resource of [row.Appearance.sprite,...row.Appearance.lighting.map(l=>l.sprite)]){
   const file='assets/resources/'+resource+'.png',size=png(file);files.add(file);
   assert(size.every(n=>n>=64&&n<=512),resource+' should use a small practical texture');
  }
 }
 files.add("assets/KinghtFallIconMap/com/Ani/td/td-defenses.png");
 files.add("assets/resources/buildings/shared/debris.png");
 assert.equal(files.size,36,'all active painted atlas pages and tower body/light pairs');
 const bytes=[...files].reduce((sum,f)=>{const [w,h]=png(f);return sum+w*h*4;},0);
 assert(bytes<=24*1024*1024,'decoded RGBA textures exceed the24MiB building budget: '+bytes);
});
test('the four archer tiers fit beside the176-unit mill tower and retain uniform bitmap proportions',()=>{
 const rows=config.BuildEnum[2].levelList.filter(r=>r.Appearance.sprite.includes('/archer-'));
 assert.equal(rows.length,4);
 for(const row of rows){const a=row.Appearance,[w,h]=png('assets/resources/'+a.sprite+'.png');
  assert(Math.abs(a.width/w-a.height/h)<1e-6,'tower art cannot stretch');
  const image=require('../../packages/hkd-characters/lib/png-atlas').decode(fs.readFileSync(path.join(root,'assets/resources/'+a.sprite+'.png')));let top=h,bottom=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(image.rgba[(y*w+x)*4+3]>=16){top=Math.min(top,y);bottom=Math.max(bottom,y+1);}assert((bottom-top)*a.height/h<=190,'visible archer height should stay near the mill body height');
 }
});

test('approved kit cannon and sniper bases use400-pixel textures with separate native weapons and lights',()=>{
 const rows=config.BuildEnum[2].levelList.filter(r=>['cannon','sniper'].includes(r.Tower?.attackType));
 assert.equal(rows.length,8);
 for(const row of rows){const art=row.Appearance,size=png('assets/resources/'+art.sprite+'.png');
  assert.equal(Math.max(...size),400,art.sprite+' approved mobile body texture');
  assert(Math.abs(art.width/size[0]-art.height/size[1])<1e-6,'body must use one display scale');
  assert.match(art.weapon.sprite,/^buildings\/towers\//,'weapon artwork remains independent');
  assert.equal(art.lifecycle,'native-tower','authored construction and destruction remain enabled');
  assert.deepEqual(png('assets/resources/'+art.lighting[0].sprite+'.png'),size,'emission mask registers with body');
 }
});
