'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),Catalog=require('../../assets/_script/HeroSkillVFXCatalog'),Settings=require('../../assets/_script/HeroSkillSettings'),Layout=require('../../assets/_script/HeroSkillVFXLayout'),{Model}=require('../../packages/hkd-skills/preview-model');
test('all ten workbook source prefabs have complete bounded transparent flipbooks with stable sprite identities',()=>{
 assert.equal(Catalog.clips.length,22);assert.equal(new Set(Catalog.clips.filter(c=>c.source.kind!=='user-sheet').map(c=>c.source.package+'|'+c.source.prefab)).size,10);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'assets/resources/vfx/hero-skills/catalog.json'))),Catalog);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'Skill VFX.xlsx'))).digest('hex'),Catalog.workbookSha256);
 const ids=new Set();for(const clip of Catalog.clips){assert(!ids.has(clip.uuid));ids.add(clip.uuid);const file=path.join(root,'assets/resources',clip.resource+'.png'),bytes=fs.readFileSync(file),meta=JSON.parse(fs.readFileSync(file+'.meta')),sprite=Object.values(meta.subMetas)[0];assert.equal(sprite.uuid,clip.uuid);assert.equal(sprite.trimType,'none');assert.equal(meta.premultiplyAlpha,false);assert.equal(meta.genMipmaps,false);assert(meta.width<=2048&&meta.height<=2048);assert.equal(bytes.readUInt32BE(16),clip.columns*clip.cell);assert.equal(bytes.readUInt32BE(20),Math.ceil(clip.frames/clip.columns)*clip.cell);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),clip.sha256);assert(clip.visibleFrames>0);assert(clip.fps>=16);}
});
test('style presets do not change gameplay tuning, write overrides, or expose incompatible slots',()=>{
 const config={GameTools:{timingDefaults:{keep:true}},HeroSkills:{fighter:{vendor:{keep:true}}}},before=JSON.stringify(config),Core=require('../../assets/_script/HeroStyleSkills');
 for(const row of Settings.styles){const s=Settings.effective(row.id,config);for(const [key,value]of Object.entries({...Core.DEFAULTS.common,...Core.DEFAULTS[row.id]}))assert.equal(s[key],value);for(const f of Settings.descriptors(row.id))assert(f.help&&f.help.length>20);const visible=Settings.fields(row.id).visual.map(f=>f.key);assert.equal(visible.includes('beamResource'),row.id==='mystic');assert.equal(visible.includes('buffResource'),row.id==='guardian');assert.equal(visible.includes('passiveResource'),['fighter','vanguard','bruiser'].includes(row.id));}
 assert.equal(JSON.stringify(config),before);
 assert.equal(Settings.defaults('vanguard').visual.passiveScaleY,.45);assert.equal(Settings.defaults('bruiser').visual.passiveScaleY,1);
});
test('a custom or disabled resource cannot inherit the preset path or atlas metadata',()=>{
 const uuid='12345678-1234-4234-8234-123456789012';for(const [style,slot]of [['fighter','passive'],['mystic','beam'],['mystic','mark'],['guardian','buff'],['guardian','taunt'],['guardian','shield']]){
  const prefix=slot+'Resource',v=Settings.effective(style,{HeroSkills:{[style]:{visual:{[prefix]:uuid,[prefix+'Kind']:'sprite',[prefix+'Bundle']:'resources',[prefix+'Path']:'custom/effect'}}}}).visual;assert.equal(v[prefix],uuid);assert.equal(v[prefix+'Path'],'custom/effect');assert.equal(v[prefix+'Frames'],undefined);
  const disabled=Settings.effective(style,{HeroSkills:{[style]:{visual:{[prefix]:''}}}}).visual;assert.equal(disabled[prefix],'');assert.equal(disabled[prefix+'Path'],undefined);
 }
 const invalid=Settings.effective('fighter',{HeroSkills:{fighter:{visual:{passiveResource:'bad',passiveResourcePath:'other/sprite'}}}}).visual;assert.equal(invalid.passiveResourcePath,Settings.defaults('fighter').visual.passiveResourcePath);
});
test('Mystic beam connects its exact baked endpoints at arbitrary world angles while flares stay circular',()=>{
 const v=Settings.defaults('mystic').visual,from={x:10,y:70},to={x:-90,y:230},frame={entities:[{key:'beam',slot:'beam',phase:'loop',age:2,scale:1,opacity:1,from,to}]},entities=Layout.entities(frame,v,{}),body=entities.find(e=>e.clip.part==='body');assert.equal(entities.length,3);
 const c=body.clip,angle=body.angle*Math.PI/180,dx=(c.endX-c.startX)*c.cell*v.beamScale*body.scaleX,dy=(c.endY-c.startY)*c.cell*v.beamScale*body.scaleY;
 assert(Math.abs(body.x+dx*Math.cos(angle)-dy*Math.sin(angle)-to.x)<1e-4);assert(Math.abs(body.y+dx*Math.sin(angle)+dy*Math.cos(angle)-to.y)<1e-4);
 for(const e of entities.filter(e=>e!==body)){assert.equal(e.scaleX,1);assert.equal(e.scaleY,1);}
});
test('preview integrates passive playback rather than jumping to age times a changed speed and seeking reproduces the visual state',()=>{
 const s=Settings.defaults('bruiser'),m=new Model('bruiser',s,{mode:'basic',hp:90,attackRate:0,targetDistance:700});m.advance(1);const before=m.vfxFrame.entities[0].age;m.hero.hp=50;m.updateVFX();assert.equal(m.vfxFrame.entities[0].age,before);m.advance(.1);assert(m.vfxFrame.entities[0].age>before);
 const f=new Model('fighter',Settings.defaults('fighter'),{mode:'basic',targetDistance:80,attackRate:3});f.seek(2);const frame=JSON.stringify(f.vfxFrame);f.seek(2);assert.equal(JSON.stringify(f.vfxFrame),frame);assert(f.vfxFrame.entities.length>0&&f.vfxFrame.entities.length<=5);
});

test('both supplied Guardian sheets retain their source provenance, proportions, phase linkage and automatic presets',()=>{
 const clips=Catalog.clips.filter(c=>c.source.kind==='user-sheet');assert.equal(clips.length,4);assert(clips.every(c=>c.cell===128&&c.aspect===1));const taunt=clips.find(c=>c.slot==='taunt');assert.equal(taunt.frames,60);assert.equal(taunt.loop,false);assert.deepEqual(taunt.source.frames,Array.from({length:60},(_,i)=>i));const v=Settings.defaults('guardian').visual;assert.equal(v.tauntResource,taunt.uuid);const shield=clips.find(c=>c.slot==='shield'&&c.phase==='loop');assert.equal(v.shieldResource,shield.uuid);for(const phase of ['start','loop','end'])assert.equal(Layout.phaseClips('shield',shield,phase).length,1);
 for(const style of Settings.styles.map(s=>s.id)){const keys=Settings.fields(style).visual.map(f=>f.key);assert.equal(keys.includes('tauntResource'),style==='guardian');assert.equal(keys.includes('shieldResource'),style==='guardian');}
});
