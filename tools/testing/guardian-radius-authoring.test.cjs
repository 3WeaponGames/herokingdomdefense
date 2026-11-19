'use strict';
// Authoring, real combat and presentation share Guardian's two independent
// radii. No game configuration or progress is written by these checks.
const {test}=require('node:test'),assert=require('node:assert/strict');
const Settings=require('../../assets/_script/HeroSkillSettings'),Core=require('../../assets/_script/HeroStyleSkills');
const VFXLayout=require('../../assets/_script/HeroSkillVFXLayout');
const {Model}=require('../../packages/hkd-skills/preview-model'),{setup,Node}=require('./backend-gameplay-harness.cjs');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(settings={}){
 const h=setup({HeroMakerRider:{setCombatState(){},clearCombatState(){},skillTiming(){return{hit:.1667};},weaponOrigin:()=>({x:20,y:30})},HeroSkillHUD:{clear(){}},HeroSkillPresentation:{queue(){},release(){},update(){},clear(){},advanceVFX(){}}});h.g.gameStatus=1;h.ui.isPauset=false;h.d.heroStyle='guardian';
 const hero={heroStyle:'guardian',node:new Node('hero',h.g.ndMain),hp:1000,hpMax:1000,attackRange:1000,time:{Attack:0},ctrHp:{setHp(){}},ctrPlayAni:{setAttack(){},setBodyLeft(){}},isDead(){return false;},getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>1,onUpdata(){},doAttack(){},doAttackFinish(){},onRestart(){},endRoundGame(){},onDead(){},onDestroy(){}};hero.node._combatGeneration=1;h.g.ctrPlay=hero;h.load('HeroStyleRuntime').install(hero,{HeroSkills:{guardian:settings}});
 const actor=(x,y=0)=>({node:new Node('actor',h.g.ndMain,x,y),hp:1000,isDead(){return false;}});
 return{...h,hero,rt:hero._styleRuntime,actor};
}
test('Guardian radius defaults and saved numeric fields are validated without staging defaults or changing other data',()=>{
 const config={HeroSkills:{guardian:{tauntRadius:120,allyRadius:340,future:9}},GameTools:{timings:{hero:{attack:.2}}}},before=structuredClone(config),effective=Settings.effective('guardian',config);
 assert.equal(effective.tauntRadius,120);assert.equal(effective.allyRadius,340);assert.deepEqual(config,before);
 const fields=Settings.fields('guardian').tuning;for(const key of ['tauntRadius','allyRadius']){const field=fields.find(f=>f.path===key);assert(field);assert.equal(field.unit,'units');assert.equal(Settings.valid(field,1),true);assert.equal(Settings.valid(field,2000),true);assert.equal(Settings.valid(field,0),false);assert.equal(Settings.valid(field,Infinity),false);assert.equal(Settings.valid(field,2001),false);}
 assert.equal(Core.guardianRadius({},'tauntRadius'),250);assert.equal(Core.guardianRadius(undefined,'allyRadius'),250);assert.equal(Settings.defaults('guardian').tauntRadius,250);assert.equal(Settings.defaults('guardian').allyRadius,250);
});
test('authored taunt radius, world offset and area scale agree at the real combat and preview boundary even with a longer attack range',()=>{
 const saved={tauntRadius:100,allyRadius:50,visual:{scale:2,offsetX:7,offsetY:-2}},f=fixture(saved),edge=f.actor(227,28),outside=f.actor(227.01,28);f.d.enemyList.push(edge,outside);
 assert.equal(f.rt.cast({x:1,y:0}),true);assert(edge._heroTaunt);assert.equal(outside._heroTaunt,undefined);near(f.rt.skillCast.radius,200);near(f.rt.effects[0].radius,200);near(f.rt.effects[0].x,27);near(f.rt.effects[0].y,28);
 const model=new Model('guardian',Settings.effective('guardian',{HeroSkills:{guardian:saved}}),{mode:'basic',attackRange:1000,targets:2,targetPositions:[{x:227,y:28},{x:227.01,y:28}]},undefined,undefined,()=>({x:20,y:30}));assert(model.cast());assert.deepEqual(model.taunts.map(t=>t.target.id),[0]);near(model.skillCast.radius,f.rt.skillCast.radius);near(model.effects[0].radius,f.rt.effects[0].radius);near(model.effects[0].x,f.rt.effects[0].x);near(model.effects[0].y,f.rt.effects[0].y);
});
test('protected ally radius is independent of taunt area size and changes actual damage reduction at the same inclusive boundary',()=>{
 const f=fixture({tauntRadius:100,allyRadius:75,allyReduction:.2,visual:{scale:10}}),inside=f.actor(75),outside=f.actor(75.01),combat=f.load('RelicCombat');
 near(combat.allyIncoming(inside,100),80);near(combat.allyIncoming(outside,100),100);
 f.rt.state.tuning.allyRadius=150;near(combat.allyIncoming(outside,100),80);f.rt.state.tuning.allyReduction=0;near(combat.allyIncoming(inside,100),100);
 const legacy=fixture();near(legacy.load('RelicCombat').allyIncoming(legacy.actor(250),100),90);near(legacy.load('RelicCombat').allyIncoming(legacy.actor(250.01),100),100);
});

test('the taunt ring follows the location of a delayed taunt in combat and preview',()=>{
 const f=fixture({tauntRadius:90,visual:{castDelay:.3}});
 f.e.stubs.HeroMakerRider.weaponOrigin=()=>({x:f.hero.node.x+20,y:30});
 const edge=f.actor(180,30),outside=f.actor(180.01,30);f.d.enemyList.push(edge,outside);
 let previewOffset={x:20,y:30};
 const model=new Model('guardian',f.rt.settings,{mode:'basic',attackRate:0,targetPositions:[{x:180,y:30},{x:180.01,y:30}]},undefined,undefined,()=>previewOffset);
 assert(f.rt.cast({x:1,y:0}));assert(model.cast());
 model.advance(.2);f.rt.update(.2);
 assert(!model.vfxFrame.entities.some(entity=>entity.slot==='cast'));assert.equal(f.rt.skillCast.impactAt,undefined);
 f.hero.node.x=70;previewOffset={x:90,y:30};
 model.advance(.11);f.rt.update(.11);
 near(f.rt.skillCast.impactAt,.3);assert(edge._heroTaunt);assert(!outside._heroTaunt);
 assert.deepEqual(model.taunts.map(record=>record.target.id),[0]);
 const ring=VFXLayout.entities(model.vfxFrame,model.settings.visual,model.vfxContext).find(entity=>entity.slot==='cast');
 assert(ring.behind);near(ring.x,f.rt.skillCast.origin.x);near(ring.y,f.rt.skillCast.origin.y);
 near(ring.scale*ring.clip.cell,2*f.rt.skillCast.radius);
});
test('preview protection membership follows the authored radius and suppresses its aura when protection is disabled',()=>{
 const settings=Settings.defaults('guardian');settings.allyRadius=75;const model=new Model('guardian',settings,{mode:'basic'});model.allies=[{id:'edge',x:75,y:0,hp:1000},{id:'outside',x:75.01,y:0,hp:1000}];model.updateVFX();assert.deepEqual(model.vfxContext.presenceTargets.map(t=>t.id),['edge']);
 model.state.tuning.allyRadius=100;model.updateVFX();assert.deepEqual(model.vfxContext.presenceTargets.map(t=>t.id),['edge','outside']);model.state.tuning.allyReduction=0;model.updateVFX();assert.equal(model.vfxContext.presenceTargets.length,0);
});
