'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Settings=require('../../assets/_script/HeroSkillSettings');
const Descriptions=require('../../assets/_script/HeroSkillDescriptions');
const Geometry=require('../../assets/_script/HeroSkillProjectile');
const {Model}=require('../../packages/hkd-skills/preview-model');
const {setup,Node}=require('./backend-gameplay-harness.cjs');

const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const angles=[-30,-15,0,15,30];
const origin={x:20,y:40};
const along=(length,degrees=0)=>({
  x:origin.x+length*Math.cos(degrees*Math.PI/180),
  y:origin.y+length*Math.sin(degrees*Math.PI/180)
});

function scene(overrides={}){
  const attacks=[],releases=[],retimes=[];
  const h=setup({
    HeroMakerRider:{
      skillTiming:()=>({animation:'attack',playback:1,sourceHit:.1667,sourceDuration:.8333,hit:.1667}),
      skillOrigin:()=>origin,retimeAttack(_controller,seconds){retimes.push(seconds);},
      releaseChargedAttack(){releases.push(rt.state.time);},setCombatState(){},clearCombatState(){}
    },
    HeroSkillHUD:{update(){},clear(){}}
  });
  const hero={heroStyle:'skirmisher',node:new Node('hero',h.g.ndMain),hp:1000,hpMax:1000,crit:-1,attackRange:500,
    time:{Attack:0},ctrPlayAni:{arrName:'lv1',setAttack(){attacks.push(rt.state.time);},setBodyLeft(){}},
    getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>0,isDead(){return this.hp<=0;}};
  hero.node._combatGeneration=1;h.g.ctrPlay=hero;h.g.gameStatus=1;h.ui.isPauset=false;
  const saved={windup:.2,volleyRange:350,...overrides,visual:{arcDegrees:60,...overrides.visual}};
  const config={HeroSkills:{skirmisher:saved}},rt=new(h.load('HeroStyleRuntime').Runtime)(hero,config);
  hero._styleRuntime=rt;rt.refresh();
  const impacts=[];
  function enemy(id,at){
    const actor={id,node:new Node(id,h.g.ndMain,at.x,at.y),hp:10000,isDead(){return this.hp<=0;},
      onAttacked(damage,_owner,_secondary,context){
        impacts.push({id,damage,at:context.styleImpactAt,strike:context.styleStrike});
        assert.equal(context.styleSkill,true);
        this.hp-=damage;
        if(this.afterHit)this.afterHit();
        return damage;
      }};
    actor.node._combatGeneration=1;h.d.enemyList.push(actor);
    return actor;
  }
  return {...h,rt,hero,config,enemy,impacts,attacks,releases,retimes};
}

test('one release spawns five native arrows in a symmetric spread and ignores legacy cast art and hit time',()=>{
  const oldClip=require('../../assets/_script/HeroSkillVFXCatalog').clips.find(clip=>clip.id==='skirmisher-triple-volley');
  const f=scene({volleyHitTime:0,arrowsPerVolley:20,contactDelay:.05,visual:{castDelay:.1,castResource:oldClip.uuid}});
  const before=JSON.stringify(f.config);
  assert.equal(f.rt.settings.visual.castResource,'');
  assert.match(Descriptions.render('skirmisher','active',f.rt.settings),/five arrows.*100% bow damage.*first enemy/);
  assert(f.rt.cast({x:1,y:0}));
  assert.deepEqual(f.attacks,[0]);close(f.retimes[0],.35);
  f.rt.update(.34);
  assert.equal(f.g.ndPlayArr2.length,0);
  f.rt.update(.01);
  assert.equal(f.g.ndPlayArr2.length,5);
  assert.equal(f.releases.length,1);close(f.releases[0],.35);
  f.rt.projectiles.forEach((arrow,index)=>{
    close(arrow.x,origin.x);close(arrow.y,origin.y);
    close(Math.atan2(arrow.direction.y,arrow.direction.x)*180/Math.PI,angles[index]);
    assert.equal(arrow.bullet.speed,500);
    assert.equal(arrow.bullet.tagNode,null);
    assert(arrow.bullet._projectileVisual);
    arrow.bullet.onUpdate(1);
    close(arrow.bullet.node.x,origin.x);
  });
  f.rt.update(.7);
  assert.equal(f.g.ndPlayArr2.length,0);
  assert.equal(f.g.ndPlayArr1.length,5);
  assert.equal(f.rt.effects.length,0);
  assert.equal(JSON.stringify(f.config),before);
});

test('every ray stops on its first contact for full base damage across frame sizes',()=>{
  for(const times of [[1],Array(100).fill(.01)]){
    const f=scene();
    f.enemy('behind',along(330));
    f.enemy('between',along(300,7.5));
    f.enemy('outside',along(400,30));
    angles.forEach(angle=>f.enemy(angle,along(220+angle,angle)));
    f.rt.state.charge=1;
    assert(f.rt.cast({x:1,y:0}));
    for(const dt of times)f.rt.update(dt);
    assert.deepEqual(f.impacts.map(row=>row.id),angles);
    assert.equal(new Set(f.impacts.map(row=>row.strike)).size,5);
    for(const hit of f.impacts){
      assert.equal(hit.damage,100);
      close(hit.at,.2+(220+hit.id-Geometry.arrowHitRadius)/500);
    }
    assert.equal(f.rt.projectiles.length,0);
    assert.equal(f.g.ndPlayArr1.length,5);
  }
});

test('moving the selected target after launch leaves straight paths and preview collision times intact',()=>{
  const f=scene(),target=f.enemy('moves',along(250)),other=along(270);
  const settings=Settings.effective('skirmisher',f.config);
  const model=new Model('skirmisher',settings,{mode:'active',attackRate:0,targets:2,targetPositions:[along(250),other]},
    undefined,()=>origin);
  f.enemy('intercepts',other);f.rt.setAimTarget(target);
  assert(f.rt.cast({x:1,y:0}));
  f.rt.update(.22);model.advance(.22);
  assert.equal(f.rt.projectiles.length,5);assert.equal(model.projectiles.length,5);
  target.node.y=500;model.moveTarget(0,{x:270,y:500});
  f.rt.update(.8);model.advance(.8);
  assert.deepEqual(f.impacts.map(hit=>hit.id),['intercepts']);
  const contact=model.events.find(event=>event.kind==='impact'&&event.skill);
  close(contact.time,f.impacts[0].at);
  assert.equal(model.damage,100);
  assert.equal(model.projectiles.length,0);
});

test('impact callbacks can retire all remaining arrows and stale shots never free reused pooled nodes',()=>{
  const f=scene(),first=f.enemy('first',along(175));
  f.enemy('later',along(275,30));
  first.afterHit=()=>f.rt.clear(true);
  assert(f.rt.cast({x:1,y:0}));f.rt.update(1);
  assert.deepEqual(f.impacts.map(hit=>hit.id),['first']);
  assert.equal(f.g.ndPlayArr2.length,0);
  assert.equal(f.g.ndPlayArr1.length,5);
  assert(f.rt.cast({x:1,y:0}));f.rt.update(.2);
  assert.equal(f.g.ndPlayArr2.length,5);
  f.g.cleanMap();f.rt.update(.1);
  assert.equal(f.g.ndPlayArr2.length,0);assert.equal(f.g.ndPlayArr1.length,5);
});
