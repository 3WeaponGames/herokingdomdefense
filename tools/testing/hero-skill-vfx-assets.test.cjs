'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),Catalog=require('../../assets/_script/HeroSkillVFXCatalog'),Settings=require('../../assets/_script/HeroSkillSettings'),Layout=require('../../assets/_script/HeroSkillVFXLayout'),{Model}=require('../../packages/hkd-skills/preview-model');
test('workbook particle captures and native Spine effects preserve bounded assets and source identity',()=>{
 assert.equal(Catalog.clips.length,40);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'assets/resources/vfx/hero-skills/catalog.json'))),Catalog);
 const selection=require('../skills-vfx/effects.json');assert.equal(selection.workbook,'Characters Plan.xlsx');assert(fs.statSync(path.join(root,selection.workbook)).isFile());assert.match(Catalog.workbookSha256,/^[a-f0-9]{64}$/);
 const planned=selection.clips.concat(selection.beam.parts.flatMap(part=>selection.beam.phases.map(phase=>({...selection.beam,...part,...phase,id:'mystic-beam-'+part.id+'-'+phase.phase}))));
 const baked=Catalog.clips.filter(c=>c.kind==='flipbook'&&c.source.kind!=='user-sheet');assert.equal(planned.length,baked.length);
 for(const clip of baked){const source=planned.find(row=>row.id===clip.id);assert(source,'Missing bake selection: '+clip.id);assert.deepEqual(clip.source,{package:source.package,prefab:source.prefab});for(const key of ['frames','fps'])assert.equal(clip[key],source[key]);}
 assert.deepEqual(Catalog.clips.filter(c=>c.source.kind==='user-sheet'),require('../skills-vfx/sheet-clips.json'));
 assert.deepEqual(Catalog.clips.filter(c=>c.kind==='spine'),require('../skills-vfx/native-clips.json'));
 const ids=new Set();for(const clip of Catalog.clips){assert(!ids.has(clip.id));ids.add(clip.id);
  if(clip.kind==='spine'){const file=path.join(root,'assets/resources',clip.resource+'.json'),json=JSON.parse(fs.readFileSync(file)),meta=JSON.parse(fs.readFileSync(file+'.meta'));assert.equal(meta.uuid,clip.uuid);assert.match(json.skeleton.spine,/^3\.8\./);assert(json.animations[clip.animation]);assert(clip.duration>0&&clip.decodedBytes>0);assert.equal(meta.textures.length,fs.readdirSync(path.dirname(file)).filter(n=>n.endsWith('.png')).length);continue;}
  const file=path.join(root,'assets/resources',clip.resource+'.png'),bytes=fs.readFileSync(file),meta=JSON.parse(fs.readFileSync(file+'.meta')),sprite=Object.values(meta.subMetas)[0];assert.equal(sprite.uuid,clip.uuid);assert.equal(sprite.trimType,'none');assert.equal(meta.premultiplyAlpha,false);assert.equal(meta.genMipmaps,false);assert(meta.width<=2048&&meta.height<=2048);assert.equal(bytes.readUInt32BE(16),clip.columns*clip.cell);assert.equal(bytes.readUInt32BE(20),Math.ceil(clip.frames/clip.columns)*clip.cell);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),clip.sha256);assert(clip.visibleFrames>0);assert(clip.fps>=16);
 }
});

test('the retired hero effects are absent from the catalog and rebake manifests',()=>{
 const retired=['skirmisher-single-volley','bruiser-blood-aura','bruiser-sp162-skill3','bruiser-sp162-hit1','fighter-sp162-attack2','fighter-windup','fighter-meshy-center','vanguard-momentum','vanguard-momentum-buff'];
 const records=Catalog.clips.concat(require('../skills-vfx/effects.json').clips,require('../skills-vfx/native-clips.json'));
 for(const id of retired)assert(!records.some(row=>row.id===id),id);
});

test('style presets do not change gameplay tuning, write overrides, or expose incompatible slots',()=>{
 const config={GameTools:{timingDefaults:{keep:true}},HeroSkills:{fighter:{vendor:{keep:true}}}},before=JSON.stringify(config),Core=require('../../assets/_script/HeroStyleSkills');
 for(const row of Settings.styles){const s=Settings.effective(row.id,config);for(const [key,value]of Object.entries({...Core.DEFAULTS.common,...Core.DEFAULTS[row.id]}))assert.equal(s[key],value);for(const f of Settings.descriptors(row.id))assert(f.help&&f.help.length>20);const visible=Settings.fields(row.id).visual.map(f=>f.key);assert.equal(visible.includes('beamResource'),false);assert.equal(visible.includes('channelTrailSpeed'),row.id==='mystic');assert.equal(visible.includes('buffResource'),['fighter','vanguard','guardian'].includes(row.id));assert.equal(visible.includes('passiveResource'),['fighter','bruiser'].includes(row.id));}
 assert.equal(JSON.stringify(config),before);
 assert.equal(Settings.defaults('vanguard').visual.passiveResource,'');assert.equal(Settings.defaults('bruiser').visual.passiveScaleX,1.5);
});
test('a saved Meshy Ki selection resolves to an empty Battle Cry aura slot',()=>{
 const config={HeroSkills:{fighter:{visual:{
  buffResource:'7099be28-1ad2-53e1-b671-0250e261c93d',buffResourcePath:'vfx/hero-skills/fighter-meshy-center',
  buffResourceKind:'sprite',buffResourceFrames:96,buffResourceColumns:16,buffResourceCell:128,buffResourceFps:64
 }}}},before=JSON.stringify(config);
 const visual=Settings.effective('fighter',config).visual;
 assert.equal(visual.buffResource,'');assert.equal(visual.buffResourcePath,undefined);assert.equal(visual.buffResourceFrames,undefined);
 assert.equal(JSON.stringify(config),before);
});
test('a custom or disabled resource cannot inherit the preset path or atlas metadata',()=>{
 const uuid='12345678-1234-4234-8234-123456789012';for(const [style,slot]of [['fighter','passive'],['fighter','buff'],['mystic','mark'],['guardian','buff'],['guardian','taunt'],['guardian','shield']]){
  const prefix=slot+'Resource',v=Settings.effective(style,{HeroSkills:{[style]:{visual:{[prefix]:uuid,[prefix+'Kind']:'sprite',[prefix+'Bundle']:'resources',[prefix+'Path']:'custom/effect'}}}}).visual;assert.equal(v[prefix],uuid);assert.equal(v[prefix+'Path'],'custom/effect');assert.equal(v[prefix+'Frames'],undefined);
  const disabled=Settings.effective(style,{HeroSkills:{[style]:{visual:{[prefix]:''}}}}).visual;assert.equal(disabled[prefix],'');assert.equal(disabled[prefix+'Path'],undefined);
 }
 const invalid=Settings.effective('fighter',{HeroSkills:{fighter:{visual:{passiveResource:'bad',passiveResourcePath:'other/sprite'}}}}).visual;assert.equal(invalid.passiveResourcePath,Settings.defaults('fighter').visual.passiveResourcePath);
});
test('Mystic beam connects its exact baked endpoints at arbitrary world angles while flares stay circular',()=>{
 const v=Settings.defaults('mystic').visual;Settings.applyClip(v,'beamResource',Catalog.clips.find(c=>c.id==='mystic-beam-body-loop'));const from={x:10,y:70},to={x:-90,y:230},frame={entities:[{key:'beam',slot:'beam',phase:'loop',age:2,scale:1,opacity:1,from,to}]},entities=Layout.entities(frame,v,{}),body=entities.find(e=>e.clip.part==='body');assert.equal(entities.length,3);
 const c=body.clip,angle=body.angle*Math.PI/180,dx=(c.endX-c.startX)*c.cell*v.beamScale*body.scaleX,dy=(c.endY-c.startY)*c.cell*v.beamScale*body.scaleY;
 assert(Math.abs(body.x+dx*Math.cos(angle)-dy*Math.sin(angle)-to.x)<1e-4);assert(Math.abs(body.y+dx*Math.sin(angle)+dy*Math.cos(angle)-to.y)<1e-4);
 for(const e of entities.filter(e=>e!==body)){assert.equal(e.scaleX,1);assert.equal(e.scaleY,1);}
});
test('preview integrates passive playback rather than jumping to age times a changed speed and seeking reproduces the visual state',()=>{
 const s=Settings.defaults('bruiser'),m=new Model('bruiser',s,{mode:'basic',hp:90,attackRate:0,targetDistance:700});m.advance(1);const before=m.vfxFrame.entities[0].age;m.hero.hp=50;m.updateVFX();assert.equal(m.vfxFrame.entities[0].age,before);m.advance(.1);assert(m.vfxFrame.entities[0].age>before);
 const f=new Model('fighter',Settings.defaults('fighter'),{mode:'basic',targetDistance:80,attackRate:3});
 f.seek(2);assert.equal(f.vfxFrame.entities.length,0);
 assert(f.duration()>5.2);f.seek(5.2);const frame=JSON.stringify(f.vfxFrame);
 f.seek(5.2);assert.equal(JSON.stringify(f.vfxFrame),frame);assert.equal(f.state.stacks,10);
 assert.equal(f.vfxFrame.entities.length,1);f.seek(7);assert.equal(f.vfxFrame.entities.length,0);assert(f.state.stackRemaining>0);
});

test('legacy Guardian sheets retain source provenance while the new plan selects exclamation and native shield',()=>{
 const clips=Catalog.clips.filter(c=>c.style==='guardian'&&c.source.kind==='user-sheet'&&c.slot!=='cast');assert.equal(clips.length,4);assert(clips.every(c=>c.cell===128&&c.aspect===1));const taunt=clips.find(c=>c.slot==='taunt');assert.equal(taunt.frames,60);assert.equal(taunt.loop,false);assert.deepEqual(taunt.source.frames,Array.from({length:60},(_,i)=>i));const v=Settings.defaults('guardian').visual;assert.equal(v.tauntResource,Catalog.clips.find(c=>c.id==='guardian-taunt-exclamation').uuid);const shield=clips.find(c=>c.slot==='shield'&&c.phase==='loop');assert.equal(v.shieldResource,'');assert(v.physicalShieldResource);for(const phase of ['start','loop','end'])assert.equal(Layout.phaseClips('shield',shield,phase).length,1);
 for(const style of Settings.styles.map(s=>s.id)){const keys=Settings.fields(style).visual.map(f=>f.key);assert.equal(keys.includes('tauntResource'),style==='guardian');assert.equal(keys.includes('shieldResource'),style==='guardian');}
});

test('the supplied taunt sheet is the Guardian’s one-shot ground cast with its visible frames in order',()=>{
 const v=Settings.defaults('guardian').visual,ring=Layout.clipFor(v.castResource);
 assert.equal(ring.id,'guardian-taunt-ring');
 assert.equal(ring.source.file,'taunt-effect-sheet.png');
 assert.deepEqual(ring.source.frames,Array.from({length:18},(_,i)=>i+3));
 assert.equal(ring.fps,30);assert.equal(ring.startOnImpact,true);assert.equal(ring.loop,false);assert.equal(ring.ground,true);
 const authoring=require('../../assets/_script/HeroSkillAuthoring');
 assert(authoring.handles('guardian','active',v).some(([id,label])=>id==='cast'&&label==='Taunt ring'));
 assert(Settings.fields('guardian').visual.some(field=>field.key==='castResource'));
});

test('legacy Skirmisher cast settings stay inert while the transparent sheets own their slots',()=>{
 for(const id of ['skirmisher-triple-volley']){
  const clip=Catalog.clips.find(row=>row.id===id),saved={visual:{castResource:clip.uuid,castTrajectory:clip.trajectory}};
  const v=Settings.effective('skirmisher',{HeroSkills:{skirmisher:saved}}).visual;
  assert.equal(v.castResource,'');assert.equal(v.castTrajectory,undefined);assert.equal(saved.visual.castResource,clip.uuid);
 }
 for(const [style,passive,cast]of [['fighter','fighter-stack-activation','fighter-crescent-slash'],['bruiser','bruiser-flame-aura','bruiser-ring-slash']]){
  const v=Settings.defaults(style).visual;assert.equal(Layout.clipFor(v.passiveResource).id,passive);assert.equal(Layout.clipFor(v.castResource).id,cast);
  assert.equal(Layout.clipFor(v.castResource).startOnImpact,true);assert.equal(v.castSecondaryResource,'');
 }
 const vanguard=Layout.clipFor(Settings.defaults('vanguard').visual.buffResource);
 assert.equal(vanguard.id,'vanguard-incomplete-buff');
 const intro=Layout.phaseClips('buff',vanguard,'start'),loops=Layout.phaseClips('buff',vanguard,'loop');
 assert.deepEqual(intro.map(clip=>[clip.id,clip.loop]),[['vanguard-buff-up',false]]);
 assert.deepEqual(loops.map(clip=>[clip.id,clip.variant,clip.loop]),[['vanguard-incomplete-buff','incomplete',true],['vanguard-full-buff','full',true]]);
 for(const [id,filename] of Object.entries({
  'fighter-crescent-slash':'Fighter-slash.png','fighter-stack-activation':'Fighter-buff.png',
  'bruiser-flame-aura':'Bruiser-aura.png','bruiser-ring-slash':'Bruiser-circle-slash.png',
  'vanguard-buff-up':'vanguard-buff-up.png','vanguard-incomplete-buff':'vanguard-incomplete-buff.png','vanguard-full-buff':'vanguard-full-buff.png'
 })){
  const clip=Layout.clipFor(id),png=fs.readFileSync(path.join(root,'assets/resources',clip.resource+'.png'));
  assert.equal(clip.source.file,filename);assert.match(clip.source.sha256,/^[a-f0-9]{64}$/);assert.equal(png[25],6);
 }
});

test('the authored slash dissolves its opacity rather than ending as an opaque black disk',()=>{
 const {spawnSync}=require('node:child_process'),python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
 const result=spawnSync(python,['-B','-c',String.raw`
from PIL import Image
import json
clip=next(c for c in json.load(open('assets/resources/vfx/hero-skills/catalog.json'))['clips'] if c['id']=='fighter-arc-slash')
cell=clip['cell'];columns=clip['columns']
im=Image.open('assets/resources/vfx/hero-skills/fighter-arc-slash.png').convert('RGBA')
for frame in range(clip['frames']):
 x=(frame%columns)*cell;y=(frame//columns)*cell
 opaque=[p for p in im.crop((x,y,x+cell,y+cell)).getdata() if p[3]>100]
 if len(opaque)>cell*cell/32:
  mean=sum(p[0]+p[1]+p[2] for p in opaque)/len(opaque)
  assert mean>25,'Opaque black slash frame '+str(frame)
`],{cwd:root,encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(result.status,0,result.error?.message||result.stderr);
});
