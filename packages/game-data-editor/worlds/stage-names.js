'use strict';
// Editor labels only. Gameplay identifiers, route geometry and source nodes stay intact.
const BUILDING_NAMES={1:'Main Hall',2:'Tower',3:'Barracks',4:'House',5:'Mill',6:'Wall / Gate'};
const clean=value=>String(value===undefined||value===null?'':value).trim().replace(/\s+/g,' ');
function spawnIds(graph){return Array.from(new Set(Array.isArray(graph.spawnIds)?graph.spawnIds:[])).sort((a,b)=>a-b);}
function signature(graph){return spawnIds(graph).join(',');}
function spawnRanges(ids){
 const sorted=Array.from(new Set(ids||[])).sort((a,b)=>a-b),ranges=[];
 for(let i=0;i<sorted.length;i++){const start=sorted[i];let end=start;while(i+1<sorted.length&&sorted[i+1]===end+1)end=sorted[++i];ranges.push(start===end?String(start):start+'–'+end);}
 return ranges.join(', ');
}
function generatedPathName(stage,graph){
 const ids=spawnIds(graph),spawns=ids.map(id=>(stage.spawns||[]).find(spawn=>spawn.id===id)||{id,name:'Spawn '+id});
 const defaults=spawns.every(spawn=>new RegExp('^spawn\\s+0*'+spawn.id+'$','i').test(clean(spawn.name)));
 const label=!ids.length?'Unassigned spawns':defaults?(ids.length===1?'Spawn ':'Spawns ')+spawnRanges(ids):spawns.map(spawn=>clean(spawn.name)||'Spawn '+spawn.id).join(', ');
 // Use the original graph sequence, independently of the card display order.
 const group=signature(graph),siblings=(stage.graphs||[]).filter(route=>signature(route)===group),ordinal=siblings.findIndex(route=>route.id===graph.id)+1;
 return label+' · Route '+Math.max(1,ordinal);
}
function followsSpawns(graph){
 if(graph.nameFromSpawns!==undefined)return graph.nameFromSpawns===true;
 return !!graph.legacy&&/^Path\d+(?:_\d+)*$/.test(graph.name||'')||graph.legacy===false&&(/^(?:Spawn \d+ approach|New approach)$/.test(graph.name||''));
}
function pathName(stage,graph){return followsSpawns(graph)?generatedPathName(stage,graph):String(graph.name===undefined||graph.name===null?'':graph.name);}
function refreshPaths(stage){
 for(const graph of stage.graphs||[])if(followsSpawns(graph)){graph.nameFromSpawns=true;graph.name=generatedPathName(stage,graph);}
 return stage;
}
function buildingBase(name,kind){
 let base=clean(name).replace(/\s+\d+$/,'');
 if(/^archer tower$/i.test(base))base='Tower';
 const standard=Object.values(BUILDING_NAMES).find(value=>value.toLowerCase()===base.toLowerCase());
 return standard||base||BUILDING_NAMES[kind]||'Building';
}
function comparableBuildingName(name){return clean(name).replace(/^archer tower(?=\s+\d+$|$)/i,'Tower').toLowerCase();}
function nextBuildingName(stage,name,kind){
 const base=buildingBase(name,kind),taken=new Set((stage.buildings||[]).concat(stage.specials||[]).map(building=>comparableBuildingName(building.name)));
 let number=1;while(taken.has((base+' '+number).toLowerCase()))number++;
 return base+' '+number;
}
function prepareBuilding(stage,building){building.name=nextBuildingName(stage,building.name,building.kind);delete building.editorOrder;return building;}
function refreshTowers(stage){
 const converted=(stage.buildings||[]).filter(building=>/^archer tower(?:\s+\d+)?$/i.test(clean(building.name))),others=(stage.buildings||[]).filter(building=>!converted.includes(building));
 const naming={buildings:others.slice(),specials:stage.specials||[]};
 for(const building of converted){const candidate=clean(building.name).replace(/^archer tower/i,'Tower');building.name=/ \d+$/.test(candidate)&&!naming.buildings.concat(naming.specials).some(other=>comparableBuildingName(other.name)===candidate.toLowerCase())?candidate:nextBuildingName(naming,'Tower',2);naming.buildings.push(building);}
 return stage;
}
module.exports={BUILDING_NAMES,spawnRanges,pathName,generatedPathName,refreshPaths,refreshTowers,nextBuildingName,prepareBuilding};
