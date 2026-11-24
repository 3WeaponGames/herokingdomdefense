'use strict';

const {coincident,defeatTick}=require('./wave-pressure');

const MAX_PUSHES=4;
const PEAK_TOLERANCE=3;
function validPeaks(peaks,allowAutomatic=false){
 if(!Array.isArray(peaks)||peaks.length<1||peaks.length>MAX_PUSHES)return false;
 let previous=0;
 for(const time of peaks){
  if(allowAutomatic&&time===null)continue;
  if(!Number.isFinite(time)||time<=previous)return false;
  previous=time;
 }
 return true;
}

function defaultCount(stage){
 if(stage>=11)return 4;
 if(stage>=7)return 3;
 return stage>=4?2:1;
}

function suggestedPeaks(count,units,cap,rate,deadline,latestGroupStart=0){
 const spacing=Math.max(6,Math.min(15,units/count*rate+3));
 const nominal=5+(count-1)*spacing;
 const minimum=Math.max(0,units-cap)*rate;
 const duration=Math.max(nominal,latestGroupStart?latestGroupStart+2:0,Number.isSafeInteger(Math.ceil(minimum))?minimum:0);
 const scale=Math.max(count*.5,Math.min(duration,deadline??Infinity))/nominal;
 const targets=[];
 for(let index=0;index<count;index++){
  targets.push(Math.max((targets.at(-1)??0)+.5,Math.round((5+index*spacing)*scale*2)/2));
 }
 return targets;
}

function settings(peaks,cap,units,rowCount){
 if(peaks==null)return null;
 if(!validPeaks(peaks))throw Error('Enter positive peak times in increasing order.');
 // With whole spawn rows, a small roster may only support some of the pushes.
 const times=peaks.slice(0,Math.max(1,rowCount));
 const breaks=times.slice(1).map((time,index)=>times[index]+(time-times[index])/2);
 const targetSize=Math.max(1,Math.min(cap,Math.ceil(units*.48/times.length)));
 return {times,breaks,openingEnd:Math.min(2,times[0]/2),targetSize,
  openingSize:Math.max(1,Math.min(3,Math.floor(targetSize/3)+(times.length===1&&units>=4?1:0))),
  drop:Math.max(1,Math.min(4,Math.ceil(targetSize/3)))};
}

function measure(events,pacing,rate){
 const {times,breaks,openingEnd}=pacing;
 const opening={value:0,time:0},peaks=times.map(()=>({value:0,time:null})),lulls=[];
 let phase=0,prior={tick:0,alive:0};
 const recordLull=()=>{
  const time=breaks[phase++];
  lulls.push({value:Math.max(0,prior.alive-Math.max(0,defeatTick(time,rate)-prior.tick)),time});
 };
 for(const event of events){
  const {time,alive}=event;
  while(phase<breaks.length&&time>breaks[phase]&&!coincident(time,breaks[phase]))recordLull();
  if((time<=openingEnd||coincident(time,openingEnd))&&alive>opening.value){opening.value=alive;opening.time=time;}
  const peak=peaks[phase],target=times[phase];
  if(alive>peak.value||alive===peak.value&&Math.abs(time-target)<Math.abs(peak.time-target)){
   peak.value=alive;peak.time=time;
  }
  prior=event;
 }
 while(phase<breaks.length)recordLull();
 let distinct=0,previous=0,trough=Infinity,nearTargets=true;
 let score=3*Math.max(0,opening.value-pacing.openingSize);
 for(const [index,peak] of peaks.entries()){
  const target=times[index],distance=peak.time===null?12:Math.min(72,Math.abs(peak.time-target));
  nearTargets=nearTargets&&peak.time!==null&&distance<=PEAK_TOLERANCE;
  score+=2.2*Math.max(0,pacing.targetSize-peak.value)+distance*2/3;
  if(index>0){
   const lull=lulls[index-1].value;
   trough=Math.min(trough,lull);
   const drop=Math.min(peaks[index-1].value,peak.value)-lull;
   score+=3*Math.max(0,pacing.drop-drop);
  }
  if(peak.value){
   if(!previous||trough<Math.min(previous,peak.value)){distinct++;previous=peak.value;}
   else previous=Math.max(previous,peak.value);
   trough=Infinity;
  }
 }
 return {opening,peaks,lulls,openingEnd,score,distinct,nearTargets};
}

module.exports={MAX_PUSHES,PEAK_TOLERANCE,validPeaks,defaultCount,suggestedPeaks,settings,measure};
