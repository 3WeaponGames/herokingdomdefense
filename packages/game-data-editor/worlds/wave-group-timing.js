'use strict';

const Groups=require('./spawn-groups');
const {coincident}=require('./wave-pressure');

function prepare(entries,groups,starts,eligible,step,deadline){
 const windows=[],floors=new Map(),claimed=new Set();
 if(!starts||!Object.keys(starts).length)return {windows,floors};
 for(const [index,group] of groups.entries()){
  const members=Array.isArray(group)?group:group.spawnIds||[];
  const positions=entries.flatMap((row,at)=>row.count&&members.includes(row.spawnId)&&!claimed.has(row.spawnId)?[at]:[]);
  for(const spawn of members)claimed.add(spawn);
  if(!positions.length||Array.isArray(group)||!Object.prototype.hasOwnProperty.call(starts,group.id))continue;
  const time=starts[group.id],name=Groups.label(group,index);
  if(!Number.isFinite(time)||time<0||!Number.isInteger(time)&&!Number.isInteger(time/step)){
   return {error:name+' needs a nonnegative start in '+step+' s steps.'};
  }
  if(deadline!==null&&time>deadline&&!coincident(time,deadline)){
   return {error:name+' starts after the last-spawn limit.'};
  }
  const auto=[];
  let manualStart=Infinity;
  for(const at of positions){
   const row=entries[at];
   if(eligible.has(row.id)){auto.push(row);floors.set(row.id,time);}
   else manualStart=Math.min(manualStart,row.startSeconds);
  }
  const manualOpener=coincident(manualStart,time);
  if(!manualOpener&&(manualStart<time||!auto.length)){
   return {error:name+' has its first Manual arrival at '+manualStart+' s. Its start cannot be pinned at '+time+' s.'};
  }
  windows.push({time,positions,auto:manualOpener?[]:auto});
 }
 return {windows,floors};
}

function matches(timeline,windows){
 return windows.every(({positions,time})=>{
  const first=positions.reduce((earliest,at)=>Math.min(earliest,timeline[at].startSeconds),Infinity);
  return coincident(first,time);
 });
}

module.exports={prepare,matches};
