'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,hero,Node,Vec2}=require('./backend-gameplay-harness.cjs');
function settings(h,value){h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data.GameTools=value;}
test('projectile speed settings are scoped to actors and missing or malformed values preserve authored speed',()=>{
 const h=setup(),api=h.load('GameToolsOverrides');settings(h,{projectileSpeeds:{'hero:hero:default':850,'enemy:90003:default':720,'ally:90003:default':450}});
 assert.equal(api.projectileSpeed({},'hero',500),850);assert.equal(api.projectileSpeed({cfg:{ID:90003}},'enemy',500),720);assert.equal(api.projectileSpeed({cfg:{ID:90003}},'ally',500),450);assert.equal(api.projectileSpeed({cfg:{ID:90008}},'enemy',500),500);
 for(const value of [undefined,null,0,-1,Infinity,NaN,20001,'700']){settings(h,{projectileSpeeds:{'hero:hero:default':value}});assert.equal(api.projectileSpeed({},'hero',500),500);}
});
test('enemy and ally pooled shots restore authored speed after their saved override is removed',()=>{
 const h=setup();h.g.ndUI=new Node();
 for(const [type,method,list]of [['enemy','onShotEnemy','ndEnemyArr'],['ally','onShotSoldier','ndSoldArr']]){
  const node=new Node(),shot={speed:500,node};node.setSiblingIndex=()=>{};node.getComponent=()=>shot;
  const actor={cfg:{ID:90003},getBullet:()=>node,getAttWpos:()=>new Vec2()};
  settings(h,{projectileSpeeds:{[type+':90003:default']:920}});h.g[method](actor);assert.equal(shot.speed,920);
  settings(h,{});h.g[method](actor);assert.equal(shot.speed,500);
 }
});

test('hero speed override applies before charge multiplier and pooled arrows recover their authored base',()=>{
 const h=setup(),p=hero(h);p.heroStyle='skirmisher';p.heroRanged=true;p.getAttack=()=>100;p.crit=0;p.getAttWpos=()=>new Vec2();p.ctrPlayAni.arrName='lv1';
 const Shot=h.load('KinghtFallBulletPlay').default,shot=new Shot();shot.speed=500;shot.node=new Node();shot.bullet={active:true};shot.setSkin=()=>{};shot.node.getComponent=()=>shot;shot.node.setSiblingIndex=()=>{};h.g.ndUI=new Node();h.g.ndPlayArr1.push(shot.node);
 const target={node:new Node(),cfg:{ID:90001,AttackType:1},hp:100,hpMax:100,isDead:()=>false};
 settings(h,{projectileSpeeds:{'hero:hero:default':800}});p._styleProjectileSpeed=1.5;h.g.onPlayAttack(target);assert.equal(shot.speed,1200);h.g.freeBullet(shot);
 settings(h,{});p._styleProjectileSpeed=2;h.g.onPlayAttack(target);assert.equal(shot.speed,1000);h.g.freeBullet(shot);delete p._styleProjectileSpeed;h.g.onPlayAttack(target);assert.equal(shot.speed,500);
});
