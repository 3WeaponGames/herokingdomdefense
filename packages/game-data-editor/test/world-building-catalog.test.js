'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('path'),os=require('os');
const {Service,fingerprint}=require('../worlds/service'),L=require('../worlds/legacy');
const root=path.resolve(__dirname,'../../..');

test('stage building palette exposes six building names without level suffixes, map slots or special offers',()=>{
 const service=new Service(root,{artifacts:path.join(os.tmpdir(),'hkd-building-catalog-read-only')}),index=service.index();
 const files=index.maps.filter(m=>m.path).map(m=>'assets/KinghtFallIconMap/'+m.id+'.prefab').concat(['A','B','D'].map(L.configFile));
 const before=Object.fromEntries(files.map(file=>[file,fingerprint(path.join(root,file))]));
 const catalog=service.buildingCatalog();
 assert.deepEqual(catalog.map(b=>b.kind),[1,2,3,4,5,6]);
 assert.deepEqual(catalog.map(b=>b.name),['Main Hall','Archer Tower','Barracks','House','Mill','Wall / Gate']);
 assert(catalog.every(b=>!b.special&&!/Map\d|offer|level/i.test(b.name)));
 assert.equal(new Set(catalog.map(b=>b.catalogId)).size,6);
 assert.equal(service.buildingCatalog(),catalog,'unchanged catalogs reuse the same read-only cache');
 assert.deepEqual(service.docs,{},'browsing the palette does not open or edit a stage draft');
 assert.deepEqual(Object.fromEntries(files.map(file=>[file,fingerprint(path.join(root,file))])),before,'opening the palette cannot rewrite authored data');
});

test('palette deduplication preserves the canonical authored template, building ID and upgrade family',()=>{
 const service=new Service(root,{artifacts:path.join(os.tmpdir(),'hkd-building-catalog-read-only')}),index=service.index(),first=index.maps.find(m=>m.path);
 const source=L.adaptStage(root,'A',1,Object.assign({},index.documents.A.LevelCfg[0],{prefab:first.id}));
 for(const item of service.buildingCatalog()){
  const original=source.buildings.find(b=>b.kind===item.kind),expected=Object.assign(JSON.parse(JSON.stringify(original)),{catalogId:first.id+'-'+original.id,name:item.name});
  assert.deepEqual(item,expected,'only the display name and palette key may differ from the original placement family');
  assert(item.template.roots.length>1,'the complete family must retain build steps and upgrade references');
 }
});
