'use strict';

const Waves=require('./wave-editor');

function referenceTotals(stages,interval){
 const averages=[];
 for(const stage of stages){
  if(!Number.isInteger(stage?.Level)||stage.Level<15||stage.Level>20||!Array.isArray(stage.WaveCfg))continue;
  for(const [index,wave] of stage.WaveCfg.entries()){
   let units;
   try{units=Waves.summary(wave,interval).units;}catch(_){continue;}
   if(!Number.isSafeInteger(units)||units<1)continue;
   const sample=averages[index]||(averages[index]={sum:0,count:0});
   sample.sum+=units;
   sample.count++;
  }
 }
 return Array.from(averages,sample=>sample?Math.round(sample.sum/sample.count):null);
}

function suggestedTotal(totals,index){
 return totals[Math.min(index,totals.length-1)]??null;
}

function countPool(rows,unitThreats,isManual=Waves.isTimingManual){
 const adjustable=[];
 let fixed=0;
 for(const row of rows){
  if(!row.count)continue;
  const rank=unitThreats?.get(row.unitId)?.enemyClass;
  if(isManual(row)||rank==='boss'||rank==='elite')fixed+=row.count;
  else adjustable.push(row);
 }
 return {adjustable,fixed};
}

function targetTotal({adjustable,fixed},requested){
 return adjustable.length?Math.max(requested,fixed+adjustable.length):fixed;
}

function allocate({adjustable,fixed},total){
 const counts=new Map();
 let remaining=total-fixed,weight=adjustable.reduce((sum,row)=>sum+row.count,0);
 if(remaining===weight)return counts;
 const sorted=adjustable.map((row,index)=>({row,index})).sort((a,b)=>a.row.count-b.row.count);
 let first=0;
 // Reserve one unit for each group that would receive less than one at its proportional share.
 while(first<sorted.length&&sorted[first].row.count*remaining<weight){
  const {row}=sorted[first++];
  counts.set(row.id,1);
  remaining--;
  weight-=row.count;
 }
 const shares=sorted.slice(first).map(({row,index})=>{
  const quota=row.count*remaining/weight,count=Math.floor(quota);
  return {row,index,count,remainder:quota-count};
 });
 const extra=remaining-shares.reduce((sum,share)=>sum+share.count,0);
 shares.sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
 for(const [index,{row,count}] of shares.entries()){
  const assigned=count+Number(index<extra);
  if(assigned!==row.count)counts.set(row.id,assigned);
 }
 return counts;
}

module.exports={referenceTotals,suggestedTotal,countPool,targetTotal,allocate};
