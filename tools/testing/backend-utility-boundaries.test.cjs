'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(__dirname,'../../assets/_script');
function listFixture(){
  function Component(){} Component.EventHandler=function(){};Component.EventHandler.emitEvents=()=>{};
  const tweens=[],cc={Component,Enum:x=>x,isValid:x=>!!x&&!x.destroyed,v2:(x,y)=>({x,y}),size:(width,height)=>({width,height}),Node:{EventType:{}},
    Layout:{Type:{HORIZONTAL:1,VERTICAL:2,GRID:3},ResizeMode:{CHILDREN:1},AxisDirection:{HORIZONTAL:1,VERTICAL:2},HorizontalDirection:{LEFT_TO_RIGHT:1,RIGHT_TO_LEFT:2},VerticalDirection:{TOP_TO_BOTTOM:1,BOTTOM_TO_TOP:2}},
    _decorator:new Proxy({},{get:()=>()=>()=>{}}),tween(){const callbacks=[];const tween={to(){return this;},by(){return this;},call(fn){callbacks.push(fn);return this;},start(){return this;},complete(){callbacks.forEach(fn=>fn());}};tweens.push(tween);return tween;}};
  const modules={};function load(name){const exports={};vm.runInNewContext(fs.readFileSync(path.join(source,name+'.js'),'utf8'),{exports,cc,require:name=>modules[name],
    __extends:(C,B)=>Object.setPrototypeOf(C.prototype,B.prototype),__decorate:(_d,t,k)=>k===undefined?t:undefined});return modules[name]=exports;}
  const Item=load('ListItem').default,List=load('List').default;return{Item,List,tweens,cc};
}
test('existing nonvirtual rows refresh their selection after public multi-selection removal',()=>{
  const h=listFixture(),list=new h.List(),item=new h.Item(),node={_listId:0,getComponent:()=>item};item.node=node;item.listId=0;item.selected=true;
  Object.assign(list,{_forceUpdate:true,_actualNumItems:1,renderEvent:{},selectedMode:2,multSelected:[0],_lastDisplayData:[],content:{children:[node]}});
  list.delMultSelected();list._createOrUpdateItem2(0);assert.equal(item.selected,false);
  list.multSelected=[0];list._createOrUpdateItem2(0);assert.equal(item.selected,true);
});
test('both grid axes keep a finite single-cell stride when the viewport is narrower than the template',()=>{
  for(const axis of [1,2])for(const available of [0,50,250]){
    const h=listFixture(),list=new h.List();Object.assign(list,{_align:3,_startAxis:axis,_leftGap:0,_rightGap:0,_topGap:0,_bottomGap:0,_columnGap:0,_lineGap:0,node:{width:200,height:200},
      content:{width:available,height:available,getComponent:()=>null},_numItems:3,lackSlide:true});
    list.setTemplateItem({width:100,height:100,getComponent:()=>null});list._resizeContent();
    assert.equal(list._colLineNum,Math.max(1,Math.floor(available/100)));assert(Number.isFinite(axis===1?list.content.height:list.content.width));
  }
});
test('removal animation can remove a row without an optional callback and invokes a provided callback once',()=>{
  for(const callback of [false,true]){const h=listFixture(),item=new h.Item();let removed=0,called=0;item.node={width:10,height:10};item.listId=0;item.list={displayData:[{id:0}],_delSingleItem(){removed++;}};
    item.showAni(0,callback?()=>called++:undefined,true);h.tweens[0].complete();assert.equal(removed,1);assert.equal(item.list.displayData.length,0);assert.equal(called,callback?1:0);}
});
test('binary object schemas roundtrip declared special keys as own fields without changing wire bytes or prototypes',()=>{
  const B=require('../../assets/_script/Binary'),schema=JSON.parse('{"__proto__":"Object16","constructor":"Uint8","safe":"Uint8"}'),input=JSON.parse('{"__proto__":{"future":"keep"},"constructor":7,"safe":9}');
  B.registerProto(60002,schema);const bytes=B.encode(input,60002),output=B.decode(bytes);
  assert.equal(Object.getPrototypeOf(output),Object.prototype);assert(Object.hasOwn(output,'__proto__'));assert.deepEqual(output,input);assert.deepEqual(B.encode(output,60002),bytes);
});
test('a body-only blocker installs its authored polygon for a native or binary Spine rig without JSON metadata',()=>{
  for(const json of [null,undefined]){let nextId=0;const node={getComponents:()=>[],addComponent(){return{node:this,uuid:String(++nextId)};}},polygon=[{x:0,y:0},{x:7,y:0},{x:0,y:8}],owner={node,ndAniMain:{skeletonData:{skeletonJson:json}},ndAniOther:[],index:1,colPoint:{},getColliderIndex:()=>1,buildInfo:{cfg:{Blocker:{body:{polygons:[polygon]}}}}},exports={};
    vm.runInNewContext(fs.readFileSync(path.join(source,'BuildingBlockerRuntime.js'),'utf8'),{exports,require:()=>({}),cc:{isValid:x=>!!x,PhysicsPolygonCollider:function(){},v2:(x,y)=>({x,y})}});
    exports.apply(owner);assert.equal(owner._buildingBlockerRuntime.extra.length,1);const collider=owner._buildingBlockerRuntime.extra[0];assert.equal(collider.enabled,true);assert.equal(JSON.stringify(collider.points),JSON.stringify(polygon));}
});
