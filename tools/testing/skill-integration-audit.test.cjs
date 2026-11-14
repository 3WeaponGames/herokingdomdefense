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
test('frozen-control cleanup skips disposed native renderers and restores surviving ones',()=>{
 const h=fixture(),e=h.enemy(),disposed={destroyed:true,set paused(_){throw Error('Disposed native renderer');}},live={paused:true};e._relicPausedRenderers=[{renderer:disposed,wasPaused:false},{renderer:live,wasPaused:false}];h.combat.releaseControl(e);assert.equal(live.paused,false);assert.equal(e._relicPausedRenderers,undefined);
});
test('chain lightning preserves exact closest-two and authored tie order without a full crowd sort',()=>{
 const h=fixture();h.d.heroStyle='mystic';h.d.treasureAdd[120030]=[.4];const primary=h.enemy(0,0),crowd=Array.from({length:1200},(_,i)=>h.enemy(1+(i*37)%180,0));const expected=crowd.map((enemy,index)=>({enemy,index,distance:enemy.node.x**2})).sort((a,b)=>a.distance-b.distance||a.index-b.index).slice(0,2).map(r=>r.enemy);for(let i=0;i<8;i++)h.combat.heroAttack(h.hero,primary,100);assert.deepEqual(crowd.filter(e=>e.hits.length),expected);expected.forEach(e=>assert.deepEqual(e.hits,[40]));
});

test('chain feedback tolerates a target removing its native node during damage',()=>{
 const h=fixture();h.d.heroStyle='mystic';h.d.treasureAdd[120030]=[.4];const primary=h.enemy(0,0),near=h.enemy(10,0);near.onAttacked=()=>{near.node=null;return 40;};for(let i=0;i<8;i++)assert.doesNotThrow(()=>h.combat.heroAttack(h.hero,primary,100));
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
