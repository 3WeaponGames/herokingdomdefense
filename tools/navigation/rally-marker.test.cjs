'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {environment}=require('./runtime-harness.cjs');
function fixture(){
 const e=environment(),game=e.game;
 Object.setPrototypeOf(game,e.load('KinghtFallGameCtrl').default.prototype);
 Object.assign(game,{pathIndex:0,isAgg:false,_separateArmyCommands:true,gameStatus:-1});
 game.ctrPlay.doMove=()=>{};
 return e;
}
test('rally marker holds, fades and disappears at three seconds without clearing the rally order',()=>{
 const e=fixture(),g=e.game;g.rallyCommand();const order=g.rallyPoint;
 g.onUpdate(2.4);assert.equal(g.ndAggFlag.opacity,255);assert(g.ndAggFlag.active);
 g.onUpdate(.3);assert(g.ndAggFlag.opacity>=127&&g.ndAggFlag.opacity<=128);assert(g.ndAggFlag.active);
 g.onUpdate(.3);assert.equal(g.ndAggFlag.active,false);assert.equal(g.rallyPoint,order);assert.equal(g.pathList[0],order);assert.equal(g.ndAggFlag.Flag,1);
});
test('a fresh Rally restores full opacity and starts a new marker lifetime; clearing the order cancels it',()=>{
 const e=fixture(),g=e.game;g.rallyCommand();g.onUpdate(2.7);const old=g.rallyPoint;
 g.ctrPlay.node.setPosition(70,80);g.rallyCommand();assert.notEqual(g.rallyPoint,old);assert.equal(g.ndAggFlag.opacity,255);
 g.onUpdate(.5);assert(g.ndAggFlag.active);assert.equal(g.ndAggFlag.opacity,255);
 g.clearArmyOrder(false);g.onUpdate(5);assert.equal(g.ndAggFlag.active,false);assert.equal(g._rallyMarkerRemaining,0);
 g.rallyCommand();assert(g.ndAggFlag.active);assert.equal(g.ndAggFlag.opacity,255);
});
