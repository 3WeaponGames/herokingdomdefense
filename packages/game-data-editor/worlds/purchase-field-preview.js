'use strict';
// A field drag changes only its ground artwork and trigger until release.
function translate(record,delta){
 if(!record||!record.purchaseField||!delta||!delta.x&&!delta.y)return record;
 const flags=record.purchaseField.sprites||[],move=part=>Object.assign({},part,{matrix:part.matrix.slice(0,4).concat(part.matrix[4]+delta.x,part.matrix[5]+delta.y)});
 return Object.assign({},record,{sprites:(record.sprites||[]).map((part,i)=>flags[i]?move(part):part),step:record.step&&record.step.map(p=>({x:p.x+delta.x,y:p.y+delta.y})),purchaseField:Object.assign({},record.purchaseField,{center:{x:record.purchaseField.center.x+delta.x,y:record.purchaseField.center.y+delta.y}})});
}
module.exports={translate};
