'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {SkillService,FILES}=require('../../packages/hkd-skills/service'),Settings=require('../../assets/_script/HeroSkillSettings'),Core=require('../../assets/_script/HeroStyleSkills');
const AUDIO='11111111-1111-4111-8111-111111111111',VFX='22222222-2222-4222-8222-222222222222';
const catalogs={audio:[{id:AUDIO,uuid:AUDIO,file:'assets/KinghtFallAudio/cast.wav',bundle:'KinghtFallAudio',path:'cast',url:'file:///cast.wav'}],vfx:[{id:VFX,uuid:VFX,file:'assets/resources/vfx/burst.png',bundle:'resources',path:'vfx/burst',kind:'sprite',url:'file:///burst.png'}]};
function fixture(t,primary={},secondary={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-skill-editor-'));
 t.after(()=>{const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert(path.basename(resolved).startsWith('hkd-skill-editor-'));fs.rmSync(resolved,{recursive:true,force:true});});
 for(const [i,file]of FILES.entries()){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({version:7,GameTools:{timingDefaults:{'hero:hero:default':{attack:.1667}},timings:{'hero:hero:default':{attack:.2}}},EquipCfg:[{id:3,unknown:'keep'}],untouched:{spelling:'Original',number:3.75},...(i?secondary:primary)},null,2)+'\n');}
 let commits=0;
 const service=new SkillService(root,{catalogs,describe:(_root,request)=>({layers:[{animations:['idle','move','attack','attack_mystic']}],runtimePath:'safe-spine-runtime',request}),commit:(...args)=>{commits++;return require('../../packages/hkd-characters/lib/asset-transaction').commit(...args);}});
 const bytes=()=>FILES.map(file=>fs.readFileSync(path.join(root,file),'utf8'));
 const req=extra=>({version:service.version,revision:service.revision,...extra});
 const change=(style,field,value)=>service.change(req({style,path:field,value}));
 return {root,service,bytes,req,change,commits:()=>commits};
}
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
  {name:'wqyl_lead_shenti',animations:['idle','attack','body_only'],json:{_heroMaker:{role:0}}},
  {name:'wqyl_lead_gong',animations:['idle','attack'],json:{_heroMaker:{role:4}}}
 ]});
 assert.deepEqual(Settings.riderAnimations(f.service.options.describe()),['idle','attack']);
 assert.throws(()=>f.change('mystic','visual.animation','wqyl_lead_die_idle'),/every rider layer/);assert.throws(()=>f.change('mystic','visual.animation','body_only'),/every rider layer/);assert.equal(f.service.snapshot().dirty,false);assert.equal(f.service.snapshot().canUndo,false);
 f.change('mystic','visual.animation','attack');assert.equal(f.service.snapshot().effective.mystic.visual.animation,'attack');assert.equal(f.commits(),0);
});
test('each style exposes only presentation controls that its runtime can use',()=>{
 for(const style of Settings.styles){const fields=Settings.fields(style.id),paths=new Set(fields.visual.concat(fields.audio).map(field=>field.path));const mystic=style.id==='mystic',arrow=style.id==='skirmisher';
  for(const key of ['holdTime','targetX','targetY'])assert.equal(paths.has('visual.'+key),mystic,style.id+' '+key);
  for(const key of ['originX','originY'])assert.equal(paths.has('visual.'+key),mystic||arrow,style.id+' '+key);
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
