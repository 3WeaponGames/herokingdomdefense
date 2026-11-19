'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 const h=setup(),hero={node:new Node('hero',h.g.ndMain),hp:500,hpMax:1000,isDead(){return this.hp<=0;},_relicHero:true,_heroSecondary:{lifeSteal:.5},_styleRuntime:{onImpact(){}}};
 hero.node._combatGeneration=1;h.g.ctrPlay=hero;
 function enemy(x=10,y=0,hp=1000){const actor={node:new Node('enemy',h.g.ndMain,x,y),hp,hpMax:hp,hits:[],isDead(){return this.hp<=0;},onAttacked(damage){this.hits.push(damage);this.hp-=damage;return damage;}};actor.node._combatGeneration=1;h.d.enemyList.push(actor);return actor;}
 return {...h,hero,enemy,combat:h.load('RelicCombat')};
}
test('lifesteal snapshots actual removed HP before a style callback changes target health',()=>{
 for(const replacementHp of [0,1000]){const h=fixture(),e=h.enemy(10,0,50),c=h.combat.primaryContext(h.hero,e,100,false);e.hp-=100;h.hero._styleRuntime.onImpact=()=>e.hp=replacementHp;h.combat.primaryImpact(e,h.hero,c,100);assert.equal(h.hero.hp,525);}
});
test('replacing the current hero retires old primary contexts even in the same epoch',()=>{
 const h=fixture(),e=h.enemy(),c=h.combat.primaryContext(h.hero,e,100,false);h.g.ctrPlay={...h.hero,node:new Node('replacement',h.g.ndMain)};assert.equal(h.combat.primaryCurrent(c,e,h.hero),false);h.combat.primaryImpact(e,h.hero,c,100);assert.equal(h.hero.hp,500);
});

test('primary relic contexts reject replaced native nodes even when their generation numbers match',()=>{
 for(const change of [h=>{h.hero.node=new Node('new hero',h.g.ndMain);h.hero.node._combatGeneration=1;},h=>{h.target.node=new Node('new victim',h.g.ndMain);h.target.node._combatGeneration=1;},h=>{h.target.node.destroyed=true;},h=>{h.target.destroyed=true;}]){
  const h=fixture(),target=h.enemy(),context=h.combat.primaryContext(h.hero,target,100,false);h.target=target;change(h);target.hp-=100;h.combat.primaryImpact(target,h.hero,context,100);assert.equal(h.hero.hp,500);
 }
 const h=fixture(),target=h.enemy(),context=h.combat.primaryContext(h.hero,target,100,false);target.node=new Node('replacement',h.g.ndMain);target.node._combatGeneration=1;assert.equal(h.combat.primaryCurrent(context,target,h.hero),false);
});

test('secondary impacts cannot apply old primary perks to a replaced node and critical haste stays with its original hero node',()=>{
 const h=fixture(),target=h.enemy(),neighbor=h.enemy(20);let slows=0;h.hero._heroSecondary={splashDamage:.5,splashRadius:100};h.d.getGameBuff=id=>id===50015?{Pamer:[.3]}:null;target.addBuff=()=>slows++;
 neighbor.onAttacked=()=>{target.node=new Node('replacement',h.g.ndMain);target.node._combatGeneration=1;return 50;};
 const context=h.combat.primaryContext(h.hero,target,100,false);h.combat.enemyDamage(target,100,h.hero,false,context);target.hp-=100;h.combat.primaryImpact(target,h.hero,context,100);assert.equal(slows,0);
 const g=fixture(),victim=g.enemy();g.d.heroStyle='fighter';g.d.treasureAdd[120014]=[.12];const critical=g.combat.primaryContext(g.hero,victim,100,true);g.combat.enemyDamage(victim,100,g.hero,false,critical);victim.hp-=100;g.combat.primaryImpact(victim,g.hero,critical,100);assert.equal(g.combat.heroHaste(g.hero),.12);
 g.hero.node=new Node('replacement hero',g.g.ndMain);g.hero.node._combatGeneration=1;assert.equal(g.combat.heroHaste(g.hero),0);g.combat.updateHero(g.hero,.01);assert.equal(g.hero._relicHaste,undefined);
});
test('frozen-control cleanup skips disposed native renderers and restores surviving ones',()=>{
 const h=fixture(),e=h.enemy(),disposed={destroyed:true,set paused(_){throw Error('Disposed native renderer');}},live={paused:true};e._relicPausedRenderers=[{renderer:disposed,wasPaused:false},{renderer:live,wasPaused:false}];h.combat.releaseControl(e);assert.equal(live.paused,false);assert.equal(e._relicPausedRenderers,undefined);
});
test('applying freeze skips disposed native renderers before reading their pause state',()=>{
 const h=fixture(),e=h.enemy(),live={paused:false,timeScale:1};e.spAni={destroyed:true,get paused(){throw Error('Disposed native pause getter');},set paused(_){throw Error('Disposed native pause setter');}};e.spAni2=live;e.onUpdate=()=>{};
 assert(h.load('RelicRuntime').applyControl(e,1));assert.doesNotThrow(()=>h.combat.updateEnemy(e,.1));assert.equal(live.paused,true);h.combat.releaseControl(e);assert.equal(live.paused,false);
});

test('secondary hit feedback skips pooled targets and disposed effects while retaining committed damage',()=>{
 for(const retire of ['pooled','effect','effectNode','none']){
  const h=fixture(),target=h.enemy(),neighbor=h.enemy(20);h.hero._heroSecondary={splashDamage:.5,splashRadius:100};let feedback=0;
  const effects={node:new Node('effects',h.g.ndMain),showDamageNum(){if(effects.destroyed||effects.node.destroyed)throw Error('Disposed effects');feedback++;}};h.ui.ctrEffect=effects;
  neighbor.onAttacked=damage=>{neighbor.hits.push(damage);neighbor.hp-=damage;if(retire==='pooled'){neighbor._isPooled=true;neighbor.node.active=false;}else if(retire==='effect')effects.destroyed=true;else if(retire==='effectNode')effects.node.destroyed=true;return damage;};
  const context=h.combat.primaryContext(h.hero,target,100,false);h.combat.enemyDamage(target,100,h.hero,false,context);target.hp-=100;
  assert.doesNotThrow(()=>h.combat.primaryImpact(target,h.hero,context,100),retire);assert.deepEqual(neighbor.hits,[50],retire);assert.equal(feedback,retire==='none'?1:0,retire);
 }
});

test('Mirror keeps last-hit reflection after ordinary death but cannot credit a replacement hero life',()=>{
 const changes={node:h=>{h.hero.node=new Node('replacement',h.g.ndMain);h.hero.node._combatGeneration=1;},generation:h=>h.hero.node._combatGeneration++,pooled:h=>h.hero._isPooled=true,death:h=>h.hero.hp=0};
 for(const boundary of ['healing','mirror-cue'])for(const[name,change]of Object.entries(changes)){
  const h=fixture(),source=h.enemy();h.d.heroStyle='guardian';h.d.treasureAdd[120040]=[.12];h.d.treasureAdd[120043]=[.16];h.hero.hp=200;source.cfg={AttackType:2};
  if(boundary==='healing')h.hero.ctrHp={setHp(){change(h);}};
  else {h.e.cc.resources={};h.e.stubs.BattleSounds={effect(id){if(id==='mirror-reflect')change(h);}};}
  h.combat.afterHeroHit(h.hero,50,source);assert.deepEqual(source.hits,name==='death'?[6]:[],boundary+'/'+name);
 }
});

test('Vampire quota uses the original maximum HP and its cue stays in the healing hero lifetime',()=>{
 for(const change of ['stats','node','generation','epoch']){
  const h=fixture(),target=h.enemy(10,0,1),sounds=[];h.d.heroStyle='bruiser';h.d.treasureAdd[120042]=[.01];h.hero.hpMax=100;h.hero.hp=20;h.e.cc.resources={};h.e.stubs.BattleSounds={effect(id){sounds.push(id);}};
  h.hero.ctrHp={setHp(){h.hero.hpMax=200;if(change==='node'){h.hero.node=new Node('replacement',h.g.ndMain);h.hero.node._combatGeneration=1;}else if(change==='generation')h.hero.node._combatGeneration++;else if(change==='epoch')h.g._combatEpoch=(h.g._combatEpoch||0)+1;}};
  const context=h.combat.primaryContext(h.hero,target,5,false);target.hp=0;h.combat.enemyKilled(target,h.hero,false,context);assert.equal(h.hero.hp,21,change);assert.equal(h.d.relicState.vampireHealedByWave['1'],.01,change);assert.deepEqual(sounds,[],change+' Bruiser kill healing must stay silent');
 }
});

test('Bruiser life steal keeps its healing and HP feedback without layering cartoon healing audio on an attack',()=>{
 for(const style of ['bruiser','fighter']){
  const h=fixture(),target=h.enemy(),sounds=[];h.d.heroStyle=style;h.hero.heroStyle=style;h.hero.hpMax=100;h.hero.hp=20;h.hero._heroSecondary={lifeSteal:.1};
  h.e.cc.resources={};h.e.stubs.BattleSounds={effect:id=>sounds.push(id)};
  const context=h.combat.primaryContext(h.hero,target,5,false);target.hp-=5;h.combat.primaryImpact(target,h.hero,context,5);
  assert.equal(h.hero.hp,20.5);assert.deepEqual(sounds,style==='bruiser'?[]:['healing-receive']);
 }
});

test('chain lightning preserves exact closest-two and authored tie order without a full crowd sort',()=>{
 const h=fixture();h.d.heroStyle='mystic';h.d.treasureAdd[120030]=[.4];const primary=h.enemy(0,0),crowd=Array.from({length:1200},(_,i)=>h.enemy(1+(i*37)%180,0));const expected=crowd.map((enemy,index)=>({enemy,index,distance:enemy.node.x**2})).sort((a,b)=>a.distance-b.distance||a.index-b.index).slice(0,2).map(r=>r.enemy);for(let i=0;i<8;i++)h.combat.heroAttack(h.hero,primary,100);assert.deepEqual(crowd.filter(e=>e.hits.length),expected);expected.forEach(e=>assert.deepEqual(e.hits,[40]));
});

test('chain feedback tolerates a target removing its native node during damage',()=>{
 const h=fixture();h.d.heroStyle='mystic';h.d.treasureAdd[120030]=[.4];const primary=h.enemy(0,0),near=h.enemy(10,0);near.onAttacked=()=>{near.node=null;return 40;};for(let i=0;i<8;i++)assert.doesNotThrow(()=>h.combat.heroAttack(h.hero,primary,100));
});

test('chain and splash selection never read native geometry from disposed recipients',()=>{
 for(const mechanic of ['chain','splash','pierce']){
  const h=fixture(),primary=h.enemy(0,0),retired=h.enemy(10,0);retired.node.destroyed=true;retired.node.getPosition=()=>{throw Error('Disposed native geometry');};
  if(mechanic==='chain'){h.d.heroStyle='mystic';h.d.treasureAdd[120030]=[.4];assert.doesNotThrow(()=>{for(let i=0;i<8;i++)h.combat.heroAttack(h.hero,primary,100);});}
  else {h.hero._heroSecondary=mechanic==='splash'?{splashDamage:.5,splashRadius:100}:{};if(mechanic==='pierce'){h.d.heroStyle='vanguard';h.d.treasureAdd[120024]=[.25];}
   h.hero.node.setPosition(-50,0);const c=h.combat.primaryContext(h.hero,primary,100,false);h.combat.enemyDamage(primary,100,h.hero,false,c);primary.hp-=100;assert.doesNotThrow(()=>h.combat.primaryImpact(primary,h.hero,c,100));}
  assert.equal(retired.hits.length,0);
 }
});
test('explicitly broadened relic requirements allow pierce and cleave to resolve their independent targets',()=>{
 const h=fixture();h.d.heroStyle='vanguard';h.d.relicDefinitions={120024:{RequiredHeroStyle:'all'},120035:{RequiredHeroStyle:'all'}};h.d.treasureAdd[120024]=[.25];h.d.treasureAdd[120035]=[.4];h.hero.node.setPosition(-50,0);const primary=h.enemy(0,0),behind=h.enemy(20,0),near=h.enemy(0,10),c=h.combat.primaryContext(h.hero,primary,100,false);h.combat.enemyDamage(primary,100,h.hero,false,c);primary.hp-=100;h.combat.primaryImpact(primary,h.hero,c,100);assert.deepEqual(behind.hits,[25]);assert.deepEqual(near.hits,[40]);
});

test('a zero critical chance cannot crit at the inclusive zero endpoint of Math.random',()=>{
 const h=fixture(),e=h.enemy();h.hero.heroRanged=false;h.hero.crit=0;h.hero.critDam=2;h.hero.getAttack=()=>100;h.ui.ctrEffect={onMonsterAttack(){},showDamageNum(){}};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/HeroWeaponCombat.js'),'utf8'),{module,exports:module.exports,require:h.load,cc:h.e.cc,Math:{random:()=>0}});module.exports.melee(h.g,e);assert.deepEqual(e.hits,[100]);
});

test('a retired slow application cannot label a replacement target status as the old hero perk',()=>{
 const h=fixture(),e=h.enemy(),replacement={type:0,data:{addSpeed:.2}};h.d.getGameBuff=id=>id===50015?{Pamer:[.3]}:null;e.debuffInfo=[];e.addBuff=()=>{e.node._combatGeneration++;e.debuffInfo=[replacement];};const c=h.combat.primaryContext(h.hero,e,100,false);h.combat.enemyDamage(e,100,h.hero,false,c);e.hp-=100;h.combat.primaryImpact(e,h.hero,c,100);assert.equal(replacement._heroCrippling,undefined);
});

test('the hero slow perk labels its own status when a callback appends another status',()=>{
 const h=fixture(),e=h.enemy(),other={type:0,data:{addSpeed:.2}};h.d.getGameBuff=id=>id===50015?{Pamer:[.3]}:null;e.debuffInfo=[];e.addBuff=(type,data)=>{e.debuffInfo.push({type,data},other);};const c=h.combat.primaryContext(h.hero,e,100,false);h.combat.enemyDamage(e,100,h.hero,false,c);e.hp-=100;h.combat.primaryImpact(e,h.hero,c,100);assert.equal(other._heroCrippling,undefined);assert.equal(e.debuffInfo[0]._heroCrippling.hero,h.hero);
});
