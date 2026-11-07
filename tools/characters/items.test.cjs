'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const {ItemsService}=require('../../packages/hkd-items/service'),root=path.resolve(__dirname,'../..');
test('Items includes all 210 current upgrade tiers across all six hero equipment slots',()=>{
  const service=new ItemsService(root),units=service.units(),source=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
  assert.equal(units.length,210);assert.deepEqual([...new Set(units.map(u=>u.group))],['Cape','Helmet','Arrow','Bow','Gloves','Mount']);
  for(const equip of source.EquipCfg)for(const row of equip.levelInfo){const item=units.find(u=>u.id===equip.id+':'+row.Level);assert(item);assert.equal(item.skin,row.EquipSkin);assert.equal(item.value,row.Parameters);assert.equal(item.cost,row.GoldCost);}
  for(const equip of source.EquipCfg)for(const row of [equip.levelInfo[0],equip.levelInfo[equip.levelInfo.length-1]]){const description=service.describe({type:'item',id:equip.id+':'+row.Level},true);assert(description.layers.some(l=>l.uuid===description.defaultLayer));assert.equal(description.item.level,row.Level);}
});
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-items-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  function write(name,data){const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof data==='string'?data:JSON.stringify(data));}
  write('assets/resources/hero-items/catalog.json',{version:1,unknown:{preserve:7},profiles:{},assignments:{}});
  write('assets/resources/character-parts/catalog.json',{version:1,parts:[{id:'helmet'}]});write('assets/resources/localization/catalog.json',{entries:{}});
  write('assets/KinghtFallConfig/GameJsonCfg.json',{EquipCfg:[{id:2,levelInfo:[{Level:1,EquipName:'Iron helmet',Parameters:10,GoldCost:650,EquipSkin:'lv1'}]}],GameTools:{timingDefaults:{saved:.25},timings:{custom:.2}}});
  const service=new ItemsService(dir);service.describe=()=>({layers:[{uuid:'head',skins:['lv1'],json:{bones:[{name:'root'}],slots:[{name:'hat'}]}}]});return{dir,service,file:service.file,config:path.join(dir,'assets/KinghtFallConfig/GameJsonCfg.json')};
}
test('new items remain drafts until Save and can be explicitly assigned to the matching game equipment tier',t=>{
  const f=fixture(t),before=fs.readFileSync(f.file,'utf8'),config=fs.readFileSync(f.config,'utf8');const data=f.service.snapshot().data;
  data.profiles['royal-helmet']={name:'Royal helmet',base:{type:'item',id:'2:1'},scale:1,parts:[{id:'hat',sprite:'helmet',layer:'head',slot:'hat',bone:'root',x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,order:0,hideSlots:[]}]};data.assignments['2:1']='royal-helmet';
  f.service.change({version:f.service.version,data});assert.equal(fs.readFileSync(f.file,'utf8'),before);const saved=f.service.save({version:f.service.version});assert.deepEqual(saved.result.files,['assets/resources/hero-items/catalog.json']);
  const after=JSON.parse(fs.readFileSync(f.file));assert.equal(after.assignments['2:1'],'royal-helmet');assert.equal(after.profiles['royal-helmet'].parts[0].sprite,'helmet');assert.equal(after.unknown.preserve,7);assert.equal(fs.readFileSync(f.config,'utf8'),config);
  const mtime=fs.statSync(f.file).mtimeMs;assert.equal(f.service.save({version:f.service.version}).result.saved,false);assert.equal(fs.statSync(f.file).mtimeMs,mtime);
});
test('item editor browsing and revision conflicts preserve both equipment data and external edits',t=>{
  const f=fixture(t),before=fs.readFileSync(f.file,'utf8');f.service.load();f.service.units();assert.equal(fs.existsSync(path.join(f.dir,'local')),false);assert.equal(fs.readFileSync(f.file,'utf8'),before);
  const draft=f.service.snapshot().data;draft.unknown.preserve=8;f.service.change({version:f.service.version,data:draft});const external=JSON.parse(before);external.unknown.preserve=99;fs.writeFileSync(f.file,JSON.stringify(external));assert.throws(()=>f.service.save({version:f.service.version}),/outside this draft/);assert.equal(JSON.parse(fs.readFileSync(f.file)).unknown.preserve,99);
});
test('editing an item automatically assigns its tier in the draft without a separate activation switch',t=>{
  const f=fixture(t),before=fs.readFileSync(f.file,'utf8'),draft=f.service.snapshot().data;
  draft.profiles.helmet={name:'Edited helmet',base:{type:'item',id:'2:1'},parts:[]};f.service.change({version:f.service.version,data:draft});
  assert.equal(f.service.data.assignments['2:1'],'helmet');assert.equal(fs.readFileSync(f.file,'utf8'),before);f.service.save({version:f.service.version});assert.equal(JSON.parse(fs.readFileSync(f.file)).assignments['2:1'],'helmet');
});
test('runtime item lookup retains original defaults and combines gear without changing balance or source outfits',()=>{
  const context={exports:{},cc:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroItemLooks.js'),'utf8'),context);const api=context.exports;
  const original={scale:1,parts:[{id:'helmet-old',layer:'head',slot:'hat'},{id:'cape',layer:'cape',slot:'cloth'}],skins:{head:'lv1'}};
  const item={base:{type:'item',id:'2:3'},parts:[{id:'helmet-new',layer:'head',slot:'hat'}],skins:{head:'lv3'}};
  assert.equal(api.current(original),original);assert.equal(api.resolve(null,{}).length,0);
  const data={profiles:{new:item},assignments:{'2:3':'new'}};assert.equal(api.resolve(data,{2:2}).length,0);assert.equal(api.resolve(data,{2:3})[0],item);
  const merged=api.merge(original,[item]);assert.equal(merged.parts.length,2);assert.equal(merged.parts.find(p=>p.layer==='head').id,'helmet-new');assert.equal(merged.skins.head,'lv3');assert.equal(original.parts[0].id,'helmet-old');assert.equal(original.skins.head,'lv1');
});
