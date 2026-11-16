'use strict';
const Stats=require('../../../assets/_script/HeroEquipmentStats'),HeroDamage=require('./hero-damage');
const names={1:'HP',2:'HP regeneration',4:'Attack damage',5:'Attack speed',6:'Movement speed'};
const tidy=value=>Number(value.toPrecision(14));
const same=(a,b)=>Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b));
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
function totals(gains){let sum=0;return gains.map(gain=>sum=tidy(sum+gain));}
function descriptors(config,row){
  if(!Stats.enabled(config))return [];
  const gear=config.EquipCfg[row.path[1]]||row.record,main=gear.id===4,secondary=gear.id===3,levels=gear.levelInfo;
  if(main){const profile=Stats.damageProgression(config,row.heroStyle),gains=[0].concat(profile.gains);return[{key:'damage',label:'Attack damage bonus',gains,values:totals(gains),base:profile.baseDamage,first:2,main:true,integer:true,invalid:HeroDamage.malformed(config,row.heroStyle)}];}
  const fields=secondary?(Stats.definitions[row.heroStyle]||[]):[{key:'Parameters',label:names[gear.id]}];
  return fields.map(field=>{
    const values=levels.map(level=>secondary?level.SecondaryStats&&level.SecondaryStats[row.heroStyle]&&level.SecondaryStats[row.heroStyle][field.key]:level.Parameters),base=secondary?0:values[0];
    const gains=values.map((value,index)=>tidy(index?value-values[index-1]:value-base));
    return Object.assign({},field,{base,gains,values:values.map(value=>tidy(value-base)),first:secondary?1:2,secondary,invalid:values.some(value=>typeof value!=='number'||!Number.isFinite(value))});
  });
}
function display(field,value){return '+'+String(Number((value*(field.percent?100:1)).toFixed(field.percent?6:5)))+(field.percent?'%':'');}
function summary(config,row,level){return descriptors(config,row).map(field=>field.label+': '+display(field,field.values[level-1])).join(' · ');}
function generate(field,rule){
  const {from,to,gain,multiplier,power,rounding,precision}=rule;
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<field.first||from>to||to>field.gains.length)throw Error('Choose a valid upgrade range.');
  if(!Number.isFinite(gain)||gain<0||!Number.isFinite(multiplier)||multiplier<=0||!Number.isFinite(power))throw Error('Use a nonnegative first increase, positive multiplier and finite curve exponent.');
  if(!Number.isInteger(precision)||precision<0||precision>9||field.integer&&precision!==0||!['nearest','up','down'].includes(rounding))throw Error('Choose rounding and 0–9 decimal places, or whole numbers for weapon damage.');
  const gains=field.gains.slice(),factor=Math.pow(10,precision),round=rounding==='up'?Math.ceil:rounding==='down'?Math.floor:Math.round;
  for(let level=from;level<=to;level++){
    const k=level-from,raw=gain*Math.pow(multiplier,k)*Math.pow(k+1,power);
    const value=tidy(round(raw*factor+(rounding==='up'?-1e-9:rounding==='down'?1e-9:0))/factor);
    if(!Number.isFinite(value)||value<0||field.integer&&!Number.isSafeInteger(value))throw Error('This curve produces an invalid increase at upgrade '+level+'.');
    gains[level-1]=value;
  }
  const values=totals(gains);
  values.forEach((value,index)=>{if(!Number.isFinite(value)||value<0||field.integer&&!Number.isSafeInteger(value+field.base)||field.percent&&value>1+1e-10)throw Error('This curve exceeds the allowed stat value at upgrade '+(index+1)+'.');});
  return{gains,values};
}
function plan(config,row,key,rule){
  const field=descriptors(config,row).find(field=>field.key===key);
  if(!field||field.invalid)throw Error('This stat has an invalid saved progression. Correct it before applying a curve.');
  const next=generate(field,rule);
  if(next.gains.every((gain,index)=>same(gain,field.gains[index])))return [];
  const edits=field.main?HeroDamage.edits(config,row.heroStyle,{kind:'gains',value:next.gains.slice(1)}):next.values.flatMap((value,index)=>{
    if(same(value,field.values[index]))return [];
    const path=row.path.concat('levelInfo',index,field.secondary?['SecondaryStats',row.heroStyle,key]:['Parameters']);
    return[{doc:'A',path,value:tidy(value+field.base)}];
  });
  const table=config.HeroEquipment.upgradeCurveRules,path=['HeroEquipment','upgradeCurveRules'],entry=table&&table[row.key];
  if(table!==undefined&&!object(table)||entry!==undefined&&!object(entry))throw Error('Saved upgrade curve rules have an invalid format. Correct them before applying a curve.');
  const previous=entry&&entry[key];if(previous!==undefined&&!object(previous))throw Error('The saved curve rule has an invalid format. Correct it before applying a curve.');
  const saved=Object.assign({},previous,rule),value=Object.assign({},entry,{[key]:saved});
  edits.push({doc:'A',path:table===undefined?path:path.concat(row.key),value:table===undefined?{[row.key]:value}:value});
  return edits;
}
function change(panel,row,key,rule){return panel._change(()=>plan(panel._data('A'),row,key,rule),{skipEmpty:true}).catch(()=>{});}
function baseChange(panel,row,value){
  return panel._change(()=>{
    if(!Number.isFinite(value)||value<0)throw Error('Starting stats must be finite and zero or greater.');
    const gear=panel._data('A').EquipCfg[row.path[1]],base=gear.levelInfo[0].Parameters;
    if(value===base)return [];
    return gear.levelInfo.map((level,index)=>({doc:'A',path:row.path.concat('levelInfo',index,'Parameters'),value:tidy(level.Parameters-base+value)}));
  },{skipEmpty:true}).catch(()=>{});
}
function levelFields(panel,section,row){
  const config=panel._data('A'),level=panel._level+1,fields=descriptors(config,row);
  if(!fields.length)return;
  if(level===1&&row.record.id!==3&&row.record.id!==4)panel._field(section,'Starting '+names[row.record.id],row.record.levelInfo[0].Parameters,value=>baseChange(panel,row,value),{numeric:true,min:0,commitUnchanged:true,help:'Starting stat, separate from upgrade bonuses. Changing it preserves every upgrade increase.'});
  fields.forEach(field=>{
    if(level<field.first)return;
    panel._field(section,field.label+' per upgrade'+(field.percent?' (%)':''),field.gains[level-1],value=>panel._change(()=>{
      const current=descriptors(panel._data('A'),row).find(item=>item.key===field.key);
      if(same(current.gains[level-1],value))return [];
      return plan(panel._data('A'),row,field.key,{from:level,to:field.gains.length,gain:value,multiplier:1,power:0,rounding:'nearest',precision:field.integer?0:field.percent?6:5});
    },{skipEmpty:true}).catch(()=>{}),{
      numeric:true,integer:!!field.integer,min:0,percent:field.percent,commitUnchanged:true,readOnly:field.invalid,
      help:'Changing this applies the same increase from this upgrade onward. Earlier upgrades stay as authored. Use Upgrade curve to limit the range or add multiplier growth.'
    });
  });
}
function chart(canvas,current,next,field){
  if(typeof canvas.getContext!=='function')return;
  const context=canvas.getContext('2d');if(!context)return;
  const width=640,height=230;canvas.width=width*2;canvas.height=height*2;context.scale(2,2);canvas.style.width='100%';canvas.style.maxWidth='1000px';canvas.style.height='auto';
  context.fillStyle='#1d2530';context.fillRect(0,0,width,height);
  const all=current.concat(next||[]).map(value=>value*(field.percent?100:1)),high=Math.max(1,...all),left=62,right=width-18,top=20,bottom=height-38;
  context.font='12px Arial';context.fillStyle='#b7c8da';context.strokeStyle='#354456';context.lineWidth=1;
  for(let tick=0;tick<=4;tick++){const y=bottom-(bottom-top)*tick/4;context.beginPath();context.moveTo(left,y);context.lineTo(right,y);context.stroke();context.fillText(String(Number((high*tick/4).toFixed(3)))+(field.percent?'%':''),5,y+4);}
  function line(values,color,dashed){context.beginPath();context.strokeStyle=color;context.lineWidth=2;context.setLineDash(dashed?[6,4]:[]);values.forEach((value,index)=>{const x=left+(right-left)*index/Math.max(1,values.length-1),y=bottom-(bottom-top)*value*(field.percent?100:1)/high;index?context.lineTo(x,y):context.moveTo(x,y);});context.stroke();context.setLineDash([]);}
  line(current,'#79b9ff',false);if(next)line(next,'#ffd36d',true);
  context.fillStyle='#b7c8da';context.fillText('Upgrade 1',left,bottom+23);context.fillText('Upgrade '+current.length,right-64,bottom+23);
}
function render(panel,row,node,button){
  const fields=descriptors(panel._data('A'),row);if(!fields.length)return;
  const section=panel._section('Upgrade curve'),scratch=panel._equipmentCurveDrafts||(panel._equipmentCurveDrafts={}),key=row.key;
  const state=scratch[key]||(scratch[key]={field:fields[0].key});let field=fields.find(field=>field.key===state.field)||fields[0];
  if(fields.length>1)panel._field(section,'Stat to shape',field.key,value=>{state.field=value;panel._render();},{options:fields.map(field=>({value:field.key,label:field.label}))});
  const selected=Math.max(field.first,Math.min(field.gains.length,panel._level+1)),defaults={from:selected,to:field.gains.length,gain:field.gains[selected-1],multiplier:1,power:0,rounding:'nearest',precision:field.integer?0:field.percent?6:5};
  const published=panel._data('A').HeroEquipment.upgradeCurveRules,stored=published&&published[row.key]&&published[row.key][field.key];
  const saved=state[field.key]||(state[field.key]={}),rule=Object.assign({},defaults,object(stored)?stored:{},saved),controls={};
  const graph=node('canvas'),preview=node('p',undefined,'gt-note wide');graph.className='wide';graph.style.gridColumn=preview.style.gridColumn='1 / -1';
  function read(){const next={};for(const [key,input]of Object.entries(controls)){const text=String(input.value).trim();if(!text)throw Error('Enter a value for every curve rule.');next[key]=key==='rounding'?text:Number(text);}if(field.percent)next.gain/=100;return next;}
  function redraw(){try{const next=read(),result=generate(field,next);chart(graph,field.values,result.values,field);preview.textContent='Current draft: blue. Proposed curve: gold. Total upgrade bonus at upgrade '+next.to+': '+display(field,result.values[next.to-1])+'.';apply.disabled=field.invalid;}catch(error){chart(graph,field.values,null,field);preview.textContent=error.message;apply.disabled=true;}}
  function control(name,label,options){controls[name]=panel._field(section,label,rule[name],value=>{saved[name]=value;redraw();},options);}
  control('from','From upgrade',{numeric:true,integer:true,min:field.first,max:field.gains.length});
  control('to','Through upgrade',{numeric:true,integer:true,min:field.first,max:field.gains.length});
  control('gain','First increase'+(field.percent?' (%)':''),{numeric:true,min:0,percent:field.percent});
  control('multiplier','Multiply increase each level by',{numeric:true,min:Number.MIN_VALUE,help:'1 keeps the increase flat; 1.05 grows each increase by 5%; 0.95 makes each increase smaller.'});
  control('power','Curve exponent',{numeric:true,help:'0 keeps multiplier growth alone. 1 also scales increases by 1, 2, 3…; fractional exponents create gentler bends.'});
  control('rounding','Round increases',{options:[{value:'nearest',label:'Nearest'},{value:'up',label:'Up'},{value:'down',label:'Down'}]});
  control('precision','Decimal places',{numeric:true,integer:true,min:0,max:9,readOnly:field.integer});
  const apply=button('Apply curve to '+field.label,()=>{try{return change(panel,row,field.key,read());}catch(error){panel._status(error.message,true);}},'gt-mini');
  apply.style.gridColumn='1 / -1';apply.style.justifySelf='start';apply.style.padding='8px 14px';
  const formula=node('p','Per-upgrade gain = first increase × multiplier^k × (k + 1)^exponent. Step k starts at 0.','gt-note wide');formula.style.gridColumn='1 / -1';
  const help=node('p','Cumulative upgrade bonuses only. Starting stats and combat bonuses are excluded. Outside the range, individual increases stay unchanged. Apply updates the draft; Save publishes it.','gt-note wide');help.style.gridColumn='1 / -1';
  section.appendChild(apply);section.appendChild(formula);section.appendChild(help);
  section.appendChild(graph);section.appendChild(preview);redraw();
}
module.exports={descriptors,summary,display,totals,generate,plan,change,baseChange,levelFields,render};
