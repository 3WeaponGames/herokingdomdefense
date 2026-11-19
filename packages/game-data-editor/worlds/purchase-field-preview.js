'use strict';
const Maps=require('../lib/map-assets'),{clone}=require('./model');

function describeNameCard(info,owner,field,offset,padScale){
 const card=field&&field.children.map(id=>info.byId[id]).find(node=>node&&node.name==='ndLock');
 const spec=card&&info.sprites.find(sprite=>sprite.node===card.id&&sprite.enabled);
 if(!spec)return null;
 const matrix=owner.world.slice(0,4).concat(0,0),pose=card.world.slice();
 if(offset){
  const point=Maps.point(matrix,offset);pose[4]=owner.position.x+point.x;pose[5]=owner.position.y+point.y;
 }else{
  pose[4]+=(field.position.x-owner.position.x)*(padScale-1);
  pose[5]+=(field.position.y-owner.position.y)*(padScale-1);
 }
 const position=offset||Maps.point(Maps.inverse(matrix),{x:pose[4]-owner.position.x,y:pose[5]-owner.position.y});
 const sprite={frame:spec.frame,matrix:pose,width:card.width,height:card.height,anchor:clone(card.anchor),color:clone(card.source._color||{r:255,g:255,b:255,a:255}),active:true,ground:true};
 return {position,matrix,record:{origin:clone(owner.position),sprites:[sprite],skeletons:[]}};
}

// Move the preview of the field and any name card attached to it during a drag.
function translate(record,delta){
 if(!record||!record.purchaseField||!delta||!delta.x&&!delta.y)return record;
 const flags=record.purchaseField.sprites||[],move=part=>Object.assign({},part,{matrix:part.matrix.slice(0,4).concat(part.matrix[4]+delta.x,part.matrix[5]+delta.y)});
 const next=Object.assign({},record,{sprites:(record.sprites||[]).map((part,i)=>flags[i]?move(part):part),step:record.step&&record.step.map(p=>({x:p.x+delta.x,y:p.y+delta.y})),purchaseField:Object.assign({},record.purchaseField,{center:{x:record.purchaseField.center.x+delta.x,y:record.purchaseField.center.y+delta.y}})});
 const card=record.firstUpgradeCard;
 if(card&&card.followsPurchaseField)next.firstUpgradeCard=Object.assign({},card,{sprites:card.sprites.map(move)});
 return next;
}
module.exports={describeNameCard,translate};
