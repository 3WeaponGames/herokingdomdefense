'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const {ItemsService}=require('../../packages/hkd-items/service'),root=path.resolve(__dirname,'../..');
const Tiers=require('../../assets/_script/EquipmentTiers');
test('Items groups upgrade levels into visual tiers and includes every weapon style below shared items',()=>{
  const service=new ItemsService(root),units=service.units(),source=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
  const Tiers=require('../../assets/_script/EquipmentTiers'),total=source.EquipCfg.reduce((sum,equip)=>sum+Tiers.tiers(equip).length*([3,4].includes(equip.id)?6:1),0);assert.equal(units.length,total);assert.deepEqual([...new Set(units.map(u=>u.slot))],[1,2,5,6,3,4]);assert(units.every(unit=>/^Tier \d+$/.test(unit.name)));
  for(const style of require('../../assets/_script/HeroWeapons').styles)for(const slot of [3,4])assert(units.some(unit=>unit.slot===slot&&unit.style===style.id));
  for(const equip of source.EquipCfg)for(const row of equip.levelInfo){const item=units.find(u=>u.slot===equip.id&&u.skin===row.EquipSkin);assert(item);assert(item.legacyKeys.includes(equip.id+':'+row.Level));}
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

test('tier appearances cover all upgrades in that skin, isolate weapon styles and retain old per-level looks',()=>{
  const equipment=require('../../assets/KinghtFallConfig/GameJsonCfg.json').EquipCfg;
  const data={profiles:{tier:{parts:[{sprite:'new-hat'}]},old:{parts:[]},sword:{parts:[]}},assignments:{'2:tier:lv3':'tier','2:24':'old','4:tier:lv2:fighter':'sword'}};
  for(let level=21;level<=30;level++)assert.equal(Tiers.profileId(data,equipment,2,level),'tier');
  assert.equal(Tiers.profileId(data,equipment,2,20),undefined);assert.equal(Tiers.profileId(data,equipment,4,7,'fighter'),'sword');assert.equal(Tiers.profileId(data,equipment,4,7,'guardian'),undefined);
  const before=JSON.stringify(data);delete data.assignments['2:tier:lv3'];assert.equal(Tiers.profileId(data,equipment,2,24),'old');assert.equal(Tiers.profileId(data,equipment,2,25),undefined);data.assignments['2:tier:lv3']='tier';assert.deepEqual(data,JSON.parse(before));
  assert.equal(Tiers.label(equipment[1],25),'Tier 3 · Level 5');assert.equal(Tiers.label(equipment[1],45),'Tier 4 · Level 15');
  assert.equal(Tiers.target(equipment,'2:25').level,25);assert.equal(Tiers.target(equipment,'2:tier:lv3').level,21);
  assert.equal(Tiers.icon(data,{},equipment,2,25).id,'new-hat');
});

test('explicit tier edits save once without rewriting legacy looks, gameplay levels, costs or approved timing tables',t=>{
  const f=fixture(t),config=JSON.parse(fs.readFileSync(f.config));config.EquipCfg[0].levelInfo.push({...config.EquipCfg[0].levelInfo[0],Level:2});fs.writeFileSync(f.config,JSON.stringify(config));
  const beforeConfig=fs.readFileSync(f.config,'utf8'),draft=f.service.snapshot().data;
  draft.profiles.old={name:'Old',base:{type:'item',id:'2:2'},parts:[]};draft.assignments['2:2']='old';draft.profiles.tier={name:'New tier',base:{type:'item',id:'2:tier:lv1'},parts:[]};
  f.service.change({version:f.service.version,data:draft});assert.equal(f.service.data.assignments['2:tier:lv1'],'tier');assert.equal(f.service.data.assignments['2:2'],'old');
  f.service.save({version:f.service.version});assert.equal(fs.readFileSync(f.config,'utf8'),beforeConfig);const bytes=fs.readFileSync(f.file,'utf8');assert.equal(f.service.save({version:f.service.version}).result.saved,false);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
});

test('current fitted parts match the actual hero tier, including cape fit and Guardian hammer and shield',()=>{
  const service=new ItemsService(root),before=JSON.stringify(service.snapshot()),armor=service.describe({type:'item',id:'1:tier:lv1'},true),helmet=service.describe({type:'item',id:'2:tier:lv1'},true),guardian=service.describe({type:'item',id:'4:tier:lv1:guardian'},true),mount=service.describe({type:'item',id:'6:tier:lv1'},true);
  assert.deepEqual(armor.currentItem.parts.map(part=>part.id),['chest','cape']);assert.equal(armor.currentItem.parts[1].scaleX,.68);assert.equal(armor.currentItem.parts[1].x,9.5);
  assert.equal(helmet.currentItem.parts[0].sprite,'character-maker/Extenstions/Parts Pack Base/Parts/Helmet/FA_Helmet_003_Wood');assert.deepEqual(guardian.currentItem.parts.map(part=>part.id),['blunt']);assert.deepEqual(service.describe({type:'item',id:'3:tier:lv1:guardian'},true).currentItem.parts.map(part=>part.id),['shield']);assert.equal(mount.itemModel.asset,'original-mount/hero-horse/lv1');
  assert.equal(JSON.stringify(service.snapshot()),before,'Browsing current gear does not stage or save a design');
});

test('gear icons use original proportions and the same visible size budget in slots and scaled upgrade cards',()=>{
  const context={exports:{},cc:{Sprite:{SizeMode:{CUSTOM:0},Type:{SIMPLE:0}}}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/EquipmentIconFit.js'),'utf8'),context);
  for(const [width,height]of [[120,108],[76,68],[86,34],[84,89],[113,75]])for(const [scaleX,scaleY]of [[1,1],[.8,1.1],[1.4,.7]]){
    const parent={width:100,height:100,scaleX,scaleY},node={parent,scaleX:2,scaleY:3,setContentSize(w,h){this.width=w;this.height=h;}},frame={getOriginalSize:()=>({width,height})},sprite={node};context.exports.apply(sprite,frame);
    assert(Math.abs(node.width*scaleX/(node.height*scaleY)-width/height)<1e-10);assert(Math.abs(Math.max(node.width*scaleX,node.height*scaleY)-74*Math.min(scaleX,scaleY))<1e-10);assert.equal(node.scaleX,1);assert.equal(node.scaleY,1);assert.equal(sprite.trim,false);
  }
});
