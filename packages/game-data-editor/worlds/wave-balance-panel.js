'use strict';
const Balance=require('./wave-balance');
const Pacing=require('./wave-pacing');
const Pressure=require('./wave-pressure');
const Stats=require('./wave-stats');
const Waves=require('./wave-editor');
const Threat=require('./wave-threat');
const Groups=require('./spawn-groups');

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
 return factors.join(' · ');
}

function limits(wave,suggestedPeakCap){
 const saved=wave.editorTimingBalance;
 return {
  peakCap:Number.isSafeInteger(saved?.peakCap)&&saved.peakCap>0?saved.peakCap:suggestedPeakCap,
  lastSpawnLimit:Number.isFinite(saved?.lastSpawnLimit)&&saved.lastSpawnLimit>=0?saved.lastSpawnLimit:null,
  defeatSeconds:Number.isFinite(saved?.defeatSeconds)&&saved.defeatSeconds>0?saved.defeatSeconds:Pressure.DEFAULT_DEFEAT_SECONDS
 };
}
function sameGroupStarts(left={},right={}){
 const entries=Object.entries(left);
 return entries.length===Object.keys(right).length&&entries.every(([group,time])=>Object.prototype.hasOwnProperty.call(right,group)&&right[group]===time);
}
const sameLimits=(left,right)=>left.peakCap===right.peakCap&&left.lastSpawnLimit===right.lastSpawnLimit&&left.defeatSeconds===right.defeatSeconds&&
 left.pushPeaks.length===right.pushPeaks.length&&left.pushPeaks.every((time,index)=>time===right.pushPeaks[index])&&
 sameGroupStarts(left.groupStarts,right.groupStarts);
const seconds=value=>Stats.factor(value)+' s';
const peak=({value,time})=>Stats.format(value)+(time===null?'':' at '+seconds(time));

function open(c,{label,wave,waveIndex,units,stage,spawnGroups,interval,defeatSeconds,assertCurrent,apply}){
 const {el,button,note}=c;
 const suggestedPeakCap=Balance.suggestedPeakCap(wave.Wave||waveIndex+1);
 const initial=limits(wave,suggestedPeakCap),summary=Waves.summary(wave,interval),total=summary.units;
 const savedGroupStarts=wave.editorTimingBalance?.groupStarts;
 if(savedGroupStarts&&typeof savedGroupStarts==='object'&&!Array.isArray(savedGroupStarts))initial.groupStarts=savedGroupStarts;
 const savedPeaks=Pacing.validPeaks(wave.editorTimingBalance?.pushPeaks,true)?wave.editorTimingBalance.pushPeaks:null;
 const initialCount=savedPeaks?.length??Pacing.defaultCount(stage.level);
 initial.pushPeaks=savedPeaks??Array(initialCount).fill(null);
 const peakInputs=[],groupInputs=new Map();
 let cap,deadline,pushCount,resultBox,previewButton,suggestedCapButton,applyButton,activePreview,review,previewRequest=0;
 const updateSuggestedCapButton=()=>{suggestedCapButton.disabled=Number(cap.value)===suggestedPeakCap;};
 function readLimits(){
  const peakCap=Number(cap.value),lastSpawnLimit=String(deadline.value).trim()===''?null:Number(deadline.value);
  if(cap.validity?.badInput||!Number.isSafeInteger(peakCap)||peakCap<1)throw Error('Enter a whole number of enemies greater than zero.');
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
  const requested={peakCap,lastSpawnLimit,defeatSeconds,pushPeaks};
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
  const suggestions=Pacing.suggestedPeaks(count,total,peakCap,defeatSeconds,limit,latestGroupStart());
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
  updateSuggestedCapButton();
  updatePeakInputs();
  resultBox.textContent='';
  if(message)note(resultBox,message);
  return ++previewRequest;
 }
 function table(headers,rows,className,rowHeaders=false){
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
 function showMetrics(parent,before,after,tactical,pushCount){
  const metrics=[['Peak enemies alive',model=>peak(model.peaks.units)],['Peak HP',model=>peak(model.peaks.health)],
   ['Peak damage / hit',model=>peak(model.peaks.damage)],['Last spawn',model=>seconds(model.duration)]];
  const models=after?[before,after]:[before];
  const rows=metrics.map(([label,value])=>[label,...models.map(value)]);
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
  const metricsTable=table(after?['','Current','Proposed']:['','Current'],rows,'world-wave-balance-metrics',true);
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
  try{
   assertCurrent();
   if(!sameLimits(requested,readLimits()))throw Error('Preview these settings before applying.');
   const timingEdits=readReviewedTimings(inputs);
   const result=initialResult??Balance.plan(wave,{...options,timingEdits});
   if(!result.ok){note(stats,result.message,true);showMetrics(stats,before);return;}
   const after=Pressure.build(result.afterWave,units,interval,defeatSeconds);
   if(!after.projected||after.peaks.units.value>requested.peakCap||
     requested.lastSpawnLimit!==null&&after.duration>requested.lastSpawnLimit&&!Pressure.coincident(after.duration,requested.lastSpawnLimit)){
    throw Error('The proposed timing did not pass the final wave check.');
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
 function showTimingRows(proposal,result,unitThreats){
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
  const rows=Waves.entries(wave,interval).filter(row=>row.count).map(row=>{
   const spawn=spawns.get(row.spawnId)||'Spawn '+row.spawnId,name=names.get(row.unitId)||'Unit '+row.unitId;
   const manual=Waves.isTimingManual(row);
   const traits=[describeThreat(unitThreats.get(row.unitId)),manual?'Manual timing':''].filter(Boolean).join(' · ');
   const columns=[spawn,{text:name,description:traits},Stats.format(row.count)];
   if(manual)return columns.concat(seconds(row.startSeconds),seconds(row.intervalSeconds));
   const choice=planned.get(row.id),label=name+' at '+spawn;
   const start=timeInput(label+' · proposed start (s)',row.startSeconds,choice.startSeconds,0);
   const gap=timeInput(label+' · proposed interval (s)',row.intervalSeconds,choice.intervalSeconds,row.count>1?Balance.TIMING_STEP:0);
   proposal.inputs.push({row,planned:choice,start:start.input,interval:gap.input});
   return columns.concat(start,gap);
  });
  if(proposal.inputs.length)note(resultBox,'Edited timings are marked Manual when applied.');
  if(rows.length)resultBox.appendChild(table(['Spawn','Unit','Count','Starts at (s)','Interval (s)'],rows,'world-wave-balance-changes'));
 }
 async function preview(){
  const request=resetPreview();
  try{
   await c.state.pending;
   if(request!==previewRequest||resultBox.isConnected===false)return;
   assertCurrent();
   const requested=readLimits(),pushes=requested.pushPeaks.length;
   const suggestions=Pacing.suggestedPeaks(pushes,total,requested.peakCap,defeatSeconds,requested.lastSpawnLimit,latestGroupStart());
   const pushPeaks=requested.pushPeaks.map((time,index)=>time??suggestions[index]);
   const unitThreats=Threat.profiles(units,wave);
   const options={...requested,pushPeaks,interval,spawnGroups,spawnOrder:stage.spawns.map(spawn=>spawn.id),unitThreats};
   const result=Balance.plan(wave,options),before=Pressure.build(wave,units,interval,defeatSeconds);
   if(!result.ok){note(resultBox,result.message,true);showMetrics(resultBox,before);return;}
   const stats=el('div',undefined,'world-wave-balance-stats');
   stats.setAttribute('aria-live','polite');resultBox.appendChild(stats);
   activePreview={stats,before,limits:requested,options,inputs:[]};
   showTimingRows(activePreview,result,unitThreats);
   reviewTimings(activePreview,result);
  }catch(error){if(request===previewRequest&&resultBox.isConnected!==false)note(resultBox,error.message,true);}
 }
 const modal=c.modal('Balance timing · '+label,dialog=>{
  dialog.classList.add('world-wave-balance-dialog');
  note(dialog,'Auto timing uses '+seconds(Balance.TIMING_STEP)+' steps and weighs unit roles. Pressure assumes one defeat every '+seconds(defeatSeconds)+'. Manual timings are fixed.');
  if(wave.editorTimingBalance?.defeatSeconds&&initial.defeatSeconds!==defeatSeconds){
   note(dialog,'The previous balance used one defeat every '+seconds(initial.defeatSeconds)+'.');
  }
  const inputs=el('div',undefined,'world-wave-balance-inputs');dialog.appendChild(inputs);
  cap=numberField(inputs,'Max enemies alive',initial.peakCap,1,'1');
  deadline=numberField(inputs,'Last spawn by (s)',initial.lastSpawnLimit,0,'any');deadline.placeholder='No limit';
  const countLabel=el('label');countLabel.appendChild(el('span','Push count'));
  pushCount=el('select');countLabel.appendChild(pushCount);inputs.appendChild(countLabel);
  for(let count=1;count<=Pacing.MAX_PUSHES;count++){
   const option=el('option',String(count));option.value=String(count);pushCount.appendChild(option);
   const target=numberField(inputs,'Push '+count+' peak (s)',savedPeaks?.[count-1]??null,Balance.TIMING_STEP,String(Balance.TIMING_STEP));
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
    input.title='First arrival in this group, in seconds. Leave blank for Auto timing.';
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
  updateSuggestedCapButton();
  resultBox=el('div',undefined,'world-wave-balance-result');dialog.appendChild(resultBox);
 },async()=>{
  if(!review||!sameLimits(review.limits,readLimits()))throw Error('Preview these settings before applying.');
  assertCurrent();
  if(JSON.stringify(review.timingEdits)!==JSON.stringify(readReviewedTimings(activePreview.inputs))){
   throw Error('Review the latest row timings before applying.');
  }
  const rowControls=activePreview.inputs.flatMap(({start,interval})=>[start,interval]);
  const controls=[cap,deadline,pushCount,previewButton,...peakInputs,...rowControls,...Array.from(groupInputs.values(),entry=>entry.input)];
  for(const control of controls)control.disabled=true;
  suggestedCapButton.disabled=true;
  try{return await apply(review);}
  finally{
   for(const control of controls)control.disabled=false;
   updateSuggestedCapButton();updatePeakInputs();
  }
 },'Apply balance to draft');
 applyButton=modal?.applyButton;
 if(applyButton)applyButton.disabled=true;
 return modal;
}

module.exports={open};
