"use strict";
// Match texture density to the placed object's footprint. Ordinary scenery
// still shares a small texture; large cliffs use the same world-space detail.
var MIN_EDGE=256,MAX_EDGE=2048,OUTLINE_DETAIL=128;
function forBounds(width,height,scale){
 var extent=Math.round(Math.max(width,height,1)*1000)/1000,world=extent*Math.abs(scale||1),edge=Math.max(MIN_EDGE,Math.min(MAX_EDGE,Math.pow(2,Math.ceil(Math.log(world)/Math.LN2-1e-9)))),metric=world>MIN_EDGE?Math.max(.000001,Math.round(Math.abs(scale||1)*1000)/1000):1;
 return{edge:edge,density:edge/extent,metric:metric};
}
function rasterOptions(quality){return{maxSourceEdge:MAX_EDGE,maxProjectionEdge:MAX_EDGE,maxTextureEdge:4096,outlineWorldLimit:OUTLINE_DETAIL/quality.metric,sizeScale:1/quality.metric};}
exports.forBounds=forBounds;exports.rasterOptions=rasterOptions;
