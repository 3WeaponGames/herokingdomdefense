'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Units=require('../../packages/game-data-editor/lib/unit-assets'),{Service}=require('../../packages/hkd-characters/lib/service'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
const {ItemsService}=require('../../packages/hkd-items/service');
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
test('an open Items draft can save after Characters saves new baked hero layers into its catalog',t=>{
 const {dir,service,itemFile}=fixture(t),items=new ItemsService(dir);
 items.assets=()=>service.assets();
 items.units=()=>[{type:'item',id:'2:1',key:'2:1'}];
 items.describe=()=>Units.describe(dir,{type:'hero',id:'hero',heroLevels:{2:1},noRuntime:true,noAppearance:true});
 const draft=items.snapshot().data;draft.profiles.helmet.parts[0].tint='#ffffff';
 items.change({version:items.version,data:draft});
 const hero=service.snapshot().data;hero.profiles.hero.parts[0].tint='#40c080';
 service.change({version:service.version,data:hero});service.save({version:service.version});
 const latest=JSON.parse(fs.readFileSync(itemFile)),before=items.snapshot();
 assert.equal(before.dirty,true);assert(latest.profiles.helmet.bakedWithHero);
 const after=items.save({version:before.version});
 assert.equal(after.result.saved,true);assert.equal(after.dirty,false);
 const saved=JSON.parse(fs.readFileSync(itemFile)),gear=saved.profiles.helmet;
 assert.equal(gear.parts[0].tint,'#ffffff');assert.equal(saved.unknown,true);
 const combined=JSON.parse(fs.readFileSync(path.join(dir,'assets/resources',Object.values(gear.bakedLayers)[0].resource+'.json')));
 assert.equal(combined.skins[0].attachments['Rider/Body/Head/Hair'].item_base_charm.color,'40c080ff');
});

test('saving the Royal Advisor publishes the edited helmet and staff to the shared game portrait',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-advisor-save-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const Library=require('../../packages/hkd-characters/lib/unit-library');
 const Bake=require('../../packages/hkd-characters/lib/native-bake'),PNG=require('../../packages/hkd-characters/lib/png-atlas');
 const id='character-retired-king',portrait='assets/resources/characters/retired-king-portrait',catalogFile='assets/resources/characters/catalog.json';
 const profile=require('../../assets/resources/characters/catalog.json').profiles[id];
 const library=Library.load(root),parts=require('../../assets/resources/character-parts/catalog.json').parts;
 const helmet=library.parts.find(part=>part.id.includes('/Helmet/FA_Helmet_')&&part.id!==profile.parts.find(p=>p.id==='helmet').sprite);
 const staff=parts.find(part=>part.id.startsWith('HandRight/Staff/')&&part.id!==profile.parts.find(p=>p.id==='staff').sprite);
 const assets=new Map(parts.concat(library.parts).map(part=>[part.id,part]));
 const source=Library.describe(root,profile.base.source,true);
 function write(file,bytes){
  const target=path.join(dir,file);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
 }
 const sourceFiles=[
  'assets/resources/unit-library/character-maker/catalog.json','assets/resources/character-parts/catalog.json',
  source.source,source.source.replace(/\.json$/,'.atlas'),
  ...Object.values(source.layers[0].pages).map(url=>path.relative(root,require('node:url').fileURLToPath(url))),
  ...profile.parts.map(part=>assets.get(part.sprite).image),helmet.image,staff.image,
  ...['.json','.json.meta','.atlas','.atlas.meta','.png','.png.meta'].map(extension=>portrait+extension)
 ];
 for(const file of new Set(sourceFiles))write(file,fs.readFileSync(path.join(root,file)));
 write(catalogFile,JSON.stringify({version:1,profiles:{[id]:profile},assignments:{},characters:{[id]:{levels:{}}},unknown:true}));
 const service=new Service(dir);
 service.units=()=>[{type:'ally',id:'90001',key:'ally:90001:default',name:'Guard'}];
 const read=extension=>fs.readFileSync(path.join(dir,portrait+extension));
 const before=read('.png'),beforeRig=read('.json'),beforeUUID=JSON.parse(read('.json.meta')).uuid;
 const draft=service.snapshot().data;
 draft.profiles[id].parts.find(part=>part.id==='helmet').sprite=helmet.id;
 draft.profiles[id].parts.find(part=>part.id==='staff').sprite=staff.id;
 service.change({version:service.version,data:draft});
 assert.deepEqual(read('.png'),before);assert.deepEqual(read('.json'),beforeRig);
 const result=service.save({version:service.version});
 assert(result.result.files.includes(portrait+'.png'));assert(result.result.files.includes(catalogFile));
 assert.equal(JSON.parse(read('.json.meta')).uuid,beforeUUID,'Existing prefab references must resolve the rebaked portrait');
 assert.equal(result.data.unknown,true);
 const rig=JSON.parse(read('.json')),atlas=read('.atlas').toString('utf8');
 const pages=Object.fromEntries(atlas.split(/\r?\n/).filter(line=>line.endsWith('.png')).map(name=>[name,require('node:url').pathToFileURL(path.join(dir,path.dirname(portrait),name)).href]));
 const image=Bake.readAtlas({atlas,pages},fs.readFileSync);
 assert.deepEqual(Object.keys(rig.animations),['idle']);
 assert.deepEqual(image('part_helmet'),PNG.decode(fs.readFileSync(path.join(root,helmet.image))));
 assert.deepEqual(image('part_staff'),PNG.decode(fs.readFileSync(path.join(root,staff.image))));
 assert.equal(service.save({version:service.version}).result.saved,false);
});
