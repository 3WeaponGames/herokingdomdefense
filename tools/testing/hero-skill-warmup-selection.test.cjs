'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Pool=require('../../assets/_script/HeroSkillAssetWarmup'),Stage=require('../../assets/_script/StageAssetWarmup'),Settings=require('../../assets/_script/HeroSkillSettings'),Layout=require('../../assets/_script/HeroSkillVFXLayout'),Catalog=require('../../assets/_script/HeroSkillVFXCatalog'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const resources=rows=>new Set(rows.map(row=>row.resource||row.path));
function disabled(){return{HeroSkills:Object.fromEntries(Settings.styles.map(style=>[style.id,{visual:Object.fromEntries(Settings.resourcePrefixes.map(prefix=>[prefix,'']))}]))};}
function stage(skills,style='guardian'){return Stage.presentationPlan({SoldierCfg:{}},{},{enemies:[],allies:[]},{characters:{},parts:{},projectiles:{}},{names:{},style,skills,skillClips:Catalog.clips});}

test('startup pins the effective resources for all six styles without pinning the unused library or mutating configuration',()=>{
 const before=JSON.stringify(config),rows=Pool.plan(config),keys=resources(rows),full=Pool.plan();
 for(const style of Settings.styles){const visual=Settings.effective(style.id,config).visual;for(const prefix of Settings.resourcePrefixes){const clip=Layout.clipFor(visual[prefix]);if(clip){assert(keys.has(clip.resource),style.id+' '+prefix);for(const part of Catalog.clips.filter(part=>clip.group&&part.group===clip.group))assert(keys.has(part.resource),'Missing phase/group '+part.id);}}}
 assert(rows.length<full.length);assert(rows.reduce((n,row)=>n+row.bytes,0)<full.reduce((n,row)=>n+row.bytes,0));assert.equal(rows.length,keys.size);assert.equal(JSON.stringify(config),before);
 const unused=Catalog.clips.filter(clip=>!keys.has(clip.resource));assert(unused.length>0);assert(unused.some(clip=>clip.id==='mystic-beam-body-loop'));
});

test('phase companions survive selection and custom UUIDs remain outside the fixed startup pool',()=>{
 const data=disabled(),inherited=Pool.plan(data),clip=Catalog.clips.find(clip=>clip.id==='guardian-body-shield-loop');data.HeroSkills.guardian.visual.shieldResource=clip.uuid;
 const selected=resources(Pool.plan(data)),group=Catalog.clips.filter(part=>part.group===clip.group);assert(group.length>=3);assert.deepEqual([...selected].sort(),[...new Set(inherited.map(row=>row.resource).concat(group.map(part=>part.resource)))].sort());
 data.HeroSkills.guardian.visual.shieldResource='99999999-9999-4999-8999-999999999999';assert.deepEqual(Pool.plan(data),inherited,'Custom resources retain their stage-owned load path');
});

test('unavailable config retains legacy loading while empty config and invalid saved choices inherit all six defaults',()=>{
 const full=Pool.plan();assert.deepEqual(Pool.plan(undefined),full);assert.deepEqual(Pool.plan(null),full);assert.deepEqual(Pool.plan([]),full);
 const defaults=Pool.plan({}),data={HeroSkills:{unknown:{visual:{castResource:'ignored'}},guardian:{visual:{physicalShieldResource:'invalid'}}}};assert(defaults.length>0);assert.deepEqual(Pool.plan(data),defaults);
});

test('configured pool loading and warmup share exactly the selected resources',()=>{
 const loaded=[],scheduled=[],warmed=[],finished=[],pool=Pool.create({load(row,done){loaded.push(row.resource);done(null,{resource:row.resource,refs:0});return{cancel(){}};},retain:a=>a.refs++,release:a=>a.refs--,schedule:fn=>scheduled.push(fn),warm(held,done){warmed.push(...held.keys());done(null);},flush(done){done(null);}},config);
 pool.preload(error=>finished.push(error));while(scheduled.length)scheduled.shift()();assert.deepEqual(loaded,Pool.plan(config).map(row=>row.resource));assert.deepEqual(warmed,loaded);assert.deepEqual(finished,[null]);assert.equal(pool.status().assets,loaded.length);pool.release();
});

test('runtime startup uses already initialized data and falls back without creating an uninitialized singleton',()=>{
 for(const saved of [config,undefined]){const loads=[],scheduled=[],texture={loaded:true,width:16,height:16,getImpl:()=>({})},asset={textures:[texture],getTexture:()=>texture,addRef(){},decRef(){}},events=new Map(),module={exports:{}};
  const cc={sys:{isNative:false},SpriteFrame:class{},Director:{EVENT_BEFORE_SCENE_LAUNCH:'scene'},director:{on:(name,fn)=>events.set(name,fn),off:name=>events.delete(name)},resources:{load(resource,_type,done){loads.push(resource);done(null,asset);}},game:{_renderContext:{finish(){},getParameter(){}}}};
  const manager={loadWithRecovery(_name,operation,done){operation((error,value)=>{if(error)throw error;done(value);});return{cancel(){}};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroSkillAssetWarmup.js'),'utf8'),{module,exports:module.exports,cc,setTimeout:fn=>{scheduled.push(fn);return 1;},clearTimeout(){},require:name=>name==='KinghtFallDataMgr'?{KinghtFallDataMgr:{instance:saved?{data:saved}:undefined,getInstance(){throw Error('Must not create an early singleton');}}}:name==='ResourceMgr'?{ResourceMgr:{getInstance:()=>manager}}:name==='./HeroSkillVFXCatalog'?Catalog:name==='./HeroSkillSettings'?Settings:name==='./HeroSkillVFXLayout'?Layout:null});
  let finished=0;module.exports.preload(()=>finished++);while(scheduled.length)scheduled.shift()();assert.equal(finished,1);assert.deepEqual(loads,Pool.plan(saved).map(row=>row.resource));assert.equal(events.size,0);
 }
});

test('effective stage settings include every selected slot and all group members while excluding alternate style artwork',()=>{
 for(const style of Settings.styles){const settings=Settings.effective(style.id,config),before=JSON.stringify(settings),rows=stage(settings,style.id),keys=resources(rows);let expected=0;
  for(const prefix of Settings.resourcePrefixes){const id=settings.visual[prefix],clip=Layout.clipFor(id);if(!clip)continue;expected++;for(const part of Catalog.clips.filter(part=>part===clip||part.group&&part.group===clip.group))assert(keys.has(part.resource),style.id+' missing '+prefix+' '+part.id);}
  if(style.id==='skirmisher')assert.equal(expected,0);else assert(expected>0);for(const clip of Catalog.clips.filter(c=>c.style===style.id&&!Pool.plan(config).some(row=>row.resource===c.resource)))assert(!keys.has(clip.resource),'Unused style alternate leaked into stage: '+clip.id);assert.equal(JSON.stringify(settings),before);
 }
});

test('every custom stage slot retains UUID/path loading and missing effective settings preserve the legacy style library',()=>{
 const visual={};Settings.resourcePrefixes.forEach((prefix,i)=>{visual[prefix]='custom-'+i;if(i%2){visual[prefix+'Bundle']='custom-effects';visual[prefix+'Path']='authored/'+prefix;}else visual[prefix+'Kind']='spine';});const before=JSON.stringify(visual),rows=stage({visual});
 Settings.resourcePrefixes.forEach((prefix,i)=>{const row=rows.find(row=>row.path===(i%2?'authored/'+prefix:'custom-'+i));assert(row,prefix);assert.equal(row.uuid,i%2===0);assert.equal(row.type,i%2?'frame':'spine');});assert.equal(JSON.stringify(visual),before);
 for(const legacy of [undefined,{visual:{}},{visual:{scale:2}}]){const fallback=resources(stage(legacy));for(const clip of Catalog.clips.filter(c=>c.style==='guardian'))assert(fallback.has(clip.resource));}
 assert.equal(stage({visual:Object.fromEntries(Settings.resourcePrefixes.map(prefix=>[prefix,'']))}).length,0,'Explicitly disabled resources must remain disabled');
});
