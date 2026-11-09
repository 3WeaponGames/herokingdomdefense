'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),Maps=require('../../packages/game-data-editor/lib/map-assets'),Catalog=require('../../packages/game-data-editor/lib/map-catalog');
const {NavigationGrid}=require('../../assets/_script/NavigationGrid'),{Store}=require('../../packages/game-data-editor/lib/store'),{textureMeta}=require('../maps/bake-map.cjs');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),source=Maps.loadMap(root,'Map07').data,info=Maps.model(source),clone=v=>structuredClone(v);
const configs=['KinghtFallConfig','KinghtFallConfigB','KinghtFallConfigD'].map(folder=>read('assets/'+folder+'/GameJsonCfg.json'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const terrain=info.colliders.filter(c=>c.active&&c.registered&&info.byId[c.owner].kind==='obstacle');
const grid=new NavigationGrid(terrain.map(c=>c.points),info.bounds,20);
function compressed(uuid){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',s=uuid.replace(/-/g,'');let result=s.slice(0,5);for(let i=5;i<32;i+=3){const n=parseInt(s.slice(i,i+3),16);result+=chars[n>>6]+chars[n&63];}return result;}
function apply(data,edits){for(const edit of edits){let parent=data;for(const key of edit.path.slice(0,-1))parent=parent[key];parent[edit.path.at(-1)]=clone(edit.value);}return data;}

test('Stage 7 has a separate full-size map, valid references and bounded baked textures',()=>{
 assert(Catalog.has('Map07'));assert.equal(Catalog.lanes('Map07'),12);assert.equal(source[0]._name,'Map07');
 assert.deepEqual(info.bounds,{minX:-930,minY:-1514,maxX:930,maxY:1514});
 assert.deepEqual(Maps.validate(source).filter(x=>x.severity==='error'),[]);
 const owners=info.owners.filter(n=>n.kind==='obstacle'&&n.name!=='Blocker map-blockers'),blocker=info.owners.filter(n=>n.kind==='obstacle'&&n.name==='Blocker map-blockers');assert.equal(owners.length,6);assert.equal(blocker.length,1);assert.equal(terrain.length,4);assert(terrain.every(c=>c.owner===blocker[0].id),'terrain collision belongs to the fixed global mask');
 for(const collider of terrain)for(const point of collider.source.points)assert.equal(point.__type__,'cc.Vec2','physics points must deserialize as engine vectors');
 const textureFolder='assets/KinghtFallIconMap/Generated/Maps/Map07',files=fs.readdirSync(path.join(root,textureFolder)).filter(f=>f.endsWith('.png'));assert.equal(files.filter(f=>f.startsWith('ground-')).length,2);assert.equal(files.filter(f=>f.startsWith('objects-')).length,5);
 const frames=new Set();let pixels=0;
 for(const file of files){const bytes=fs.readFileSync(path.join(root,textureFolder,file)),meta=read(textureFolder+'/'+file+'.meta'),w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);assert(w<=2048&&h<=2048);assert.equal(meta.width,w);assert.equal(meta.height,h);assert.equal(meta.packable,false);pixels+=w*h;}
 for(const file of fs.readdirSync(path.join(root,textureFolder)).filter(f=>f.endsWith('.plist.meta')||f.startsWith('ground-')&&f.endsWith('.png.meta')))for(const frame of Object.values(read(textureFolder+'/'+file).subMetas||{})){assert(frame.rawWidth>0&&frame.rawHeight>0);assert(!frames.has(frame.uuid));frames.add(frame.uuid);}
 assert(frames.size>=8,'all generated scenery and floor frames must be represented');
 // Six full-resolution cutouts plus two floor tiles are bounded independently
 // from the discarded nine pre-baked scenery slices.
 assert(pixels*4<72*1048576,'decoded map textures exceed the authored six-layer memory budget');
 const anchorType=compressed(read('assets/_script/MapTerrainLayer.js.meta').uuid);
 for(const owner of owners){const anchor=owner.components.find(c=>c.value.__type__===anchorType);assert(anchor,'ground anchor is required');assert.equal(source[anchor.value.ground.__id__]._parent.__id__,owner.id);assert.equal(source[anchor.value.artwork.__id__].__type__,'cc.Node');assert.equal(source[anchor.value.artwork.__id__]._parent.__id__,owner.id);assert(info.sprites.some(sprite=>info.byId[sprite.node].owner===owner.id),'scenery artwork must retain its sprite binding');}
 const legacy=new Set();for(const file of fs.readdirSync(path.join(root,'assets/KinghtFallIconMap/Map02/map')).filter(f=>/\.(png|jpg)\.meta$/.test(f)))Object.values(read('assets/KinghtFallIconMap/Map02/map/'+file).subMetas||{}).forEach(f=>legacy.add(f.uuid));
 assert(!info.sprites.some(s=>legacy.has(s.frame)),'old forest textures must not be pulled into the fire map');
});

test('every Stage 7 unlock uses an existing structure of the right type in A, B and D',()=>{
 const classes={1:'KinghtFallBuildMainFortress',2:'KinghtFallBuildBartizan',3:'KinghtFallBuildBarracks',4:'KinghtFallBuildHome',5:'KinghtFallBuildMill',6:'KinghtFallBuildWall'};
 const typeByScript=Object.fromEntries(Object.entries(classes).map(([type,name])=>[compressed(read('assets/_script/'+name+'.js.meta').uuid),Number(type)]));
 const slots=new Map(info.owners.filter(n=>n.kind==='building').map(n=>[n.slot,{node:n,type:typeByScript[source[n.ownerComponent].__type__]}]));
 assert.equal(slots.size,20);assert.equal(slots.get(1).type,1);
 for(const config of configs){const stage=config.LevelCfg.find(s=>s.Level===7),seen=new Set([1]);assert.equal(stage.prefab,'Map07');assert.equal(stage.Map,'wg_zy_gq7');
  for(const key of ['HomeLevel1Unlock','HomeLevel2Unlock','HomeLevel3Unlock'])for(const [type,id]of stage[key]){assert(slots.has(id),'missing site '+id);assert.equal(slots.get(id).type,type,'wrong structure at '+id);assert(!seen.has(id),'duplicate site '+id);seen.add(id);}
  assert.equal([...seen].filter(id=>slots.get(id).type===6).length,2);
  for(const wave of stage.WaveCfg)for(const encoded of wave.RefreshSoldierKind){const lane=Number(encoded.split('#')[0]);assert(info.nodes.some(n=>n.kind==='spawn'&&n.lane===lane),'wave uses a missing entrance');}
 }
});

test('all entrances, routes and structure approaches are reachable for normal and large units',()=>{
 const spawns=info.nodes.filter(n=>n.kind==='spawn'),hero=info.nodes.find(n=>n.kind==='hero');assert.equal(spawns.length,12);
 for(const radius of [16,20,30]){
  assert(grid.isWalkable(hero.position,radius),'hero starts inside terrain');
  for(const spawn of spawns){assert(grid.isWalkable(spawn.position,radius),'blocked lane '+spawn.lane);const routes=info.routes.filter(r=>r.lanes.includes(spawn.lane)&&r.buildings.length===0);assert(routes.length,'entrance has no unconditional route');
   for(const route of routes){let from=spawn.position;for(const to of route.points){assert(grid.isWalkable(to,radius),'blocked waypoint '+route.node);const plan=grid.findPath(from,to,radius);assert(plan&&plan.reached,'unreachable route '+route.node);assert(Math.hypot(plan.goal.x-to.x,plan.goal.y-to.y)<.001,'waypoint was silently moved');from=to;}}
  }
 }
 const walls=new Set([19,20]);
 for(const building of info.owners.filter(n=>n.kind==='building'&&!walls.has(n.slot))){assert(grid.isWalkable(building.position,22),'structure is inside terrain '+building.slot);const approach={x:building.position.x,y:building.position.y-75},plan=grid.findPath(hero.position,approach,20);assert(plan&&plan.reached,'building cannot be approached '+building.slot);}
});

test('navigation regression fixture matches the current production map',()=>{
 const extract=require('../navigation/extract-map-fixtures.cjs').extract;
 assert.deepEqual(JSON.parse(JSON.stringify(extract(path.join(root,'assets/KinghtFallIconMap/Map07.prefab')))),read('tools/navigation/fixtures/map07-authored.json'));
});

test('dragging a terrain group moves its artwork and anchor while the global blocker remains fixed',()=>{
 const owner=info.owners.find(n=>n.kind==='obstacle'&&n.name!=='Blocker map-blockers'),delta={x:83,y:-41},before=JSON.stringify(source),draft=apply(clone(source),Maps.moveObjectEdits(source,owner.id,{x:owner.position.x+delta.x,y:owner.position.y+delta.y},'map:Map07')),next=Maps.model(draft);
 for(const node of info.nodes.filter(n=>n.owner===owner.id)){assert(Math.abs(next.byId[node.id].position.x-node.position.x-delta.x)<1e-8);assert(Math.abs(next.byId[node.id].position.y-node.position.y-delta.y)<1e-8);}
 for(const old of terrain){const fixed=next.colliders.find(c=>c.id===old.id);assert.deepEqual(fixed.points,old.points,'global collision must stay fixed when scenery moves');}assert.equal(JSON.stringify(source),before);
});

test('dragging a gate keeps separate wall wings, smoke and floor markers aligned',()=>{
 const gate=info.owners.find(n=>n.slot===20),controller=source[gate.ownerComponent],delta={x:61,y:37},draft=apply(clone(source),Maps.moveObjectEdits(source,gate.id,{x:gate.position.x+delta.x,y:gate.position.y+delta.y},'map:Map07')),after=Maps.model(draft);
 const partIds=[controller.ndAniMain,controller.ndAniDown,controller.ndAniEffect,...controller.ndAniOther].map(ref=>source[ref.__id__].node.__id__).concat(controller.ndLockList.map(ref=>ref.__id__));
 for(const id of partIds){const p=info.byId[id].position,q=after.byId[id].position;assert(Math.hypot(q.x-p.x-delta.x,q.y-p.y-delta.y)<1e-8,'detached gate part '+id);}
 const castle=info.owners.find(n=>n.slot===1);assert.deepEqual(after.byId[castle.id].position,castle.position);
});

test('opening Stage 7 in a draft store and saving without changes performs no writes',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-map7-store-'));
 try{const files=['assets/KinghtFallConfig/GameJsonCfg.json','assets/KinghtFallConfigB/GameJsonCfg.json','assets/KinghtFallConfigD/GameJsonCfg.json','assets/resources/localization/catalog.json','assets/KinghtFallIconMap/Map07.prefab'];for(const file of files){fs.mkdirSync(path.dirname(path.join(temp,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(temp,file));}
  const states=files.map(f=>({file:f,hash:hash(fs.readFileSync(path.join(temp,f))),mtime:fs.statSync(path.join(temp,f)).mtimeMs})),store=new Store(temp,{backupRoot:path.join(temp,'backups')}),snapshot=store.addMap('Map07');assert.equal(snapshot.dirty,false);assert.equal(store.save({version:snapshot.version}).result.noChanges,true);assert(!fs.existsSync(path.join(temp,'backups')));
  for(const item of states){assert.equal(hash(fs.readFileSync(path.join(temp,item.file))),item.hash);assert.equal(fs.statSync(path.join(temp,item.file)).mtimeMs,item.mtime);}
 }finally{const resolved=path.resolve(temp);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('hkd-map7-store-'));fs.rmSync(resolved,{recursive:true,force:true});}
});

test('terrain anchor lifecycle uses the authored point without clobbering another owner',()=>{
 let definition;vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/MapTerrainLayer.js'),'utf8'),{cc:{Class:d=>{definition=d;},Component:function(){},Node:function(){}}});
 const component={node:{},ground:{x:1,y:2}};definition.onLoad.call(component);assert.equal(component.node._depthGround,component.ground);definition.onDestroy.call(component);assert(!('_depthGround'in component.node));
 definition.onLoad.call(component);const replacement={x:3,y:4};component.node._depthGround=replacement;definition.onDestroy.call(component);assert.equal(component.node._depthGround,replacement);const empty={node:{},ground:null};definition.onLoad.call(empty);assert(!('_depthGround'in empty.node));
});

test('rebaking retains texture identifiers and unknown metadata fields',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-map7-meta-')),file=path.join(temp,'piece.png');
 try{const meta={uuid:crypto.randomUUID(),custom:{keep:7},subMetas:{piece:{uuid:crypto.randomUUID(),customFrame:true,subMetas:{extra:{value:9}}},secondary:{uuid:crypto.randomUUID(),keep:true}}};fs.writeFileSync(file+'.meta',JSON.stringify(meta));const next=textureMeta(file,123,234);assert.equal(next.uuid,meta.uuid);assert.equal(next.subMetas.piece.uuid,meta.subMetas.piece.uuid);assert.deepEqual(next.custom,meta.custom);assert.deepEqual(next.subMetas.secondary,meta.subMetas.secondary);assert.deepEqual(next.subMetas.piece.subMetas,meta.subMetas.piece.subMetas);assert.equal(next.subMetas.piece.customFrame,true);
 }finally{const resolved=path.resolve(temp);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('hkd-map7-meta-'));fs.rmSync(resolved,{recursive:true,force:true});}
});

test('terrain pieces inherit the battle tint while retaining their authored color and releasing listeners',()=>{
 let definition;const color=(r,g,b,a)=>({r,g,b,a}),Node=function(){};Node.EventType={COLOR_CHANGED:'color-changed'};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/MapTerrainLayer.js'),'utf8'),{cc:{Class:d=>{definition=d;},Component:function(){},Node,color}});
 const events=[],component={node:{color:color(255,255,255,255),on:(...a)=>events.push(a),off:(...a)=>events.splice(events.findIndex(v=>v[0]===a[0]&&v[1]===a[1]&&v[2]===a[2]),1)},ground:{},artwork:{color:{r:204,g:153,b:102,a:255,clone(){return color(this.r,this.g,this.b,this.a);}}},syncTint(){definition.syncTint.call(this);}};
 definition.onLoad.call(component);assert.equal(events.length,1);component.node.color=color(156,156,156,255);events[0][1].call(component);assert.deepEqual(component.artwork.color,color(125,94,62,255));component.node.color=color(255,255,255,255);events[0][1].call(component);assert.deepEqual(component.artwork.color,color(204,153,102,255));definition.onDestroy.call(component);assert.equal(events.length,0);
});

test('depth setup retains terrain ground points and keeps legacy renderer defaults',()=>{
 const cc={Sprite:function(){}},sp={Skeleton:function(){}},context={cc,sp,exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallDepthView.js'),'utf8'),context);
 function obstacle(name,ground){const node={name,_depthGround:ground,children:[],getComponentsInChildren(Type){return Type===cc.Sprite?[{node:this,enabled:false},{node:{name:'artwork'},enabled:true}]:[];}};return {node};}
 const ground={name:'Ground point'},authored=obstacle('New terrain',ground),legacy=obstacle('Existing terrain',null),objects=[],main={children:[authored.node,legacy.node]};
 context.exports.DepthView.prototype.prepareObjects.call({main,objects,game:{gameData:{bulidPointMap:{},obstacles:[authored,legacy]}}});assert.equal(authored.node._depthGround,ground);assert.equal(legacy.node._depthGround,legacy.node);assert.equal(objects.length,2);
});
