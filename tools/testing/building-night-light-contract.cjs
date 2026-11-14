'use strict';
// Reverse only the separately approved presentation delta before older source
// fidelity contracts run. Every changed or added value remains hash checked.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const fixture=require('./building-night-lights.fixture.json');
const clone=value=>JSON.parse(JSON.stringify(value));
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function skeleton(rig,value){
 const contract=fixture.rigs[rig],result=clone(value);if(!contract)return result;
 for(const added of contract.addedSlots||[contract.addedSlot]){const index=result.slots.findIndex(slot=>slot.name===added.name);
 assert(index>=0,'Missing approved native night light slot');assert.deepEqual(result.slots[index],added,'Native light slot identity/blend is fixed');result.slots.splice(index,1);}
 for(const change of [...contract.patches].reverse()){
  let owner=result;for(const key of change.path.slice(0,-1)){owner=owner&&owner[key];assert(owner,'Missing approved night lighting path');}
  const key=change.path[change.path.length-1];assert.equal(hash(owner[key]),change.afterHash,'Changed approved native night lighting '+rig+'/'+change.path.join('/'));
  if(change.had)owner[key]=clone(change.before);else delete owner[key];
 }
 return result;
}
function metadata(rig,value){const contract=fixture.rigs[rig],result=clone(value);if(!contract)return result;assert.equal(result.textures.filter(id=>id===contract.rayTextureUuid).length,1,'Native rays bind exactly one approved page');result.textures=result.textures.filter(id=>id!==contract.rayTextureUuid);return result;}
function atlas(rig,text){const contract=fixture.rigs[rig];if(!contract)return text;const addition=contract.atlasAddition.replace(/\r\n/g,'\n'),normalized=text.replace(/\r\n/g,'\n');assert(normalized.endsWith(addition),'unknown appended native light page or modified ray layout');return normalized.slice(0,-addition.length);}
function config(value){const result=clone(value);for(const row of result.BuildEnum?.[2]?.levelList||[]){if(!row.Appearance?.lighting)continue;const candidates=(fixture.towerLighting||[]).filter(p=>p.index===row.index);if(!candidates.length)continue;const current=hash(row.Appearance.lighting),patch=candidates.find(p=>p.afterHash===current);assert(patch,'Original sprite-only tower lighting must match its reviewed delta');row.Appearance.lighting=clone(patch.before);}return result;}
module.exports={fixture,skeleton,metadata,atlas,config};
