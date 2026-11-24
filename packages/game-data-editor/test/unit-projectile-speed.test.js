'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const Schema=require('../lib/schema'),{Store,files}=require('../lib/store'),Fighting=require('../lib/fighting-profiles'),temporary=require('./owned-temp');
const root=path.resolve(__dirname,'../../..'),label='Projectile flight speed',clone=value=>JSON.parse(JSON.stringify(value));
function fixture(store){
  const filename=path.join(__dirname,'building-panel.test.js');let prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];
  prefix=prefix.replace('function fixture()','function fixture(kind,sharedStore)').replace('const store = new Store(project)','const store = sharedStore || new Store(project)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
  const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout};vm.runInNewContext(prefix+'\nmodule.exports={fixture,fields,all};',context);
  const f=Object.assign(context.module.exports.fixture('units',store),{fields:context.module.exports.fields,all:context.module.exports.all});
  const render=f.render, resolve=key=>key.startsWith('enemy:')?'enemy:'+Fighting.canonicalId(f.store.documents.overrides.data,key.slice(6)):key;
  f.render=key=>render(resolve(key));
  f.row=key=>f.panel._rows().find(row=>row.key===resolve(key));
  f.input=()=>f.fields(f.panel.$detail,label)[0];
  f.reset=()=>f.all(f.panel.$detail,n=>n.tagName==='button'&&n.textContent==='Reset projectile flight speed')[0];
  return f;
}
function seed(f,value){for(const version of ['original','data']){if(value===undefined)delete f.store.documents.overrides[version].projectileSpeeds;else f.store.documents.overrides[version].projectileSpeeds=clone(value);}f.panel._snapshot=f.store.snapshot();}
test('Units shows projectile speed for the hero and ranged characters only, without creating defaults or no-op drafts',async()=>{
  const f=fixture();seed(f);const before=f.store.draftState(),version=f.store.version;
  for(const key of ['hero','enemy:90003','enemy:90005','enemy:90008','ally:90003']){f.render(key);assert(f.input(),key);assert.equal(Number(f.input().value),500);assert.match(f.input().title,/World units per second/);f.input().onchange();await f.panel._queue;assert.equal(f.reset(),undefined);await f.panel._unitProjectileSpeedEdit(f.row(key));}
  for(const key of ['enemy:90001','ally:90001']){f.render(key);assert.equal(f.input(),undefined,key+' melee has no flight speed');}
  assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.version,version);assert(!f.messages.some(message=>/:(change|save)$/.test(message.message)));
});
test('queued speed edits retain the final input and expose no reset button for a custom speed',async()=>{
  const f=fixture();seed(f,{'enemy:90008:default':900,future:{keep:true}});f.render('hero');const before=f.store.draftState(),input=f.input();
  input.value='650';input.onchange();input.value='500';input.onchange();await f.panel._queue;assert.equal(f.store.draftState().overrides.projectileSpeeds['hero:hero:default'],500);assert.equal(f.input().value,'500');
  const version=f.store.version,changes=f.messages.length;f.input().onchange();await f.panel._queue;assert.equal(f.store.version,version);assert.equal(f.messages.length,changes);
  assert.equal(f.reset(),undefined);assert.doesNotMatch(f.input().title,/reset/i);
  await f.panel._unitProjectileSpeedEdit(f.row('hero'));assert.deepEqual(f.store.draftState(),before);assert.equal(f.input().value,'500');
  await f.panel._unitProjectileSpeedEdit(f.row('ally:90003'),775);assert.equal(f.store.draftState().overrides.projectileSpeeds['ally:90003:default'],775);assert.deepEqual(f.store.draftState().A,before.A,'unit balance rows remain unchanged');
  assert(!f.messages.some(message=>message.message==='game-data-editor:save'));
});
test('resetting the last newly authored speed returns to a pristine draft and invalid edits preserve existing data',async()=>{
  const f=fixture();seed(f);f.render('enemy:90003');const before=f.store.draftState();await f.panel._unitProjectileSpeedEdit(f.row('enemy:90003'),1200);await f.panel._unitProjectileSpeedEdit(f.row('enemy:90003'));assert.deepEqual(f.store.draftState(),before);
  for(const value of [0,-1,20001,NaN,Infinity,'600',null])await assert.rejects(f.panel._unitProjectileSpeedEdit(f.row('enemy:90003'),value),/between 1 and 20000/);
  await assert.rejects(f.panel._unitProjectileSpeedEdit(f.row('enemy:90001'),600),/ranged/);assert.deepEqual(f.store.draftState(),before);
  for(const invalid of [null,[],42,'bad']){seed(f,invalid);f.render('hero');const retained=f.store.draftState();assert.equal(f.input().disabled,true);await assert.rejects(f.panel._unitProjectileSpeedEdit(f.row('hero'),600),/invalid format/);assert.deepEqual(f.store.draftState(),retained);}
});
test('projectile speed schema permits ranged unit keys and rejects malformed values, nonexistent units and melee entries',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,files.A),'utf8')),settings={version:1,projectileSpeeds:{'hero:hero:default':700,'enemy:90003:default':850,'ally:90003:default':900}};
  const issues=value=>Schema.validate({A:config,overrides:{...settings,projectileSpeeds:value}},[{doc:'overrides',path:['projectileSpeeds']}]).filter(issue=>issue.doc==='overrides'&&issue.path[0]==='projectileSpeeds');assert.equal(issues(settings.projectileSpeeds).length,0);
  for(const value of [null,[],42,'bad',{'hero:hero:default':0},{'hero:hero:default':20001},{'hero:hero:default':'500'},{'enemy:123456:default':500},{'enemy:90001:default':500},{'hero:bad:default':500}])assert(issues(value).some(issue=>issue.severity==='error'),JSON.stringify(value));
});

test('Units profile speed fields show inherited parent speeds without seeding a same-value override',async()=>{
  const f=fixture(),data=f.store.documents.A.data,family=data.GameTools.unitProfiles.families[90003],id=Object.values(family.profiles).find(id=>Number(id)!==90003),parent='enemy:90003:default',key='enemy:'+id+':default';
  seed(f,{[parent]:876});const record=data.SoldierCfg[id],row={key:'enemy:'+id,unitType:'enemy',unitID:id,record};
  assert.equal(f.panel._unitProjectileSpeedValue(row),876);const before=f.store.draftState(),version=f.store.version;await f.panel._unitProjectileSpeedEdit(row,876);assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.version,version);
  await f.panel._unitProjectileSpeedEdit(row,932);assert.equal(f.store.documents.overrides.data.projectileSpeeds[key],932);await f.panel._unitProjectileSpeedEdit(row,undefined);assert.equal(f.panel._unitProjectileSpeedValue(row),876);assert.deepEqual(f.store.documents.overrides.data.projectileSpeeds,{[parent]:876});
});
test('isolated unit speed saves retain game timing and unrelated fields, detect conflicts and perform no writes for no-op saves',async()=>{
  const dir=temporary('hkd-unit-projectile-speed-');for(const file of Object.values(files)){const target=path.join(dir,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
  const store=new Store(dir,{validators:[Schema.validate],backupRoot:path.join(dir,'backups')}),f=fixture(store),target=path.join(dir,files.A),before=JSON.parse(fs.readFileSync(target,'utf8'));f.render('hero');await f.panel._unitProjectileSpeedEdit(f.row('hero'),720);assert.deepEqual(JSON.parse(fs.readFileSync(target,'utf8')),before);
  const saved=store.save({version:store.version});assert.equal(saved.result.saved,true);const actual=JSON.parse(fs.readFileSync(target,'utf8')),expected=clone(before);expected.GameTools.projectileSpeeds={...expected.GameTools.projectileSpeeds,'hero:hero:default':720};assert.deepEqual(actual,expected);
  const bytes=fs.readFileSync(target),stamp=fs.statSync(target).mtimeMs;assert.equal(store.save({version:store.version}).result.noChanges,true);assert.deepEqual(fs.readFileSync(target),bytes);assert.equal(fs.statSync(target).mtimeMs,stamp);
  store.change({version:store.version,edits:[{doc:'overrides',path:['projectileSpeeds','hero:hero:default'],value:800}]});
  const external=JSON.parse(fs.readFileSync(target));external.GameTools.projectileSpeeds['hero:hero:default']=850;fs.writeFileSync(target,JSON.stringify(external));
  const draft=store.draftState();assert.throws(()=>store.save({version:store.version}),/changed outside/);assert.deepEqual(store.draftState(),draft);
});
test('deleting a created unit profile removes only its projectile speed and preserves other unit overrides',()=>{
  const Profiles=require('../lib/unit-profiles'),state={};for(const [key,file]of Object.entries(files))state[key]=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));state.overrides=clone(state.A.GameTools);
  // Ordinary custom profiles remain supported for legacy authoring data. The
  // shipped roster now has six fixed fighting profiles and intentionally blocks Add.
  const source=Object.values(state.A.SoldierCfg).find(unit=>unit.MonsterSource&&unit.AttackType===2);state.A.SoldierCfg={[source.ID]:clone(source)};state.overrides.unitProfiles={version:1,nextId:100000,entries:{}};
  const created=Profiles.operation(root,state,{id:source.ID,action:'add',name:'Projectile removal verification'}),id=created.selectedId,key='enemy:'+id+':default';created.state.overrides.projectileSpeeds={[key]:840,'hero:hero:default':650,future:{keep:true}};
  const before=clone(created.state),removed=Profiles.operation(root,created.state,{id,action:'remove'}).state;assert.equal(removed.A.SoldierCfg[id],undefined);assert.equal(removed.overrides.projectileSpeeds[key],undefined);assert.deepEqual(removed.overrides.projectileSpeeds,{'hero:hero:default':650,future:{keep:true}});assert.deepEqual(created.state,before,'read-only operation input is preserved');
});
