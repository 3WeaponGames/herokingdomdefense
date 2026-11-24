'use strict';
const Pressure=require('./wave-pressure'),Stats=require('./wave-stats');
const fields=[['units','Units'],['health','HP'],['damage','Damage / hit']];
const seconds=value=>Stats.format(value)+' s';
const scheduledSeconds=value=>Stats.factor(value)+' s';

function create(el){
 let selection,time=0,preferredRate=Pressure.DEFAULT_DEFEAT_SECONDS,defeatSeconds=preferredRate,selectedRate=null;
 function render(parent,{key,label,wave,units,interval}){
  if(key!==selection){selection=key;time=0;selectedRate=null;}
  const savedBalance=wave?.editorTimingBalance,savedRate=savedBalance?.defeatSeconds;
  defeatSeconds=selectedRate??(Number.isFinite(savedRate)&&savedRate>0?savedRate:preferredRate);
  const panel=el('section',undefined,'world-wave-overview');
  panel.setAttribute('aria-label',label+' overview');
  parent.appendChild(panel);
  const controls=el('div',undefined,'world-wave-overview-controls');
  panel.appendChild(controls);
  const heading=el('div',undefined,'world-wave-overview-heading');
  heading.appendChild(el('h3',label+' overview'));
  controls.appendChild(heading);

  let model;
  try{model=Pressure.build(wave,units,interval,defeatSeconds);}
  catch(error){
   const notice=el('p','Wave overview unavailable.','world-note');
   notice.title=error.message;controls.appendChild(notice);
   return;
  }
  const duration=el('span');heading.appendChild(duration);
  const timeline=el('label',undefined,'world-wave-overview-time');
  const slider=el('input'),position=el('output');
  slider.type='range';slider.min='0';slider.step='any';slider.setAttribute('aria-label','Wave timeline');
  timeline.appendChild(el('span','Time'));timeline.appendChild(slider);timeline.appendChild(position);
  controls.appendChild(timeline);

  const rate=el('label',undefined,'world-wave-overview-rate');
  rate.appendChild(el('span','Seconds per defeat'));
  const rateInput=el('input');
  rateInput.type='number';rateInput.min='0';rateInput.step='any';rateInput.value=String(defeatSeconds);
  rateInput.setAttribute('aria-label','Seconds per defeat');
  rate.appendChild(rateInput);
  const rule=el('small','Oldest enemy first');
  rule.title='Defeats are timed from 0 s. At each tick, remove the oldest living enemy before spawning new ones.';
  rate.appendChild(rule);
  controls.appendChild(rate);
  const notice=el('small','Timeline estimate unavailable for this schedule.','world-warn');
  controls.appendChild(notice);
  const breached=el('small',undefined,'world-warn');
  controls.appendChild(breached);

  const table=el('table',undefined,'world-wave-overview-stats'),head=el('thead'),body=el('tbody');
  table.setAttribute('aria-label','Wave totals and estimated pressure');
  table.title='Full starting HP and combined damage per hit before battle buffs.';
  const columns=el('tr');columns.appendChild(el('td'));
  for(const [,caption] of fields){
   const column=el('th',caption);column.setAttribute('scope','col');columns.appendChild(column);
  }
  head.appendChild(columns);table.appendChild(head);table.appendChild(body);panel.appendChild(table);
  function statRow(caption,className,peak=false){
   const row=el('tr',undefined,className),label=el('th',caption);label.setAttribute('scope','row');row.appendChild(label);
   const cells=fields.map(()=>{
    const cell=el('td'),value=el('strong'),stamp=peak?el('small'):null;
    cell.appendChild(value);if(stamp)cell.appendChild(stamp);row.appendChild(cell);
    return {value,stamp};
   });
   body.appendChild(row);return cells;
  }
  const totals=statRow('Wave total'),live=statRow('At selected time','world-wave-overview-live'),peaks=statRow('Estimated peak',undefined,true);
  function showTime(){
   const label=seconds(time),snapshot=model.at(time);
   position.textContent=label;
   slider.setAttribute('aria-valuetext',label+' of '+seconds(model.duration));
   fields.forEach(([name],i)=>{live[i].value.textContent=Stats.format(snapshot[name]);});
  }
  function showModel(){
   duration.textContent='Last spawn '+scheduledSeconds(model.duration);
   time=Math.min(time,model.duration);
   slider.max=String(model.duration);slider.value=String(time);slider.disabled=!model.projected||model.duration===0;
   notice.hidden=model.projected;
   const peak=model.peaks.units.value,cap=savedBalance?.peakCap,deadline=savedBalance?.lastSpawnLimit;
   const problems=[];
   if(Number.isSafeInteger(cap)&&cap>0&&peak>cap)problems.push('Peak '+Stats.format(peak)+' / '+Stats.format(cap)+' enemies');
   if(Number.isFinite(deadline)&&deadline>=0&&model.duration>deadline&&!Pressure.coincident(model.duration,deadline)){
    problems.push('Last spawn '+scheduledSeconds(model.duration)+' / '+scheduledSeconds(deadline));
   }
   breached.hidden=!problems.length;
   breached.textContent=problems.length?'Saved balance limit exceeded · '+problems.join(' · '):'';
   fields.forEach(([name],i)=>{
    const peak=model.peaks[name];
    totals[i].value.textContent=Stats.format(model.totals[name]);
    peaks[i].value.textContent=Stats.format(peak.value);
    peaks[i].stamp.textContent=peak.time===null?'':'at '+scheduledSeconds(peak.time);
   });
   showTime();
  }
  slider.oninput=()=>{time=Number(slider.value);showTime();};
  rateInput.onchange=()=>{
   if(rateInput.isConnected===false)return;
   const next=Number(rateInput.value);
   if(!Number.isFinite(next)||next<=0){rateInput.value=String(defeatSeconds);return;}
   if(next===defeatSeconds)return;
   model=Pressure.build(wave,units,interval,next);defeatSeconds=selectedRate=preferredRate=next;showModel();
  };
  showModel();
 }
 return {render,get defeatSeconds(){return defeatSeconds;}};
}

module.exports={create};
