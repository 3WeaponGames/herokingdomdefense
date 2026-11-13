'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),temporary=require('./owned-temp');
const Gate=require('../worlds/gate-facing'),Preview=require('../worlds/building-preview'),L=require('../worlds/legacy'),M=require('../worlds/model'),Maps=require('../lib/map-assets'),P=require('../worlds/prefab');
const root=path.resolve(__dirname,'../../..');
function fixture(){const source=L.inspect(root,'Map01'),config=L.read(root,L.configFile('A')),stage=L.adaptStage(root,'A',1,Object.assign(M.clone(config.LevelCfg[0]),{prefab:'Map01'})),building=stage.buildings.find(b=>b.kind===6);assert(building,'The gate must come from the same Map01 prefab as the inspected source');building.enabled=true;building.unlock=1;stage.buildings=[building];stage.specials=[];const index={documents:{A:config}};return {source,config,stage,building,service:{root,source:()=>source.data,index:()=>index}};}
function controller(source,building){const info=Maps.model(source),owner=info.byId[building.template.node];return source[owner.ownerComponent];}
test('opening choices project detached source metadata without seeding defaults or altering closed geometry',()=>{
 const f=fixture(),bytes=JSON.stringify(f.source.data),before=JSON.stringify(f.building);assert(!Object.prototype.hasOwnProperty.call(f.building,'wallOpening'));assert.strictEqual(Gate.project(f.source.data,f.building),f.source.data);
 for(const face of ['NE','NW','SE','SW']){
  const b=Object.assign({},f.building,{wallFacing:face}),base=Gate.project(f.source.data,b),geometry=Maps.model(base);
  for(const opening of ['inward','outward']){const value=Object.assign({},b,{wallOpening:opening}),projected=Gate.project(f.source.data,value),changed=Maps.model(projected);assert.equal(controller(projected,b).wallOpening,opening);assert.strictEqual(Gate.project(projected,value),projected);assert.deepEqual(changed.nodes.map(n=>n.world),geometry.nodes.map(n=>n.world));assert.deepEqual(changed.colliders.map(c=>c.points),geometry.colliders.map(c=>c.points));}
 }
 assert.equal(JSON.stringify(f.source.data),bytes);assert.equal(JSON.stringify(f.building),before);
});
test('optional direction validates disabled and enabled wall records without normalizing legacy content',()=>{
 const f=fixture(),before=JSON.stringify(f.stage);for(const opening of ['inward','outward']){f.building.wallOpening=opening;assert(!M.validateStage(f.stage).some(i=>/gate opening/.test(i)));}
 for(const enabled of [true,false])for(const value of ['',null,'inside',0]){f.building.enabled=enabled;f.building.wallOpening=value;assert(M.validateStage(f.stage).some(i=>/gate opening/.test(i)));assert.throws(()=>Gate.project(f.source.data,f.building),/inward or outward/);}
 f.building.enabled=true;delete f.building.wallOpening;assert.equal(JSON.stringify(f.stage),before);
});
test('opening direction invalidates preview records but leaves artwork fitting and navigation shapes unchanged',()=>{
 const f=fixture(),bytes=JSON.stringify(f.source.data),outward=Preview.describe(f.service,f.stage),a=outward.buildings[f.building.id].levels[1];assert.equal(a.wallOpening,'outward');assert(!Object.prototype.hasOwnProperty.call(f.building,'wallOpening'));
 f.building.wallOpening='inward';const inward=Preview.describe(f.service,f.stage),b=inward.buildings[f.building.id].levels[1];assert.notStrictEqual(inward,outward);assert.equal(b.wallOpening,'inward');assert.deepEqual(b.blockers,a.blockers);assert.deepEqual(b.openBlockers,a.openBlockers);assert.deepEqual(b.skeletons.map(s=>s.matrix),a.skeletons.map(s=>s.matrix));assert.equal(JSON.stringify(f.source.data),bytes);
});
test('explicit opening settings survive prefab export and recovery without authoring JSON',()=>{
 const f=fixture(),directory=temporary('hkd-gate-opening-'),scripts=path.join(directory,'assets/_script'),folder=path.join(directory,'assets/KinghtFallIconMap');fs.mkdirSync(scripts,{recursive:true});fs.mkdirSync(folder,{recursive:true});
 for(const name of ['KinghtFallBuildMainFortress','KinghtFallBuildBartizan','KinghtFallBuildBarracks','KinghtFallBuildHome','KinghtFallBuildMill','KinghtFallBuildWall','KinghtFallCommerce'])fs.copyFileSync(path.join(root,'assets/_script',name+'.js.meta'),path.join(scripts,name+'.js.meta'));
 const bytes=JSON.stringify(f.source.data);for(const opening of ['inward','outward']){const building=Object.assign({},f.building,{wallOpening:opening}),stage=Object.assign({},f.stage,{buildings:[building]}),exported=P.compose(root,M.createMap('gate-opening','Gate opening','forest'),stage,{ground:[],assets:{}},{Map01:f.source.data}),name='Recovered-'+opening;fs.writeFileSync(path.join(folder,name+'.prefab'),JSON.stringify(exported));const config=Object.assign(M.clone(f.config.LevelCfg[0]),{prefab:name,HomeLevel1Unlock:[[6,building.id]],HomeLevel2Unlock:[],HomeLevel3Unlock:[]}),recovered=L.adaptStage(directory,'A',1,config);assert.equal(recovered.buildings[0].wallOpening,opening);}
 assert.equal(JSON.stringify(f.source.data),bytes);
});

test('opening controls require actual supported gate artwork and preserve unsupported legacy metadata in mixed selections',()=>{
 const Editor=require('../worlds/wall-layout-editor'),vm=require('node:vm'),client=fs.readFileSync(path.join(__dirname,'../worlds/client.js'),'utf8'),inspector=client.slice(client.indexOf(' function wallRunControls('),client.indexOf(' function renderBuildingInspector('));
 const cases=[{record:null,supported:false},{record:{skeletons:[{json:{animations:{open:{}}}}]},supported:false},{record:{skeletons:[{json:{wallDoor:{version:2}}}]},supported:true},{record:{skeletons:[{json:{animations:{open_inward:{}}}}]},supported:true},{record:{skeletons:[{json:{wallDoor:{version:2,closedOnly:true},animations:{open_inward:{}}},_wallSourceJson:{animations:{open_inward:{}}}},{json:{animations:{open_inward:{}}}}]},supported:false}];
 for(const {record,supported}of cases)for(const saved of [undefined,'inward']){
  const building={id:1,kind:6,FutureField:{keep:1}};if(saved)building.wallOpening=saved;const stage={buildings:[building]},before=JSON.stringify(stage),controls=new Map();let edits=0;
  const context={state:{snap:{buildingPreview:{buildings:{1:{levels:{1:record}}}}},previewHall:1},WallLayoutEditor:Editor,right:{},section(){},button(){},note(){},field(_host,label,value,change){controls.set(label,{value,change});return{};},edit(change){edits++;change(stage);}};
  vm.createContext(context);vm.runInContext(inspector,context);context.wallRunControls(building,['building:1']);assert.equal(controls.has('Gate opens'),supported);assert.equal(edits,0,'Opening the inspector does not edit its draft');assert.equal(JSON.stringify(stage),before);
 }
 const buildings=[{id:1,kind:6},{id:2,kind:6,wallOpening:'inward'}],stage={buildings},record={skeletons:[{json:{wallDoor:{version:2}}}]},legacy={skeletons:[{json:{animations:{open:{}}}}]},controls=new Map(),context={state:{snap:{buildingPreview:{buildings:{1:{levels:{1:record}},2:{levels:{1:legacy}}}}},previewHall:1},WallLayoutEditor:Editor,right:{},section(){},button(){},note(){},field(_host,label,value,change){controls.set(label,{value,change});return{};},edit(change){change(stage);}};
 vm.createContext(context);vm.runInContext(inspector,context);context.wallRunControls(buildings[0],['building:1','building:2']);controls.get('Gate opens').change('inward');assert.equal(buildings[0].wallOpening,'inward');controls.get('Gate opens').change('outward');assert.equal(buildings[0].wallOpening,'outward');assert.equal(buildings[1].wallOpening,'inward','A supported neighbor cannot overwrite saved metadata on unsupported legacy artwork');
});
