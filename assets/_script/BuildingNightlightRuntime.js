"use strict";
var Transform=require("BuildingNightlight"),serial=0,cache=new WeakMap();
function valid(v){return !!v&&(!cc.isValid||cc.isValid(v,true));}
function release(r,destroying){
  if(valid(r.component)&&valid(r.component.node)&&r.component.skeletonData===r.clone)r.component.skeletonData=destroying?null:r.source;
  if(--r.shared.uses===0){r.shared.map.delete(r.shared.key);if(r.clone.decRef)r.clone.decRef();else if(r.clone.destroy)r.clone.destroy();if(r.source.decRef)r.source.decRef();}
}
function dispose(owner,destroying){if(!owner)return;var state=owner._buildingNightlightRuntime;if(state){delete owner._buildingNightlightRuntime;state.records.forEach(function(r){release(r,destroying);});}if(destroying&&owner._buildingNightlightPrepared){var warm=owner._buildingNightlightPrepared;delete owner._buildingNightlightPrepared;warm.forEach(function(r){release(r,true);});}}
function acquire(source,row,signature){
 var json=source.skeletonJson;if(!json)return null;
 var map=cache.get(source);if(!map){map=new Map();cache.set(source,map);}var shared=map.get(signature);
 if(shared){shared.uses++;return{source:source,clone:shared.clone,shared:shared};}
 var adjusted=Transform.json(json,row);if(adjusted===json)return null;
 var copy=new sp.SkeletonData();copy.skeletonJson=adjusted;copy.atlasText=source.atlasText;copy.textures=(source.textures || []).slice();copy.textureNames=(source.textureNames || []).slice();copy.scale=source.scale;
 copy.name=(source.name || "Building")+" nightlight";copy._uuid=(source._uuid || "building")+"@nightlight:"+(++serial);
 try{if(copy.getRuntimeData&&!copy.getRuntimeData())throw Error("Cannot parse adjusted night lighting.");}catch(error){if(copy.destroy)copy.destroy();throw error;}
 if(source.addRef)source.addRef();if(copy.addRef)copy.addRef();shared={map:map,key:signature,clone:copy,uses:1};map.set(signature,shared);return{source:source,clone:copy,shared:shared};
}
function signature(row){return JSON.stringify([row && row.Skin,row && row.Nightlight]);}
// Stage initialization prepares every saved tier before the player can build.
// It parses data only: no component pose, scene nodes or player state changes.
function prepare(owner,rows){
 dispose(owner,false);if(owner._buildingNightlightPrepared){owner._buildingNightlightPrepared.forEach(function(r){release(r,false);});delete owner._buildingNightlightPrepared;}
 var warm=[],sources=[],seen={};
 [owner.ndAniMain,owner.ndAniDown].concat(owner.ndAniOther || []).forEach(function(c){if(valid(c)&&valid(c.node)&&c.skeletonData&&sources.indexOf(c.skeletonData)<0)sources.push(c.skeletonData);});
 try{(rows || []).forEach(function(row){if(!row.Nightlight)return;var key=signature(row);if(seen[key])return;seen[key]=true;sources.forEach(function(source){var entry=acquire(source,row,key);if(entry)warm.push(entry);});});owner._buildingNightlightPrepared=warm;}
 catch(error){warm.forEach(function(r){release(r,false);});throw error;}
}
function apply(owner,row){
  var key=signature(row),state=owner._buildingNightlightRuntime;
  if(state && state.signature===key && state.records.every(function(r){return valid(r.component)&&r.component.skeletonData===r.clone;}))return;
  dispose(owner);if(!row || !row.Nightlight)return;
  var records=[];
  try{[owner.ndAniMain,owner.ndAniDown].concat(owner.ndAniOther || []).forEach(function(component){
    if(!valid(component)||!valid(component.node)||!component.skeletonData)return;
    var entry=acquire(component.skeletonData,row,key);if(!entry)return;entry.component=component;records.push(entry);component.skeletonData=entry.clone;
  });owner._buildingNightlightRuntime={signature:key,records:records};}catch(error){records.forEach(function(r){release(r,false);});throw error;}
}
exports.apply=apply;exports.dispose=dispose;exports.prepare=prepare;
