'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const Kit=require('../../assets/_script/WallKit'),Maps=require('../../packages/game-data-editor/lib/map-assets'),L=require('../../packages/game-data-editor/worlds/legacy'),M=require('../../packages/game-data-editor/worlds/model');
const root=path.resolve(__dirname,'../..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
function fixture(){
 class Data{constructor(){this.refs=0;this.destroyed=false;}addRef(){this.refs++;}decRef(){this.refs--;if(!this.refs)this.destroyed=true;}getRuntimeData(){return{};}}
 const filename=path.join(root,'assets/_script/WallRunRuntime.js'),unit=new Module(filename,module);unit.filename=filename;unit.paths=module.paths;
 unit.require=name=>name==='WallKit'?Kit:name==='__Data'?Data:Module.prototype.require.call(unit,name);
 unit._compile('var sp={SkeletonData:require("__Data")};var cc={v2:(x,y)=>({x,y}),PhysicsPolygonCollider:"polygon"};\n'+fs.readFileSync(filename,'utf8'),filename);
 const source=L.inspect(root,'Map01'),config=M.clone(L.read(root,L.configFile('A'))),stage=L.adaptStage(root,'A',1,{...config.LevelCfg[0],prefab:'Map01'}),wall=stage.buildings.find(b=>b.kind===6),info=source.info,c=source.data[info.byId[wall.template.node].ownerComponent],nodes=new Map(),all=[];
 function node(id){if(nodes.has(id))return nodes.get(id);const n=info.byId[id],fixtures=n.components.filter(c=>c.value.__type__==='cc.PhysicsPolygonCollider').map(c=>({uuid:'collider-'+c.id,tag:c.value.tag,points:c.value.points.map(p=>({x:p.x,y:p.y})),offset:M.clone(c.value.offset||{x:0,y:0}),enabled:c.value._enabled!==false,apply(){this.applied=(this.applied||0)+1;}}));const mock={activeInHierarchy:true,convertToWorldSpaceAR:p=>Maps.point(n.world,p),convertToNodeSpaceAR:p=>Maps.point(Maps.inverse(n.world),p),getComponents:()=>fixtures};nodes.set(id,mock);all.push(...fixtures);return mock;}
 const assets={};function skeleton(ref){const s=source.data[ref.__id__],id=s._N$skeletonData.__uuid__;if(!assets[id]){let folder;for(const a of ['cq1','cq2','cq3','cq4'])if(read('assets/KinghtFallIconMap/com/Ani/cq/'+a+'/'+a+'.json.meta').uuid===id)folder=a;assert(folder);const data=new Data();data.addRef();data.skeletonJson=read('assets/KinghtFallIconMap/com/Ani/cq/'+folder+'/'+folder+'.json');data.atlasText='shared atlas';data.textureNames=['old.png','wall-rts.png'];data.textures=[{},{}];data.scale=1;data._uuid=id;assets[id]=data;}return{node:node(s.node.__id__),skeletonData:assets[id]};}
 const owner={node:node(wall.template.node),ndAniMain:skeleton(c.ndAniMain),ndAniOther:c.ndAniOther.map(skeleton),wallRun:'',colPoint:{}};all.forEach(c=>owner.colPoint[c.uuid]=M.clone(c.points));
 return{Runtime:unit.exports,owner,source,assets,all};
}

test('runtime fits existing walls using owned skeleton data without touching source geometry or fixtures',()=>{
 const f=fixture(),source=f.owner.ndAniMain.skeletonData,bytes=JSON.stringify(source.skeletonJson),scene=JSON.stringify(f.source.data),fixtures=JSON.stringify(f.all.map(c=>({tag:c.tag,points:c.points})));f.Runtime.apply(f.owner);const clone=f.owner.ndAniMain.skeletonData;
 assert.notEqual(clone,source);assert.equal(source.refs,2);assert.equal(JSON.stringify(source.skeletonJson),bytes);assert.equal(JSON.stringify(f.source.data),scene);assert.equal(JSON.stringify(f.all.map(c=>({tag:c.tag,points:c.points}))),fixtures);assert.strictEqual(clone.textures[1],source.textures[1]);
 f.Runtime.apply(f.owner);assert.strictEqual(f.owner.ndAniMain.skeletonData,clone,'Reuse the fitted data on subsequent upgrades');
 f.Runtime.dispose(f.owner);assert.strictEqual(f.owner.ndAniMain.skeletonData,source);assert.equal(source.refs,1);assert.equal(clone.refs,0);assert(clone.destroyed);
});

test('custom solid runs update fixtures and the authored collider cache, then dispose reversibly',()=>{
 const f=fixture(),before=f.all.map(c=>({tag:c.tag,points:M.clone(c.points),enabled:c.enabled})),cache=M.clone(f.owner.colPoint),scene=JSON.stringify(f.source.data);f.owner.wallRun=JSON.stringify({left:3,right:5,gate:false,start:'post',end:'post',spacing:2});
 f.Runtime.apply(f.owner);assert.equal(f.owner.wallHasGate,false);assert.equal(f.owner.ndAniMain.skeletonData.skeletonJson.wallKit.layout.leftCount,3);assert(f.all.some(c=>c.tag===0&&!c.enabled),'Unused fixed-wing fixtures are disabled');
 for(const c of f.all.filter(c=>c.tag>0))assert.deepEqual(f.owner.colPoint[c.uuid],c.points,'Build and upgrade tweens use the new authored footprint');
 assert.equal(JSON.stringify(f.source.data),scene);f.Runtime.dispose(f.owner);assert.deepEqual(f.all.map(c=>({tag:c.tag,points:c.points,enabled:c.enabled})),before);assert.deepEqual(f.owner.colPoint,cache);
});

test('solid runs never run gate proximity, opening or ally-passage code',()=>{
 const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallBuildWall.js'),'utf8');
 for(const name of ['doTime','hasFriendlyAtGate','getNavigationGateShapes']){const marker='_ctor.prototype.'+name+' = function',start=source.indexOf(marker),end=source.indexOf('\n  };',start),text=source.slice(start,end+5).replace('_ctor.prototype.'+name,'result.fn'),context={result:{}};require('node:vm').runInNewContext(text,context);const owner={index:1,isDestroyed:false,wallHasGate:false,node:{activeInHierarchy:true}};const value=context.result.fn.call(owner);if(name==='hasFriendlyAtGate')assert.equal(value,false);if(name==='getNavigationGateShapes')assert.equal(value.length,0);}
});
