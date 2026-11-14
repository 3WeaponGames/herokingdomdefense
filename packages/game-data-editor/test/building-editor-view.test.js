'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{test}=require('node:test');
const FX=require('../../../assets/_script/BuildingDropShadow');
function fixture(){
 const filename=path.join(__dirname,'building-panel.test.js'),prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0],context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout},mounts=[];
 vm.createContext(context);vm.runInContext(prefix+'\nmodule.exports={fixture,all};',context);
 const blocker={mount(_host,api){const client={api,destroyed:false,destroy(){this.destroyed=true;}};mounts.push(client);return client;}};
 const f=context.module.exports.fixture({blocker});return {...f,mounts,all:context.module.exports.all,current:()=>mounts.at(-1),tab:level=>context.module.exports.all(f.panel.$detail,n=>n.getAttribute('data-building-level')===String(level))[0]};
}
test('building and tier navigation retain all four editor layers, cameras, preview heights and scroll without writes',()=>{
 const f=fixture(),initial=f.store.version,position=index=>f.store.documents.A.data.BuildEnum[2].levelList.findIndex(r=>r.index===index);f.render('2:4',position(4));
 for(const layer of ['shadow','blocker','scale','nightlight']){
  const previous=f.current(),state=previous.api.state;Object.assign(state,{layer,zoom:2,previewHeight:640,view:{scale:1.7,cx:82,cy:91,width:900,height:640},part:'weapon',instance:3,points:[{x:10,y:20}],scaleView:{unit:2,zoom:1.5,cx:25,cy:36,fitted:true,previewHeight:610,selection:[4]},nightView:{unit:1.2,zoom:3,cx:45,cy:56,fitted:true,previewHeight:620,handles:false,selected:'old-light'}});
  f.panel.$detail.scrollTop=850;f.tab(2).onclick();assert(previous.destroyed);assert.equal(f.current().api.state.layer,layer);assert.equal(f.panel.$detail.scrollTop,850);assert.equal(f.current().api.state.view.cx,82);assert.equal(f.current().api.state.scaleView.zoom,1.5);assert.equal(f.current().api.state.nightView.cy,56);assert.equal(f.current().api.state.points.length,0);
  f.render('4',0);const next=f.current().api.state;assert.equal(next.layer,layer);assert.equal(next.zoom,2);assert.equal(next.previewHeight,640);assert.equal(next.view.scale,1.7);assert.equal(next.view.cy,91);assert.equal(next.scaleView.previewHeight,610);assert.equal(next.nightView.handles,false);assert.equal(next.part,undefined);assert.equal(next.instance,undefined);assert.equal(next.scaleView.selection,undefined);assert.equal(next.nightView.selected,undefined);assert.equal(f.panel.$detail.scrollTop,850);
  f.render('__all__');f.panel.$detail.scrollTop=12;f.render('2:4',position(4));assert.equal(f.panel.$detail.scrollTop,850);assert.equal(f.current().api.state.layer,layer);
 }
 assert.equal(f.store.version,initial);assert.equal(f.messages.filter(m=>m.message==='game-data-editor:change').length,0);
});
test('shadow, blocker, scale and nightlight commits update the draft without destroying either preview',async()=>{
 const f=fixture();f.render('4',0);const client=f.current(),api=client.api,mounts=f.mounts.length,previewCalls=f.previews.length;
 const value={version:1,opacity:.2,body:{mask:[[[[-40,-10],[40,-10],[40,-70],[-40,-70],[-40,-10]]]]}};
 await api.onChange(value,'shadow');assert.equal(f.store.documents.A.data.BuildEnum[4].levelList[0].Shadow.opacity,.2);
 await api.onShadowStyle({kind:'settings',settings:{...FX.defaults,...FX.groundDefaults,projection:'ground',straighten:.7}});assert.equal(f.store.documents.overrides.data.buildingShadows.global.straighten,.7);
 await api.onChange(1.2,'scale');assert.equal(f.store.documents.A.data.BuildEnum[4].levelList[0].WorldScale,1.2);
 await api.onNightlight({version:1,lights:{'mesh:building_aperture_rays:0':{x:12}}},require('../../../assets/_script/BuildingNightlight').layout(f.store.documents.A.data.BuildEnum[4].levelList[0]));assert.equal(f.store.documents.A.data.BuildEnum[4].levelList[0].Nightlight.lights['mesh:building_aperture_rays:0'].x,12);
 await api.onDuplicate('shadow');assert.equal(f.mounts.length,mounts);assert.equal(f.current(),client);assert.equal(client.destroyed,false);assert.equal(f.previews.length,previewCalls);assert.equal(f.panel._snapshot.version,f.store.version);
 const unchanged=f.store.version;await api.onShadowStyle({kind:'settings',settings:{...FX.defaults,...FX.groundDefaults,projection:'ground',straighten:.7}});assert.equal(f.store.version,unchanged);
});
