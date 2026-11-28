'use strict';

const Waves=require('./wave-editor');
const Stats=require('./wave-stats');

// Bound the work for interleaved schedules. Large single streams use an
// analytic projection, while totals are always available when representable.
const MAX_ARRIVALS=25000;
const METRICS=['units','health','damage'];
const DEFAULT_DEFEAT_SECONDS=1;
const EARLY_WAVE_DEFEAT_SECONDS=[4,4,3,3,2];
const LEGACY_DEFAULT_DEFEAT_SECONDS=2;
const finiteStat=value=>Number.isFinite(value)?value:null;
const spawnTime=(row,index)=>row.start+index*row.gap;
const coincident=(left,right)=>Math.abs(left-right)<=Math.min(1e-8,Math.max(Math.abs(left),Math.abs(right))*Number.EPSILON*4);
const reached=(event,time)=>event<=time||coincident(event,time);

function defaultDefeatSeconds(wave,waveNumber){
 const authored=Number(wave?.Wave);
 const number=Number.isSafeInteger(authored)&&authored>0?authored:waveNumber;
 return EARLY_WAVE_DEFEAT_SECONDS[number-1]??DEFAULT_DEFEAT_SECONDS;
}

function savedDefeatOverride(wave){
 const saved=wave?.editorTimingBalance,seconds=saved?.defeatSeconds;
 if(!Number.isFinite(seconds)||seconds<=0||saved.defeatSecondsMode==='default')return null;
 // Older balance saves recorded the flat default as well as manual rates.
 return seconds===LEGACY_DEFAULT_DEFEAT_SECONDS&&saved.defeatSecondsMode!=='custom'?null:seconds;
}

function defeatSecondsFor(wave,waveNumber){
 return savedDefeatOverride(wave)??defaultDefeatSeconds(wave,waveNumber);
}

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

// A unit can only take a defeat slot after reaching a defense. An empty
// defense starts a new interval when the next unit arrives.
function defeatSchedule(events,seconds){
 const ordered=events.slice().sort((a,b)=>coincident(a.ready,b.ready)?(a.order??0)-(b.order??0):a.ready-b.ready);
 let start=0,beat=0,finish=-Infinity;
 const defeats=[];
 for(const event of ordered){
  if(!Number.isFinite(event.ready))return null;
  if(event.ready>finish){start=event.ready;beat=0;}
  const next=start+(++beat)*seconds;
  if(!Number.isFinite(next)||next<=finish||next<=event.ready)return null;
  finish=next;
  defeats.push({time:finish,event});
 }
 return defeats;
}

const defeatedBy=(defeats,time)=>lastReached(defeats.length,time,(index,target)=>reached(defeats[index].time,target))+1;
const travelSeconds=(travel,row)=>travel?.(row)?.seconds??0;

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
function aliveStats(arrivals,initiallyAlive=true){
 let size=1;
 while(size<arrivals.length)size*=2;
 const health=new Float64Array(size*2),damage=new Float64Array(size*2);
 if(initiallyAlive)arrivals.forEach((event,index)=>{
  health[size+index]=event.health??NaN;
  damage[size+index]=event.damage??NaN;
 });
 for(let index=size-1;index>0;index--){
  health[index]=health[2*index]+health[2*index+1];
  damage[index]=damage[2*index]+damage[2*index+1];
 }
 function slice(from,to){
  let hp=0,dmg=0;
  const add=index=>{hp+=health[index];dmg+=damage[index];};
  for(let left=from+size,right=to+size;left<right;left>>=1,right>>=1){
   if(left%2)add(left++);
   if(right%2)add(--right);
  }
  return {units:to-from,health:finiteStat(hp),damage:finiteStat(dmg)};
 }
 function setAlive(index,alive){
  const event=arrivals[index];
  health[size+index]=alive?(event.health??NaN):0;
  damage[size+index]=alive?(event.damage??NaN):0;
  for(let at=(size+index)>>1;at>0;at>>=1){
   health[at]=health[2*at]+health[2*at+1];
   damage[at]=damage[2*at]+damage[2*at+1];
  }
 }
 return {slice,setAlive,totals:units=>({units,health:finiteStat(health[1]),damage:finiteStat(damage[1])})};
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
 const {slice}=aliveStats(arrivals);
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

function travelProjection(rows,seconds){
 const arrivals=rows.flatMap(row=>Array.from({length:row.count},(_,index)=>{
  const time=spawnTime(row,index);
  return {time,ready:time+row.delay,health:row.health,damage:row.damage,order:row.order};
 })).sort((a,b)=>a.time-b.time||a.order-b.order);
 arrivals.forEach((event,index)=>event.index=index);
 const defeats=defeatSchedule(arrivals,seconds);
 if(!defeats)return null;
 const peaks=makePeaks(0,0),checkpoints=[],stats=aliveStats(arrivals,false);
 let spawned=0,defeated=0;
 while(spawned<arrivals.length||defeated<defeats.length){
  const time=Math.min(arrivals[spawned]?.time??Infinity,defeats[defeated]?.time??Infinity);
  while(defeated<defeats.length&&reached(defeats[defeated].time,time))stats.setAlive(defeats[defeated++].event.index,false);
  const before=spawned;
  while(spawned<arrivals.length&&reached(arrivals[spawned].time,time))stats.setAlive(spawned++,true);
  const live=stats.totals(spawned-defeated);
  if(spawned>before)updatePeaks(peaks,live,time);
  checkpoints.push({time,live});
 }
 return {peaks,timelineEnd:checkpoints.at(-1).time,at(time){
  const index=lastReached(checkpoints.length,time,(index,target)=>reached(checkpoints[index].time,target));
  return index<0?{units:0,health:0,damage:0}:checkpoints[index].live;
 }};
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

function travelSingleStream(row,seconds){
 const first=row.start+row.delay+seconds,gap=Math.max(row.gap,seconds);
 const finish=index=>first+index*gap;
 const timelineEnd=finish(row.count-1);
 if(!Number.isFinite(timelineEnd)||first<=row.start+row.delay)return null;
 const aliveAt=(index,time)=>Math.max(0,index-lastReached(row.count,time,(candidate,target)=>reached(finish(candidate),target)));
 const aliveAtSpawn=index=>aliveAt(index,spawnTime(row,index));
 const maximum=aliveAtSpawn(row.count-1);
 const earliest=lastReached(row.count,maximum,(index,target)=>aliveAtSpawn(index)<target)+1;
 const peaks=makePeaks(0,0);
 updatePeaks(peaks,rowStats(row,maximum),spawnTime(row,earliest));
 return {peaks,timelineEnd,at(time){
  const index=lastReached(row.count,time,(candidate,target)=>reached(spawnTime(row,candidate),target));
  return rowStats(row,aliveAt(index,time));
 }};
}

function build(wave,units,interval,defeatSeconds=defeatSecondsFor(wave),travel=null){
 if(!Number.isFinite(defeatSeconds)||defeatSeconds<=0)throw Error('Seconds per defeat must be greater than zero.');
 const catalog=new Map();
 for(const unit of units)if(!catalog.has(unit.id))catalog.set(unit.id,unit);
 const totals={units:0,health:0,damage:0},rows=[];
 let duration=0,firstArrival=Infinity,viaGoal=0,fromSpawn=0;
 for(const [order,entry] of Waves.schedule(wave,interval).entries()){
  const {unitId,count,startSeconds:start,intervalSeconds:gap}=entry;
  const last=start+(count-1)*gap;
  if(!Number.isSafeInteger(count)||count<0||!Number.isFinite(start)||start<0||!Number.isFinite(gap)||gap<0||count>1&&gap===0||count>0&&!Number.isFinite(last)){
   throw Error('Spawn entry '+(order+1)+' has invalid timing or unit count.');
  }
  if(!count)continue;
  const {health,damage}=Stats.resolve(catalog.get(unitId),wave);
  const forecast=travel?.(entry),delay=forecast?.seconds??0;
  const row={order,count,start,gap,health,damage,delay};
  if(travel){
   firstArrival=Math.min(firstArrival,start+delay);
   if(!forecast)fromSpawn+=count;
   else if(forecast.usesGoal)viaGoal+=count;
  }
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
 if(totals.units<=MAX_ARRIVALS)projection=travel&&rows.length?travelProjection(rows,defeatSeconds):eventProjection(rows,tickAt);
 else if(rows.length===1&&rows[0].gap>duration*Number.EPSILON&&
  (rows[0].gap===defeatSeconds||Math.abs(rows[0].gap-defeatSeconds)>duration*Number.EPSILON)){
  projection=travel?travelSingleStream(rows[0],defeatSeconds):singleStream(rows[0],defeatSeconds,tickAt);
 }
 if(!projection)return fallback;
 const timelineEnd=projection.timelineEnd??duration;
 return {duration,timelineEnd,totals,projected:true,peaks:projection.peaks,
  ...(travel&&rows.length?{travel:{firstArrival,firstDefeat:firstArrival+defeatSeconds,viaGoal,fromSpawn}}:{}),
  at:time=>projection.at(Number.isFinite(time)?Math.max(0,Math.min(time,timelineEnd)):0)};
}

module.exports={build,DEFAULT_DEFEAT_SECONDS,defaultDefeatSeconds,savedDefeatOverride,defeatSecondsFor,coincident,defeatTick,defeatSchedule,defeatedBy,travelSeconds};
