'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Warm=require('../../assets/_script/StageAssetWarmup');
const root=path.resolve(__dirname,'../..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const config=read('assets/KinghtFallConfig/GameJsonCfg.json'),catalogs={characters:read('assets/resources/characters/catalog.json'),parts:read('assets/resources/character-parts/catalog.json'),projectiles:read('assets/resources/projectiles/catalog.json')};
const output={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallConfig.js'),'utf8'),{exports:output,require:()=>({OrderLayer:{}})});const names=output.KinghtFallBundelName;

test('stage-only Custom units preload their shared model without registering global records',()=>{
 const data=JSON.parse(JSON.stringify(config)),level=JSON.parse(JSON.stringify(data.LevelCfg[0])),unit=Object.values(data.SoldierCfg).find(row=>row.MonsterSource);level.EnemyProfiles={1000000000:{name:'Custom',baseId:unit.ID,stats:{Health:999}}};level.WaveCfg[0].SpawnTimeline=[{unitId:1000000000,count:1,spawnId:1,startSeconds:0,intervalSeconds:1}];const before=JSON.stringify(data),plan=Warm.plan(data,level,names);assert(plan.items.some(item=>item.bundle===names.Enemy&&item.path===unit.prefab));assert.equal(data.SoldierCfg[1000000000],undefined);assert.equal(JSON.stringify(data),before);
});
test('stage admission preloads the actual dim sprite and deduplicates mixed light types without changing layouts',()=>{
 const data=JSON.parse(JSON.stringify(config));for(const category of Object.values(data.BuildEnum))for(const row of category.levelList||[])delete row.Nightlight;const row=data.BuildEnum[1].levelList[0];row.Nightlight={version:1,lights:{},emitters:[{id:'light:1',type:'dim'},{id:'light:2',type:'dim'}]};
 let p=Warm.plan(data,data.LevelCfg[0],names);assert.equal(p.items.filter(i=>i.path==='buildings/lighting/native-archer-dim-ray').length,1);assert(!p.items.some(i=>i.path==='buildings/lighting/native-window-ray'));row.Nightlight.emitters.push({id:'light:3'});const before=JSON.stringify(data);p=Warm.plan(data,data.LevelCfg[0],names);assert.equal(p.items.filter(i=>i.path==='buildings/lighting/native-window-ray').length,1);assert.equal(JSON.stringify(data),before);
});
test('only explicitly added manual lights require the shared square sprite and obsolete masks are not loaded',()=>{
 const data=JSON.parse(JSON.stringify(config)),level=data.LevelCfg[0],row=data.BuildEnum[1].levelList[0];row.Nightlight={version:1,lights:{},emitters:[{id:'light:1'},{id:'light:2'}]};const before=JSON.stringify(data),plan=Warm.plan(data,level,names),manual=plan.items.filter(i=>i.path==='buildings/lighting/native-window-ray');assert.equal(manual.length,1);assert.equal(manual[0].type,'frame');assert(!plan.items.some(i=>/-window-light$/.test(i.path)));assert.equal(JSON.stringify(data),before);
});
test('all later-wave enemies, legacy waves, all upgrade choices and allied rigs enter the stage manifest without writes',()=>{
 const before=JSON.stringify(config);for(const level of config.LevelCfg){const plan=Warm.plan(config,level,names),keys=new Set(plan.items.map(i=>i.key));assert.equal(keys.size,plan.items.length);for(const wave of level.WaveCfg)for(const spawn of wave.SpawnTimeline||[])assert(keys.has(names.Enemy+'/'+config.SoldierCfg[spawn.unitId].prefab+':prefab'));for(const id of plan.kinds)for(const row of config.BuildEnum[id].levelList||[])if(row.Appearance)assert(keys.has('resources/'+row.Appearance.sprite+':frame'));}
 const legacy=Warm.unitIds({WaveCfg:[{RefreshSoldierKind:['1#123,4;456,2']},{SpawnTimeline:[{unitId:789}],RefreshSoldierKind:['1#999,1']}]});assert.deepEqual(legacy,['123','456','789']);assert.equal(JSON.stringify(config),before);
});

test('legacy wave pauses warm only real actors and retain timeline precedence without changing authored packets',()=>{
 const level=JSON.parse(JSON.stringify(config.LevelCfg[6])),wave=level.WaveCfg[5];
 assert(wave.RefreshSoldierKind.some(group=>group.includes('#-1,10;91064,3')));
 level.WaveCfg=[{RefreshSoldierKind:wave.RefreshSoldierKind.slice()}];const before=JSON.stringify(level),plan=Warm.plan(config,level,names);
 assert(!plan.enemies.includes('-1'));assert(plan.enemies.includes('91064'));
 assert(plan.items.some(item=>item.bundle===names.Enemy&&item.path===config.SoldierCfg[91064].prefab));assert.equal(JSON.stringify(level),before);
 assert.deepEqual(Warm.unitIds({WaveCfg:[{RefreshSoldierKind:['1#-1,10;123,2;-1,4;456,1']},{SpawnTimeline:[{unitId:789}],RefreshSoldierKind:['1#999,1;-1,1']}]}),['123','456','789']);
 assert.throws(()=>Warm.plan(config,{...level,WaveCfg:[{RefreshSoldierKind:['1#-2,1']}]},names),/Missing stage enemy -2/);
});
test('selected character parts, baked layers, tower projectiles and every skill phase are prepared',()=>{
 const level=config.LevelCfg[0],base=Warm.plan(config,level,names),clips=require('../../assets/_script/HeroSkillVFXCatalog').clips,items=Warm.presentationPlan(config,level,base,catalogs,{names,style:'fighter',skillClips:clips}),keys=new Set(items.map(i=>i.key));
 for(const clip of clips.filter(c=>c.style==='fighter'))assert(keys.has((clip.bundle||'resources')+'/'+clip.resource+':'+(clip.kind==='spine'?'spine':'frame')));
 const profile=catalogs.characters.profiles[catalogs.characters.assignments['ally:90001:default']];assert(keys.has('resources/'+profile.baked.resource+':spine'));
});
test('custom skill UUIDs, paths and phase groups are mandatory stage resources',()=>{
 const level=config.LevelCfg[0],base=Warm.plan(config,level,names),options={names,style:'fighter',skills:{visual:{resource:'custom-spine',resourceKind:'spine',impactResource:'custom-sprite',impactResourceBundle:'effects',impactResourcePath:'impact'},audio:{cast:{clip:'custom-audio'}}}},items=Warm.presentationPlan(config,level,base,catalogs,options);
 assert(items.some(i=>i.uuid&&i.path==='custom-spine'&&i.type==='spine'));assert(items.some(i=>!i.uuid&&i.bundle==='effects'&&i.path==='impact'&&i.type==='frame'));assert(items.some(i=>i.uuid&&i.path==='custom-audio'&&i.type==='audio'));
});
test('a stage cannot become ready until resources, priming and prepared shadows have completed',async()=>{
 const level=config.LevelCfg[0],pending=[],steps=[],session=new Warm.Session({config,level,names,style:'fighter',load(item,done){pending.push({item,done});},prime(){steps.push('prime');},shadows(){steps.push('shadows');return new Promise(resolve=>{session.finishShadows=resolve;});}});
 const promise=session.run();for(let round=0;round<1000&&!session.finishShadows;round++){for(const p of pending.splice(0)){const kind=p.item.path,asset=kind==='characters/catalog'?{json:catalogs.characters}:kind==='character-parts/catalog'?{json:catalogs.parts}:kind==='projectiles/catalog'?{json:catalogs.projectiles}:{};p.done(null,asset);}await new Promise(resolve=>setImmediate(resolve));}
 assert.deepEqual(steps,['prime','shadows']);assert.equal(session.ready,false);let released=0;session.finishShadows({dispose(){released++;}});await promise;assert(session.ready);assert.equal(session.total,session.completed);session.dispose();session.dispose();assert.equal(released,1);
});
test('cancelling an in-flight stage rejects readiness and releases its resource ownership once',async()=>{
 let releases=0;const session=new Warm.Session({config,level:config.LevelCfg[0],names,load(){},release(){releases++;}}),promise=session.run();session.dispose();await assert.rejects(promise,/cancelled/);assert(!session.ready);assert.equal(releases,1);
});

test('stage disposal cancels only pending loads and ignores late duplicate completions',async()=>{
 const callbacks=[],session=new Warm.Session({load(item,done){callbacks.push(done);}});
 const item=key=>({key,path:key}),asset={},resolved=session.load(item('resolved'));
 callbacks[0](null,asset);await resolved;callbacks[0](null,{});
 assert.equal(session.completed,1);assert.equal(session.assets.resolved,asset);assert.equal(session.rejectors.length,0);
 const first=session.load(item('first')),second=session.load(item('second'));
 const cancelled=Promise.all([assert.rejects(first,/cancelled/),assert.rejects(second,/cancelled/)]);
 assert.equal(session.rejectors.length,2);session.dispose();await cancelled;
 callbacks[1](null,{});callbacks[2](null,{});
 assert.equal(session.completed,1);assert.deepEqual(session.assets,{});assert.equal(session.rejectors.length,0);
});

test('a synchronous load failure leaves no cancellation callback behind',async()=>{
 const issue=Error('decode failed'),session=new Warm.Session({load(){throw issue;}});
 await assert.rejects(session.load({key:'broken',path:'broken'}),error=>error===issue);
 assert.equal(session.rejectors.length,0);session.dispose();
});
test('stage admission and checkpoint creation remain behind the readiness gate',()=>{
 const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIGame.js'),'utf8'),start=source.slice(source.indexOf('_ctor.prototype.start ='),source.indexOf('_ctor.prototype.playPlanningMusic'));
 assert(start.indexOf('stageAssets.run().then')<start.indexOf('game.initData(levelId)'));assert(start.indexOf('stageAssets.run().then')<start.indexOf('player.purchase'));assert(start.indexOf('game._stageAssets=stageAssets')<start.indexOf('game.initMap(map)'));assert(start.indexOf('prepareMap();')<start.indexOf('stageAssets.reveal()'));
});
