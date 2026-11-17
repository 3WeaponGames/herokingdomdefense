'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const Settings=require('../../assets/_script/HeroSkillSettings'),Authoring=require('../../assets/_script/HeroSkillAuthoring'),Core=require('../../assets/_script/HeroStyleSkills'),Layout=require('../../assets/_script/HeroSkillVFXLayout'),VFX=require('../../assets/_script/HeroSkillVFXState'),Timeline=require('../../assets/_script/HeroSkillTimeline');
const {SkillService,FILES}=require('../../packages/hkd-skills/service');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const {Model}=require('../../packages/hkd-skills/preview-model');
const slots=['passive','beam','mark','buff','taunt','shield','cast','channelHit','presence','defense','physicalShield'];
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`),clone=value=>JSON.parse(JSON.stringify(value));
function fixture(t,legacyVisual){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-skill-playback-'));
  t.after(()=>{const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert(path.basename(resolved).startsWith('hkd-skill-playback-'));fs.rmSync(resolved,{recursive:true,force:true});});
  for(const [index,relative]of FILES.entries()){const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({GameTools:{timingDefaults:{'hero:hero:default':{attack:.1667}},timings:{'hero:hero:default':{attack:.2}}},HeroSkills:{fighter:{extension:index?'mirror':'primary',visual:{futureAuthoring:{keep:index}}},...(legacyVisual?{skirmisher:{visual:clone(legacyVisual)}}:{})},independent:{index}},null,2)+'\n');}
  let commits=0;const service=new SkillService(root,{catalogs:{audio:[],vfx:[],projectiles:[]},commit:(...args)=>{commits++;return require('../../packages/hkd-characters/lib/asset-transaction').commit(...args);}}),req=extra=>({version:service.version,revision:service.revision,...extra}),bytes=()=>FILES.map(relative=>fs.readFileSync(path.join(root,relative),'utf8'));
  return{service,req,bytes,commits:()=>commits};
}

test('playback controls are saved numeric fields, while native contact sequences retain their single timing owner',()=>{
  for(const style of Settings.styles.map(row=>row.id)){
    const defaults=Settings.defaults(style),map=new Map(Settings.visualFields.map(field=>[field.path,field]));
    for(const key of ['animationPlayback','resourcePlaybackRate','impactPlaybackRate',...slots.map(slot=>slot+'PlaybackRate')]){
      assert.equal(defaults.visual[key],1,style+' '+key+' default');const field=map.get('visual.'+key);assert(field,style+' '+key+' schema');assert.equal(field.type,'number');assert.equal(field.min,.05);assert.equal(field.max,4);assert(Settings.valid(field,.5));assert(Settings.valid(field,2));for(const value of [0,.049,4.01,Infinity,NaN,'1'])assert.equal(Settings.valid(field,value),false,key+' accepted '+value);
    }
    const active=Authoring.fields(style,'active',Settings.fields(style),defaults,{vfx:[]}),paths=Object.values(active).flat().map(field=>field.path);
    assert.equal(paths.includes('visual.animationPlayback'),!['skirmisher','mystic'].includes(style),style+' rider rate exposure');assert.equal(paths.includes('visual.castPlaybackRate'),!['skirmisher','vanguard','guardian'].includes(style),style+' cast rate exposure');
    if(style==='skirmisher')assert(paths.includes('volleyPlayback'),'Native volley source clock stays authorable');if(style==='vanguard')assert(paths.includes('duration'),'Native spear source duration stays authorable');
    if(style==='mystic')assert(Object.values(Authoring.fields(style,'passive',Settings.fields(style),defaults,{vfx:[]})).flat().some(field=>field.path==='visual.animationPlayback'),'Mystic warmup animation rate belongs to its channel');
  }
});

test('playback edits stay in drafts, save to both mirrors without touching timing tables, and reset to inheritance',t=>{
  const f=fixture(t),before=f.bytes(),initial=f.service.snapshot();
  const fields=[['fighter','visual.animationPlayback',.65],['fighter','visual.castPlaybackRate',.75],['guardian','visual.shieldPlaybackRate',1.4],['mystic','visual.beamPlaybackRate',.5],['bruiser','visual.passivePlaybackRate',1.5],['fighter','visual.resourcePlaybackRate',.8],['mystic','visual.impactPlaybackRate',1.25]];
  for(const [style,field,value]of fields)f.service.change(f.req({style,path:field,value}));assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);assert.equal(f.service.save(f.req()).result.saved,true);assert.equal(f.commits(),1);
  const after=f.bytes().map(JSON.parse);for(const [index,data]of after.entries()){for(const [style,field,value]of fields)assert.equal(Settings.get(data.HeroSkills[style],field),value);assert.deepEqual(data.GameTools,JSON.parse(before[index]).GameTools);assert.deepEqual(data.independent,{index});assert.equal(data.HeroSkills.fighter.extension,index?'mirror':'primary');assert.deepEqual(data.HeroSkills.fighter.visual.futureAuthoring,{keep:index});}
  const saved=f.bytes();assert.equal(f.service.save(f.req()).result.saved,false);assert.deepEqual(f.bytes(),saved);assert.equal(f.commits(),1);
  f.service.reset(f.req({style:'fighter',path:'visual.animationPlayback'}));assert.equal(f.service.snapshot().effective.fighter.visual.animationPlayback,1);assert.equal(f.service.snapshot().data.fighter.visual.animationPlayback,undefined);assert.equal(f.service.save(f.req()).result.saved,true);assert.equal(f.commits(),2);for(const text of f.bytes())assert.equal(JSON.parse(text).HeroSkills.fighter.visual.animationPlayback,undefined);assert(initial.data.fighter.visual.futureAuthoring);
});

test('inherited playback values remain absent on no-op edits and malformed rates cannot partially alter a batch',t=>{
  const f=fixture(t),before=f.bytes(),start=f.service.snapshot();f.service.change(f.req({style:'fighter',path:'visual.animationPlayback',value:1}));f.service.change(f.req({style:'guardian',path:'visual.shieldPlaybackRate',value:1}));assert.equal(f.service.version,start.version);assert.equal(f.service.snapshot().dirty,false);
  for(const value of [0,-1,4.1,NaN,Infinity,'fast']){assert.throws(()=>f.service.change(f.req({style:'fighter',changes:[{path:'visual.castScale',value:2},{path:'visual.animationPlayback',value}]})));assert.deepEqual(f.service.snapshot().data,start.data);}
  assert.equal(f.service.save(f.req()).result.saved,false);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
});

test('every independent VFX playback rate samples its source clock without changing its placement or scale',()=>{
  for(const slot of slots){
    const visual={...Settings.defaults('fighter').visual,[slot+'Resource']:'fixture-'+slot},entity={key:'fixture',slot,phase:'loop',age:.4,scale:1,opacity:1,origin:{x:15,y:20},direction:{x:1,y:0},target:{id:2,x:80,y:30},from:{x:0,y:10},to:{x:100,y:30},radius:100,style:'fighter'},context={style:'fighter',hero:{x:0,y:0},heroBody:{x:0,y:70}};
    const base=Layout.entities({entities:[entity]},visual,context)[0],changed=Layout.entities({entities:[entity]},{...visual,[slot+'PlaybackRate']:2},context)[0];assert(base&&changed,slot);close(changed.age,base.age*2);const withoutAge=value=>{const copy=clone(value);delete copy.age;delete copy.visual.playbackRate;return copy;};assert.deepEqual(withoutAge(changed),withoutAge(base),slot+' speed changed geometry');assert.equal(entity.age,.4,'Shared input remains immutable');
  }
  assert.equal(Layout.playbackRate({},'buff'),1);for(const value of [undefined,0,-1,.01,5,Infinity,NaN,'2'])assert.equal(Layout.playbackRate({buffPlaybackRate:value},'buff'),1);assert.equal(Layout.playbackRate({buffPlaybackRate:.5},'buff'),.5);
});

test('Guardian shield introduction, one-shot defense and ending complete at their selected source playback speed',()=>{
  const state=Core.createState('guardian'),cache=VFX.create(),visual={...Settings.defaults('guardian').visual,shieldResource:'fixture',shieldPlaybackRate:2,physicalShieldPlaybackRate:.5,defensePlaybackRate:2},context={shieldSpawnDuration:.6,physicalShieldSpawnDuration:.8,shieldEndDuration:.5,defenseDuration:1};Settings.applyClip(visual,'physicalShieldResource',require('../../assets/_script/HeroSkillVFXCatalog').clips.find(clip=>clip.id==='guardian-physical-shield-start'));Core.beginActive(state,{hp:1000,maxHp:1000});
  const at=time=>{state.time=time;return VFX.update(cache,state,context,visual);},slot=(frame,name)=>frame.entities.find(entity=>entity.slot===name);
  at(0);let frame=at(.29);assert.equal(slot(frame,'shield').phase,'start');close(slot(frame,'shield').progress,.29/.3);assert(slot(frame,'defense'));frame=at(.31);assert.equal(slot(frame,'shield').phase,'loop');assert.equal(slot(frame,'physicalShield').phase,'start');frame=at(.51);assert.equal(slot(frame,'defense'),undefined);frame=at(1.59);assert.equal(slot(frame,'physicalShield').phase,'start');frame=at(1.61);assert.equal(slot(frame,'physicalShield').phase,'loop');
  state.shield=0;frame=at(2);assert.equal(slot(frame,'shield').phase,'end');frame=at(2.24);assert.equal(slot(frame,'shield').phase,'end');close(slot(frame,'shield').progress,.24/.25);frame=at(2.26);assert.equal(slot(frame,'shield'),undefined);assert.equal(state.shieldRemaining,10,'Art speed does not spend gameplay shield duration');
});

test('Mystic mark and beam loop/end rates change only their presentation clocks while buildup stays fitted to scepter warmup',()=>{
  const state=Core.createState('mystic'),cache=VFX.create(),enemy={id:1,generation:1,x:100,y:20},visual={...Settings.defaults('mystic').visual,markResource:'fixture-mark',beamResource:'fixture-beam',markPlaybackRate:2,beamPlaybackRate:2},origin={x:0,y:70};state.marked=true;
  const context={markedTarget:enemy,markSpawnDuration:.5,channelTarget:enemy,origin,warmupProgress:.25,beamStartDuration:.4,beamEndDuration:.5},at=(time,extra)=>{state.time=time;return VFX.update(cache,state,{...context,...extra},visual);},slot=(frame,name)=>frame.entities.find(entity=>entity.slot===name);
  let frame=at(0);assert.equal(slot(frame,'mark').phase,'start');close(slot(frame,'beam').progress,.25);frame=at(.24);assert.equal(slot(frame,'mark').phase,'start');frame=at(.26,{beamTarget:enemy});assert.equal(slot(frame,'mark').phase,'loop');frame=at(.36,{beamTarget:enemy});const rendered=Layout.entities(frame,visual,{style:'mystic',hero:{x:0,y:0}}).filter(entity=>entity.slot==='beam');assert(rendered.length);close(rendered[0].age,.2);
  frame=at(.4,{beamTarget:null,channelTarget:null});assert.equal(slot(frame,'beam').phase,'end');frame=at(.64,{beamTarget:null,channelTarget:null});assert.equal(slot(frame,'beam').phase,'end');frame=at(.66,{beamTarget:null,channelTarget:null});assert.equal(slot(frame,'beam'),undefined);assert.equal(state.mysticCharges,0);
});

test('simple cast one-shots complete source animation at the edited rate without changing gameplay buff duration',()=>{
  for(const style of ['fighter','mystic','bruiser']){const state=Core.createState(style),cache=VFX.create(),visual={...Settings.defaults(style).visual,castPlaybackRate:2},clip=Layout.clipFor(visual.castResource),duration=Layout.visibleDuration(clip,style,'cast'),cast={key:1,at:0,impactAt:0,origin:{x:0,y:0},direction:{x:1,y:0},radius:100};state.time=0;VFX.update(cache,state,{skillCast:cast,castDuration:duration},visual);state.time=duration*.99/2;let frame=VFX.update(cache,state,{skillCast:cast,castDuration:duration},visual),source=Layout.entities(frame,visual,{style,hero:{x:0,y:0}}).find(entity=>entity.slot==='cast');assert(source,style);close(source.age,(clip.trimStart||0)+duration*.99);state.time=duration*1.01/2;frame=VFX.update(cache,state,{skillCast:cast,castDuration:duration},visual);assert.equal(frame.entities.find(entity=>entity.slot==='cast'),undefined);}
});

test('native volley and spear casts ignore a hidden second art rate so every contact keeps the same source timeline',()=>{
  for(const style of ['skirmisher','vanguard']){const settings=Settings.defaults(style),visual={...settings.visual,castPlaybackRate:3},state=Core.createState(style,settings),cache=VFX.create(),cast={key:1,at:0,origin:{x:0,y:0},direction:{x:1,y:0},radius:100},time=style==='skirmisher'?.3:.5;state.time=time;const frame=VFX.update(cache,state,{skillCast:cast,castDuration:10},visual),rendered=Layout.entities(frame,visual,{style,hero:{x:0,y:0}}).find(entity=>entity.slot==='cast');assert(rendered,style);const expected=style==='skirmisher'?Timeline.skirmisherSourceTime(time,state.tuning,visual):time*(4/3)/settings.duration;close(rendered.age,expected);}
});

test('native source formations start at only the explicit VFX delay while saved windup, contact delay and speed preserve every release',()=>{
  for(const contactDelay of [0,.3])for(const castDelay of [0,.4]){
    for(const windup of [0,2])for(const volleyPlayback of [.25,2]){
      const settings=Settings.defaults('skirmisher');Object.assign(settings,{contactDelay,windup,volleyPlayback});settings.visual.castDelay=castDelay;const clip=Layout.clipFor(settings.visual.castResource),state=Core.createState('skirmisher',settings),cache=VFX.create(),cast={key:1,at:0,origin:{x:0,y:0},direction:{x:1,y:0}},context={skillCast:cast,castDuration:clip.duration},age=time=>{state.time=time;return VFX.update(cache,state,context,settings.visual).entities.find(entity=>entity.slot==='cast')?.age;};
      if(castDelay)assert.equal(age(castDelay-.001),undefined);close(age(castDelay),windup+contactDelay>0?clip.trimStart:clip.sourceRelease);const first=Timeline.skirmisherReleaseTime(settings,settings.visual);if(first>castDelay)assert(age((first+castDelay)/2)>clip.trimStart);close(Timeline.skirmisherSourceTime(first,settings,settings.visual),clip.sourceRelease);
      for(const source of [clip.sourceRelease,.2,.4,clip.duration])close(Timeline.skirmisherSourceTime(first+(source-clip.sourceRelease)/volleyPlayback,settings,settings.visual),source);close(Timeline.skirmisherHitTime(settings,settings.visual),castDelay+contactDelay+settings.volleyHitTime);assert.equal(Timeline.skirmisherEvents(settings).filter(event=>event.type==='skirmisher-volley').length,1);
    }
    for(const duration of [.4,2.5]){
      const settings=Settings.defaults('vanguard');Object.assign(settings,{contactDelay,duration});settings.visual.castDelay=castDelay;const state=Core.createState('vanguard',settings),cache=VFX.create(),cast={key:1,at:0,origin:{x:0,y:0},direction:{x:1,y:0}},context={skillCast:cast,castDuration:4/3},age=time=>{state.time=time;return VFX.update(cache,state,context,settings.visual).entities.find(entity=>entity.slot==='cast')?.age;};if(castDelay)assert.equal(age(castDelay-.001),undefined);close(age(castDelay),0);const schedule=Timeline.vanguardSchedule(settings),sources=[.4333333333,.5333333333,.5666666667,.6333333333,.8666666667];for(const [index,time]of schedule.entries()){close(age(time+castDelay),sources[index]);close(Timeline.vanguardSourceTime(time+castDelay,settings,settings.visual),sources[index]);}
    }
  }
});

test('native VFX speed retimes the single arrow artwork independently of its one hit and preserves all five spear contact frames',()=>{
  const base=Settings.defaults('skirmisher'),fast={...base,volleyPlayback:2},cast={key:1,at:0,origin:{x:20,y:30},direction:{x:1,y:0}},release=Timeline.skirmisherReleaseTime(base,base.visual),clip=Layout.clipFor(base.visual.castResource);
  close(Timeline.skirmisherSourceTime(release+.2,base,base.visual),Timeline.skirmisherSourceTime(release+.1,fast,base.visual));close(Timeline.skirmisherHitTime(base,base.visual),Timeline.skirmisherHitTime(fast,base.visual));close(Timeline.skirmisherVFXEnd(fast,base.visual)-release,(clip.duration-clip.sourceRelease)/2);assert.equal(Timeline.arrowSegments,undefined,'No nine-path collision clock remains in the runtime');
  const spear=Settings.defaults('vanguard'),shorter={...spear,duration:spear.duration/2},normalContacts=Timeline.vanguardSchedule(spear),fastContacts=Timeline.vanguardSchedule(shorter);assert.equal(normalContacts.length,5);
  for(let index=0;index<5;index++){close(fastContacts[index],normalContacts[index]/2);const state=Core.createState('vanguard',shorter),cache=VFX.create();state.time=fastContacts[index];const frame=VFX.update(cache,state,{skillCast:{...cast,radius:155},castDuration:4/3},shorter.visual),art=Layout.entities(frame,shorter.visual,{style:'vanguard',hero:{x:0,y:0}}).find(entity=>entity.slot==='cast');assert(art);close(art.age,normalContacts[index]);}
});

test('saved rider speed multiplies whole-unit timing for active contacts while absent values preserve existing timing',()=>{
  for(const style of Settings.styles.map(row=>row.id))for(const factor of [undefined,.5,2]){
    const rates=[],applied=[],h=setup({GameToolsOverrides:{attackPlayback:()=>1.25,applyAttackPlayback(){},cancel(){}},HeroMakerRider:{skillTiming(_controller,animation,playback){rates.push(playback);return{animation:animation||'attack_'+style,playback,sourceHit:.2,sourceDuration:1,hit:playback>.0?.2/playback:Infinity,frozen:playback===0};},setAttackPlayback:(_controller,value)=>applied.push(value),retimeAttack(){}}});
    const hero={heroStyle:style,node:new Node('hero',h.g.ndMain),hp:800,hpMax:1000,attackRange:200,time:{Attack:0},ctrHp:{setHp(){}},ctrPlayAni:{setAttack(){},setBodyLeft(){}},getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>1,isDead(){return false;}};hero.node._combatGeneration=1;h.g.ctrPlay=hero;h.g.gameStatus=1;h.ui.isPauset=false;
    const config={HeroSkills:{[style]:{visual:factor===undefined?{}:{animationPlayback:factor}}}},Runtime=h.load('HeroStyleRuntime').Runtime,rt=new Runtime(hero,config);hero._styleRuntime=rt;rt.refresh();const timing=rt.timing(),expected=1.25*(style==='skirmisher'?1:factor===undefined?1:factor);close(timing.playback,expected);close(timing.hit,.2/expected);
    if(style!=='mystic'){assert(rt.cast({x:1,y:0}),style+' can cast');assert.equal(applied.length,style==='skirmisher'||factor===undefined?0:1);if(applied.length)close(applied[0],expected);}
    assert(rates.length);assert.equal(hero.getAttSpeed(),1,'Animation authoring does not alter attack-stat progression');
  }
});

test('the actual rider helper retimes every equipment layer and a stationary horse, leaving a moving horse on locomotion speed',()=>{
  const exported={},modules={HeroWeapons:require('../../assets/_script/HeroWeapons'),HeroSkillPose:require('../../assets/_script/HeroSkillPose'),HeroSkillAnimation:require('../../assets/_script/HeroSkillAnimation')};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/HeroMakerRider.js'),'utf8'),{exports:exported,require:name=>modules[name]||{}});
  for(const moving of [false,true])for(const native of [false,true]){
    const tracks=[],controller={isMove:moving};
    for(const key of ['spAniBody','spAniDrap','spAniHead','spAniBow','spAniArrow','spAniHand','spAniMa']){
      const value={animation:{name:key==='spAniMa'&&moving?'move':'attack_fighter'},loop:key==='spAniMa'&&moving,timeScale:1,trackTime:.2};if(native){value.getAnimation=()=>value.animation;value.getLoop=()=>value.loop;value.setTimeScale=rate=>{value.timeScale=rate;};}
      tracks.push([key,value]);controller[key]={getCurrent:()=>value};
    }
    assert.equal(exported.setAttackPlayback(controller,1.75),true);for(const [key,track]of tracks)close(track.timeScale,key==='spAniMa'&&moving?1:1.75);assert.equal(tracks.find(([key])=>key==='spAniMa')[1].animation.name,moving?'move':'attack_fighter');
    controller.spAniBody.getCurrent(0).loop=true;assert.equal(exported.setAttackPlayback(controller,2),false,'Looping idle/move tracks do not inherit an active cast rate');
  }
});

test('actual custom and impact render records sample independent speeds without moving hit feedback timing',()=>{
  const loads=[],reactions=[],exports={};
  class ViewNode{constructor(name){this.name=name;this.children=[];this.x=this.y=0;this.scaleX=this.scaleY=1;}setParent(parent){this.parent=parent;parent.children.push(this);}setPosition(value){this.x=value.x;this.y=value.y;}getPosition(){return{x:this.x,y:this.y};}convertToWorldSpaceAR(value){return{x:value.x+this.x,y:value.y+this.y};}convertToNodeSpaceAR(value){return{x:value.x-this.x,y:value.y-this.y};}addComponent(Type){const component=new Type();component.node=this;this.component=component;return component;}destroy(){this.destroyed=true;}}
  const cc={Node:ViewNode,Sprite:class{},SpriteFrame:class{},isValid:value=>!!value&&!value.destroyed,v2:(x,y)=>({x,y}),color:value=>value,assetManager:{loadAny(request,callback){loads.push({request,callback});}}},sp={Skeleton:class{setAnimation(_track,name,loop){return this.track={name,loop,trackTime:0,timeScale:1};}update(){this.appliedTime=this.track.trackTime;}},SkeletonData:class{}},modules={HeroSkillSettings:Settings,HeroSkillPose:require('../../assets/_script/HeroSkillPose'),HeroStyleSkills:Core,HeroSkillVFXState:VFX,HeroSkillVFXLayout:Layout,HeroSkillTimeline:Timeline};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/HeroSkillPresentation.js'),'utf8'),{exports,cc,sp,require:name=>name==='UnitHitFeedback'?{play:target=>reactions.push(target)}:modules[name.replace(/^\.\//,'')]||{}});
  const main=new ViewNode('main'),hero={node:new ViewNode('hero'),hp:1000,hpMax:1000},target={node:new ViewNode('enemy'),hp:1000},visual={...Settings.defaults('fighter').visual,resource:'11111111-1111-4111-8111-111111111111',resourceKind:'spine',resourceAnimation:'pulse',resourcePlaybackRate:.5,impactResource:'22222222-2222-4222-8222-222222222222',impactResourceKind:'spine',impactResourceAnimation:'pulse',impactDelay:.1,impactDuration:.6,impactPlaybackRate:2};hero.node.setParent(main);target.node.setParent(main);
  for(const slot of slots)visual[slot+'Resource']='';
  const runtime={settings:{visual,audio:{}},state:{style:'fighter',time:0},hero,heroGeneration:0,game:{ndMain:main,gameData:{},_combatEpoch:1},available:()=>true,effects:[{x:10,y:20,duration:1.2,remaining:1.2}],projectiles:[]},hud={visual:{node:main}};
  assert.equal(exports.deferHitReaction(runtime,target),true);exports.impact(runtime,target,{point:{x:100,y:50}});const item=runtime._presentation.impacts[0];close(item.at,.1);close(item.duration,.3);close(item.until,.4);exports.attachments(hud,runtime);assert.equal(loads.length,2);
  for(const load of loads)load.callback(null,{skeletonJson:{animations:{pulse:{}}}});runtime.state.time=.2;runtime.effects[0].remaining=1;exports.update(runtime);exports.attachments(hud,runtime);assert.equal(reactions.length,1);const primary=[...runtime._presentation.nodes.values()][0],impact=[...runtime._presentation.impactArt.nodes.values()][0];assert(primary.skeleton&&impact.skeleton);close(primary.skeleton.appliedTime,.1);close(impact.skeleton.appliedTime,.2);close(primary.node.x,10);close(primary.node.y,20);close(impact.node.x,100);close(impact.node.y,50);
  runtime.state.time=.4;runtime.effects[0].remaining=.8;exports.update(runtime);exports.attachments(hud,runtime);assert.equal(impact.node.destroyed,true,'The impact finishes its complete source clip at the selected playback speed');assert.equal(reactions.length,1,'Playback rate never restarts or delays an existing get-hit reaction');exports.clear(runtime);
});

test('preview duration retains slow custom and on-hit tails after the final planned contact',()=>{
  const custom=new Model('fighter',{buffDuration:1,visual:{resource:'fixture',effectDuration:2,resourcePlaybackRate:.05}},{mode:'active',attackRate:0,targetDistance:100,impactDelay:.4});assert(custom.duration()>=.4+2/.05+1,'The complete slow custom cast remains scrubbable');
  const feedback=new Model('bruiser',{visual:{impactDelay:1,impactDuration:2,impactPlaybackRate:.05}},{mode:'active',attackRate:0,targetDistance:100,impactDelay:.4}),before=feedback.duration();assert(before>=.4+1+2/.05+1);feedback.seek(.4);assert(feedback.hits>0);close(feedback.duration(),before);
  const authored=Settings.defaults('skirmisher');Object.assign(authored,{windup:3.25,contactDelay:1,volleyPlayback:.25});Object.assign(authored.visual,{castDelay:2,impactDelay:1.75,impactDuration:2,impactPlaybackRate:.1});const volley=new Model('skirmisher',authored,{mode:'active',attackRate:0,targetDistance:100}),lastContact=Timeline.skirmisherHitTime(volley.state.tuning,volley.settings.visual);assert(volley.duration()>=lastContact+1.75+2/.1+1,'The one delayed arc impact retains its full slowed source tail');
});

test('ordinary preview attacks have a fixed authoring horizon despite continuous later feedback events',()=>{
  const model=new Model('fighter',{visual:{impactDelay:1,impactDuration:2,impactPlaybackRate:.05}},{mode:'basic',attackRate:8,targetDistance:100,basicImpactDelay:.2}),duration=model.duration();assert(duration>=.2+1+2/.05+1);model.advance(20);assert(model.hits>10);assert.equal(model.duration(),duration,'A looping basic example cannot chase its most recent hit forever');
});

test('the cropped native source removes obsolete lead-in tuning while preserving old unknown saved values',t=>{
  assert.equal(Settings.descriptors('skirmisher').some(row=>row.path==='visual.castLeadInTrim'),false);assert.equal(Settings.defaults('skirmisher').visual.castLeadInTrim,undefined);
  for(const style of Settings.styles.map(row=>row.id)){const effective=Settings.defaults(style),fields=Object.values(Authoring.fields(style,'active',Settings.fields(style),effective,{vfx:[]})).flat();assert.equal(fields.some(row=>row.path==='visual.castLeadInTrim'),false);}
  const legacy={castLeadInTrim:0},f=fixture(t,legacy),before=f.bytes();assert.equal(f.service.save(f.req()).result.saved,false);assert.deepEqual(f.bytes(),before);f.service.change(f.req({style:'fighter',path:'cooldown',value:13}));f.service.save(f.req());for(const text of f.bytes())assert.deepEqual(JSON.parse(text).HeroSkills.skirmisher.visual,legacy,'An unrelated save preserves retired fields without reauthoring them');
});

test('retired blank-frame values cannot alter the single visible cast source clock or its independent hit',()=>{
  const settings=Settings.defaults('skirmisher'),base={...settings.visual,castLeadInTrim:0},legacy={...base,castLeadInTrim:.6},clip=Layout.clipFor(base.castResource);close(clip.trimStart,0);close(Timeline.skirmisherSourceTime(0,settings,base),0);close(Timeline.skirmisherSourceTime(settings.windup/2,settings,base),clip.sourceRelease/2);close(Timeline.skirmisherSourceTime(settings.windup,settings,base),clip.sourceRelease);
  for(const time of [-.1,0,.05,.2,.4,.6])close(Timeline.skirmisherSourceTime(time,settings,base),Timeline.skirmisherSourceTime(time,settings,legacy));close(Timeline.skirmisherVFXEnd(settings,base),Timeline.skirmisherVFXEnd(settings,legacy));close(Timeline.skirmisherHitTime(settings,base),Timeline.skirmisherHitTime(settings,legacy));
});

test('active cast VFX starts immediately or at its explicit delay while damage retains the separate impact marker',()=>{
  for(const style of ['fighter','mystic','bruiser'])for(const delay of [0,.25]){
    const settings=Settings.defaults(style);settings.visual.castDelay=delay;const model=new Model(style,settings,{mode:'active',attackRate:0,targetDistance:100,impactDelay:.8}),castEntity=()=>model.vfxFrame.entities.find(entity=>entity.slot==='cast');
    assert.equal(model.hits,0);assert.equal(!!castEntity(),delay===0,style+' onset at zero');if(delay){model.seek(delay-.001);assert.equal(castEntity(),undefined);model.seek(delay);assert(castEntity(),style+' explicit onset');}close(castEntity().age,0);
    const origin={...castEntity().origin};if(style==='mystic')assert.deepEqual(origin,{x:100,y:0},'Mystic formation begins at the marked target rather than the hero');model.seek(delay+.2);assert(castEntity());assert(model.hits===0,'Visible cast formation does not prematurely apply damage');model.seek(delay+.81);assert(model.hits>0,style+' applies damage at the saved impact marker');
  }
});

test('a lost Mystic target hides pre-impact formation while a completed lethal burst retains its full visual tail',()=>{
  const settings=Settings.defaults('mystic'),model=new Model('mystic',settings,{mode:'active',attackRate:0,targetDistance:100,impactDelay:.8});assert(model.vfxFrame.entities.some(entity=>entity.slot==='cast'));model.targets[0].hp=0;model.updateVFX();assert.equal(model.vfxFrame.entities.some(entity=>entity.slot==='cast'),false);model.advance(.81);assert.equal(model.hits,0);
  const landed=new Model('mystic',settings,{mode:'active',targets:1,attackRate:0,targetDistance:100,impactDelay:.1});landed.targets[0].hp=1;landed.advance(.8);assert.equal(landed.targets[0].hp,0);assert(landed.skillCast.impactAt!==undefined);landed.updateVFX();assert(landed.vfxFrame.entities.some(entity=>entity.slot==='cast'),'A successful hit retains the complete effect after its target dies');
});

test('retired repeat controls stay absent and inert while unrelated saves retain their unknown document values',t=>{
  const legacy={volleySecondStart:.9,volleyThirdStart:20,volleySecondPlayback:1.2,volleyThirdPlayback:.8,volleyBlend:.12},defaults=Settings.defaults('skirmisher');for(const key of Object.keys(legacy))assert.equal(defaults.visual[key],undefined);
  for(const style of Settings.styles.map(row=>row.id)){const fields=Object.values(Authoring.fields(style,'active',Settings.fields(style),Settings.defaults(style),{vfx:[]})).flat();for(const key of Object.keys(legacy))assert.equal(fields.some(field=>field.path==='visual.'+key),false);}
  const plain=new Model('skirmisher',defaults,{mode:'active',attackRate:0}),old=new Model('skirmisher',{...defaults,visual:{...defaults.visual,...legacy}},{mode:'active',attackRate:0});close(old.duration(),plain.duration());assert.equal(old.riderVolleyPose,undefined);const f=fixture(t,legacy),before=f.bytes();assert.equal(f.service.save(f.req()).result.saved,false);assert.deepEqual(f.bytes(),before);f.service.change(f.req({style:'fighter',path:'cooldown',value:13}));f.service.save(f.req());for(const [index,text]of f.bytes().entries()){const config=JSON.parse(text);assert.deepEqual(config.HeroSkills.skirmisher.visual,legacy);assert.equal(config.HeroSkills.fighter.extension,index?'mirror':'primary');assert.deepEqual(config.GameTools,JSON.parse(before[index]).GameTools);}
});
