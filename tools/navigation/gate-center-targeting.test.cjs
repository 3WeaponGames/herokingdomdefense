'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{environment,Node,PhysicsPolygonCollider,installIntersection,Vec2}=require('./runtime-harness.cjs');
function fixture(){
 const e=environment();installIntersection(e.cc);e.game.ctrPlay.isDead=()=>true;const gate=new(e.load('KinghtFallBuildWall').default)();gate.node=new Node('Gate',e.game.ndMain,0,0);gate.ndAniOther=[];gate.index=1;gate.wallHasGate=true;gate.getColliderIndex=()=>gate.index;gate.getIsWork=()=>!gate.isDestroyed;gate.colPoint={};
 const shape=gate.node.addComponent(PhysicsPolygonCollider);shape.tag=1;shape.points=[{x:0,y:10},{x:80,y:10},{x:80,y:30},{x:0,y:30}];
 const wing=new Node('Outer wall',e.game.ndMain,250,20),side=wing.addComponent(PhysicsPolygonCollider);side.tag=1;side.points=[{x:-10,y:-50},{x:10,y:-50},{x:10,y:50},{x:-10,y:50}];gate.ndAniOther=[{node:wing}];e.game.gameData.buildings.push(gate);
 const unit=e.actor('KinghtFallEnemyItem02',235,20);delete unit.getFind;delete unit.onFindList;unit.cfg={...unit.cfg,AttackRange:50,SearchRange:400};return{...e,gate,unit,shape,side};
}
test('a unit beside a gate wing acquires the doorway center and cannot attack the wall section',()=>{
 const e=fixture(),parts=e.gate.getWposPhyCol2(),selection=e.unit.getFind();assert.equal(parts.length,2);assert.equal(selection.tag,e.gate.node);assert.equal(selection.canAtt,false);const target=e.nav.attackPositionOf(selection,e.unit,e.game);assert(Math.abs(target.x-40)<1&&Math.abs(target.y-20)<1);assert.equal(e.gate.getWposPhyCol2().length,2,'Physical wall shapes remain intact');
 let attacks=0;e.unit.doAttackStart=()=>{attacks++;};e.unit.node.setPosition(40,65);assert.equal(e.unit.getFind().canAtt,true);assert.equal(e.unit.onFindList(),true);assert.equal(attacks,1);
});
test('gate aiming caches by the current physical frame and tracks movement, mirroring and offsets',()=>{
 const e=fixture();e.nav.beginFrame(e.game);const first=e.gate.getAttackTargetParts();assert.equal(first,e.gate.getAttackTargetParts());e.gate.node.x=100;e.gate.node.scaleX=-1;e.shape.offset={x:6,y:0};e.nav.beginFrame(e.game);const moved=e.gate.getAttackTargetParts(),aim=e.nav.attackPointOf(e.gate,e.game);assert.notEqual(moved,first);assert.equal(aim.x,54);assert.equal(aim.y,20);
 const bullet={tagNode:e.gate.node,tagPos:new Vec2()},h=require('../testing/backend-gameplay-harness.cjs').setup();h.load('KinghtFallBulletBase').default.prototype.readTargetPosition.call(bullet);assert.equal(bullet.tagPos.x,aim.x);assert.equal(bullet.tagPos.y,aim.y);
});
test('solid walls retain their whole attackable footprint and destroyed gates retire their center',()=>{
 const e=fixture();e.gate.getAttackTargetParts();e.gate.wallHasGate=false;assert.equal(e.gate.getAttackTargetParts().length,2);assert.equal(e.unit.getFind().canAtt,true);assert.equal(e.gate.node._buildingAttackPoint,undefined);e.gate.isDestroyed=true;assert.equal(e.gate.getAttackTargetParts().length,0);
});
