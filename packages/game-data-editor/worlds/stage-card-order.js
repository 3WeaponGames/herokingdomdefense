'use strict';
// Store display order on the cards; array order still controls gameplay selection.
function ordered(items){
 const last=items.reduce((max,item)=>Number.isFinite(item.editorOrder)?Math.max(max,item.editorOrder):max,-1);
 return items.map((item,index)=>({item,index,order:Number.isFinite(item.editorOrder)?item.editorOrder:last+1+index})).sort((a,b)=>a.order-b.order||a.index-b.index).map(row=>row.item);
}
function move(items,sourceId,targetId,after){
 if(new Set(items.map(item=>item.id)).size!==items.length)throw Error('Cards need unique identifiers before rearranging them.');
 const before=ordered(items),source=before.findIndex(item=>item.id===sourceId),target=before.findIndex(item=>item.id===targetId);
 if(source<0||target<0)throw Error('A card changed or was removed. Review this list before rearranging it.');
 if(source===target)return false;
 const result=before.slice(),[item]=result.splice(source,1),at=result.findIndex(item=>item.id===targetId)+(after?1:0);result.splice(at,0,item);
 if(result.every((item,index)=>item===before[index]))return false;
 result.forEach((item,index)=>{item.editorOrder=index;});return true;
}
module.exports={ordered,move};
