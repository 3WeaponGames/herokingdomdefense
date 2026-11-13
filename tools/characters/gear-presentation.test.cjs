'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Weapons=require('../../assets/_script/HeroWeapons'),Tiers=require('../../assets/_script/EquipmentTiers'),equipment=require('../../assets/KinghtFallConfig/GameJsonCfg.json').EquipCfg;
function looks(){
 let style='fighter';const catalog={version:1,profiles:{},assignments:{}},defaults=require('../../assets/resources/hero-maker/catalog.json'),user={getHeroWeapon:()=>Weapons.find(style),getPersonLevel:slot=>slot===4?7:1},modules={HeroWeapons:Weapons,EquipmentTiers:Tiers,KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}},KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getEquipCfgList:()=>equipment})}}};
 const context={exports:{},require:name=>modules[name],cc:{JsonAsset:function(){},resources:{load(resource,_type,callback){callback(null,{json:resource==='hero-items/catalog'?catalog:defaults});}}}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroItemLooks.js'),'utf8'),context);
 return {api:context.exports,catalog,setStyle(value){style=value;}};
}
test('one-weapon loadouts reserve the other slot using the same main weapon, gray and translucent, while keeping a separate bonus upgrade',()=>{
 const f=looks();for(const style of ['fighter','vanguard','mystic','bruiser']){f.setStyle(style);const primary=f.api.gearImage(4,7,'equipment'),linked=f.api.gearImage(3,1,'equipment'),bonus=f.api.gearImage(3,1,'upgrade');assert.equal(linked.resource,primary.resource);assert.equal(linked.gray,true);assert.equal(linked.opacity,110);assert.equal(primary.gray,false);assert.equal(primary.opacity,255);assert.notEqual(bonus.resource,primary.resource);assert.equal(Weapons.gear(style,3,'upgrade').kind,'bonus');assert(Weapons.gear(style,3,'upgrade').bonus.key);assert(fs.existsSync(path.join(root,'assets/resources/'+bonus.resource+'.png')));}
});
test('bow/arrow and hammer/shield loadouts show two distinct items; switching away from a linked slot restores full opacity',()=>{
 const f=looks();f.api.gearImage(3,1,'equipment');for(const style of ['skirmisher','guardian']){f.setStyle(style);const main=f.api.gearImage(4,7,'equipment'),other=f.api.gearImage(3,1,'equipment');assert.notEqual(main.resource,other.resource);assert.equal(other.gray,false);assert.equal(other.opacity,255);assert.equal(other.resource,f.api.gearImage(3,1,'upgrade').resource);assert.equal(Weapons.gear(style,3,'upgrade').kind,'offhand');}
 assert(f.api.gearImage(3,1,'equipment').resource.includes('/Shield/'));
});
test('a fitted tier supplies the exact chosen icon, while linked equipment follows the primary tier rather than bonus progress',()=>{
 const f=looks(),tier=Tiers.at(equipment.find(row=>row.id===4),7);f.catalog.profiles.weapon={parts:[{sprite:'custom'}],icon:{resource:'test/chosen-sword',width:40,height:80}};f.catalog.assignments[Tiers.key(4,tier.skin,'fighter')]='weapon';f.setStyle('fighter');assert.equal(f.api.gearImage(4,7,'equipment').resource,'test/chosen-sword');assert.equal(f.api.gearImage(3,1,'equipment').resource,'test/chosen-sword');assert(f.api.gearImage(3,1,'upgrade').resource.includes('Fist'));
});

test('a fitted secondary sub-item replaces the linked weapon ghost and bonus placeholder with its own icon',()=>{
 const f=looks();for(const style of ['fighter','vanguard','bruiser']){f.catalog.profiles['mounted-'+style]={parts:[{sprite:'potion',layer:'horse',slot:'Mount/Equipment/Sub_Item/Body'}],icon:{resource:'test/'+style+'-potion',width:68,height:64}};f.catalog.assignments['3:tier:lv1:'+style]='mounted-'+style;f.setStyle(style);for(const area of ['equipment','upgrade']){const icon=f.api.gearImage(3,1,area);assert.equal(icon.resource,'test/'+style+'-potion');assert.equal(icon.gray,false);assert.equal(icon.opacity,255);assert.equal(icon.linked,false);}}
});

test('the visible switch icon sits between the hero and equipment grid and opens the same picker',()=>{
 const user={getHeroWeapon:()=>Weapons.find('fighter'),getHeroWeaponLevel:()=>1},f=require('./hero-picker-harness.cjs').fixture(user),parent=new f.Node('Equipment grid');
 const top=[[0,50],[110,50],[220,50],[0,-60]].map(([x,y])=>Object.assign(new f.Node('Slot'),{x,y,width:104,height:104,parent})),owner={ndItemTop:top,node:f.canvas};
 f.api.installSwitch(owner);assert(owner._weaponSwitch);assert(owner._weaponSwitch.x<top[0].x-top[0].width/2);assert.equal(owner._weaponSwitch.y,-5);f.api.installSwitch(owner);assert.equal(parent.children.length,1,'Cached Gear never adds duplicate switch buttons');f.tap(owner._weaponSwitch);assert(owner._weaponPicker);assert.equal(user.getHeroWeapon().id,'fighter','Opening the switch UI does not equip a different style');f.api.close(owner);
});
