'use strict';

const finitePoint=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y);

function point(graph) {
 const marker=graph.chokepoint;
 const nodes=Array.isArray(graph.nodes)?graph.nodes:[];
 if(typeof marker==='string')return nodes.find(node=>node?.id===marker&&finitePoint(node));
 if(!marker||!Number.isFinite(marker.fraction)||marker.fraction<=0||marker.fraction>=1)return undefined;
 const edge=Array.isArray(graph.edges)?graph.edges.find(edge=>edge?.id===marker.edgeId):null;
 if(!edge)return undefined;
 const from=nodes.find(node=>node?.id===edge.from),to=nodes.find(node=>node?.id===edge.to);
 if(!finitePoint(from)||!finitePoint(to))return undefined;
 const {fraction}=marker;
 return {x:(1-fraction)*from.x+fraction*to.x,y:(1-fraction)*from.y+fraction*to.y};
}

function split(graph,edge,newEdge,fraction,node) {
 const marker=graph.chokepoint;
 if(marker?.edgeId!==edge||!Number.isFinite(marker.fraction))return;
 if(Math.abs(marker.fraction-fraction)<1e-10)graph.chokepoint=node;
 else if(marker.fraction<fraction)graph.chokepoint={...marker,fraction:marker.fraction/fraction};
 else graph.chokepoint={...marker,edgeId:newEdge,fraction:(marker.fraction-fraction)/(1-fraction)};
}

function join(graph,incoming,outgoing) {
 const marker=graph.chokepoint;
 if(marker!==incoming.to&&marker?.edgeId!==incoming.id&&marker?.edgeId!==outgoing.id)return;
 const current=point(graph);
 const from=graph.nodes.find(node=>node.id===incoming.from),to=graph.nodes.find(node=>node.id===outgoing.to);
 if(!current||!finitePoint(from)||!finitePoint(to)){delete graph.chokepoint;return;}
 // Keep the marker at the closest point on the newly joined segment.
 const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
 const fraction=length?((current.x-from.x)*(dx/length)+(current.y-from.y)*(dy/length))/length:0;
 if(fraction<=0)graph.chokepoint=from.id;
 else if(fraction>=1)graph.chokepoint=to.id;
 else if(Number.isFinite(fraction))graph.chokepoint={...(typeof marker==='object'?marker:null),edgeId:incoming.id,fraction};
 else delete graph.chokepoint;
}

function removeEdge(graph,edgeId) {
 if(graph.chokepoint?.edgeId===edgeId)delete graph.chokepoint;
}

module.exports={point,split,join,removeEdge};
