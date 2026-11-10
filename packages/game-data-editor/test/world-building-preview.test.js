'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('path'),fs=require('fs'),temporary=require('./owned-temp');
const Preview=require('../worlds/building-preview'),L=require('../worlds/legacy'),M=require('../worlds/model'),Maps=require('../lib/map-assets'),WeaponPose=require('../../../assets/_script/BuildingWeaponPose');
const root=path.resolve(__dirname,'../../..');
function fixture(map){
 const config=M.clone(L.read(root,L.configFile('A'))),source=L.inspect(root,map||'Map01'),stage=L.adaptStage(root,'A',1,Object.assign({},config.LevelCfg[0],{prefab:map||'Map01'}));
 const service={root,index:()=>({documents:{A:config,B:{},D:{}}}),source:()=>source.data};
 return {config,source,stage,service};
}
function close(actual,expected){assert.equal(actual.length,expected.length);actual.forEach((v,i)=>assert(Math.abs(v-expected[i])<1e-8,actual+' differs from '+expected));}
test('real stage preview contains complete models and only the first construction plate, without label or progress sprites',()=>{
 const f=fixture(),before=JSON.stringify({stage:f.stage,source:f.source.data,config:f.config}),result=Preview.describe(f.service,f.stage);
 assert.equal(Object.keys(result.buildings).length,f.stage.buildings.length);assert.match(result.runtimePath,/spine\.js$/);
 for(const building of f.stage.buildings){
  const entry=result.buildings[building.id],owner=f.source.info.byId[building.template.node],controller=f.source.data[owner.ownerComponent],plateId=controller.ndLockList[0].__id__,plateFrame=f.source.info.sprites.find(s=>s.node===plateId).frame;
  assert(!/\d|Map0/.test(entry.name),'display name does not contain source slot or map IDs');
  for(const hall of [1,2,3]){const level=entry.levels[hall];assert.equal(level.sprites.length,1,'only the authored root construction sprite remains');assert.equal(level.sprites[0].frame,plateFrame);assert(level.sprites[0].ground);assert(level.skeletons.length);assert(level.step.length>=3);assert.deepEqual(level.origin,owner.position);assert(level.blockers.length);}
 }
 assert.equal(JSON.stringify({stage:f.stage,source:f.source.data,config:f.config}),before,'asset browsing does not change drafts, configs, or source prefabs');
});
test('mirrored wall wings and gate retain each source matrix and only one built collider tag',()=>{
 const f=fixture(),gate=f.stage.buildings.find(b=>b.id===17),owner=f.source.info.byId[gate.template.node],controller=f.source.data[owner.ownerComponent];f.stage.buildings=[gate];
 const level=Preview.describe(f.service,f.stage).buildings[17].levels[1],refs=[controller.ndAniDown,controller.ndAniMain].concat(controller.ndAniOther);
 assert.equal(level.skeletons.length,6);assert(level.skeletons[0].ground);assert(level.skeletons.slice(1).every(s=>!s.ground));
 refs.forEach((ref,i)=>{const component=f.source.data[ref.__id__],node=f.source.info.byId[component.node.__id__];close(level.skeletons[i].matrix,node.world);assert(node.world[0]<0,'wall assembly is mirrored in gameplay');assert.equal(level.skeletons[i].skin,'cq-1');});
 assert.equal(level.blockers.length,5);const ownerPoints=f.source.info.colliders.find(c=>c.node===owner.id&&c.source.tag===1).points.map(p=>({x:p.x-owner.position.x,y:p.y-owner.position.y}));assert(level.blockers.some(p=>JSON.stringify(p)===JSON.stringify(ownerPoints)));
 assert.equal(level.openBlockers.length,4);assert(!level.openBlockers.some(p=>JSON.stringify(p)===JSON.stringify(ownerPoints)),'open ally passage removes only the gate leaf');
});
test('hall preview changes the hall model while other placements remain at their first offered level',()=>{
 const f=fixture();f.stage.buildings=f.stage.buildings.filter(b=>[1,2].includes(b.id));f.stage.variant='B';
 const result=Preview.describe(f.service,f.stage).buildings;
 for(const hall of [1,2,3]){assert.equal(result[1].levels[hall].skeletons[0].skin,'cb-'+hall);assert.equal(result[2].levels[hall].skeletons[0].skin,'jt-1');}
 assert.notDeepEqual(result[1].levels[1].blockers,result[1].levels[3].blockers);
 assert.deepEqual(result[2].levels[1].blockers,result[2].levels[3].blockers);
});
test('Appearance initial choices use the actual base and idle weapon layers with ColliderIndex, never upgrade icons',()=>{
 const f=fixture(),tower=f.stage.buildings.find(b=>b.kind===2);f.stage.buildings=[tower];f.config.BuildEnum[2].InitialChoices=[4];
 const row=f.config.BuildEnum[2].levelList[3],result=Preview.describe(f.service,f.stage),level=result.buildings[tower.id].levels[1],owner=f.source.info.byId[tower.template.node],pose=WeaponPose.pose(row.Appearance.weapon,null);
 assert.equal(result.runtimePath,null);assert.equal(level.skeletons.length,0);assert.equal(level.sprites.length,3);
 const [plate,base,weapon]=level.sprites;assert(plate.ground);assert(!base.ground&&!weapon.ground);assert.match(result.images[base.frame].url,/cannon-1\.png/);assert.match(result.images[weapon.frame].url,/cannon-1-weapon\.png/);
 assert.equal(base.width,row.Appearance.width);assert.equal(base.height,row.Appearance.height);close(base.matrix,[1,0,0,1,owner.position.x+row.Appearance.offsetX,owner.position.y+row.Appearance.offsetY]);close(weapon.matrix,[1,0,0,1,owner.position.x+pose.x,owner.position.y+pose.y]);assert.deepEqual(weapon.anchor,{x:pose.pivotX,y:pose.pivotY});
 const original=f.source.info.colliders.find(c=>c.node===owner.id&&c.source.tag===row.ColliderIndex).points.map(p=>({x:p.x-owner.position.x,y:p.y-owner.position.y}));assert.deepEqual(level.blockers,[original]);
});
test('embedded saved templates determine model transforms and hero step geometry without consulting current map sources',()=>{
 const f=fixture(),tower=f.stage.buildings.find(b=>b.kind===2);f.stage.buildings=[tower];f.stage.templates={Map01:M.clone(f.source.data)};f.service.source=()=>{throw Error('saved templates must win');};
 const source=f.stage.templates.Map01,owner=Maps.model(source).byId[tower.template.node],controller=source[owner.ownerComponent],art=source[source[controller.ndAniMain.__id__].node.__id__],trs=art._trs.array;trs[5]=Math.sin(Math.PI/8);trs[6]=Math.cos(Math.PI/8);trs[7]=-1.25;trs[8]=.75;
 const info=Maps.model(source),before=JSON.stringify(f.stage),level=Preview.describe(f.service,f.stage).buildings[tower.id].levels[1];close(level.skeletons[0].matrix,info.byId[tower.template.node].world);assert.equal(JSON.stringify(f.stage),before);
 assert.deepEqual(level.origin,info.byId[tower.template.node].position);assert(level.step.some(p=>Math.abs(p.x)>50));
});
test('placement-only snapshots reuse composition while source, config, and explicit refresh changes invalidate it',()=>{
 const f=fixture(),tower=f.stage.buildings.find(b=>b.kind===2);f.stage.buildings=[tower];let index=f.service.index();f.service.index=()=>index;
 const first=Preview.describe(f.service,f.stage);tower.x+=20;assert.equal(Preview.describe(f.service,f.stage),first);tower.angle+=40;assert.notEqual(Preview.describe(f.service,f.stage),first,'fixed field direction compensates building rotation and invalidates its composition');
 f.source.data[tower.template.node]._trs.array[0]+=5;const moved=Preview.describe(f.service,f.stage);assert.notEqual(moved,first);assert.equal(moved.buildings[tower.id].levels[1].origin.x,first.buildings[tower.id].levels[1].origin.x+5);
 f.config.BuildEnum[2].InitialChoices=[4];const changed=Preview.describe(f.service,f.stage);assert.notEqual(changed,moved);assert.equal(changed.buildings[tower.id].levels[1].skeletons.length,0);
 index=Object.assign({},index);assert.notEqual(Preview.describe(f.service,f.stage),changed);
});
test('missing preview artwork or controllers cannot block inspecting and saving otherwise valid authoring data',()=>{
 const f=fixture(),tower=f.stage.buildings.find(b=>b.kind===2);f.stage.buildings=[tower];const directory=temporary('hkd-building-preview-');fs.mkdirSync(path.join(directory,'assets'));f.service.root=directory;
 const missing=Preview.describe(f.service,f.stage),level=missing.buildings[tower.id].levels[1];assert(missing.errors.some(e=>/Missing building model/.test(e)));assert.equal(level.sprites.length,1);assert.equal(level.skeletons.length,0);assert(level.blockers.length>0);
 const owner=f.source.data[tower.template.node];owner._components=owner._components.filter(ref=>!f.source.data[ref.__id__].ndAniMain);const partial=Preview.describe(f.service,f.stage);assert(partial.errors.some(e=>/controller/.test(e)));assert(partial.buildings[tower.id].levels[1]);
});
test('explicit refresh versions model, atlas, and texture edits even when their source UUID and skin remain the same',()=>{
 const f=fixture(),tower=f.stage.buildings.find(b=>b.kind===2);f.stage.buildings=[tower];const owner=f.source.info.byId[tower.template.node],controller=f.source.data[owner.ownerComponent],uuid=f.source.data[controller.ndAniMain.__id__]._N$skeletonData.__uuid__,directory=temporary('hkd-building-refresh-'),folder=path.join(directory,'assets','model');fs.mkdirSync(folder,{recursive:true});f.service.root=directory;
 const file=path.join(folder,'tower.json'),atlasFile=path.join(folder,'tower.atlas'),texture=path.join(folder,'page.png'),json={skeleton:{hash:'original',spine:'3.8.99'},bones:[{name:'root'}],slots:[],skins:[{name:'jt-1',attachments:{}}],animations:{idle:{}}},atlas='page.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n';
 fs.writeFileSync(file,JSON.stringify(json));fs.writeFileSync(file+'.meta',JSON.stringify({uuid,importer:'spine'}));fs.writeFileSync(atlasFile,atlas);fs.writeFileSync(texture,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8XYAAAAASUVORK5CYII=','base64'));
 let index=f.service.index();f.service.index=()=>index;const refresh=()=>{index=Object.assign({},index);return Preview.describe(f.service,f.stage).buildings[tower.id].levels[1].skeletons[0];};
 const first=refresh(),originalPage=first.pages['page.png'];assert(first.revision);assert(new URL(originalPage).searchParams.has('hkd-building'));
 json.skeleton.hash='updated';fs.writeFileSync(file+'.new',JSON.stringify(json));fs.renameSync(file+'.new',file);const changedModel=refresh();assert.equal(changedModel.uuid,first.uuid);assert.equal(changedModel.skin,first.skin);assert.notEqual(changedModel.revision,first.revision);assert.equal(changedModel.json.skeleton.hash,'updated');assert.equal(changedModel.pages['page.png'],originalPage);
 fs.writeFileSync(atlasFile,atlas.replace('Linear,Linear','Nearest,Nearest'));const changedAtlas=refresh();assert.notEqual(changedAtlas.revision,changedModel.revision);assert.match(changedAtlas.atlas,/Nearest,Nearest/);
 const textureBytes=fs.readFileSync(texture);fs.writeFileSync(texture,Buffer.concat([textureBytes,Buffer.from([0])]));const changedPage=refresh();assert.notEqual(changedPage.pages['page.png'],changedAtlas.pages['page.png']);assert.notEqual(changedPage.revision,changedAtlas.revision);assert.equal(new URL(changedPage.pages['page.png']).pathname,new URL(originalPage).pathname);
});


test('unset facing overrides inherit embedded gate animation metadata exactly as runtime export does',()=>{
 const Gate=require('../worlds/gate-facing'),P=require('../worlds/prefab');
 for(const face of ['NE','NW']){
  const f=fixture(),gate=f.stage.buildings.find(building=>building.id===19);f.stage.buildings=[gate];f.stage.specials=[];gate.enabled=true;gate.unlock=1;f.stage.templates={Map01:M.clone(Gate.project(f.source.data,{...gate,wallFacing:face,wallRotation:11}))};delete gate.wallFacing;delete gate.wallRotation;f.service.source=()=>{throw Error('Embedded sources must win');};const before=JSON.stringify(f.stage),inherited=Preview.describe(f.service,f.stage).buildings[gate.id].levels[1],explicitStage=M.clone(f.stage);explicitStage.buildings[0].wallFacing=face;const explicit=Preview.describe(f.service,explicitStage).buildings[gate.id].levels[1];
  assert(inherited.skeletons[0].revision.endsWith(':reverse-gate'));assert(inherited.skeletons[1].revision.endsWith(':reverse-gate'));assert.deepEqual(inherited,explicit);const output=P.compose(root,M.createMap('inherited-gate','Inherited gate','forest'),f.stage,{ground:[],assets:{}},f.stage.templates),runtime=output.find(value=>value&&value.ndAniMain&&value.ID===gate.id);assert.equal(runtime.wallFacing,face);assert.equal(runtime.wallRotation,11);assert.equal(JSON.stringify(f.stage),before,'Preview must not seed optional overrides or rewrite embedded geometry');
 }
});
