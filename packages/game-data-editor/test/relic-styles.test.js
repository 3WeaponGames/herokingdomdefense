'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const Schema=require('../lib/schema');
const Config=require('../../../assets/KinghtFallConfig/GameJsonCfg.json');
const fixture=()=>({A:{data:structuredClone(Config)}});

test('Relic fighting-style requirements validate actual implemented IDs without modifying source data',()=>{
 for(const value of ['fighter',[],['unknown'],['melee'],['fighter','fighter'],[null]]){
  const d=fixture();d.A.data.TreasureCfg[0].RequiredHeroStyles=value;const before=JSON.stringify(d);
  assert(Schema.validate(d).some(issue=>issue.path.includes('RequiredHeroStyles')&&issue.severity==='error'),JSON.stringify(value));assert.equal(JSON.stringify(d),before);
 }
 const d=fixture();d.A.data.TreasureCfg[0].RequiredHeroStyles=['skirmisher','fighter','vanguard','mystic','bruiser','guardian'];assert(!Schema.validate(d).some(issue=>issue.path.includes('RequiredHeroStyles')));
});

test('Relic authoring exposes fighting styles and keeps mechanic identifiers read-only',()=>{
 const styles=Schema.descriptor('RequiredHeroStyles',{table:'TreasureCfg'});assert.equal(styles.label,'Required fighting styles');assert.deepStrictEqual(styles.options.map(option=>option.value),['skirmisher','fighter','vanguard','mystic','bruiser','guardian']);assert(/equipped/.test(styles.help));
 assert.equal(Schema.descriptor('EffectKey',{table:'TreasureCfg'}).readOnly,true);
});
