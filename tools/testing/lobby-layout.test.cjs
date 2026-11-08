'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../../assets/_script/LobbyLayoutCore');
test('phone widths expose up to four roomy reward icons while equal-size mode buttons stay above the existing footer',()=>{
 for(const [points,count]of [[320,3],[390,4],[480,4],[768,4]])for(const height of [1000,1334,1667]){const bounds={left:-375,right:375,top:height/2,bottom:-height/2,footer:-height/2+120},g=Core.measure(bounds,points);assert.equal(g.count,count);assert(g.viewport>0);assert(Math.abs(g.cell*count-g.viewport)<1e-6);assert.equal(g.buttonRight-g.buttonLeft,g.buttonWidth+22);assert(g.buttonY-73*g.buttonScale>bounds.footer);assert(g.stageY+450*g.stageScale<g.barY-82);assert(g.stageY-270*g.stageScale>g.buttonY+73*g.buttonScale);}
});
test('arrows aggregate only claimable rewards hidden in their direction, including partially clipped items',()=>{
 const ready=[true,false,false,false,true],cell=150,width=600;assert.deepEqual(Core.hiddenRewards(ready,0,width,cell),{left:false,right:true});assert.deepEqual(Core.hiddenRewards(ready,150,width,cell),{left:true,right:false});assert.deepEqual(Core.hiddenRewards([false,false,false,false,false],75,width,cell),{left:false,right:false});assert.deepEqual(Core.hiddenRewards(ready,0,750,cell),{left:false,right:false});
});
test('larger screens grow the title and stage preview while normal phone sizing stays unchanged',()=>{
 const bounds={left:-375,right:375,top:600,bottom:-600,footer:-480};
 for(const points of [320,390,548,600]){const g=Core.measure(bounds,points);assert.equal(g.titleScale,1);assert.equal(g.previewScale,1);}
 const large=Core.measure(bounds,853);assert(large.titleScale>1.3);assert(large.previewScale>1.5);
 for(const points of [320,390,548,750,853,1200])for(const height of [1100,1360,1800]){
  const g=Core.measure({...bounds,top:height/2,bottom:-height/2,footer:-height/2+120},points);
  assert(g.titleScale*620*g.stageScale<=Math.max(750-36*750/points,620*g.stageScale)+.01);
  assert(g.previewScale*394*g.stageScale<=750*.64+.01);
  assert(Math.abs(g.stageArrowPadding*points/750-16)<.01);
  if(points<=600){assert.equal(g.titleScale,1);assert.equal(g.previewScale,1);}
 }
});
