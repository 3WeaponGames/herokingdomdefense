"use strict";
// A stage owns these records. Never add them to the shared SoldierCfg table.
var active = null, cachedData = null, cached = null;
var fields = ['Health','AttackDamage','AttackInterval','Speed','AttackRange','SearchRange'];
function clone(value) { return JSON.parse(JSON.stringify(value)); }
// Presentation remains attached to the parent unit; a fighting type changes
// combat stats, not its saved character or projectile artwork.
function referenceIds(unit,settings){var ids=[],seen={},table=settings&&settings.unitProfiles||{};function add(id){if(!id||seen[id])return;seen[id]=true;ids.push(Number(id));var entry=table.entries&&table.entries[id],form=table.bossForms&&table.bossForms[id];if(entry)add(entry.baseId);else if(form)add(form.source);}add(unit&&unit.ID);if(unit&&unit.ProfileBaseID){ids=[];seen={};add(unit.ProfileBaseID);}return ids;}
function validate(stage, units) {
  var table=stage&&stage.EnemyProfiles,issues=[];if(table===undefined)return issues;
  if(!table||typeof table!=='object'||Array.isArray(table))return ['Stage enemy profiles must be a table.'];
  Object.keys(table).forEach(function(id){var item=table[id],number=Number(id);if(!Number.isSafeInteger(number)||number<1000000000||(number-1000000000)%3!==0||units[number]){issues.push('Custom stage profile IDs must use their own stage namespace.');return;}
    if(!item||typeof item!=='object'||!units[item.baseId]||!units[item.baseId].prefab||!item.name||typeof item.name!=='string'||item.name.length>80||!item.stats||typeof item.stats!=='object'||Array.isArray(item.stats)){issues.push('Choose a shared enemy profile and a name for the Custom profile.');return;}
    Object.keys(item.stats).forEach(function(field){var value=item.stats[field];if(fields.indexOf(field)<0||typeof value!=='number'||!isFinite(value)||value<(['Health','AttackInterval'].indexOf(field)>=0?Number.MIN_VALUE:0))issues.push('Custom enemy stats must be supported, finite, nonnegative values.');});
  });return issues;
}
function records(stage,units,settings){
  if(!stage||!stage.EnemyProfiles)return units;var result=Object.create(units);
  Object.keys(stage.EnemyProfiles).forEach(function(id){var spec=stage.EnemyProfiles[id],source=spec&&units[spec.baseId];if(!source)return;var row=clone(source),number=Number(id),form=spec.baseId>=90010&&spec.baseId<=90012?spec.baseId-90009:'default',role=settings&&settings.unitTypeAssignments&&settings.unitTypeAssignments['enemy:'+spec.baseId+':'+form];
    function put(target,base,local){target.ID=local;target.ProfileBaseID=base.ID;target.FightingType=role;Object.keys(spec.stats||{}).forEach(function(field){if(fields.indexOf(field)>=0)target[field]=spec.stats[field];});result[local]=target;}
    put(row,source,number);if((source.BehaviorTemplate||source.ID)===90010){var previous=row,base=source;for(var phase=1;phase<=2;phase++){base=units[base.Data[2]];if(!base)break;var next=clone(base);put(next,base,number+phase);previous.Data=previous.Data.slice();previous.Data[2]=number+phase;previous=next;}}
  });return result;
}
function activate(stage){active=stage;cachedData=null;cached=null;}
function transfer(source,target,waves){
  if(!source.EnemyProfiles)return;var map={};function use(id){if(!source.EnemyProfiles[id])return id;if(map[id])return map[id];target.EnemyProfiles=target.EnemyProfiles||{};var next=Number(id);if(target.EnemyProfiles[next]&&JSON.stringify(target.EnemyProfiles[next])!==JSON.stringify(source.EnemyProfiles[id])){next=1000000000;while(target.EnemyProfiles[next])next+=3;}target.EnemyProfiles[next]=clone(source.EnemyProfiles[id]);map[id]=next;return next;}
  waves.forEach(function(wave){if(Array.isArray(wave.SpawnTimeline))wave.SpawnTimeline.forEach(function(entry){entry.unitId=use(entry.unitId);});if(Array.isArray(wave.RefreshSoldierKind))wave.RefreshSoldierKind=wave.RefreshSoldierKind.map(function(line){var index=String(line).indexOf('#');if(index<0)return line;return line.slice(0,index+1)+line.slice(index+1).split(';').map(function(pair){var parts=pair.split(',');parts[0]=String(use(Number(parts[0])));return parts.join(',');}).join(';');});});
}
function clear(stage){if(!stage||active===stage){active=null;cachedData=null;cached=null;}}
function current(data,id){if(!active||!active.EnemyProfiles||Number(id)<1000000000)return null;if(cachedData!==data){cached=records(active,data.SoldierCfg,data.GameTools);cachedData=data;}return Object.prototype.hasOwnProperty.call(cached,id)?cached[id]:null;}
exports.fields=fields;exports.validate=validate;exports.records=records;exports.transfer=transfer;exports.activate=activate;exports.clear=clear;exports.current=current;exports.referenceIds=referenceIds;
