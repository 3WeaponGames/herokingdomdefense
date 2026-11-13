"use strict";
function valid(p){return !!p&&typeof p==="object"&&!Array.isArray(p)&&["x","y"].every(function(k){return typeof p[k]==="number"&&isFinite(p[k])&&Math.abs(p[k])<=10000;});}
function value(row){return row&&valid(row.ModelOffset)?row.ModelOffset:{x:0,y:0};}
function vector(matrix,offset){return{x:matrix[0]*offset.x+matrix[2]*offset.y,y:matrix[1]*offset.x+matrix[3]*offset.y};}
function record(source,delta){
 if(!delta.x&&!delta.y)return source;
 function moved(m){var n=m.slice();n[4]+=delta.x;n[5]+=delta.y;return n;}
 var result=Object.assign({},source);result.sprites=(source.sprites||[]).map(function(s,i){return source.purchaseField&&source.purchaseField.sprites[i]?s:Object.assign({},s,{matrix:moved(s.matrix)});});
 result.skeletons=(source.skeletons||[]).map(function(s){return Object.assign({},s,{matrix:moved(s.matrix)});});
 if(source.shadow)result.shadow=Object.assign({},source.shadow,{matrix:moved(source.shadow.matrix)});
 return result;
}
exports.valid=valid;exports.value=value;exports.vector=vector;exports.record=record;
