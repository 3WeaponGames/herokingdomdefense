'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Group=require('../buildings/scale-group'),Scale=require('../../../assets/_script/BuildingWorldScale'),Data=require('../buildings/scale-data'),{Store}=require('../lib/store'),{Service}=require('../worlds/service');
const root=path.resolve(__dirname,'../../..'),clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){const store=new Store(root),service=new Service(root,{previewConfig:()=>store.documents.A.data});return{store,service,config:store.documents.A.data};}
test('all-tier previews contain only the selected construction family and never seed or save sizes',()=>{
 const f=fixture(),before=f.store.draftState(),bytes=fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'));
 for(const [id,familyRoot]of [['1',1],['2',4],['3',11],['6',1]]){
  const levelIndex=f.config.BuildEnum[id].levelList.findIndex(r=>r.index===familyRoot),request={id,levelIndex,familyRoot,allTiers:true},family=Group.family(f.config,request),d=Data.describe(f.service,request);
  assert.equal(d.tiers.length,family.branches.length);assert.deepEqual(d.tiers.map(t=>t.index).sort((a,b)=>a-b),family.branches.map(t=>t.index).sort((a,b)=>a-b));assert(d.tiers.every(t=>t.record.sprites.length+t.record.skeletons.length>0));if(id==='6')assert.deepEqual(d.tiers.map(t=>t.level),[1,2,3]);
 }
 assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0);assert.deepEqual(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json')),bytes);
});
test('group scaling preserves tier proportions and changes every selected tier in one undoable transaction',()=>{
 const f=fixture(),request={id:'2',levelIndex:0,familyRoot:1},family=Group.family(f.config,request),sizes=[.6,.9,1.3,1.6];family.branches.forEach((b,i)=>{b.record.WorldScale=sizes[i];b.record.future={retained:i};});
 const before=f.store.draftState(),tiers=family.branches.map(b=>({index:b.index,position:b.position,worldScale:Scale.value(b.record)})),selected=new Set(tiers.map(t=>t.index)),values=Group.changes(tiers,selected,.8),edits=Group.edits(f.config,request,values);f.store.change({version:f.store.version,edits});
 const expected=clone(before);values.forEach(v=>expected.A.BuildEnum[2].levelList[v.position].WorldScale=v.value);assert.deepEqual(f.store.draftState(),expected);assert.equal(f.store.undoStack.length,1);family.branches.forEach((b,i)=>assert(Math.abs(f.store.documents.A.data.BuildEnum[2].levelList[b.position].WorldScale-sizes[i]*.8)<1e-8));f.store.undo({version:f.store.version});assert.deepEqual(f.store.draftState(),before);
});
test('deselected tiers retain their sizes and empty, stale, cross-family or duplicate selections are rejected',()=>{
 const f=fixture(),request={id:'2',levelIndex:0,familyRoot:1},family=Group.family(f.config,request),tiers=family.branches.map(b=>(b.record.WorldScale=1,{index:b.index,position:b.position,worldScale:1})),selected=new Set([tiers[0].index,tiers[2].index]),before=f.store.draftState(),values=Group.changes(tiers,selected,.75);
 assert.equal(values.length,2);const edits=Group.edits(f.config,request,values);f.store.change({version:f.store.version,edits});const expected=clone(before);for(const v of values)expected.A.BuildEnum[2].levelList[v.position].WorldScale=.75;assert.deepEqual(f.store.draftState(),expected);
 const current=f.store.documents.A.data;assert.throws(()=>Group.changes(tiers,new Set(),1),/selected tiers/);assert.throws(()=>Group.edits(current,request,values),/resized elsewhere/);assert.throws(()=>Group.edits(current,request,[{position:4,index:4,from:1,value:.8}]),/tiers changed/);assert.throws(()=>Group.edits(current,request,[{...values[0],from:.75},{...values[0],from:.75}]),/tiers changed/);
});
test('group limits keep every tier in range without clipping individual proportions',()=>{
 const tiers=[{index:1,position:0,worldScale:.05},{index:2,position:1,worldScale:10}],selected=new Set([1,2]);assert.deepEqual(Group.limits(tiers,selected),{min:1,max:1});assert.throws(()=>Group.changes(tiers,selected,.8),/between/);assert.throws(()=>Group.changes(tiers,selected,1.2),/between/);assert.deepEqual(Group.changes(tiers,selected,1).map(t=>t.value),[.05,10]);
});
