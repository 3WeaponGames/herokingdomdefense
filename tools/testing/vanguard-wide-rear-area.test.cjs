'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Geometry=require('../../assets/_script/HeroSkillProjectile'),Settings=require('../../assets/_script/HeroSkillSettings'),Authoring=require('../../assets/_script/HeroSkillAuthoring');
const {Model}=require('../../packages/hkd-skills/preview-model'),{setup,Node}=require('./backend-gameplay-harness.cjs');
const Timeline=require('../../assets/_script/HeroSkillTimeline');
const point=(shape,along,across)=>({x:shape.origin.x+along*shape.direction.x-across*shape.direction.y,y:shape.origin.y+along*shape.direction.y+across*shape.direction.x});

test('Vanguard has a flat rear edge, widening sides and a circular outer cap across saved rotations, offsets and mirrored facings',()=>{
  for(const direction of [{x:1,y:0},{x:-1,y:0},{x:.6,y:.8},{x:-.6,y:.8}])for(const rotation of [0,27,-43]){
    const shape=Geometry.area('vanguard',{x:20,y:45},{offsetX:7,offsetY:-11,rotation,scale:1.2,arcDegrees:72,arcStartWidth:120},direction,155),end=shape.radius*Math.cos(shape.halfAngle),rear=shape.startWidth/2,outer=shape.radius*Math.sin(shape.halfAngle),side=along=>rear+(outer-rear)*along/end;
    for(const [along,across,expected]of [[0,0,true],[0,rear,true],[0,rear+.01,false],[-.01,0,false],[end/2,side(end/2)-.01,true],[end/2,side(end/2)+.01,false],[shape.radius,0,true],[shape.radius+.01,0,false],[end,outer-.01,true],[end,outer+.01,false]])assert.equal(Geometry.containsArea(shape,point(shape,along,across)),expected,JSON.stringify({direction,rotation,along,across}));
    const cone=Geometry.area('vanguard',{x:20,y:45},{offsetX:7,offsetY:-11,rotation,scale:1.2,arcDegrees:72,arcStartWidth:0},direction,155);assert.equal(Geometry.containsArea(cone,point(cone,0,20)),false,'Explicit zero keeps a pointed cone');
  }
});

test('the rear width is Vanguard-only authoring and leaves Fighter arcs and circular style areas unchanged',()=>{
  const defaults=Settings.defaults('vanguard'),field=Settings.visualFields.find(row=>row.path==='visual.arcStartWidth');assert(field);assert.equal(defaults.visual.arcStartWidth,120);assert(Settings.valid(field,0));assert(Settings.valid(field,200));assert.equal(Settings.valid(field,-1),false);
  for(const style of Settings.styles.map(row=>row.id)){const paths=Object.values(Authoring.fields(style,'active',Settings.fields(style),Settings.defaults(style),{vfx:[]})).flat().map(row=>row.path);assert.equal(paths.includes('visual.arcStartWidth'),style==='vanguard');if(style!=='vanguard'){const shape=Geometry.area(style,{x:0,y:0},{arcStartWidth:300}, {x:1,y:0},155);assert.equal(shape.startWidth,0);}}
});

test('all five spear contacts use the same widened rear boundary in editor and battle at slow and fast frame rates',()=>{
  const origin={x:0,y:70},offsets=[{x:0,y:55},{x:60,y:70},{x:150,y:0},{x:-2,y:0},{x:0,y:61}],positions=offsets.map(row=>({x:origin.x+row.x,y:origin.y+row.y}));
  for(const facing of [-1,1])for(const fps of [10,60]){
    const settings=Settings.defaults('vanguard');settings.visual.rotation=0;settings.visual.arcStartWidth=120;const targets=positions.map(row=>({x:row.x*facing,y:row.y})),model=new Model('vanguard',settings,{mode:'active',targets:5,targetPositions:targets,targetDistance:100,attackRate:0,attackRange:135,direction:facing>0?0:180,manualAim:true},undefined,undefined,()=>origin),preview=[];const previewHit=model.hit;model.hit=function(target,...args){preview.push(target.id);return previewHit.call(this,target,...args);};
    const h=setup({HeroMakerRider:{weaponOrigin:()=>origin,skillTiming:()=>({animation:'attack',playback:1,sourceHit:.1667,sourceDuration:.8333,hit:.1667,frozen:false}),setCombatState(){},retimeAttack(){},clearCombatState(){},releaseChargedAttack(){}},HeroSkillHUD:{update(){},clear(){}}}),hero={heroStyle:'vanguard',node:new Node('hero',h.g.ndMain),hp:1000,hpMax:1000,attackRange:135,time:{Attack:0},ctrHp:{setHp(){}},ctrPlayAni:{setAttack(){},setBodyLeft(){}},getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>1,isDead:()=>false};hero.node._combatGeneration=1;h.g.ctrPlay=hero;h.g.gameStatus=1;h.ui.isPauset=false;
    for(const [id,at]of targets.entries()){const enemy={id,node:new Node('enemy',h.g.ndMain,at.x,at.y),hp:100000,isDead:()=>false};enemy.node._combatGeneration=1;h.d.enemyList.push(enemy);}const Runtime=h.load('HeroStyleRuntime').Runtime,rt=new Runtime(hero,{HeroSkills:{vanguard:settings}});hero._styleRuntime=rt;const battle=[];rt.hit=function(target){battle.push(target.id);return 1;};assert(rt.cast({x:facing,y:0}));for(let frame=0;frame<Math.ceil(1.5*fps);frame++){model.advance(1/fps);rt.update(1/fps);}
    const counts=list=>offsets.map((_row,id)=>list.filter(value=>value===id).length);assert.deepEqual(counts(preview),[5,5,5,0,0],'Preview hits all eligible enemies on each source contact');assert.deepEqual(counts(battle),counts(preview),'Battle and authoring use identical rear, side and cap boundaries');
  }
});

test('a walking Vanguard translates each contact and its VFX from hero ground while the captured direction, offset and size remain locked',()=>{
  for(const fps of [10,60]){
    const settings=Settings.defaults('vanguard');Object.assign(settings.visual,{offsetX:13,offsetY:-7,rotation:23,arcDegrees:50,arcStartWidth:100});
    const bow={x:30,y:70},h=setup({HeroMakerRider:{weaponOrigin:()=>bow,skillTiming:()=>({animation:'attack',playback:1,sourceHit:.1667,sourceDuration:.8333,hit:.1667,frozen:false}),setCombatState(){},retimeAttack(){},clearCombatState(){}},HeroSkillHUD:{update(){},clear(){}}}),hero={heroStyle:'vanguard',node:new Node('hero',h.g.ndMain),hp:1000,hpMax:1000,attackRange:135,time:{Attack:0},ctrHp:{setHp(){}},ctrPlayAni:{setAttack(){},setBodyLeft(){}},getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>0,isDead:()=>false};hero.node._combatGeneration=1;h.g.ctrPlay=hero;h.g.gameStatus=1;h.ui.isPauset=false;
    const shape=Geometry.area('vanguard',bow,settings.visual,{x:1,y:0},155),start=point(shape,60,0),later={x:start.x+300,y:start.y+25},outside=point(shape,60,150),targets=[start,later,outside],battle=[];
    for(const [id,at]of targets.entries()){const enemy={id,node:new Node('enemy',h.g.ndMain,at.x,at.y),hp:100000,isDead:()=>false};enemy.node._combatGeneration=1;h.d.enemyList.push(enemy);}const rt=new(h.load('HeroStyleRuntime').Runtime)(hero,{HeroSkills:{vanguard:settings}});hero._styleRuntime=rt;rt.hit=function(target){battle.push({id:target.id,time:this.state.time});return 1;};assert(rt.cast({x:1,y:0}));
    const model=new Model('vanguard',settings,{mode:'basic',targets:3,targetPositions:targets,attackRate:0,attackRange:135,manualAim:true},undefined,undefined,()=>bow);let ground={x:0,y:0};model.positionAt=()=>({...ground});assert(model.cast());
    const captured={direction:{...rt.skillCast.direction},radius:rt.skillCast.radius,halfAngle:rt.skillCast.halfAngle,startWidth:rt.skillCast.startWidth},offset={...rt.skillCast.groundOffset},contacts=Timeline.vanguardSchedule(settings),advanceTo=at=>{while(model.time<at-1e-9){const dt=Math.min(1/fps,at-model.time);model.advance(dt);rt.update(dt);}};
    advanceTo(contacts[0]);assert.deepEqual(battle.map(row=>row.id),[0]);assert.equal(model.hits,1);
    ground={x:300,y:25};hero.node.x=300;hero.node.y=25;bow.x=-900;bow.y=900;rt.aimDirection={x:-1,y:0};model.scenario.direction=180;
    for(const at of contacts.slice(1)){
      advanceTo(at);const actual=rt.vanguardCastShape();assert.deepEqual({...actual.direction},captured.direction);assert.equal(actual.radius,captured.radius);assert.equal(actual.halfAngle,captured.halfAngle);assert.equal(actual.startWidth,captured.startWidth);assert.deepEqual({...actual.origin},{x:ground.x+offset.x,y:ground.y+offset.y});assert.deepEqual(model.skillCast.origin,{...actual.origin});assert.deepEqual(model.vfxContext.skillCast.origin,{...actual.origin});
    }
    assert.deepEqual(battle.map(row=>row.id),[0,1,1,1,1],'The first enemy leaves the translated hit area; the new enemy receives only later contacts');assert.deepEqual(model.events.filter(row=>row.kind==='impact'&&row.skill).map(row=>row.target),battle.map(row=>row.id));for(const [i,row]of battle.entries())assert(Math.abs(row.time-contacts[i])<1e-6);
  }
});
