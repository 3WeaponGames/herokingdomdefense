'use strict';

const Waves=require('./wave-editor');
const Stats=require('./wave-stats');

// Bound the work for interleaved schedules. Large single streams use an
// analytic projection, while totals are always available when representable.
const MAX_ARRIVALS=25000;
const METRICS=['units','health','damage'];
const DEFAULT_DEFEAT_SECONDS=2;
const finiteStat=value=>Number.isFinite(value)?value:null;
const spawnTime=(row,index)=>row.start+index*row.gap;
const coincident=(left,right)=>Math.abs(left-right)<=Math.min(1e-8,Math.max(Math.abs(left),Math.abs(right))*Number.EPSILON*4);
const reached=(event,time)=>event<=time||coincident(event,time);

function lastReached(length,target,reaches){
 let low=0,high=length;
 while(low<high){
  const mid=low+Math.floor((high-low)/2);
  if(reaches(mid,target))low=mid+1;
  else high=mid;
 }
 return low-1;
}

function defeatTick(time,seconds){
 const tick=Math.floor(time/seconds);
 return reached((tick+1)*seconds,time)?tick+1:tick;
}

function scaled(value,count){
 if(!count)return 0;
 return value===null?null:finiteStat(value*count);
}

function rowStats(row,count){
 return {units:count,health:scaled(row.health,count),damage:scaled(row.damage,count)};
}

function makePeaks(value,time){
 return Object.fromEntries(METRICS.map(metric=>[metric,{value,time}]));
}

function updatePeaks(peaks,stats,time){
 for(const metric of METRICS){
  const peak=peaks[metric],value=stats[metric];
  if(value===null){peak.value=null;peak.time=null;}
  else if(peak.value!==null&&value>peak.value){peak.value=value;peak.time=time;}
 }
}

// Alive enemies are always a contiguous slice of arrivals. A range sum tree
// lets us read that slice without cumulative subtraction, which would lose
// later small values or remain unknown after an earlier large/unknown stat.
function aliveStats(arrivals){
 let size=1;
 while(size<arrivals.length)size*=2;
 const health=new Float64Array(size*2),damage=new Float64Array(size*2);
 arrivals.forEach((event,index)=>{
  health[size+index]=event.health??NaN;
  damage[size+index]=event.damage??NaN;
 });
 for(let index=size-1;index>0;index--){
  health[index]=health[2*index]+health[2*index+1];
  damage[index]=damage[2*index]+damage[2*index+1];
 }
 return (from,to)=>{
  let hp=0,dmg=0;
  const add=index=>{hp+=health[index];dmg+=damage[index];};
  for(let left=from+size,right=to+size;left<right;left>>=1,right>>=1){
   if(left%2)add(left++);
   if(right%2)add(--right);
  }
  return {units:to-from,health:finiteStat(hp),damage:finiteStat(dmg)};
 };
}

function eventProjection(rows,tickAt){
 const arrivals=[];
 for(const row of rows){
  for(let index=0;index<row.count;index++)arrivals.push({time:spawnTime(row,index),order:row.order,health:row.health,damage:row.damage});
 }
 arrivals.sort((a,b)=>a.time-b.time||a.order-b.order);
 const peaks=makePeaks(0,0),checkpoints=[];
 let from=0,to=0,previousTick=0;
 while(to<arrivals.length){
  const time=arrivals[to].time,tick=tickAt(time);
  // Defeats at the same time as a spawn only remove enemies already alive.
  from+=Math.min(to-from,tick-previousTick);
  const start=to;
  while(to<arrivals.length&&coincident(arrivals[to].time,time))to++;
  // Independent authored expressions can produce nearly identical times.
  // Within that precision, keep the original row order for the FIFO queue.
  if(to-start>1){
   const tied=arrivals.slice(start,to).sort((a,b)=>a.order-b.order);
   for(let i=0;i<tied.length;i++)arrivals[start+i]=tied[i];
  }
  checkpoints.push({time,tick,from,to});
  previousTick=tick;
 }
 // Read survivors using the source order within each co-timed batch.
 const slice=aliveStats(arrivals);
 for(const {time,from,to} of checkpoints)updatePeaks(peaks,slice(from,to),time);
 return {
  peaks,
  at(time){
   const index=lastReached(checkpoints.length,time,(candidate,target)=>reached(checkpoints[candidate].time,target));
   if(index<0)return slice(0,0);
   const {from,to,tick}=checkpoints[index];
   const defeats=Math.max(0,tickAt(time)-tick);
   return slice(from+Math.min(to-from,defeats),to);
  }
 };
}

function singleStream(row,seconds,tickAt){
 const firstTick=tickAt(row.start),dense=row.gap<seconds;
 const aliveAtSpawn=index=>index+1-(tickAt(spawnTime(row,index))-firstTick);
 const maximum=dense?aliveAtSpawn(row.count-1):1;
 const earliest=dense?lastReached(row.count,maximum,(index,target)=>aliveAtSpawn(index)<target)+1:0;
 const peakTime=spawnTime(row,earliest),peakStats=rowStats(row,maximum);
 const peaks=makePeaks(0,0);
 updatePeaks(peaks,peakStats,peakTime);
 return {
  peaks,
  at(time){
   const index=lastReached(row.count,time,(candidate,target)=>reached(spawnTime(row,candidate),target));
   if(index<0)return rowStats(row,0);
   const tick=tickAt(time);
   return rowStats(row,dense?Math.max(0,index+1-(tick-firstTick)):Number(tick===tickAt(spawnTime(row,index))));
  }
 };
}

function build(wave,units,interval,defeatSeconds=DEFAULT_DEFEAT_SECONDS){
 if(!Number.isFinite(defeatSeconds)||defeatSeconds<=0)throw Error('Seconds per defeat must be greater than zero.');
 const catalog=new Map();
 for(const unit of units)if(!catalog.has(unit.id))catalog.set(unit.id,unit);
 const totals={units:0,health:0,damage:0},rows=[];
 let duration=0;
 for(const [order,entry] of Waves.schedule(wave,interval).entries()){
  const {unitId,count,startSeconds:start,intervalSeconds:gap}=entry;
  const last=start+(count-1)*gap;
  if(!Number.isSafeInteger(count)||count<0||!Number.isFinite(start)||start<0||!Number.isFinite(gap)||gap<0||count>1&&gap===0||count>0&&!Number.isFinite(last)){
   throw Error('Spawn entry '+(order+1)+' has invalid timing or unit count.');
  }
  if(!count)continue;
  const {health,damage}=Stats.resolve(catalog.get(unitId),wave);
  const row={order,count,start,gap,health,damage};
  const values=rowStats(row,count);
  for(const metric of METRICS){
   totals[metric]=totals[metric]===null||values[metric]===null?null:finiteStat(totals[metric]+values[metric]);
  }
  rows.push(row);
  duration=Math.max(duration,last);
 }
 if(!Number.isSafeInteger(totals.units))totals.units=null;
 const tickAt=time=>defeatTick(time,defeatSeconds);
 const fallback={duration,totals,projected:false,peaks:makePeaks(null,null),at:()=>({units:null,health:null,damage:null})};
 if(totals.units===null||!Number.isSafeInteger(tickAt(duration)))return fallback;

 let projection;
 if(totals.units<=MAX_ARRIVALS)projection=eventProjection(rows,tickAt);
 else if(rows.length===1&&rows[0].gap>duration*Number.EPSILON&&
  (rows[0].gap===defeatSeconds||Math.abs(rows[0].gap-defeatSeconds)>duration*Number.EPSILON)){
  projection=singleStream(rows[0],defeatSeconds,tickAt);
 }
 else return fallback;
 return {duration,totals,projected:true,peaks:projection.peaks,at:time=>projection.at(Number.isFinite(time)?Math.max(0,Math.min(time,duration)):0)};
}

module.exports={build,DEFAULT_DEFEAT_SECONDS,coincident,defeatTick};
