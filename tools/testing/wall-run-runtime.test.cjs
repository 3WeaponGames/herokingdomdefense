'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const Kit=require('../../assets/_script/WallKit'),Facing=require('../../assets/_script/GateFacing'),Door=require('../../assets/_script/WallDoor'),Maps=require('../../packages/game-data-editor/lib/map-assets'),L=require('../../packages/game-data-editor/worlds/legacy'),M=require('../../packages/game-data-editor/worlds/model'),Units=require('../../packages/game-data-editor/lib/unit-assets');
const root=path.resolve(__dirname,'../..'),copy=M.clone;
const productionMain=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallIconMap/com/Ani/cq/cq1/cq1.json'),'utf8'));
function originalData(json){const metadata=copy(productionMain.wallKit);metadata.gateStyle='original';delete metadata.doors;if(json.wallKit)return Kit.install(Kit.source(json),metadata.layout,metadata);if(json.wallGate){const result=Kit.fitOriginalGate(Kit.source(json),metadata.layout);result.wallGate={...copy(json.wallGate),style:'original'};return result;}return json;}

function close(a,b,message){assert.equal(a.length,b.length,message);a.forEach((p,i)=>{assert(Math.abs(p.x-b[i].x)<1e-7,message);assert(Math.abs(p.y-b[i].y)<1e-7,message);});}
function fixture(options={}){
 const made=[],stopped=[],all=[],triggers=[],nodes=new Map();let next=0;
 class Data{constructor(){this.refs=0;this.destroyed=false;made.push(this);}addRef(){this.refs++;}decRef(){assert(this.refs>0,'No duplicate asset release');this.refs--;if(!this.refs)this.destroyed=true;}destroy(){this.destroyed=true;}getRuntimeData(){if(options.failParse&&options.failParse(this))return null;return{};}}
 const cc={v2:(x,y)=>({x,y}),PhysicsPolygonCollider:'physics',PolygonCollider:'trigger',isValid:(v,strict)=>!!v&&!v.destroyed&&!(strict&&v.toDestroy)},modules={WallKit:Kit,GateFacing:Facing,__Data:Data,__cc:cc};
 // Baseline asset tests opt into neutral data without changing held user data.
 if(options.adjustmentsData)modules['./WallAdjustments']={...require('../../assets/_script/WallAdjustments'),getData:()=>copy(options.adjustmentsData)};
 function load(name){const filename=path.join(root,'assets/_script/'+name+'.js'),unit=new Module(filename,module);unit.filename=filename;unit.paths=Module._nodeModulePaths(path.dirname(filename));unit.require=name=>modules[name]||Module.prototype.require.call(unit,name);unit._compile('var sp={SkeletonData:require("__Data")};var cc=require("__cc");\n'+fs.readFileSync(filename,'utf8'),filename);modules[name]=unit.exports;return unit.exports;}
 const FacingRuntime=load('GateFacingRuntime'),Runtime=load('WallRunRuntime'),source=L.inspect(root,'Map01'),config=copy(L.read(root,L.configFile('A'))),stage=L.adaptStage(root,'A',1,{...config.LevelCfg[0],prefab:'Map01'}),wall=stage.buildings.find(b=>b.kind===6),info=source.info,controller=source.data[info.byId[wall.template.node].ownerComponent];
 function collider(n,value,extra=false){const c={uuid:'collider-'+(++next),node:n,tag:value.tag||0,points:copy(value.points||[]).map(({x,y})=>({x,y})),offset:copy(value.offset||{x:0,y:0}),enabled:value._enabled!==false,density:value.density===undefined?1:value.density,sensor:!!value.sensor,friction:value.friction===undefined?.2:value.friction,restitution:value.restitution||0,apply(){assert(this.enabled,'Applying a disabled collider creates ghost fixtures');assert(this.node.activeInHierarchy,'Inactive nodes cannot initialize fixtures');if(options.failApply&&options.failApply(this))throw Error('Physics initialization failed');this.applied=(this.applied||0)+1;},destroy(){this.destroyed=true;}};n.physics.push(c);all.push(c);if(extra)c.isCreated=true;return c;}
 function node(id){if(nodes.has(id))return nodes.get(id);const authored=info.byId[id],mock={activeInHierarchy:true,world:authored.world.slice(),physics:[],triggers:[],convertToWorldSpaceAR(p){return Maps.point(this.world,p);},convertToNodeSpaceAR(p){return Maps.point(Maps.inverse(this.world),p);},getComponents(type){return type===cc.PhysicsPolygonCollider?this.physics.filter(c=>!c.destroyed):type===cc.PolygonCollider?this.triggers:[];},addComponent(type){assert.equal(type,cc.PhysicsPolygonCollider);return collider(this,{},true);}};nodes.set(id,mock);for(const part of authored.components){if(part.value.__type__==='cc.PhysicsPolygonCollider')collider(mock,part.value);if(part.value.__type__==='cc.PolygonCollider'){const c={node:mock,points:copy(part.value.points).map(({x,y})=>({x,y})),offset:copy(part.value.offset||{x:0,y:0})};mock.triggers.push(c);triggers.push(c);}}return mock;}
 const assets={};function skeleton(ref){const s=source.data[ref.__id__],id=s._N$skeletonData.__uuid__;if(!assets[id]){const data=new Data();data.addRef();const file=Units.index(root).uuids[id];data.skeletonJson=JSON.parse(fs.readFileSync(file,'utf8'));if(options.original)data.skeletonJson=originalData(data.skeletonJson);data.atlasText=fs.readFileSync(file.replace(/\.json$/,'.atlas'),'utf8');data.textureNames=data.atlasText.split(/\r?\n/).filter(line=>/^[^\s]+\.png$/.test(line));data.textures=JSON.parse(fs.readFileSync(file+'.meta','utf8')).textures.map(uuid=>({uuid}));assert.equal(data.textureNames.length,data.textures.length,'Every real atlas page has a texture binding');data.scale=1;data._uuid=id;assets[id]=data;}return{node:node(s.node.__id__),skeletonData:assets[id]};}
 const owner={node:node(wall.template.node),ndAniMain:skeleton(controller.ndAniMain),ndAniDown:skeleton(controller.ndAniDown),ndAniOther:controller.ndAniOther.map(skeleton),wallRun:'',colPoint:{},_stopColliderTween(c){stopped.push(c);}};all.forEach(c=>owner.colPoint[c.uuid]=copy(c.points));
 function worldPoints(c){return c.points.map(p=>c.node.convertToWorldSpaceAR({x:p.x+c.offset.x,y:p.y+c.offset.y}));}
 function plan(){const points=[];for(const s of owner.ndAniOther)for(const p of s.skeletonData.skeletonJson.wallAnchors||[])points.push(owner.ndAniMain.node.convertToNodeSpaceAR(s.node.convertToWorldSpaceAR(p)));return Kit.layout(owner.wallRun?JSON.parse(owner.wallRun):null,points);}
 return{Runtime,FacingRuntime,owner,source,assets,all,triggers,made,stopped,worldPoints,plan,cc};
}
function state(f){return f.all.filter(c=>!c.isCreated).map(c=>({tag:c.tag,points:copy(c.points),enabled:c.enabled}));}
function assertGeometry(f){const g=Kit.fixtures(f.plan()),model=f.owner.ndAniMain.node;for(const [node,polygons] of [[f.owner.node,[g.root]],...f.owner.ndAniOther.map((s,i)=>[s.node,g.wingSegments[i]])])for(const tier of [1,2,3]){const parts=node.getComponents('physics').filter(c=>c.tag===tier);assert.equal(parts.length,polygons.length,'Each level has one convex collider per coalesced stretch');parts.forEach((c,i)=>{close(f.worldPoints(c),polygons[i].map(p=>model.convertToWorldSpaceAR(p)),'Fixture matches the final native artwork plan');assert.deepEqual(f.owner.colPoint[c.uuid],c.points);});}if(g.proximity.length)close(f.worldPoints(f.triggers[0]),g.proximity.map(p=>model.convertToWorldSpaceAR(p)),'The friendly trigger surrounds the final portal');}
function bentRun(){return Object.assign(Kit.nativeRun({left:2,right:2,gate:true,start:'post',end:'post'}),{left:4,right:2,routes:{left:[{u:0,v:0},{u:-2,v:0},{u:-2,v:2}],right:[{u:0,v:0},{u:2,v:0}]}});}

test('saved wall visuals refit the requested upgrade tier and source revision without changing imported data or fixtures',()=>{
 const Adjustments=require('../../assets/_script/WallAdjustments'),saved=Adjustments.getData();
 const data={version:1,poses:{'1/SW/closed':{pieces:{'door/near':{x:1,y:0}}},'2/SW/closed':{pieces:{'door/near':{x:7,y:0}}}}};
 try{
  Adjustments.setData(data);const f=fixture(),main=f.owner.ndAniMain.skeletonData,before=state(f),bytes=JSON.stringify(main.skeletonJson);
  f.owner.wallFacing='SW';f.owner.getBranchCfg=index=>[{index:41,level:1},{index:82,level:2},{index:123,level:3}].find(row=>row.index===index);
  f.Runtime.apply(f.owner,82);const tier2=f.owner.ndAniMain.skeletonData;assert.equal(tier2.skeletonJson.wallAdjustments.tier,2,'Resolve the incoming branch before the base setLevel changes buildInfo');assertGeometry(f);
  f.Runtime.apply(f.owner,82);assert.strictEqual(f.owner.ndAniMain.skeletonData,tier2,'No repeated allocation for the same authored tier and revision');
  f.Runtime.apply(f.owner,41);const tier1=f.owner.ndAniMain.skeletonData;assert.notStrictEqual(tier1,tier2);assert(tier2.destroyed);assert.equal(tier1.skeletonJson.wallAdjustments.tier,1);assertGeometry(f);
  const changed=copy(data);changed.poses['1/SW/closed'].pieces['door/near'].x=2;Adjustments.setData(changed);f.Runtime.apply(f.owner,41);
  assert.notStrictEqual(f.owner.ndAniMain.skeletonData,tier1,'A new saved revision invalidates an otherwise identical instance');assert(tier1.destroyed);assert.equal(JSON.stringify(main.skeletonJson),bytes);
  f.Runtime.dispose(f.owner);assert.strictEqual(f.owner.ndAniMain.skeletonData,main);assert.deepEqual(state(f),before);
 }finally{Adjustments.setData(saved);}
});

test('empty wall adjustment data preserves the old tier-independent instance cache',()=>{
 const Adjustments=require('../../assets/_script/WallAdjustments'),saved=Adjustments.getData();
 try{Adjustments.setData({version:1,poses:{}});const f=fixture();f.owner.buildCfg={levelList:[{index:41,level:1},{index:82,level:2}]};f.Runtime.apply(f.owner,41);const first=f.owner.ndAniMain.skeletonData;f.Runtime.apply(f.owner,82);assert.strictEqual(f.owner.ndAniMain.skeletonData,first);assert(!first.skeletonJson.wallAdjustments);f.Runtime.dispose(f.owner);}finally{Adjustments.setData(saved);}
});

test('the wall setLevel forwards the incoming branch to visual fitting before changing the active skin',()=>{
 const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallBuildWall.js'),'utf8'),start=source.indexOf('_ctor.prototype.setLevel = function'),end=source.indexOf('\n  };',start),calls=[],context={result:{},require:name=>{assert.equal(name,'WallRunRuntime');return{apply:(owner,index)=>calls.push(['fit',owner,index])};},t:{prototype:{setLevel:function(index){calls.push(['base',this,index]);}}}};
 require('node:vm').runInNewContext(source.slice(start,end+5).replace('_ctor.prototype.setLevel','result.fn'),context);
 const owner={ndAniMain:{skeletonData:{skeletonJson:{wallKit:{}}}},ndAniEffect:{node:{active:true}}};context.result.fn.call(owner,82);
 assert.deepEqual(calls,[['fit',owner,82],['base',owner,82]]);assert.equal(owner.ndAniEffect.node.active,false);assert.equal(owner.isOpen,false);
});

test('default runs fit matched open and closed images and native fixtures without writing source data',()=>{
 const f=fixture({adjustmentsData:{version:1,poses:{}}}),main=f.owner.ndAniMain.skeletonData,down=f.owner.ndAniDown.skeletonData,bytes=JSON.stringify([main.skeletonJson,down.skeletonJson,f.source.data]),before=state(f),cache=copy(f.owner.colPoint),trigger=copy(f.triggers[0].points);f.Runtime.apply(f.owner);const a=f.owner.ndAniMain.skeletonData,b=f.owner.ndAniDown.skeletonData;
 assert.notEqual(a,main);assert.notEqual(b,down);assert.equal(main.refs,2);assert.equal(down.refs,2);assert.equal(JSON.stringify([main.skeletonJson,down.skeletonJson,f.source.data]),bytes);assert.equal(f.owner.wallRun,'');assert.equal(a.skeletonJson.wallKit.gateStyle,'matched');assert.equal(a.skeletonJson.wallDoor.closedOnly,false);assert.equal(a.textures.length,3);a.textures.forEach((texture,index)=>assert.strictEqual(texture,main.textures[index]));assertGeometry(f);
 for(const level of Kit.skins){const left=a.skeletonJson.skins.find(s=>s.name===level),right=b.skeletonJson.skins.find(s=>s.name===level);assert(left&&right);assert.deepEqual(Object.keys(left.attachments).filter(n=>!/^rts_wall_(?:part|shadow)_/.test(n)).sort(),[Door.slot,...Object.values(Door.partSlots)].sort());assert.deepEqual(Object.keys(left.attachments[Door.slot]),['rts_door_closed']);for(const slot of Object.values(Door.partSlots))assert.equal(Object.keys(left.attachments[slot]).length,2);assert.deepEqual(right.attachments,{});}
 f.Runtime.apply(f.owner);assert.strictEqual(f.owner.ndAniMain.skeletonData,a);assert.strictEqual(f.owner.ndAniDown.skeletonData,b);
 f.Runtime.dispose(f.owner);assert.strictEqual(f.owner.ndAniMain.skeletonData,main);assert.strictEqual(f.owner.ndAniDown.skeletonData,down);assert.equal(main.refs,1);assert.equal(down.refs,1);assert(a.destroyed&&b.destroyed);assert.deepEqual(state(f),before);assert.deepEqual(f.owner.colPoint,cache);assert.deepEqual(f.triggers[0].points,trigger);assert(!Object.prototype.hasOwnProperty.call(f.owner,'wallHasGate'));
});

test('explicitly recovered original default gateways retain both native halves and reversible fixture ownership',()=>{
 const f=fixture({original:true}),main=f.owner.ndAniMain.skeletonData,down=f.owner.ndAniDown.skeletonData,before=state(f),cache=copy(f.owner.colPoint),snapshot=JSON.stringify([main.skeletonJson,down.skeletonJson]);f.Runtime.apply(f.owner);assertGeometry(f);
 for(const s of [f.owner.ndAniMain,f.owner.ndAniDown])for(const name of Kit.skins){const skin=s.skeletonData.skeletonJson.skins.find(value=>value.name===name);assert(Object.keys(skin.attachments).some(slot=>/^men/.test(slot)));assert(!skin.attachments[Door.slot]);}
 f.Runtime.dispose(f.owner);assert.strictEqual(f.owner.ndAniMain.skeletonData,main);assert.strictEqual(f.owner.ndAniDown.skeletonData,down);assert.equal(JSON.stringify([main.skeletonJson,down.skeletonJson]),snapshot);assert.deepEqual(state(f),before);assert.deepEqual(f.owner.colPoint,cache);
});

test('custom solid legacy counts snap to native pitch and preserve all collider caches reversibly',()=>{
 const f=fixture(),before=state(f),cache=copy(f.owner.colPoint),scene=JSON.stringify(f.source.data);f.owner.wallHasGate=true;f.owner.wallRun=JSON.stringify({left:3,right:5,gate:false,start:'post',end:'post',spacing:2});f.Runtime.apply(f.owner);
 assert.equal(f.owner.wallHasGate,false);assert.equal(f.owner.ndAniMain.skeletonData.skeletonJson.wallKit.layout.leftCount,8);assert(f.all.some(c=>c.tag===0&&!c.enabled));assertGeometry(f);
 for(const s of [f.owner.ndAniMain,f.owner.ndAniDown])for(const skin of s.skeletonData.skeletonJson.skins.filter(s=>Kit.skins.includes(s.name)))assert(!Object.keys(skin.attachments).some(n=>/^men/.test(n)||n===Door.slot),'A solid wall has no gate artwork');
 assert.equal(JSON.stringify(f.source.data),scene);f.Runtime.dispose(f.owner);assert.equal(f.owner.wallHasGate,true);assert.deepEqual(state(f),before);assert.deepEqual(f.owner.colPoint,cache);
});

test('bent native runs use separate convex level fixtures and clean up extras during same-frame rebuilds',()=>{
 const f=fixture(),before=state(f),cache=copy(f.owner.colPoint),run=bentRun();assert(Kit.validRun(run));f.owner.wallRun=JSON.stringify(run);const prototype=f.owner.ndAniOther[0].node.physics[0];prototype.offset={x:7,y:-3};prototype.density=2.7;prototype.friction=.65;prototype.restitution=.4;prototype.sensor=true;
 f.Runtime.apply(f.owner);assertGeometry(f);const extras=f.all.filter(c=>c.isCreated&&!c.destroyed);assert.equal(extras.length,3);const tier1=extras.find(c=>c.tag===1);for(const key of ['density','friction','restitution','sensor','offset'])assert.deepEqual(tier1[key],prototype[key]);
 f.owner.wallRun=JSON.stringify({...run,routes:{...run.routes,left:[{u:0,v:0},{u:-1,v:0},{u:-1,v:3}]}});f.Runtime.apply(f.owner);assert(extras.every(c=>c.destroyed&&c.tag===0&&!c.enabled));assertGeometry(f);assert.equal(f.all.filter(c=>c.isCreated&&!c.destroyed).length,3,'Rebuild ignores deferred-destruction extras');assert.equal(f.stopped.length,3);
 f.Runtime.dispose(f.owner);assert.equal(f.all.filter(c=>c.isCreated&&!c.destroyed).length,0);assert.equal(f.stopped.length,6);assert.deepEqual(state(f),before);assert.deepEqual(f.owner.colPoint,cache);
});

test('disabled level fixtures never initialize ghost Box2D shapes during fitting or disposal',()=>{
 const f=fixture();for(const c of f.all)c.enabled=false;f.owner.wallRun=JSON.stringify(bentRun());f.Runtime.apply(f.owner);assert(f.all.every(c=>!c.applied));assert(f.all.every(c=>!c.enabled));f.Runtime.dispose(f.owner);assert(f.all.every(c=>!c.applied));
});

test('matched and recovered original CQ2 fitting survive every compass face, local transform and refit',()=>{
 for(const original of [false,true])for(const face of ['NW','NE','SW','SE']){
  const f=fixture({original,adjustmentsData:{version:1,poses:{}}});f.owner.wallFacing=face;const sx=Facing.mirrorX(face)?-1:1;for(const s of [f.owner.ndAniMain,f.owner.ndAniDown,...f.owner.ndAniOther]){const m=s.node.world;s.node.world=[sx*Math.abs(m[0]),0,0,Math.abs(m[3]),m[4],m[5]];}f.owner.ndAniDown.node.world[4]+=17;f.owner.ndAniDown.node.world[5]-=23;
  const main=f.owner.ndAniMain.skeletonData,down=f.owner.ndAniDown.skeletonData,layout=f.plan();f.Runtime.apply(f.owner);const fitted=f.owner._wallRunRuntime.parts.map(p=>p.clone),t=Maps.multiply(Maps.inverse(f.owner.ndAniDown.node.world),f.owner.ndAniMain.node.world),expected=Kit.fitGatePart(down.skeletonJson,layout,{frameToLocal:t});assert.deepEqual(f.owner.ndAniDown.skeletonData.skeletonJson,expected);
  f.FacingRuntime.apply(f.owner);for(const s of [f.owner.ndAniMain,f.owner.ndAniDown])for(const tier of Kit.skins){const skin=s.skeletonData.skeletonJson.skins.find(s=>s.name===tier);assert(skin);if(original){if(tier===Kit.skins[1])assert.equal(Object.keys(skin.attachments).filter(n=>/^men2_mu/.test(n)).length,2,'Recovered native halves retain authored sliding panels');}else if(s===f.owner.ndAniMain){assert.deepEqual(Object.keys(skin.attachments[Door.slot]),['rts_door_closed']);for(const opening of ['inward','outward'])for(const base of ['open','open_night','shut','shut_night']){const json=s.skeletonData.skeletonJson,clip=Facing.animation(json,base,opening),state=base.startsWith('shut')?'closed':((opening==='inward')!==Facing.reverse(face)?'inward':'outward'),tracks=json.animations[clip].slots;assert.equal(tracks[Door.slot].attachment[0].name,state==='closed'?'rts_door_closed':null);for(const id of ['near','far']){const slot=Door.partSlots[id],attachment=tracks[slot].attachment[0].name;if(state==='closed')assert.equal(attachment,null);else assert.equal(skin.attachments[slot][attachment].path,json.wallDoor.tiers[Kit.skins.indexOf(tier)].states[state].parts.find(part=>part.id===id).path);}}}else assert.deepEqual(skin.attachments,{},'Matched CQ2 never duplicates the door or its posts');}
  const outward=[f.owner.ndAniMain.skeletonData,f.owner.ndAniDown.skeletonData];f.owner.wallRun=JSON.stringify(Kit.nativeRun({left:4,right:3,gate:true,start:'post',end:'post'}));f.Runtime.apply(f.owner);assert(fitted.every(d=>d.destroyed));if(Facing.reverse(face))assert(outward.every(d=>d.destroyed));f.FacingRuntime.apply(f.owner);f.Runtime.dispose(f.owner);assert.strictEqual(f.owner.ndAniMain.skeletonData,main);assert.strictEqual(f.owner.ndAniDown.skeletonData,down);assert.equal(main.refs,1);assert.equal(down.refs,1);
 }
});

test('failure parsing the paired CQ2 clone leaves both current halves and fixture geometry intact',()=>{
 const f=fixture({failParse:data=>data.skeletonJson&&data.skeletonJson.wallGate&&data.name.endsWith('modular')}),main=f.owner.ndAniMain.skeletonData,down=f.owner.ndAniDown.skeletonData,before=state(f),cache=copy(f.owner.colPoint);assert.throws(()=>f.Runtime.apply(f.owner),/could not be parsed/);assert.strictEqual(f.owner.ndAniMain.skeletonData,main);assert.strictEqual(f.owner.ndAniDown.skeletonData,down);assert.equal(main.refs,1);assert.equal(down.refs,1);assert.deepEqual(state(f),before);assert.deepEqual(f.owner.colPoint,cache);assert(f.made.filter(d=>!Object.values(f.assets).includes(d)).every(d=>d.destroyed));
});

test('solid runs never run gate proximity, opening or ally-passage code',()=>{
 const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallBuildWall.js'),'utf8');for(const name of ['doTime','hasFriendlyAtGate','getNavigationGateShapes']){const marker='_ctor.prototype.'+name+' = function',start=source.indexOf(marker),end=source.indexOf('\n  };',start),text=source.slice(start,end+5).replace('_ctor.prototype.'+name,'result.fn'),context={result:{}};require('node:vm').runInNewContext(text,context);const owner={index:1,isDestroyed:false,wallHasGate:false,node:{activeInHierarchy:true}};const value=context.result.fn.call(owner);if(name==='hasFriendlyAtGate')assert.equal(value,false);if(name==='getNavigationGateShapes')assert.equal(value.length,0);}
});


test('fixture initialization failure restores both native assets, prior gate behavior and geometry',()=>{
 let failed=false;const f=fixture({failApply:()=>{if(failed)return false;failed=true;return true;}}),main=f.owner.ndAniMain.skeletonData,down=f.owner.ndAniDown.skeletonData,before=state(f),cache=copy(f.owner.colPoint);f.owner.wallHasGate=true;f.owner.wallRun=JSON.stringify({...bentRun(),gate:false});assert.throws(()=>f.Runtime.apply(f.owner),/Physics initialization failed/);assert.strictEqual(f.owner.ndAniMain.skeletonData,main);assert.strictEqual(f.owner.ndAniDown.skeletonData,down);assert.equal(f.owner.wallHasGate,true);assert(!f.owner._wallRunRuntime);assert.deepEqual(state(f),before);assert.deepEqual(f.owner.colPoint,cache);assert.equal(main.refs,1);assert.equal(down.refs,1);
});

test('exported runs reuse existing per-tier stretch colliders without quadratic component growth',()=>{
 const f=fixture(),node=f.owner.ndAniOther[0].node,originals=node.physics.slice(),run=bentRun();for(const original of originals){const c=node.addComponent('physics');delete c.isCreated;c.tag=original.tag;c.points=copy(original.points);f.owner.colPoint[c.uuid]=copy(c.points);}run._fixtureTags=[f.owner.node.physics.map(c=>c.tag),node.physics.map(c=>c.tag),...f.owner.ndAniOther.slice(1).map(s=>s.node.physics.map(c=>c.tag))];f.owner.wallRun=JSON.stringify(run);const before=state(f),cache=copy(f.owner.colPoint),count=f.all.length;f.Runtime.apply(f.owner);assertGeometry(f);assert.equal(f.all.length,count,'Exported per-stretch fixtures are reused, not cloned for every existing collider');f.Runtime.dispose(f.owner);assert.deepEqual(state(f),before);assert.deepEqual(f.owner.colPoint,cache);
});

test('baked default collider metadata restores unused tier tags before a new corner is fitted',()=>{
 const f=fixture(),nodes=[f.owner.node,...f.owner.ndAniOther.map(s=>s.node)];f.owner.wallFixtureTags=JSON.stringify(nodes.map(n=>n.physics.map(c=>c.tag)));for(const node of nodes.slice(3))for(const c of node.physics){c.tag=0;c.enabled=false;}const before=state(f),cache=copy(f.owner.colPoint);f.owner.wallRun=JSON.stringify({...bentRun(),end:'corner'});f.Runtime.apply(f.owner);assertGeometry(f);for(const tier of [1,2,3])assert(f.owner.ndAniOther[3].node.physics.some(c=>c.tag===tier));f.Runtime.dispose(f.owner);assert.deepEqual(state(f),before);assert.deepEqual(f.owner.colPoint,cache);
});

test('scene teardown retires child colliders and Spine components before the wall controller without unsafe restores or reference leaks',()=>{
 const f=fixture(),original=f.owner.ndAniMain.skeletonData,sourceRefs=Object.values(f.assets).map(data=>[data,data.refs]);f.owner.wallRun=JSON.stringify(bentRun());f.Runtime.apply(f.owner);
 const state=f.owner._wallRunRuntime,clones=state.parts.map(part=>part.clone),{enabledProperty,protect}=require('./component-lifetime-harness.cjs');
 f.cc.director={_compScheduler:{enableComp(){},disableComp(){}}};const enabled=enabledProperty(f.cc);
 const retired=f.all.filter(c=>c.node===f.owner.ndAniOther[0].node);
 for(const c of retired){c._enabled=false;Object.defineProperty(c,'enabled',enabled);c.destroyed=true;c.node=null;}
 for(const trigger of f.triggers){protect(trigger,'points');trigger.destroyed=true;trigger.node=null;}
 for(const part of state.parts){protect(part.component,'skeletonData');part.component.destroyed=true;part.component.node=null;}
 assert.doesNotThrow(()=>f.Runtime.dispose(f.owner));assert(!f.owner._wallRunRuntime);assert(clones.every(data=>data.destroyed));for(const [data,refs]of sourceRefs)assert.equal(data.refs,refs,'Each owned source reference is released even when its renderer was destroyed first');
 assert.doesNotThrow(()=>f.Runtime.dispose(f.owner),'Repeated controller cleanup cannot release assets twice');assert.equal(original.refs,1);
});

test('pending-destroy wall fixtures, trigger nodes and renderers are untouched while surviving fixtures restore their authored geometry',()=>{
 const f=fixture(),before=state(f),refs=Object.values(f.assets).map(data=>[data,data.refs]);f.owner.wallRun=JSON.stringify(bentRun());f.Runtime.apply(f.owner);const runtime=f.owner._wallRunRuntime,{protect}=require('./component-lifetime-harness.cjs');
 const retiredNode=f.owner.ndAniOther[0].node;retiredNode.toDestroy=true;for(const c of f.all.filter(c=>c.node===retiredNode)){protect(c,'enabled');protect(c,'points');}
 for(const t of f.triggers){protect(t,'points');t.toDestroy=true;}
 for(const part of runtime.parts){protect(part.component,'skeletonData');part.component.toDestroy=true;}
 assert.doesNotThrow(()=>f.Runtime.dispose(f.owner));const live=f.all.filter(c=>!c.isCreated&&c.node!==retiredNode);for(const c of live){const expected=before[f.all.indexOf(c)];assert.equal(c.tag,expected.tag);assert.equal(c.enabled,expected.enabled);assert.deepEqual(c.points,expected.points);}
 for(const [data,count]of refs)assert.equal(data.refs,count);assert(runtime.parts.every(part=>part.clone.destroyed));
});
