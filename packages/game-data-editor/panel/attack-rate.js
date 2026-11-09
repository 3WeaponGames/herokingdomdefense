'use strict';

const Cadence=require('../../../assets/_script/AttackCadence');
const Levels=require('../../../assets/_script/UnitLevelStats');
const Profile=require('../lib/attack-profile');
const Records=require('../lib/unit-records');
function state(panel){return panel._attackRateState||(panel._attackRateState={cache:new Map(),pending:new Map(),bindings:[],epoch:0});}
function record(panel,row,level){
    const base=row.path.reduce((value,key)=>value&&value[key],panel._data('A'))||row.record;
    return row.unitType==='ally'&&level?Levels.resolve(base,panel._data('overrides'),level):base;
}
function identity(row,level,value){return row.unitType+':'+row.unitID+':'+(level||0)+':'+(value&&value.prefab||'');}
function request(panel,row,level){return {type:row.unitType,id:String(row.unitID),level:level||0,record:record(panel,row,level)};}
function compact(description,profile){return {type:profile.type,id:profile.id,form:description.form||'default',key:profile.key,attackDuration:profile.duration,cooldownStart:profile.cooldownStart,defaultTiming:description.defaultTiming,layers:[]};}
function profile(panel,row,level){
    const input=request(panel,row,level),description=state(panel).cache.get(identity(row,level,input.record));
    return description?Profile.describe(description,panel._data('overrides'),input):null;
}
function measured(panel,row,level){const value=profile(panel,row,level);return value&&Cadence.measure(value.cooldownRate,value.hitTime,value.duration,value.animationSpeed,value.cooldownStart);}
function refresh(panel){
    if(panel._closed)return;
    for(const binding of state(panel).bindings){
        const value=profile(panel,binding.row,binding.level),result=value&&Cadence.measure(value.cooldownRate,value.hitTime,value.duration,value.animationSpeed,value.cooldownStart);
        binding.update(result,value);
    }
}
function load(panel,row,level,ipc){
    const current=state(panel),input=request(panel,row,level),key=identity(row,level,input.record);
    if(current.cache.has(key)||current.pending.has(key))return;
    const epoch=current.epoch;
    const pending=ipc('unit-preview',Object.assign({},input,{noRuntime:true,documents:panel._snapshot.documents})).then(description=>{
        if(panel._closed||epoch!==current.epoch)return;
        const value=Profile.describe(description,panel._data('overrides'),input);
        current.cache.set(key,compact(description,value));refresh(panel);
    }).catch(error=>{
        if(panel._closed||epoch!==current.epoch)return;
        for(const binding of current.bindings)if(identity(binding.row,binding.level,record(panel,binding.row,binding.level))===key)binding.update(null,null,error.message);
    }).finally(()=>{if(current.pending.get(key)===pending)current.pending.delete(key);});
    current.pending.set(key,pending);
}
function begin(panel){state(panel).bindings=[];}
function invalidate(panel){const current=state(panel);current.epoch++;current.cache.clear();current.pending.clear();}
function reload(panel,ipc){invalidate(panel);refresh(panel);for(const binding of state(panel).bindings)load(panel,binding.row,binding.level,ipc);}
function metrics(panel,value){
    if(!value||value.type==='hero'||!Number.isFinite(value.duration))return;
    const table=value.type==='ally'&&(panel._data('A').AllyCfg)?'AllyCfg':'SoldierCfg',base=(panel._data('A')[table]||{})[value.id];
    if(!base)return;
    const row={unitType:value.type,unitID:String(value.id),record:base,path:[table,String(value.id)]};
    const key=value.type+':'+value.id+':'+Records.form(value.type,value.id);
    state(panel).cache.set(identity(row,value.level,base),{type:value.type,id:String(value.id),key,attackDuration:value.duration,cooldownStart:value.cooldownStart,layers:[]});
    refresh(panel);
}
function field(panel,container,row,level,write,options,ipc){
    options=options||{};
    const input=panel._field(container,'Attacks per second',0,()=>{},{numeric:true,min:0.000001,help:'Calculating the full attack cycle…'});
    input.step='0.01';input.setAttribute('aria-label',level?'Level '+level+' Attacks per second':'Attacks per second');
    const help=input.parentNode.children[input.parentNode.children.length-1];
    let displayed='',latest=null,typing=false;
    const binding={row,level,update(result,value,error){
        latest=value;displayed=result?Cadence.format(result.rate):'';if(!typing)input.value=displayed;input.disabled=!result;
        input.placeholder=error?'Unavailable':'Calculating…';
        const text=result?'Full cycle '+result.cycle.toFixed(2)+'s · windup '+result.windup.toFixed(2)+'s · cooldown '+result.cooldown.toFixed(2)+'s. Animation speed and hit timing update this rate.':error?'Cannot calculate attack rate: '+error:'Calculating the full attack cycle…';
        input.title=text;if(help&&String(help.tagName).toLowerCase()==='small')help.textContent=(options.help?options.help+' ':'')+text;
    }};
    input.oninput=()=>{typing=true;};
    input.onchange=()=>{
        typing=false;
        const text=String(input.value).trim(),value=Number(text);
        // A very slow, positive rate may legitimately display as 0.00.
        if(text&&Number.isFinite(value)&&value===Number(displayed))return;
        if(!text||!Number.isFinite(value)||value<=0){input.value=displayed;panel._status('Attacks per second must be a positive number.',true);return;}
        // The rounded display must never rewrite a more precise stored value.
        const resolve=()=>{
            // Resolve inside the shared edit queue, after preceding speed or
            // marker edits have published their latest draft snapshot.
            latest=profile(panel,row,level)||latest;
            if(!latest)throw Error('Attack metadata is still loading. Try the rate edit again.');
            const current=Cadence.measure(latest.cooldownRate,latest.hitTime,latest.duration,latest.animationSpeed,latest.cooldownStart);
            const wanted=current&&value===Number(Cadence.format(current.maximumRate))?current.maximumRate:value;
            const next=Cadence.cooldownRateFor(wanted,latest.hitTime,latest.duration,latest.animationSpeed,latest.cooldownStart);
            if(next===null)throw Error('This animation and hit timing cannot reach '+Cadence.format(value)+' attacks per second. Increase the level’s attack animation speed or move its hit marker earlier.');
            return next;
        };
        Promise.resolve(write(resolve)).catch(()=>refresh(panel));
    };
    state(panel).bindings.push(binding);const value=profile(panel,row,level);binding.update(value&&Cadence.measure(value.cooldownRate,value.hitTime,value.duration,value.animationSpeed,value.cooldownStart),value);
    load(panel,row,level,ipc);return input;
}
function cell(panel,element,row,level,ipc){
    const binding={row,level,update(result){element.textContent=result?Cadence.format(result.rate):'…';element.title=result?'Full cycle '+result.cycle.toFixed(2)+' seconds':'Calculating full attack cycle';}};
    state(panel).bindings.push(binding);binding.update(measured(panel,row,level));load(panel,row,level,ipc);
}
module.exports={begin,invalidate,reload,metrics,field,cell,profile,measured};
