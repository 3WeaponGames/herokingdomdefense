'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Timeline=require('../../assets/_script/HeroSkillTimeline'),Paths=require('../../assets/_script/HeroSkillArrowPaths');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(options={}){
 const overrides={HeroMakerRider:{setCombatState(){},clearCombatState(){},skillTiming(){return{hit:.1667};},skillOrigin(){return{x:0,y:0};}},HeroSkillPresentation:{queue(){},release(){},update(){},clear(){},advanceVFX(){}}};
 if(options.timeline)overrides.HeroSkillTimeline=options.timeline;
 const h=setup(overrides);h.g.gameStatus=1;h.g.mapSize={width:2000,height:1000};h.ui.isPauset=false;
 const hero={heroStyle:'skirmisher',node:new Node('hero',h.g.ndMain),hp:1000,hpMax:1000,attackRange:500,crit:-1,time:{Attack:0},ctrPlayAni:{setAttack(){},setBodyLeft(){}},isDead(){return false;},getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>1,onUpdata(){},doAttack(){},doAttackFinish(){},onRestart(){},endRoundGame(){},onDead(){},onDestroy(){}};
 hero.node._combatGeneration=1;h.g.ctrPlay=hero;h.load('HeroStyleRuntime').install(hero,{});const rt=hero._styleRuntime,events=[];
 Object.assign(rt.settings.visual,{castTrajectory:'skirmisher-atx117',castScale:.16,castRotation:Paths.defaultRotation});Object.assign(rt.state.tuning,{chargeRate:0,projectileWidth:1});
 function enemy(id,x,y){const actor={id,node:new Node(id,h.g.ndMain,x,y),hp:10000,isDead(){return this.hp<=0;},onAttacked(n,_hero,_flag,context){this.hp-=n;events.push({id,at:context.styleImpactAt,damage:n});if(options.onHit)options.onHit(id,actor,actors,hero,rt);return n;}};actor.node._combatGeneration=1;h.d.enemyList.push(actor);return actor;}
 const actors={A:enemy('A',88.1340574788426,24.380408879795382),B:enemy('B',83.68184963379524,-21.906041248125092)};
 return{h,hero,rt,events,actors};
}
function run(frames,onHit){const f=fixture({onHit});assert(f.rt.cast({x:1,y:0}));for(const dt of frames)f.rt.update(dt);return f;}
test('all native arrows commit contacts in actual global time order under every frame partition',()=>{
 const long=run([2]),split=run([.745,1.255]),fine=run(Array(120).fill(1/60));
 assert.equal(long.events[0].id,'B');assert.equal(long.events[1].id,'A');near(long.events[0].at,.7420321144418267);near(long.events[1].at,.7486716361287631);
 for(const other of [split,fine]){assert.deepEqual(other.events.map(e=>e.id),long.events.map(e=>e.id));assert.equal(other.events.length,long.events.length);other.events.forEach((e,i)=>{near(e.at,long.events[i].at);near(e.damage,long.events[i].damage);});}
 for(let i=1;i<long.events.length;i++)assert(long.events[i].at>=long.events[i-1].at-1e-9);
});
test('a contact callback moving another target invalidates its pending old-position hit',()=>{
 function move(id,_actor,actors){if(id==='B'){actors.A.node.x=-1500;actors.A.node.y=-1500;}}
 const long=run([2],move),split=run([.745,1.255],move);assert(long.events.length>0);assert(!long.events.some(e=>e.id==='A'));assert.deepEqual(long.events.map(e=>e.id),split.events.map(e=>e.id));
});
test('replacement nodes and retired casts cannot receive contacts queued for earlier identities',()=>{
 const replaced=run([2],(id,_actor,actors,_hero,rt)=>{if(id==='B'&&actors.A.node.name==='A'){actors.A.node=new Node('replacement',rt.game.ndMain,-1500,-1500);actors.A.node._combatGeneration=1;}});assert(!replaced.events.some(e=>e.id==='A'));
 const retired=run([2],(id,_actor,_actors,hero)=>{if(id==='B')hero.onRestart();});assert.deepEqual(retired.events.map(e=>e.id),['B']);assert.equal(retired.rt.skillCast,null);
});
test('contact frontier clips elapsed paths and permits a new generation only at its current or future position',()=>{
 const segments=[{index:0,from:{x:0,y:0},to:{x:10,y:0},launch:{x:0,y:0},radius:1,fromAt:.74,at:.75},{index:1,from:{x:0,y:10},to:{x:10,y:10},launch:{x:0,y:10},radius:1,fromAt:.74,at:.75}],a={id:'A',point:{x:8,y:0}},b={id:'B',point:{x:3,y:10}},seen=new Set();
 let next=Timeline.nextArrowContact(segments,[a,b],.74,(index,r)=>seen.has(index+':'+r.id));assert.equal(next.record,b);near(next.at,.742);seen.add('1:B');a.point={x:.5,y:0};assert.equal(Timeline.nextArrowContact(segments,[a,b],next.at,(index,r)=>seen.has(index+':'+r.id)),null);
 a.point={x:3,y:0};next=Timeline.nextArrowContact(segments,[a,b],next.at,(index,r)=>seen.has(index+':'+r.id));near(next.at,.742);near(next.travelled,2);
});
test('native rider direction stays on the captured barrage when its selected target moves',()=>{
 const f=fixture();assert(f.rt.cast({x:1,y:0}));const captured={...f.rt.state.active.direction};f.rt.pendingArrowAim={target:f.actors.A,node:f.actors.A.node,generation:1,point:{x:100,y:0},direction:{x:1,y:0}};f.actors.A.node.x=0;f.actors.A.node.y=400;f.rt.update(.1);near(f.rt.state.active.direction.x,captured.x);near(f.rt.state.active.direction.y,captured.y);
});
test('reentrant recycling has a finite per-update contact budget',()=>{
 const segment={index:0,from:{x:0,y:0},to:{x:1,y:0},launch:{x:0,y:0},radius:1,fromAt:0,at:1};let hits=0;
 const f=fixture({timeline:{...Timeline,arrowSegments:()=>[segment]},onHit(_id,actor){hits++;actor.hp=10000;actor.node._combatGeneration++;}});f.h.d.enemyList.splice(1);f.actors.A.node.x=f.actors.A.node.y=0;assert(f.rt.cast({x:1,y:0}));f.rt.skillCast.damageMultiplier=1;f.rt.state.time=1;f.rt.updateAuthoredArrows(1);assert.equal(hits,10000);
});
