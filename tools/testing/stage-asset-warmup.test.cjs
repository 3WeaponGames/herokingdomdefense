'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Warm=require('../../assets/_script/StageAssetWarmup');
const root=path.resolve(__dirname,'../..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const config=read('assets/KinghtFallConfig/GameJsonCfg.json'),catalogs={characters:read('assets/resources/characters/catalog.json'),parts:read('assets/resources/character-parts/catalog.json'),projectiles:read('assets/resources/projectiles/catalog.json')};
const output={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallConfig.js'),'utf8'),{exports:output,require:()=>({OrderLayer:{}})});const names=output.KinghtFallBundelName;
test('all later-wave enemies, legacy waves, all upgrade choices and allied rigs enter the stage manifest without writes',()=>{
 const before=JSON.stringify(config);for(const level of config.LevelCfg){const plan=Warm.plan(config,level,names),keys=new Set(plan.items.map(i=>i.key));assert.equal(keys.size,plan.items.length);for(const wave of level.WaveCfg)for(const spawn of wave.SpawnTimeline||[])assert(keys.has(names.Enemy+'/'+config.SoldierCfg[spawn.unitId].prefab+':prefab'));for(const id of plan.kinds)for(const row of config.BuildEnum[id].levelList||[])if(row.Appearance)assert(keys.has('resources/'+row.Appearance.sprite+':frame'));}
 const legacy=Warm.unitIds({WaveCfg:[{RefreshSoldierKind:['1#123,4;456,2']},{SpawnTimeline:[{unitId:789}],RefreshSoldierKind:['1#999,1']}]});assert.deepEqual(legacy,['123','456','789']);assert.equal(JSON.stringify(config),before);
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
test('stage admission and checkpoint creation remain behind the readiness gate',()=>{
 const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIGame.js'),'utf8'),start=source.slice(source.indexOf('_ctor.prototype.start ='),source.indexOf('_ctor.prototype.playPlanningMusic'));
 assert(start.indexOf('stageAssets.run().then')<start.indexOf('game.initData(levelId)'));assert(start.indexOf('stageAssets.run().then')<start.indexOf('player.purchase'));assert(start.indexOf('game._stageAssets=stageAssets')<start.indexOf('game.initMap(map)'));assert(start.indexOf('prepareMap();')<start.indexOf('stageAssets.reveal()'));
});
