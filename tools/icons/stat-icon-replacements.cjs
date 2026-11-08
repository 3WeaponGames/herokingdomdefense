'use strict';

// Artwork bindings only. No progression, balance or item appearance values are
// changed by this migration; old assets stay available to existing references.
const reference=id=>'@icon/Stats Icons/'+id;
const talentNames=[
  'soldier-damage','soldier-attack-speed','soldier-health','melee-defense','ranged-range',
  'building-damage','building-attack-speed','building-range','building-health',
  'reborn-fury','wealth-of-courage','life-drain','crippling-strike','critical-chance',
  'shattered-resolve','nothing-to-lose','windfall','desperate-counterattack','soldier-capacity',
  'building-upgrade','tower-construction','tower-invincibility','shattering-impact',
  'health-on-kill','spoils-of-war','nightfall-income','house-income'
];
const perkNames=[
  'split-shot','super-soldiers','spoils-of-war','nightfall-income','tower-invincibility',
  'shattering-impact','house-income','health-on-kill','construction-discount','windfall',
  'building-upgrade','tower-construction','reborn-fury','critical-chance','crippling-strike',
  'life-drain','wealth-of-courage','desperate-counterattack','nothing-to-lose','shattered-resolve',
  'movement-speed','health-regeneration','soldier-capacity','all-in-towers','melee-suppression',
  'resource-production','attack-damage','attack-speed','windfall','building-range',
  'soldier-movement-speed','soldier-health','ranged-suppression','castle-damage','movement-speed',
  'health-regeneration','critical-chance','melee-suppression','tower-health','life-on-the-line',
  'short-sighted','rapid-fire','survival-of-the-fittest','fast-and-slow','crimson-sight',
  'reign-of-arrows','people-first','hollow-strength','attack-damage','attack-speed',
  'building-range','soldier-movement-speed','soldier-health','castle-damage','tower-health',
  'ranged-suppression','super-soldiers'
];
const talents=Object.fromEntries(talentNames.map((name,index)=>[100001+index,name]));
const perks=Object.fromEntries(perkNames.map((name,index)=>[50001+index,name]));
// Wall Defense's legacy "speed" operations modify firing cooldown, not travel.
const wallDefense={speedPlus:'attack-speed',speedSub:'attack-speed',speedMultiply:'attack-speed',speedDivision:'attack-speed',
  ATKplus:'attack-damage',ATKsub:'attack-damage',ATKMultiply:'attack-damage',ATKDivision:'attack-damage',
  memberPlus:'soldier-capacity',memberSub:'soldier-capacity',HPplus:'health',HPsub:'health'};
function mainConfig(data){
  const next=JSON.parse(JSON.stringify(data));
  for(const [id,name]of Object.entries(talents)){
    if(!next.TalentCfg||!next.TalentCfg[id])throw Error('Missing authored talent '+id);
    next.TalentCfg[id].Image=reference(name);
  }
  for(const [id,name]of Object.entries(perks)){
    const row=(next.BuffCfg||[]).find(row=>String(row.ID)===id);
    if(!row)throw Error('Missing authored battle perk '+id);
    row.Image=reference(name);
  }
  return next;
}
function wallConfig(data){
  const next=JSON.parse(JSON.stringify(data));
  for(const row of next.buffTypeCfg||[]){
    const name=wallDefense[row.buffType];
    if(name){if(!Object.prototype.hasOwnProperty.call(row,'buffIcon'))throw Error('Missing authored Wall Defense stat icon '+row.buffType);row.buffIcon=reference(name);}
  }
  return next;
}
module.exports={reference,talents,perks,wallDefense,mainConfig,wallConfig};
