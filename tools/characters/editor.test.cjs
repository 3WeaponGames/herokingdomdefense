'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {test}=require('node:test'),{Service}=require('../../packages/hkd-characters/lib/service');
const root=path.resolve(__dirname,'../..');
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-characters-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const write=(name,data)=>{const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof data==='string'?data:JSON.stringify(data));};
  const profile={name:'Guard',base:{type:'ally',id:'90001'},parts:[{id:'helmet',sprite:'helmet',layer:'model',slot:'head',bone:'head-bone',x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,order:0,hideSlots:[]}],future:{keep:13}};
  write('assets/resources/characters/catalog.json','{\n  "version": 1,\n  "future": { "value": 1.00 },\n  "profiles": '+JSON.stringify({guard:profile})+',\n  "assignments": {"ally:90001:default":"guard"}\n}\n');
  write('assets/resources/character-parts/catalog.json',{version:1,parts:[{id:'helmet'}]});
  write('assets/KinghtFallConfig/GameJsonCfg.json',{SoldierCfg:{90001:{ID:90001,prefab:'ItemEnemy01',Name:'Soldier'}},GameTools:{timingDefaults:{'ally:90001:default':{attack:.2}},timings:{'ally:90001:default':{attack:.1}}},unknown:'preserved'});
  write('assets/KinghtFallEnemy/PlayItemEnemy01.prefab','[]');write('assets/resources/localization/catalog.json',{entries:{}});
  const store=new Service(dir);store.describe=()=>({layers:[{uuid:'model',skins:['default'],json:{bones:[{name:'head-bone'}],slots:[{name:'head'},{name:'body'}]}}]});
  return {dir,store,file:store.file,config:path.join(dir,'assets/KinghtFallConfig/GameJsonCfg.json')};
}
function edit(store,fn){const data=store.snapshot().data;fn(data);return store.change({version:store.version,data});}
test('opening, browsing and staging do not write character files, gameplay data, timings or backups',t=>{
  const f=fixture(t),before=fs.readFileSync(f.file,'utf8'),config=fs.readFileSync(f.config,'utf8'),stat=fs.statSync(f.file).mtimeMs;
  assert.equal(f.store.load().parts.length,1);f.store.units();f.store.describe({type:'ally',id:'90001'});
  edit(f.store,data=>data.profiles.guard.name='Draft name');
  assert.equal(fs.readFileSync(f.file,'utf8'),before);assert.equal(fs.statSync(f.file).mtimeMs,stat);assert.equal(fs.readFileSync(f.config,'utf8'),config);
  assert.equal(fs.existsSync(path.join(f.dir,'local')),false);assert.equal(f.store.snapshot().dirty,true);
});
test('explicit Save backs up exact source, preserves unknown fields/format and no-change Save performs zero writes',t=>{
  const f=fixture(t),before=fs.readFileSync(f.file,'utf8'),config=fs.readFileSync(f.config,'utf8');
  const nothing=f.store.save({version:f.store.version});assert.equal(nothing.result.saved,false);assert.equal(fs.existsSync(path.join(f.dir,'local')),false);
  edit(f.store,data=>data.profiles.guard.parts[0].x=7.5);const result=f.store.save({version:f.store.version}),written=fs.readFileSync(f.file,'utf8');
  assert.equal(result.result.saved,true);assert.equal(fs.readFileSync(path.join(f.dir,result.result.backup),'utf8'),before);assert(written.includes('"value": 1.00'));assert.equal(JSON.parse(written).profiles.guard.future.keep,13);assert.equal(fs.readFileSync(f.config,'utf8'),config);
  const mtime=fs.statSync(f.file).mtimeMs;assert.equal(f.store.save({version:f.store.version}).result.saved,false);assert.equal(fs.statSync(f.file).mtimeMs,mtime);assert.equal(fs.readdirSync(path.dirname(path.join(f.dir,result.result.backup))).length,1);
});
test('external edits and competing editor revisions cannot overwrite a saved file or lose the draft',t=>{
  const f=fixture(t),version=f.store.version;edit(f.store,data=>data.profiles.guard.name='My draft');assert.throws(()=>f.store.change({version,data:f.store.data}),/another window/);
  const external=JSON.parse(fs.readFileSync(f.file));external.future.value=77;fs.writeFileSync(f.file,JSON.stringify(external));
  assert.throws(()=>f.store.save({version:f.store.version}),/outside this draft/);assert.equal(JSON.parse(fs.readFileSync(f.file)).future.value,77);assert.equal(f.store.data.profiles.guard.name,'My draft');
});
test('invalid textures, slots, bones, transforms and assignments are refused before any writes',t=>{
  const f=fixture(t),before=fs.readFileSync(f.file,'utf8');
  const cases=[d=>d.profiles.guard.parts[0].sprite='missing',d=>d.profiles.guard.parts[0].bone='missing',d=>d.profiles.guard.parts[0].slot='missing',d=>d.profiles.guard.parts[0].scaleX=0,d=>d.profiles.guard.parts[0].x=Infinity,d=>d.profiles.guard.parts[0].order=.5,d=>d.profiles.guard.parts[0].hideSlots=['head'],d=>d.assignments['enemy:90001:default']='guard',d=>d.profiles.guard.models={missing:{x:1}},d=>d.profiles.guard.models={model:{scaleX:0}},d=>d.profiles.guard.models={model:{scaleY:-1}},d=>d.profiles.guard.models={model:{opacity:2}}];
  for(const mutate of cases){const data=f.store.snapshot().data;mutate(data);assert.throws(()=>f.store.change({version:f.store.version,data}));}
  assert.equal(fs.readFileSync(f.file,'utf8'),before);assert.equal(fs.existsSync(path.join(f.dir,'local')),false);
});
test('discard restores current saved appearance without writing any files',t=>{
  const f=fixture(t),before=fs.readFileSync(f.file,'utf8');edit(f.store,d=>d.profiles.guard.name='Draft');const result=f.store.discard({version:f.store.version});assert.equal(result.dirty,false);assert.equal(result.data.profiles.guard.name,'Guard');assert.equal(fs.readFileSync(f.file,'utf8'),before);
});
test('shipped example and every supported base validate without running the game or requiring an engine',()=>{
  const store=new Service(root);assert.equal(store.validate(store.data),true);const units=store.units(),cfg=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8'));
  const imported=Object.values(cfg.SoldierCfg).filter(unit=>unit.MonsterSource);
  const campaign=Object.values(cfg.SoldierCfg).filter(unit=>unit.CampaignBaseUnit);assert.equal(campaign.length,127);
  assert.equal(units.length,17+imported.length+campaign.length);assert.equal(imported.length,100);assert.equal(units.filter(u=>u.group==='Allies').length,4);
  assert.equal(units.filter(u=>u.type!=='enemy'||Number(u.id)<=90012).length,17,'original hero/allied/campaign bases stay available');
  for(const unit of imported)assert(units.some(base=>base.key==='enemy:'+unit.ID+':default'),unit.MonsterSource);
  for(const base of units){const description=store.describe(base,true);assert(description.layers.length);assert.equal(description.runtimePath,null);}
});
