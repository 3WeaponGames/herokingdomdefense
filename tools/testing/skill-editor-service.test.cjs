'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {SkillService,FILES}=require('../../packages/hkd-skills/service'),Settings=require('../../assets/_script/HeroSkillSettings'),Core=require('../../assets/_script/HeroStyleSkills');
const AUDIO='11111111-1111-4111-8111-111111111111',VFX='22222222-2222-4222-8222-222222222222';
const catalogs={audio:[{id:AUDIO,uuid:AUDIO,file:'assets/KinghtFallAudio/cast.wav',bundle:'KinghtFallAudio',path:'cast',url:'file:///cast.wav'}],vfx:[{id:VFX,uuid:VFX,file:'assets/resources/vfx/burst.png',bundle:'resources',path:'vfx/burst',kind:'sprite',url:'file:///burst.png'}]};
catalogs.vfx.push(...require('../../assets/_script/HeroSkillVFXCatalog').clips.map(c=>({id:c.uuid,uuid:c.uuid,kind:'sprite',path:c.resource,bundle:c.bundle,url:c.id+'.png'})));
function fixture(t,primary={},secondary={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-skill-editor-'));
 t.after(()=>{const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert(path.basename(resolved).startsWith('hkd-skill-editor-'));fs.rmSync(resolved,{recursive:true,force:true});});
 for(const [i,file]of FILES.entries()){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({version:7,GameTools:{timingDefaults:{'hero:hero:default':{attack:.1667}},timings:{'hero:hero:default':{attack:.2}}},EquipCfg:[{id:3,unknown:'keep'}],untouched:{spelling:'Original',number:3.75},...(i?secondary:primary)},null,2)+'\n');}
 let commits=0;
 const service=new SkillService(root,{catalogs,describe:(_root,request)=>({layers:[{animations:['idle','move','attack','attack_mystic'],json:{animations:{idle:{},move:{},attack:{events:[{name:'attack',time:.1667}]},attack_mystic:{events:[{name:'attack',time:.1667}]}}}}],runtimePath:'safe-spine-runtime',request}),commit:(...args)=>{commits++;return require('../../packages/hkd-characters/lib/asset-transaction').commit(...args);}});
 const bytes=()=>FILES.map(file=>fs.readFileSync(path.join(root,file),'utf8'));
 const req=extra=>({version:service.version,revision:service.revision,...extra});
 const change=(style,field,value)=>service.change(req({style,path:field,value}));
 return {root,service,bytes,req,change,commits:()=>commits};
}

test('enemy skill visuals use the shared draft and publish to the battle config',t=>{
 const primary={HeroSkills:{guardian:{future:9}},EnemySkillVisuals:{haste:{future:'keep'}},SoldierCfg:{
  1:{ID:1,Name:'First',prefab:'First',TransformSkill:{unitId:2,trigger:'health',healthPercent:40}},2:{ID:2,Name:'Next',prefab:'Next'}
 }};
 const f=fixture(t,primary),before=f.bytes(),initial=f.service.snapshot();
 assert.deepEqual(initial.enemyStyles.map(row=>row.id),['enemy:transform','enemy:heal','enemy:haste','enemy:damage','enemy:move','enemy:weaken']);
 for(const id of ['haste','damage','move'])assert.equal(initial.effective['enemy:'+id].visual.showIndicator,true);
 const preview=f.service.describe({style:'enemy:transform',model:'enemy:1'});
 assert.equal(preview.nextForm.request.id,'2');assert.deepEqual(preview.transform,primary.SoldierCfg[1].TransformSkill);
 assert.equal(f.service.save(f.req()).result.saved,false);
 assert.throws(()=>f.change('enemy:haste','visual.resource',VFX),/imported Spine effect/);
 assert.throws(()=>f.change('enemy:haste','visual.opacity',2),/valid enemy skill visual/);
 const edited=f.change('enemy:haste','visual.tint','#123456');
 assert.equal(edited.effective['enemy:haste'].visual.tint,'#123456');assert.deepEqual(f.bytes(),before);
 assert.equal(f.service.undo(f.req()).effective['enemy:haste'].visual.tint,'#ff7676');
 assert.equal(f.service.redo(f.req()).effective['enemy:haste'].visual.tint,'#123456');
 assert.throws(()=>f.change('enemy:haste','visual.indicatorRate',0),/valid enemy skill visual/);
 assert.equal(f.change('enemy:haste','visual.indicatorRate',1.5).effective['enemy:haste'].visual.indicatorRate,1.5);
 assert.deepEqual(f.bytes(),before);
 assert.equal(f.service.save(f.req()).result.saved,true);
 const [battle,mirror]=f.bytes(),saved=JSON.parse(battle);
 assert.deepEqual(saved.EnemySkillVisuals,{haste:{future:'keep',tint:'#123456',indicatorRate:1.5}});
 assert.deepEqual(saved.HeroSkills,primary.HeroSkills);assert.deepEqual(saved.SoldierCfg,primary.SoldierCfg);
 assert.equal(mirror,before[1]);assert.equal(f.commits(),1);
});

test('a complete preview transform is one atomic draft edit, one undo step and one explicit publication',t=>{
 const primary={HeroSkills:{skirmisher:{extension:{keep:'primary'},visual:{extension:'retain'}}}},secondary={HeroSkills:{skirmisher:{extension:{keep:'mirror'},visual:{mirrorOnly:9}}}},f=fixture(t,primary,secondary),before=f.bytes(),start=f.service.snapshot();
 const changes=[{path:'visual.arcDegrees',value:35},{path:'volleyRange',value:450}];
 const edited=f.service.change(f.req({style:'skirmisher',changes}));assert.equal(edited.version,start.version+1);assert.equal(f.service.undoStack.length,1);assert.equal(f.service.redoStack.length,0);
 for(const edit of changes)assert.equal(Settings.get(edited.effective.skirmisher,edit.path),edit.value);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
 const undone=f.service.undo(f.req());assert.deepEqual(undone.data,start.data);assert.equal(f.service.undoStack.length,0);const redone=f.service.redo(f.req());for(const edit of changes)assert.equal(Settings.get(redone.effective.skirmisher,edit.path),edit.value);
 assert.equal(f.service.save(f.req()).result.saved,true);assert.equal(f.commits(),1);for(const [i,text]of f.bytes().entries()){const data=JSON.parse(text),skill=data.HeroSkills.skirmisher;for(const edit of changes)assert.equal(Settings.get(skill,edit.path),edit.value);assert.deepEqual(skill.extension,{keep:i?'mirror':'primary'});assert.equal(skill.visual[i?'mirrorOnly':'extension'],i?9:'retain');assert.deepEqual(data.GameTools,JSON.parse(before[i]).GameTools);}
 assert.equal(f.service.save(f.req()).result.saved,false);assert.equal(f.commits(),1);
});

test('an unchanged or empty preview gesture preserves inherited defaults without creating history or writes',t=>{
 const f=fixture(t),before=f.bytes(),start=f.service.snapshot(),defaults=Settings.defaults('skirmisher');
 for(const changes of [[],[{path:'visual.arcDegrees',value:defaults.visual.arcDegrees},{path:'volleyRange',value:defaults.volleyRange}]]){
  const result=f.service.change(f.req({style:'skirmisher',changes}));assert.equal(result.version,start.version);assert.deepEqual(result.data,{});assert.equal(result.dirty,false);assert.equal(result.canUndo,false);
 }
 assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
});

test('invalid, duplicate or unsupported gesture fields cannot partially mutate the shared draft',t=>{
 const f=fixture(t),before=f.service.snapshot(),bytes=f.bytes(),good={path:'visual.arcDegrees',value:29};
 const invalid=[null,{},[good,{path:'volleyRange',value:0}],[good,{path:'volleyRange',value:Infinity}],[good,{path:'visual.arcDegrees',value:4}],[good,{path:'visual.castResource',value:VFX}],[good,{path:'visual.__proto__.poison',value:1}],[good,{path:'visual.futureField',value:1}],Array.from({length:33},(_,index)=>({path:'unknown'+index,value:0}))];
 for(const changes of invalid){assert.throws(()=>f.service.change(f.req({style:'skirmisher',changes})));assert.deepEqual(f.service.snapshot().data,before.data);assert.equal(f.service.version,before.version);assert.equal(f.service.undoStack.length,0);}
 assert.throws(()=>f.service.change(f.req({style:'missing',changes:[]})));assert.deepEqual(f.bytes(),bytes);assert.equal(f.commits(),0);
});

test('a stale preview gesture rejects every field and leaves the current shared draft intact',t=>{
 const f=fixture(t),stale=f.req({style:'fighter',changes:[{path:'visual.castScale',value:2},{path:'visual.castRotation',value:20}]}),bytes=f.bytes();f.change('fighter','visual.castOffsetX',9);const current=f.service.snapshot();
 assert.throws(()=>f.service.change(stale),/another panel/);assert.deepEqual(f.service.snapshot().data,current.data);assert.equal(f.service.version,current.version);assert.equal(f.service.undoStack.length,1);assert.deepEqual(f.bytes(),bytes);assert.equal(f.commits(),0);
});

test('a malformed batch container rejects before any sibling transform is materialized',t=>{
 const f=fixture(t,{HeroSkills:{fighter:{visual:'preserve-invalid-container'}}}),start=f.service.snapshot(),bytes=f.bytes();
 assert.throws(()=>f.service.change(f.req({style:'fighter',changes:[{path:'cooldown',value:15},{path:'visual.castScale',value:2}]})),/Invalid skill section/);assert.deepEqual(f.service.snapshot().data,start.data);assert.equal(f.service.version,start.version);assert.equal(f.service.undoStack.length,0);assert.deepEqual(f.bytes(),bytes);
});

test('Skirmisher descriptions use the active skill sounds while preserving ordinary basic cues without staging defaults',t=>{
 const f=fixture(t,{HeroSkills:{skirmisher:{extension:{keep:true}}}}),before=f.bytes(),sounds=require('../../assets/_script/BattleSoundCatalog').effects;
 const phases={release:'skirmisher-active-release',impact:'skirmisher-active-hit',basicRelease:'bow-arrow-release',basicImpact:'arrow-impact-flesh'};
 const assets=Object.values(phases).map((id,i)=>({id:'33333333-3333-4333-8333-33333333333'+i,bundle:'KinghtFallAudio',path:sounds[id].path}));
 f.service.catalogs={...catalogs,audio:assets};
 const description=f.service.describe({style:'skirmisher'});
 for(const [phase,id]of Object.entries(phases)){
  const sound=sounds[id],asset=assets.find(row=>row.path===sound.path);
  assert.deepEqual(description.defaultSounds[phase],{clip:asset.id,volume:sound.gain,delay:0});
 }
 assert.notEqual(description.defaultSounds.release.clip,description.defaultSounds.basicRelease.clip);
 assert.notEqual(description.defaultSounds.impact.clip,description.defaultSounds.basicImpact.clip);
 const snapshot=f.service.snapshot();assert.equal(snapshot.dirty,false);assert.equal(snapshot.canUndo,false);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
});

test('preview descriptions read the saved starting charm and never borrow maximum lifesteal or mutate gear',t=>{
 const primary={HeroEquipment:{version:1},EquipCfg:[{id:3,levelInfo:[{SecondaryStats:{bruiser:{lifeSteal:.002}}},{SecondaryStats:{bruiser:{lifeSteal:.5}}}]}]},f=fixture(t,primary),before=f.bytes();
 assert.equal(f.service.describe({style:'bruiser'}).skillSecondaryStats.lifeSteal,.002);
 assert.equal(f.service.describe({style:'fighter'}).skillSecondaryStats.lifeSteal,undefined);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
});

test('unrelated tuning edits preserve missing legacy assets and animations in both config copies',t=>{
 const visual={resource:VFX,resourceKind:'spine',resourcePath:'removed/effect',resourceAnimation:'removed-clip',animation:'removed-rider',extension:{keep:true}},audio={cast:{clip:AUDIO,bundle:'resources',path:'removed/sound'}},f=fixture(t,{HeroSkills:{mystic:{visual,audio}}},{HeroSkills:{mystic:{visual:{...visual,extension:{mirror:true}},audio}}});
 f.service.catalogs={audio:[],vfx:[]};f.change('mystic','cooldown',13);assert.equal(f.service.save(f.req()).result.saved,true);
 for(const [i,text]of f.bytes().entries()){const skill=JSON.parse(text).HeroSkills.mystic;assert.equal(skill.cooldown,13);assert.deepEqual(skill.visual,{...visual,extension:i?{mirror:true}:{keep:true}});assert.deepEqual(skill.audio,audio);}
 assert.equal(f.service.save(f.req()).result.saved,false);
});
test('all six styles expose their exact current tuning defaults without materializing any override',t=>{
 const f=fixture(t),before=f.bytes(),snapshot=f.service.load();assert.equal(snapshot.styles.length,6);assert.deepEqual(snapshot.data,{});assert.equal(snapshot.dirty,false);
 for(const style of Settings.styles){const effective=snapshot.effective[style.id];for(const [key,value]of Object.entries({...Core.DEFAULTS.common,...Core.DEFAULTS[style.id]}))assert.equal(effective[key],value);assert.equal(effective.visual.scale,1);assert.equal(effective.visual.color,'');assert.equal(effective.visual.lineWidth,0);assert.equal(effective.visual.holdTime,-1);assert.equal(effective.visual.showBuiltin,true);}
 f.service.describe({style:'mystic'});assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
});
test('no-change Save and focusing an inherited default perform no writes and add no history',t=>{
 const f=fixture(t),before=f.bytes(),version=f.service.version;
 f.change('fighter','cooldown',12);assert.equal(f.service.version,version);assert.equal(f.service.snapshot().dirty,false);assert.equal(f.service.snapshot().canUndo,false);
 assert.equal(f.service.save(f.req()).result.saved,false);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
});

test('obsolete projectile tuning remains on disk while launch settings drive the current volley',t=>{
 const original={HeroSkills:{skirmisher:{projectileOffsetY:60,projectileFromBow:false,visual:{originX:999,offsetY:800,scale:3,extension:{keep:true}}}}},f=fixture(t,original,original),before=f.bytes(),snapshot=f.service.load();assert.equal(snapshot.effective.skirmisher.visual.originX,0);assert.equal(snapshot.effective.skirmisher.visual.offsetY,0);assert.equal(snapshot.effective.skirmisher.visual.scale,1);assert.equal(snapshot.dirty,false);assert.equal(f.service.save(f.req()).result.saved,false);assert.deepEqual(f.bytes(),before);f.change('skirmisher','volleyRange',410);assert.deepEqual(f.bytes(),before);f.service.save(f.req());for(const text of f.bytes()){const skill=JSON.parse(text).HeroSkills.skirmisher;assert.equal(skill.volleyRange,410);assert.equal(skill.projectileOffsetY,60);assert.deepEqual(skill.visual,original.HeroSkills.skirmisher.visual);}
});

test('editing, undo, redo and discard stay in drafts and preserve unknown fields',t=>{
 const f=fixture(t,{HeroSkills:{fighter:{vendorFlag:{value:'retain'}}}}),before=f.bytes();
 f.change('fighter','visual.offsetX',9.5);assert.equal(f.service.snapshot().effective.fighter.visual.offsetX,9.5);assert.equal(f.service.snapshot().dirty,true);assert.equal(f.service.snapshot().canUndo,true);assert.deepEqual(f.bytes(),before);
 f.service.undo(f.req());assert.equal(f.service.snapshot().dirty,false);f.service.redo(f.req());assert.equal(f.service.snapshot().data.fighter.vendorFlag.value,'retain');
 f.service.discard(f.req());assert.equal(f.service.snapshot().dirty,false);assert.equal(f.service.snapshot().canUndo,false);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
});
test('Save publishes only edited skill fields into both copies while preserving their independent unknown data',t=>{
 const f=fixture(t,{HeroSkills:{fighter:{cooldown:11,unknown:{a:1}}}},{HeroSkills:{fighter:{cooldown:10,other:'mirror-only'},guardian:{shieldHealth:.4}},mirror:true});
 const before=f.bytes().map(JSON.parse);f.change('fighter','cooldown',18);f.change('mystic','visual.color','#aa44ff');const saved=f.service.save(f.req());assert.equal(saved.result.saved,true);assert.equal(saved.result.files.length,2);assert.equal(f.commits(),1);
 const after=f.bytes().map(JSON.parse);for(let i=0;i<2;i++){assert.deepEqual(after[i].GameTools,before[i].GameTools);assert.deepEqual(after[i].EquipCfg,before[i].EquipCfg);assert.deepEqual(after[i].untouched,before[i].untouched);assert.equal(after[i].HeroSkills.fighter.cooldown,18);assert.equal(after[i].HeroSkills.mystic.visual.color,'#aa44ff');}
 assert.deepEqual(after[0].HeroSkills.fighter.unknown,{a:1});assert.equal(after[1].HeroSkills.fighter.other,'mirror-only');assert.equal(after[1].HeroSkills.guardian.shieldHealth,.4);assert.equal(after[1].mirror,true);assert.equal(f.service.snapshot().dirty,false);
 const timestamp=fs.statSync(path.join(f.root,FILES[0])).mtimeMs;assert.equal(f.service.save(f.req()).result.saved,false);assert.equal(fs.statSync(path.join(f.root,FILES[0])).mtimeMs,timestamp);
});
test('reset removes an override and restores inheritance without deleting unknown style metadata',t=>{
 const f=fixture(t,{HeroSkills:{fighter:{cooldown:18,extension:{keep:true}}}});f.service.reset(f.req({style:'fighter',path:'cooldown'}));assert.equal(f.service.snapshot().effective.fighter.cooldown,12);assert.deepEqual(f.service.snapshot().data.fighter,{extension:{keep:true}});f.service.save(f.req());assert.deepEqual(JSON.parse(f.bytes()[0]).HeroSkills.fighter,{extension:{keep:true}});
});
test('stale draft requests cannot mutate or overwrite the current shared draft',t=>{
 const f=fixture(t),stale=f.req({style:'fighter',path:'cooldown',value:14});f.change('fighter','cooldown',13);
 for(const method of ['change','undo','redo','discard','save'])assert.throws(()=>f.service[method](stale),/draft changed/);assert.equal(f.service.snapshot().effective.fighter.cooldown,13);assert.equal(f.commits(),0);
});
test('a concurrent disk edit to either config rejects Save atomically and retains the draft',t=>{
 const f=fixture(t);f.change('vanguard','strikes',9);const primary=f.bytes()[0],second=path.join(f.root,FILES[1]);fs.appendFileSync(second,' ');
 assert.throws(()=>f.service.save(f.req()),/outside this draft/);assert.equal(f.bytes()[0],primary);assert.equal(f.service.snapshot().effective.vanguard.strikes,9);assert.equal(f.service.snapshot().dirty,true);assert.equal(f.commits(),0);
});
test('sound and VFX choices persist UUID and bundle references together; reset removes derived metadata',t=>{
 const f=fixture(t);f.change('mystic','audio.cast.clip',AUDIO);f.change('mystic','audio.cast.volume',.3);f.change('mystic','visual.resource',VFX);
 const values=f.service.snapshot().effective.mystic;assert.deepEqual(values.audio.cast,{clip:AUDIO,volume:.3,delay:0,bundle:'KinghtFallAudio',path:'cast'});assert.equal(values.visual.resourceBundle,'resources');assert.equal(values.visual.resourcePath,'vfx/burst');assert.equal(values.visual.resourceKind,'sprite');
 f.service.save(f.req());const saved=JSON.parse(f.bytes()[0]).HeroSkills.mystic;assert.equal(saved.audio.cast.path,'cast');assert.equal(saved.visual.resourceKind,'sprite');
 f.service.reset(f.req({style:'mystic',path:'visual.resource'}));assert.equal(f.service.snapshot().effective.mystic.visual.resource,'');assert.equal(f.service.snapshot().data.mystic.visual,undefined);
});
test('invalid numbers, paths, resources and unprovided clips are rejected without history or writes',t=>{
 const f=fixture(t),before=f.bytes();
 for(const [style,field,value]of [['other','cooldown',10],['fighter','__proto__.polluted',true],['vanguard','strikes',2.5],['mystic','visual.opacity',2],['bruiser','sacrifice',1],['fighter','cooldown',NaN],['mystic','visual.color','not-a-color'],['mystic','visual.resource','../secret'],['mystic','audio.cast.clip',VFX],['mystic','visual.animation','missing'],['mystic','visual.resourceAnimation','missing']])assert.throws(()=>f.change(style,field,value),undefined,field);
 assert.equal(f.service.snapshot().dirty,false);assert.equal(f.service.snapshot().canUndo,false);assert.deepEqual(f.bytes(),before);
});
test('describing a skill supplies the chosen style, current draft settings and valid VFX only',t=>{
 const f=fixture(t);f.change('mystic','visual.resource',VFX);f.change('mystic','visual.offsetY',-18);const desc=f.service.describe({style:'mystic'});assert.equal(desc.request.heroStyle,'mystic');assert.equal(desc.settings.visual.offsetY,-18);assert.equal(desc.effects[0].id,VFX);assert.equal(desc.effects[0].url,'file:///burst.png');assert.equal(f.commits(),0);
});
test('runtime resolution ignores malformed known overrides and never mutates settings or defaults',()=>{
 const config={HeroSkills:{mystic:{cooldown:-1,visual:{scale:0,color:'bad',originX:2.25},audio:{cast:{volume:4}}}}},before=JSON.stringify(config),core=JSON.stringify(Core.DEFAULTS);
 const value=Settings.effective('mystic',config);assert.equal(value.cooldown,12);assert.equal(value.visual.scale,1);assert.equal(value.visual.color,'');assert.equal(value.visual.originX,2.25);assert.equal(value.audio.cast.volume,1);assert.equal(JSON.stringify(config),before);assert.equal(JSON.stringify(Core.DEFAULTS),core);
});
test('optimistic VFX description can preview a catalog asset without staging or saving it',t=>{
 const f=fixture(t),before=f.bytes();const result=f.service.describe({style:'mystic',resource:VFX});assert.equal(result.effects[0].id,VFX);assert.equal(f.service.snapshot().effective.mystic.visual.resource,'');assert.equal(f.service.snapshot().dirty,false);assert.equal(f.service.snapshot().canUndo,false);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
 assert.equal(f.service.describe({style:'mystic',resource:''}).effects.length,0);assert.throws(()=>f.service.describe({style:'mystic',resource:AUDIO}),/existing imported VFX/);assert.throws(()=>f.service.describe({style:'mystic',resource:'../bad'}),/valid VFX/);
});
test('resetting a custom VFX removes its owned animation and metadata but retains unknown visual fields',t=>{
 const f=fixture(t,{HeroSkills:{mystic:{visual:{resource:VFX,resourceAnimation:'unused',resourceBundle:'resources',resourcePath:'vfx/burst',resourceKind:'sprite',vendorTransform:{x:9}}}}});f.service.reset(f.req({style:'mystic',path:'visual.resource'}));assert.deepEqual(f.service.snapshot().data.mystic.visual,{vendorTransform:{x:9}});assert.equal(f.service.snapshot().effective.mystic.visual.resourceAnimation,'');
});
test('an asset moving after selection is rejected without publishing and can be explicitly reselected',t=>{
 const localCatalog=structuredClone(catalogs),f=fixture(t);f.service.catalogs=localCatalog;f.service.options.catalogs=localCatalog;f.change('mystic','audio.cast.clip',AUDIO);localCatalog.audio[0].path='moved/cast';const before=f.bytes();assert.throws(()=>f.service.save(f.req()),/moved after selection/);assert.deepEqual(f.bytes(),before);assert.equal(f.service.snapshot().dirty,true);assert.equal(f.commits(),0);
 f.change('mystic','audio.cast.clip',AUDIO);assert.equal(f.service.snapshot().effective.mystic.audio.cast.path,'moved/cast');assert.equal(f.service.save(f.req()).result.saved,true);
});
test('runtime asset metadata cannot escape bundles or project-relative asset paths',()=>{
 const config={HeroSkills:{mystic:{visual:{resourceBundle:'../outside',resourcePath:'../../secret',resourceKind:'script'},audio:{cast:{bundle:'file:///outside',path:'http://bad'}}}}};const result=Settings.effective('mystic',config);assert.equal(result.visual.resourceBundle,undefined);assert.equal(result.visual.resourcePath,undefined);assert.equal(result.visual.resourceKind,undefined);assert.equal(result.audio.cast.bundle,undefined);assert.equal(result.audio.cast.path,undefined);assert.equal({}.polluted,undefined);
});
test('rider animation choices exclude horse-only and partial rider-layer clips',t=>{
 const f=fixture(t);f.service.options.describe=()=>({layers:[
  {name:'wqyl_lead_ma',animations:['idle','attack','wqyl_lead_die_idle'],json:{_heroMakerMount:{version:2}}},
  {name:'wqyl_lead_shenti',animations:['idle','attack','body_only'],json:{_heroMaker:{role:0},animations:{idle:{},attack:{events:[{name:'attack',time:.1667}]},body_only:{events:[{name:'attack',time:.2}]}}}},
  {name:'wqyl_lead_gong',animations:['idle','attack'],json:{_heroMaker:{role:4}}}
 ]});
 assert.deepEqual(Settings.riderAnimations(f.service.options.describe()),['attack']);
 assert.throws(()=>f.change('mystic','visual.animation','wqyl_lead_die_idle'),/every rider layer/);assert.throws(()=>f.change('mystic','visual.animation','body_only'),/every rider layer/);assert.equal(f.service.snapshot().dirty,false);assert.equal(f.service.snapshot().canUndo,false);
 f.change('mystic','visual.animation','attack');assert.equal(f.service.snapshot().effective.mystic.visual.animation,'attack');assert.equal(f.commits(),0);
});
test('each style exposes only presentation controls that its runtime can use',()=>{
 for(const style of Settings.styles){const fields=Settings.fields(style.id),paths=new Set(fields.visual.concat(fields.audio).map(field=>field.path));const mystic=style.id==='mystic',arrow=style.id==='skirmisher';
  for(const key of ['holdTime','targetX','targetY'])assert.equal(paths.has('visual.'+key),mystic,style.id+' '+key);
  for(const key of ['originX','originY'])assert.equal(paths.has('visual.'+key),mystic,style.id+' '+key);
  assert.equal(paths.has('visual.effectDuration'),!arrow);assert.equal(paths.has('audio.channel.clip'),mystic);assert.equal(paths.has('audio.cast.clip'),true);assert.equal(paths.has('audio.impact.clip'),true);
  assert.equal(Settings.defaults(style.id).visual.holdTime,-1,'default data shape remains stable even when a control is irrelevant');
  assert(fields.tuning.every(field=>typeof field.help==='string'&&field.help.length>10),'every numeric skill tuning field explains its units or effect');
 }
});
test('preview descriptions inherit the saved hero attack playback and whole-unit speed without writes',t=>{
 const f=fixture(t,{GameTools:{animationSpeeds:{'hero:hero:default':1.75}}}),before=f.bytes();
 f.service.options.describe=()=>({key:'hero:hero:default',layers:[]});assert.equal(f.service.describe({style:'fighter'}).skillAttackPlayback,1.75);
 f.service.options.describe=()=>({key:'hero:hero:default',layers:[],unitAnimationSpeed:.6});assert.equal(f.service.describe({style:'fighter'}).skillAttackPlayback,.6);
 f.service.options.describe=()=>({key:'hero:hero:default',layers:[],unitAnimationSpeed:0});assert.equal(f.service.describe({style:'fighter'}).skillAttackPlayback,0);
 assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
});

test('malformed mirrored or nested sections are rejected instead of replacing existing data',t=>{
 const f=fixture(t,{}, {HeroSkills:['keep this content']}),before=f.bytes();f.change('fighter','cooldown',13);assert.throws(()=>f.service.save(f.req()),/Invalid HeroSkills.*assets\/configs\/GameJsonCfg/);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);assert.equal(f.service.snapshot().dirty,true);
 const nested=fixture(t,{HeroSkills:{fighter:{visual:['keep this too']}}});assert.throws(()=>nested.change('fighter','visual.offsetX',12),/Invalid skill section/);assert.throws(()=>nested.service.reset(nested.req({style:'fighter',path:'visual.offsetX'})),/Invalid skill section/);assert.deepEqual(nested.service.data.fighter.visual,['keep this too']);
});

test('Save revalidates selected rider and VFX clips against the current assets',t=>{
 const f=fixture(t),local=structuredClone(catalogs);local.vfx[0].kind='spine';local.vfx[0].animations=['burst'];f.service.options.catalogs=f.service.catalogs=local;
 f.change('mystic','visual.resource',VFX);f.change('mystic','visual.resourceAnimation','burst');const before=f.bytes();local.vfx[0].animations=['new-burst'];assert.throws(()=>f.service.save(f.req()),/VFX animation.*no longer available/);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
 f.change('mystic','visual.resourceAnimation','new-burst');f.change('mystic','visual.animation','attack_mystic');f.service.options.describe=()=>({layers:[{animations:['idle'],json:{animations:{idle:{}}}}]});assert.throws(()=>f.service.save(f.req()),/authored attack animation.*every rider layer/);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
});

test('flipbook selection publishes derived frame metadata atomically and detects a changed sheet layout',t=>{
 const f=fixture(t,{HeroSkills:{mystic:{visual:{extension:{keep:true}}}}}),local=structuredClone(catalogs);local.vfx[0].flipbook={frames:32,columns:8,cell:128,fps:24,loop:false};f.service.options.catalogs=f.service.catalogs=local;
 f.change('mystic','visual.resource',VFX);assert.deepEqual(Settings.flipbook(f.service.snapshot().effective.mystic.visual),local.vfx[0].flipbook);const before=f.bytes();local.vfx[0].flipbook.fps=30;
 assert.throws(()=>f.service.save(f.req()),/layout changed/);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
 f.change('mystic','visual.resource',VFX);f.service.save(f.req());for(const file of f.bytes())assert.equal(JSON.parse(file).HeroSkills.mystic.visual.resourceFps,30);
 f.service.reset(f.req({style:'mystic',path:'visual.resource'}));assert.deepEqual(f.service.snapshot().data.mystic.visual,{extension:{keep:true}});assert.equal(Settings.flipbook(f.service.snapshot().effective.mystic.visual),null);
 delete local.vfx[0].flipbook;f.change('mystic','visual.resource',VFX);assert.equal(f.service.snapshot().effective.mystic.visual.resourceFrames,undefined);
});

test('flipbook metadata is optional, complete and bounded without exposing imported atlas fields as editable settings',()=>{
 const v={resourceFrames:32,resourceColumns:8,resourceCell:128,resourceFps:24,resourceLoop:false};assert.deepEqual(Settings.flipbook(v),{frames:32,columns:8,cell:128,fps:24,loop:false});
 for(const invalid of [{resourceFrames:Infinity},{resourceColumns:0},{resourceCell:1.5},{resourceFps:0},{resourceLoop:'false'}])assert.equal(Settings.flipbook({...v,...invalid}),null);
 assert.equal(Settings.flipbook({resourceFrames:32}),null);assert.equal(Settings.defaults('mystic').visual.resourceFrames,undefined);assert(!Settings.descriptors('mystic').some(field=>/resourceFrames/.test(field.path)));
 const before=JSON.stringify(v),effective=Settings.effective('mystic',{HeroSkills:{mystic:{visual:v}}});assert.equal(effective.visual.resourceFrames,32);assert.equal(JSON.stringify(v),before);
});

test('static VFX selection clears asymmetric owned layouts from both config copies and preserves extensions',t=>{
 const stale={resource:VFX,resourceBundle:'resources',resourcePath:'old/sheet',resourceKind:'sprite',resourceAnimation:'old-burst',resourceFrames:12,resourceColumns:4,resourceCell:64,resourceFps:12,resourceLoop:true};
 for(const primaryHadSheet of [false,true]){
  const f=fixture(t,{HeroSkills:{mystic:{visual:{...(primaryHadSheet?stale:{}),extension:{primary:true}}}}},{HeroSkills:{mystic:{visual:{...stale,extension:{mirror:true}},mirrorOnly:'keep'}}});
  f.change('mystic','visual.resource',VFX);assert.equal(f.service.save(f.req()).result.saved,true);
  for(const [index,file]of f.bytes().entries()){const config=JSON.parse(file),v=config.HeroSkills.mystic.visual;assert.equal(v.resource,VFX);assert.equal(v.resourcePath,'vfx/burst');assert.equal(v.resourceKind,'sprite');assert.equal(v.resourceAnimation,primaryHadSheet?'':undefined);assert.equal(Settings.flipbook(v),null);for(const key of ['Frames','Columns','Cell','Fps','Loop'])assert.equal(v['resource'+key],undefined);assert.deepEqual(v.extension,index?{mirror:true}:{primary:true});if(index)assert.equal(config.HeroSkills.mystic.mirrorOnly,'keep');}
  const before=f.bytes();assert.equal(f.service.save(f.req()).result.saved,false);assert.deepEqual(f.bytes(),before);
 }
});

test('VFX reset removes known resource metadata from every copy without touching independent fields',t=>{
 const f=fixture(t,{HeroSkills:{mystic:{visual:{resource:VFX,extension:{primary:true}}}}},{HeroSkills:{mystic:{visual:{resource:VFX,resourceBundle:'resources',resourcePath:'old/sheet',resourceKind:'spine',resourceAnimation:'old',resourceFrames:12,resourceColumns:4,resourceCell:64,resourceFps:12,resourceLoop:true,extension:{mirror:true},offsetX:27},mirrorOnly:'retain'}}});
 f.service.reset(f.req({style:'mystic',path:'visual.resource'}));f.service.save(f.req());
 const [a,b]=f.bytes().map(JSON.parse);assert.deepEqual(a.HeroSkills.mystic.visual,{extension:{primary:true}});assert.deepEqual(b.HeroSkills.mystic.visual,{extension:{mirror:true},offsetX:27});assert.equal(b.HeroSkills.mystic.mirrorOnly,'retain');
});

test('an unrelated skill edit does not normalize a mirror resource layout',t=>{
 const mirror={resource:VFX,resourceFrames:12,resourceColumns:4,resourceCell:64,resourceFps:12,resourceLoop:true,extension:'retain'},f=fixture(t,{}, {HeroSkills:{mystic:{visual:mirror}}});
 f.change('mystic','cooldown',13);f.service.save(f.req());assert.deepEqual(JSON.parse(f.bytes()[1]).HeroSkills.mystic.visual,mirror);
});

test('the imported VFX catalog retains Toon and Fantasy flipbook animation metadata',()=>{
 const root=path.resolve(__dirname,'../..'),catalog=require('../../packages/hkd-skills/catalog').index(root),manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/projectiles/catalog.json'),'utf8'));
 for(const name of ['projectiles/toon/flash-1','unit-library/fantasy-bosses/Effects/arcane-impact']){const authored=manifest.assets.find(row=>row.resource===name),asset=catalog.vfx.find(row=>row.path===name);assert(asset);assert.equal(asset.kind,'sprite');assert.deepEqual(asset.flipbook,{frames:authored.frames,columns:authored.columns,cell:authored.cell,fps:authored.fps,loop:!!authored.loop});}
});

test('preview ordinary windups use the saved gold timing and never rewrite either timing table',t=>{
 const f=fixture(t,{GameTools:{timingDefaults:{'hero:hero:default':{attack:.1667}},timings:{'hero:hero:default':{attack:.25}},animationSpeeds:{'hero:hero:default':.5}}}),before=f.bytes();f.service.options.describe=()=>({key:'hero:hero:default',layers:[]});
 assert.equal(f.service.describe({style:'fighter'}).skillBasicImpactDelay,.5);delete f.service.saved[0].config.GameTools.timings['hero:hero:default'];assert.equal(f.service.describe({style:'fighter'}).skillBasicImpactDelay,.3334);
 f.service.saved[0].config.GameTools.timings['hero:hero:default']={attack:0};assert.equal(f.service.describe({style:'fighter'}).skillBasicImpactDelay,0);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
});

test('the Skills preview sizes all mounted hero layers in battle units', () => {
 const root = path.resolve(__dirname, '../..');
 const units = require('../../packages/game-data-editor/lib/unit-assets');
 const service = new SkillService(root, { catalogs });
 const detached = units.describe(root, { type: 'hero', heroStyle: 'bruiser', noRuntime: true, noShared: true });
 const preview = service.describe({ style: 'bruiser', noRuntime: true });
 const game = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'), 'utf8'));
 const actor = game.find(row => row.ctrPlayAni && row.ctrHp);
 const animation = game[actor.ctrPlayAni.__id__];
 const [, , , , , , , scaleX, scaleY] = game[animation.node.__id__]._trs.array;

 assert(preview.layers.some(layer => layer.name === 'wqyl_lead_ma'));
 assert.deepEqual(preview.layers.map(layer => layer.uuid), detached.layers.map(layer => layer.uuid));
 preview.layers.forEach((layer, i) => {
  const source = detached.layers[i];
  assert(Math.abs(layer.scaleX - source.scaleX * scaleX) < 1e-9, layer.name);
  assert(Math.abs(layer.scaleY - source.scaleY * scaleY) < 1e-9, layer.name);
  assert(Math.abs(layer.x - source.x * scaleX) < 1e-9, layer.name);
  assert(Math.abs(layer.y - source.y * scaleY) < 1e-9, layer.name);
 });
 assert.equal(preview.settings.visual.passiveScale, service.snapshot().effective.bruiser.visual.passiveScale);
 assert.equal(service.dirty(), false);
});

test('every hero preview uses the real gameplay HP-controller body anchor without publishing drafts',t=>{
 const f=fixture(t),before=f.bytes(),relative='assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab',real=fs.readFileSync(path.resolve(__dirname,'../..',relative)),prefab=JSON.parse(real),actor=prefab.find(row=>row&&row.ctrPlayAni&&row.ctrHp&&row.node),hp=prefab[actor.ctrHp.__id__];
 assert(hp.node);let node=prefab[hp.node.__id__],x=0,y=0;
 // Independently walk the actual planar node chain used by convertToWorldSpaceAR.
 while(node!==prefab[actor.node.__id__]){assert(node);const t=node._trs&&node._trs.array||[0,0,0,0,0,0,1,1,1,1],r=2*Math.atan2(t[5],t[6]),px=x*t[7],py=y*t[8];x=t[0]+px*Math.cos(r)-py*Math.sin(r);y=t[1]+px*Math.sin(r)+py*Math.cos(r);node=prefab[node._parent.__id__];}
 const expected={x:x*.55,y:y*.55};assert(Math.abs(expected.y-53.5161)<1e-7);const file=path.join(f.root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,real);
 f.service.options.describe=()=>({source:'assets/KinghtFallEnemyAni/ndPlay.prefab',layers:[]});for(const style of Settings.styles)assert.deepEqual(f.service.describe({style:style.id}).skillHeroBodyOffset,expected,style.id);
 assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);assert.equal(f.service.snapshot().dirty,false);assert(fs.readFileSync(file).equals(real));
});

test('hero body anchors retain description-prefab fallback when no gameplay controller prefab is available',t=>{
 const f=fixture(t),before=f.bytes(),source='assets/fixture/body.prefab',file=path.join(f.root,source),prefab=[{__type__:'cc.Node'},{__type__:'cc.Node',_parent:{__id__:0},_trs:{array:[10,20,0,0,0,Math.SQRT1_2,Math.SQRT1_2,2,3,1]}},{__type__:'cc.Node',_parent:{__id__:1},_trs:{array:[4,5,0,0,0,0,1,1,1,1]}},{node:{__id__:0},ndHp:{__id__:2}}];
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(prefab));f.service.options.describe=()=>({source,layers:[]});const result=f.service.describe({style:'fighter'}).skillHeroBodyOffset;assert(Math.abs(result.x+2.75)<1e-10);assert(Math.abs(result.y-15.4)<1e-10);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
});

test('an event on an otherwise common non-attack clip is not offered as an owned rider attack',()=>{
 const json={_heroMaker:{role:0},animations:{attack:{events:[{name:'attack',time:.2}]},cast_pose:{events:[{name:'attack',time:.2}]}}};assert.deepEqual(Settings.riderAnimations({layers:[{json}]}),['attack']);
});

test('sound selection synchronizes each whole identity across asymmetric mirrors while retaining independent fields',t=>{
 for(const phase of ['cast','impact','channel','explosion']){
  const f=fixture(t,{HeroSkills:{mystic:{audio:{[phase]:{clip:'33333333-3333-4333-8333-333333333333',bundle:'KinghtFallAudio',path:'old',volume:.3,extension:'primary'}}}}},{HeroSkills:{mystic:{audio:{[phase]:{clip:'44444444-4444-4444-8444-444444444444',bundle:'resources',path:'sfx/old',volume:.7,delay:2,extension:'mirror'},other:{keep:true}}}}});
  f.change('mystic','audio.'+phase+'.clip',AUDIO);f.service.save(f.req());
  for(const [i,doc]of f.bytes().map(JSON.parse).entries()){const value=doc.HeroSkills.mystic.audio[phase];assert.equal(value.clip,AUDIO);assert.equal(value.bundle,'KinghtFallAudio');assert.equal(value.path,'cast');assert.equal(value.volume,i?.7:.3);assert.equal(value.extension,i?'mirror':'primary');if(i){assert.equal(value.delay,2);assert.deepEqual(doc.HeroSkills.mystic.audio.other,{keep:true});}}
  const before=f.bytes();assert.equal(f.service.save(f.req()).result.saved,false);assert.deepEqual(f.bytes(),before);
 }
});

test('sound reset removes its complete identity from mirrors but unrelated edits preserve mirror sound settings',t=>{
 for(const phase of ['cast','impact','channel','explosion']){
  const f=fixture(t,{HeroSkills:{mystic:{audio:{[phase]:{clip:AUDIO,extension:'primary'}}}}},{HeroSkills:{mystic:{audio:{[phase]:{clip:AUDIO,bundle:'resources',path:'old',volume:.4,delay:1,extension:'mirror'}}}}});
  f.service.reset(f.req({style:'mystic',path:'audio.'+phase+'.clip'}));f.service.save(f.req());assert.deepEqual(JSON.parse(f.bytes()[1]).HeroSkills.mystic.audio[phase],{volume:.4,delay:1,extension:'mirror'});
 }
 const mirror={clip:AUDIO,bundle:'resources',path:'different',volume:.4,delay:1,extension:'retain'},f=fixture(t,{}, {HeroSkills:{mystic:{audio:{cast:mirror}}}});f.change('mystic','cooldown',13);f.service.save(f.req());assert.deepEqual(JSON.parse(f.bytes()[1]).HeroSkills.mystic.audio.cast,mirror);
});


test('explicit custom VFX selection clears an incompatible inherited native animation without publishing or breaking a valid explicit choice',t=>{
 const f=fixture(t),before=f.bytes(),id='aaaa0000-0000-4000-8000-000000000081',asset={id,uuid:id,kind:'spine',file:'assets/resources/vfx/custom-burst.json',bundle:'resources',path:'vfx/custom-burst',animations:['CustomBurst','CustomLoop']};
 fs.mkdirSync(path.dirname(path.join(f.root,asset.file)),{recursive:true});fs.writeFileSync(path.join(f.root,asset.file),JSON.stringify({skins:[],animations:{CustomBurst:{},CustomLoop:{}}}));fs.writeFileSync(path.join(f.root,asset.file.replace('.json','.atlas')),'');f.service.catalogs={...f.service.catalogs,vfx:[...f.service.catalogs.vfx,asset]};
 assert.equal(f.service.snapshot().effective.mystic.visual.castResourceAnimation,'animation');f.change('mystic','visual.castResource',id);assert.equal(f.service.data.mystic.visual.castResourceAnimation,'');assert.equal(f.service.snapshot().effective.mystic.visual.castResourceAnimation,'');assert.equal(f.service.describe({style:'mystic'}).settings.visual.castResourceAnimation,'');assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
 f.service.undo(f.req());assert.equal(f.service.snapshot().effective.mystic.visual.castResourceAnimation,'animation');f.service.redo(f.req());assert.equal(f.service.snapshot().effective.mystic.visual.castResourceAnimation,'');
 f.change('mystic','visual.castResourceAnimation','CustomBurst');const version=f.service.version;f.change('mystic','visual.castResource',id);assert.equal(f.service.snapshot().effective.mystic.visual.castResourceAnimation,'CustomBurst');assert.equal(f.service.version,version);assert.deepEqual(f.bytes(),before);
 f.service.save(f.req());for(const text of f.bytes())assert.equal(JSON.parse(text).HeroSkills.mystic.visual.castResourceAnimation,'CustomBurst');
});
