'use strict';
// Production Map03 geometry and wall-kit data, exercised without an editor or
// player save. Rubble remains presentation-only and reads detached rigs.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Kit=require('../../assets/_script/WallKit'),Assembly=require('../../assets/_script/WallAssembly'),Ground=require('../../assets/_script/WallShadowGround'),Adjustments=require('../../assets/_script/WallAdjustments');
const root=path.resolve(__dirname,'../..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const serialized=read('assets/KinghtFallIconMap/Map03.prefab');
const sources=Object.fromEntries(['cq1','cq3','cq4'].map(name=>[name,read(`assets/KinghtFallIconMap/com/Ani/cq/${name}/${name}.json`)]));
const close=(a,b,message)=>assert(Math.abs(a-b)<1e-6,`${message||'coordinate'}: ${a} != ${b}`);
const clone=value=>JSON.parse(JSON.stringify(value));
class Node{
 constructor(name=''){Object.assign(this,{name,x:0,y:0,scaleX:1,scaleY:1,angle:0,active:true,anchorX:.5,anchorY:.5,width:0,height:0,parent:null});}
 setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}
 setPosition(x,y){this.x=x;this.y=y;}
 setContentSize(width,height){this.width=width;this.height=height;}
 addComponent(Type){const component=new Type();component.node=this;return component;}
 convertToWorldSpaceAR(p){const r=this.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),q={x:this.x+p.x*this.scaleX*c-p.y*this.scaleY*s,y:this.y+p.x*this.scaleX*s+p.y*this.scaleY*c};return this.parent?this.parent.convertToWorldSpaceAR(q):q;}
 convertToNodeSpaceAR(p){const q=this.parent?this.parent.convertToNodeSpaceAR(p):p,r=-this.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=q.x-this.x,y=q.y-this.y;return{x:(x*c-y*s)/this.scaleX,y:(x*s+y*c)/this.scaleY};}
 destroy(){this.destroyed=true;this.active=false;}
}
function fixture(id=20,tier=1,options={}){
 const nodes=new Map();function node(index){if(nodes.has(index))return nodes.get(index);const row=serialized[index],n=new Node(row._name),v=row._trs?.array||[0,0,0,0,0,0,1,1,1,1];nodes.set(index,n);n.x=v[0];n.y=v[1];n.scaleX=v[7];n.scaleY=v[8];n.angle=Math.atan2(2*v[6]*v[5],1-2*v[5]*v[5])*180/Math.PI;if(row._parent)n.parent=node(row._parent.__id__);return n;}
 const component=serialized.find(row=>row.ID===id&&row.ndAniMain&&row.wallFacing),ownerNode=node(component.node.__id__),mainNode=node(serialized[component.ndAniMain.__id__].node.__id__);
 const endpoints=[];for(const ref of component.ndAniOther){const row=serialized[ref.__id__],sourceNode=node(row.node.__id__);for(const p of sources[sourceNode.name].wallAnchors||[])endpoints.push(mainNode.convertToNodeSpaceAR(sourceNode.convertToWorldSpaceAR(p)));}
 const plan=options.plan||Kit.layout(component.wallRun?JSON.parse(component.wallRun):null,endpoints);
 if(options.transform)Object.assign(mainNode,options.transform);
 const o=mainNode.convertToWorldSpaceAR({x:0,y:0}),x=mainNode.convertToWorldSpaceAR({x:1,y:0}),y=mainNode.convertToWorldSpaceAR({x:0,y:1});
 const mirrorX=(x.x-o.x)*(y.y-o.y)-(x.y-o.y)*(y.x-o.x)<0;
 const adjustments=options.adjustments||{version:1,poses:{}},json=Kit.install(sources.cq1,plan,undefined,{mirrorX,tier,face:component.wallFacing,adjustmentsData:adjustments});
 const native={color:{a:1}},frame={name:'shared debris'},listeners=new Set(),skin='cq-rts-'+tier;
 const source={node:mainNode,skeletonData:{skeletonJson:json},defaultSkin:skin,timeScale:1,getCurrent:()=>({animation:{name:options.pose||'idle'},trackTime:0}),_skeleton:{findSlot:()=>native}};
 const owner={node:ownerNode,ndAniMain:source,ndAniOther:[],buildInfo:{cfg:{Skin:skin}},loadSpriteFrame(_bundle,_name,done){done(frame);}};
 class Sprite{}Sprite.SizeMode={CUSTOM:1};
 const cc={Node,Sprite,color:(r,g,b)=>({r,g,b}),v2:(x,y)=>({x,y}),isValid:value=>!!value&&!value.destroyed,Director:{EVENT_BEFORE_DRAW:'draw'},director:{on(_name,fn){listeners.add(fn);},off(_name,fn){listeners.delete(fn);}}};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingDebris.js'),'utf8'),{cc,exports:module.exports,require:name=>name==='WallAssembly'?Assembly:name==='WallShadowGround'?Ground:require(path.join(root,'assets/_script',name))});
 function local(p){return ownerNode.convertToNodeSpaceAR(mainNode.convertToWorldSpaceAR(p));}
 function destroy(){module.exports.capture(owner);owner.isDestroyed=true;module.exports.update(owner,1);return owner._sharedBuildingDebris;}
 return {api:module.exports,owner,source,plan,json,adjustments,local,destroy,listeners,frame,native};
}
function assertPile(state){
 const record=state.building;
 assert.equal(state.records.length,1);assert.equal(record,state.records[0]);
 assert(record.node.active);assert.equal(record.sprite.spriteFrame.name,'shared debris');
 assert(record.node.width>0&&record.node.width<150,'the pile stays compact');
 close(record.node.height/record.node.width,66/115,'rubble aspect');
 return record.node;
}

test('all actual Map03 gates and tiers leave one compact pile at the doorway',()=>{
 const originalPrefab=JSON.stringify(serialized),originalSources=JSON.stringify(sources);
 for(const id of [18,19,20,21])for(const tier of [1,2,3]){
  const f=fixture(id,tier),before=JSON.stringify(f.json),pile=assertPile(f.destroy());
  const gate=f.local({x:(f.plan.left.x+f.plan.right.x)/2,y:(f.plan.left.y+f.plan.right.y)/2});
  close(pile.x,gate.x,'gate center x');close(pile.y,gate.y,'gate ground y');
  if(id===20)assert(f.owner.node.scaleX<0,'the fixture exercises a mirrored Map03 owner');
  assert.equal(JSON.stringify(f.json),before,'capturing debris cannot change a live detached rig');assert.equal(f.native.color.a,0);
  f.api.clear(f.owner);assert.equal(f.owner._sharedBuildingDebris.records.length,0);assert.equal(f.listeners.size,0);
 }
 assert.equal(JSON.stringify(serialized),originalPrefab);assert.equal(JSON.stringify(sources),originalSources);
});

test('long bent gated walls keep one compact pile under scaled and rotated presentation',()=>{
 const run={nativeVersion:2,left:5,right:7,gate:true,start:'post',end:'post',routes:{left:[{u:0,v:0},{u:-2,v:0},{u:-2,v:3}],right:[{u:0,v:0},{u:4,v:0},{u:4,v:-3}]}},before=clone(run);
 assert(Assembly.valid(run));
 const f=fixture(20,2,{plan:Kit.layout(run),transform:{angle:37,scaleX:-1.2,scaleY:.8}}),pile=assertPile(f.destroy());
 const center=f.local(f.plan.nativeOrigin);
 close(pile.x,center.x);close(pile.y,center.y);assert.deepEqual(run,before);
});

test('a gate-free wall centers its only pile along the built run',()=>{
 const plan=Kit.layout({nativeVersion:2,left:2,right:4,gate:false,start:'post',end:'post'}),f=fixture(20,1,{plan}),pile=assertPile(f.destroy());
 const center=f.local(plan.rightPoints[1]);close(pile.x,center.x);close(pile.y,center.y);
});

test('saved numeric wall-piece offsets are read for pile placement and remain unchanged',()=>{
 const base={version:1,poses:{}},adjustments=Adjustments.edit(base,{tier:2,face:'NE',state:'closed'},{type:'move',id:'wall/gateway/left',x:18,y:11}),before=clone(adjustments);
 const a=assertPile(fixture(20,2).destroy()),b=assertPile(fixture(20,2,{adjustments}).destroy());
 assert(Math.hypot(a.x-b.x,a.y-b.y)>1,'the pile follows the moved gateway pillar');
 assert.deepEqual(adjustments,before);assert.deepEqual(base,{version:1,poses:{}});
});

test('destruction captures the current open-night wall offsets',()=>{
 const base={version:1,poses:{}},adjustments=Adjustments.edit(base,{tier:2,face:'NE',state:'outward'},{type:'move',id:'wall/gateway/left',x:18,y:11}),before=clone(adjustments);
 const closed=fixture(20,2,{adjustments}),open=fixture(20,2,{adjustments,pose:'open_outward_night'}),normal=fixture(20,2,{pose:'open_outward_night'});
 assert(open.json.animations.open_outward_night,'test uses the shipped open-night track');
 const a=assertPile(closed.destroy()),b=assertPile(open.destroy()),c=assertPile(normal.destroy());
 assert(Math.hypot(a.x-b.x,a.y-b.y)>1,'the pile reflects the current open pose');
 close(a.x,c.x);close(a.y,c.y);assert.deepEqual(adjustments,before);
});
