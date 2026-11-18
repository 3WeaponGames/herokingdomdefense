'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'../../assets/_script');
function evaluate(name,dependencies,cc={}){const exports={};vm.runInNewContext(fs.readFileSync(path.join(dir,name+'.js'),'utf8'),{exports,require:n=>{if(n in dependencies)return dependencies[n];throw Error(n);},cc,__extends:(C,B)=>{Object.setPrototypeOf(C,B);Object.setPrototypeOf(C.prototype,B.prototype);},__decorate:(_d,t,k)=>k===undefined?t:undefined,__spreadArrays:(...xs)=>[].concat(...xs)});return exports;}
class SizeNode{
 constructor(width=300,height=500){this._width=width;this._height=height;this.events=new Map();this.children=[];this.x=this.y=0;this.anchorX=.5;this.anchorY=1;this.active=true;}
 get width(){return this._width;}set width(n){if(n!==this._width){this._width=n;this.emit('size');}}
 get height(){return this._height;}set height(n){if(n!==this._height){this._height=n;this.emit('size');}}
 get childrenCount(){return this.children.length;}
 on(name,fn,owner){const rows=this.events.get(name)||[];if(!rows.some(x=>x.fn===fn&&x.owner===owner))rows.push({fn,owner});this.events.set(name,rows);}
 off(name,fn,owner){this.events.set(name,(this.events.get(name)||[]).filter(x=>x.fn!==fn||x.owner!==owner));}
 emit(name){for(const row of (this.events.get(name)||[]).slice())row.fn.call(row.owner,{type:name});}
 getPosition(){return{x:this.x,y:this.y};}
 getComponent(){return null;}
}
function grid(axis=1,cyclic=false,virtual=true){
 function Component(){}Component.EventHandler=function(){};Component.EventHandler.emitEvents=()=>{};
 const cc={Component,Enum:x=>x,isValid:x=>!!x&&!x.destroyed,size:(width,height)=>({width,height}),v2:(x,y)=>({x,y}),Node:{EventType:{SIZE_CHANGED:'size'}},ScrollView:function(){},Widget:function(){},
  Layout:{Type:{HORIZONTAL:1,VERTICAL:2,GRID:3},ResizeMode:{CHILDREN:2},AxisDirection:{HORIZONTAL:1,VERTICAL:2},HorizontalDirection:{LEFT_TO_RIGHT:1,RIGHT_TO_LEFT:2},VerticalDirection:{TOP_TO_BOTTOM:1,BOTTOM_TO_TOP:2}},_decorator:new Proxy({},{get:()=>()=>()=>{}})};
 const Item=evaluate('ListItem',{},cc).default,List=evaluate('List',{ListItem:{default:Item}},cc).default,list=new List(),node=new SizeNode(),content=new SizeNode(),jobs=[],positions=new Map();
 const scroll={isAutoScrolling:()=>false};node.getComponent=()=>scroll;
 Object.assign(list,{node,content,cyclic,_virtual:virtual,_inited:true,_align:3,_startAxis:axis,_horizontalDir:1,_verticalDir:1,_alignCalcType:axis===1?3:1,_scrollView:scroll,
  _leftGap:0,_rightGap:0,_topGap:0,_bottomGap:0,_columnGap:0,_lineGap:0,_lastDisplayData:[],displayData:[],lackSlide:true,_pool:{put(){},clear(){}},_calcNearestItem(){},scheduleOnce(fn){jobs.push(fn);},unschedule(fn){for(let i=jobs.length-1;i>=0;i--)if(jobs[i]===fn)jobs.splice(i,1);}});
 list.setTemplateItem({width:100,height:100,anchorX:.5,anchorY:.5,getComponent:()=>({}),x:0,y:0});
 list._createOrUpdateItem=data=>{positions.set(data.id,{x:data.x,y:data.y});if(!list._lastDisplayData.includes(data.id))list._lastDisplayData.push(data.id);};list._createOrUpdateItem2=()=>{};
 list._registerEvent();
 return {list,node,content,jobs,positions,flush(){let limit=10;while(jobs.length&&limit--)jobs.shift().call(list);assert(limit>0,'resize jobs must settle');}};
}
test('cyclic empty grids stay finite and preserve logical counts through refill, clear and repeated viewport resizing',()=>{
 for(const axis of [1,2])for(const virtual of [true,false]){const h=grid(axis,true,virtual),l=h.list;
  l.numItems=0;assert.equal(l.numItems,0);assert.equal(l._numItems,0);assert.equal(l._cyclicNum,1);
  for(const field of ['_allItemSize','_allItemSizeNoEdge','_cyclicAllItemSize','_cycilcAllItemSizeNoEdge'])assert(Number.isFinite(l[field]),field);
  l.numItems=15;for(let i=0;i<4;i++)l._onSizeChanged();const expected=l._cyclicNum*15;assert.equal(l._numItems,expected);assert.equal(l.numItems,15);
  l.numItems=0;assert.equal(l._numItems,0);assert.equal(l._cyclicNum,1);assert(Number.isFinite(axis===1?h.content.height:h.content.width));
 }
});
test('empty one-dimensional cyclic lists retain only authored padding and no phantom inter-item gap',()=>{
 for(const axis of [1,2])for(const virtual of [true,false]){const h=grid(axis,true,virtual),l=h.list;Object.assign(l,{_align:axis===1?2:1,_sizeType:axis===1,_colLineNum:1,_topGap:7,_bottomGap:13,_leftGap:3,_rightGap:11,_lineGap:9,_columnGap:5});l.numItems=0;assert.equal(l._numItems,0);assert.equal(l._allItemSizeNoEdge,0);assert.equal(l._cyclicNum,1);assert.equal(axis===1?h.content.height:h.content.width,axis===1?20:14);}
});
test('both grid axes reflow after a later content Widget resize and keep selected IDs and the existing template',()=>{
 for(const axis of [1,2])for(const virtual of [true,false]){const h=grid(axis,false,virtual),l=h.list;const selected=l.multSelected=[1,4],template=l._itemTmp;l._selectedId=4;l.numItems=12;
  const previous=l._colLineNum;if(axis===1)h.node.width=200;else h.node.height=200;assert.equal(l._colLineNum,previous,'content Widget has not aligned yet');
  if(axis===1)h.content.width=200;else h.content.height=200;assert.equal(l._colLineNum,2);assert.equal(l.multSelected,selected);assert.equal(l._selectedId,4);assert.equal(l._itemTmp,template);assert.equal(l.numItems,12);
  if(virtual)assert.equal(axis===1?h.content.height:h.content.width,600);
  assert.equal(h.jobs.length,0,'owned main-axis writes must not schedule recursive reflow');
  l.onDisable();assert.equal((h.content.events.get('size')||[]).length,0);if(axis===1)h.content.width=350;else h.content.height=350;assert.equal(l._colLineNum,2);l.onEnable();assert.equal(l._colLineNum,3);assert.equal((h.content.events.get('size')||[]).length,1);l.onDisable();
 }
});
test('same-column cross-axis resizing recenters virtual cells and rendering callbacks coalesce subsequent resize without nesting',()=>{
 for(const axis of [1,2]){const h=grid(axis),l=h.list;h.content.anchorY=.5;l.numItems=12;const before=h.positions.get(0);if(axis===1)h.content.width=350;else h.content.height=550;const after=h.positions.get(0);assert.notDeepEqual(after,before);
  let depth=0,maxDepth=0,changed=false;const render=l._createOrUpdateItem;l._createOrUpdateItem=data=>{depth++;maxDepth=Math.max(depth,maxDepth);try{if(!changed){changed=true;if(axis===1){h.node.width=200;h.content.width=200;}else{h.node.height=200;h.content.height=200;}}render(data);}finally{depth--;}};
  l.numItems=12;assert.equal(maxDepth,1);assert.equal(h.jobs.length,1);h.flush();assert.equal(l._colLineNum,2);assert.equal(maxDepth,1);assert.equal(h.jobs.length,0);l.onDisable();
 }
});
test('grid resize retains both scroll directions and uses the same updated stride for their actual cell coordinates',()=>{
 for(const axis of [1,2])for(const direction of [1,2]){const h=grid(axis),l=h.list;Object.assign(l,{_verticalDir:direction,_horizontalDir:direction,_alignCalcType:axis===1?direction===1?3:4:direction===1?1:2});l.numItems=12;if(axis===1)h.content.width=200;else h.content.height=200;assert.equal(l._colLineNum,2);const a=l._calcItemPos(0),b=l._calcItemPos(1),c=l._calcItemPos(2);if(axis===1){assert.equal(a.y,b.y);assert.notEqual(a.x,b.x);assert.notEqual(a.y,c.y);}else{assert.equal(a.x,b.x);assert.notEqual(a.y,b.y);assert.notEqual(a.x,c.x);}assert.equal(l._verticalDir,direction);assert.equal(l._horizontalDir,direction);}
});
test('an empty cyclic list removes previously rendered virtual rows without attempting a cyclic wrap',()=>{
 const h=grid(1,true),l=h.list;l.numItems=3;let returned=0;h.content.children=[{_listId:0},{_listId:1}];l._pool.put=node=>{returned++;h.content.children=h.content.children.filter(x=>x!==node);};h.content.y=500;l.numItems=0;assert.equal(returned,2);assert.equal(h.content.children.length,0);assert.equal(h.content.y,500);assert.equal(l.displayData.length,0);
});
test('indexed subgame cooldown writes preserve gaps, other slots and extension fields across serialization',()=>{
 function Base(){}const D=evaluate('KinghtFallDailyData',{BaseData:{BaseData:Base},Config:{GameConfig:{AppCacheName:''}},KinghtFallModle:{default:{}},KinghtFallConfig:{KinghtFallParameter:{AppCacheName:''}}}).KinghtFallDailyData,d=new D();d.data={subGameTime:[111],future:{keep:true}};let saved;d.saveData=()=>saved=JSON.stringify(d.data);d.setSubTimeByIndex(3,444);assert.equal(d.getSubTimeByIndex(0),111);assert.equal(d.getSubTimeByIndex(3),444);assert.deepEqual(JSON.parse(saved),{subGameTime:[111,null,null,444],future:{keep:true}});
});
test('model number roll supports optional completion, keeps both directions and calls a provided completion once',()=>{
 for(const from of [0,100])for(const withCallback of [false,true]){const exports={},cc={_decorator:{ccclass:x=>x},Tween:{stopAllByTarget(){}},tween(){const callbacks=[];return{call(fn){callbacks.push(fn);return this;},delay(){return this;},union(){return this;},repeat(n){this.n=n;return this;},start(){for(let i=0;i<this.n;i++)callbacks[0]();callbacks[1]();}};}},source=fs.readFileSync(path.join(dir,'KinghtFallModle.js'),'utf8');vm.runInNewContext(source,{exports,cc,require:()=>({}),__decorate:(_ds,t,k)=>k===undefined?t:undefined,__spreadArrays:(...xs)=>[].concat(...xs)});const label={node:{}};let completed=0;exports.default.getInstance().rollNumLabelAtlas2(label,from,from===0?100:0,withCallback?()=>completed++:undefined);assert.equal(label.string,from===0?'100':'0');assert.equal(completed,withCallback?1:0);}
});
test('a bomb stops before rereading a retired field pose, while a valid callback can still change its final visual origin',()=>{
 for(const retired of [false,true]){const game={_combatEpoch:1,gameData:{},ndUI:{}},positions=[],cc={director:{on(){}},Director:{EVENT_BEFORE_DRAW:'draw'},isValid:()=>true,color:()=>({}),Node:function(){return{setParent(){},setPosition(p){positions.push(p);},addComponent(){return{circle(){},fill(){},stroke(){}};}};},Graphics:function(){}},field={getAttack:()=>10,getAttPos(){if(game._combatEpoch!==1)assert.fail('retired Spine pose read');return{x:positions.length?0:2,y:3};}};
  let reads=0;field.getAttPos=()=>{reads++;if(retired&&reads>1)assert.fail('retired Spine pose read');return{x:reads,y:3};};const R=evaluate('MillFieldDefense',{TowerCombat:{damage(){if(retired)game._combatEpoch++;}},MillFieldPresentation:{},BuildingPartScale:require('../../assets/_script/BuildingPartScale')},cc).Runtime,r=new R({},game);r.cfg={splashRadius:40};r.explode(field);assert.equal(reads,retired?1:2);assert.equal(r.effects.length,retired?0:1);if(!retired)assert.deepEqual(positions,[{x:2,y:3}]);
 }
});
