'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Layout=require('../../assets/_script/BattleRewardLayout');
function amount(text){return{node:{x:0,y:-29.165,width:0,height:84,anchorX:.5,anchorY:.5,scaleX:.5,scaleY:.5},_forceUpdateRenderData(){this.node.width=text.length*44;}};}
function placed(rect,position){return{left:position.x+rect.minX,right:position.x+rect.maxX,bottom:position.y+rect.minY,top:position.y+rect.maxY};}
test('Victory gold amount 237.94K and the adjacent 50 reward have measured spacing and stay centered',()=>{
 const rects=['237.94K','50'].map(text=>Layout.measure({width:95,height:95},amount(text),6)),result=Layout.arrange(rects,660,28),boxes=rects.map((r,i)=>placed(r,result.positions[i]));
 assert(boxes[1].left-boxes[0].right>=28);assert.equal(boxes[0].left,-boxes[1].right);assert(result.positions[1].x-result.positions[0].x>117,'retained fixed icon spacing');
});
test('long reward labels and several rewards wrap into separated rows instead of overlapping or reaching screen edges',()=>{
 const rects=['999.99M','999.99M','125.5K','75'].map(text=>Layout.measure({width:95,height:95},amount(text),6)),result=Layout.arrange(rects,400,28),boxes=rects.map((r,i)=>placed(r,result.positions[i]));
 assert(result.height>95);for(const b of boxes){assert(b.left>=-200&&b.right<=200);}
 for(let i=0;i<boxes.length;i++)for(let j=0;j<i;j++){const a=boxes[i],b=boxes[j];assert(a.right+27.99<=b.left||b.right+27.99<=a.left||a.top+27.99<=b.bottom||b.top+27.99<=a.bottom);}
});
test('late font changes are measured using visible text scale and preserve the reward amount',()=>{
 const label=amount('237.94K'),node={width:95,height:95},first=Layout.measure(node,label,6);label.node.scaleX=1;const second=Layout.measure(node,label,6);assert(second.maxX-second.minX>first.maxX-first.minX);assert.equal(label.node.width,308);
});
