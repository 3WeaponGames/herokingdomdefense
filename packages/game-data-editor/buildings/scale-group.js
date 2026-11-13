'use strict';
const Model=require('./model'),Scale=require('../../../assets/_script/BuildingWorldScale');
function family(config,request){
 const result=Model.families(config,null,'en').find(f=>f.typeID===String(request.id)&&(request.familyRoot===undefined||f.rootIndex===request.familyRoot)&&f.branches.some(b=>b.position===request.levelIndex));
 if(!result)throw Error('Choose a building level in an existing construction family.');
 return result;
}
function limits(tiers,selected){
 const values=tiers.filter(t=>selected.has(t.index)).map(t=>t.worldScale);
 return values.length?{min:Math.max(...values.map(s=>.05/s)),max:Math.min(...values.map(s=>10/s))}:null;
}
function changes(tiers,selected,factor){
 const range=limits(tiers,selected);if(!range||!Number.isFinite(factor)||factor<range.min-.000001||factor>range.max+.000001)throw Error('Choose a scale that keeps all selected tiers between 5% and 1,000%.');
 return tiers.filter(t=>selected.has(t.index)).map(t=>({position:t.position,index:t.index,from:t.worldScale,value:Math.max(.05,Math.min(10,t.worldScale*factor))}));
}
function edits(config,request,values){
 const current=family(config,request),seen=new Set();
 if(!Array.isArray(values)||!values.length||values.length>current.branches.length)throw Error('Select at least one tier in this construction family.');
 return values.map(item=>{
  const branch=current.branches.find(b=>b.position===item.position&&b.index===item.index);
  if(!branch||seen.has(item.index)||!Scale.valid(item.value))throw Error('The selected building tiers changed. Reload before resizing.');
  if(Scale.value(branch.record)!==item.from)throw Error('A selected tier was resized elsewhere. Reload before resizing.');
  seen.add(item.index);return{doc:'A',path:['BuildEnum',String(request.id),'levelList',item.position,'WorldScale'],value:item.value};
 });
}
function partEdits(config,request,values){
 const Parts=require('../../../assets/_script/BuildingPartScale'),current=family(config,request),seen=new Set(),edits=new Map();
 if(!Array.isArray(values)||!values.length||values.length>current.branches.length*Parts.keys.length)throw Error('Choose building parts to resize.');
 values.forEach(item=>{
  const branch=current.branches.find(b=>b.position===item.position&&b.index===item.index),id=item.index+':'+item.key;
  if(!branch||seen.has(id)||!Parts.available(branch.record).some(p=>p.key===item.key)||!Parts.valid(item.value))throw Error('The selected building part changed. Reload before resizing.');
  if(Parts.value(branch.record,item.key)!==item.from)throw Error('A building part was resized elsewhere. Reload before resizing.');
  seen.add(id);if(item.value===item.from)return;
  if(!edits.has(item.position))edits.set(item.position,{doc:'A',path:['BuildEnum',String(request.id),'levelList',item.position,'PartScale'],value:Object.assign({},branch.record.PartScale)});
  edits.get(item.position).value[item.key]=item.value;
 });
 return Array.from(edits.values());
}
function duplicateShape(config,request,layer){
 if(!['Shadow','Blocker'].includes(layer))throw Error('Choose a shadow or blocker layer.');
 const group=family(config,request),source=group.branches.find(b=>b.position===request.levelIndex).record[layer];
 if(!source)throw Error('Draw a '+layer.toLowerCase()+' first.');
 return group.branches.filter(b=>b.position!==request.levelIndex).map(b=>({doc:'A',path:['BuildEnum',String(request.id),'levelList',b.position,layer],value:Object.assign({},b.record[layer],JSON.parse(JSON.stringify(source)))})).filter(edit=>JSON.stringify(config.BuildEnum[request.id].levelList[edit.path[3]][layer])!==JSON.stringify(edit.value));
}
module.exports={family,limits,changes,edits,partEdits,duplicateShape};
