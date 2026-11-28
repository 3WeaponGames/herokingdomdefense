'use strict';

const Waves=require('./wave-editor');
const Chokepoint=require('./path-chokepoint');

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finitePoint=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y);
const weight=value=>Number.isFinite(value)&&value>0;

function probabilities(items,readWeight){
 const scale=items.reduce((max,item)=>Math.max(max,readWeight(item)),0);
 const total=items.reduce((sum,item)=>sum+readWeight(item)/scale,0);
 return items.map(item=>({item,share:(readWeight(item)/scale)/total}));
}

// Keep the branch probabilities conditional on each junction, as in the game.
// An unmarked branch uses its goal. Invalid or cyclic walks have no estimate.
function routeDistances(graph,allowed){
 if(!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))return null;
 const nodes=new Map();
 for(const node of graph.nodes){
  if(!finitePoint(node)||typeof node.id!=='string'||!node.id.trim()||nodes.has(node.id))return null;
  nodes.set(node.id,node);
 }
 const entry=nodes.get(graph.entry);
 if(!entry||graph.edges.some(edge=>!edge||!nodes.has(edge.from)||!nodes.has(edge.to)))return null;
 const marker=Chokepoint.point(graph)?graph.chokepoint:undefined;
 const outgoing=new Map();
 for(const edge of graph.edges){
  if(!weight(edge.weight)||!allowed(edge.requiresAnyBuilding))continue;
  if(!outgoing.has(edge.from))outgoing.set(edge.from,[]);
  outgoing.get(edge.from).push(edge);
 }
 const branches=new Map(Array.from(outgoing,([id,edges])=>[id,probabilities(edges,edge=>edge.weight)]));
 const stack=[{node:entry,length:0,marked:entry.id===marker?0:null,share:1,branch:0}];
 const active=new Set([entry.id]),samples=[];
 // Long linear paths are inexpensive. Bound the work on combinatorial forks.
 let budget=Math.max(32768,nodes.size+graph.edges.length);
 while(stack.length){
  if(--budget<0)return null;
  const state=stack[stack.length-1],next=state.node.goal?[]:branches.get(state.node.id)||[];
  if(state.branch===next.length){
   if(state.node.goal)samples.push({length:state.marked??state.length,share:state.share,marked:state.marked!==null});
   active.delete(state.node.id);
   stack.pop();
   continue;
  }
  const {item:edge,share}=next[state.branch++],node=nodes.get(edge.to);
  if(active.has(node.id))return null;
  const segment=distance(state.node,node),length=state.length+segment;
  if(!Number.isFinite(length))return null;
  const marked=state.marked??(node.id===marker?length:marker?.edgeId&&edge.id===marker.edgeId?state.length+segment*marker.fraction:null);
  active.add(node.id);
  stack.push({node,length,marked,share:state.share*share,branch:0});
 }
 return samples.length?{entry,samples}:null;
}

function median(samples){
 const sorted=samples.slice().sort((a,b)=>a.length-b.length);
 const halfway=sorted.reduce((sum,sample)=>sum+sample.share,0)/2;
 let cumulative=0;
 for(let i=0;i<sorted.length;i++){
  const sample=sorted[i];
  cumulative+=sample.share;
  if(Math.abs(cumulative-halfway)<=halfway*1e-12&&i+1<sorted.length){
   return sample.length+(sorted[i+1].length-sample.length)/2;
  }
  if(cumulative>=halfway)return sample.length;
 }
 return sorted.at(-1).length;
}

function create(stage,units){
 const spawns=new Map((stage?.spawns||[]).filter(spawn=>spawn.enabled!==false&&finitePoint(spawn)).map(spawn=>[spawn.id,spawn]));
 const speeds=new Map(units.map(unit=>[unit.id,unit.speed]));
 const buildable=new Set((stage?.buildings||[]).filter(building=>building.enabled!==false).map(building=>building.id));
 const allowed=conditions=>conditions==null||Array.isArray(conditions)&&(!conditions.length||conditions.some(id=>buildable.has(id)));
 const graphs=(stage?.graphs||[]).filter(graph=>graph&&Array.isArray(graph.spawnIds)&&
  (graph.weight===undefined||weight(graph.weight))&&allowed(graph.requiresAnyBuilding));
 const compiled=new Map(),distances=new Map();

 function resolveDistance(spawn,override){
  const key=JSON.stringify([spawn.id,override??null]);
  if(distances.has(key))return distances.get(key);
  const candidates=graphs.filter(graph=>graph.spawnIds.includes(spawn.id));
  const selected=override?candidates.filter(graph=>graph.id===override):candidates;
  const samples=[];
  for(const {item:graph,share} of probabilities(selected.length?selected:candidates,graph=>graph.weight??1)){
   if(!compiled.has(graph))compiled.set(graph,routeDistances(graph,allowed));
   const route=compiled.get(graph);
   if(!route)continue;
   const approach=distance(spawn,route.entry);
   for(const sample of route.samples){
    const length=approach+sample.length,probability=share*sample.share;
    if(Number.isFinite(length)&&probability>0)samples.push({length,share:probability,marked:sample.marked});
   }
  }
  const result=samples.length?{distance:median(samples),marked:samples.some(sample=>sample.marked),
   usesGoal:samples.some(sample=>!sample.marked)}:null;
  distances.set(key,result);
  return result;
 }

 function estimate(row){
  const spawn=spawns.get(row.spawnId),speed=speeds.get(row.unitId);
  if(!spawn||!weight(speed))return null;
  const route=resolveDistance(spawn,row.routeGraphId);
  if(!route)return null;
  const seconds=route.distance/speed;
  return Number.isFinite(seconds)?{...route,seconds}:null;
 }

 return {estimate,forWave(wave,interval){
  return Waves.schedule(wave,interval).some(row=>row.count>0&&estimate(row)?.marked)?estimate:null;
 }};
}

module.exports={create};
