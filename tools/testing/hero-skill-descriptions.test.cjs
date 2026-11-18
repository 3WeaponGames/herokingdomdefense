'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Descriptions=require('../../assets/_script/HeroSkillDescriptions'),Settings=require('../../assets/_script/HeroSkillSettings'),Authoring=require('../../assets/_script/HeroSkillAuthoring'),Core=require('../../assets/_script/HeroStyleSkills');
const {SkillService,FILES}=require('../../packages/hkd-skills/service');

test('all active and passive entries have editable, fully resolved descriptions without mutating the skill settings',()=>{
 const config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),before=JSON.stringify(config);let entries=0;
 for(const style of Settings.styles){
  const effective=Settings.effective(style.id,config),saved=JSON.stringify(effective);
  for(const entry of Authoring.entries(style.id)){
   const fields=Authoring.fields(style.id,entry.id,Settings.fields(style.id),effective).tuning.filter(field=>field.type==='description');
   assert.equal(fields.length,1);assert.equal(fields[0].path,'descriptions.'+entry.id);assert(Settings.valid(fields[0],effective.descriptions[entry.id]));
   const text=Descriptions.render(style.id,entry.id,effective);assert(text.length>30);assert(!/[{}]/.test(text));assert.match(text,/\d/);entries++;
  }
  assert.equal(JSON.stringify(effective),saved);
 }
 assert.equal(entries,11);assert.equal(JSON.stringify(config),before);
});

test('damage, cooldown, shield, stack and charge edits update the displayed text while the template remains unchanged',()=>{
 const config={HeroSkills:{skirmisher:{activeDamage:1.1}}},template=Settings.defaults('skirmisher').descriptions.active;
 assert.match(Descriptions.render('skirmisher','active',Settings.effective('skirmisher',config)),/110%/);
 config.HeroSkills.skirmisher.activeDamage=.9;config.HeroSkills.skirmisher.cooldown=7.5;
 const next=Settings.effective('skirmisher',config),text=Descriptions.render('skirmisher','active',next);
 assert.match(text,/90%/);assert.match(text,/7\.5s/);assert.equal(next.descriptions.active,template);
 for(const [style,entry,overrides,expected]of [['guardian','active',{shieldHealth:.37,shieldDuration:9,tauntDuration:4},[/37%/,/9s/,/4s/]],['mystic','active',{activeDamage:1.25,chargeDamage:.035,maxCharges:17,splashRadiusPerCharge:12},[/125%/,/3\.5%/,/17/,/12/]],['bruiser','passive',{missingDamage:.65,missingAttackRate:1.2},[/65%/,/120%/]]]){
  const rendered=Descriptions.render(style,entry,Settings.effective(style,{HeroSkills:{[style]:overrides}}));for(const pattern of expected)assert.match(rendered,pattern);
 }
});

test('derived stack percentages respect the actual combat caps and adding copy never changes combat tuning',()=>{
 const tuning=Settings.effective('fighter',{HeroSkills:{fighter:{maxStacks:20,stackDamage:.05,stackReduction:.2,stackTenacity:.1}}});
 const state=Core.createState('fighter',tuning);state.stacks=20;state.stackRemaining=1;const bonus=Core.bonuses(state),values=Descriptions.values('fighter',tuning);
 assert.equal(values.stackDamageTotal,bonus.damage);assert.equal(values.stackReductionTotal,bonus.damageReduction);assert.equal(values.stackTenacityTotal,bonus.tenacity);
 assert.match(Descriptions.render('fighter','passive',tuning),/80% damage reduction/);assert.match(Descriptions.render('fighter','passive',tuning),/80% tenacity/);
 const custom=Settings.effective('fighter',{HeroSkills:{fighter:{descriptions:{active:'Damage +{buffDamage:percent} for {buffDuration}s.'}}}});
 assert.deepEqual(Core.createState('fighter',custom),Core.createState('fighter',Settings.defaults('fighter')));
});

test('description placeholders are validated as data and malformed saved templates fall back without changing the source',()=>{
 const field=Settings.fields('skirmisher').tuning.find(field=>field.type==='description');
 for(const invalid of ['Damage {missingStat:percent}','Damage {__proto__}','Damage {activeDamage.toFixed(2)}','Damage {activeDamage:bogus}','Damage {activeDamage','x'.repeat(801),'Bad\u0000copy'])assert.equal(Settings.valid(field,invalid),false,invalid.slice(0,50));
 assert(Settings.valid(field,'Hit for {activeDamage:percent}.\nCooldown {cooldown}s.'));
 const config={HeroSkills:{skirmisher:{activeDamage:.9,descriptions:{active:'Bad {unknown}'},extension:{keep:true}}}},before=JSON.stringify(config),effective=Settings.effective('skirmisher',config);
 assert.match(Descriptions.render('skirmisher','active',effective),/90%/);assert(!Descriptions.render('skirmisher','active',effective).includes('unknown'));assert.equal(JSON.stringify(config),before);
});

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-skill-descriptions-'));let commits=0;
 t.after(()=>{const absolute=path.resolve(root);assert.equal(path.dirname(absolute),path.resolve(os.tmpdir()));assert(path.basename(absolute).startsWith('hkd-skill-descriptions-'));fs.rmSync(absolute,{recursive:true,force:true});});
 for(const [index,file]of FILES.entries()){const full=path.join(root,file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,JSON.stringify({HeroSkills:{skirmisher:{extension:{keep:index}},future:{untouched:true}},GameTools:{timingDefaults:{keep:3},timings:{keep:4}},other:{mirror:index}},null,2)+'\n');}
 const service=new SkillService(root,{catalogs:{vfx:[],audio:[],projectiles:[]},commit(...args){commits++;return require('../../packages/hkd-characters/lib/asset-transaction').commit(...args);}});
 return{service,bytes:()=>FILES.map(file=>fs.readFileSync(path.join(root,file),'utf8')),request:extra=>({version:service.version,revision:service.revision,...extra}),commits:()=>commits};
}

test('description fields open read-only, save explicitly to both mirrors, and keep a single template across later stat edits',t=>{
 const f=fixture(t),before=f.bytes(),s=f.service;
 for(let i=0;i<3;i++)s.load();assert.equal(s.save(f.request()).result.saved,false);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
 const template='Volley {activeDamage:percent}; cooldown {cooldown}s.';
 s.change(f.request({style:'skirmisher',path:'descriptions.active',value:template}));s.change(f.request({style:'skirmisher',path:'activeDamage',value:1.1}));
 assert.deepEqual(f.bytes(),before);assert.equal(Descriptions.render('skirmisher','active',s.snapshot().effective.skirmisher),'Volley 110%; cooldown 12s.');
 assert.equal(s.save(f.request()).result.saved,true);assert.equal(f.commits(),1);
 s.change(f.request({style:'skirmisher',path:'activeDamage',value:.9}));assert.equal(Descriptions.render('skirmisher','active',s.snapshot().effective.skirmisher),'Volley 90%; cooldown 12s.');
 assert.equal(s.snapshot().effective.skirmisher.descriptions.active,template);s.save(f.request());
 for(const [index,text]of f.bytes().entries()){const data=JSON.parse(text);assert.equal(data.HeroSkills.skirmisher.descriptions.active,template);assert.equal(data.HeroSkills.skirmisher.activeDamage,.9);assert.deepEqual(data.GameTools,JSON.parse(before[index]).GameTools);assert.deepEqual(data.HeroSkills.skirmisher.extension,{keep:index});assert.deepEqual(data.other,{mirror:index});}
 const committed=f.bytes();assert.equal(s.save(f.request()).result.saved,false);assert.deepEqual(f.bytes(),committed);
 s.reset(f.request({style:'skirmisher',path:'descriptions.active'}));assert.equal(s.snapshot().effective.skirmisher.descriptions.active,Settings.defaults('skirmisher').descriptions.active);assert.deepEqual(f.bytes(),committed);
});
