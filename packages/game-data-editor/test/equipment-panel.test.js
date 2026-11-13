'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test'),{createRequire}=require('node:module');
function fixture(){
 const filename=path.join(__dirname,'building-panel.test.js');let prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];prefix=prefix.replace(".create('buildings')",".create('equipment')").replace("_kind: 'buildings'","_kind: 'equipment'");
 const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout};vm.runInNewContext(prefix+'\nmodule.exports={fixture,fields,all};',context);
 const f={...context.module.exports.fixture(),fields:context.module.exports.fields,all:context.module.exports.all};f.preview=()=>f.previews.filter(value=>value.kind==='unit').at(-1).request;return f;
}
test('Equipment lists shared items first, includes both upgrade tracks for all six weapons and uses automatic item icons',()=>{
 const f=fixture(),before=f.store.draftState(),rows=f.panel._rows();assert.deepEqual(Array.from(rows.slice(0,4),row=>row.record.id),[1,2,5,6]);assert.equal(rows.length,16);
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian'])for(const slot of [3,4]){const row=rows.find(row=>row.key===slot+':'+style);assert(row);assert.equal(row.heroStyle,style);assert.equal(row.icon,undefined);f.render(row.key);assert.equal(f.preview().heroStyle,style);}
 assert(rows.find(row=>row.key==='4:guardian').label.includes('Hammer'));assert(rows.find(row=>row.key==='3:guardian').label.includes('Shield'));assert(rows.find(row=>row.key==='3:mystic').label.includes('Crystal Orb'));
 f.render('2');assert(f.panel._equipmentIcon(rows.find(row=>row.key==='2')).url.includes('FA_Helmet_003_Wood'));
 assert.equal(f.fields(f.panel.$detail,'Icon').length,0,'Legacy manual icon controls are absent');assert(f.fields(f.panel.$detail,'Icon background').length>0,'Unrelated background settings remain intact');assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0);
});
test('selected tier and upgrade level drive the preview and stat edits retain existing progression IDs',async()=>{
 const f=fixture(),before=f.store.draftState();f.render('2',24);let edit=f.fields(f.panel.$detail,'Edit level')[0];assert(edit.children[24].textContent.startsWith('Tier 3 · Level 5 · Upgrade 25'));assert.equal(f.preview().heroLevels[2],25);
 edit.value=44;edit.onchange();assert.equal(f.preview().heroLevels[2],45);assert.equal(f.panel._equipmentIcon(f.panel._rows().find(row=>row.key==='2')).url.includes('FA_Helmet_043_Red'),true);assert.equal(f.store.changes().length,0);
 const input=f.fields(f.panel.$detail,'HP regeneration')[0];input.value=123;input.onchange();await f.panel._queue;const after=f.store.draftState();assert.equal(after.A.EquipCfg[1].levelInfo[44].Parameters,123);assert.equal(after.A.EquipCfg[1].levelInfo[44].Level,45);assert.equal(after.A.EquipCfg[1].levelInfo[44].Image,before.A.EquipCfg[1].levelInfo[44].Image);assert.deepEqual(after.overrides,before.overrides);assert.equal(f.preview().heroLevels[2],45);
});

test('main weapons expose fifty damage levels and secondary fields edit only the chosen style without writes while browsing',async()=>{
 const f=fixture(),before=f.store.draftState();f.render('4:fighter',49);assert.equal(f.fields(f.panel.$detail,'Attack damage')[0].value,'130');assert.equal(f.fields(f.panel.$detail,'Base damage (Archer curve)')[0].value,'100');assert.equal(f.fields(f.panel.$detail,'Edit level')[0].children.length,50);assert.equal(f.fields(f.panel.$detail,'Attack range').length,0);
 f.render('3:vanguard',49);assert.equal(f.fields(f.panel.$detail,'Movement speed (%)')[0].value,'20');assert.equal(f.fields(f.panel.$detail,'Attack speed (%)')[0].value,'10');assert.equal(f.fields(f.panel.$detail,'Damage').length,0);assert.equal(f.fields(f.panel.$detail,'Attack damage').length,0);assert.deepEqual(f.store.draftState(),before);
 const speed=f.fields(f.panel.$detail,'Attack speed (%)')[0];speed.value=12;speed.onchange();await f.panel._queue;const current=f.store.draftState();assert.equal(current.A.EquipCfg[2].levelInfo[49].SecondaryStats.vanguard.attackRate,.12);assert.equal(current.A.EquipCfg[2].levelInfo[49].SecondaryStats.bruiser.attackRate,before.A.EquipCfg[2].levelInfo[49].SecondaryStats.bruiser.attackRate);assert.equal(current.A.EquipCfg[2].levelInfo[49].Parameters,before.A.EquipCfg[2].levelInfo[49].Parameters);
 f.render('3:guardian',49);assert.equal(f.fields(f.panel.$detail,'Damage reduction (%)')[0].value,'20');assert.equal(f.fields(f.panel.$detail,'Life steal (%)').length,0);
});
