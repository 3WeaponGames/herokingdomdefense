'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,hero,Node}=require('./backend-gameplay-harness.cjs');
const styles=['skirmisher','fighter','vanguard','mystic','bruiser','guardian'];

test('permanent hero statuses survive updates while timed statuses expire at their authored duration',()=>{
 for(const style of styles){const h=setup(),p=hero(h);p.heroStyle=style;p.state=0;p._regenerationDisabled=true;const types=h.load('KinghtFallInterface').KinghtFallEnemyBuffType;p.addBuff(types.AttackSpeed,{addSpeed:.5,time:-1});p.addBuff(types.AttackSpeed,{addSpeed:.2,time:.5});p.onUpdata(.25);assert.equal(p.debuffInfo.length,2,style);p.onUpdata(.25);assert.equal(p.debuffInfo.length,1,style);assert.equal(p.debuffInfo[0].data.time,-1);}
});

test('hero movement consumes slow statuses and never reverses direction from stacked slows',()=>{
 for(const style of styles){const h=setup(),p=hero(h);p.heroStyle=style;p.moveSpeed=100;const types=h.load('KinghtFallInterface').KinghtFallEnemyBuffType,base=p.getSpeed();p.addBuff(types.MoveSpeed,{subNum:.4,time:1});assert(Math.abs(p.getSpeed()-base*.6)<1e-9,style);p.addBuff(types.MoveSpeed,{subNum:1,time:1});assert.equal(p.getSpeed(),0,style);}
});

test('Fighter tenacity and native slow movement share the same shortened status lifetime',()=>{
 const h=setup(),p=hero(h);p.heroStyle='fighter';p.moveSpeed=100;p.state=0;p._regenerationDisabled=true;h.load('HeroStyleRuntime').install(p,{});p._styleRuntime.state.stacks=5;p._styleRuntime.state.stackRemaining=5;
 const type=h.load('KinghtFallInterface').KinghtFallEnemyBuffType.MoveSpeed,input={subNum:.4,time:1};p.addBuff(type,input);assert.equal(input.time,1);assert(Math.abs(p.debuffInfo[0].timeMax-.6)<1e-9);assert.equal(p.getSpeed(),60);
 p.onUpdata(.59);assert.equal(p.getSpeed(),60);p.onUpdata(.011);assert.equal(p.getSpeed(),100);assert.equal(p.debuffInfo.length,0);
});

for(const kind of ['KinghtFallEnemyItem06','KinghtFallEnemyItem09'])test(kind+' support selects living units before corpses and pooled actors',()=>{
 const h=setup(),S=h.load(kind).default,support=new S(),effects=[];Object.assign(support,{node:new Node('support',h.g.ndMain),uuid:'support',hp:100,hpMax:100,isDead:()=>false,cfg:{Data:kind.endsWith('06')?[.25,2,200,1]:[.1,200,1]},vec2_1:h.e.cc.v2(),vec2_2:h.e.cc.v2(),time:{Attack:0}});
 h.g.gameStatus=h.e.stubs.KinghtFallModle.KinghtFallGameStage.Fight;h.g._combatEpoch=1;h.ui.ctrEffect.onMoveTrack=()=>{};h.ui.ctrEffect.onBuff=()=>{};
 const target=(x,dead=false,pooled=false)=>({uuid:'target-'+x,node:new Node('target',h.g.ndMain,x,0),hp:dead?0:50,hpMax:100,_isPooled:pooled,isDead:()=>dead,addBuff(){effects.push(this);},addHpPro(){effects.push(this);}}),corpse=target(1,true),pooled=target(2,false,true),live=target(20);h.d.enemyList=[corpse,pooled,live];support.doAttack();assert.deepEqual(effects,[live]);
});
