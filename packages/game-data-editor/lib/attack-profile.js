'use strict';

// Read-only metadata shared by editor fields and the animation preview. This
// follows runtime override precedence; authored reference markers are not saved
// gameplay timings and must not silently add a windup to an unconfigured unit.
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const validSpeed=value=>finite(value)&&value>=.1&&value<=4;
const validLevel=value=>Number.isInteger(value)&&value>0;

function cooldownStart(type,id,record,description){
  if(['hit','start','hit-unblocked'].includes(description.cooldownStart))return description.cooldownStart;
  record=record||{};
  // Imported and campaign records copy these implemented controller templates.
  // An explicit original prefab remains authoritative when editing its model.
  const prefab=/^(?:Play)?ItemEnemy(\d+)$/.exec(record.prefab||'');
  const behavior=prefab?90000+Number(prefab[1]):record.BehaviorTemplate===undefined?Number(id):Number(record.BehaviorTemplate);
  if(type==='ally')return behavior===90003?'start':'hit';
  if(type==='enemy'){
    if([90003,90005,90008].includes(behavior))return 'start';
    if([90006,90009].includes(behavior))return 'hit-unblocked';
  }
  return 'hit';
}

function duration(animation){
  let maximum=0;
  const pending=[animation],seen=new Set();
  while(pending.length){
    const value=pending.pop();
    if(!value||typeof value!=='object'||seen.has(value))continue;
    seen.add(value);
    if(finite(value.time))maximum=Math.max(maximum,value.time);
    for(const child of Object.values(value))if(child&&typeof child==='object')pending.push(child);
  }
  return maximum;
}

function describe(description,settings,request){
  description=description||{};settings=settings||{};request=request||{};
  const type=request.type||description.type||'enemy';
  const id=type==='hero'?'hero':String(request.id===undefined?(description.id===undefined?'':description.id):request.id);
  const requestedLevel=request.level===undefined?description.level:request.level;
  const level=type==='ally'&&validLevel(requestedLevel)?requestedLevel:0;
  const prefix=type+':'+id+':',sourceKey=typeof description.key==='string'?description.key:'';
  const form=type==='enemy'?(description.form||((sourceKey.startsWith(prefix)&&sourceKey.slice(prefix.length))||'default')):'default';
  const key=type==='hero'?'hero:hero:default':prefix+form;
  const speedKey=level?'ally:'+id+':level:'+level:key;
  const speeds=settings.animationSpeeds||{},scoped=speeds[speedKey],shared=speeds[key];
  const animationSpeed=validSpeed(scoped)?scoped:validSpeed(shared)?shared:1;
  let timing=settings.timings&&settings.timings[key];
  if(timing===undefined)timing=settings.timingDefaults&&settings.timingDefaults[key];
  const marker=timing&&timing.attack;
  const hitTime=finite(marker)&&marker>=0&&marker<=10?marker:0;
  let attackDuration=finite(description.attackDuration)&&description.attackDuration>=0?description.attackDuration:null;
  if(attackDuration===null){
    attackDuration=0;
    for(const layer of Array.isArray(description.layers)?description.layers:[]){
      const json=layer&&layer.json;
      attackDuration=Math.max(attackDuration,duration(json&&json.animations&&json.animations.attack));
    }
  }
  const rate=request.record&&request.record.AttackInterval;
  return {type,id,level,duration:attackDuration,hitTime,animationSpeed,cooldownRate:finite(rate)&&rate>0?rate:0,key,speedKey,cooldownStart:cooldownStart(type,id,request.record,description)};
}

module.exports={describe,duration};
