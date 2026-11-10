'use strict';
// Topology edits are prepared on a clone and committed only after validation.
// A point edit never guesses which conditional branch the author intended.
const M=require('./model'),Doc=require('../lib/json-document');
const clone=value=>M.clone(value),condition=edge=>edge.requiresAnyBuilding||[];
function locate(stage,graphId,nodeId){
 if(!stage||!Array.isArray(stage.graphs))throw Error('Select a path.');
 const matches=stage.graphs.map((graph,index)=>({graph,index})).filter(item=>item.graph.id===graphId);
 if(matches.length!==1)throw Error(matches.length?'Path IDs must be unique before editing points.':'This path no longer exists.');
 const value=matches[0],graph=value.graph;if(!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))throw Error('This path needs nodes and edges.');
 const nodes=new Set(),edges=new Set();for(const node of graph.nodes){if(nodes.has(node.id))throw Error('Point IDs must be unique before editing this path.');nodes.add(node.id);}
 for(const edge of graph.edges){if(edges.has(edge.id))throw Error('Edge IDs must be unique before editing this path.');edges.add(edge.id);if(!nodes.has(edge.from)||!nodes.has(edge.to))throw Error('Reconnect the path’s missing points before editing it.');if(!Number.isFinite(edge.weight)||edge.weight<0)throw Error('Path edges need finite, nonnegative weights.');}
 if(!nodes.has(graph.entry))throw Error('Choose a valid path entry before editing points.');
 if(!graph.nodes.some(node=>node.id===nodeId))throw Error('This point no longer exists.');
 return{index:value.index,before:graph,graph:clone(graph)};
}
function unique(list,prefix){const ids=new Set(list.map(value=>value.id));let index=1;while(ids.has(prefix+index))index++;return prefix+index;}
function reachesGoal(graph){const nodes=new Map(graph.nodes.map(node=>[node.id,node])),seen=new Set(),todo=[graph.entry],out=new Map();for(const edge of graph.edges)if(edge.weight>0){if(!out.has(edge.from))out.set(edge.from,[]);out.get(edge.from).push(edge.to);}while(todo.length){const id=todo.pop();if(seen.has(id))continue;seen.add(id);if(nodes.get(id)&&nodes.get(id).goal)return true;todo.push(...(out.get(id)||[]));}return false;}
function validate(before,after){
 if(!after.nodes.length||!after.nodes.some(node=>node.id===after.entry)||!reachesGoal(after))throw Error('Keep a connected entry and at least one reachable goal.');
 const existing=new Set(M.graphIssues(before)),introduced=M.graphIssues(after).filter(issue=>!existing.has(issue));if(introduced.length)throw Error(introduced[0]);
}
function insertPlan(stage,graphId,nodeId){
 const plan=locate(stage,graphId,nodeId),graph=plan.graph,node=graph.nodes.find(node=>node.id===nodeId),candidates=graph.edges.filter(edge=>edge.weight>0&&(node.goal?edge.to===nodeId:edge.from===nodeId));
 if(candidates.length!==1)throw Error(node.goal?'Select a goal with one predecessor to insert a point before it.':'Select a point with one next segment; choose a branch point farther along that segment.');
 const edge=candidates[0],from=graph.nodes.find(node=>node.id===edge.from),to=graph.nodes.find(node=>node.id===edge.to);
 if(![from.x,from.y,to.x,to.y].every(Number.isFinite))throw Error('Both neighboring points need finite positions.');
 const added={id:unique(graph.nodes,'node-'),x:from.x/2+to.x/2,y:from.y/2+to.y/2,goal:false},second={id:unique(graph.edges,'edge-'),from:added.id,to:edge.to,weight:1};
 edge.to=added.id;graph.edges.splice(graph.edges.indexOf(edge)+1,0,second);graph.nodes.splice(graph.nodes.indexOf(node)+(node.goal?0:1),0,added);
 validate(plan.before,graph);return Object.assign(plan,{selected:added.id});
}
function stitch(incoming,outgoing){
 const result=clone(incoming),a=condition(incoming),b=condition(outgoing);
 if(b.length&&!(a.length===b.length&&a.every(id=>b.includes(id))))throw Error('Remove a linear point with an unconditional next segment; this point has a separate building condition.');
 for(const key of Object.keys(outgoing)){
  if(['id','from','to','weight'].includes(key))continue;
  if(key==='requiresAnyBuilding'){if(!Object.prototype.hasOwnProperty.call(result,key))result[key]=clone(outgoing[key]);continue;}
  if(Object.prototype.hasOwnProperty.call(result,key)&&!Doc.equal(result[key],outgoing[key]))throw Error('The adjacent segments have conflicting '+key+' settings. Edit those segments before removing this point.');
  if(!Object.prototype.hasOwnProperty.call(result,key))result[key]=clone(outgoing[key]);
 }
 // The removed point's single outgoing weight did not affect probabilities.
 // Retain the incoming weight relative to its predecessor's sibling branches.
 result.to=outgoing.to;return result;
}
function removePlan(stage,graphId,nodeId){
 const plan=locate(stage,graphId,nodeId),graph=plan.graph,node=graph.nodes.find(node=>node.id===nodeId),incoming=graph.edges.filter(edge=>edge.to===nodeId),outgoing=graph.edges.filter(edge=>edge.from===nodeId);let selected;
 if(graph.nodes.length===1)throw Error('Keep at least one point as the path entry and goal.');
 if(nodeId===graph.entry){
  if(node.goal||incoming.length||outgoing.length!==1||outgoing[0].weight<=0||condition(outgoing[0]).length)throw Error('The entry can only be removed when it leads directly to one unconditional next point.');
  selected=outgoing[0].to;graph.entry=selected;
 }else if(node.goal){
  if(incoming.length!==1||outgoing.length||incoming[0].weight<=0||condition(incoming[0]).length)throw Error('The goal can only be removed when it has one unconditional predecessor.');
  const previous=graph.nodes.find(value=>value.id===incoming[0].from),branches=graph.edges.filter(edge=>edge.from===previous.id&&edge.weight>0);
  if(branches.length!==1)throw Error('Removing this goal would cut off another branch. Select an interior point instead.');
  previous.goal=true;selected=previous.id;
 }else{
  if(incoming.length!==1||outgoing.length!==1||incoming[0].weight<=0||outgoing[0].weight<=0)throw Error('Only a linear point can be removed safely. Keep branch and join points, or edit their segments explicitly.');
  const replacement=stitch(incoming[0],outgoing[0]);graph.edges[graph.edges.indexOf(incoming[0])]=replacement;selected=outgoing[0].to;
 }
 graph.nodes=graph.nodes.filter(value=>value.id!==nodeId);graph.edges=graph.edges.filter(edge=>edge.from!==nodeId&&edge.to!==nodeId);
 validate(plan.before,graph);return Object.assign(plan,{selected});
}
function commit(stage,plan){stage.graphs[plan.index]=plan.graph;return plan.selected;}
function insertNode(stage,graphId,nodeId){return commit(stage,insertPlan(stage,graphId,nodeId));}
function removeNode(stage,graphId,nodeId){return commit(stage,removePlan(stage,graphId,nodeId));}
function availability(stage,graphId,nodeId){const result={insert:true,remove:true,insertReason:'',removeReason:''};for(const [key,plan]of [['insert',insertPlan],['remove',removePlan]])try{plan(stage,graphId,nodeId);}catch(error){result[key]=false;result[key+'Reason']=error.message;}return result;}
module.exports={insertNode,removeNode,availability};
