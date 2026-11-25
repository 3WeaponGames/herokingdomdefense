'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),{ProjectilesService}=require('../../packages/hkd-projectiles/service');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-projectile-workflow-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));for(const name of ['assets/resources/projectiles/catalog.json','assets/resources/localization/catalog.json','assets/KinghtFallConfig/GameJsonCfg.json']){const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,name),target);}const service=new ProjectilesService(dir);return{dir,service,config:path.join(dir,service.configRelative),catalog:path.join(dir,service.relative)};}
test('projectile assignment, trail and launch timing remain drafts and save together preserving default and unknown fields',t=>{
 const f=fixture(t),beforeConfig=fs.readFileSync(f.config),beforeCatalog=fs.readFileSync(f.catalog),original=JSON.parse(beforeConfig),s=f.service.load(),set=s.data.sets.find(set=>set.launch&&set.impact),trail=s.data.trails[0];
 s.data.assignments.hero={...s.data.assignments.hero,set:set.id,flight:set.flight,launch:set.launch,impact:set.impact,trail:trail.id,future:{keep:true}};s.timings.hero=.7;
 f.service.change({version:s.version,data:s.data,timings:s.timings});assert.deepEqual(fs.readFileSync(f.config),beforeConfig);assert.deepEqual(fs.readFileSync(f.catalog),beforeCatalog);assert.equal(f.service.load().units.find(unit=>unit.key==='hero').launchDelay,.7);
 const saved=f.service.save({version:f.service.version}),config=JSON.parse(fs.readFileSync(f.config));assert.equal(saved.result.saved,true);assert.deepEqual(config.GameTools.timingDefaults,original.GameTools.timingDefaults);assert.equal(config.GameTools.timings['hero:hero:default'].attack,.7);assert.deepEqual(f.service.data.assignments.hero.future,{keep:true});assert.equal(f.service.data.assignments.hero.trail,trail.id);assert.equal(f.service.save({version:f.service.version}).result.saved,false);
 const reset=f.service.load();delete reset.timings.hero;f.service.change({version:reset.version,data:reset.data,timings:reset.timings});assert.equal(f.service.load().units.find(unit=>unit.key==='hero').launchDelay,original.GameTools.timingDefaults['hero:hero:default'].attack);f.service.save({version:f.service.version});assert.equal(JSON.parse(fs.readFileSync(f.config)).GameTools.timings['hero:hero:default'],undefined);
});
test('building delay saves on its own assignment without adding unsupported global timing keys',t=>{
 const f=fixture(t),before=fs.readFileSync(f.config),s=f.service.load(),key='tower:2:1',original={...s.data.assignments[key]};
 delete original.launchDelay;
 s.timings[key]=.4;f.service.change({version:s.version,data:s.data,timings:s.timings});assert.equal(f.service.load().units.find(unit=>unit.key===key).launchDelay,.4);f.service.save({version:f.service.version});assert.deepEqual(fs.readFileSync(f.config),before);assert.equal(f.service.data.assignments[key].launchDelay,.4);
 const reset=f.service.load();delete reset.timings[key];f.service.change({version:reset.version,data:reset.data,timings:reset.timings});assert.equal(f.service.load().units.find(unit=>unit.key===key).launchDelay,0);f.service.save({version:f.service.version});assert.deepEqual(f.service.data.assignments[key],Object.keys(original).length?original:undefined);
});
test('invalid delay, nonexistent trails and read-only library edits are rejected',t=>{
 const f=fixture(t),s=f.service.load();for(const delay of [-1,11,NaN,'0.7'])assert.throws(()=>f.service.change({version:s.version,data:s.data,timings:{hero:delay}}),/delay/);s.data.assignments.hero={trail:'missing'};assert.throws(()=>f.service.change({version:s.version,data:s.data}),/trail/);delete s.data.assignments.hero;s.data.sets[0].name='changed';assert.throws(()=>f.service.change({version:s.version,data:s.data}),/read-only/);
});

test('scale and mixed trail colors save per unit, preserve inherited defaults and never edit gameplay or shared trail presets',t=>{
 const f=fixture(t),beforeConfig=fs.readFileSync(f.config),s=f.service.load(),key=s.units.find(u=>u.type==='enemy').key,trails=structuredClone(s.data.trails);
 s.data.assignments.hero={...s.data.assignments.hero,scale:2.5,trailColor:'#9fe7ff',future:{keep:true}};s.data.assignments[key]={scale:.4,trailColor:'#b64dff'};
 f.service.change({version:s.version,data:s.data});assert.deepEqual(fs.readFileSync(f.config),beforeConfig);assert.notEqual(JSON.parse(fs.readFileSync(f.catalog)).assignments.hero?.scale,2.5);
 f.service.save({version:f.service.version});const fresh=new ProjectilesService(f.dir);assert.equal(fresh.data.assignments.hero.scale,2.5);assert.equal(fresh.data.assignments[key].scale,.4);assert.equal(fresh.data.assignments[key].trailColor,'#b64dff');assert.deepEqual(fresh.data.assignments.hero.future,{keep:true});assert.deepEqual(fresh.data.trails,trails);assert.deepEqual(fs.readFileSync(f.config),beforeConfig);
 const unchanged=fs.readFileSync(f.catalog),stamp=fs.statSync(f.catalog).mtimeMs;assert.equal(fresh.save({version:fresh.version}).result.saved,false);assert.deepEqual(fs.readFileSync(f.catalog),unchanged);assert.equal(fs.statSync(f.catalog).mtimeMs,stamp);
 const reset=fresh.load();delete reset.data.assignments.hero.scale;delete reset.data.assignments.hero.trailColor;fresh.change({version:reset.version,data:reset.data});fresh.save({version:fresh.version});assert.deepEqual(fresh.data.assignments.hero.future,{keep:true});assert.equal(fresh.data.assignments.hero.scale,undefined);
});

test('invalid scale and trail color edits are rejected while unchanged legacy metadata stays intact',t=>{
 const f=fixture(t),s=f.service.load();for(const scale of [0,-1,.09,10.01,Infinity,NaN,'2',null]){const data=structuredClone(s.data);data.assignments.hero={scale};assert.throws(()=>f.service.change({version:s.version,data}),/scale/);}
 for(const trailColor of ['red','#fff','#zzzzzz',123,['#123456'],null]){const data=structuredClone(s.data);data.assignments.hero={trailColor};assert.throws(()=>f.service.change({version:s.version,data}),/color/);}
 const data=structuredClone(s.data);data.assignments.tower={...data.assignments.tower,scale:1.8,trailColor:'#aa77ff'};f.service.change({version:s.version,data});const tier=f.service.load().units.find(u=>/^tower:/.test(u.key));assert.equal(tier.effectiveAssignment.scale,1.8);assert.equal(tier.inheritedAssignment.trailColor,'#aa77ff');
});
test('signed launch offsets remain per-unit drafts and inherit independently when reset',t=>{
 const f=fixture(t),before=fs.readFileSync(f.catalog),cfg=fs.readFileSync(f.config),draft=f.service.load();
 const key='tower:2:1';
 draft.data.assignments.tower={...draft.data.assignments.tower,launchOffsetX:18.5,launchOffsetY:-9};
 draft.data.assignments[key]={...draft.data.assignments[key],launchOffsetX:0,future:{keep:true}};
 const changed=f.service.change({version:draft.version,data:draft.data});
 const edited=changed.units.find(who=>who.key===key);
 assert.equal(edited.effectiveAssignment.launchOffsetX,0);
 assert.equal(edited.effectiveAssignment.launchOffsetY,-9);
 assert.deepEqual(fs.readFileSync(f.catalog),before);
 const saved=f.service.save({version:changed.version});
 assert.deepEqual(saved.result.files,[f.service.relative]);
 assert.deepEqual(fs.readFileSync(f.config),cfg);
 const fresh=new ProjectilesService(f.dir),reset=fresh.load();
 delete reset.data.assignments[key].launchOffsetX;
 fresh.change({version:reset.version,data:reset.data});fresh.save({version:fresh.version});
 assert.equal(fresh.load().units.find(who=>who.key===key).effectiveAssignment.launchOffsetX,18.5);
 assert.deepEqual(fresh.data.assignments[key].future,{keep:true});
 assert.equal(fresh.save({version:fresh.version}).result.saved,false);
});
test('launch offset validation rejects non-numeric, non-finite and out-of-range edits on either axis',t=>{
 const {service}=fixture(t),draft=service.load();
 for(const axis of ['launchOffsetX','launchOffsetY'])for(const value of ['3',null,NaN,Infinity,-4097,4097]){
  const data=structuredClone(draft.data);data.assignments.hero={...data.assignments.hero,[axis]:value};
  assert.throws(()=>service.change({version:draft.version,data}),/Launch offsets/);
 }
});
test('set-only assignments select all effects, preserve legacy shared towers and explicitly clear absent effects',()=>{
 const api={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/ProjectileLooks.js'),'utf8'),{exports:api});const data={assets:[],sets:[{id:'plain',flight:'arrow'},{id:'magic',flight:'orb',launch:'flash',impact:'hit'}],assignments:{hero:{set:'plain'},tower:{set:'magic'}}};assert.deepEqual(JSON.parse(JSON.stringify(api.select(data,'hero'))),{set:'plain',flight:'arrow',launch:'',impact:''});assert.equal(api.select(data,'tower:2:1').impact,'hit');
});
test('building launch scheduler retains synchronous legacy calls and cancels replaced sources and old epochs',()=>{
 const api={},cc={isValid:value=>!!value&&!value.destroyed};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/ProjectileLooks.js'),'utf8'),{exports:api,cc});const data={assets:[],assignments:{'tower:2:1':{launchDelay:.4}}};api.prime(data);const source={node:{_combatGeneration:1},time:{},buildInfo:{cfg:{}}},owner={_combatEpoch:1};let calls=0;api.queueLaunch(owner,'tower',source,()=>calls++,()=>true);assert.equal(calls,1);api.queueLaunch(owner,'tower:2:1',source,()=>calls++,()=>true);owner._projectileLooks.update(.2);assert.equal(calls,1);owner._projectileLooks.update(.2);assert.equal(calls,2);api.queueLaunch(owner,'tower:2:1',source,()=>calls++,()=>true);owner._combatEpoch++;owner._projectileLooks.update(.5);assert.equal(calls,2);api.queueLaunch(owner,'tower:2:1',source,()=>calls++,()=>true);source.node={_combatGeneration:1};owner._projectileLooks.update(.5);assert.equal(calls,2);owner._projectileLooks.dispose();
});

test('reset removes only the launch marker while preserving future timing metadata and inherited gameplay delay',t=>{
 const f=fixture(t),config=JSON.parse(fs.readFileSync(f.config));config.GameTools.timings['hero:hero:default']={attack:.3,future:{retain:true}};fs.writeFileSync(f.config,JSON.stringify(config));const s=f.service.reload();delete s.timings.hero;f.service.change({version:s.version,data:s.data,timings:s.timings});f.service.save({version:f.service.version});const saved=JSON.parse(fs.readFileSync(f.config));assert.deepEqual(saved.GameTools.timings['hero:hero:default'],{future:{retain:true},inherit:true});assert.equal(f.service.load().units.find(unit=>unit.key==='hero').launchDelay,config.GameTools.timingDefaults['hero:hero:default'].attack);assert.equal(require('../../packages/game-data-editor/lib/attack-profile').describe({},saved.GameTools,{type:'hero'}).hitTime,config.GameTools.timingDefaults['hero:hero:default'].attack);
});
