'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),url=require('node:url');
const root=path.resolve(__dirname,'../..'),{ProjectilesService}=require('../../packages/hkd-projectiles/service'),Assets=require('../../packages/game-data-editor/lib/unit-assets'),Records=require('../../packages/game-data-editor/lib/unit-records'),Profiles=require('../../packages/game-data-editor/lib/unit-profiles'),Fighting=require('../../packages/game-data-editor/lib/fighting-profiles'),Catalog=require('../../packages/game-data-editor/worlds/unit-catalog');
function fixture(t,edit){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-projectile-profile-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  for(const relative of ['assets/resources/projectiles/catalog.json','assets/resources/localization/catalog.json','assets/KinghtFallConfig/GameJsonCfg.json']){const target=path.join(dir,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,relative),target);}
  const config=path.join(dir,'assets/KinghtFallConfig/GameJsonCfg.json'),file=path.join(dir,'assets/resources/projectiles/catalog.json'),data=JSON.parse(fs.readFileSync(config)),catalog=JSON.parse(fs.readFileSync(file));
  if(edit)edit(data,catalog);fs.writeFileSync(config,JSON.stringify(data));fs.writeFileSync(file,JSON.stringify(catalog));return{dir,config,file,data,catalog};
}
function child(data,base){return Object.values(data.GameTools.unitProfiles.families[base].profiles).find(id=>Number(id)!==base);}

test('fighting-profile previews inherit saved projectile art, trails and speed and retain independent overrides',t=>{
  let id,flight,trail;
  const f=fixture(t,(data,catalog)=>{id=child(data,90005);flight=catalog.assets[0].id;trail=catalog.trails[0].id;data.GameTools.projectileSpeeds={'enemy:90005:default':876};catalog.assignments['enemy:90005']={flight,trail};catalog.assignments['enemy:'+id]={tint:'#aabbcc'};});
  const service=new ProjectilesService(f.dir),s=service.load(),unit=s.units.find(unit=>unit.key==='enemy:'+id),role=Fighting.roleOf(f.data.GameTools,id);
  assert.equal(unit.effectiveAssignment.flight,flight);assert.equal(unit.effectiveAssignment.trail,trail);assert.equal(unit.effectiveAssignment.tint,'#aabbcc');assert.equal(unit.speed,876);assert.equal(unit.defaultFlight,'original:stone');assert.match(unit.name,new RegExp(role,'i'));
  const reset=structuredClone(s.data);delete reset.assignments[unit.key];const next=service.change({version:s.version,data:reset,timings:s.timings});assert.equal(next.units.find(row=>row.key===unit.key).effectiveAssignment.flight,flight);assert.equal(next.units.find(row=>row.key===unit.key).effectiveAssignment.trail,trail);
  const fireballId=child(f.data,90008);assert.equal(next.units.find(row=>row.key==='enemy:'+fireballId).defaultFlight,'original:fireball');assert.deepEqual(fs.readFileSync(f.file),Buffer.from(JSON.stringify(f.catalog)),'preview/reset remains a draft');
});

function copyDescription(dir,description){
  const copy=relative=>{const target=path.join(dir,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,relative),target);};
  copy(description.source);
  for(const layer of description.layers){copy(layer.source);copy(layer.source+'.meta');copy(layer.source.replace(/\.json$/,'.atlas'));for(const page of Object.values(layer.pages))copy(path.relative(root,url.fileURLToPath(page)));}
}

test('profile model previews inherit baked parent rigs and whole-unit playback while retaining their own hit clock',t=>{
  const f=fixture(t),id=child(f.data,90003),key='enemy:'+id+':default',parent=Assets.describe(root,{type:'enemy',id:90003,noRuntime:true,noShared:true}),specific=Assets.describe(root,{type:'enemy',id:90001,noRuntime:true,noShared:true});
  copyDescription(f.dir,parent);copyDescription(f.dir,specific);
  const characterFile=path.join(f.dir,'assets/resources/characters/catalog.json'),baked=description=>({uuid:description.layers[0].uuid}),characters={profiles:{parent:{baked:baked(parent)},specific:{baked:baked(specific)}},assignments:{'enemy:90003:default':'parent'},unitAnimationSpeeds:{'enemy:90003:default':.6}};
  fs.mkdirSync(path.dirname(characterFile),{recursive:true});fs.writeFileSync(characterFile,JSON.stringify(characters));
  // Metadata repaired by common Windows editors can carry a UTF-8 BOM.
  const meta=path.join(f.dir,parent.layers[0].source+'.meta');fs.writeFileSync(meta,'\uFEFF'+fs.readFileSync(meta,'utf8'));
  f.data.GameTools.projectileSpeeds={'enemy:90003:default':888};f.data.GameTools.timingDefaults[key]={attack:.27};
  const request={type:'enemy',id,noRuntime:true,noShared:true,documents:{A:{data:f.data}}};Assets.invalidate();
  const inherited=Assets.describe(f.dir,request);assert.equal(inherited.layers[0].uuid,parent.layers[0].uuid);assert.equal(inherited.unitAnimationSpeed,.6);assert.equal(inherited.projectile.speed,888);
  assert.equal(require('../../packages/game-data-editor/lib/attack-profile').describe(inherited,f.data.GameTools,{type:'enemy',id,record:f.data.SoldierCfg[id]}).hitTime,.27);
  characters.assignments[key]='specific';characters.unitAnimationSpeeds[key]=.8;fs.writeFileSync(characterFile,JSON.stringify(characters));
  const exact=Assets.describe(f.dir,request);assert.equal(exact.layers[0].uuid,specific.layers[0].uuid);assert.equal(exact.unitAnimationSpeed,.8);
  f.data.GameTools.projectileSpeeds[key]='legacy-invalid';assert.equal(Assets.describe(f.dir,request).projectile.speed,parent.projectile.speed,'an explicit malformed override suppresses inheritance like combat');
});

test('ally projectile descriptions use the actual first tier by default and validate all authored tiers',()=>{
  const service=new ProjectilesService(root),characters=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/characters/catalog.json'))),before=fs.readFileSync(service.configFile),id=90003;
  const first=service.describeUnit({key:'ally:'+id});assert.equal(first.level,1);assert.equal(first.layers[0].uuid,characters.profiles[characters.assignments['ally:'+id+':level:1']].baked.uuid);
  for(const level of Records.levels(service.configData,'ally',id)){const result=service.describeUnit({key:'ally:'+id,level});assert.equal(result.level,level);assert.equal(result.layers[0].uuid,characters.profiles[characters.assignments['ally:'+id+':level:'+level]].baked.uuid);assert.equal(result.projectile.speed,service.units().find(unit=>unit.key==='ally:'+id).speed);}
  assert.throws(()=>service.describeUnit({key:'ally:'+id,level:99}),/existing ally level/);assert.deepEqual(fs.readFileSync(service.configFile),before);
});

test('default hit metadata matches existing fireball and cannon impact behavior',()=>{
  const service=new ProjectilesService(root),fireball=service.describeUnit({key:'enemy:90008'}),arrow=service.describeUnit({key:'enemy:90003'}),tower=service.units().find(unit=>unit.builtinFlight==='cannon'),cannon=service.describeUnit({key:tower.key});
  assert.equal(fireball.defaultHitAnimation,false);assert.notEqual(arrow.defaultHitAnimation,false);assert.equal(cannon.defaultHitAnimation,false);assert.equal(cannon.defaultHit.kind,'cannon');assert.equal(cannon.defaultHit.splashRadius,require('../../assets/_script/TowerCombat').settings(service.configData.BuildEnum[tower.id].levelList[tower.levelIndex]).splashRadius);
});

test('explicit fighting migration and managed duplicates retain projectile speed without seeding normal Add',t=>{
  const f=fixture(t),row={ID:91001,Name:'Ranged fixture',MonsterSource:'monster1/Ranged',prefab:'Ranged',BehaviorTemplate:90003,AttackType:2,Health:10,AttackDamage:1,AttackInterval:1,Speed:10,Data:[]},tools={projectileSpeeds:{'enemy:91001:default':931},unitTypes:Object.fromEntries(Fighting.ROLES.map(role=>[role,{name:role}]))},state={A:{SoldierCfg:{91001:row},GameTools:tools,LevelCfg:[]},B:{LevelCfg:[]},D:{LevelCfg:[]},catalog:{entries:{}},overrides:tools};
  const original=structuredClone(state),migrated=Fighting.plan(state,Catalog.rows(state.A,state.catalog)).state;
  for(const id of Object.values(migrated.overrides.unitProfiles.families[91001].profiles))assert.equal(migrated.overrides.projectileSpeeds['enemy:'+id+':default'],931);assert.deepEqual(state,original);
  const ordinary=structuredClone(state);ordinary.A.SoldierCfg[100001]={...row,ID:100001};delete ordinary.A.SoldierCfg[100001].MonsterSource;ordinary.overrides.unitProfiles={version:1,nextId:100002,entries:{100001:{baseId:91001,name:'Custom',created:true,stats:{},visual:{}}}};ordinary.overrides.projectileSpeeds['enemy:100001:default']=1041;
  const duplicate=Profiles.operation(f.dir,ordinary,{id:100001,action:'duplicate',name:'Copy'});assert.equal(duplicate.state.overrides.projectileSpeeds['enemy:'+duplicate.selectedId+':default'],1041);
  const added=Profiles.operation(f.dir,ordinary,{id:91001,action:'add',name:'New'});assert.equal(added.state.overrides.projectileSpeeds['enemy:'+added.selectedId+':default'],undefined);
});


test('adopted legacy enemy metadata does not introduce parent inheritance absent from combat',t=>{
  const f=fixture(t,data=>{data.GameTools.unitProfiles.entries[90003]={baseId:90005,name:'Adopted legacy',stats:{},visual:{}};data.GameTools.projectileSpeeds={'enemy:90005:default':876};}),service=new ProjectilesService(f.dir);
  assert.equal(service.units().find(unit=>unit.key==='enemy:90003').speed,500);
  const description=Assets.describe(root,{type:'enemy',id:90003,noRuntime:true,noShared:true,documents:{A:{data:f.data}}});assert.equal(description.projectile.speed,500);
});


test('wall default hit preview uses the native wall effect prefab and authored jian_1 clip',()=>{
  const service=new ProjectilesService(root),wall=service.describeUnit({key:'wall-defense'}),hit=service.describeUnit({key:wall.defaultHitKey}),file=path.join(root,'assets',hit.asset.bundle,hit.asset.resource+'.json'),metadata=JSON.parse(fs.readFileSync(file+'.meta'));
  const prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/gad_prefabs/UI/GAD_UIGame.prefab'))),owner=prefab.find(item=>item.hitEffect),node=prefab[owner.hitEffect.__id__],renderer=node._components.map(ref=>prefab[ref.__id__]).find(item=>item.__type__==='sp.Skeleton');
  assert.equal(renderer._N$skeletonData.__uuid__,metadata.uuid);assert.equal(wall.defaultHitAnimation,'jian_1');assert.equal(hit.animation,'jian_1');assert(hit.layers[0].json.animations.jian_1);
  const source=fs.readFileSync(path.join(root,'assets/_script/GAD_UIGameView.js'),'utf8'),method=source.slice(source.indexOf('_ctor.prototype.showHitEffect ='));
  assert.match(method,/setAnimation\(0,\s*"jian_1"/);
});
