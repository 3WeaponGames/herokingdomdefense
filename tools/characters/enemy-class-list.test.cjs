'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture}=require('./client-harness.cjs');
const Packs=require('../../packages/hkd-characters/lib/unit-packs');
const Catalog=require('../../packages/hkd-characters/lib/character-catalog');
const {Service}=require('../../packages/hkd-characters/lib/service');
const enemy=(id,name,enemyClass,appearance)=>({type:'enemy',id:String(id),key:'enemy:'+id+':default',name,group:'Enemies',enemyClass,sourcePack:appearance&&appearance.split('/')[0]||'monster1',...(appearance?{appearance}:{})});
const units=[
 {type:'ally',id:'90001',key:'ally:90001:default',name:'Guard',group:'Allies',levels:[1,2,3]},
 {type:'ally',id:'90002',key:'ally:90002:default',name:'Infantry',group:'Allies',levels:[1,2,3]},
 enemy(91001,'Zebra','normal','monster1/shared'),enemy(91002,'Archer','elite','monster1/shared'),enemy(91003,'Behemoth','boss','monster1/boss'),enemy(91004,'Ant','normal','monster2/ant')
];
const rows=f=>f.host.querySelector('.look-list').querySelectorAll('button').map(button=>button.textContent);

test('character class filters operate before shared-model grouping and combine with package/group filters without writing drafts',async t=>{
 const f=fixture({units});t.after(()=>f.close());await f.settle();
 const filter=f.byLabel('Enemy class'),group=f.byLabel('Character group'),pack=f.byLabel('Character package');
 assert.deepEqual(filter.options.map(option=>[option.value,option.textContent]),[['','All enemy classes'],['normal','Normal'],['elite','Elite'],['boss','Boss']]);
 assert(rows(f).includes('Enemy · Normal · Zebra'));assert(rows(f).includes('Enemy · Boss · Behemoth'));
 filter.value='elite';filter.onchange();assert.deepEqual(rows(f),['Enemy · Elite · Archer'],'shared normal appearance cannot hide an elite record');
 await f.button('Enemy · Elite · Archer').click();await f.settle();assert.equal(f.byLabel('Character name').value,'Archer');
 filter.value='normal';filter.onchange();assert.deepEqual(rows(f),['Enemy · Normal · Ant','Enemy · Normal · Zebra']);
 pack.value='monster1';pack.onchange();assert.deepEqual(rows(f),['Enemy · Normal · Zebra']);
 group.value='Allies';group.onchange();assert.deepEqual(rows(f),[]);assert(f.host.querySelector('.empty').textContent.includes('No characters'));
 group.value='';filter.value='boss';filter.onchange();assert.deepEqual(rows(f),['Enemy · Boss · Behemoth']);
 await f.client.focusUnit({type:'ally',id:'90001'});await f.settle();assert.equal(filter.value,'');assert.equal(pack.value,'');assert.equal(group.value,'');assert(rows(f).includes('Allies · Guard'));
 assert.deepEqual(f.snapshot().data,f.initial);assert.equal(f.calls.changes.length,0);assert.equal(f.calls.saves,0);assert.equal(f.client.getState().dirty,false);
});

test('class sorting follows Normal/Elite/Boss in either direction and created enemies retain their base classification',async t=>{
 const initial={version:1,profiles:{guard:{name:'Guard',base:{type:'ally',id:'90001'},parts:[]},custom:{name:'Custom Archer',base:{type:'enemy',id:'91002'},parts:[]}},assignments:{'ally:90001:default':'guard'},characters:{custom:{levels:{}}}};
 const f=fixture({units,initial});t.after(()=>f.close());await f.settle();
 const sort=f.byLabel('Sort characters');sort.value='enemy-class';sort.onchange();
 assert.deepEqual(rows(f).filter(row=>row.includes('Enemy ·')),['Enemy · Normal · Ant','Enemy · Normal · Zebra','Created · Enemy · Elite · Custom Archer','Enemy · Boss · Behemoth']);
 sort.value='enemy-class-desc';sort.onchange();assert.deepEqual(rows(f).filter(row=>row.includes('Enemy ·')),['Enemy · Boss · Behemoth','Created · Enemy · Elite · Custom Archer','Enemy · Normal · Ant','Enemy · Normal · Zebra']);
 const filter=f.byLabel('Enemy class');filter.value='elite';filter.onchange();assert.deepEqual(rows(f),['Enemy · Elite · Archer','Created · Enemy · Elite · Custom Archer']);
 assert.deepEqual(f.snapshot().data,initial);assert.equal(f.calls.changes.length,0);assert.equal(f.calls.saves,0);
});

test('default character grouping and publication retain every appearance member while class-scoped browsing is read-only',()=>{
 const data={profiles:{},assignments:{}};const before=structuredClone(data);
 const all=Catalog.listed(data,units);assert.equal(all.find(unit=>unit.id==='91001').members.length,2);
 const elite=Catalog.listed(data,units,{enemyClass:'elite'});assert.deepEqual(elite.map(unit=>unit.id),['91002']);
 assert.equal(elite[0].members.length,1);assert.deepEqual(data,before);
 assert.equal(Packs.enemyClass({type:'enemy',id:'90010'}),'boss');assert.equal(Packs.enemyClass({type:'enemy',id:'91001',sourcePack:'fantasy-bosses'}),'normal','model package does not invent an enemy class');
});

test('character service exposes saved and inherited classes without creating defaults or changing gameplay files',t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-character-classes-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const cfg={SoldierCfg:{90010:{ID:90010,Name:'Legacy boss'},91001:{ID:91001,Name:'Elite'},91002:{ID:91002,Name:'Inherited'},91003:{ID:91003,Name:'Normal'}},GameTools:{enemyClasses:{'enemy:91001:default':'elite'},unitProfiles:{entries:{91002:{baseId:91001}}}}};
 const files={'assets/KinghtFallConfig/GameJsonCfg.json':JSON.stringify(cfg),'assets/resources/localization/catalog.json':JSON.stringify({entries:{}})};
 for(const [relative,bytes]of Object.entries(files)){const file=path.join(folder,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
 const service=Object.create(Service.prototype);service.root=folder;service.original={profiles:{},assignments:{}};
 const listed=service.units();assert.equal(listed.find(unit=>unit.id==='90010').enemyClass,'boss');assert.equal(listed.find(unit=>unit.id==='91001').enemyClass,'elite');assert.equal(listed.find(unit=>unit.id==='91002').enemyClass,'elite');assert.equal(listed.find(unit=>unit.id==='91003').enemyClass,'normal');assert.equal(listed[0].enemyClass,undefined);
 for(const [relative,bytes]of Object.entries(files))assert.equal(fs.readFileSync(path.join(folder,relative),'utf8'),bytes);
});
