'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('path'),os=require('os');
const {Service,fingerprint}=require('../worlds/service'),L=require('../worlds/legacy'),M=require('../worlds/model'),Kit=require('../../../assets/_script/WallKit');
const root=path.resolve(__dirname,'../../..');

test('all four gate faces export their previewed model and collision transforms on a new map',()=>{
 const service=new Service(root,{artifacts:path.join(os.tmpdir(),'hkd-building-palette-read-only')}),P=require('../worlds/prefab'),Maps=require('../lib/map-assets'),Navigation=require('../worlds/navigation'),source=service.source('Map01');
 for(const variant of service.buildingPlacements().find(c=>c.name==='Wall / Gate').variants){
  const building=Object.assign(M.clone(variant.placement),{id:42,x:175,y:-260,scale:.85,angle:0,enabled:true,unlock:1}),stage={id:'A-99',variant:'A',buildings:[building],specials:[],hero:{x:0,y:0},spawns:[],graphs:[]},map=M.createMap('new-map','New map','forest');
  const exported=P.compose(root,map,stage,{ground:[],assets:{}},{Map01:source}),model=Maps.model(exported),owner=model.owners.find(n=>n.kind==='building'),component=exported[owner.ownerComponent],config=service.index().documents.A;
  assert.equal(component.ID,42);assert(Math.abs(owner.position.x-building.x)<1e-8&&Math.abs(owner.position.y-building.y)<1e-8);
  // The exported source already contains the placement transform. Inspect it
  // at its owner origin with unit scale, as gameplay consumes the prefab.
  const actual=Navigation.buildingPolygons({source:()=>exported},stage,Object.assign({},building,{scale:1,angle:0,template:{prefab:'exported',node:owner.id,roots:Maps.moveObjectEdits(exported,owner.id,owner.position).map(e=>e.path[0])}}),1,'closed',config,new Map()),expected=variant.preview.levels[1].blockers.map(shape=>shape.map(p=>M.toWorld(building,p)));
  assert.equal(actual.length,expected.length);actual.forEach((shape,i)=>shape.forEach((p,j)=>{assert(Math.abs(p.x-expected[i][j].x)<1e-7&&Math.abs(p.y-expected[i][j].y)<1e-7,'saved gate fixtures match the cursor preview');}));
  const main=exported[component.ndAniMain.__id__],mainNode=model.byId[main.node.__id__],sourceMain=variant.preview.levels[1].skeletons.find(s=>!s.ground);assert.equal(Math.sign(mainNode.world[0]),Math.sign(sourceMain.matrix[0]));
 }
});

test('building placement cards keep six simple names with four compass gate facings and no helper data in placements',()=>{
 const service=new Service(root,{artifacts:path.join(os.tmpdir(),'hkd-building-palette-read-only')}),catalog=service.buildingCatalog();
 const source=L.adaptStage(root,'A',1,Object.assign({},service.index().documents.A.LevelCfg[0],{prefab:'Map01'})),cards=service.buildingPlacements();
 assert.deepEqual(cards.map(c=>c.name),['Main Hall','Archer Tower','Barracks','House','Mill','Wall / Gate']);
 assert.deepEqual(cards.map(c=>c.catalogId),catalog.map(c=>c.catalogId));
 assert.deepEqual(cards.map(c=>c.variants.length),[1,1,1,1,1,4]);
 assert.deepEqual(cards[5].variants.map(v=>v.label),['Northeast ↗','Northwest ↖','Southeast ↘','Southwest ↙']);
 assert.deepEqual(cards[5].variants.map(v=>v.placement.id),[19,19,19,19]);
 for(let i=0;i<cards.length;i++)for(const variant of cards[i].variants){
  assert(!/level|Map\d|\d/.test(cards[i].name+variant.label));
  const original=i===5?source.buildings.find(b=>b.id===variant.placement.id):catalog[i],expected=M.clone(original);delete expected.catalogId;expected.name=cards[i].name;const settings=require('../../../assets/_script/BuildingPurchaseField').resolve(service.index().documents.A.BuildEnum[original.kind],service.index().documents.A.BuildEnum[original.kind].levelList[0],variant.id)||{southwest:false,x:0,y:0};expected.purchaseSide=settings.southwest?'flip':'default';expected.purchaseOffset={x:settings.x,y:settings.y};if(i===5){expected.wallFacing=variant.id;expected.wallRotation=0;expected.wallRun=Kit.nativeRun({nativeVersion:2,left:1,right:1,gate:true,start:'post',end:'post'});expected.purchaseSide=variant.placement.purchaseSide;expected.purchaseOffset=M.clone(variant.placement.purchaseOffset);}
  assert.deepEqual(variant.placement,expected,'template, sprite records, identifiers and upgrade roots remain the complete authored family');
  assert(!('preview' in variant.placement)&&!('variants' in variant.placement)&&!('catalogId' in variant.placement));
  assert.deepEqual(Object.keys(variant.preview).sort(),['errors','images','levels','runtimePath']);
  assert.deepEqual(variant.preview.errors,[]);assert.deepEqual(Object.keys(variant.preview.levels),['1','2','3','4'],'Preview keys are hall unlock states; walls still use their three authored skins');
  assert(variant.preview.levels[1].sprites.length&&variant.preview.levels[1].blockers.length&&variant.preview.levels[1].step.length);
 }
 for(const variant of cards[5].variants){const level=variant.preview.levels[1],mirrored=['NW','SE'].includes(variant.id);assert(level.skeletons.every(s=>mirrored?s.matrix[0]<0:s.matrix[0]>0));assert.equal(level.skeletons.length,6);const center=level.purchaseField.center;const settings=require('../../../assets/_script/BuildingPurchaseField').resolve(service.index().documents.A.BuildEnum[6],service.index().documents.A.BuildEnum[6].levelList[0],variant.id)||{southwest:false,x:0,y:0};assert.equal(variant.placement.purchaseSide,settings.southwest?'flip':'default','New facings honor the saved side and offsets');assert(Number.isFinite(center.x)&&Number.isFinite(center.y));}
});

test('browsing building variants leaves sources, config, catalog placements and drafts unchanged',()=>{
 const service=new Service(root,{artifacts:path.join(os.tmpdir(),'hkd-building-palette-read-only')}),catalog=service.buildingCatalog(),index=service.index();
 const files=index.maps.filter(m=>m.path).map(m=>'assets/KinghtFallIconMap/'+m.id+'.prefab').concat(['A','B','D'].map(L.configFile)),before=Object.fromEntries(files.map(file=>[file,fingerprint(path.join(root,file))]));
 const catalogBefore=JSON.stringify(catalog),configBefore=JSON.stringify(index.documents),version=service.version,cards=service.buildingPlacements();
 assert.deepEqual(Object.fromEntries(files.map(file=>[file,fingerprint(path.join(root,file))])),before);
 assert.equal(JSON.stringify(catalog),catalogBefore);assert.equal(JSON.stringify(index.documents),configBefore);assert.equal(service.version,version);assert.deepEqual(service.docs,{});assert.equal(service.undo.length,0);
 cards[0].variants[0].placement.x+=100;cards[0].variants[0].placement.template.roots.push(-1);
 assert.equal(JSON.stringify(catalog),catalogBefore,'placement records are detached from the cached source catalog');
});

test('new gate assets start with one complete native wall on either side and remain editable',()=>{
 const service=new Service(root,{artifacts:path.join(os.tmpdir(),'hkd-building-palette-read-only')}),Editor=require('../worlds/wall-layout-editor');
 for(const variant of service.buildingPlacements().find(c=>c.name==='Wall / Gate').variants){
  const run=variant.placement.wallRun,before=M.clone(run);assert.equal(run.nativeVersion,2);assert.equal(run.left,1);assert.equal(run.right,1);assert.equal(run.gate,true);assert.equal(variant.placement.wallRotation,0);
  for(const level of Object.values(variant.preview.levels)){const main=level.skeletons.find(s=>s.json.wallKit);assert.equal(main.json.wallKit.layout.leftCount,1);assert.equal(main.json.wallKit.layout.rightCount,1);assert.equal(Kit.posts(main.json.wallKit.layout).length,4);}
  const extended=Editor.extend(run,'right',{u:1,v:0},2);assert.equal(extended.right,3);assert.equal(extended.left,1);assert.equal(Editor.count(extended,'right',0).right,0);assert.deepEqual(run,before);
 }
});
