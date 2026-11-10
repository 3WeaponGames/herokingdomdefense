'use strict';
// Prepare a detached layer only when a stroke is previewed or committed. Merely
// selecting the brush never creates layers or changes the document.
const M=require('./model');
function existing(map,id){const layers=M.groundLayers(map).filter(layer=>layer.purpose==='shadow-paint');return layers.find(layer=>layer.id===id)||layers[0];}
function prepare(map,id){
 const old=existing(map,id);if(old)return {map,id:old.id};
 const result=M.createGroundLayer(map,'Painted shadows'),layer=result.ground.custom[result.ground.custom.length-1];
 layer.purpose='shadow-paint';return {map:result,id:layer.id};
}
function stroke(map,value,id){const draft=prepare(map,id);return {map:M.stroke(draft.map,draft.id,value),id:draft.id};}
module.exports={existing,prepare,stroke};
