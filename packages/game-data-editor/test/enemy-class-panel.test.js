'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
function fixture(){
 const filename=path.join(__dirname,'building-panel.test.js');let source=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];
 source=source.replace('function fixture()','function fixture(kind)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
 const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout,setImmediate};vm.createContext(context);vm.runInContext(source+'\nmodule.exports={fixture,fields,all};',context);
 const {fixture,fields,all}=context.module.exports,f=fixture('units');
 const field=label=>fields(f.panel.$detail,label)[0];
 const button=label=>all(f.panel.$detail,node=>node.tagName==='button'&&node.textContent===label)[0];
 function choose(label,value){const input=field(label);input.value=String(value);input.onchange();}
 async function add(id,form){choose('Skill',id);if(form!==undefined)choose('Next form',form);const submit=button('Add skill');assert(!submit.disabled);await submit.onclick();}
 return {f,fields,field,choose,add,button};
}
test('Units assigns Normal, Elite and Boss in drafts without changing combat roles, stats, timing or saved data',async()=>{
 const {f,fields}=fixture(),before=f.store.draftState(),file=path.resolve(__dirname,'../../../assets/KinghtFallConfig/GameJsonCfg.json'),bytes=fs.readFileSync(file);
 f.render('enemy:91090');let choices=fields(f.panel.$detail,'Enemy class')[0];assert(choices);
 assert.deepEqual(Array.from(choices.children,option=>[option.value,option.textContent]),[['normal','Normal'],['elite','Elite'],['boss','Boss']]);assert.equal(choices.value,'normal');assert.equal(f.store.changes().length,0);
 choices.value='elite';choices.onchange();await f.panel._queue;assert.equal(f.store.documents.overrides.data.enemyClasses['enemy:91090:default'],'elite');
 f.render('enemy:91090');choices=fields(f.panel.$detail,'Enemy class')[0];choices.value='boss';choices.onchange();await f.panel._queue;assert.equal(f.store.documents.overrides.data.enemyClasses['enemy:91090:default'],'boss');
 const after=f.store.draftState();assert.deepEqual(after.A,before.A);for(const table of ['unitTypeAssignments','timings','timingDefaults'])assert.deepEqual(after.overrides[table],before.overrides[table]);assert(fs.readFileSync(file).equals(bytes));
 f.render('ally:90001');assert.equal(fields(f.panel.$detail,'Enemy class').length,0);
});
test('Transform is equipped per profile, edits stay in drafts and cycle targets are unavailable',async()=>{
 const {f,fields,choose,add,button}=fixture(),before=f.store.draftState(),source=91001,target=91090,next=91002;
 f.render('enemy:'+source);
 const field=()=>fields(f.panel.$detail,'Next form')[0];
 assert.equal(field(),undefined);choose('Skill','transform');
 assert.equal(field().value,'0');assert.match(f.panel.$detail.textContent,/at full health and continues its route/);
 assert(!field().children.some(option=>option.value===String(source)||option.value==='90010'));
 assert.equal(f.store.changes().length,0);
 await add('transform',target);
 const delay=fields(f.panel.$detail,'Transform delay (seconds)')[0];
 assert.equal(delay.value,'10');delay.value='2.5';delay.onchange();await f.panel._queue;
 assert.deepEqual(f.store.documents.A.data.SoldierCfg[source].TransformSkill,{unitId:target,delay:2.5});
 const trigger=()=>fields(f.panel.$detail,'Transform trigger')[0];
 assert.equal(trigger().value,'delay');
 trigger().value='health';trigger().onchange();await f.panel._queue;
 assert.equal(fields(f.panel.$detail,'Transform delay (seconds)').length,0);
 const hp=fields(f.panel.$detail,'Remaining HP (%)')[0];
 assert.equal(hp.value,'50');hp.value='37.5';hp.onchange();await f.panel._queue;
 assert.deepEqual(f.store.documents.A.data.SoldierCfg[source].TransformSkill,{unitId:target,delay:2.5,trigger:'health',healthPercent:37.5});
 trigger().value='delay';trigger().onchange();await f.panel._queue;
 assert.equal(fields(f.panel.$detail,'Transform delay (seconds)')[0].value,'2.5');
 f.render('enemy:'+target);
 choose('Skill','transform');
 assert.equal(field().value,'0');assert(!field().children.some(option=>option.value===String(source)));
 await add('transform',next);
 assert.deepEqual(f.store.documents.A.data.SoldierCfg[target].TransformSkill,{unitId:next,delay:10});
 f.render('enemy:'+source);await button('Remove skill').onclick();
 assert.deepEqual(f.store.documents.A.data.SoldierCfg[source],before.A.SoldierCfg[source]);
 assert.deepEqual(f.store.documents.A.original,before.A);
 f.render('ally:90001');assert.equal(field(),undefined);
});

test('Skills equips several independent abilities and preserves the authored record until Save',async()=>{
 const {f,field,add,choose}=fixture(),before=f.store.draftState(),id=91001;
 f.render('enemy:'+id);
 assert(!field('HP restored (%)'));
 for(const id of ['heal','haste','weaken','attackSlow','moveSlow','polymorph'])await add(id);
 const strength=field('HP restored (%)');strength.value='33';strength.onchange();await f.panel._queue;
 choose('Attack speed reduction (%)',48);await f.panel._queue;
 choose('Movement speed reduction (%)',54);await f.panel._queue;
 const form=field('Opponent form');
 assert.equal(form.value,'91014');assert(form.children.some(option=>option.value==='91015'));
 choose('Opponent form',91015);await f.panel._queue;
 const unit=f.store.documents.A.data.SoldierCfg[id];
 assert.equal(unit.EnemySkills.heal.percent,33);
 assert.equal(unit.EnemySkills.haste.percent,120);
 assert.equal(unit.EnemySkills.weaken.percent,50);
 assert.equal(unit.EnemySkills.attackSlow.percent,48);
 assert.equal(unit.EnemySkills.moveSlow.percent,54);
 assert.equal(unit.EnemySkills.polymorph.unitId,91015);
 assert(!field('Skill').children.some(option=>option.value==='polymorph'));
 assert.equal(unit.TransformSkill,before.A.SoldierCfg[id].TransformSkill);
 assert.deepEqual(f.store.documents.A.original,before.A);
 assert(field('Attack delivery'));
});

test('Removing and re-adding a built-in skill restores its native cast',async()=>{
 const {f,field,button,add}=fixture(),id=91052;
 f.render('enemy:'+id);
 assert.equal(field('Settings').value,'original');
 await button('Remove skill').onclick();
 assert.equal(f.store.draftState().A.SoldierCfg[id].EnemySkills.haste,false);
 assert(!field('Settings'));
 await add('haste');
 assert.equal(field('Settings').value,'original');
 assert.equal(f.store.draftState().A.SoldierCfg[id].EnemySkills,undefined);
});
