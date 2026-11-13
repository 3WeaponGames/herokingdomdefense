'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),FX=require('../../../assets/_script/BuildingDropShadow'),Data=require('../buildings/drop-shadow-data'),{Store}=require('../lib/store');
const root=path.resolve(__dirname,'../../..'),clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){const store=new Store(root);return{store,get config(){return store.documents.A.data;},get overrides(){return store.documents.overrides.data;},change(request,action){store.change({version:store.version,edits:Data.edits(store.documents.A.data,store.documents.overrides.data,request,action)});}};}
test('Global is a read-only default and untouched projects retain their existing runtime shadows',()=>{
 const f=fixture(),before=f.store.draftState(),request={id:'2',familyRoot:4,levelIndex:3},d=Data.describe(f.config,f.overrides,request);assert.equal(d.mode,'global');assert(!d.active);assert.deepEqual(d.settings,FX.defaults);assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0);assert(f.store.save({version:f.store.version}).result.noChanges);
});
test('global shares all five settings while Individual snapshots the current look and existing Tier presets take precedence',()=>{
 const f=fixture(),request={id:'2',familyRoot:4,levelIndex:3},category=f.config.BuildEnum[2],row=category.levelList[3],preset={angle:65,distance:42,spread:18,size:21,opacity:.37};
 f.change(request,{kind:'settings',settings:preset});for(const id of ['1','2','3','4','5','6'])for(const r of f.config.BuildEnum[id].levelList){const e=FX.resolve(f.config.BuildEnum[id],r,f.overrides);assert(e.active);assert.deepEqual(e.settings,preset);}
 f.change(request,{kind:'mode',mode:'individual'});assert.deepEqual(FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[3],f.overrides).settings,preset);
 const other={...preset,angle:-40,size:5};f.change(request,{kind:'mode',mode:'tier'});assert.deepEqual(FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[3],f.overrides).settings,preset,'First tier preset inherits Global exactly');
 f.change(request,{kind:'settings',settings:other});f.change(request,{kind:'mode',mode:'global'});assert.deepEqual(FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[3],f.overrides).settings,preset);f.change(request,{kind:'mode',mode:'tier'});assert.deepEqual(FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[3],f.overrides).settings,other,'Existing tier preset is retained');
});
test('tier checkboxes link only the selected family members; None suppresses without losing settings and undo is atomic',()=>{
 const f=fixture(),request={id:'2',familyRoot:4,levelIndex:3};f.overrides.future={keep:true};f.config.BuildEnum[2].levelList[3].DropShadow={version:1,mode:'global',future:{keep:7}};const before=f.store.draftState();
 f.change(request,{kind:'mode',mode:'tier'});f.change(request,{kind:'tier',index:5,position:4,checked:true});const p={...FX.defaults,opacity:.6,distance:50};f.change(request,{kind:'settings',settings:p});
 for(const position of [3,4])assert.deepEqual(FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[position],f.overrides).settings,p);
 assert.equal(FX.mode(f.config.BuildEnum[2].levelList[0]),'global');assert.throws(()=>f.change(request,{kind:'tier',index:1,position:0,checked:true}),/tier changed/);
 f.change(request,{kind:'mode',mode:'none'});const e=FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[3],f.overrides);assert(!e.active);assert.deepEqual(e.settings,p);assert.equal(f.config.BuildEnum[2].levelList[3].DropShadow.future.keep,7);assert.deepEqual(f.overrides.future,{keep:true});f.store.undo({version:f.store.version});assert.equal(FX.mode(f.config.BuildEnum[2].levelList[3]),'tier');
 assert.deepEqual(Data.issues(f.overrides.buildingShadows),[]);assert(Data.rowIssues({version:1,mode:'individual',settings:{...p,size:Infinity}}).length);assert(Data.issues({version:1,global:{...p,opacity:2}}).length);
});
test('texture shadows retain alpha holes, move opposite the light and vary from hard to soft with bounded pixels',()=>{
 const alpha=new Uint8Array(20*20);for(let y=3;y<17;y++)for(let x=3;x<17;x++)if(!(x>=8&&x<12&&y>=8&&y<12))alpha[y*20+x]=255;
 const source={alpha,pixelWidth:20,pixelHeight:20,x:0,y:0,width:20,height:20},p={angle:0,distance:10,spread:0,size:0,opacity:.5},hard=FX.raster(source,p),soft=FX.raster(source,{...p,size:6}),dense=FX.raster(source,{...p,spread:100,size:6});
 assert.equal(hard.x,-12);assert.equal(hard.y,-2);assert([...hard.pixels].every((v,i)=>i%4===3||v===0));assert(hard.pixels.some((v,i)=>i%4===3&&v===128));assert(soft.pixels.some((v,i)=>i%4===3&&v>0&&v<100));assert.equal(source.alpha,alpha);assert.equal(alpha[9*20+9],0);
 const area=r=>r.pixels.reduce((n,v,i)=>n+(i%4===3&&v>0?1:0),0);assert(area(dense)>area(hard));const up=FX.raster(source,{...p,angle:90});assert(Math.abs(up.x+2)<1e-8);assert.equal(up.y,-12);assert.throws(()=>FX.raster({...source,pixelWidth:5000},p),/silhouette/);
});
