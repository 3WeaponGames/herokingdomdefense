'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../../assets/_script/LobbyLayoutCore');
test('phone widths expose three, four or five reward icons while equal-size mode buttons stay above the existing footer',()=>{
 for(const [points,count]of [[320,3],[390,4],[480,5],[768,5]])for(const height of [1000,1334,1667]){const bounds={left:-375,right:375,top:height/2,bottom:-height/2,footer:-height/2+120},g=Core.measure(bounds,points);assert.equal(g.count,count);assert(g.viewport>0);assert(Math.abs(g.cell*count-g.viewport)<1e-6);assert.equal(g.buttonRight-g.buttonLeft,g.buttonWidth+22);assert(g.buttonY-73*g.buttonScale>bounds.footer);assert(g.stageY+450*g.stageScale<g.barY-82);assert(g.stageY-270*g.stageScale>g.buttonY+73*g.buttonScale);}
});
test('arrows aggregate only claimable rewards hidden in their direction, including partially clipped items',()=>{
 const ready=[true,false,false,false,true],cell=150,width=600;assert.deepEqual(Core.hiddenRewards(ready,0,width,cell),{left:false,right:true});assert.deepEqual(Core.hiddenRewards(ready,150,width,cell),{left:true,right:false});assert.deepEqual(Core.hiddenRewards([false,false,false,false,false],75,width,cell),{left:false,right:false});assert.deepEqual(Core.hiddenRewards(ready,0,750,cell),{left:false,right:false});
});
