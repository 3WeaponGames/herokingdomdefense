'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),FX=require('../../../assets/_script/BuildingDropShadow'),Data=require('../buildings/drop-shadow-data'),{Store}=require('../lib/store');
const root=path.resolve(__dirname,'../../..'),clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){const store=new Store(root);for(const state of ['original','data']){for(const category of Object.values(store.documents.A[state].BuildEnum))for(const row of category.levelList||[]){delete row.DropShadow;delete row.Shadow;}delete store.documents.overrides[state].buildingShadows;}return{store,get config(){return store.documents.A.data;},get overrides(){return store.documents.overrides.data;},change(request,action){store.change({version:store.version,edits:Data.edits(store.documents.A.data,store.documents.overrides.data,request,action)});}};}
test('Global uses the recovered ground defaults without creating or saving a preset on open',()=>{
 const f=fixture(),before=f.store.draftState(),request={id:'2',familyRoot:4,levelIndex:3},d=Data.describe(f.config,f.overrides,request);assert.equal(d.mode,'global');assert(d.active);assert(!d.saved);assert.deepEqual(d.settings,FX.defaults);assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0);assert(f.store.save({version:f.store.version}).result.noChanges);
});
test('restarts and legacy projection fields always resolve to the approved ground preset',()=>{
 const expected={projection:'ground',angle:-74,spread:100,size:0,opacity:.203,length:.89,flatten:.82,groundDepth:0,base:0,taper:.17,fade:0,straighten:.57};assert.deepEqual(FX.defaults,expected);assert.deepEqual(FX.settings(),expected);assert.equal(FX.ranges.distance,undefined);assert.equal(FX.settings({distance:500,projection:'offset'}).distance,undefined);assert.equal(FX.settings({projection:'offset'}).projection,'ground');assert(!FX.valid({...expected,projection:'offset'}));
 for(const file of ['assets/KinghtFallConfig/GameJsonCfg.json','assets/configs/GameJsonCfg.json']){const config=JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,'')),saved=config.GameTools.buildingShadows.global;assert.equal(FX.settings(saved).projection,'ground');for(const key of Object.keys(FX.ranges))assert.equal(FX.settings(saved)[key],saved[key],file+' retains authored '+key);}
 assert.deepEqual(FX.settings({...expected,angle:28,length:1.2}),{...expected,angle:28,length:1.2});
 const f=fixture(),row=f.config.BuildEnum[2].levelList[3];for(const mode of ['global','tier','individual']){row.DropShadow={version:1,mode};const d=FX.resolve(f.config.BuildEnum[2],row,{});assert(d.active);assert.deepEqual(d.settings,expected);}row.DropShadow.source='polygon';assert(!FX.resolve(f.config.BuildEnum[2],row,{}).active);row.DropShadow={version:1,mode:'none'};assert(!FX.resolve(f.config.BuildEnum[2],row,{}).active);
 assert.throws(()=>f.change({id:'2',familyRoot:4,levelIndex:3},{kind:'settings',settings:{...expected,projection:'offset'}}),/only generated shadow shape/);
});
function pillar(){const alpha=new Uint8Array(40*120);for(let y=0;y<120;y++)for(let x=10;x<30;x++)alpha[y*40+x]=255;return{alpha,pixelWidth:40,pixelHeight:120,x:-20,y:0,width:40,height:120};}
test('legacy authored polygons keep their shape unless the user explicitly selects the generated texture',()=>{
 const row={ID:1,index:1,Shadow:{version:1,body:{mask:[]}}},category={levelList:[row]};assert.equal(FX.resolve(category,row,{}).source,'polygon');assert(!FX.resolve(category,row,{}).active);row.DropShadow={version:1,source:'texture'};assert(FX.resolve(category,row,{}).active);assert.equal(FX.resolve(category,row,{}).settings.projection,'ground');
});
function occupied(image){const points=[];for(let y=0;y<image.pixelHeight;y++)for(let x=0;x<image.pixelWidth;x++){const a=image.pixels[(y*image.pixelWidth+x)*4+3];if(a)points.push({x:image.x+(x+.5)*image.width/image.pixelWidth,y:image.y+image.height-(y+.5)*image.height/image.pixelHeight,a});}return points;}
test('ground projection stays at the feet, flattens tall silhouettes and casts away from the sun',()=>{
 const source=pillar(),before=source.alpha.slice(),p={...FX.defaults,...FX.groundDefaults,projection:'ground',angle:-90,length:1,flatten:.5,taper:0,fade:0,size:0,opacity:1},points=occupied(FX.raster(source,p));
 assert(Math.min(...points.map(p=>p.y))<2,'contact stays on the floor');assert(Math.max(...points.map(p=>p.y))<63,'a 120-high pillar is laid onto a 60-high cast');
 const longer=occupied(FX.raster(source,{...p,length:2}));assert(Math.max(...longer.map(p=>p.y))>115);
 const left=occupied(FX.raster(source,{...p,angle:0}));assert(Math.min(...left.map(p=>p.x))<-120);assert(Math.max(...left.map(p=>p.y))<3,'no upright copy above the floor for a horizontal cast');
 assert.deepEqual(source.alpha,before);assert.deepEqual(FX.raster(source,p),FX.raster(source,{...p,projection:'offset',distance:500}),'legacy tags cannot re-enable a displaced silhouette');
});
test('ground projection tapers and fades at its tip without lightening the contact',()=>{
 const p={...FX.defaults,...FX.groundDefaults,projection:'ground',angle:-90,length:1,flatten:1,groundDepth:0,taper:.7,fade:.8,size:0,opacity:1},points=occupied(FX.raster(pillar(),p)),near=points.filter(p=>p.y<8),far=points.filter(p=>p.y>112),width=ps=>Math.max(...ps.map(p=>p.x))-Math.min(...ps.map(p=>p.x));
 assert(width(far)<width(near)*.6);assert(Math.max(...far.map(p=>p.a))<90);assert(Math.max(...near.map(p=>p.a))>235);
 for(const angle of [-180,-90,0,90,180]){const image=FX.raster(pillar(),{...p,angle,length:3,flatten:1.5});assert(image.pixelWidth<=2048&&image.pixelHeight<=2048);assert(Number.isFinite(image.x+image.y+image.width+image.height));}
});
test('projected settings are optional, validated and preserved across scope/source changes without losing unknown data',()=>{
 const f=fixture(),request={id:'2',familyRoot:4,levelIndex:3},p={...FX.defaults,...FX.groundDefaults,projection:'ground'};f.change(request,{kind:'mode',mode:'individual'});const row=f.config.BuildEnum[2].levelList[3];row.DropShadow.settings.future={keep:true};f.change(request,{kind:'settings',settings:p});f.change(request,{kind:'source',source:'polygon'});f.change(request,{kind:'source',source:'texture'});
 const current=f.config.BuildEnum[2].levelList[3];assert.deepEqual(current.DropShadow.settings.future,{keep:true});assert.equal(FX.resolve(f.config.BuildEnum[2],current,f.overrides).settings.projection,'ground');assert(!FX.valid({...p,length:Infinity}));assert(!FX.valid({...p,projection:'unknown'}));assert(FX.valid(FX.defaults));
});
test('global shares ground settings while Individual snapshots the current look and existing Tier presets take precedence',()=>{
 const f=fixture(),request={id:'2',familyRoot:4,levelIndex:3},category=f.config.BuildEnum[2],row=category.levelList[3],preset={...FX.defaults,angle:65,length:1.2,spread:18,size:21,opacity:.37};
 f.change(request,{kind:'settings',settings:preset});for(const id of ['1','2','3','4','5','6'])for(const r of f.config.BuildEnum[id].levelList){const e=FX.resolve(f.config.BuildEnum[id],r,f.overrides);assert(e.active);assert.deepEqual(e.settings,preset);}
 f.change(request,{kind:'mode',mode:'individual'});assert.deepEqual(FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[3],f.overrides).settings,preset);
 const other={...preset,angle:-40,size:5};f.change(request,{kind:'mode',mode:'tier'});assert.deepEqual(FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[3],f.overrides).settings,preset,'First tier preset inherits Global exactly');
 f.change(request,{kind:'settings',settings:other});f.change(request,{kind:'mode',mode:'global'});assert.deepEqual(FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[3],f.overrides).settings,preset);f.change(request,{kind:'mode',mode:'tier'});assert.deepEqual(FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[3],f.overrides).settings,other,'Existing tier preset is retained');
});
test('tier checkboxes link only the selected family members; None suppresses without losing settings and undo is atomic',()=>{
 const f=fixture(),request={id:'2',familyRoot:4,levelIndex:3};f.overrides.future={keep:true};f.config.BuildEnum[2].levelList[3].DropShadow={version:1,mode:'global',future:{keep:7}};const before=f.store.draftState();
 f.change(request,{kind:'mode',mode:'tier'});f.change(request,{kind:'tier',index:5,position:4,checked:true});const p={...FX.defaults,opacity:.6,length:1.5};f.change(request,{kind:'settings',settings:p});
 for(const position of [3,4])assert.deepEqual(FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[position],f.overrides).settings,p);
 assert.equal(FX.mode(f.config.BuildEnum[2].levelList[0]),'global');assert.throws(()=>f.change(request,{kind:'tier',index:1,position:0,checked:true}),/tier changed/);
 f.change(request,{kind:'mode',mode:'none'});const e=FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[3],f.overrides);assert(!e.active);assert.deepEqual(e.settings,p);assert.equal(f.config.BuildEnum[2].levelList[3].DropShadow.future.keep,7);assert.deepEqual(f.overrides.future,{keep:true});f.store.undo({version:f.store.version});assert.equal(FX.mode(f.config.BuildEnum[2].levelList[3]),'tier');
 assert.deepEqual(Data.issues(f.overrides.buildingShadows),[]);assert(Data.rowIssues({version:1,mode:'individual',settings:{...p,size:Infinity}}).length);assert(Data.issues({version:1,global:{...p,opacity:2}}).length);
});
test('ground shadows retain alpha holes, move opposite the light and vary from hard to soft with bounded pixels',()=>{
 const alpha=new Uint8Array(20*20);for(let y=3;y<17;y++)for(let x=3;x<17;x++)if(!(x>=8&&x<12&&y>=8&&y<12))alpha[y*20+x]=255;
 const source={alpha,pixelWidth:20,pixelHeight:20,x:0,y:0,width:20,height:20},p={...FX.defaults,angle:-90,length:1,flatten:1,taper:0,fade:0,straighten:0,spread:0,size:0,opacity:.5},hard=FX.raster(source,p),soft=FX.raster(source,{...p,size:6}),dense=FX.raster(source,{...p,spread:100,size:6});
 assert([...hard.pixels].every((v,i)=>i%4===3||v===0));assert(hard.pixels.some((v,i)=>i%4===3&&v===128));assert(soft.pixels.some((v,i)=>i%4===3&&v>0&&v<100));assert.equal(source.alpha,alpha);assert.equal(alpha[9*20+9],0);assert(!occupied(hard).some(p=>Math.abs(p.x-10)<1&&Math.abs(p.y-10)<1),'large transparent gaps remain open');
 const area=r=>r.pixels.reduce((n,v,i)=>n+(i%4===3&&v>0?1:0),0);assert(area(dense)>area(hard));const left=occupied(FX.raster(source,{...p,angle:0}));assert(Math.min(...left.map(p=>p.x))<0);assert.throws(()=>FX.raster({...source,pixelWidth:5000},p),/silhouette/);
});
test('edge straightening turns serrated outlines into clean polygon edges while zero preserves exact pixels',()=>{
 const w=140,h=140,alpha=new Uint8Array(w*h);for(let y=20;y<120;y++)for(let x=20+(y%6<3?0:4);x<120;x++)if(!(x>55&&x<85&&y>50&&y<90))alpha[y*w+x]=255;
 const source={alpha,pixelWidth:w,pixelHeight:h,x:0,y:0,width:w,height:h},p={...FX.defaults,angle:-90,length:1,flatten:1,taper:0,fade:0,straighten:0,size:0,opacity:1},raw=FX.raster(source,p),clean=FX.raster(source,{...p,straighten:1});
 assert.deepEqual(raw,FX.raster(source,{...p,straighten:0}));
 function edgeTurns(image){const left=[];for(let y=0;y<image.pixelHeight;y++){let x=0;while(x<image.pixelWidth&&image.pixels[(y*image.pixelWidth+x)*4+3]<128)x++;if(x<image.pixelWidth)left.push(x);}return left.reduce((n,x,i)=>n+(i>0&&x!==left[i-1]?1:0),0);}
 assert(edgeTurns(clean)<edgeTurns(raw)/3,'small sawtooth steps become long segments');
 const at=(image,x,y)=>image.pixels[(Math.floor(image.y+image.height-y)*image.pixelWidth+Math.floor(x-image.x))*4+3];assert.equal(at(clean,70,70),0,'large openings stay transparent');assert.equal(at(clean,40,70),255,'polygon interiors stay solid with zero blur');assert.equal(alpha[20*w+21],255);
 assert(FX.valid({...p,straighten:.7}));assert(!FX.valid({...p,straighten:1.01}));assert(!FX.valid({...p,straighten:NaN}));
});
test('straightening is shared by ground projection, retains fading and bounds fragmented silhouettes',()=>{
 const p={...FX.defaults,...FX.groundDefaults,projection:'ground',angle:-74,length:.89,flatten:.82,groundDepth:0,taper:.17,fade:.6,size:0,opacity:.5,straighten:.75},image=FX.raster(pillar(),p);assert(image.pixels.some((v,i)=>i%4===3&&v>0&&v<100));assert([...image.pixels].every((v,i)=>i%4===3||v===0));
 const w=128,alpha=Uint8Array.from({length:w*w},(_,i)=>(i%w+Math.floor(i/w))%2?0:255),source={alpha,pixelWidth:w,pixelHeight:w,x:0,y:0,width:w,height:w};assert.doesNotThrow(()=>FX.raster(source,{...FX.defaults,size:0,straighten:1}));
});
test('edge straightening remains a shared draft across light scopes and source changes',()=>{
 const f=fixture(),request={id:'2',familyRoot:4,levelIndex:3};f.change(request,{kind:'settings',settings:{...FX.defaults,straighten:.65}});f.change(request,{kind:'mode',mode:'individual'});f.change(request,{kind:'source',source:'polygon'});f.change(request,{kind:'source',source:'texture'});assert.equal(FX.resolve(f.config.BuildEnum[2],f.config.BuildEnum[2].levelList[3],f.overrides).settings.straighten,.65);
});
test('modular posts cast from their own ground contacts instead of collapsing upper posts onto one floor',()=>{
 const w=120,h=160,alpha=new Uint8Array(w*h),contacts=[{x:20,y:0,height:40},{x:60,y:45,height:40},{x:100,y:90,height:40}];for(const c of contacts)for(let x=c.x-8;x<c.x+8;x++)for(let y=c.y;y<c.y+40;y++)alpha[(h-1-y)*w+x]=255;
 const source={alpha,pixelWidth:w,pixelHeight:h,x:0,y:0,width:w,height:h,groundedColumns:true,contacts},settings={...FX.defaults,...FX.groundDefaults,projection:'ground',angle:0,length:1,groundDepth:0,size:0,taper:0,fade:0,straighten:0,opacity:1},points=occupied(FX.raster(source,settings));
 for(const c of contacts){const local=points.filter(p=>Math.abs(p.y-c.y)<2&&p.x<c.x);assert(local.length>20,'post at '+c.y+' has its own shadow');assert(local.some(p=>p.x<c.x-20));}assert.deepEqual(source.contacts,contacts);
});

test('overlapping gate leaves project at their individual floors and combine without double opacity',()=>{
 const w=80,h=180,leaf=y=>{const alpha=new Uint8Array(w*h);for(let x=30;x<55;x++)for(let row=y;row<y+50;row++)alpha[(h-1-row)*w+x]=255;return{alpha,pixelWidth:w,pixelHeight:h,x:0,y:0,width:w,height:h,groundedColumns:true};},near=leaf(5),far=leaf(95),source={...near,alpha:near.alpha.map((v,i)=>Math.max(v,far.alpha[i])),layers:[near,far]},settings={...FX.defaults,...FX.groundDefaults,projection:'ground',angle:0,length:1,size:0,taper:0,fade:0,straighten:0,opacity:.5},points=occupied(FX.raster(source,settings));
 for(const floor of [5,95])assert(points.filter(p=>Math.abs(p.y-floor)<2&&p.x<20).length>25,'leaf at '+floor+' retains its own cast');
 assert(points.every(p=>p.a===128),'overlapping silhouettes receive opacity once');
 assert.deepEqual(FX.raster({...source,layers:[near,near]},settings),FX.raster({...source,layers:[near]},settings),'duplicate surfaces never darken the cast');
 assert.deepEqual(FX.raster(source,settings),FX.raster(source,{...settings,projection:'offset'}),'legacy tags cannot bypass independent ground contacts');
 assert.deepEqual(near.alpha,leaf(5).alpha,'projection leaves its source masks untouched');
});
