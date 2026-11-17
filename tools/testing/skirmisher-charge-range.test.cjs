'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,hero,Node}=require('./backend-gameplay-harness.cjs');
const Skills=require('../../assets/_script/HeroStyleSkills'),Settings=require('../../assets/_script/HeroSkillSettings');
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function scene(style='skirmisher',tuning={}){
 const h=setup({GameToolsOverrides:{cancel(){},attack(){},attackPlayback:()=>1},BattleSounds:{attack(){}},HeroMakerRider:{projectileOrigin:()=>({x:0,y:0}),setCombatState(){},clearCombatState(){},releaseChargedAttack(){}},HeroSkillHUD:{clear(){}}}),p=hero(h);
 p.heroStyle=style;p.node.setParent(h.g.ndMain);p.node._combatGeneration=1;p.hp=100;p.attack=20;p.critDam=1.5;p.attNum=1;
 p.getSpeed=()=>300;p.getAttack=()=>20;p.isDead=()=>false;
 h.g.gameStatus=1;h.g._combatEpoch=1;h.ui.isPauset=false;h.d.heroStyle=style;
 const config={HeroSkills:{[style]:tuning}};h.load('HeroStyleRuntime').install(p,config);const rt=p._styleRuntime;rt.refresh();
 function enemy(x){const e={node:new Node('enemy',h.g.ndMain,x,0),hp:100,isDead:()=>false};e.node._combatGeneration=1;h.d.enemyList.push(e);return e;}
 return {...h,p,rt,enemy,config};
}

test('charge grows the real acquisition range and ring together at every charge level',()=>{
 const h=scene(),inside=h.enemy(249),outside=h.enemy(301),before=JSON.stringify(h.config);
 for(const charge of [0,.25,.5,.75,1]){
  h.rt.state.charge=charge;h.rt.update(0);const range=200*(1+charge*.5);
  close(h.p.getAttackRange(),range);close(h.p.ndRange.scale*h.p.ndRange.width/2,range);
  assert.equal(h.rt.nearest(),range>=249?inside:null);close(h.p.attackRange,200,'base equipment range cannot compound');
 }
 assert.equal(JSON.stringify(h.config),before);assert(outside);
});

test('a fully charged basic shot acquires and releases beyond base range before resetting the ring',()=>{
 const h=scene(),target=h.enemy(275),shots=[];h.rt.state.charge=1;h.p.refreshAttackRange();
 h.p.doAttackStart=()=>{};h.p.onFindEnemy();assert.equal(h.p.tagEnemy,target,'expanded ring must represent real acquisition');
 h.g.onPlayAttack=enemy=>shots.push({enemy,range:h.p.getAttackRange(),charge:h.p._styleShotCharge,damage:h.p.getAttack()});
 h.p.doAttack();assert.equal(shots.length,1);assert.equal(shots[0].enemy,target);close(shots[0].range,300);close(shots[0].charge,1);close(shots[0].damage,30);
 close(h.rt.state.charge,0);close(h.p.getAttackRange(),200);close(h.p.ndRange.scale,1);assert.equal(h.p._styleShotRange,undefined);
 h.p.doAttack();assert.equal(shots.length,1,'an uncharged shot must not retain the extended reach');
});

test('movement input, resets and live stat changes update charge reach without modifying the base',()=>{
 const h=scene();h.rt.state.charge=1;h.rt.update(0);h.p.attackRange=240;h.rt.update(0);close(h.p.getAttackRange(),360);close(h.p.ndRange.scale,1.8);
 h.p._relicMoving=true;close(h.p.getAttackRange(),240);h.rt.update(.01);close(h.rt.state.charge,0);close(h.p.ndRange.scale,1.2);
 h.p._relicMoving=false;h.rt.state.charge=1;h.rt.update(0);h.rt.clear(true);close(h.p.getAttackRange(),240);close(h.p.ndRange.scale,1.2);
});

test('charged range is authorable including zero and other fighting styles retain their reach',()=>{
 assert(Settings.fields('skirmisher').tuning.some(f=>f.key==='chargedRange'));
 for(const value of [0,.2,1]){const h=scene('skirmisher',{chargedRange:value});h.rt.state.charge=1;h.rt.update(0);close(h.p.getAttackRange(),200*(1+value));close(h.p.ndRange.scale,1+value);}
 for(const style of ['fighter','vanguard','mystic','bruiser','guardian']){const h=scene(style);h.rt.state.charge=1;h.p.refreshAttackRange();close(h.p.getAttackRange(),200);close(h.p.ndRange.scale,1);}
 const state=Skills.createState('skirmisher');Skills.step(state,2,{moving:false});close(Skills.bonuses(state).range,.25);
});

test('failed or retired release callbacks cannot leave charge reach or fire into a replacement lifetime',()=>{
 for(const action of ['throw','replacement','reset','epoch']){
  const h=scene(),shots=[];h.enemy(275);h.rt.state.charge=1;h.p.refreshAttackRange();h.g.onPlayAttack=target=>shots.push(target);
  h.e.stubs.HeroMakerRider.releaseChargedAttack=()=>{
   if(action==='throw')throw Error('disposed renderer');
   if(action==='replacement'){h.p.node._combatGeneration++;h.load('HeroStyleRuntime').install(h.p,h.config);}
   if(action==='reset')h.rt.clear(true);
   if(action==='epoch')h.g._combatEpoch++;
  };
  if(action==='throw')assert.throws(()=>h.p.doAttack(),/disposed renderer/);else h.p.doAttack();
  assert.deepEqual(shots,[]);close(h.p.getAttackRange(),200);close(h.p.ndRange.scale,1);assert.equal(h.p._styleShotRange,undefined);close(h.p._styleShot,1);
 }
});

test('holding full charge does not repeatedly dirty a native Float32 ring transform',()=>{
 const h=scene();let scale=1,writes=0;Object.defineProperty(h.p.ndRange,'scale',{get:()=>scale,set:value=>{writes++;scale=Math.fround(value);}});
 h.p.attackRange=304;h.p.ndRange.width=605;h.rt.state.charge=1;h.p.refreshAttackRange();
 for(let i=0;i<120;i++)h.p.refreshAttackRange();assert.equal(writes,1);assert(Math.abs(scale*605/2-456)<.0001);
});
