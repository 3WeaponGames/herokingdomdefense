'use strict';
const Balance=require('./wave-balance');
const Counts=require('./wave-counts');
const Pacing=require('./wave-pacing');
const Pressure=require('./wave-pressure');
const Stats=require('./wave-stats');
const Waves=require('./wave-editor');
const Threat=require('./wave-threat');
const Groups=require('./spawn-groups');
const Travel=require('./wave-travel');

const attackLabels={single:'single target',splash:'splash',volley:'volley',piercing:'piercing',chain:'chain'};
const displayName=value=>value.charAt(0).toUpperCase()+value.slice(1);
function describeThreat(profile){
 if(!profile)return '';
 const factors=[];
 if(['elite','boss'].includes(profile.enemyClass))factors.push(displayName(profile.enemyClass));
 if(profile.flight)factors.push('Flight');
 if(profile.role&&profile.role!=='untyped')factors.push(displayName(profile.role));
 if(['melee','ranged'].includes(profile.delivery)&&attackLabels[profile.pattern]){
  factors.push(displayName(profile.delivery)+' '+attackLabels[profile.pattern]);
 }
 if(profile.support)factors.push('Support');
 if(profile.heavy)factors.push('Heavy hitter');
 if(profile.durable)factors.push('High HP');
 if(profile.healthRegenPercent>0)factors.push(Stats.format(profile.healthRegenPercent*100)+'% HP regen/s');
 if(profile.damageOverTime>0)factors.push('Damage over time');
 return factors.join(' · ');
}

function limits(wave,waveNumber,level){
 const saved=wave.editorTimingBalance,groupStarts=saved?.groupStarts;
 return {
  peakCap:Number.isSafeInteger(saved?.peakCap)&&saved.peakCap>0?saved.peakCap:Balance.suggestedPeakCap(wave.Wave||waveNumber),
  lastSpawnLimit:Number.isFinite(saved?.lastSpawnLimit)&&saved.lastSpawnLimit>=0?saved.lastSpawnLimit:null,
  defeatSeconds:Pressure.defeatSecondsFor(wave,waveNumber),
  pushPeaks:Pacing.validPeaks(saved?.pushPeaks,true)?saved.pushPeaks:Array(Pacing.defaultCount(level)).fill(null),
  ...(groupStarts&&typeof groupStarts==='object'&&!Array.isArray(groupStarts)?{groupStarts}:{})
 };
}
function sameGroupStarts(left={},right={}){
 const entries=Object.entries(left);
 return entries.length===Object.keys(right).length&&entries.every(([group,time])=>Object.prototype.hasOwnProperty.call(right,group)&&right[group]===time);
}
const sameLimits=(left,right)=>left.peakCap===right.peakCap&&left.lastSpawnLimit===right.lastSpawnLimit&&left.defeatSeconds===right.defeatSeconds&&
 left.defeatSecondsMode===right.defeatSecondsMode&&
 (left.totalUnits??null)===(right.totalUnits??null)&&
 left.pushPeaks.length===right.pushPeaks.length&&left.pushPeaks.every((time,index)=>time===right.pushPeaks[index])&&
 sameGroupStarts(left.groupStarts,right.groupStarts);
const seconds=value=>Stats.factor(value)+' s';
const peak=({value,time})=>Stats.format(value)+(time===null?'':' at '+seconds(time));
const validTotal=value=>Number.isSafeInteger(value)&&value>=1&&value<=Balance.MAX_SEARCH_UNITS;

function table(el,headers,rows,className,rowHeaders=false){
 const table=el('table',undefined,className),head=el('thead'),header=el('tr'),body=el('tbody');
 for(const label of headers){const cell=el('th',label);cell.setAttribute('scope','col');header.appendChild(cell);}
 head.appendChild(header);table.appendChild(head);
 for(const values of rows){
  const row=el('tr');
  values.forEach((value,index)=>{
   const heading=rowHeaders&&index===0,detail=value!==null&&typeof value==='object',cell=el(heading?'th':'td',detail?value.text:value);
   if(detail&&value.description)cell.appendChild(el('small',value.description,'world-wave-balance-traits'));
   if(detail&&value.content)cell.appendChild(value.content);
   if(heading)cell.setAttribute('scope','row');
   row.appendChild(cell);
  });
  body.appendChild(row);
 }
 table.appendChild(body);return table;
}

function open(c,{label,wave,waveIndex,units,stage,spawnGroups,interval,defeatSeconds,defeatSecondsMode,suggestedTotal,assertCurrent,apply}){
 const {el,button,note}=c;
 const suggestedPeakCap=Balance.suggestedPeakCap(wave.Wave||waveIndex+1);
 const initial=limits(wave,waveIndex+1,stage.level),summary=Waves.summary(wave,interval),total=summary.units;
 const rows=Waves.entries(wave,interval),unitThreats=Threat.profiles(units,wave,defeatSeconds);
 const travel=Travel.create(stage,units).forWave(wave,interval);
 const bosses=Waves.followingBosses(rows,unitThreats);
 const pool=Counts.countPool(rows,unitThreats);
 const reference=validTotal(suggestedTotal)?suggestedTotal:null;
 const savedTotal=wave.editorTimingBalance?.totalUnits;
 const initialCount=initial.pushPeaks.length;
 const peakInputs=[],groupInputs=new Map();
 let unitTotal,cap,deadline,pushCount,resultBox,previewButton,suggestedCapButton,suggestedTotalButton,applyButton,activePreview,review,previewRequest=0;
 function updateSuggestedButtons(){
  suggestedCapButton.disabled=Number(cap.value)===suggestedPeakCap;
  if(suggestedTotalButton)suggestedTotalButton.disabled=Number(unitTotal.value)===reference;
 }
 const targetTotal=value=>value==null?total:Counts.targetTotal(pool,value);
 function readLimits(){
  const peakCap=Number(cap.value),lastSpawnLimit=String(deadline.value).trim()===''?null:Number(deadline.value);
  const countInput=unitTotal.value.trim()===''?null:Number(unitTotal.value);
  const totalUnits=countInput===total?null:countInput;
  if(cap.validity?.badInput||!Number.isSafeInteger(peakCap)||peakCap<1)throw Error('Enter a whole number of enemies greater than zero.');
  if(unitTotal.validity?.badInput||totalUnits!==null&&!validTotal(totalUnits)){
   throw Error('Enter a target unit count from 1 to '+Balance.MAX_SEARCH_UNITS+', or leave it blank.');
  }
  if(deadline.validity?.badInput||lastSpawnLimit!==null&&(!Number.isFinite(lastSpawnLimit)||lastSpawnLimit<0))throw Error('Enter a nonnegative last-spawn limit or leave it blank.');
  const count=Number(pushCount.value);
  const pushPeaks=peakInputs.slice(0,count).map(input=>{
   if(input.validity?.badInput)throw Error('Enter valid values for the push peak times.');
   return input.value.trim()===''?null:Number(input.value);
  });
  if(!Pacing.validPeaks(pushPeaks,true))throw Error('Enter positive peak times in increasing order.');
  const groupStarts=new Map(Object.entries(initial.groupStarts??{}));
  for(const [id,{input,label}] of groupInputs){
   if(input.validity?.badInput)throw Error('Enter a valid start time for '+label+'.');
   if(input.value.trim()==='')groupStarts.delete(id);
   else{
    const time=Number(input.value);
    if(!Number.isFinite(time)||time<0||!Number.isInteger(time)&&!Number.isInteger(time/Balance.TIMING_STEP)){
     throw Error(label+' needs a nonnegative start in '+seconds(Balance.TIMING_STEP)+' steps.');
    }
    groupStarts.set(id,time);
   }
  }
  const requested={peakCap,lastSpawnLimit,defeatSeconds,defeatSecondsMode,pushPeaks};
  if(totalUnits!==null||savedTotal===null||validTotal(savedTotal))requested.totalUnits=totalUnits;
  if(groupStarts.size||initial.groupStarts)requested.groupStarts=Object.fromEntries(groupStarts);
  return requested;
 }
 function latestGroupStart(){
  let latest=0;
  for(const {input} of groupInputs.values()){
   const time=Number(input.value);
   if(Number.isSafeInteger(Math.ceil(time)))latest=Math.max(latest,time);
  }
  return latest;
 }
 function updatePeakInputs(){
  const count=Number(pushCount.value),capValue=Number(cap.value),deadlineValue=Number(deadline.value);
  const peakCap=Number.isSafeInteger(capValue)&&capValue>0?capValue:initial.peakCap;
  const limit=deadline.value.trim()!==''&&Number.isFinite(deadlineValue)&&deadlineValue>=0?deadlineValue:null;
  const amount=Number(unitTotal.value);
  const suggestions=Pacing.suggestedPeaks(count,targetTotal(validTotal(amount)?amount:null),peakCap,defeatSeconds,limit,latestGroupStart());
  for(const [index,input] of peakInputs.entries()){
   input.parentNode.hidden=input.disabled=index>=count;
   input.placeholder=index<count?String(suggestions[index]):'';
  }
 }
 function numberField(parent,label,value,minimum,step){
  const field=el('label'),input=el('input');
  field.appendChild(el('span',label));field.appendChild(input);parent.appendChild(field);
  input.type='number';input.min=String(minimum);input.step=step;input.value=value===null?'':String(value);
  input.oninput=()=>resetPreview('Preview changes to review these limits.');
  return input;
 }
 function resetPreview(message){
  review=activePreview=null;
  if(applyButton)applyButton.disabled=true;
  updateSuggestedButtons();
  updatePeakInputs();
  resultBox.textContent='';
  if(message)note(resultBox,message);
  return ++previewRequest;
 }
 function showMetrics(parent,before,after,tactical,pushCount){
  const metrics=[['Total units',model=>Stats.format(model.totals.units)],['Peak enemies alive',model=>peak(model.peaks.units)],['Peak HP',model=>peak(model.peaks.health)],
   ['Peak damage / hit',model=>peak(model.peaks.damage)],['Last spawn',model=>seconds(model.duration)]];
  const models=after?[before,after]:[before];
  const rows=metrics.map(([label,value])=>[label,...models.map(value)]);
  if(before.travel)rows.push(['Estimated first contact',...models.map(model=>model.travel?seconds(model.travel.firstArrival):'—')]);
  if(tactical?.before&&tactical.after){
   const estimates=[tactical.before,tactical.after];
   rows.push(['Peak weighted threat',...estimates.map(value=>peak({value:value.peakThreat,time:value.peakThreatTime}))]);
   rows.push(['Peak spawn burst',...estimates.map(value=>peak({value:value.peakBurst,time:value.peakBurstTime}))]);
   if(estimates.some(value=>value.coveredBackliners>0)){
    rows.push(['Ranged/support arrivals with a frontliner present',...estimates.map(value=>Stats.format(value.coveredBackliners))]);
   }
   if(tactical.after.pacing){
    const shapes=estimates.map(value=>value.pacing);
    rows.push(['Distinct pushes',...shapes.map(value=>value.distinct+' / '+pushCount)]);
    rows.push(['Opening peak · first '+seconds(shapes[1].openingEnd),...shapes.map(value=>peak(value.opening))]);
    for(const index of shapes[1].peaks.keys()){
     if(index)rows.push(['Lull '+index,...shapes.map(value=>peak(value.lulls[index-1]))]);
     rows.push(['Push '+(index+1)+' peak',...shapes.map(value=>value.peaks[index].time===null?'—':peak(value.peaks[index]))]);
    }
   }
  }
  const metricsTable=table(el,after?['','Current','Proposed']:['','Current'],rows,'world-wave-balance-metrics',true);
  if(tactical)metricsTable.title='Weighted threat estimates living enemy pressure. Spawn burst measures the largest short-window arrival load.';
  parent.appendChild(metricsTable);
 }
 function readReviewedTimings(inputs){
  return inputs.map(({row,start,interval:gap})=>{
   if([start,gap].some(input=>input.validity?.badInput||input.value.trim()==='')){
    throw Error('Enter both timing values for each Auto row.');
   }
   return {id:row.id,startSeconds:Number(start.value),intervalSeconds:Number(gap.value)};
  });
 }
 function reviewTimings(proposal,initialResult){
  if(proposal!==activePreview||proposal.stats.isConnected===false)return;
  const {stats,before,limits:requested,options,inputs}=proposal;
  review=null;
  if(applyButton)applyButton.disabled=true;
  stats.textContent='';
  for(const cell of proposal.bossTimes.values())cell.textContent='—';
  try{
   assertCurrent();
   if(!sameLimits(requested,readLimits()))throw Error('Preview these settings before applying.');
   const timingEdits=readReviewedTimings(inputs);
   const result=initialResult??Balance.plan(wave,{...options,timingEdits});
   if(!result.ok){note(stats,result.message,true);showMetrics(stats,before);return;}
   for(const row of Waves.entries(result.afterWave,interval)){
    const cell=proposal.bossTimes.get(row.id);
    if(cell)cell.textContent=seconds(row.startSeconds);
   }
   const after=Pressure.build(result.afterWave,units,interval,defeatSeconds,travel);
   if(!after.projected||after.totals.units!==targetTotal(requested.totalUnits)||after.peaks.units.value>requested.peakCap||
     requested.lastSpawnLimit!==null&&after.duration>requested.lastSpawnLimit&&!Pressure.coincident(after.duration,requested.lastSpawnLimit)){
    throw Error('The proposed schedule did not pass the final wave check.');
   }
   const pushes=requested.pushPeaks.length,shape=result.tactical?.after.pacing;
   showMetrics(stats,before,after,result.tactical,pushes);
   if(!shape)note(stats,'Push estimates are unavailable for this schedule.',true);
   else if(shape.distinct<pushes)note(stats,'The preview contains '+shape.distinct+' of '+pushes+' requested pushes.',true);
   else if(!shape.nearTargets)note(stats,'Some projected peaks fall more than '+seconds(Pacing.PEAK_TOLERANCE)+' from their targets.');
   const manualRows=timingEdits.filter((edit,index)=>{
    const {planned}=inputs[index];
    return edit.startSeconds!==planned.startSeconds||edit.intervalSeconds!==planned.intervalSeconds;
   }).map(edit=>edit.id);
   review={limits:requested,changes:result.changes,manualRows,timingEdits};
   if(applyButton)applyButton.disabled=!result.changes.length&&!manualRows.length&&sameLimits(requested,initial);
  }catch(error){note(stats,error.message,true);}
 }
 function showTimingRows(proposal,result){
  const planned=new Map(Waves.entries(result.afterWave,interval).map(row=>[row.id,row]));
  const names=new Map(units.map(unit=>[unit.id,unit.profileName?unit.name+' · '+unit.profileName:unit.name]));
  const spawns=new Map(stage.spawns.map(spawn=>[spawn.id,spawn.name]));
  function timeInput(label,original,proposed,minimum){
   const content=el('div',undefined,'world-wave-balance-row-time'),input=el('input');
   input.type='number';input.min=String(minimum);input.step=String(Balance.TIMING_STEP);input.value=String(proposed);
   input.setAttribute('aria-label',label);
   input.oninput=()=>reviewTimings(proposal);
   content.appendChild(input);
   content.appendChild(el('small','Current '+seconds(original),'world-wave-balance-traits'));
   return {content,input};
  }
  const changes=rows.filter(row=>row.count).map(row=>{
   const spawn=spawns.get(row.spawnId)||'Spawn '+row.spawnId,name=names.get(row.unitId)||'Unit '+row.unitId;
   const following=bosses.has(row.id),manual=Waves.isTimingManual(row);
   const traits=[describeThreat(unitThreats.get(row.unitId)),following?'Starts with the last regular spawn':manual?'Manual timing':''].filter(Boolean).join(' · ');
   const choice=planned.get(row.id),count=Stats.format(choice.count);
   const columns=[spawn,{text:name,description:traits},choice.count===row.count?count:{text:count,description:'Current '+Stats.format(row.count)}];
   if(following){
    const content=el('div');
    const start=el('span',seconds(choice.startSeconds));
    content.appendChild(start);
    content.appendChild(el('small','Current '+seconds(row.startSeconds),'world-wave-balance-traits'));
    proposal.bossTimes.set(row.id,start);
    return columns.concat({content},seconds(row.intervalSeconds));
   }
   if(manual)return columns.concat(seconds(row.startSeconds),seconds(row.intervalSeconds));
   const label=name+' at '+spawn;
   const start=timeInput(label+' · proposed start (s)',row.startSeconds,choice.startSeconds,0);
   const gap=timeInput(label+' · proposed interval (s)',row.intervalSeconds,choice.intervalSeconds,choice.count>1?Balance.TIMING_STEP:0);
   proposal.inputs.push({row,planned:choice,start:start.input,interval:gap.input});
   return columns.concat(start,gap);
  });
  if(proposal.inputs.length)note(resultBox,'Edited timings are marked Manual when applied.');
  if(changes.length)resultBox.appendChild(table(el,['Spawn','Unit','Count','Starts at (s)','Interval (s)'],changes,'world-wave-balance-changes'));
 }
 async function preview(){
  const request=resetPreview();
  try{
   await c.state.pending;
   if(request!==previewRequest||resultBox.isConnected===false)return;
   assertCurrent();
   const requested=readLimits(),target=targetTotal(requested.totalUnits);
   const options={...requested,interval,spawnGroups,spawnOrder:stage.spawns.map(spawn=>spawn.id),unitThreats,travel};
   const result=Balance.plan(wave,options),before=Pressure.build(wave,units,interval,defeatSeconds,travel);
   if(requested.totalUnits!=null&&target!==requested.totalUnits){
    note(resultBox,pool.adjustable.length
     ?'The wave needs at least '+target+' units to keep every group and its fixed counts.'
     :'All '+target+' units are in groups with fixed counts.');
   }
   if(!result.ok){note(resultBox,result.message,true);showMetrics(resultBox,before);return;}
   const stats=el('div',undefined,'world-wave-balance-stats');
   stats.setAttribute('aria-live','polite');resultBox.appendChild(stats);
   activePreview={stats,before,limits:requested,options,inputs:[],bossTimes:new Map()};
   showTimingRows(activePreview,result);
   reviewTimings(activePreview,result);
  }catch(error){if(request===previewRequest&&resultBox.isConnected!==false)note(resultBox,error.message,true);}
 }
 const modal=c.modal('Balance '+label,dialog=>{
  dialog.classList.add('world-wave-balance-dialog');
  note(dialog,'Auto timing uses '+seconds(Balance.TIMING_STEP)+' steps. Pressure assumes one defeat every '+seconds(defeatSeconds)+(travel?' after estimated contact.':'.')+' Bosses start with the last regular spawn.');
  note(dialog,'The default target is the current count. Manual groups, elites, and bosses keep their counts.');
  const previousRate=wave.editorTimingBalance?.defeatSeconds;
  if(Number.isFinite(previousRate)&&previousRate>0&&previousRate!==defeatSeconds){
   note(dialog,'The previous balance used one defeat every '+seconds(previousRate)+'.');
  }
  const inputs=el('div',undefined,'world-wave-balance-inputs');dialog.appendChild(inputs);
  unitTotal=numberField(inputs,'Target unit count',validTotal(total)?total:null,1,'1');
  unitTotal.max=String(Balance.MAX_SEARCH_UNITS);
  unitTotal.placeholder='Keep current';
  cap=numberField(inputs,'Max enemies alive',initial.peakCap,1,'1');
  deadline=numberField(inputs,'Last spawn by (s)',initial.lastSpawnLimit,0,'any');deadline.placeholder='No limit';
  const countLabel=el('label');countLabel.appendChild(el('span','Push count'));
  pushCount=el('select');countLabel.appendChild(pushCount);inputs.appendChild(countLabel);
  for(let count=1;count<=Pacing.MAX_PUSHES;count++){
   const option=el('option',String(count));option.value=String(count);pushCount.appendChild(option);
   const target=numberField(inputs,'Push '+count+' peak (s)',initial.pushPeaks[count-1]??null,Balance.TIMING_STEP,String(Balance.TIMING_STEP));
   target.title='Leave blank for an automatic peak time based on the wave size and limits.';
   peakInputs.push(target);
  }
  pushCount.value=String(initialCount);
  pushCount.onchange=()=>resetPreview('Preview changes to review these limits.');
  const activeGroups=spawnGroups.map((group,index)=>({group,label:Groups.label(group,index)}))
   .filter(({group})=>summary.spawnIds.some(spawn=>group.spawnIds.includes(spawn)));
  if(activeGroups.length){
   const section=el('details',undefined,'world-wave-balance-group-times');section.open=true;
   section.appendChild(el('summary','Spawn group starts'));
   const fields=el('div',undefined,'world-wave-balance-inputs');section.appendChild(fields);
   for(const {group,label} of activeGroups){
    const input=numberField(fields,label,initial.groupStarts?.[group.id]??null,0,String(Balance.TIMING_STEP));
    input.placeholder='Auto';
    input.title='First spawn in this group, in seconds. Leave blank for Auto timing.';
    groupInputs.set(group.id,{input,label});
   }
   dialog.appendChild(section);
  }
  updatePeakInputs();
  const actions=el('div',undefined,'world-wave-balance-actions');dialog.appendChild(actions);
  previewButton=button(actions,'Preview changes',preview);
  suggestedCapButton=button(actions,'Use suggested cap ('+suggestedPeakCap+')',()=>{
   cap.value=String(suggestedPeakCap);
   resetPreview('Preview changes to review these limits.');
  });
  if(reference!==null){
   suggestedTotalButton=button(actions,'Use suggested total ('+reference+')',()=>{
    unitTotal.value=String(reference);
    resetPreview('Preview changes to review these limits.');
   });
  }
  updateSuggestedButtons();
  resultBox=el('div',undefined,'world-wave-balance-result');dialog.appendChild(resultBox);
 },async()=>{
  if(!review||!sameLimits(review.limits,readLimits()))throw Error('Preview these settings before applying.');
  assertCurrent();
  if(JSON.stringify(review.timingEdits)!==JSON.stringify(readReviewedTimings(activePreview.inputs))){
   throw Error('Review the latest row timings before applying.');
  }
  const rowControls=activePreview.inputs.flatMap(({start,interval})=>[start,interval]);
  const controls=[unitTotal,cap,deadline,pushCount,previewButton,...peakInputs,...rowControls,...Array.from(groupInputs.values(),entry=>entry.input)];
  for(const control of controls)control.disabled=true;
  suggestedCapButton.disabled=true;
  if(suggestedTotalButton)suggestedTotalButton.disabled=true;
  try{return await apply(review);}
  finally{
   for(const control of controls)control.disabled=false;
   updateSuggestedButtons();updatePeakInputs();
  }
 },'Apply balance to draft');
 applyButton=modal?.applyButton;
 if(applyButton)applyButton.disabled=true;
 return modal;
}

function openAll(c,{stage,units,interval,spawnGroups,assertCurrent,apply}){
 const {el,button,note}=c,spawnOrder=stage.spawns.map(spawn=>spawn.id);
 const travelEstimates=Travel.create(stage,units);
 let percentage,resultBox,previewButton,applyButton,review,previewRequest=0;
 function readPercentage(){
  const value=Number(percentage.value);
  if(percentage.validity?.badInput||!Number.isSafeInteger(value)||value<1){
   throw Error('Enter a positive whole percentage.');
  }
  return value;
 }
 function clearPreview(){
  review=null;
  if(applyButton)applyButton.disabled=true;
  resultBox.textContent='';
  return ++previewRequest;
 }
 function proposeWave(wave,index,scale){
  const proposal={index,label:'Wave '+(wave?.Wave||index+1)};
  try{
   const current=proposal.current=Waves.summary(wave,interval).units;
   if(current===0){
    proposal.detail='Add units to balance this wave.';
    return proposal;
   }
   const target=proposal.target=Math.max(1,Math.round(current*scale/100));
   const totalUnits=target===current?null:target;
   const settings=limits(wave,index+1,stage.level);
   proposal.defeatSeconds=settings.defeatSeconds;
   const unitThreats=Threat.profiles(units,wave,settings.defeatSeconds);
   const travel=travelEstimates.forWave(wave,interval);
   const result=Balance.plan(wave,{...settings,totalUnits,interval,spawnGroups,spawnOrder,unitThreats,travel});
   if(!result.ok)throw Error(result.message);
   const proposed=Waves.summary(result.afterWave,interval).units;
   const pool=Counts.countPool(Waves.entries(wave,interval),unitThreats);
   if(proposed!==(totalUnits===null?current:Counts.targetTotal(pool,totalUnits)))throw Error('The proposal did not reach the expected count.');
   Object.assign(proposal,{proposed,peak:result.after.peak,cap:settings.peakCap,lastSpawn:result.after.lastSpawn,changes:result.changes});
   if(proposed!==target)proposal.detail=pool.adjustable.length?'Kept at least one per group and all fixed counts.':'All counts are fixed.';
  }catch(error){proposal.error=error.message||String(error);}
  return proposal;
 }
 async function preview(){
  const request=clearPreview();
  try{
   await c.state.pending;
   if(request!==previewRequest||resultBox.isConnected===false)return;
   assertCurrent();
   const scale=readPercentage();
   const proposals=stage.config.WaveCfg.map((wave,index)=>proposeWave(wave,index,scale));
   const rows=proposals.map(row=>[
    row.label,Stats.format(row.current),Stats.format(row.target),Stats.format(row.proposed),
    row.peak===undefined?'—':Stats.format(row.peak)+' / '+Stats.format(row.cap),
    row.lastSpawn===undefined?'—':seconds(row.lastSpawn),
    row.defeatSeconds===undefined?'—':seconds(row.defeatSeconds),
    row.error?{text:'Blocked',description:row.error}:row.detail||''
   ]);
   resultBox.appendChild(table(el,['Wave','Current units','Target','Proposed units','Peak / cap','Last spawn','Seconds per defeat','Details'],rows,'world-wave-balance-changes',true));
   if(proposals.some(row=>row.error)){
    note(resultBox,'Resolve the blocked waves before applying the stage balance.',true);
    return;
   }
   const updates=proposals.filter(row=>row.changes?.length);
   if(!updates.length){
    note(resultBox,'Every populated wave already matches the proposed balance.');
    return;
   }
   review={scale,updates};
   if(applyButton)applyButton.disabled=false;
  }catch(error){if(request===previewRequest&&resultBox.isConnected!==false)note(resultBox,error.message,true);}
 }
 const modal=c.modal('Balance all waves · Stage '+stage.level,dialog=>{
  dialog.classList.add('world-wave-balance-dialog');
  note(dialog,'100% keeps each wave’s current count. The percentage adjusts Auto groups. Manual groups, elites, and bosses keep their counts. Bosses start with the last regular spawn.');
  const label=el('label');
  label.appendChild(el('span','Unit count (%)'));
  percentage=el('input');
  percentage.type='number';percentage.value='100';percentage.min='1';percentage.step='1';
  percentage.oninput=clearPreview;
  label.appendChild(percentage);dialog.appendChild(label);
  const actions=el('div',undefined,'world-wave-balance-actions');dialog.appendChild(actions);
  previewButton=button(actions,'Preview changes',preview);
  resultBox=el('div',undefined,'world-wave-balance-result');
  resultBox.setAttribute('aria-live','polite');dialog.appendChild(resultBox);
 },async()=>{
  if(!review||readPercentage()!==review.scale)throw Error('Preview this percentage before applying.');
  assertCurrent();
  percentage.disabled=previewButton.disabled=true;
  try{return await apply(review.updates);}
  finally{percentage.disabled=previewButton.disabled=false;}
 },'Apply all waves to draft');
 applyButton=modal?.applyButton;
 if(applyButton)applyButton.disabled=true;
 return modal;
}

module.exports={open,openAll};
