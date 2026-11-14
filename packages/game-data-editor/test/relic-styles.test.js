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

test('Relic requirement help matches explicit all-style authoring and legacy omission behavior',()=>{
 const Eligibility=require('../../../assets/_script/RelicEligibility'),help=Schema.descriptor('RequiredHeroStyles',{table:'TreasureCfg'}).help;
 assert.match(help,/all six/);assert.match(help,/original style requirements/);
 assert.deepStrictEqual(Eligibility.stylesFor(120024),['vanguard']);
 assert.deepStrictEqual(Eligibility.stylesFor(120024,{RequiredHeroStyles:Eligibility.ids}),Eligibility.ids);
});


test('Shared talent, perk and relic previews retain authored fractional percentages',()=>{
 const before=JSON.stringify(Config),catalog=require('../../../assets/resources/localization/catalog.json'),fang=Config.TreasureCfg.find(row=>row.ID===120042);
 for(const [index,expected]of ['0.5%','0.75%','1%'].entries())assert(Schema.formatEffect({...fang.levelInfo[index],Describe:fang.Describe},catalog,'en','param','vaulePercentage').includes(expected));
 for(const [values,flags]of [['Pamer','isPerecentage'],['EffectNumber','vaulePercentage'],['param','vaulePercentage']])assert.equal(Schema.formatEffect({Describe:'Value {0}',[values]:[.0075],[flags]:[1]},catalog,'en',values,flags),'Value 0.75%');
 assert.equal(JSON.stringify(Config),before);
});
