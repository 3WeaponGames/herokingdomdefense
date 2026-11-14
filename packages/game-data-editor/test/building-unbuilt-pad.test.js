'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Data=require('../buildings/purchase-data'),Group=require('../buildings/scale-group'),Maps=require('../lib/map-assets'),Settings=require('../../../assets/_script/BuildingPurchaseField'),{Store}=require('../lib/store'),{Service}=require('../worlds/service'),{Node,Vec2}=require('../../../tools/navigation/runtime-harness.cjs');
const root=path.resolve(__dirname,'../../..'),near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(){const store=new Store(root),service=new Service(root,{previewConfig:()=>store.documents.A.data});return{store,service,get config(){return store.documents.A.data;}};}
test('unbuilt card is optional, independent of body/purchase transforms and restores its original local pose',()=>{
 const map=new Node('map'),ownerNode=new Node('body',map,50,80),parent=new Node('price',map,120,-100),field=new Node('first',parent),card=new Node('ndLock',field,-80,60),owner={node:ownerNode,ndLockList:[field],buildCfg:{enumValue:2}};
 const unit={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingPurchaseFieldRuntime.js'),'utf8'),{exports:unit.exports,cc:{v2:(x,y)=>typeof x==='object'?new Vec2(x.x,x.y):new Vec2(x,y),isValid:n=>!!n},require:n=>n==='BuildingPurchaseField'?Settings:null});
 unit.exports.applyUnbuilt(owner);near(card.x,-80);near(card.y,60);
 owner.buildCfg.UnbuiltPad={x:20,y:40};unit.exports.applyUnbuilt(owner);let p=card.convertToWorldSpaceAR(new Vec2());near(p.x,70);near(p.y,120);
 Object.assign(ownerNode,{x:180,y:230,scaleX:.5,scaleY:.5});owner._buildingWorldScaleRuntime={x:50,y:80,scaleX:1,scaleY:1};parent.setPosition(-250,300);parent.scaleX=-1;unit.exports.applyUnbuilt(owner);p=card.convertToWorldSpaceAR(new Vec2());near(p.x,70);near(p.y,120);
 delete owner.buildCfg.UnbuiltPad;unit.exports.applyUnbuilt(owner);near(card.x,-80);near(card.y,60);
});
test('preview card has its original sprite and a shared independent position across differently scaled tiers without writes',()=>{
 const f=fixture(),category=f.config.BuildEnum[3];category.UnbuiltPad={x:25,y:55,future:'keep'};const group=Group.family(f.config,{id:'3',levelIndex:0,familyRoot:11});
 group.branches.forEach((b,i)=>{b.record.WorldScale=.5+i*.2;b.record.ModelOffset={x:i*30,y:-i*15};});const before=f.store.draftState(),count=f.store.changes().length;let target;
 for(const b of group.branches){const d=Data.describe(f.service,{id:'3',levelIndex:b.position,familyRoot:11}),card=d.unbuiltPad;assert(card&&card.record.sprites.length);assert.deepEqual(card.position,{x:25,y:55});const m=card.record.sprites[0].matrix,p={x:m[4]-card.record.origin.x,y:m[5]-card.record.origin.y};if(target){near(p.x,target.x);near(p.y,target.y);}target=p;}
 assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,count);
});
test('apply-to-all pad placement preserves one physical position, other families and unknown fields with revision protection',()=>{
 const f=fixture(),request={id:'2',levelIndex:4,familyRoot:4},group=Group.family(f.config,request),other=JSON.stringify(f.config.BuildEnum[2].levelList[0]);group.branches.forEach((b,i)=>{b.record.WorldScale=.6+i*.25;b.record.PurchaseField={x:i*15,y:-10,keep:'yes'};});const before=f.store.draftState();
 const plan=Data.place(f.service,{...request,variant:'default',value:{southwest:true,x:42,y:13},allTiers:true});assert.equal(plan.edits.length,4);f.store.change({version:f.store.version,edits:Data.alignmentEdits(f.config,request,plan)});let expected;
 for(const b of group.branches){const d=Data.describe(f.service,{...request,levelIndex:b.position}),r=d.records.southwest.purchaseField.center,v=Maps.point(d.offsetMatrix,d.settings),p={x:r.x+v.x,y:r.y+v.y};if(expected){near(p.x,expected.x);near(p.y,expected.y);}expected=p;assert.equal(b.record.PurchaseField.keep,'yes');}
 assert.equal(JSON.stringify(f.config.BuildEnum[2].levelList[0]),other);assert.throws(()=>Data.alignmentEdits(f.config,request,plan),/changed/);f.store.undo({version:f.store.version});assert.deepEqual(f.store.draftState(),before);
});
test('all-tier building movement accounts for tier scales without changing pads or other tower families',()=>{
 const f=fixture(),request={id:'2',levelIndex:4,familyRoot:4},group=Group.family(f.config,request);group.branches.forEach((b,i)=>{b.record.WorldScale=.5+i*.3;b.record.ModelOffset={x:3,y:4,keep:'yes'};});const first=group.branches.find(b=>b.position===4),pad=JSON.stringify(first.record.PurchaseField),edits=Data.modelEdits(f.config,request,{x:40,y:-20},true);assert.equal(edits.length,4);
 for(const edit of edits){const row=f.config.BuildEnum[2].levelList[edit.path[3]];near(edit.value.x*row.WorldScale,40*first.record.WorldScale);near(edit.value.y*row.WorldScale,-20*first.record.WorldScale);assert.equal(edit.value.keep,'yes');}assert.equal(JSON.stringify(first.record.PurchaseField),pad);assert.equal(Data.modelEdits(f.config,request,{x:4,y:8},false).length,1);
});
