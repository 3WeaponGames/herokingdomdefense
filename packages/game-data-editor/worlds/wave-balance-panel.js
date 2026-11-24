'use strict';
const Balance=require('./wave-balance');
const Pressure=require('./wave-pressure');
const Stats=require('./wave-stats');
const Waves=require('./wave-editor');
const Threat=require('./wave-threat');

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

function limits(wave){
 const saved=wave.editorTimingBalance;
 return {
  peakCap:Number.isSafeInteger(saved?.peakCap)&&saved.peakCap>0?saved.peakCap:Balance.DEFAULT_PEAK_CAP,
  lastSpawnLimit:Number.isFinite(saved?.lastSpawnLimit)&&saved.lastSpawnLimit>=0?saved.lastSpawnLimit:null,
  defeatSeconds:Number.isFinite(saved?.defeatSeconds)&&saved.defeatSeconds>0?saved.defeatSeconds:Pressure.DEFAULT_DEFEAT_SECONDS
 };
}
const sameLimits=(left,right)=>left.peakCap===right.peakCap&&left.lastSpawnLimit===right.lastSpawnLimit&&left.defeatSeconds===right.defeatSeconds;
const seconds=value=>Stats.factor(value)+' s';
const peak=({value,time})=>Stats.format(value)+(time===null?'':' at '+seconds(time));

function open(c,{label,wave,units,stage,spawnGroups,interval,defeatSeconds,assertCurrent,apply}){
 const {el,button,note}=c;
 const initial=limits(wave);
 let cap,deadline,resultBox,previewButton,applyButton,review,previewRequest=0;
 function readLimits(){
  const peakCap=Number(cap.value),lastSpawnLimit=String(deadline.value).trim()===''?null:Number(deadline.value);
  if(cap.validity?.badInput||!Number.isSafeInteger(peakCap)||peakCap<1)throw Error('Enter a whole number of enemies greater than zero.');
  if(deadline.validity?.badInput||lastSpawnLimit!==null&&(!Number.isFinite(lastSpawnLimit)||lastSpawnLimit<0))throw Error('Enter a nonnegative last-spawn limit or leave it blank.');
  return {peakCap,lastSpawnLimit,defeatSeconds};
 }
 function numberField(parent,label,value,minimum,step){
  const field=el('label'),input=el('input');
  field.appendChild(el('span',label));field.appendChild(input);parent.appendChild(field);
  input.type='number';input.min=String(minimum);input.step=step;input.value=value===null?'':String(value);
  input.oninput=()=>resetPreview('Preview changes to review these limits.');
  return input;
 }
 function resetPreview(message){
  review=null;
  if(applyButton)applyButton.disabled=true;
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
    if(heading)cell.setAttribute('scope','row');
    row.appendChild(cell);
   });
   body.appendChild(row);
  }
  table.appendChild(body);return table;
 }
 function showMetrics(before,after,tactical){
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
  }
  const metricsTable=table(after?['','Current','Proposed']:['','Current'],rows,'world-wave-balance-metrics',true);
  if(tactical)metricsTable.title='Weighted threat estimates living enemy pressure. Spawn burst measures the largest short-window arrival load.';
  resultBox.appendChild(metricsTable);
 }
 async function preview(){
  const request=resetPreview();
  try{
   await c.state.pending;
   if(request!==previewRequest||resultBox.isConnected===false)return;
   assertCurrent();
   const requested=readLimits();
   const unitThreats=Threat.profiles(units,wave);
   const result=Balance.plan(wave,{...requested,interval,spawnGroups,spawnOrder:stage.spawns.map(spawn=>spawn.id),unitThreats});
   const before=Pressure.build(wave,units,interval,defeatSeconds);
   if(!result.ok){note(resultBox,result.message,true);showMetrics(before);return;}
   const after=Pressure.build(result.afterWave,units,interval,defeatSeconds);
   if(!after.projected||after.peaks.units.value>requested.peakCap||
     requested.lastSpawnLimit!==null&&after.duration>requested.lastSpawnLimit&&!Pressure.coincident(after.duration,requested.lastSpawnLimit)){
    throw Error('The proposed timing did not pass the final wave check.');
   }
   showMetrics(before,after,result.tactical);
   if(result.changes.length){
    const changes=new Map(result.changes.map(change=>[change.id,change]));
    const unitNames=new Map(units.map(unit=>[unit.id,unit.profileName?unit.name+' · '+unit.profileName:unit.name]));
    const spawnNames=new Map(stage.spawns.map(spawn=>[spawn.id,spawn.name]));
    const transition=(from,to)=>seconds(from)+(from===to?'':' → '+seconds(to));
    const times=Waves.entries(wave,interval).filter(row=>changes.has(row.id)).map(row=>{
     const change=changes.get(row.id);
     const unit={text:unitNames.get(row.unitId)||'Unit '+row.unitId,description:describeThreat(unitThreats.get(row.unitId))};
     return [spawnNames.get(row.spawnId)||'Spawn '+row.spawnId,unit,Stats.format(row.count),
      transition(row.startSeconds,change.startSeconds),transition(row.intervalSeconds,change.intervalSeconds)];
    });
    resultBox.appendChild(table(['Spawn','Unit','Count','Starts at','Interval'],times,'world-wave-balance-changes'));
   }else note(resultBox,result.tactical?'The current timings are the best fit found for this enemy mix and these limits.':'The current timings already meet these settings.');
   review={limits:requested,changes:result.changes};
   if(applyButton)applyButton.disabled=!result.changes.length&&sameLimits(requested,initial);
  }catch(error){if(request===previewRequest&&resultBox.isConnected!==false)note(resultBox,error.message,true);}
 }
 const modal=c.modal('Balance timing · '+label,dialog=>{
  dialog.classList.add('world-wave-balance-dialog');
  note(dialog,'Considers unit roles, attacks, threat and group size using the Wave Overview estimate of one defeat every '+seconds(defeatSeconds)+'. Manual timings are fixed.');
  if(wave.editorTimingBalance?.defeatSeconds&&initial.defeatSeconds!==defeatSeconds){
   note(dialog,'The previous balance used one defeat every '+seconds(initial.defeatSeconds)+'.');
  }
  const inputs=el('div',undefined,'world-wave-balance-inputs');dialog.appendChild(inputs);
  cap=numberField(inputs,'Max enemies alive',initial.peakCap,1,'1');
  deadline=numberField(inputs,'Last spawn by (s)',initial.lastSpawnLimit,0,'any');deadline.placeholder='No limit';
  previewButton=button(dialog,'Preview changes',preview);previewButton.classList.add('world-wave-balance-preview');
  resultBox=el('div',undefined,'world-wave-balance-result');resultBox.setAttribute('aria-live','polite');dialog.appendChild(resultBox);
 },async()=>{
  if(!review||!sameLimits(review.limits,readLimits()))throw Error('Preview these settings before applying.');
  assertCurrent();
  cap.disabled=deadline.disabled=previewButton.disabled=true;
  try{return await apply(review);}
  finally{cap.disabled=deadline.disabled=previewButton.disabled=false;}
 },'Apply balance to draft');
 applyButton=modal?.applyButton;
 if(applyButton)applyButton.disabled=true;
 return modal;
}

module.exports={open};
