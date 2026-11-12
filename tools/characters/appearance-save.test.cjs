'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Units=require('../../packages/game-data-editor/lib/unit-assets'),{Service}=require('../../packages/hkd-characters/lib/service'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-hero-native-save-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const write=(file,value)=>{fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),JSON.stringify(value));};
 const item=structuredClone(require('./fixtures/hero-item.json')),assets=require('../../assets/resources/character-parts/catalog.json').parts,part={...item.parts[0],id:'charm',sprite:assets.find(a=>a.category==='Chest').id,slot:'Rider/Body/Head/Hair',bone:'Rider/Body/Head',tint:'#80c0ff'};
 write('assets/resources/characters/catalog.json',{version:1,profiles:{hero:{name:'Hero',base:{type:'hero',id:'hero'},parts:[part]}},assignments:{'hero:hero:default':'hero'},unknown:{preserve:7}});
 write('assets/resources/hero-items/catalog.json',{version:1,profiles:{helmet:item},assignments:{'2:10':'helmet'},unknown:true});write('assets/KinghtFallEnemyAni/ndPlay.prefab',[]);
 write('assets/KinghtFallConfig/GameJsonCfg.json',{EquipCfg:require('../../assets/KinghtFallConfig/GameJsonCfg.json').EquipCfg});
 for(const id of [part.sprite,item.parts[0].sprite]){const asset=assets.find(a=>a.id===id),file=path.join(dir,asset.image);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(root,asset.image),file);}
 const describe=Units.describe;Units.describe=(_root,request)=>describe(root,request);t.after(()=>{Units.describe=describe;Units.invalidate();});
 const service=new Service(dir);service.assets=()=>({parts:assets});service.units=()=>[{type:'hero',id:'hero',key:'hero:hero:default'}];return{dir,service,itemFile:path.join(dir,'assets/resources/hero-items/catalog.json')};
}
test('explicit character Save bakes native hero parts and rebakes equipped item layers with the saved hero, atomically; unchanged Save writes nothing',t=>{
 const {dir,service,itemFile}=fixture(t),before=service.snapshot().data;before.profiles.hero.parts[0].tint='#40c080';service.change({version:service.version,data:before});const saved=service.save({version:service.version});
 const layer=Object.values(saved.data.profiles.hero.bakedLayers)[0],rig=JSON.parse(fs.readFileSync(path.join(dir,'assets/resources',layer.resource+'.json')));assert.equal(rig.skins[0].attachments['Rider/Body/Head/Hair'].item_charm.color,'40c080ff');
 const items=JSON.parse(fs.readFileSync(itemFile)),gear=items.profiles.helmet;assert(gear.bakedWithHero);assert(items.unknown);const combined=JSON.parse(fs.readFileSync(path.join(dir,'assets/resources',Object.values(gear.bakedLayers)[0].resource+'.json')));assert.equal(combined.skins[0].attachments['Rider/Body/Head/Hair'].item_base_charm.color,'40c080ff');assert.equal(Object.keys(combined.skins[0].attachments['Rider/Body/Head/Helmet']).length,1);
 const bytes=fs.readFileSync(itemFile),stamp=fs.statSync(itemFile).mtimeMs;assert.equal(service.save({version:service.version}).result.saved,false);assert.deepEqual(fs.readFileSync(itemFile),bytes);assert.equal(fs.statSync(itemFile).mtimeMs,stamp);assert.equal(saved.data.unknown.preserve,7);
});
test('concurrent item edits block a character save without losing either draft or writing partial derived assets',t=>{
 const {service,itemFile}=fixture(t),data=service.snapshot().data;data.profiles.hero.parts[0].tint='#40c080';service.change({version:service.version,data});const commit=Tx.commit;
 Tx.commit=(root,files,reads,primary)=>{fs.writeFileSync(itemFile,JSON.stringify({version:1,profiles:{},assignments:{},concurrent:true}));return commit(root,files,reads,primary);};t.after(()=>{Tx.commit=commit;});
 assert.throws(()=>service.save({version:service.version}),/Another editor changed/);assert(service.snapshot().dirty);assert.equal(service.snapshot().data.profiles.hero.parts[0].tint,'#40c080');assert(JSON.parse(fs.readFileSync(itemFile)).concurrent);assert(!service.snapshot().data.profiles.hero.bakedLayers);
});
