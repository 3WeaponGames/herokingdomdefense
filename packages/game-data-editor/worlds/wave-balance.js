'use strict';

const Waves=require('./wave-editor');
const Pressure=require('./wave-pressure');

const DEFAULT_PEAK_CAP=50;
const MAX_SEARCH_UNITS=25000;
const MAX_EVENTS_PER_PASS=400000;
const MAX_TACTICAL_EVENTS=60000;
const {coincident,defeatTick}=Pressure;
const atMost=(value,limit)=>value<=limit||coincident(value,limit);
const finalSpawn=row=>row.startSeconds+(row.count-1)*row.intervalSeconds;
const firstSpawn=rows=>rows.reduce((time,row)=>Math.min(time,row.startSeconds),Infinity);
const summary=projection=>({peak:projection.peaks.units.value,peakTime:projection.peaks.units.time,lastSpawn:projection.duration});

function orderedGroups(rows,groups,spawnOrder){
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
 return {groups:grouped,hasGroupedRows};
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

function starts(row,gap,floor,limit,rate,early){
 const span=(row.count-1)*gap;
 if(!atMost(floor+span,limit))return [];
 // Subtracting the span can leave a tiny negative allowance even when the
 // last spawn lands on the deadline within the timeline's precision.
 const maximum=Math.max(floor,limit-span);
 const step=Math.min(.5,rate);
 const preferred=early?floor:row.startSeconds;
 const values=new Set(samples(floor,maximum,preferred,step,112,12));
 // With an estimated defeat every `rate` seconds, a move within a tick may
 // do nothing. Include starts that align representative arrivals to ticks.
 const addAligned=offset=>{
  const from=Math.max(floor,Math.ceil((floor+offset)/rate)*rate-offset);
  const to=Math.floor((maximum+offset)/rate)*rate-offset;
  for(const start of samples(from,to,Math.round((preferred+offset)/rate)*rate-offset,rate,24,6)){
   if(atMost(floor,start)&&atMost(start,maximum))values.add(Math.max(floor,Math.min(maximum,start)));
  }
 };
 addAligned(0);
 if(span)addAligned(span);
 if(row.count>2)addAligned(Math.floor((row.count-1)/2)*gap);
 const sorted=[...values];
 if(early)return sorted.sort((a,b)=>a-b);
 return sorted.sort((a,b)=>Math.abs(a-row.startSeconds)-Math.abs(b-row.startSeconds)||a-b);
}

function intervals(row,floor,limit,rate,keepIntervals){
 const original=row.intervalSeconds;
 if(row.count===1)return [original];
 if(keepIntervals)return original>=Waves.MIN_SPAWN_INTERVAL?[original]:[];
 const maximum=(limit-floor)/(row.count-1);
 if(maximum<=0)return [];
 const step=Math.min(.5,rate),minimum=Math.min(original,maximum,step);
 const wider=samples(original,maximum,original,step,12,12);
 wider.push(Math.min(maximum,Math.max(original,rate)));
 const shorter=samples(minimum,Math.min(maximum,original),original,step,8,6);
 // Match periodic openings in the Manual rows even when the defeat period
 // falls between the usual half-second suggestions.
 const beat=Math.max(Waves.MIN_SPAWN_INTERVAL,rate/4),maxBeat=Math.floor(maximum/beat)*beat;
 const nearBeat=Math.round(original/beat)*beat;
 for(const gap of samples(beat,maxBeat,nearBeat,beat,12,6)){
  if(gap>=original)wider.push(gap);else shorter.push(gap);
 }
 wider.sort((a,b)=>a-b);
 shorter.sort((a,b)=>b-a);
 const choices=[...new Set([original,...wider,...shorter])];
 return choices.filter(gap=>gap>=Waves.MIN_SPAWN_INTERVAL&&atMost(gap,maximum));
}

function place(groups,locked,limit,rate,cap,{keepIntervals,early}){
 let fixed=locked.flatMap(spawnTimes).sort((a,b)=>a-b),opening=0,budget=MAX_EVENTS_PER_PASS;
 const placed=new Map();
 for(const group of groups){
  let groupOpening=Infinity;
  for(const row of group){
   let choice,chosenEnd=Infinity;
   candidates: for(const gap of intervals(row,opening,limit,rate,keepIntervals)){
    for(const start of starts(row,gap,opening,limit,rate,early)){
     const last=start+(row.count-1)*gap;
     // The compact pass compares the best end across gaps, leaving earlier
     // defeat slots available to groups later in opening order.
     if(early&&last>=chosenEnd)break;
     budget-=fixed.length+row.count;
     if(budget<0)return null;
     if(!Number.isFinite(last)||!Number.isSafeInteger(defeatTick(last,rate)))continue;
     if(canFit(fixed,row,start,gap,rate,cap)){
      choice={...row,startSeconds:start,intervalSeconds:gap};
      chosenEnd=last;
      if(!early)break candidates;
      break;
     }
    }
   }
   if(!choice)return null;
   groupOpening=Math.min(groupOpening,choice.startSeconds);
   fixed=fixed.concat(spawnTimes(choice)).sort((a,b)=>a-b);
   placed.set(row.id,choice);
  }
  opening=groupOpening;
 }
 return placed;
}

function separateStreams(groups,lockedProjection,rate){
 const duration=lockedProjection.duration;
 let start=duration+lockedProjection.at(duration).units*rate;
 const placed=new Map();
 for(const group of groups){
  for(const row of group){
   const choice={...row,startSeconds:Math.max(start,row.startSeconds),intervalSeconds:row.count>1?Math.max(rate,row.intervalSeconds,Waves.MIN_SPAWN_INTERVAL):row.intervalSeconds};
   const last=finalSpawn(choice);
   if(!Number.isFinite(last))return null;
   start=last+rate;
   placed.set(row.id,choice);
  }
 }
 return placed;
}

function tacticalContext(rows,unitThreats,spawnGroups,rate){
 if(!unitThreats)return null;
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
  const trait=unitThreats.get(row.unitId);
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
 if(!matchedRows)return null;
 return {profiles,frontlineGroups,matchedRows,totalRows,importantArrivals,beat,rate};
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

// The same global FIFO defeats used by Wave Overview drive the weighted living
// pressure. Short arrival bursts and local formation timing are soft objectives.
function tacticalScore(rows,context){
 const {profiles,frontlineGroups,beat,rate}=context;
 const arrivals=[];
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
  peakAlive=Math.max(peakAlive,to-from);
  if(liveWeight>peakThreat+1e-8){peakThreat=liveWeight;peakThreatTime=time;}
  if(burstWeight>peakBurst+1e-8){peakBurst=burstWeight;peakBurstTime=time;}
  sampledThreat+=liveWeight*(to-first);sampledBurst+=burstWeight*(to-first);
  previousTick=tick;previousArrival=time;
 }
 const average=arrivals.length||1;
 const first=arrivals[0]?.time??0,beatSize=Math.max(.25,beat);
 const timingPenalty=.7*Math.min(8,Math.abs(first-context.originalOpening)/beatSize)+
  .25*Math.min(8,Math.max(0,quietGap-beat)/beatSize);
 const score=peakThreat+.34*peakBurst+.16*sampledThreat/average+.08*sampledBurst/average+
  formationPenalty/Math.sqrt(formationCount||1)+openingPenalty/Math.sqrt(openingCount||1)+timingPenalty;
 return {score,peakAlive,peakThreat,peakThreatTime,peakBurst,peakBurstTime,coveredBackliners};
}

function tacticalOptions(row,rows,context,horizon,current){
 const {profiles,beat,rate}=context,profile=profiles.get(row.id),lead=beat/3;
 const gap=row.intervalSeconds,span=(row.count-1)*gap,maximum=Math.max(0,horizon-span);
 const step=Math.min(.5,rate);
 const starts=new Set(samples(0,maximum,row.startSeconds,step,8,3));
 for(const time of [current.peakThreatTime,current.peakBurstTime,row.startSeconds]){
  for(const offset of [-beat,beat,lead]){
   starts.add(Math.max(0,Math.min(maximum,time+offset)));
  }
  starts.add(Math.max(0,Math.min(maximum,(defeatTick(time,rate)+1)*rate)));
 }
 for(const related of rows){
  const relation=profiles.get(related.id);
  if(!relation)continue;
  if(profile.buildup&&relation.opener){
   starts.add(Math.max(0,Math.min(maximum,related.startSeconds+profile.buildup)));
  }
  if(relation.group!==profile.group)continue;
  if(profile.back&&relation.front)starts.add(Math.max(0,Math.min(maximum,related.startSeconds+profile.coverLead)));
  if(profile.front&&relation.back){
   starts.add(Math.max(0,Math.min(maximum,related.startSeconds-relation.coverLead)));
  }
 }
 const options=row.count===1||gap>=Waves.MIN_SPAWN_INTERVAL?[...starts].map(startSeconds=>({...row,startSeconds})):[];
 if(row.count>1){
  const maximumGap=horizon/(row.count-1);
  const intervals=new Set([gap+step,gap+lead,gap+beat,gap*1.5,rate,maximumGap]);
  for(const intervalSeconds of intervals){
   if(intervalSeconds<=gap||intervalSeconds>maximumGap||intervalSeconds<Waves.MIN_SPAWN_INTERVAL)continue;
   const startSeconds=Math.max(0,Math.min(row.startSeconds,horizon-(row.count-1)*intervalSeconds));
   options.push({...row,startSeconds,intervalSeconds});
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
    if(checkOrder&&!openingsAreOrdered(groups.map(group=>group.map(entry=>timeline[positions.get(entry.id)])))){
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

function plan(wave,{
 interval,defeatSeconds=Pressure.DEFAULT_DEFEAT_SECONDS,peakCap=DEFAULT_PEAK_CAP,lastSpawnLimit=null,
 spawnGroups=[],spawnOrder=[],isManual=Waves.isTimingManual,unitThreats
}={}){
 if(!Number.isSafeInteger(peakCap)||peakCap<1)throw Error('Max enemies alive must be a positive whole number.');
 if(lastSpawnLimit!==null&&(!Number.isFinite(lastSpawnLimit)||lastSpawnLimit<0))throw Error('Last spawn by must be zero or greater.');
 const project=source=>Pressure.build(source,[],interval,defeatSeconds);
 const original=project(wave),before=summary(original);
 const changes=[];
 const fail=(reason,message,details={})=>({ok:false,reason,message,before,changes,...details});
 const fitsDeadline=time=>lastSpawnLimit===null||atMost(time,lastSpawnLimit);
 if(!original.projected)return fail('projection-unavailable','The schedule exceeds the timing projection range.');

 const entries=Waves.entries(wave,interval),locked=[],eligible=[];
 for(const row of entries){
  if(!row.count)continue;
  (isManual(row)?locked:eligible).push(row);
 }
 const {groups,hasGroupedRows}=orderedGroups(eligible,spawnGroups,spawnOrder);

 function buildResult(timeline){
  if(timeline.some(row=>row.count&&!Number.isFinite(finalSpawn(row))))return null;
  const edits=entries.reduce((items,row,index)=>{
   const {id,startSeconds,intervalSeconds}=timeline[index];
   if(row.startSeconds!==startSeconds||row.intervalSeconds!==intervalSeconds)items.push({id,startSeconds,intervalSeconds});
   return items;
  },[]);
  const afterWave=edits.length?{...wave}:wave;
  Waves.applyBalancedTiming({config:{WaveCfg:[afterWave]}},0,edits,interval);
  const verified=project(afterWave),after=summary(verified);
  if(!verified.projected||after.peak>peakCap||!fitsDeadline(after.lastSpawn))return null;
  return {ok:true,before,after,changes:edits,afterWave};
 }

 function finish(baseline,checkOrder){
  if(!unitThreats||original.totals.units>MAX_SEARCH_UNITS)return baseline;
  const context=tacticalContext(entries,unitThreats,spawnGroups,defeatSeconds);
  if(!context)return baseline;
  const rows=baseline.changes.length?Waves.entries(baseline.afterWave,interval):entries;
  context.originalOpening=firstSpawn(rows.filter(row=>row.count));
  const prior=tacticalScore(entries,context);
  const initial=tacticalScore(rows,context);
  if(!prior||!initial)return baseline;
  const free=rows.map((row,index)=>({row,index})).filter(({row})=>row.count&&!isManual(row))
   .sort((left,right)=>context.profiles.get(right.row.id).weight-context.profiles.get(left.row.id).weight||left.index-right.index)
   .map(({index})=>index);
  let chosen=baseline,after=initial;
  if(free.length){
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

 if(before.peak<=peakCap&&fitsDeadline(before.lastSpawn)&&(!hasGroupedRows||openingsAreOrdered(groups))){
  return finish({ok:true,before,after:before,changes,afterWave:wave},hasGroupedRows);
 }
 const fixedProjection=project({...wave,SpawnTimeline:locked}),fixed=summary(fixedProjection);
 if(fixed.peak>peakCap)return fail('locked-peak',`Manual rows alone peak at ${fixed.peak} enemies at ${fixed.peakTime} s. Unlock or adjust a manual row, or raise the peak cap.`,{fixed});
 if(!fitsDeadline(fixed.lastSpawn))return fail('locked-deadline',`Manual rows spawn through ${fixed.lastSpawn} s. Unlock or adjust a manual row, or raise the last spawn limit.`,{fixed});

 const requiredDefeats=Math.max(0,original.totals.units-peakCap);
 const minimumLastSpawn=requiredDefeats*defeatSeconds;
 if(!Number.isFinite(minimumLastSpawn))return fail('projection-unavailable','The selected defeat interval would push the last spawn beyond the timing projection range.');
 if(lastSpawnLimit!==null&&defeatTick(lastSpawnLimit,defeatSeconds)<requiredDefeats){
  return fail('deadline-too-short',`This wave needs at least ${minimumLastSpawn} s to stay at ${peakCap} enemies alive with the selected defeat interval.`,{minimumLastSpawn});
 }
 if(original.totals.units>MAX_SEARCH_UNITS){
  return fail('projection-unavailable','This schedule is too large to balance in the editor.');
 }

 function result(placed){
  if(!placed)return null;
  if(!openingsAreOrdered(groups.map(group=>group.map(row=>placed.get(row.id)))))return null;
  const proposal=buildResult(entries.map(row=>placed.get(row.id)||row));
  return proposal&&finish(proposal,true);
 }

 const deadline=lastSpawnLimit??Infinity;
 const compactLimit=Math.min(Math.max(before.lastSpawn,minimumLastSpawn),deadline);
 const limit=Math.min(Math.max(compactLimit,Math.min(Number.MAX_VALUE,minimumLastSpawn+defeatSeconds)),deadline);
 if(compactLimit<limit&&Number.isSafeInteger(defeatTick(compactLimit,defeatSeconds))){
  const compact=result(place(groups,locked,compactLimit,defeatSeconds,peakCap,{keepIntervals:false,early:false}));
  if(compact)return compact;
 }
 if(Number.isSafeInteger(defeatTick(limit,defeatSeconds))){
  for(const options of [
   {keepIntervals:true,early:false},
   {keepIntervals:false,early:false},
   {keepIntervals:false,early:true}
  ]){
   const proposal=result(place(groups,locked,limit,defeatSeconds,peakCap,options));
   if(proposal)return proposal;
  }
 }
 if(lastSpawnLimit>limit&&Number.isSafeInteger(defeatTick(lastSpawnLimit,defeatSeconds))){
  const extended=result(place(groups,locked,lastSpawnLimit,defeatSeconds,peakCap,{keepIntervals:false,early:false}));
  if(extended)return extended;
 }
 const fallback=result(separateStreams(groups,fixedProjection,defeatSeconds));
 if(fallback)return fallback;
 return fail('search-limit','No valid timing proposal was found. Try a higher peak cap, a later last spawn limit, or unlock a manual row.',{minimumLastSpawn});
}

module.exports={plan,DEFAULT_PEAK_CAP};
