'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),PNG=require('../../packages/hkd-characters/lib/png-atlas'),Looks=require('../../assets/_script/ProjectileLooks'),Settings=require('../../assets/_script/HeroSkillSettings');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),data=read('assets/resources/projectiles/catalog.json'),config=read('assets/KinghtFallConfig/GameJsonCfg.json');
const original='assets/KinghtFallEnemyAni/wqyl_lead/wqyl_lead_bullet_jian/wqyl_lead_bullet_jian',purple='assets/resources/projectiles/hero-arrow-tier4/hero-arrow-tier4';
const ids=['hero-skin:lv1','hero-skin:lv2','hero-skin:lv3','hero-skin:lv4-purple','hero-skin:lv4'];

test('all 25 Skirmisher arrow upgrades select the correct one of five tier projectiles',()=>{
 const before=JSON.stringify(data),gear=config.EquipCfg.find(row=>row.id===3);
 assert.equal(gear.levelInfo.length,25);
 for(const row of gear.levelInfo){const expected=ids[Math.floor((row.Level-1)/5)],choice=Looks.select(data,'hero',row.Level,{parts:[{sprite:'an-equipped-arrow'}]},row.EquipSkin),skill=Looks.skillAsset(data,config,row.Level);assert.equal(choice.flight,expected);assert.equal(skill.id,expected);assert.equal(skill.uuid,data.assets.find(a=>a.id===expected).uuid);}
 assert.equal(data.assets.find(a=>a.id==='hero-skin:lv4').name,'Hero arrow · lv5');assert.equal(data.assets.find(a=>a.id==='hero-skin:lv4-purple').name,'Hero arrow · lv4');
 const custom={...data,assignments:{...data.assignments,hero:{flight:'original:stone'}}};assert.equal(Looks.select(custom,'hero',20,null,'lv3').flight,'original:stone');
 assert.equal(Looks.select(data,'hero',20,null,false).flight,undefined,'Skirmisher defaults leaked into another hero style');assert.equal(JSON.stringify(data),before);
});

test('active skills follow the live arrow tier automatically and still accept an explicit Skills projectile override',()=>{
 const P={},visual=Settings.defaults('skirmisher').visual;let level=1;
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroSkillPresentation.js'),'utf8'),{exports:P,require:name=>name==='./ProjectileLooks'?{...Looks,currentCatalog:()=>data}:name==='KinghtFallPlayerMgr'?{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeaponLevel:()=>level})})}}:name.startsWith('./')?require(path.join(root,'assets/_script',name)):{} });
 const runtime={state:{style:'skirmisher'},settings:{visual},config};for(level=1;level<=25;level++){const result=P.visual(runtime);assert.equal(result.projectile,ids[Math.floor((level-1)/5)]);assert.equal(result.showBuiltin,false);}
 runtime.settings.visual={...visual,projectile:ids[0],projectileAsset:Looks.skillAsset(data,config,1)};level=25;assert.equal(P.visual(runtime).projectile,ids[0]);assert.equal(visual.projectile,'','Resolving equipped tiers wrote default selections');
});

test('purple VIP1 keeps the exact atlas size, alpha, UV layout, animation and attachment geometry',()=>{
 const source=PNG.decode(fs.readFileSync(path.join(root,original+'.png'))),copy=PNG.decode(fs.readFileSync(path.join(root,purple+'.png')));assert.equal(source.width,742);assert.equal(source.height,295);assert.equal(copy.width,source.width);assert.equal(copy.height,source.height);
 let changed=0;for(let at=0;at<source.rgba.length;at+=4){assert.equal(copy.rgba[at+3],source.rgba[at+3]);assert.equal(Math.max(...copy.rgba.subarray(at,at+3)),Math.max(...source.rgba.subarray(at,at+3)),'Color edit changed source texture brightness');if(!copy.rgba.subarray(at,at+3).equals(source.rgba.subarray(at,at+3)))changed++;}assert(changed>1000);
 const before=read(original+'.json'),after=read(purple+'.json');assert.deepEqual(after.bones,before.bones);assert.deepEqual(after.slots,before.slots);assert.deepEqual(after.animations,before.animations);assert.deepEqual(after.skeleton,before.skeleton);assert.equal(after.skins.length,1);
 const geometry=value=>{const copy=structuredClone(value);for(const slot of Object.values(copy.attachments))for(const a of Object.values(slot))delete a.color;return copy;};assert.deepEqual(geometry(after.skins[0]),geometry(before.skins.find(s=>s.name==='vip1')));
 const sourceAtlas=fs.readFileSync(path.join(root,original+'.atlas'),'utf8'),copyAtlas=fs.readFileSync(path.join(root,purple+'.atlas'),'utf8');assert.equal(copyAtlas.replace('hero-arrow-tier4.png','wqyl_lead_bullet_jian.png'),sourceAtlas);
 const texture=read(purple+'.png.meta'),rig=read(purple+'.json.meta');assert.deepEqual(rig.textures,[texture.uuid]);assert.notEqual(rig.uuid,read(original+'.json.meta').uuid);assert.equal(texture.width,742);assert.equal(texture.height,295);
});
