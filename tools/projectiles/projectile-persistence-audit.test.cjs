'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),{ProjectilesService}=require('../../packages/hkd-projectiles/service');
function fixture(t,edit){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-projectile-persistence-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  for(const name of ['assets/resources/projectiles/catalog.json','assets/resources/localization/catalog.json','assets/KinghtFallConfig/GameJsonCfg.json']){
    const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,name),target);
  }
  const config=path.join(dir,'assets/KinghtFallConfig/GameJsonCfg.json'),catalog=path.join(dir,'assets/resources/projectiles/catalog.json');
  if(edit){const data=JSON.parse(fs.readFileSync(config)),library=JSON.parse(fs.readFileSync(catalog));edit(data,library);fs.writeFileSync(config,JSON.stringify(data));fs.writeFileSync(catalog,JSON.stringify(library));}
  return{dir,config,catalog,service:new ProjectilesService(dir)};
}
test('malformed explicit timings preview their live zero delay, stay read-only, and can be explicitly reset',t=>{
  for(const custom of [null,{},'old-time',17,['old-time'],{attack:-1},{attack:'0.8'},{attack:null,future:{keep:true}}]){
    const f=fixture(t,data=>{data.GameTools.timingDefaults['hero:hero:default']={attack:.7};data.GameTools.timings['hero:hero:default']=custom;});
    const before=fs.readFileSync(f.config),s=f.service.load();
    assert.equal(require('../../packages/game-data-editor/lib/attack-profile').describe({},JSON.parse(before).GameTools,{type:'hero'}).hitTime,0);
    assert.equal(s.units.find(unit=>unit.key==='hero').launchDelay,0,'preview matches the live malformed override');
    assert.equal(s.timings.hero,0,'an explicit invalid override remains resettable');
    assert.equal(f.service.save({version:s.version}).result.saved,false);assert.deepEqual(fs.readFileSync(f.config),before);
    delete s.timings.hero;f.service.change({version:s.version,data:s.data,timings:s.timings});
    assert.equal(f.service.load().units.find(unit=>unit.key==='hero').launchDelay,.7);
    f.service.save({version:f.service.version});const saved=JSON.parse(fs.readFileSync(f.config));
    assert.deepEqual(saved.GameTools.timings['hero:hero:default'],custom&&custom.future?{future:{keep:true},inherit:true}:undefined);
    assert.equal(f.service.load().units.find(unit=>unit.key==='hero').launchDelay,.7);
  }
});
test('malformed tier delay suppresses shared timing until Reset explicitly restores inheritance',t=>{
  const f=fixture(t,(_data,catalog)=>{catalog.assignments.tower={launchDelay:.45};catalog.assignments['tower:2:1']={launchDelay:'old-value',future:7};});
  const before=fs.readFileSync(f.catalog),s=f.service.load();assert.equal(s.units.find(unit=>unit.key==='tower:2:1').launchDelay,0);
  assert.equal(f.service.save({version:s.version}).result.saved,false);assert.deepEqual(fs.readFileSync(f.catalog),before);
  delete s.timings['tower:2:1'];f.service.change({version:s.version,data:s.data,timings:s.timings});assert.equal(f.service.load().units.find(unit=>unit.key==='tower:2:1').launchDelay,.45);
  f.service.save({version:f.service.version});assert.deepEqual(f.service.data.assignments['tower:2:1'],{future:7});assert.equal(f.service.load().units.find(unit=>unit.key==='tower:2:1').launchDelay,.45);
});
test('trail-only edits preserve hidden legacy artwork fields while genuinely changed invalid fields are rejected',t=>{
  const legacy={flight:'legacy-flight',launch:'legacy-launch',impact:'legacy-impact',size:900,rotation:725,tint:'old-tint',set:'legacy-set',future:{keep:true}};
  const f=fixture(t,(_data,catalog)=>{catalog.assignments.hero=legacy;});
  const config=fs.readFileSync(f.config),s=f.service.load();s.data.assignments.hero.trail=s.data.trails[0].id;
  f.service.change({version:s.version,data:s.data,timings:s.timings});f.service.save({version:f.service.version});
  assert.deepEqual(f.service.data.assignments.hero,{...legacy,trail:s.data.trails[0].id});assert.deepEqual(fs.readFileSync(f.config),config);
  for(const [field,value]of [['flight','new-missing'],['launch','new-missing'],['impact','new-missing'],['size',901],['rotation',726],['tint','invalid-new'],['set','new-missing'],['trail','new-missing']]){
    const draft=f.service.load();draft.data.assignments.hero[field]=value;assert.throws(()=>f.service.change({version:draft.version,data:draft.data,timings:draft.timings}),undefined,field+' is a real invalid edit');
  }
});
test('malformed timing containers cannot report a saved launch delay that JSON cannot persist',t=>{
  for(const mutate of [data=>data.GameTools=[],data=>data.GameTools=null,data=>data.GameTools.timings=[],data=>data.GameTools.timings=null,data=>data.GameTools.timings='old-value']){
    const f=fixture(t,mutate),before=fs.readFileSync(f.config),s=f.service.load();
    assert.equal(f.service.save({version:s.version}).result.saved,false);assert.deepEqual(fs.readFileSync(f.config),before);
    assert.throws(()=>f.service.change({version:s.version,data:s.data,timings:{...s.timings,hero:.8}}),/invalid format/);
    assert.equal(f.service.load().dirty,false);assert.deepEqual(fs.readFileSync(f.config),before);
    const art=f.service.load();art.data.assignments.hero={flight:art.data.assets[0].id};f.service.change({version:art.version,data:art.data,timings:art.timings});f.service.save({version:f.service.version});
    assert.deepEqual(fs.readFileSync(f.config),before,'unrelated artwork saves preserve the legacy timing container');
  }
});
test('building preview retains configured per-tier speed after its generic projectile prefab is inspected',t=>{
  const f=fixture(t),s=f.service.load();
  // defaultTrail reads this speed from the shared shot prefab in a real project.
  // That authored fallback belongs to characters; tower tiers have gameplay data.
  f.service.shotSpeeds.set('building:1',550);f.service.shotSpeeds.set('building:2',550);
  const inspected=f.service.units();
  for(const key of Object.keys(s.speeds))assert.equal(inspected.find(unit=>unit.key===key).speed,s.speeds[key],key);
  const changed={...s.speeds,'tower:2:4':725};f.service.change({version:s.version,data:s.data,speeds:changed,timings:s.timings});
  assert.equal(f.service.load().units.find(unit=>unit.key==='tower:2:4').speed,725);
});
test('edited artwork roles reject non-ID values instead of silently saving false or zero as projectiles',t=>{
  const f=fixture(t),s=f.service.load();
  for(const field of ['flight','launch','impact'])for(const value of [0,false,null,{},[]]){
    const data=structuredClone(s.data);data.assignments.hero={[field]:value};
    assert.throws(()=>f.service.change({version:s.version,data,timings:s.timings}),/valid projectile asset/,field+' '+JSON.stringify(value));
    assert.equal(f.service.load().dirty,false);
  }
  const data=structuredClone(s.data);data.assignments.hero={flight:'',launch:'',impact:''};
  f.service.change({version:s.version,data,timings:s.timings});assert.deepEqual(f.service.data.assignments.hero,data.assignments.hero,'empty IDs remain the explicit no-effect representation');
});

test('malformed assignment containers are rejected without losing the current draft',t=>{
  const f=fixture(t),s=f.service.load(),before=fs.readFileSync(f.catalog);
  for(const assignments of [42,true,'old-value',[],null]){
    assert.throws(()=>f.service.change({version:s.version,data:{...s.data,assignments},timings:s.timings}),/Invalid projectile catalog/);
    assert.equal(f.service.version,s.version);assert.equal(f.service.dirty(),false);assert.deepEqual(fs.readFileSync(f.catalog),before);
  }
});

test('projectile launch edits and reset survive a later unrelated managed-profile edit',t=>{
  const id=99001,key='enemy:'+id+':default';
  const f=fixture(t,data=>{
    data.SoldierCfg[id]={...data.SoldierCfg[90003],ID:id,BehaviorTemplate:90003};
    data.GameTools.timingDefaults[key]={attack:.4};data.GameTools.timings[key]={attack:.6,future:{keep:true}};
    data.GameTools.unitProfiles={version:1,nextId:100000,entries:{[id]:{baseId:90003,name:'Timing audit',stats:{},visual:{},timing:{saved:{attack:.4},custom:{attack:.6,future:{keep:true}},future:'timing metadata'}}}};
  });
  const s=f.service.load();s.timings['enemy:'+id]=.9;f.service.change({version:s.version,data:s.data,timings:s.timings});f.service.save({version:f.service.version});
  const Profiles=require('../../packages/game-data-editor/lib/unit-profiles'),data=JSON.parse(fs.readFileSync(f.config)),state={A:data,overrides:structuredClone(data.GameTools)};
  assert.equal(state.overrides.unitProfiles.entries[id].timing.future,'timing metadata');
  const next=structuredClone(state);next.A.SoldierCfg[90001].Health+=1;Profiles.reconcile(state,next);
  assert.deepEqual(next.overrides.timings[key],{attack:.9,future:{keep:true}});
  assert.deepEqual(next.overrides.timingDefaults[key],{attack:.4});
  const reset=f.service.load();delete reset.timings['enemy:'+id];f.service.change({version:reset.version,data:reset.data,timings:reset.timings});f.service.save({version:f.service.version});
  const saved=JSON.parse(fs.readFileSync(f.config)),after={A:saved,overrides:structuredClone(saved.GameTools)};Profiles.materialize(after);
  assert.deepEqual(after.overrides.timings[key],{future:{keep:true},inherit:true});
  assert.deepEqual(after.overrides.timingDefaults[key],{attack:.4});
});

test('explicit managed-profile delay edits do not repair malformed legacy profile timing',t=>{
  for(const timing of [null,[],42,'legacy']){
    const f=fixture(t,data=>{data.GameTools.unitProfiles={version:1,nextId:100000,entries:{90003:{baseId:90001,name:'Legacy profile',timing}}};}),s=f.service.load(),before=fs.readFileSync(f.config);
    assert.throws(()=>f.service.change({version:s.version,data:s.data,timings:{...s.timings,'enemy:90003':.9}}),/profile timing has an invalid format/);
    assert.equal(f.service.dirty(),false);assert.deepEqual(fs.readFileSync(f.config),before);
  }
});

test('catalog-shaped static delay edits preview immediately and cannot conflict with panel timing drafts',t=>{
  const f=fixture(t),s=f.service.load(),key='tower:2:1';s.data.assignments[key]={...(s.data.assignments[key]||{}),launchDelay:.73,future:{keep:true}};
  assert.throws(()=>f.service.change({version:s.version,data:s.data,timings:{...s.timings,[key]:.81}}),/Conflicting launch delay/);assert.equal(f.service.dirty(),false);
  const changed=f.service.change({version:s.version,data:s.data});assert.equal(changed.units.find(unit=>unit.key===key).launchDelay,.73);assert.equal(changed.timings[key],.73);
  f.service.save({version:changed.version});const saved=f.service.load();delete saved.data.assignments[key].launchDelay;
  const reset=f.service.change({version:saved.version,data:saved.data});assert.equal(reset.timings[key],undefined);assert.equal(reset.units.find(unit=>unit.key===key).launchDelay,reset.units.find(unit=>unit.key===key).defaultDelay);
  f.service.save({version:reset.version});assert.deepEqual(f.service.data.assignments[key].future,{keep:true});assert.equal(f.service.data.assignments[key].launchDelay,undefined);
});

test('UTF-8 BOMs remain intact in read-only loading and explicit projectile saves',t=>{
  const f=fixture(t);
  for(const file of [f.config,f.catalog,path.join(f.dir,'assets/resources/localization/catalog.json')])fs.writeFileSync(file,'\uFEFF'+fs.readFileSync(file,'utf8'));
  const config=fs.readFileSync(f.config),catalog=fs.readFileSync(f.catalog);f.service.reload();const s=f.service.load();
  assert.equal(f.service.save({version:s.version}).result.saved,false);assert.deepEqual(fs.readFileSync(f.config),config);assert.deepEqual(fs.readFileSync(f.catalog),catalog);
  s.data.assignments.hero={flight:s.data.assets[0].id};f.service.change({version:s.version,data:s.data,timings:s.timings});f.service.save({version:f.service.version});
  assert.equal(fs.readFileSync(f.catalog,'utf8').charCodeAt(0),0xfeff);assert.deepEqual(fs.readFileSync(f.config),config);
});

test('roster snapshots cache model defaults and translations while adopting external translation revisions',t=>{
  const f=fixture(t),file=path.join(f.dir,'assets/resources/localization/catalog.json'),s=f.service.load(),Units=require('../../packages/game-data-editor/lib/unit-assets');
  const original=Units.describe,read=fs.readFileSync;let descriptions=0,translationReads=0;
  Units.describe=function(...args){descriptions++;return original.apply(this,args);};
  fs.readFileSync=function(name,...args){if(name===file)translationReads++;return read.call(this,name,...args);};
  try{
    const before=structuredClone(f.service.configData);f.service.units();f.service.snapshot();f.service.validate(s.data);
    assert.equal(descriptions,0,'unchanged roster does not rescan model/prefab defaults');assert.equal(translationReads,0,'unchanged translations are not parsed repeatedly');assert.deepEqual(f.service.configData,before,'roster construction never mutates the config');
    const config=JSON.parse(read(f.config,'utf8')),name=config.SoldierCfg[90003].Name,key=/\[\[loc:([^\]]+)\]\]/.exec(name)[1],translations=JSON.parse(read(file,'utf8'));translations.entries[key].en='Revised roster label';fs.writeFileSync(file,JSON.stringify(translations)+'\n');
    assert.match(f.service.units().find(unit=>unit.key==='enemy:90003').name,/Revised roster label/);assert.equal(translationReads,1);
  }finally{Units.describe=original;fs.readFileSync=read;}
});

test('explicit Reload resolves repaired portrait metadata, shot prefabs and model defaults without losing drafts',t=>{
  const f=fixture(t),initial=f.service.load(),before=fs.readFileSync(f.config),enemy=initial.units.find(unit=>unit.key==='enemy:90003'),boss=initial.units.find(unit=>unit.key==='enemy:94001');
  assert.equal(enemy.portrait,null);assert.equal(enemy.speed,500);
  initial.data.assignments.hero={flight:initial.data.assets[0].id};f.service.change({version:initial.version,data:initial.data,timings:initial.timings});
  function write(relative,value){const file=path.join(f.dir,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}
  const portrait='assets/resources/icons/enemy-heads/carnivorous-plant.png';for(const suffix of ['', '.meta']){const target=path.join(f.dir,portrait+suffix);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,portrait+suffix),target);}
  const config=f.service.config(),record=config.SoldierCfg[90003],bossRecord=config.SoldierCfg[94001];
  write('assets/KinghtFallEnemy/'+record.prefab+'.prefab',JSON.stringify([{ctrArr:{__id__:1}},{speed:825,node:{__id__:2}},{_children:[]}]));
  write('assets/KinghtFallEnemy/'+bossRecord.prefab+'.prefab',JSON.stringify([{__type__:'cc.Node',_name:'Audit model',_children:[]},{__type__:'sp.Skeleton',_N$skeletonData:{__uuid__:'audit-model-repair'},node:{__id__:0}}]));
  write('assets/audit-model.json.meta',JSON.stringify({uuid:'audit-model-repair'}));
  write('assets/audit-model.json',JSON.stringify({skins:[{name:'default'}],animations:{attack:{}},_fantasy:{effects:{projectile:{flight:initial.data.assets[0].id,size:84}}}}));write('assets/audit-model.atlas','');
  assert.equal(f.service.units().find(unit=>unit.key===enemy.key).portrait,null,'ordinary draft snapshots use cached assets');
  const version=f.service.version,reloaded=f.service.load();assert.equal(reloaded.version,version);assert.equal(reloaded.dirty,true);assert.equal(reloaded.data.assignments.hero.flight,initial.data.assets[0].id);
  assert.equal(reloaded.units.find(unit=>unit.key===enemy.key).portrait,portrait);assert.equal(reloaded.units.find(unit=>unit.key===enemy.key).speed,825);
  assert.equal(reloaded.units.find(unit=>unit.key===boss.key).defaultFlight,initial.data.assets[0].id);assert.equal(reloaded.units.find(unit=>unit.key===boss.key).defaultSize,84);
  assert.deepEqual(fs.readFileSync(f.config),before);
});

test('a failed mixed-file save rolls back earlier publications and retains the draft',t=>{
  const f=fixture(t),catalog=fs.readFileSync(f.catalog),config=fs.readFileSync(f.config),s=f.service.load();
  s.data.assignments.hero={flight:s.data.assets[0].id};s.timings.hero=.923;f.service.change({version:s.version,data:s.data,timings:s.timings});
  const rename=fs.renameSync;fs.renameSync=function(from,to){if(to===f.config)throw Error('Audit fixture publication failure');return rename.call(this,from,to);};
  try{assert.throws(()=>f.service.save({version:f.service.version}),/publication failure/);}finally{fs.renameSync=rename;}
  assert.deepEqual(fs.readFileSync(f.catalog),catalog);assert.deepEqual(fs.readFileSync(f.config),config);assert.equal(f.service.dirty(),true);assert.equal(f.service.timings.hero,.923);
});

test('rollback of a failed mixed-file save preserves a concurrent edit after publication',t=>{
  const f=fixture(t),config=fs.readFileSync(f.config),s=f.service.load(),external=Buffer.from(JSON.stringify({...s.data,externalEdit:'retain'}));
  s.data.assignments.hero={flight:s.data.assets[0].id};s.timings.hero=.924;f.service.change({version:s.version,data:s.data,timings:s.timings});
  const rename=fs.renameSync;fs.renameSync=function(from,to){if(to===f.config){fs.writeFileSync(f.catalog,external);throw Error('Audit fixture concurrent publication failure');}return rename.call(this,from,to);};
  try{assert.throws(()=>f.service.save({version:f.service.version}),/publication failure/);}finally{fs.renameSync=rename;}
  assert.deepEqual(fs.readFileSync(f.catalog),external);assert.deepEqual(fs.readFileSync(f.config),config);assert.equal(f.service.dirty(),true);
  assert.throws(()=>f.service.save({version:f.service.version}),/outside this draft/);
});
