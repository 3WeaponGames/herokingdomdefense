'use strict';

const Waves=require('./wave-editor');
const Counts=require('./wave-counts');
const Pressure=require('./wave-pressure');
const Pacing=require('./wave-pacing');
const GroupTiming=require('./wave-group-timing');

const DEFAULT_PEAK_CAP=50;
const SUGGESTED_PEAK_CAPS=[5,9,14,18,22,27,33,39,45];
const TIMING_STEP=.5;
const SECOND_GROUP_LEAD=2.5;
const MAX_SEARCH_UNITS=25000;
const MAX_EVENTS_PER_PASS=400000;
const MAX_TACTICAL_EVENTS=60000;
const {coincident,defeatTick}=Pressure;
const atMost=(value,limit)=>value<=limit||coincident(value,limit);
const finalSpawn=row=>row.startSeconds+(row.count-1)*row.intervalSeconds;
const firstSpawn=rows=>rows.reduce((time,row)=>Math.min(time,row.startSeconds),Infinity);
const summary=projection=>({peak:projection.peaks.units.value,peakTime:projection.peaks.units.time,lastSpawn:projection.duration});

function suggestedPeakCap(waveNumber){
 return SUGGESTED_PEAK_CAPS[waveNumber-1]??DEFAULT_PEAK_CAP;
}

function snapTiming(seconds,round=Math.round){
 // Representable whole seconds are already valid, even if doubling would overflow.
 return Number.isInteger(seconds)?seconds:round(seconds/TIMING_STEP)*TIMING_STEP;
}

function usesTimingSteps(row){
 return row.startSeconds>=0&&row.intervalSeconds>=0&&row.startSeconds===snapTiming(row.startSeconds)&&row.intervalSeconds===snapTiming(row.intervalSeconds)&&
  (row.count<=1||row.intervalSeconds>=TIMING_STEP);
}

function addTimingNeighbors(values,seconds,minimum,maximum){
 if(!Number.isFinite(seconds))return;
 const lower=snapTiming(seconds,Math.floor),upper=snapTiming(seconds,Math.ceil);
 if(lower>=minimum&&lower<=maximum)values.add(lower);
 if(upper>=minimum&&upper<=maximum)values.add(upper);
}

function orderedGroups(rows,groups,spawnOrder,spawnOneFirst=false){
 const bySpawn=new Map();
 for(const row of rows){
  if(!bySpawn.has(row.spawnId))bySpawn.set(row.spawnId,[]);
  bySpawn.get(row.spawnId).push(row);
 }
 for(const lanes of bySpawn.values())lanes.sort((a,b)=>a.startSeconds-b.startSeconds);
 const grouped=[];
 function take(id){const lanes=bySpawn.get(id)||[];bySpawn.delete(id);return lanes;}
 for(const setting of groups){
  const members=Array.isArray(setting)?setting:setting.spawnIds;
  const lanes=(members||[]).flatMap(take);
  if(lanes.length)grouped.push(lanes);
 }
 const hasGroupedRows=grouped.length>0;
 const trailing=Array.from(new Set(spawnOrder.concat([...bySpawn.keys()].sort((a,b)=>a-b))));
 for(const id of trailing){
  const lanes=take(id);
  if(lanes.length)grouped.push(lanes);
 }
 if(spawnOneFirst){
  const index=grouped.findIndex(group=>group.some(row=>row.spawnId===1));
  if(index>=0){
   const [first]=grouped.splice(index,1);
   first.sort((left,right)=>Number(right.spawnId===1)-Number(left.spawnId===1));
   grouped.unshift(first);
  }
 }
 return {groups:grouped,hasGroupedRows};
}

function opensFromSpawnOne(rows){
 let one=Infinity,others=Infinity;
 for(const row of rows){
  if(row.spawnId===1)one=Math.min(one,row.startSeconds);
  else others=Math.min(others,row.startSeconds);
 }
 return others===Infinity||one<others;
}

function openingsAreOrdered(groups){
 let previous=0;
 for(const lanes of groups){
  const time=firstSpawn(lanes);
  if(!atMost(previous,time))return false;
  previous=time;
 }
 return true;
}

function spawnTimes(row){
 return Array.from({length:row.count},(_,index)=>row.startSeconds+index*row.intervalSeconds);
}

// Timing candidates use a count-only merge. In Wave Overview, a defeat tick
// removes the oldest survivor before new arrivals at the same time join it.
function canFit(fixed,row,start,gap,rate,cap){
 let fixedIndex=0,rowIndex=0,tick=0,alive=0;
 const nextRow=()=>rowIndex<row.count?start+rowIndex*gap:Infinity;
 while(fixedIndex<fixed.length||rowIndex<row.count){
  const time=Math.min(fixed[fixedIndex]??Infinity,nextRow());
  const nextTick=defeatTick(time,rate);
  alive=Math.max(0,alive-(nextTick-tick));
  tick=nextTick;
  while(fixedIndex<fixed.length&&coincident(fixed[fixedIndex],time)){fixedIndex++;alive++;}
  while(rowIndex<row.count&&coincident(nextRow(),time)){rowIndex++;alive++;}
  if(alive>cap)return false;
 }
 return true;
}

function samples(minimum,maximum,preferred,step,gridSize,nearby){
 if(!atMost(minimum,maximum))return [];
 maximum=Math.max(minimum,maximum);
 const center=Math.max(minimum,Math.min(maximum,preferred)),values=new Set([center,minimum,maximum]);
 const count=Math.floor((maximum-minimum)/step),increment=step*Math.max(1,Math.ceil(count/gridSize));
 for(let index=1;index<=gridSize&&Number.isFinite(increment);index++){
  const sample=minimum+index*increment;
  if(sample>=maximum)break;
  values.add(sample);
 }
 for(let offset=1;offset<=nearby;offset++){
  const delta=offset*step;
  if(center+delta<=maximum)values.add(center+delta);
  if(center-delta>=minimum)values.add(center-delta);
 }
 return [...values];
}

function starts(row,gap,floor,limit,rate,early,preferredEnd){
 const span=(row.count-1)*gap;
 const maximum=snapTiming(limit,Math.floor)-span;
 if(maximum<floor)return [];
 const target=preferredEnd===undefined?row.startSeconds:preferredEnd-span;
 const preferred=early?floor:snapTiming(target);
 const values=new Set(samples(floor,maximum,preferred,TIMING_STEP,112,12));
 // Include legal starts near projected defeat ticks, even at fractional rates.
 const addAligned=offset=>{
  const from=Math.max(floor,Math.ceil((floor+offset)/rate)*rate-offset);
  const to=Math.floor((maximum+offset)/rate)*rate-offset;
  for(const start of samples(from,to,Math.round((preferred+offset)/rate)*rate-offset,rate,24,6)){
   addTimingNeighbors(values,start,floor,maximum);
  }
 };
 addAligned(0);
 if(span)addAligned(span);
 if(row.count>2)addAligned(Math.floor((row.count-1)/2)*gap);
 const sorted=[...values];
 if(early)return sorted.sort((a,b)=>a-b);
 return sorted.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||a-b);
}

function intervals(row,floor,limit,rate,keepIntervals){
 const rounded=snapTiming(row.intervalSeconds);
 if(row.count===1)return [rounded];
 const preferred=Math.max(TIMING_STEP,rounded);
 const maximum=snapTiming((snapTiming(limit,Math.floor)-floor)/(row.count-1),Math.floor);
 if(maximum<TIMING_STEP)return [];
 if(keepIntervals)return preferred<=maximum?[preferred]:[];
 const choices=new Set(samples(preferred,maximum,preferred,TIMING_STEP,12,12));
 for(const gap of samples(TIMING_STEP,Math.min(maximum,preferred),preferred,TIMING_STEP,8,6))choices.add(gap);
 addTimingNeighbors(choices,rate,TIMING_STEP,maximum);
 // Sample intervals near the recurring defeat ticks as well as nearby edits.
 const beat=Math.max(TIMING_STEP,rate/4),maxBeat=Math.floor(maximum/beat)*beat;
 const nearBeat=Math.round(preferred/beat)*beat;
 for(const gap of samples(beat,maxBeat,nearBeat,beat,12,6)){
  addTimingNeighbors(choices,gap,TIMING_STEP,maximum);
 }
 return [...choices].sort((a,b)=>{
  const shorterA=a<preferred,shorterB=b<preferred;
  if(shorterA!==shorterB)return shorterA?1:-1;
  return shorterA?b-a:a-b;
 });
}

function place(groups,locked,limit,rate,cap,{keepIntervals,early,goals,spawnOneFirst,floors,pins}){
 // Reserve the other pinned arrivals while placing each stream.
 let fixed=locked.flatMap(spawnTimes).concat(pins?[...pins.values()]:[]).sort((a,b)=>a-b),opening=0,budget=MAX_EVENTS_PER_PASS,one=Infinity;
 const placed=new Map();
 for(const group of groups){
  let groupOpening=Infinity;
  for(const row of group){
   const goal=goals?.get(row.id),end=Math.min(limit,goal?.limit??limit),pin=pins?.get(row.id);
   const lead=spawnOneFirst&&row.spawnId!==1?snapTiming(one+TIMING_STEP,Math.ceil):0;
   const floor=Math.max(opening,lead,floors?.get(row.id)??0,pin??goal?.start??0);
   if(!Number.isFinite(floor)||(pin!==undefined&&pin<floor))return null;
   if(pin!==undefined)fixed.splice(fixed.indexOf(pin),1);
   let choice,chosenEnd=Infinity;
   candidates: for(const gap of intervals(row,floor,end,rate,keepIntervals)){
    const possible=pin===undefined?starts(row,gap,floor,end,rate,early,goal?.peak):[pin];
    for(const start of possible){
     const last=start+(row.count-1)*gap;
     // The compact pass compares the best end across gaps, leaving earlier
     // defeat slots available to groups later in opening order.
     if(early&&last>=chosenEnd)break;
     budget-=fixed.length+row.count;
     if(budget<0)return null;
     if(!Number.isFinite(last)||!atMost(last,end)||!Number.isSafeInteger(defeatTick(last,rate)))continue;
     if(canFit(fixed,row,start,gap,rate,cap)){
      choice={...row,startSeconds:start,intervalSeconds:gap};
      chosenEnd=last;
      if(!early)break candidates;
      break;
     }
    }
   }
   if(!choice)return null;
   if(row.spawnId===1)one=Math.min(one,choice.startSeconds);
   groupOpening=Math.min(groupOpening,choice.startSeconds);
   fixed=fixed.concat(spawnTimes(choice)).sort((a,b)=>a-b);
   placed.set(row.id,choice);
  }
  opening=groupOpening;
 }
 return placed;
}

function placePinnedGroups(groups,locked,timing,horizons,rate,cap,spawnOneFirst,accept){
 const ordered=groups.flat(),{windows,floors}=timing;
 const choices=windows.filter(group=>group.auto.length).sort((a,b)=>a.time-b.time).map(({time,auto})=>{
  const candidates=spawnOneFirst&&auto.some(row=>row.spawnId===1)?auto.filter(row=>row.spawnId===1):auto.slice();
  candidates.sort((a,b)=>a.count-b.count||a.startSeconds-b.startSeconds);
  return {time,candidates};
 });
 const attempts=Math.min(3,Math.max(1,...choices.map(choice=>choice.candidates.length)));
 for(const horizon of horizons){
  if(!Number.isSafeInteger(defeatTick(horizon,rate)))continue;
  for(let attempt=0;attempt<attempts;attempt++){
   const anchors=choices.map(choice=>choice.candidates[attempt%choice.candidates.length]);
   const pins=new Map(anchors.map((row,index)=>[row.id,choices[index].time]));
   const sequence=anchors.concat(ordered.filter(row=>!pins.has(row.id)));
   if(spawnOneFirst){
    const index=sequence.findIndex(row=>row.spawnId===1&&pins.has(row.id));
    const first=index>=0?index:sequence.findIndex(row=>row.spawnId===1);
    const [lead]=sequence.splice(first,1);
    sequence.unshift({...lead,startSeconds:pins.get(lead.id)??0});
   }
   for(const early of [false,true]){
    const placed=place([sequence],locked,horizon,rate,cap,{keepIntervals:false,early,floors,pins,spawnOneFirst});
    const result=accept(placed);
    if(result)return result;
   }
  }
 }
 return null;
}

function separateStreams(groups,lockedProjection,rate,spawnOneFirst){
 const duration=lockedProjection.duration;
 let start=duration+lockedProjection.at(duration).units*rate;
 const placed=new Map();
 for(const group of groups){
  for(const row of group){
   const choice={...row,
    startSeconds:snapTiming(Math.max(start,row.startSeconds),Math.ceil),
    intervalSeconds:row.count>1?snapTiming(Math.max(rate,row.intervalSeconds,TIMING_STEP),Math.ceil):snapTiming(row.intervalSeconds)
   };
   const last=finalSpawn(choice);
   if(!Number.isFinite(last))return null;
   start=last+(spawnOneFirst?Math.max(rate,TIMING_STEP):rate);
   placed.set(row.id,choice);
  }
 }
 return placed;
}

function tacticalContext(rows,unitThreats,spawnGroups,rate,pacing){
 if(!unitThreats&&!pacing)return null;
 const groupBySpawn=new Map();
 for(const [index,group] of spawnGroups.entries()){
  for(const id of (Array.isArray(group)?group:group.spawnIds)||[]){
   if(!groupBySpawn.has(id))groupBySpawn.set(id,'group:'+index);
  }
 }
 const beat=Math.min(rate,2),profiles=new Map(),frontlineGroups=new Set();
 let matchedRows=0,totalRows=0,importantArrivals=0;
 for(const row of rows){
  if(!row.count)continue;
  const trait=unitThreats?.get(row.unitId);
  const known=Number.isFinite(trait?.weight)&&trait.weight>0;
  const weight=known?Math.min(12,trait.weight):1;
  const group=groupBySpawn.get(row.spawnId)??'spawn:'+row.spawnId;
  const phase=Number.isFinite(trait?.phase)?trait.phase:1;
  const power=trait?.enemyClass==='boss'?2:trait?.enemyClass==='elite'?1.4:trait?.heavy?1:0;
  const hazardous=phase>=4||power>0||trait?.area||trait?.flight;
  const front=trait?.frontline===true&&phase<4&&!trait.flight;
  const back=(trait?.backline===true||trait?.support===true)&&!hazardous;
  const opener=phase<=1&&!hazardous;
  const coverLead=back?beat*(trait?.support ? .5 : 1/3):0;
  const buildup=hazardous?beat*(phase>=5 ? .75 : phase>=4 ? .5 : .35):0;
  const burst=weight*(1+(trait?.flight ? .25 : 0)+(trait?.area ? .3 : 0)+.28*power);
  profiles.set(row.id,{group,weight,burst,front,back,opener,coverLead,buildup});
  if(front)frontlineGroups.add(group);
  if(hazardous||row.count>=8)importantArrivals+=row.count;
  if(known)matchedRows++;
  totalRows++;
 }
 if(!totalRows||!matchedRows&&!pacing)return null;
 return {profiles,frontlineGroups,matchedRows,totalRows,importantArrivals,beat,rate,pacing};
}

function firstStarts(rows,profiles,qualifies){
 const starts=new Map();
 for(const row of rows){
  const profile=profiles.get(row.id);
  if(!profile||!qualifies(profile))continue;
  starts.set(profile.group,Math.min(starts.get(profile.group)??Infinity,row.startSeconds));
 }
 return starts;
}

function sidePacingCost(arrivals,context){
 const [firstGroup,secondGroup]=context.openingSides;
 if(secondGroup===undefined)return 0;
 const {times,breaks}=context.pacing,mixed=Array(times.length).fill(0);
 let phase=0,firstEnd=0,firstCount=0,secondStart=Infinity;
 for(const {time,profile} of arrivals){
  if(profile.group!==firstGroup&&profile.group!==secondGroup)continue;
  while(phase<breaks.length&&time>breaks[phase])phase++;
  if(profile.group===firstGroup){
   firstEnd=time;firstCount++;mixed[phase]|=1;
  }else{
   secondStart=Math.min(secondStart,time);mixed[phase]|=2;
  }
 }
 const joined=mixed.filter(sides=>sides===3).length;
 const followBy=Math.min(times[0],Math.min(.5,context.originalOpening)+SECOND_GROUP_LEAD);
 const late=Math.max(0,secondStart-followBy);
 const serial=firstCount>1&&secondStart>=firstEnd?2:0;
 return 3*Math.min(24,late)+serial+2*Math.max(0,context.mixablePushes-joined);
}

// The same global FIFO defeats used by Wave Overview drive the weighted living
// pressure. Short arrival bursts and local formation timing are soft objectives.
function tacticalScore(rows,context){
 const {profiles,frontlineGroups,beat,rate,pacing}=context;
 const arrivals=[],events=pacing?[]:null;
 const fronts=firstStarts(rows,profiles,profile=>profile.front);
 const openers=firstStarts(rows,profiles,profile=>profile.opener);
 let waveOpener=Infinity;
 for(const time of openers.values())waveOpener=Math.min(waveOpener,time);
 for(const [order,row] of rows.entries()){
  if(!row.count)continue;
  const profile=profiles.get(row.id);
  for(let index=0;index<row.count;index++){
   arrivals.push({time:row.startSeconds+index*row.intervalSeconds,order,profile});
  }
 }
 arrivals.sort((left,right)=>left.time-right.time||left.order-right.order);
 let from=0,to=0,previousTick=0,burstFrom=0,liveWeight=0,burstWeight=0;
 let peakAlive=0,peakThreat=0,peakThreatTime=0,peakBurst=0,peakBurstTime=0;
 let sampledThreat=0,sampledBurst=0,formationPenalty=0,formationCount=0;
 let openingPenalty=0,openingCount=0,coveredBackliners=0;
 let quietGap=0,previousArrival=0;
 const livingFronts=new Map();
 const addFront=(profile,count)=>{
  if(profile.front)livingFronts.set(profile.group,(livingFronts.get(profile.group)||0)+count);
 };
 while(to<arrivals.length){
  const time=arrivals[to].time,tick=defeatTick(time,rate);
  if(!Number.isSafeInteger(tick))return null;
  if(to){
   const clearedAt=Math.max(previousArrival,(previousTick+to-from)*rate);
   quietGap=Math.max(quietGap,time-clearedAt);
  }
  const nextFrom=from+Math.min(to-from,tick-previousTick),first=to;
  while(from<nextFrom){
   const {profile}=arrivals[from++];
   liveWeight-=profile.weight;
   addFront(profile,-1);
  }
  if(from===to)liveWeight=0;
  while(burstFrom<to&&atMost(arrivals[burstFrom].time+beat,time)){
   burstWeight-=arrivals[burstFrom++].profile.burst;
  }
  if(burstFrom===to)burstWeight=0;
  while(to<arrivals.length&&coincident(arrivals[to].time,time))to++;
  if(to-first>1){
   const tied=arrivals.slice(first,to).sort((left,right)=>left.order-right.order);
   tied.forEach((arrival,index)=>{arrivals[first+index]=arrival;});
  }
  for(let index=first;index<to;index++){
   const {profile}=arrivals[index];
   const {group,weight,burst}=profile;
   if(profile.back&&frontlineGroups.has(group)){
    formationCount++;
    if(!atMost(fronts.get(group)+profile.coverLead,time))formationPenalty+=2.5*weight;
    else if((livingFronts.get(group)||0)>0)coveredBackliners++;
    else formationPenalty+=2*weight;
   }
   if(profile.buildup&&Number.isFinite(waveOpener)){
    openingCount++;
    if(!atMost((openers.get(group)??waveOpener)+profile.buildup,time))openingPenalty+=weight;
   }
   liveWeight+=weight;burstWeight+=burst;
  }
  // Newly spawned screens start covering from the next arrival beat.
  for(let index=first;index<to;index++)addFront(arrivals[index].profile,1);
  const alive=to-from;
  if(events)events.push({time,tick,alive});
  peakAlive=Math.max(peakAlive,alive);
  if(liveWeight>peakThreat+1e-8){peakThreat=liveWeight;peakThreatTime=time;}
  if(burstWeight>peakBurst+1e-8){peakBurst=burstWeight;peakBurstTime=time;}
  sampledThreat+=liveWeight*(to-first);sampledBurst+=burstWeight*(to-first);
  previousTick=tick;previousArrival=time;
 }
 const average=arrivals.length||1;
 const first=arrivals[0]?.time??0,beatSize=Math.max(.25,beat);
 const timingPenalty=.7*Math.min(8,Math.abs(first-context.originalOpening)/beatSize)+
  .25*Math.min(8,Math.max(0,quietGap-beat)/beatSize);
 const tacticalCost=peakThreat+.34*peakBurst+.16*sampledThreat/average+.08*sampledBurst/average+
  formationPenalty/Math.sqrt(formationCount||1)+openingPenalty/Math.sqrt(openingCount||1)+timingPenalty;
 const shape=pacing?Pacing.measure(events,pacing,rate):null;
 const openingDelay=Math.max(0,first-Math.min(.5,context.originalOpening));
 const score=shape ? .55*tacticalCost+shape.score+2.5*Math.min(8,openingDelay)+sidePacingCost(arrivals,context) : tacticalCost;
 return {score,peakAlive,peakThreat,peakThreatTime,peakBurst,peakBurstTime,coveredBackliners,pacing:shape};
}

function tacticalOptions(row,rows,context,horizon,current){
 const {profiles,beat,rate,pacing}=context,profile=profiles.get(row.id),lead=beat/3;
 const end=snapTiming(horizon,Math.floor),gap=row.intervalSeconds,span=(row.count-1)*gap,maximum=end-span;
 const starts=new Set(samples(0,maximum,row.startSeconds,TIMING_STEP,8,3));
 const addStart=time=>addTimingNeighbors(starts,time,0,maximum);
 for(const time of [current.peakThreatTime,current.peakBurstTime,row.startSeconds]){
  for(const offset of [-beat,beat,lead]){
   addStart(time+offset);
  }
  addStart((defeatTick(time,rate)+1)*rate);
 }
 for(const related of rows){
  const relation=profiles.get(related.id);
  if(!relation)continue;
  if(profile.buildup&&relation.opener)addStart(related.startSeconds+profile.buildup);
  if(relation.group!==profile.group)continue;
  if(profile.back&&relation.front)addStart(related.startSeconds+profile.coverLead);
  if(profile.front&&relation.back)addStart(related.startSeconds-relation.coverLead);
 }
 if(pacing){
  addStart(pacing.openingEnd+TIMING_STEP);
  for(const time of pacing.times)addStart(time-span);
  for(const time of pacing.breaks)addStart(time+TIMING_STEP);
 }
 const options=[...starts].map(startSeconds=>({...row,startSeconds}));
 if(row.count>1){
  const maximumGap=snapTiming(end/(row.count-1),Math.floor),intervals=new Set();
  for(const target of [gap+TIMING_STEP,gap+lead,gap+beat,gap*1.5,rate,maximumGap]){
   addTimingNeighbors(intervals,target,gap+TIMING_STEP,maximumGap);
  }
  if(pacing){
   const towardPeaks=pacing.times.map(time=>(time-row.startSeconds)/(row.count-1));
   for(const target of [TIMING_STEP,1,1.5,...towardPeaks]){
    addTimingNeighbors(intervals,target,TIMING_STEP,maximumGap);
   }
  }
  for(const intervalSeconds of intervals){
   const span=(row.count-1)*intervalSeconds,maximumStart=end-span;
   const optionsForGap=new Set([Math.max(0,Math.min(row.startSeconds,maximumStart))]);
   if(pacing){
    for(const time of pacing.times)addTimingNeighbors(optionsForGap,time-span,0,maximumStart);
   }
   for(const startSeconds of optionsForGap)options.push({...row,startSeconds,intervalSeconds});
  }
 }
 return options;
}

function refineTiming(rows,context,horizon,free,groups,cap,checkOrder){
 const timeline=rows.slice(),positions=new Map(timeline.map((row,index)=>[row.id,index]));
 const total=timeline.reduce((sum,row)=>sum+row.count,0);
 let current=tacticalScore(timeline,context),budget=Math.max(0,Math.floor(MAX_TACTICAL_EVENTS/Math.max(1,total)));
 if(!current)return {rows,score:null};
 for(let pass=0;pass<2;pass++){
  let improved=false;
  for(const index of free){
   const row=timeline[index];
   let chosen=row;
   for(const option of tacticalOptions(row,timeline,context,horizon,current)){
    if(option.startSeconds===row.startSeconds&&option.intervalSeconds===row.intervalSeconds)continue;
    if(budget--<=0)return {rows:timeline,score:current};
    const last=finalSpawn(option);
    if(!Number.isFinite(last)||!atMost(last,horizon))continue;
    timeline[index]=option;
    if(!GroupTiming.matches(timeline,context.groupStarts)||context.spawnOneFirst&&!opensFromSpawnOne(free.map(at=>timeline[at]))||
       checkOrder&&!openingsAreOrdered(groups.map(group=>group.map(entry=>timeline[positions.get(entry.id)])))){
     timeline[index]=chosen;
     continue;
    }
    const scored=tacticalScore(timeline,context);
    if(scored&&scored.peakAlive<=cap&&scored.score<current.score-.001){
     chosen=option;current=scored;improved=true;
    }
    timeline[index]=chosen;
   }
  }
  if(!improved)break;
 }
 return {rows:timeline,score:current};
}

// Try a few ordered placements before adjusting individual lanes. Moving just
// one lane can break spawn-group order while the later lanes are still at 0 s.
function refinePushes(rows,initial,context,horizon,free,groups,locked,cap,checkOrder){
 const {pacing,profiles,rate,originalOpening,spawnOneFirst}=context,{times,breaks}=pacing;
 if(context.groupStarts.length)return refineTiming(rows,context,horizon,free,groups,cap,checkOrder);
 const preferOpener=(left,right)=>{
  if(spawnOneFirst&&left.spawnId!==right.spawnId&&(left.spawnId===1||right.spawnId===1))return left.spawnId===1?-1:1;
  const a=profiles.get(left.id),b=profiles.get(right.id);
  return Number(b.opener)-Number(a.opener)||left.count*a.weight-right.count*b.weight;
 };
 const groupsToPlace=groups.map(group=>group.slice().sort(preferOpener));
 const ordered=[];
 for(let offset=0,remaining=groupsToPlace;remaining.length;offset++){
  const next=[];
  for(const group of remaining){
   ordered.push(group[offset]);
   if(group.length>offset+1)next.push(group);
  }
  remaining=next;
 }
 if(ordered.length<times.length)return refineTiming(rows,context,horizon,free,groups,cap,checkOrder);
 const cumulative=[0];
 for(const [index,row] of ordered.entries())cumulative.push(cumulative[index]+row.count*profiles.get(row.id).weight);
 const totalWeight=cumulative[ordered.length];
 const opener=!spawnOneFirst&&locked.some(row=>row.startSeconds<=pacing.openingEnd)?null:ordered[0];
 const support=groupsToPlace[1]?.[0];
 const follow=snapTiming(Math.min(SECOND_GROUP_LEAD,times[0]),Math.ceil);
 const placement=ordered.map(row=>row===opener?{...row,startSeconds:Math.min(.5,originalOpening),
  intervalSeconds:Math.max(row.intervalSeconds,snapTiming(pacing.openingEnd/pacing.openingSize,Math.ceil))}:
  row===support?{...row,startSeconds:follow}:row);
 let seed=rows,best=initial;
 for(const firstShare of times.length>1?[.65,1,1.35]:[1]){
  const bounds=[0];
  for(let index=1;index<times.length;index++){
   const weight=totalWeight*(index-1+firstShare)/(times.length-1+firstShare);
   const last=ordered.length-(times.length-index);
   let split=bounds[index-1]+1;
   if(index===1&&support&&last>=2)split=2;
   while(split<last&&Math.abs(cumulative[split+1]-weight)<Math.abs(cumulative[split]-weight))split++;
   bounds.push(split);
  }
  bounds.push(ordered.length);
  const goals=new Map();
  for(const [index,peak] of times.entries()){
   const ramp=index?times[index-1]+(peak-times[index-1])/3:Math.min(peak,pacing.openingEnd+TIMING_STEP);
   const start=snapTiming(ramp,Math.ceil),limit=breaks[index]===undefined?horizon:breaks[index]-TIMING_STEP;
   for(const row of ordered.slice(bounds[index],bounds[index+1])){
    const priority=row===opener||row===support&&index===0;
    goals.set(row.id,priority?{start:row===opener?0:Math.min(TIMING_STEP,follow),limit}:{start,peak,limit});
   }
  }
  const placed=place([placement],locked,horizon,rate,cap,{keepIntervals:false,early:false,goals,spawnOneFirst});
  if(!placed||checkOrder&&!openingsAreOrdered(groups.map(group=>group.map(row=>placed.get(row.id)))))continue;
  const candidate=rows.map(row=>placed.get(row.id)||row),score=tacticalScore(candidate,context);
  if(score&&score.peakAlive<=cap&&score.score<best.score){seed=candidate;best=score;}
 }
 return refineTiming(seed,context,horizon,free,groups,cap,checkOrder);
}

function plan(wave,{
 interval,defeatSeconds=Pressure.DEFAULT_DEFEAT_SECONDS,peakCap=DEFAULT_PEAK_CAP,lastSpawnLimit=null,pushPeaks=null,totalUnits=null,
 spawnGroups=[],spawnOrder=[],groupStarts={},timingEdits=null,isManual=Waves.isTimingManual,unitThreats
}={}){
 if(!Number.isSafeInteger(peakCap)||peakCap<1)throw Error('Max enemies alive must be a positive whole number.');
 if(lastSpawnLimit!==null&&(!Number.isFinite(lastSpawnLimit)||lastSpawnLimit<0))throw Error('Last spawn by must be zero or greater.');
 if(totalUnits!==null&&(!Number.isSafeInteger(totalUnits)||totalUnits<1||totalUnits>MAX_SEARCH_UNITS)){
  throw Error('Target unit count must be a whole number from 1 to '+MAX_SEARCH_UNITS+'.');
 }
 const project=source=>Pressure.build(source,[],interval,defeatSeconds);
 const original=project(wave),before=summary(original);
 const changes=[];
 const fail=(reason,message,details={})=>({ok:false,reason,message,before,changes,...details});
 const fitsDeadline=time=>lastSpawnLimit===null||atMost(time,lastSpawnLimit);
 if(!original.projected)return fail('projection-unavailable','The schedule exceeds the timing projection range.');

 const originalEntries=Waves.entries(wave,interval);
 let entries=originalEntries,working=original;
 if(totalUnits!==null){
  const pool=Counts.countPool(originalEntries,unitThreats,isManual),total=Counts.targetTotal(pool,totalUnits);
  if(total>MAX_SEARCH_UNITS)return fail('projection-unavailable','The fixed counts and number of spawn rows exceed the wave balance limit.');
  const counts=Counts.allocate(pool,total);
  if(counts.size){
   entries=originalEntries.map(row=>{
    const count=counts.get(row.id);
    if(count===undefined)return row;
    const intervalSeconds=count>1&&row.intervalSeconds===0?TIMING_STEP:row.intervalSeconds;
    return {...row,count,intervalSeconds};
   });
   working=project({...wave,SpawnTimeline:entries});
   if(!working.projected)return fail('projection-unavailable','The proposed counts exceed the timing projection range.');
  }
 }
 const baseline=working===original?before:summary(working);
 const locked=[],eligible=[];
 for(const row of entries){
  if(!row.count)continue;
  (isManual(row)?locked:eligible).push(row);
 }
 const eligibleIds=new Set(eligible.map(row=>row.id));
 const timing=GroupTiming.prepare(entries,spawnGroups,groupStarts,eligibleIds,TIMING_STEP,lastSpawnLimit);
 if(timing.error)return fail('group-start-conflict',timing.error);
 if(Array.isArray(pushPeaks)&&pushPeaks.includes(null)){
  const latestStart=timing.windows.reduce((latest,group)=>Math.max(latest,group.time),0);
  const suggested=Pacing.suggestedPeaks(pushPeaks.length,working.totals.units,peakCap,defeatSeconds,lastSpawnLimit,latestStart);
  pushPeaks=pushPeaks.map((time,index)=>time??suggested[index]);
 }
 const pacing=Pacing.settings(pushPeaks,peakCap,working.totals.units,eligible.length+locked.length);
 const hasGroupTimes=timing.windows.length>0;
 const spawnOneFirst=(!!pacing||hasGroupTimes)&&eligible.some(row=>row.spawnId===1);
 const {groups,hasGroupedRows}=orderedGroups(eligible,spawnGroups,spawnOrder,spawnOneFirst);
 const checkGroupOrder=hasGroupedRows&&!hasGroupTimes;

 function inspectTimeline(timeline){
  const auto=timeline.filter(row=>eligibleIds.has(row.id));
  if(timeline.some(row=>row.count&&!Number.isFinite(finalSpawn(row)))||auto.some(row=>!usesTimingSteps(row))){
   return fail('invalid-timing','Use nonnegative starts and intervals in '+TIMING_STEP+' s steps. Repeating rows need an interval of at least '+TIMING_STEP+' s.');
  }
  if(spawnOneFirst&&!opensFromSpawnOne(auto))return fail('spawn-one-order','Spawn 1 needs to send before the other Auto rows.');
  if(!GroupTiming.matches(timeline,timing.windows))return fail('group-start-conflict','These timings move a pinned spawn-group start. Keep at least one arrival at its set time and the rest at or after it.');
  const edits=originalEntries.reduce((items,row,index)=>{
   const {id,count,startSeconds,intervalSeconds}=timeline[index];
   const timingChanged=row.startSeconds!==startSeconds||row.intervalSeconds!==intervalSeconds;
   if(row.count!==count||timingChanged){
    items.push({id,...(row.count!==count?{count}:{}),...(timingChanged?{startSeconds,intervalSeconds}:{})});
   }
   return items;
  },[]);
  const afterWave=edits.length?{...wave}:wave;
  Waves.applyBalancedTiming({config:{WaveCfg:[afterWave]}},0,edits,interval);
  const verified=project(afterWave),after=summary(verified);
  if(!verified.projected)return fail('projection-unavailable','The edited schedule exceeds the timing projection range.');
  if(after.peak>peakCap)return fail('peak-exceeded','The edited plan peaks at '+after.peak+' enemies. The cap is '+peakCap+'.');
  if(!fitsDeadline(after.lastSpawn))return fail('deadline-exceeded','The edited plan spawns through '+after.lastSpawn+' s. The limit is '+lastSpawnLimit+' s.');
  return {ok:true,before,after,changes:edits,afterWave};
 }

 function buildResult(timeline){
  const checked=inspectTimeline(timeline);
  return checked.ok?checked:null;
 }

 function finish(baseline,checkOrder,refine=true){
  if(Math.max(original.totals.units,working.totals.units)>MAX_SEARCH_UNITS)return baseline;
  const context=tacticalContext(entries,unitThreats,spawnGroups,defeatSeconds,pacing);
  if(!context)return baseline;
  const rows=baseline.changes.length?Waves.entries(baseline.afterWave,interval):entries;
  context.originalOpening=firstSpawn(rows.filter(row=>row.count));
  context.spawnOneFirst=spawnOneFirst;
  context.groupStarts=timing.windows;
  if(pacing){
   const active=orderedGroups(entries.filter(row=>row.count),spawnGroups,spawnOrder,spawnOneFirst).groups.slice(0,2);
   context.openingSides=active.map(group=>context.profiles.get(group[0].id).group);
   context.mixablePushes=Math.min(pacing.times.length,...active.map(group=>group.length));
  }
  const prior=tacticalScore(originalEntries,context);
  const initial=tacticalScore(rows,context);
  if(!prior||!initial)return baseline;
  if(!refine)return {...baseline,tactical:{before:prior,after:initial,matchedRows:context.matchedRows,totalRows:context.totalRows}};
  const free=rows.map((row,index)=>({row,index})).filter(({row})=>eligibleIds.has(row.id))
   .sort((left,right)=>context.profiles.get(right.row.id).weight-context.profiles.get(left.row.id).weight||left.index-right.index)
   .map(({index})=>index);
  let chosen=baseline,after=initial;
  if(free.length&&pacing){
   const {times}=pacing;
   const desiredEnd=snapTiming(Math.min(Number.MAX_VALUE,times[times.length-1]+Pacing.PEAK_TOLERANCE),Math.ceil);
   const horizon=Math.min(Math.max(baseline.after.lastSpawn,desiredEnd),lastSpawnLimit??Infinity);
   if(Number.isSafeInteger(defeatTick(horizon,defeatSeconds))){
    const shaped=refinePushes(rows,initial,context,horizon,free,groups,locked,peakCap,checkOrder);
    if(shaped.score&&shaped.score.score<initial.score-.02){
     const proposal=buildResult(shaped.rows);
     if(proposal){chosen=proposal;after=shaped.score;}
    }
   }
  }else if(free.length){
   const horizon=baseline.after.lastSpawn;
   const compact=refineTiming(rows,context,horizon,free,groups,peakCap,checkOrder);
   if(compact.score&&compact.score.score<initial.score-.02){
    const proposal=buildResult(compact.rows);
    if(proposal){chosen=proposal;after=compact.score;}
   }
   const hasFormation=entries.some(row=>{
    const profile=context.profiles.get(row.id);
    return profile?.back&&context.frontlineGroups.has(profile.group);
   });
   if(context.importantArrivals||hasFormation){
    const nextHorizon=Math.min(horizon+context.beat,lastSpawnLimit??Infinity);
    if(Number.isFinite(nextHorizon)&&nextHorizon>horizon&&(chosen===baseline||after.peakThreat>=initial.peakThreat&&after.peakBurst>=initial.peakBurst)){
     const expanded=refineTiming(rows,context,nextHorizon,free,groups,peakCap,checkOrder);
     if(expanded.score&&expanded.score.score<after.score-Math.max(.45,after.score*.08)){
      const proposal=buildResult(expanded.rows);
      if(proposal){chosen=proposal;after=expanded.score;}
     }
    }
   }
  }
  return {...chosen,tactical:{before:prior,after,matchedRows:context.matchedRows,totalRows:context.totalRows}};
 }

 if(timingEdits!==null){
  if(!Array.isArray(timingEdits))throw Error('Supply the reviewed spawn times.');
  const edits=new Map();
  for(const edit of timingEdits){
   if(!edit||!eligibleIds.has(edit.id)||edits.has(edit.id))return fail('invalid-timing','A reviewed spawn row is locked or no longer available.');
   edits.set(edit.id,{startSeconds:edit.startSeconds,intervalSeconds:edit.intervalSeconds});
  }
  const timeline=entries.map(row=>edits.has(row.id)?{...row,...edits.get(row.id)}:row);
  const checked=inspectTimeline(timeline);
  if(!checked.ok)return checked;
  if(checkGroupOrder){
   const byId=new Map(timeline.map(row=>[row.id,row]));
   if(!openingsAreOrdered(groups.map(group=>group.map(row=>byId.get(row.id))))){
    return fail('group-order','These timings change the opening order of the spawn groups.');
   }
  }
  return finish(checked,checkGroupOrder,false);
 }

 if(baseline.peak<=peakCap&&fitsDeadline(baseline.lastSpawn)&&eligible.every(usesTimingSteps)&&
    (!spawnOneFirst||opensFromSpawnOne(eligible))&&(!checkGroupOrder||openingsAreOrdered(groups))&&GroupTiming.matches(entries,timing.windows)){
  const current=entries===originalEntries?{ok:true,before,after:before,changes,afterWave:wave}:inspectTimeline(entries);
  return current.ok?finish(current,checkGroupOrder):current;
 }
 const fixedProjection=project({...wave,SpawnTimeline:locked}),fixed=summary(fixedProjection);
 if(fixed.peak>peakCap)return fail('locked-peak',`Manual rows alone peak at ${fixed.peak} enemies at ${fixed.peakTime} s. Unlock or adjust a manual row, or raise the peak cap.`,{fixed});
 if(!fitsDeadline(fixed.lastSpawn))return fail('locked-deadline',`Manual rows spawn through ${fixed.lastSpawn} s. Unlock or adjust a manual row, or raise the last spawn limit.`,{fixed});

 const requiredDefeats=Math.max(0,working.totals.units-peakCap);
 const minimumLastSpawn=requiredDefeats*defeatSeconds;
 if(!Number.isFinite(minimumLastSpawn))return fail('projection-unavailable','The selected defeat interval would push the last spawn beyond the timing projection range.');
 if(lastSpawnLimit!==null&&defeatTick(lastSpawnLimit,defeatSeconds)<requiredDefeats){
  return fail('deadline-too-short',`This wave needs at least ${minimumLastSpawn} s to stay at ${peakCap} enemies alive with the selected defeat interval.`,{minimumLastSpawn});
 }
 if(working.totals.units>MAX_SEARCH_UNITS){
  return fail('projection-unavailable','This schedule is too large to balance in the editor.');
 }

 function result(placed){
  if(!placed)return null;
  if(!hasGroupTimes&&!openingsAreOrdered(groups.map(group=>group.map(row=>placed.get(row.id)))))return null;
  const proposal=buildResult(entries.map(row=>placed.get(row.id)||row));
  return proposal&&finish(proposal,!hasGroupTimes&&(!pacing||checkGroupOrder));
 }

 const deadline=lastSpawnLimit??Infinity;
 const minimumAutoSpan=eligible.reduce((longest,row)=>Math.max(longest,(row.count-1)*TIMING_STEP),0);
 const leadSpan=spawnOneFirst?eligible.reduce((longest,row)=>row.spawnId===1?longest:
  Math.max(longest,row.count*TIMING_STEP),0):0;
 const pinnedSpan=eligible.reduce((latest,row)=>Math.max(latest,(timing.floors.get(row.id)??0)+(row.count-1)*TIMING_STEP),0);
 const minimumSpan=Math.max(minimumLastSpawn,minimumAutoSpan,leadSpan,pinnedSpan);
 const compactLimit=Math.min(Math.max(baseline.lastSpawn,minimumSpan),deadline);
 const limit=Math.min(Math.max(compactLimit,Math.min(Number.MAX_VALUE,minimumSpan+Math.max(defeatSeconds,TIMING_STEP))),deadline);
 if(hasGroupTimes){
  // Leave room to drain earlier streams when an explicit opening is late.
  const extra=(working.totals.units+1)*Math.max(TIMING_STEP,defeatSeconds);
  const expanded=lastSpawnLimit??Math.min(Number.MAX_VALUE,Math.max(limit,fixed.lastSpawn)+extra);
  const planned=placePinnedGroups(groups,locked,timing,new Set([compactLimit,limit,expanded]),defeatSeconds,peakCap,spawnOneFirst,result);
  return planned??fail('group-start-limits','No proposal fit the set spawn-group times and wave limits. Adjust a group start, a Manual row, the peak cap, or the last-spawn limit.');
 }
 if(compactLimit<limit&&Number.isSafeInteger(defeatTick(compactLimit,defeatSeconds))){
  const compact=result(place(groups,locked,compactLimit,defeatSeconds,peakCap,{keepIntervals:false,early:false,spawnOneFirst}));
  if(compact)return compact;
 }
 if(Number.isSafeInteger(defeatTick(limit,defeatSeconds))){
  for(const options of [
   {keepIntervals:true,early:false},
   {keepIntervals:false,early:false},
   {keepIntervals:false,early:true}
  ]){
   const proposal=result(place(groups,locked,limit,defeatSeconds,peakCap,{...options,spawnOneFirst}));
   if(proposal)return proposal;
  }
 }
 if(lastSpawnLimit>limit&&Number.isSafeInteger(defeatTick(lastSpawnLimit,defeatSeconds))){
  const extended=result(place(groups,locked,lastSpawnLimit,defeatSeconds,peakCap,{keepIntervals:false,early:false,spawnOneFirst}));
  if(extended)return extended;
 }
 const fallback=result(separateStreams(groups,fixedProjection,defeatSeconds,spawnOneFirst));
 if(fallback)return fallback;
 const priority=spawnOneFirst?' with Spawn 1 sending first':'';
 return fail('search-limit','No valid timing proposal was found in '+TIMING_STEP+' s steps'+priority+'. Try a higher peak cap, a later last spawn limit, or unlock a manual row.',{minimumLastSpawn});
}

module.exports={plan,suggestedPeakCap,DEFAULT_PEAK_CAP,TIMING_STEP,MAX_SEARCH_UNITS};
