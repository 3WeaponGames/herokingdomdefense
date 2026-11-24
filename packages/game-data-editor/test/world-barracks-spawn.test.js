'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),temporary=require('./owned-temp');
const Spawn=require('../worlds/barracks-spawn'),Preview=require('../worlds/building-preview'),L=require('../worlds/legacy'),M=require('../worlds/model'),Maps=require('../lib/map-assets'),P=require('../worlds/prefab');
const root=path.resolve(__dirname,'../../..'),clone=M.clone,own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
function near(a,b){assert(Math.hypot(a.x-b.x,a.y-b.y)<1e-7,JSON.stringify(a)+' differs from '+JSON.stringify(b));}
function fixture(){
 const config=L.read(root,L.configFile('A')),source=L.inspect(root,'Map01'),stage=L.adaptStage(root,'A',1,Object.assign({},config.LevelCfg[0],{prefab:'Map01'})),building=stage.buildings.find(b=>b.kind===3);
 const owner=source.data[building.template.node],a=owner._trs.array;a[5]=Math.sin(.23);a[6]=Math.cos(.23);a[7]=1.25;a[8]=.8;
 Object.assign(building,{x:160,y:-70,angle:31,scale:1.4});
 const index={documents:{A:config,B:{},D:{}}},service={root,index:()=>index,source:()=>source.data};
 return{config,source,stage,building,service};
}
function normalized(b){return Object.assign({},b,{x:0,y:0,scale:1,angle:0});}

test('inherited stage markers match authored defaults through owner, placement, world scale and model offset without seeding edits',()=>{
 const f=fixture(),row=f.config.BuildEnum[3].levelList[0];f.config.BuildEnum[3].InitialChoices=[row.index];row.WorldScale=.65;row.ModelOffset={x:27,y:-12};row.SpawnPosition={x:95,y:-120,future:{keep:true}};
 const before=JSON.stringify(f),owner=Maps.model(f.source.data).byId[f.building.template.node],record=Spawn.describe(normalized(f.building),f.source.data,f.config,3),actual=Spawn.project(f.building,record);
 const nodeLocal={x:(95+27)*.65,y:(-120-12)*.65},relative=Maps.point([owner.world[0],owner.world[1],owner.world[2],owner.world[3],0,0],nodeLocal),expected=M.toWorld(f.building,relative);
 near(actual.position,expected);near(actual.local,nodeLocal);assert(actual.inherited);assert(!own(f.building,'spawnPosition'));assert.deepEqual(actual.local.future,{keep:true});assert.equal(JSON.stringify(f),before);
});

test('the destination stays fixed across tiers while a mirrored spawn and inverse drags track placement',()=>{
 const f=fixture(),position=f.building.spawnPosition={x:110,y:-155,future:{keep:17}},before=JSON.stringify(f.building),owner=Maps.model(f.source.data).byId[f.building.template.node],expected=M.toWorld(f.building,Maps.point([owner.world[0],owner.world[1],owner.world[2],owner.world[3],0,0],position));
 for(const [i,row]of f.config.BuildEnum[3].levelList.entries()){
  row.WorldScale=.3+i*.08;row.ModelOffset={x:i*11,y:-i*7};f.building.previewBranch=row.index;
  const record=Spawn.describe(normalized(f.building),f.source.data,f.config,4),marker=Spawn.project(f.building,record);assert(!marker.inherited);near(marker.position,expected);assert.deepEqual(marker.local,position);near(Spawn.toLocal(marker,marker.position),position);
  const moved={x:marker.position.x+44,y:marker.position.y-29},local=Spawn.toLocal(marker,moved);near(Spawn.project(Object.assign({},f.building,{spawnPosition:local}),record).position,moved);
  const flipped={...f.building,flipX:true},reflected=p=>M.toWorld(f.building,{x:-M.toLocal(f.building,p).x,y:M.toLocal(f.building,p).y});
  const next=Spawn.project(flipped,record);near(next.spawn,reflected(marker.spawn));near(next.position,reflected(marker.position));near(Spawn.toLocal(next,next.position),position);
 }
 delete f.building.previewBranch;assert.equal(JSON.stringify(f.building),before);
});

test('legacy sibling formation markers retain their authored world position until a stage override is explicit',()=>{
 const f=fixture(),row=f.config.BuildEnum[3].levelList[0];f.config.BuildEnum[3].InitialChoices=[row.index];delete row.SpawnPosition;row.WorldScale=.35;row.ModelOffset={x:120,y:80};
 const info=Maps.model(f.source.data),owner=info.byId[f.building.template.node],component=f.source.data[owner.ownerComponent],marker=info.byId[component.ndBotnNodeList.__id__];
 const source=f.source.data,old=source[marker.parent],next=info.byId[info.roots.ndMain],local=Maps.point(Maps.inverse(next.world),marker.position);old._children=old._children.filter(ref=>ref.__id__!==marker.id);source[next.id]._children.push({__id__:marker.id});source[marker.id]._parent={__id__:next.id};source[marker.id]._trs.array[0]=local.x;source[marker.id]._trs.array[1]=local.y;
 const expected=M.toWorld(f.building,{x:marker.position.x-owner.position.x,y:marker.position.y-owner.position.y}),record=Spawn.describe(normalized(f.building),source,f.config,1),actual=Spawn.project(f.building,record);
 near(actual.position,expected);near(Spawn.project(Object.assign({},f.building,{spawnPosition:actual.local}),record).position,expected);assert(!own(f.building,'spawnPosition'));
});

test('preview records refresh a moved exit without rewriting shared building defaults or baking the placement twice',()=>{
 const f=fixture();f.stage.buildings=[f.building];const before=JSON.stringify(f.config),first=Preview.describe(f.service,f.stage),entry=first.buildings[f.building.id].levels[3].squadSpawn;
 assert(entry&&entry.inherited);near(Spawn.project(f.building,entry).position,Spawn.describe(f.building,f.source.data,f.config,3).position);
 f.building.spawnPosition={x:55,y:-81};const changed=Preview.describe(f.service,f.stage),next=changed.buildings[f.building.id].levels[3].squadSpawn;assert.notEqual(changed,first);assert(!next.inherited);near(next.local,f.building.spawnPosition);
 f.building.x+=80;f.building.y-=40;const moved=Preview.describe(f.service,f.stage);assert.equal(moved,changed,'Placement motion reuses composition');near(Spawn.project(f.building,next).position,Spawn.describe(f.building,f.source.data,f.config,3).position);
 delete f.building.spawnPosition;assert(Preview.describe(f.service,f.stage).buildings[f.building.id].levels[3].squadSpawn.inherited);assert.equal(JSON.stringify(f.config),before);
});

test('stage validation accepts only optional finite barracks overrides and preserves unknown data',()=>{
 const f=fixture(),map=M.createMap('Map01','Map 1','forest'),issues=()=>M.validateStage(f.stage,map).filter(message=>/Initial squad destination/.test(message));
 assert.deepEqual(issues(),[]);f.building.spawnPosition={x:10000,y:-10000,future:'retain'};assert.deepEqual(issues(),[]);assert.equal(f.building.spawnPosition.future,'retain');
 for(const value of [null,[],{x:'10',y:0},{x:Infinity,y:0},{x:10001,y:0}]){f.building.spawnPosition=value;assert(issues().length,'Invalid override accepted: '+JSON.stringify(value));}
 delete f.building.spawnPosition;f.stage.buildings.find(b=>b.kind===2).spawnPosition={x:0,y:0};assert(issues().length);assert.equal(Spawn.describe({kind:2},null,null),null);
});

test('stage prefab export and read-back retain per-instance spawn overrides, unknown fields and reset-to-default semantics',()=>{
 const f=fixture(),b=f.building,other=f.stage.buildings.find(c=>c.kind===3&&c!==b),map=M.createMap('spawn-map','Spawn map','forest'),configBefore=JSON.stringify(f.config),sourceBefore=JSON.stringify(f.source.data),point=b.spawnPosition={x:117,y:-63,future:{keep:17}};
 const output=P.compose(root,map,f.stage,{ground:[],assets:{}},{Map01:f.source.data}),component=output.find(c=>c&&c.ndBotnNodeList&&c.ID===b.id),neighbor=output.find(c=>c&&c.ndBotnNodeList&&c.ID===other.id);
 assert.deepEqual(component.squadSpawnPosition,Object.assign({},point,{__type__:'cc.Vec2'}));assert.equal(neighbor.squadSpawnPosition,null);assert.equal(JSON.stringify(f.config),configBefore);assert.equal(JSON.stringify(f.source.data),sourceBefore);
 const folder=temporary('hkd-stage-spawn-roundtrip-');fs.mkdirSync(path.join(folder,'assets/KinghtFallIconMap'),{recursive:true});fs.mkdirSync(path.join(folder,'assets/_script'),{recursive:true});fs.writeFileSync(path.join(folder,'assets/KinghtFallIconMap/Saved.prefab'),JSON.stringify(output));
 for(const name of ['KinghtFallBuildMainFortress','KinghtFallBuildBartizan','KinghtFallBuildBarracks','KinghtFallBuildHome','KinghtFallBuildMill','KinghtFallBuildWall','KinghtFallCommerce','SpawnPointArea','AuthoredStagePaths'])fs.copyFileSync(path.join(root,'assets/_script',name+'.js.meta'),path.join(folder,'assets/_script',name+'.js.meta'));
 const loaded=L.adaptStage(folder,'A',1,Object.assign({},f.stage.config,{prefab:'Saved'})),saved=loaded.buildings.find(c=>c.id===b.id);assert.deepEqual(saved.spawnPosition,point);assert(!own(loaded.buildings.find(c=>c.id===other.id),'spawnPosition'));
 const copyBefore=JSON.stringify(loaded),next=P.compose(root,map,loaded,{ground:[],assets:{}},{Saved:output});assert.deepEqual(next.find(c=>c&&c.ndBotnNodeList&&c.ID===b.id).squadSpawnPosition,component.squadSpawnPosition);assert.equal(JSON.stringify(loaded),copyBefore);
 delete saved.spawnPosition;const reset=P.compose(root,map,loaded,{ground:[],assets:{}},{Saved:output});assert.equal(reset.find(c=>c&&c.ndBotnNodeList&&c.ID===b.id).squadSpawnPosition,null,'Reset must remove an embedded previously baked override');assert.equal(component.squadSpawnPosition.x,117);
});
