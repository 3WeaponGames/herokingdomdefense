'use strict';
// Editor-to-runtime contract tests. All config writes use disposable external
// fixtures, and AudioSource is an inert silent adapter, never a real device.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {SkillService,FILES}=require('../../packages/hkd-skills/service'),Settings=require('../../assets/_script/HeroSkillSettings'),Core=require('../../assets/_script/HeroStyleSkills');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const uuid='9a829c08-d8be-4e8c-8b14-f03fb57af508',close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function save(t,edits,extra={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-skill-contract-'));
 t.after(()=>{const target=path.resolve(root);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert(path.basename(target).startsWith('hkd-skill-contract-'));fs.rmSync(target,{recursive:true,force:true});});
 const config={GameTools:{timingDefaults:{'hero:hero:default':{attack:.1667}},timings:{'hero:hero:default':{attack:.25}},extension:{keep:true}},EquipCfg:[{id:1,extension:'retain'}],...extra};
 for(const relative of FILES){const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');}
 const service=new SkillService(root,{catalogs:{audio:[{id:uuid,uuid,file:'assets/KinghtFallAudio/sfx/skill.ogg',bundle:'KinghtFallAudio',path:'sfx/skill'}],vfx:[]},describe:()=>({layers:[{animations:['attack','attack_fighter','attack_mystic'],json:{animations:Object.fromEntries(['attack','attack_fighter','attack_mystic'].map(name=>[name,{events:[{name:'attack',time:.1667}]}]))}}]})});
 for(const [style,field,value]of edits)service.change({style,path:field,value,version:service.version,revision:service.revision});
 const result=service.save({version:service.version,revision:service.revision});
 const published=JSON.parse(fs.readFileSync(path.join(root,FILES[0]),'utf8'));
 assert.deepEqual(published.GameTools,config.GameTools,'the skill editor must never retime authored attacks');assert.deepEqual(published.EquipCfg,config.EquipCfg);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,FILES[1]),'utf8')),published);
 return {service,config:published,result};
}
function audioFixture(){
 const pending=[],uuidLoads=[],writes=[],states={ERROR:-1,INITIALIZING:0,PLAYING:1,PAUSED:2,STOPPED:3};
 class Source{constructor(){this.state=states.STOPPED;this.plays=0;this.volume=1;this.loop=false;this.mute=true;this.audio={getState:()=>this.state,destroy:()=>{this.destroyed=true;}};}get isPlaying(){return this.state===states.PLAYING;}play(){assert(this.clip);this.state=states.PLAYING;this.plays++;}stop(){this.state=states.STOPPED;}pause(){if(this.isPlaying)this.state=states.PAUSED;}resume(){if(this.state===states.PAUSED)this.state=states.PLAYING;}}
 const modules={BaseMgr:{default:function(){}},CacheUtils:{CacheUtils:{getData:()=>null,saveData:(...args)=>writes.push(args),canPlayEffect:()=>true,canPlayMusin:()=>true}},LogMgr:{LogMgr:{getInstance:()=>({error(){}})}},ResourceMgr:{ResourceMgr:{getInstance:()=>({loadRes(bundle,file,_type,callback){pending.push({bundle,file,callback});}})}}};
 const cc={AudioSource:Source,AudioClip:function(){},_Audio:{State:states},game:{on(){},EVENT_HIDE:'hide',EVENT_SHOW:'show'},isValid:value=>!!value&&!value.destroyed,assetManager:{loadAny(request,callback){uuidLoads.push({request,callback});}}};
 const exports={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/AudioMgr.js'),'utf8'),{exports,require:name=>modules[name],cc,setTimeout,clearTimeout,console,__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;}},{filename:'AudioMgr.js'});
 const manager=exports.AudioMgr.getInstance();manager.init({});manager.effectVolume=.5;
 return {module:exports,manager,pending,uuidLoads,writes};
}
function scene(style,config,audio,legacyArrow=true){
 const poses=[],animations=[];
 const h=setup({...(audio?{AudioMgr:audio.module}:{}),HeroMakerRider:{setCombatState(_ani,state){poses.push({...state});},clearCombatState(){}},HeroSkillHUD:{update(){},clear(){}},KinghtFallNavigation:{moveManual(actor,_game,p){actor.node.setPosition(p);return true;}}});
 h.g.gameStatus=1;h.g.mapSize={width:2000,height:1000};h.g._combatEpoch=7;h.ui.isPauset=false;h.d.heroStyle=style;
 const hero={heroStyle:style,node:new Node('hero',h.g.ndMain),hp:500,hpMax:1000,attackRange:200,crit:-1,critDam:1.5,time:{Attack:0},_relicHero:true,_heroSecondary:{},ctrHp:{setHp(){}},
  ctrPlayAni:{setAttack(){animations.push(this._skillAnimationOverride||'default');},setBodyLeft(){}},isDead(){return this.hp<=0;},getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>1,getCriticalDamage:()=>1.5,
  onUpdata(){},doAttack(){this.lastBasicDamage=this.getAttack();},doAttackFinish(){},addBuff(){},onRestart(){},endRoundGame(){},onDead(){},onDestroy(){}};
 hero.node._combatGeneration=1;h.g.ctrPlay=hero;h.load('HeroStyleRuntime').install(hero,config);const rt=hero._styleRuntime;rt.refresh();
 if(style==='skirmisher'&&legacyArrow){rt.settings.visual.castTrajectory='';rt.state.tuning.volleys=1;rt.state.tuning.arrowsPerVolley=1;}
 function enemy(x=100){const target={node:new Node('target',h.g.ndMain,x,0),hp:100000,hpMax:100000,debuffInfo:[],hits:[],isDead(){return this.hp<=0;},addBuff(type,data){this.debuffInfo.push({type,data,time:0,timeMax:data.time});},onAttacked(damage,owner,secondary,context){const combat=h.load('RelicCombat');damage=combat.enemyDamage(this,damage,owner,secondary,context);this.hits.push({damage,ownerHp:owner.hp});this.hp-=damage;if(!secondary)combat.primaryImpact(this,owner,context,damage);return damage;}};target.node._combatGeneration=1;h.d.enemyList.push(target);return target;}
 return {...h,hero,rt,enemy,poses,animations};
}
test('authored on-hit feedback delays the ordinary enemy reaction once while basic and active HP damage stays immediate',()=>{
 for(const skill of [false,true]){
  const h=scene('vanguard',{HeroSkills:{vanguard:{visual:{impactDelay:.4,impactResource:uuid,impactDuration:.8,impactOffsetY:30}}}}),target=h.enemy(),reactions=[];
  h.e.cc.resources={};h.e.stubs.UnitHitFeedback={play:actor=>reactions.push(actor)};target.onAttacked=h.e.load('KinghtFallEnemyBase').default.prototype.onAttacked;
  const before=target.hp,damage=h.rt.hit(target,1,skill,7);assert(damage>0);close(target.hp,before-damage);assert.equal(reactions.length,0);assert.equal(h.rt._presentation.feedback.length,1);assert.equal(h.rt._presentation.impacts.length,1);
  h.rt.update(.399);assert.equal(reactions.length,0);h.rt.update(.001);assert.deepEqual(reactions,[target]);h.rt.update(.1);assert.equal(reactions.length,1);close(target.hp,before-damage,'Presentation callbacks cannot apply damage again');
 }
});
test('no saved on-hit delay retains one immediate get-hit reaction and secondary procs do not enter the delayed primary path',()=>{
 for(const style of Settings.styles){const h=scene(style.id,{}),target=h.enemy(),reactions=[];h.e.cc.resources={};h.e.stubs.UnitHitFeedback={play:actor=>reactions.push(actor)};target.onAttacked=h.e.load('KinghtFallEnemyBase').default.prototype.onAttacked;
  h.rt.hit(target,0,true,0);assert.equal(reactions.length,0);assert.equal(h.rt._presentation,undefined);h.rt.hit(target,1,true,1);assert.deepEqual(reactions,[target]);assert.equal(h.rt._presentation.feedback.length,0);assert.equal(h.rt._presentation.impacts.length,1);h.rt.settings.visual.impactDelay=.5;target.onAttacked(5,h.hero,true);assert.equal(reactions.length,2);assert.equal(h.rt._presentation.feedback.length,0);assert.equal(h.rt._presentation.impacts.length,1);
 }
});
test('a pooled target cancels authored delayed reactions while preserving the damage already dealt',()=>{
 const h=scene('fighter',{HeroSkills:{fighter:{visual:{impactDelay:.5}}}}),target=h.enemy(),reactions=[];h.e.cc.resources={};h.e.stubs.UnitHitFeedback={play:actor=>reactions.push(actor)};target.onAttacked=h.e.load('KinghtFallEnemyBase').default.prototype.onAttacked;
 h.rt.hit(target,1,true,1);const hp=target.hp;target.node._combatGeneration++;h.rt.update(1);assert.equal(reactions.length,0);assert.equal(target.hp,hp);assert.equal(h.rt._presentation.feedback.length,0);
});
test('saving tuned Vanguard count and duration changes actual independently timed attacks, not shared timing tables',t=>{
 const saved=save(t,[['vanguard','strikes',3],['vanguard','duration',1.2],['vanguard','cooldown',20]]),h=scene('vanguard',saved.config),enemy=h.enemy();
 assert.equal(h.rt.cast({x:1,y:0}),true);h.rt.update(.399);assert.equal(enemy.hits.length,0);h.rt.update(.001);assert.equal(enemy.hits.length,1);h.rt.update(.4);h.rt.update(.4);assert.equal(enemy.hits.length,3);assert.equal(h.rt.state.active,null);close(h.rt.state.cooldown,18.8);assert.equal(h.poses.at(-1).rapid,false);assert.equal(h.animations.length,1,"VFX multihits use one rider cast");
});
test('legacy active projectile artwork cannot create extra fan hits or change ordinary attack configuration',()=>{
 const asset={id:'part:test-arrow',uuid,bundle:'resources',path:'projectiles/test-arrow',kind:'sprite',rotation:90},results=[];for(const chosen of [false,true]){const visual=chosen?{projectile:asset.id,projectileAsset:asset}:{},h=scene('skirmisher',{HeroSkills:{skirmisher:{windup:0,volleyHitTime:.2,chargeRate:0,visual}}}),target=h.enemy(100);h.rt.cast({x:1,y:0});h.rt.update(.199);assert.equal(target.hits.length,0);h.rt.update(.001);results.push({area:JSON.parse(JSON.stringify(h.rt.skillCast.area)),damage:target.hits.map(hit=>hit.damage),range:h.hero.attackRange});assert.equal(h.rt.projectiles.length,0);}assert.deepEqual(results[0],results[1]);assert.equal(results[0].damage.length,1);
});

test('saved fan windup, actual hit time, range and artwork playback reach runtime independently',t=>{
 const saved=save(t,[['skirmisher','windup',.6],['skirmisher','volleyHitTime',.35],['skirmisher','volleyRange',320],['skirmisher','volleyPlayback',.5]]),h=scene('skirmisher',saved.config),target=h.enemy(300),outside=h.enemy(330);h.rt.cast({x:1,y:0});h.rt.update(.349);assert.equal(target.hits.length,0);h.rt.update(.001);assert.equal(target.hits.length,1);assert.equal(outside.hits.length,0);close(h.rt.skillCast.area.radius,320);assert.equal(h.rt.projectiles.length,0);assert.equal(h.rt.skillCast.released,undefined);h.rt.update(.25);assert.equal(h.rt.skillCast.released,true);assert.equal(h.rt.settings.volleyPlayback,.5);assert.equal(h.hero.node.x,0);
});

test('the saved fan origin is the equipped bow and runtime and preview share its fixed area at every frame size',t=>{
 const {Model}=require('../../packages/hkd-skills/preview-model');for(const angle of [0,Math.PI/4])for(const step of [1.2,.01]){const tune={windup:.2,volleyHitTime:.2,volleyRange:250,chargedDamage:0,chargeRate:0,distanceDamagePer100:.1,visual:{}},h=scene('skirmisher',{HeroSkills:{skirmisher:tune}}),bow={x:30,y:100},d={x:Math.cos(angle),y:Math.sin(angle)};h.e.stubs.HeroMakerRider.skillOrigin=()=>bow;const hit=h.enemy(bow.x+d.x*100),miss=h.enemy(bow.x+d.x*100-d.y*50);hit.node.y=bow.y+d.y*100;miss.node.y=bow.y+d.y*100+d.x*50;const m=new Model('skirmisher',tune,{mode:'active',targets:2,attackRate:0,direction:angle*180/Math.PI,manualAim:true},undefined,()=>bow);Object.assign(m.targets[0],{x:hit.node.x,y:hit.node.y});Object.assign(m.targets[1],{x:miss.node.x,y:miss.node.y});assert(h.rt.cast(d));close(h.rt.skillCast.area.origin.x,bow.x);close(h.rt.skillCast.area.origin.y,bow.y);let remaining=1.2;while(remaining>1e-9){const dt=Math.min(step,remaining);h.rt.update(dt);m.advance(dt);remaining-=dt;}assert.equal(hit.hits.length,1);assert.equal(miss.hits.length,0);close(m.damage,hit.hits[0].damage);close(m.events.find(e=>e.kind==='impact').time,.2);assert.equal(h.rt.projectiles.length,0);}
});

test('runtime captures one fan aim at cast and a target can dodge before its actual hit deadline',()=>{
 const h=scene('skirmisher',{HeroSkills:{skirmisher:{windup:.2,volleyHitTime:.4}}}),target=h.enemy(200);h.e.stubs.HeroMakerRider.skillOrigin=()=>({x:30,y:100});h.rt.setAimTarget(target);assert(h.rt.cast(h.rt.aimDirection));const shape=JSON.parse(JSON.stringify(h.rt.skillCast.area));target.node.y=300;h.rt.update(.5);assert.deepEqual(JSON.parse(JSON.stringify(h.rt.skillCast.area)),shape);assert.equal(target.hits.length,0);assert.equal(h.rt.projectiles.length,0);const still=scene('skirmisher',{HeroSkills:{skirmisher:{volleyHitTime:.4}}}),enemy=still.enemy(200);assert(still.rt.cast({x:1,y:0}));still.rt.update(.5);assert.equal(enemy.hits.length,1);
});

test('equipped melee weapon origins and authored shape changes drive the actual runtime hit area',()=>{
 for(const style of ['fighter','vanguard','guardian']){
  const h=scene(style,{HeroSkills:{[style]:{duration:1,strikes:1,knockback:0,visual:{offsetY:20,scale:.5,arcDegrees:40}}}}),weapon={x:40,y:80};h.e.stubs.HeroMakerRider.weaponOrigin=(_controller,chosen)=>{assert.equal(chosen,style);return weapon;};
  const inside=h.enemy(80),outside=h.enemy(210);inside.node.y=outside.node.y=100;assert(h.rt.cast({x:1,y:0}));h.rt.update(style==='vanguard'?1:.2);const e=h.rt.effects[0];assert(e,style);close(e.x,40);close(e.y,100);close(e.radius,(style==='guardian'?250:200)*.5);assert.equal(e.resolved,true);if(style==='guardian'){assert.equal(h.rt.taunted.length,1);assert.equal(h.rt.taunted[0].enemy,inside);}else{assert.equal(inside.hits.length,1);assert.equal(outside.hits.length,0);}
 }
});

test('saved Mystic animation and hold frame are sent to real runtime animation control while damage stays single target',t=>{
 const saved=save(t,[['mystic','visual.animation','attack_mystic'],['mystic','visual.holdTime',.25],['mystic','slow',.35]]),h=scene('mystic',saved.config),enemy=h.enemy(),nearby=h.enemy(110);
 h.rt.update(1);assert.equal(enemy.hits.length,1);assert.equal(nearby.hits.length,0);assert.equal(h.rt.projectiles.length,0);assert.equal(h.poses.at(-1).animation,'attack_mystic');assert.equal(h.poses.at(-1).holdTime,.25);assert.equal(h.poses.at(-1).beam,true);close(enemy.debuffInfo[0].data.subNum,.35);
});
test('saved Bruiser sacrifice and VFX lifetime affect the actual cleave and expire on gameplay time',t=>{
 const saved=save(t,[['bruiser','sacrifice',.25],['bruiser','visual.effectDuration',1.25]]),h=scene('bruiser',saved.config),enemy=h.enemy();
 h.rt.cast({x:1,y:0});assert.equal(h.hero.hp,375);assert.equal(enemy.hits.length,0);assert.equal(h.rt.effects.length,0);h.rt.update(.1667);assert.equal(enemy.hits[0].ownerHp,375);close(h.rt.effects[0].duration,1.25);h.rt.update(1.24);assert.equal(h.rt.effects.length,1);h.rt.update(.02);assert.equal(h.rt.effects.length,0);
});
test('saved Fighter animation/buff and Guardian shield values survive the editor-to-runtime boundary',t=>{
 const saved=save(t,[['fighter','visual.animation','attack_fighter'],['fighter','buffDuration',8],['fighter','buffAttackRate',.7],['guardian','shieldHealth',.5],['guardian','shieldDuration',7]]);
 const fighter=scene('fighter',saved.config);fighter.enemy();fighter.rt.cast({x:1,y:0});assert.equal(fighter.animations[0],'attack_fighter');close(fighter.hero.getAttSpeed(),1.7);close(fighter.rt.state.buffRemaining,8);
 const guardian=scene('guardian',saved.config);guardian.rt.cast();close(guardian.rt.state.shield,500);close(guardian.rt.state.shieldRemaining,7);guardian.rt.update(7);assert.equal(guardian.rt.state.shield,0);
});
test('no saved HeroSkills retains every original tuning default and starts no authored sound',()=>{
 const audio=audioFixture(),before=JSON.stringify(Core.DEFAULTS);
 for(const style of Settings.styles){const h=scene(style.id,{},audio,false);for(const [key,value]of Object.entries({...Core.DEFAULTS.common,...Core.DEFAULTS[style.id]}))assert.equal(h.rt.state.tuning[key],value);h.enemy();h.rt.update(1);if(h.rt.canCast())h.rt.cast({x:1,y:0});h.rt.update(.5);}
 assert.equal(audio.pending.length,0);assert.equal(audio.uuidLoads.length,0);assert.equal(audio.manager.audioSourceMap.size,0);assert.equal(JSON.stringify(Core.DEFAULTS),before);assert.deepEqual(audio.writes,[]);
});
test('saved SFX resolves the actual bundle path through AudioMgr after gameplay delay and applies volume once',t=>{
 const saved=save(t,[['guardian','audio.cast.clip',uuid],['guardian','audio.cast.volume',.4],['guardian','audio.cast.delay',.5]]),audio=audioFixture(),h=scene('guardian',saved.config,audio);
 h.rt.cast();h.rt.update(.49);assert.equal(audio.pending.length,0);h.rt.update(.01);assert.equal(audio.pending.length,1);assert.equal(audio.pending[0].bundle,'KinghtFallAudio');assert.equal(audio.pending[0].file,'sfx/skill');assert.equal(audio.uuidLoads.length,0);
 audio.pending[0].callback({name:'skill',loaded:true});const source=[...audio.manager.audioSourceMap.values()][0];assert.equal(source.plays,1);close(source.volume,.2);assert.equal(source.mute,true);assert.deepEqual(audio.writes,[]);
});
test('a late sound load cannot play after owner recycling or explicit runtime cleanup',t=>{
 const saved=save(t,[['guardian','audio.cast.clip',uuid]]);
 for(const cleanup of [h=>h.hero.node._combatGeneration++,h=>h.hero.endRoundGame()]){
  const audio=audioFixture(),h=scene('guardian',saved.config,audio);h.rt.cast();h.rt.update(.01);const source=[...audio.manager.audioSourceMap.values()][0];cleanup(h);audio.pending[0].callback({name:'late',loaded:true});assert.equal(source.plays,0);assert.equal(source.mute,true);assert.deepEqual(audio.writes,[]);
 }
});
test('legacy UUID-only authored SFX uses loadAny but obeys the same real AudioMgr owner guards',()=>{
 for(const retired of [false,true]){const audio=audioFixture(),h=scene('guardian',{HeroSkills:{guardian:{audio:{cast:{clip:uuid,volume:.6,delay:0}}}}},audio);h.rt.cast();h.rt.update(.01);assert.equal(audio.uuidLoads.length,1);assert.equal(audio.uuidLoads[0].request.uuid,uuid);assert.equal(audio.pending.length,0);const source=[...audio.manager.audioSourceMap.values()][0];if(retired)h.g._combatEpoch++;audio.uuidLoads[0].callback(null,{name:'uuid skill',loaded:true});assert.equal(source.plays,retired?0:1);if(!retired)close(source.volume,.3);assert.equal(source.mute,true);}
});

test('Vanguard preview and gameplay share post-expiry strike snapshots and zero-damage inheritance',()=>{
 const {Model}=require('../../packages/hkd-skills/preview-model');
 for(const strikeDamage of [.5,0]){const tune={duration:1,strikes:2,buffDuration:.5,chargeDecay:0,strikeDamage},h=scene('vanguard',{HeroSkills:{vanguard:tune}}),enemy=h.enemy(),m=new Model('vanguard',tune,{mode:'active',targets:1,targetDistance:100,attackRate:1});h.rt.state.charge=.75;assert(h.rt.cast({x:1,y:0}));h.rt.update(1);m.advance(1);close(100000-enemy.hp,m.damage);close(h.rt.state.buffRemaining,m.state.buffRemaining);close(h.rt.state.charge,m.state.charge);close(h.rt.state.cooldown,m.state.cooldown);assert.equal(m.events.filter(e=>e.kind==='impact').length,enemy.hits.filter(e=>e.damage>0).length);}
});

test('Mystic preview and gameplay agree on retarget residue and integrated live source playback',()=>{
 const {Model}=require('../../packages/hkd-skills/preview-model'),h=scene('mystic',{}),a=h.enemy(100),b=h.enemy(110),m=new Model('mystic',{}, {mode:'basic',targets:2,targetDistance:100,attackRate:2,holdSource:.2,attackPlayback:1});a.hp=50;b.hp=150;m.targets[0].hp=50;Object.assign(m.targets[1],{x:110,y:0,hp:150});h.hero.getAttSpeed=()=>2;h.rt.timing=()=>({playback:1,sourceHit:.2,sourceDuration:1,hit:.2,frozen:false});h.rt.update(1.4);m.advance(1.4);close(Math.max(0,a.hp),m.targets[0].hp);close(Math.max(0,b.hp),m.targets[1].hp);close(h.rt.beamClock,m.attackClock);close(h.rt.beamSourceTime,m.channelSourceTime);assert.equal(h.rt.state.mysticCharges,m.state.mysticCharges);
 const live=scene('mystic',{}),target=live.enemy(),preview=new Model('mystic',{}, {mode:'basic',targets:1,targetDistance:100,attackRate:2,holdSource:.6,attackPlayback:1});let playback=1;live.hero.getAttSpeed=()=>2;live.rt.timing=()=>({playback,sourceHit:.6,sourceDuration:1,hit:playback>0?.6/playback:Infinity,frozen:playback===0});
 for(const [dt,rate]of [[.2,1],[1,0],[.199,2],[.001,2],[.1,2]]){playback=rate;preview.scenario.attackPlayback=rate;live.rt.update(dt);preview.advance(dt);close(live.rt.beamSourceTime,preview.channelSourceTime);close(live.rt.beamClock,preview.attackClock);close(100000-target.hp,preview.damage);assert.equal(!!live.rt.beamTarget,preview.beam);}
});

test('actual Skirmisher and preview share one fan boundary, distance scaling and exact hit time across frame sizes',()=>{
 const {Model}=require('../../packages/hkd-skills/preview-model'),Geometry=require('../../assets/_script/HeroSkillProjectile'),tune={windup:0,volleyHitTime:.2,volleyRange:250,chargeRate:0,chargedDamage:0,distanceDamagePer100:.1,visual:{arcDegrees:16}};for(const point of [{x:100,y:0},{x:100,y:12},{x:100,y:16},{x:250,y:0},{x:251,y:0},{x:-10,y:0}])for(const step of [1.2,.01]){const h=scene('skirmisher',{HeroSkills:{skirmisher:tune}}),enemy=h.enemy(point.x),m=new Model('skirmisher',tune,{mode:'active',targets:1,targetDistance:point.x,attackRate:0,manualAim:true});enemy.node.y=point.y;Object.assign(m.targets[0],point);assert(h.rt.cast({x:1,y:0}));const inside=Geometry.containsArea(h.rt.skillCast.area,point);let remaining=1.2;while(remaining>1e-9){const dt=Math.min(step,remaining);h.rt.update(dt);m.advance(dt);remaining-=dt;}const damage=enemy.hits.reduce((n,h)=>n+h.damage,0),expected=inside?80*(1+Math.hypot(point.x,point.y)/100*.1):0;close(damage,expected);close(m.damage,expected);assert.equal(m.hits,inside?1:0);assert.equal(enemy.hits.length,m.hits);if(inside)close(m.events.find(e=>e.kind==='impact').time,.2);assert.equal(h.rt.projectiles.length,0);}
});
