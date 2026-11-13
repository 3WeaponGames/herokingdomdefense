'use strict';
// Exercise the game's depth preparation against the shipped mill bindings.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Node,Vec2}=require('../navigation/runtime-harness.cjs');
const root=path.resolve(__dirname,'../..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const millId=read('assets/KinghtFallIconMap/com/Ani/mf/mf.json.meta').uuid;
const farmId=read('assets/KinghtFallIconMap/com/Ani/td/td.json.meta').uuid;
function runtime(){
 class Sprite{}class Skeleton{}
 const cc={Sprite,Director:{EVENT_BEFORE_DRAW:'draw'},v2:(x=0,y=0)=>new Vec2(x,y),isValid:n=>!!n&&!n.destroyed,director:{off(){}}};
 const context={exports:{},cc,sp:{Skeleton}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallDepthView.js'),'utf8'),context);
 return {...context.exports,Skeleton};
}
function millBindings(data){return data.filter(c=>c&&c.ndAniMain&&c.ndAniDown&&data[c.ndAniMain.__id__]?.['_N$skeletonData']?.__uuid__===millId);}
for(const file of fs.readdirSync(path.join(root,'assets/KinghtFallIconMap')).filter(n=>/^Map\d+\.prefab$/.test(n))){
 test(file+' keeps all mill plots below the tower through the actual game depth sorter',()=>{
  const data=read('assets/KinghtFallIconMap/'+file),bytes=JSON.stringify(data),{DepthView,Skeleton}=runtime(),nodes=new Map();
  function node(id){if(nodes.has(id))return nodes.get(id);const source=data[id],n=new Node(source._name);nodes.set(id,n);if(source._parent)n.setParent(node(source._parent.__id__));const t=source._trs?.array;if(t){n.setPosition(t[0],t[1]);n.scaleX=t[7];n.scaleY=t[8];n.angle=2*Math.atan2(t[5],t[6])*180/Math.PI;}return n;}
  const bindings=millBindings(data);assert(bindings.length>0,'map must exercise an authored mill');
  const builds=bindings.map(c=>{const main=data[c.ndAniMain.__id__],down=data[c.ndAniDown.__id__];assert.equal(down['_N$skeletonData'].__uuid__,farmId);return{node:node(c.node.__id__),ndAniMain:node(main.node.__id__).addComponent(Skeleton),ndAniDown:node(down.node.__id__).addComponent(Skeleton),ndAniOther:[]};});
  const main=[...nodes.values()].find(n=>n.name==='ndMain'),down=[...nodes.values()].find(n=>n.name==='ndDown');assert(main&&down);
  const hero=new Node('test hero',main),game={ndDown:down,ctrPlay:{node:hero},gameData:{bulidPointMap:Object.fromEntries(builds.map((b,i)=>[i,b]))}},view={main,game,objects:[],nativeActors:new Map()};
  const original=builds.map(b=>({node:b.ndAniDown.node,parent:b.ndAniDown.node.parent,world:b.ndAniDown.node.convertToWorldSpaceAR(new Vec2())}));
  DepthView.prototype.prepareObjects.call(view);
  for(const heroY of [-10000,0,10000]){hero.y=heroY;DepthView.prototype.sort.call(view);for(const b of builds){assert(b.ndAniDown.node._depthGroundVisual);assert(b.ndAniDown.node.zIndex<b.node.zIndex,'farms must never cover the mill body');assert(!view.objects.some(o=>o.sources.includes(b.ndAniDown)),'ground farms cannot become foreground occlusion artwork');}}
  original.forEach(x=>assert.deepEqual(x.node.convertToWorldSpaceAR(new Vec2()),x.world,'layering must preserve authored farm positions'));
  DepthView.prototype.destroy.call(view);original.forEach(x=>assert.equal(x.node.parent,x.parent,'cleanup restores authored hierarchy'));
  assert.equal(JSON.stringify(data),bytes,'verification must not edit map data');
 });
}
test('wrapped mill instances created before their farms are separated without moving the tower or plots',()=>{
 const {DepthView,Skeleton}=runtime(),main=new Node('ndMain'),hero=new Node('hero',main),wrapper=new Node('mill instance',main,70,-25);
 wrapper.scaleX=-.8;wrapper.scaleY=.9;wrapper.angle=17;
 const tower=new Node('tower',wrapper,3,5),plots=new Node('plots created last',wrapper,-1,4),build={node:tower,ndAniMain:tower.addComponent(Skeleton),ndAniDown:plots.addComponent(Skeleton),ndAniOther:[]};
 const game={ctrPlay:{node:hero},gameData:{bulidPointMap:{mill:build}}},view={main,game,objects:[],nativeActors:new Map()},world=plots.convertToWorldSpaceAR(new Vec2());
 DepthView.prototype.prepareObjects.call(view);DepthView.prototype.sort.call(view);
 assert.equal(plots.parent,main);assert(plots.zIndex<wrapper.zIndex);const after=plots.convertToWorldSpaceAR(new Vec2());assert(Math.hypot(after.x-world.x,after.y-world.y)<1e-6);
 DepthView.prototype.destroy.call(view);assert.equal(plots.parent,wrapper);
});
