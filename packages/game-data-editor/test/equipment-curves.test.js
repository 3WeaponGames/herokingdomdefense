'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test'),{createRequire}=require('node:module');
const {Store,files}=require('../lib/store'),Schema=require('../lib/schema'),Curve=require('../panel/equipment-curve'),Damage=require('../panel/hero-damage'),Stats=require('../../../assets/_script/HeroEquipmentStats'),Loadout=require('../../../assets/_script/HeroLoadout'),temporary=require('./owned-temp');
const root=path.resolve(__dirname,'../../..'),Config=require('../../../assets/KinghtFallConfig/GameJsonCfg.json'),clone=value=>JSON.parse(JSON.stringify(value));
function fixture(kind='equipment',store){
 const filename=path.join(__dirname,'building-panel.test.js');let prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];
 prefix=prefix.replace('function fixture()','function fixture(kind,sharedStore)').replace('const store = new Store(project)','const store = sharedStore || new Store(project)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
 const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout};vm.runInNewContext(prefix+'\nmodule.exports={fixture,fields,all};',context);
 return Object.assign(context.module.exports.fixture(kind,store),{fields:context.module.exports.fields,all:context.module.exports.all});
}
function row(config,id,style){const index=config.EquipCfg.findIndex(gear=>gear.id===id);return{key:String(id)+(style?':'+style:''),record:config.EquipCfg[index],path:['EquipCfg',index],heroStyle:style};}
function input(f,label,value){const field=f.fields(f.panel.$detail,label)[0];assert(field,label);if(value!==undefined)field.value=String(value);field.onchange();return field;}
function button(f,label){const found=f.all(f.panel.$detail,item=>item.tagName==='button'&&item.textContent===label);assert.equal(found.length,1,label);return found[0];}
const rule=(from,to,gain,multiplier=1,power=0,precision=0)=>({from,to,gain,multiplier,power,rounding:'nearest',precision});
test('progression totals exclude starting hero stats while keeping secondary equipment bonuses and authored data intact',()=>{
 const config=clone(Config),before=JSON.stringify(config);
 for(const id of [1,2,5,6]){const r=row(config,id),field=Curve.descriptors(config,r)[0];assert.equal(field.values[0],0);assert(Math.abs(field.values[1]-(config.EquipCfg[r.path[1]].levelInfo[1].Parameters-field.base))<1e-10);}
 const main=row(config,4,'fighter');assert.equal(Curve.descriptors(config,main)[0].values[0],0);assert.equal(Curve.descriptors(config,main)[0].values[49],127);
 const arrow=Curve.descriptors(config,row(config,3,'skirmisher')),count=config.EquipCfg[2].levelInfo.length;assert.equal(arrow[0].values[0],200/count);assert.equal(arrow[0].values[count-1],200);assert.equal(arrow[1].values[count-1],.1);assert.equal(JSON.stringify(config),before);
});
test('growth rules support flat, exponential and power curves, rounding and isolated special upgrades',()=>{
 const field={first:2,base:21,integer:true,gains:[0,...Array(49).fill(2)]};
 assert.deepEqual(Curve.generate(field,rule(2,50,3)).values.slice(0,5),[0,3,6,9,12]);
 assert.deepEqual(Curve.generate(field,rule(2,5,2,2)).gains.slice(0,6),[0,2,4,8,16,2]);
 assert.deepEqual(Curve.generate(field,rule(2,5,2,1,1)).gains.slice(0,6),[0,2,4,6,8,2]);
 const special=Curve.generate(field,rule(5,5,3));assert.equal(special.values[3],6);assert.equal(special.values[4],9);assert.equal(special.values[49],99);
 const down=Curve.generate(field,{...rule(2,3,1.9),rounding:'down'});assert.equal(down.gains[1],1);
 for(const bad of [{multiplier:0},{gain:-1},{power:Infinity},{to:51},{from:1},{precision:10},{rounding:'bad'},{gain:1e300}])assert.throws(()=>Curve.generate(field,{...rule(2,50,2),...bad}));
 const percent={first:1,base:0,percent:true,gains:Array(50).fill(.002)};assert.throws(()=>Curve.generate(percent,rule(1,50,.03,1,0,6)),/allowed stat/);
});
test('browsing, switching tiers and unchanged inputs create no drafts, including mixed existing gains',async()=>{
 const f=fixture(),before=f.store.draftState(),bytes=fs.readFileSync(path.join(root,files.A));
 for(const key of ['4:skirmisher','4:fighter','3:skirmisher','3:vanguard','1','2','5','6']){f.render(key,1);assert(f.all(f.panel.$detail,item=>item.tagName==='canvas').length);for(const label of [f.fields(f.panel.$detail,'First increase').length?'First increase':'First increase (%)','Multiply increase each level by','Curve exponent'])input(f,label);}
 f.render('4:fighter',1);input(f,'Starting damage');input(f,'Attack damage bonus per upgrade');await f.panel._queue;
 assert.deepEqual(f.store.draftState(),before);assert.equal(f.messages.filter(message=>message.message==='game-data-editor:change').length,0);assert.deepEqual(fs.readFileSync(path.join(root,files.A)),bytes);
});
test('changing an Arrow increase to three carries through every offhand upgrade and preserves every other field',async()=>{
 const f=fixture(),before=f.store.draftState();f.render('3:skirmisher');input(f,'Attack range bonus per upgrade',3);await f.panel._queue;
 const after=f.store.draftState(),levels=after.A.EquipCfg[2].levelInfo;
 levels.forEach((level,index)=>{assert.equal(level.SecondaryStats.skirmisher.range,(index+1)*3);const original=clone(before.A.EquipCfg[2].levelInfo[index]),actual=clone(level);delete original.SecondaryStats.skirmisher.range;delete actual.SecondaryStats.skirmisher.range;assert.deepEqual(actual,original);});
 assert.equal(after.A.HeroEquipment.upgradeCurveRules['3:skirmisher'].range.gain,3);assert.deepEqual(after.A.GameTools,before.A.GameTools);assert.deepEqual(after.overrides,before.overrides);
 f.render('3:skirmisher',levels.length-1);assert.equal(f.fields(f.panel.$detail,'Edit level')[0].value,String(levels.length-1));assert(f.panel.$detail.textContent.includes('Attack range bonus: +'+levels.length*3));assert.equal(f.fields(f.panel.$detail,'Attack range bonus per upgrade')[0].value,'3');
});
test('independent starting damage and growth rules compose without leaking base damage into the upgrade table',async()=>{
 const f=fixture(),before=f.store.draftState();f.render('4:fighter');input(f,'Starting damage',21);await f.panel._queue;
 input(f,'First increase',2);await button(f,'Apply curve to Attack damage bonus').onclick();await f.panel._queue;
 let config=f.store.draftState().A;assert.equal(Stats.damageAtLevel(config,'fighter',1),21);assert.equal(Stats.damageAtLevel(config,'fighter',50),119);
 assert.equal(Curve.descriptors(config,row(config,4,'fighter'))[0].values[49],98);assert.equal(Stats.damageAtLevel(config,'skirmisher',1),Stats.damageAtLevel(before.A,'skirmisher',1));
 input(f,'From upgrade',5);input(f,'Through upgrade',5);input(f,'First increase',3);await button(f,'Apply curve to Attack damage bonus').onclick();await f.panel._queue;
 config=f.store.draftState().A;assert.equal(Stats.damageAtLevel(config,'fighter',4),27);assert.equal(Stats.damageAtLevel(config,'fighter',5),30);assert.equal(Stats.damageAtLevel(config,'fighter',6),32);
 assert.deepEqual(config.EquipCfg,before.A.EquipCfg);assert.deepEqual(config.GameTools,before.A.GameTools);assert.deepEqual(config.HeroEquipment.damageMultipliers,before.A.HeroEquipment.damageMultipliers);
 const types=fixture('unit-types',f.store);types.render('skirmisher');input(types,'Starting damage',18);await types.panel._queue;assert.equal(Stats.damageAtLevel(f.store.draftState().A,'skirmisher',1),18);
});
test('multiplier and exponent rules persist, reopen as authored and affect the selected stat only',async()=>{
 const f=fixture();f.render('3:skirmisher');input(f,'First increase',3);input(f,'Multiply increase each level by',1.02);input(f,'Curve exponent',.25);await button(f,'Apply curve to Attack range bonus').onclick();await f.panel._queue;
 const config=f.store.draftState().A,profile=config.HeroEquipment.upgradeCurveRules['3:skirmisher'].range,field=Curve.descriptors(Config,row(Config,3,'skirmisher'))[0],expected=Curve.generate(field,profile);
 assert.equal(profile.multiplier,1.02);assert.equal(profile.power,.25);config.EquipCfg[2].levelInfo.forEach((level,index)=>assert.equal(level.SecondaryStats.skirmisher.range,expected.values[index]));
 const reopened=fixture('equipment',f.store);reopened.render('3:skirmisher');assert.equal(reopened.fields(reopened.panel.$detail,'Multiply increase each level by')[0].value,'1.02');assert.equal(reopened.fields(reopened.panel.$detail,'Curve exponent')[0].value,'0.25');
 const count=f.store.changes().length;await button(reopened,'Apply curve to Attack range bonus').onclick();await reopened.panel._queue;assert.equal(f.store.changes().length,count);
});
test('changing a starting shared stat shifts actual totals without changing earned upgrade bonuses',async()=>{
 const f=fixture();f.render('1');const before=Curve.descriptors(f.store.draftState().A,row(f.store.draftState().A,1))[0].values;
 input(f,'Starting HP',150);await f.panel._queue;const config=f.store.draftState().A;assert.equal(config.EquipCfg[0].levelInfo[0].Parameters,150);assert.deepEqual(Curve.descriptors(config,row(config,1))[0].values,before);
});
test('independent damage validation preserves future extensions and rejects invalid known values without normalizing',()=>{
 const store=new Store(root),docs=store.draftState(),profile={baseDamage:21,gains:Array(49).fill(2),future:{keep:true}};docs.A.HeroEquipment.damageProgressions={fighter:profile,futureStyle:{keep:[null,1]}};
 const before=JSON.stringify(docs),issues=()=>Schema.validate(docs,[{doc:'A',path:['HeroEquipment','damageProgressions']}]).filter(issue=>issue.path[1]==='damageProgressions');
 assert.deepEqual(issues(),[]);assert.equal(JSON.stringify(docs),before);
 for(const invalid of [null,[],{},-1]){docs.A.HeroEquipment.damageProgressions.fighter=invalid;assert(issues().some(issue=>issue.severity==='error'));}
 docs.A.HeroEquipment.damageProgressions.fighter={baseDamage:21,gains:[2]};assert(issues().length);docs.A.HeroEquipment.damageProgressions.fighter={baseDamage:21,gains:Array(49).fill(-1)};assert(issues().length);
});
test('isolated curve saves retain backups and revision checks, and no-op saves perform no writes',()=>{
 const project=temporary('hkd-equipment-curves-');for(const file of Object.values(files)){const to=path.join(project,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);}
 const store=new Store(project,{validators:[Schema.validate],backupRoot:path.join(project,'backups')}),config=store.draftState().A,r=row(config,4,'fighter'),target=path.join(project,files.A),before=fs.readFileSync(target),version=store.version;
 const edits=Damage.edits(config,'fighter',{kind:'base',value:21});store.change({version,edits});assert.deepEqual(fs.readFileSync(target),before);assert.throws(()=>store.change({version,edits}),/Another panel/);
 store.change({version:store.version,edits:Curve.plan(store.draftState().A,r,'damage',rule(2,50,2))});const saved=store.save({version:store.version});assert.equal(saved.result.saved,true);
 const data=JSON.parse(fs.readFileSync(target));assert.equal(Loadout.snapshot(data,{personLevel:[1,1,1,1,1,1],heroWeapon:{selected:'fighter',levels:{fighter:{3:1,4:50}}}}).damage,119);
 const stable=fs.readFileSync(target),stamp=fs.statSync(target).mtimeMs;assert.equal(store.save({version:store.version}).result.noChanges,true);assert.deepEqual(fs.readFileSync(target),stable);assert.equal(fs.statSync(target).mtimeMs,stamp);
 store.change({version:store.version,edits:Damage.edits(store.draftState().A,'fighter',{kind:'base',value:25})});
 const external=JSON.parse(fs.readFileSync(target));external.HeroEquipment.damageProgressions.fighter.baseDamage=27;fs.writeFileSync(target,JSON.stringify(external));
 assert.throws(()=>store.save({version:store.version}),/changed outside/);assert.equal(JSON.parse(fs.readFileSync(target)).HeroEquipment.damageProgressions.fighter.baseDamage,27);
});
