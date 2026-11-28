'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../..'),source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIGame.js'),'utf8');
const data=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'),'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'),'utf8'));
const taskPatch=require('./battle-task-layout-patch.json');
const markerFrames = new Map(['wg_zd_drts', 'wg_zd_drtsj'].map(name => {
 const {subMetas} = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallPrefabs/_res/textures/KinghtFallUIGame', name + '.png.meta'), 'utf8'));
 const meta = subMetas[name];
 return [meta.uuid, {getRect: () => ({width: meta.width, height: meta.height}),
  getOriginalSize: () => ({width: meta.rawWidth, height: meta.rawHeight}), getOffset: () => ({x: meta.offsetX, y: meta.offsetY})}];
}));
function functionAt(marker){const start=source.indexOf('function',source.indexOf(marker)),open=source.indexOf('{',start);let depth=1,end=open+1;for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}return source.slice(start,end);}
class Label{_forceUpdateRenderData(){}}Label.Overflow={CLAMP:1,NONE:0};class Sprite{}
Label.HorizontalAlign=Label.VerticalAlign={CENTER:1};
class Graphics{roundRect(){} fill(){} stroke(){}}
class Node{
  constructor(name='node',parent=null){this.name=name;this.parent=parent;this.children=[];if(parent)parent.children.push(this);this.active=true;this.x=0;this.y=0;this.width=0;this.height=0;this.anchorX=this.anchorY=0.5;this.scaleX=this.scaleY=1;this.angle=0;this.components=[];}
  get activeInHierarchy(){return this.active&&(!this.parent||this.parent.activeInHierarchy);}
  getChildByName(name){return this.children.find(x=>x.name===name);}
  getComponent(Type){const component=this.components.find(x=>x instanceof Type);if(component)component.node=this;return component;}
  addComponent(Type){const component=new Type();component.node=this;this.components.push(component);return component;}
  on(type,handler){(this.listeners||(this.listeners={}))[type]=handler;}
  emit(type,event){this.listeners[type](event);}
  getPosition(){return{x:this.x,y:this.y};}
  setContentSize(width,height){this.width=width;this.height=height;}
  setPosition(x,y){if(typeof x==='object'){this.x=x.x;this.y=x.y;}else{this.x=x;this.y=y;}}
  setParent(parent){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=parent;parent.children.push(this);}
  setSiblingIndex(){}
  convertToWorldSpaceAR(point){const a=this.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=point.x*this.scaleX,y=point.y*this.scaleY;const p={x:this.x+c*x-s*y,y:this.y+s*x+c*y};return this.parent?this.parent.convertToWorldSpaceAR(p):p;}
  convertToNodeSpaceAR(point){const p=this.parent?this.parent.convertToNodeSpaceAR(point):point,a=-this.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=p.x-this.x,y=p.y-this.y;return{x:(c*x-s*y)/this.scaleX,y:(s*x+c*y)/this.scaleY};}
}
Node.EventType={TOUCH_END:'touchend'};
const cc={v2:(x,y)=>({x,y}),color:()=>({}),Color:{BLACK:{}},isValid:x=>!!x&&!x.destroyed,Label,LabelOutline:class{},Sprite,Graphics,Node,BlockInputEvents:class{},Camera:{main:{getWorldToScreenPoint:p=>p}}};
const context={cc,$z1KinghtFallModle:{KinghtFallGameStage:{Prepare:0,Transition:1,Fight:2}},$z1KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getSoldierCfgById:id=>({loadIcon:String(id)})})}},$z1KinghtFallConfig:{KinghtFallBundelName:{Enemy:'enemy'}}};
context.resolveEnemyPictogram=vm.runInNewContext('('+functionAt('function resolveEnemyPictogram')+')',context);
const loadPictogram=vm.runInNewContext('('+functionAt('_ctor.prototype._loadEnemyPictogram =')+')',context);
context.placeEnemyIndicator=vm.runInNewContext('('+functionAt('function placeEnemyIndicator')+')',context);
context.enemyIndicatorBounds=vm.runInNewContext('('+functionAt('function enemyIndicatorBounds')+')',context);
for(const name of ['enemyIndicatorSpriteRect','enemyIndicatorFootprint','reserveEnemyIndicator','positionEnemyIndicator','upcomingIndicatorGroups','scaleUpcomingPortrait']){
 context[name]=vm.runInNewContext('('+functionAt('function '+name)+')',context);
}
const getObstacles=vm.runInNewContext('('+functionAt('_ctor.prototype._enemyIndicatorObstacles')+')',context);
const place=vm.runInNewContext('('+functionAt('_ctor.prototype._placeEnemyIndicator')+')',context);
const update=vm.runInNewContext('('+functionAt('_ctor.prototype.update =')+')',context);
const updateLive=vm.runInNewContext('('+functionAt('_ctor.prototype._updateOffscreenEnemies =')+')',context);
const updateUpcoming=vm.runInNewContext('('+functionAt('_ctor.prototype._placeUpcomingEnemyIndicators =')+')',context);
function authored(index, parent, english = true, paintFrames = false) {
 const source = data[index], node = new Node(source._name, parent), trs = source._trs?.array;
 node.width = source._contentSize?.width ?? 0;
 node.height = source._contentSize?.height ?? 0;
 node.active = source._active !== false;
 if (source._anchorPoint) { node.anchorX = source._anchorPoint.x; node.anchorY = source._anchorPoint.y; }
 if (trs) {
  node.x = trs[0]; node.y = trs[1]; node.scaleX = trs[7]; node.scaleY = trs[8];
  node.angle = 2 * Math.atan2(trs[5], trs[6]) * 180 / Math.PI;
 }
 for (const ref of source._components || []) {
  const component = data[ref.__id__];
  if (component.__type__ === 'cc.Label') {
   const label = node.addComponent(Label);
   label.string = component._string;
   const key = 'ui.layout.kinghtfalluigame.' + ref.__id__;
   const style = english && (taskPatch.labelStyles[key] || catalog.labelStyles[key])?.en;
   if (style) for (const prop of ['width', 'height', 'x', 'y']) if (style[prop] !== undefined) node[prop] = style[prop];
  } else if (component.__type__ === 'cc.Sprite') {
   const sprite = node.addComponent(Sprite);
   sprite.trim = component._isTrimmedMode !== false;
   if (paintFrames) sprite.spriteFrame = markerFrames.get(component._spriteFrame?.__uuid__);
  }
 }
 for (const child of source._children || []) authored(child.__id__, node, english, paintFrames);
 return node;
}
// This fixture supplies fixed HUD obstacles; joystick/footer arrangement has its own layout coverage.
function fixture(english=true){const canvas=new Node('Canvas'),ui=new Node('UI',canvas);ui.width=750;ui.height=1334;const definition=data.find(x=>x.ndEnemyIcon&&x.btnBuildInfo);const state={_updateTestControls(){},_layoutBattleFooter(){},_loadEnemyPictogram:loadPictogram,ctrUI:{node:ui,upGuide(){}},_enemyIndicatorObstacles:getObstacles,_placeEnemyIndicator:place,_updateOffscreenEnemies:updateLive,_placeUpcomingEnemyIndicators:updateUpcoming};for(const key of['btnBuildInfo','ndTask','btnSuspend','ndCoin','ndLevelInfo','btnStartFight','btnAddCoin','btnAgg'])state[key]=authored(definition[key].__id__,ui,english);state.ndTask.getChildByName('ndAni').active=false;state.ndEnemyIcon=authored(118,ui,english);state.ndEnemyIcon.active=false;return{state,ui,canvas,indicator:()=>authored(118,ui,english)};}
function near(a,b){assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);}
function clear(a,b,gap=0){return a.maxX+gap<=b.minX+1e-6||a.minX-gap>=b.maxX-1e-6||a.maxY+gap<=b.minY+1e-6||a.minY-gap>=b.maxY-1e-6;}
function bounds(node,ui){return context.enemyIndicatorBounds(node,ui);}
function arrowPoints(node,target){const arrow=node.getChildByName('ndArr');assert(arrow.active);near(arrow.angle,Math.atan2(target.y-node.y,target.x-node.x)*180/Math.PI-90);}
function liveFixture(width=750,height=1334){
 const f=fixture(),enemies=[];f.ui.width=width;f.ui.height=height;
 cc.view={getVisibleSize:()=>({width,height}),getVisibleOrigin:()=>({x:-width/2,y:-height/2})};cc.instantiate=()=>f.indicator();
 Object.assign(f.state,{isPauset:false,speed:1,enemyIconInfo:{},ctrGame:{gameStatus:2,onUpdate(){},camera:{getWorldToScreenPoint:p=>p},gameData:{baseBuild:{getLevel:()=>0},enemyQueue:{},getEnemyList:()=>enemies}},loadSpriteFrame(_bundle,_key,done){done({});}});
 f.enemy=(x,y,id=90001)=>{const enemy={node:new Node('enemy',f.ui),cfg:{ID:id},isDead:()=>false};enemy.node.setPosition(x,y);enemies.push(enemy);return enemy;};
 f.tick=()=>{update.call(f.state,.016);return Object.values(f.state.enemyIconInfo).filter(record=>record._guideLive&&record.ndItem.active);};
 f.count=()=>f.tick().reduce((total,record)=>total+Number(record.ndItem.getChildByName('labNum').getComponent(Label).string),0);
 f.enemies=enemies;return f;
}
function upcomingFixture(groups,spawns,width){
 const f=liveFixture(width),s=f.state,pathNode=new Node('Path',f.ui),enemyQueue={};
 cc.instantiate = () => authored(118, f.ui, true, true);
 for(const [id,x,y,entries] of spawns){
  new Node('ndEnemy'+id,pathNode).setPosition(x,y);
  enemyQueue[id]=entries||[{id:7+id,num:100}];
 }
 for(const name of ['_upcomingGroupToggle','_placeUpcomingGroup']){
  s[name]=vm.runInNewContext('('+functionAt('_ctor.prototype.'+name+' =')+')',context);
 }
 Object.assign(s.ctrGame,{gameStatus:0,ndPath:pathNode});
 Object.assign(s.ctrGame.gameData,{enemyQueue,baseBuild:{getLevel:()=>1},levelCfg:{SpawnGroups:groups},round:4});
 f.paint=()=>{f.tick();return Object.keys(s.enemyIconInfo).filter(id=>s.enemyIconInfo[id].ndItem.active).map(Number);};
 f.portrait=id=>s.enemyIconInfo[id].ndItem;
 f.painted=id=>{const node=f.portrait(id);return context.enemyIndicatorBounds(node,f.ui,node.getChildByName('ndArr'),true);};
 f.toggle=id=>s.enemyIconInfo[id].groupToggle;
 f.tap=(id,travel=0)=>f.toggle(id).node.emit(Node.EventType.TOUCH_END,{
  stopPropagation(){},getLocation:()=>({x:travel,y:0}),getStartLocation:()=>({x:0,y:0})
 });
 return f;
}
let passed=0;function test(name,run){run();passed++;console.log('PASS '+name);}
test('Unobstructed targets retain their original position and offscreen centers stay within original limits',()=>{const p=context.placeEnemyIndicator,shape={minX:-65,maxX:65,minY:-65,maxY:65},limits={minX:-246,maxX:246,minY:-442,maxY:442};const a=p({x:20,y:30},shape,limits,[],12);near(a.x,20);near(a.y,30);const b=p({x:-900,y:1000},shape,limits,[],12);near(b.x,-246);near(b.y,442);});
test('Actual English and Chinese prefab bounds avoid Buildings, taskbar, and visible HUD controls',()=>{for(const english of[true,false]){const f=fixture(english),node=f.indicator(),obstacles=getObstacles.call(f.state),fixed=obstacles.slice(),target={x:-246,y:396};place.call(f.state,node,target,obstacles);for(const obstacle of fixed)assert(clear(obstacles.at(-1),obstacle,12));assert(node.x>=-246&&node.x<=246&&node.y>=-442&&node.y<=442);arrowPoints(node,target);assert(clear(bounds(node,f.ui),bounds(f.state.btnBuildInfo,f.ui)));}});
test('Multiple indicators at the same spawn edge separate without overlap and keep correct arrows',()=>{const f=fixture(),nodes=[f.indicator(),f.indicator(),f.indicator(),f.indicator()],obstacles=getObstacles.call(f.state),count=obstacles.length,target={x:-600,y:650};for(const node of nodes){place.call(f.state,node,target,obstacles);arrowPoints(node,target);}for(let i=count;i<obstacles.length;i++)for(let j=0;j<i;j++)assert(clear(obstacles[i],obstacles[j],12));for(const node of nodes)assert(node.x>=-246&&node.x<=246&&node.y>=-442&&node.y<=442);});
test('Rotating/previously hidden arrows keep a stable footprint and reactivate after displacement',()=>{const f=fixture(),node=f.indicator(),target={x:-600,y:650};place.call(f.state,node,target,getObstacles.call(f.state));const previous=node.getPosition();for(const angle of[0,31,89,173,270]){node.getChildByName('ndArr').angle=angle;place.call(f.state,node,target,getObstacles.call(f.state));near(node.x,previous.x);near(node.y,previous.y);}place.call(f.state,node,{x:0,y:0},[]);assert.equal(node.getChildByName('ndArr').active,false);place.call(f.state,node,target,[]);assert.equal(node.getChildByName('ndArr').active,true);});
test('Canvas transforms and inactive controls do not change local placement or leave phantom blockers',()=>{const f=fixture(),node=f.indicator(),target={x:-246,y:396};place.call(f.state,node,target,getObstacles.call(f.state));const first=node.getPosition();f.canvas.x=375;f.canvas.y=667;f.canvas.scaleX=f.canvas.scaleY=0.5;f.canvas.angle=8;place.call(f.state,node,target,getObstacles.call(f.state));near(node.x,first.x);near(node.y,first.y);for(const key of['btnBuildInfo','ndTask','btnSuspend','ndCoin','ndLevelInfo','btnStartFight','btnAddCoin','btnAgg'])f.state[key].active=false;assert.equal(getObstacles.call(f.state).length,0);place.call(f.state,node,target,[]);near(node.x,target.x);near(node.y,target.y);});
test('Live update retains per-spawn enemy counts/visibility and applies tighter separation to new clones',()=>{const f=fixture(),state=f.state,pathNode=new Node('Path',f.ui);new Node('ndEnemy1',pathNode).setPosition(-600,650);new Node('ndEnemy2',pathNode).setPosition(-600,650);Object.assign(state,{isPauset:false,speed:1,enemyIconInfo:{},ctrGame:{gameStatus:0,onUpdate(){},ndPath:pathNode,gameData:{baseBuild:{getLevel:()=>1},enemyQueue:{1:[{id:7,num:9}],2:[{id:8,num:3}]}}},loadSpriteFrame(bundle,key,callback){callback({key});}});cc.instantiate=()=>f.indicator();update.call(state,0.016);const a=state.enemyIconInfo[1].ndItem,b=state.enemyIconInfo[2].ndItem;assert(a.active&&b.active);assert.equal(a.getChildByName('labNum').getComponent(Label).string,'9');assert.equal(b.getChildByName('labNum').getComponent(Label).string,'3');assert(clear(bounds(a,f.ui),bounds(b,f.ui),2));delete state.ctrGame.gameData.enemyQueue[2];update.call(state,0.016);assert.equal(b.active,false);assert.equal(a.active,true);});
test('Impossible packing still returns a finite bounded position without hiding indicator data',()=>{const p=context.placeEnemyIndicator({x:99,y:99},{minX:-50,maxX:50,minY:-50,maxY:50},{minX:-10,maxX:10,minY:-10,maxY:10},[{minX:-999,maxX:999,minY:-999,maxY:999}],12);assert(Number.isFinite(p.x)&&Number.isFinite(p.y));assert(p.x>=-10&&p.x<=10&&p.y>=-10&&p.y<=10);});
test('Active offscreen enemies remain represented in all eight directions without a spawn queue or built castle',()=>{
  const f=fixture(),enemies=[];cc.instantiate=()=>f.indicator();
  cc.view={getVisibleSize:()=>({width:750,height:1334}),getVisibleOrigin:()=>({x:-375,y:-667})};
  for(let sector=0;sector<8;sector++)for(let i=0;i<2;i++){
    const angle=sector*Math.PI/4,node=new Node('enemy',f.ui);node.setPosition(Math.cos(angle)*1800,Math.sin(angle)*1800);
    enemies.push({node,cfg:{ID:90001},isDead:()=>false});
  }
  Object.assign(f.state,{isPauset:false,speed:1,enemyIconInfo:{},ctrGame:{gameStatus:2,onUpdate(){},gameData:{baseBuild:{getLevel:()=>0},enemyQueue:{},getEnemyList:()=>enemies}},loadSpriteFrame(_bundle,_key,done){done({});}});
  update.call(f.state,.016);
  const markers=Object.values(f.state.enemyIconInfo);assert.equal(markers.length,8);
  assert.equal(markers.reduce((sum,r)=>sum+Number(r.ndItem.getChildByName('labNum').getComponent(Label).string),0),16);
  for(const record of markers){assert(record.ndItem.active);const b=bounds(record.ndItem,f.ui);assert(b.minX>=-375&&b.maxX<=375&&b.minY>=-667&&b.maxY<=667,'marker exceeded the actual viewport');assert.equal(record.ndItem.zIndex,100);}
  // Onscreen, dead and pooled enemies contribute no stale marker/count.
  enemies.forEach((e,i)=>{if(i%3===0)e.node.setPosition(0,0);else if(i%3===1)e.isDead=()=>true;else e._isPooled=true;});
  update.call(f.state,.016);assert(markers.every(r=>!r.ndItem.active));
});
test('A large wave shares a bounded directional marker and tracks death and camera movement immediately',()=>{
  const f=fixture(),enemies=Array.from({length:100},()=>({node:new Node('enemy',f.ui),cfg:{ID:90002},isDead:()=>false}));
  enemies.forEach(e=>e.node.setPosition(1800,0));cc.instantiate=()=>f.indicator();
  Object.assign(f.state,{isPauset:false,speed:1,enemyIconInfo:{},ctrGame:{gameStatus:2,onUpdate(){},gameData:{baseBuild:{getLevel:()=>0},enemyQueue:{},getEnemyList:()=>enemies}},loadSpriteFrame(_bundle,_key,done){done({});}});
  update.call(f.state,.016);const records=Object.values(f.state.enemyIconInfo);assert.equal(records.length,1);assert.equal(records[0].ndItem.getChildByName('labNum').getComponent(Label).string,'100');
  enemies[0].isDead=()=>true;update.call(f.state,.016);assert.equal(records[0].ndItem.getChildByName('labNum').getComponent(Label).string,'99');
  cc.Camera.main.getWorldToScreenPoint=p=>({x:p.x-1800,y:p.y});update.call(f.state,.016);assert(records.every(r=>!r.ndItem.active));cc.Camera.main.getWorldToScreenPoint=p=>p;
});
test('Live markers use the world camera even when a different UI camera becomes main',()=>{
  const f=fixture(),enemy={node:new Node('enemy',f.ui),cfg:{ID:90002},isDead:()=>false};
  enemy.node.setPosition(1800,0);cc.instantiate=()=>f.indicator();
  Object.assign(f.state,{isPauset:false,speed:1,enemyIconInfo:{},ctrGame:{gameStatus:2,onUpdate(){},camera:{getWorldToScreenPoint:()=>({x:0,y:0})},gameData:{baseBuild:{getLevel:()=>0},enemyQueue:{},getEnemyList:()=>[enemy]}},loadSpriteFrame(_bundle,_key,done){done({});}});
  update.call(f.state,.016);assert.equal(Object.keys(f.state.enemyIconInfo).length,0);
  const previous=cc.Camera.main;
  try{cc.Camera.main={getWorldToScreenPoint:()=>({x:0,y:0})};f.state.ctrGame.camera.getWorldToScreenPoint=p=>p;update.call(f.state,.016);assert.equal(Object.values(f.state.enemyIconInfo).filter(r=>r.ndItem.active).length,1);}
  finally{cc.Camera.main=previous;}
});
test('Near-edge enemies beside visible units stay quiet on all edges and corners',()=>{
 const pairs=[[[475,0],[325,0]],[[-475,0],[-325,0]],[[0,767],[0,617]],[[0,-767],[0,-617]]];
 for(const sx of[-1,1])for(const sy of[-1,1])pairs.push([[sx*450,sy*742],[sx*350,sy*642]]);
 for(const [outside,inside]of pairs){const f=liveFixture();f.enemy(...outside);f.enemy(...inside);assert.equal(f.count(),0,JSON.stringify(outside));}
});
test('Isolated near-edge enemies and groups without a visible neighbor retain portraits',()=>{
 const f=liveFixture();f.enemy(400,0);assert.equal(f.count(),1);
 f.enemy(440,50);assert.equal(f.count(),2,'offscreen neighbors must not suppress each other');
});
test('Only living active visible enemies suppress nearby portraits, regardless of list order',()=>{
 for(const reverse of[false,true]){const f=liveFixture(),positions=reverse?[[350,0],[450,0]]:[[450,0],[350,0]];positions.forEach(point=>f.enemy(...point));assert.equal(f.count(),0);}
 for(const state of['dead','pooled','inactive','destroyed']){
  const f=liveFixture();f.enemy(450,0);const neighbor=f.enemy(350,0);
  if(state==='dead')neighbor.isDead=()=>true;else if(state==='pooled')neighbor._isPooled=true;else if(state==='inactive')neighbor.node.active=false;else neighbor.node.destroyed=true;
  assert.equal(f.count(),1,state+' visible enemy incorrectly suppressed a portrait');
 }
});
test('Distant counts exclude nearby suppressed enemies and live captions use no screen space',()=>{
 const f=liveFixture();f.enemy(350,0,90001);f.enemy(450,0,90002);f.enemy(1000,0,90003);f.enemy(1200,10,90004);
 const markers=f.tick();assert.equal(markers.length,1);assert.equal(markers[0].count,2);assert.deepEqual(Array.from(markers[0]._guideIds).sort(),[90003,90004]);
 assert.equal(markers[0].ndItem.getChildByName('labName').active,false);
 const isolated=liveFixture();isolated.enemy(350,0);isolated.enemy(535,0);assert.equal(isolated.count(),1,'an enemy beyond the near-edge band must retain its portrait');
});
test('Portrait suppression has a small edge and neighbor-distance buffer without sticking',()=>{
 const f=liveFixture();f.enemy(350,0);const enemy=f.enemy(520,0);
 assert.equal(f.count(),0);enemy.node.setPosition(545,0);assert.equal(f.count(),0,'small edge movement should not flicker');
 enemy.node.setPosition(556,0);assert.equal(f.count(),1,'moving past the edge buffer must show the portrait');
 enemy.node.setPosition(535,0);assert.equal(f.count(),1,'a shown portrait needs the entry distance before suppressing again');
 enemy.node.setPosition(520,0);assert.equal(f.count(),0);
 enemy.node.setPosition(450,199);assert.equal(f.count(),0);enemy.node.setPosition(450,230);assert.equal(f.count(),0,'small neighbor-distance movement should not flicker');
 enemy.node.setPosition(450,236);assert.equal(f.count(),1,'moving past the neighbor buffer must show the portrait');
 enemy.node.setPosition(450,220);assert.equal(f.count(),1);enemy.node.setPosition(450,199);assert.equal(f.count(),0);
});
test('Suppression resets when enemies become visible, die, pool, or deactivate and when the visible neighbor disappears',()=>{
 for(const reset of['visible','dead','pooled','inactive']){
  const f=liveFixture();f.enemy(350,0);const enemy=f.enemy(450,0);assert.equal(f.count(),0);
  if(reset==='visible')enemy.node.setPosition(350,0);else if(reset==='dead')enemy.isDead=()=>true;else if(reset==='pooled')enemy._isPooled=true;else enemy.node.active=false;
  assert.equal(f.count(),0);enemy.isDead=()=>false;enemy._isPooled=false;enemy.node.active=true;enemy.node.setPosition(535,0);
  assert.equal(f.count(),1,reset+' must reset the prior suppression buffer');
 }
 const f=liveFixture(),neighbor=f.enemy(350,0),enemy=f.enemy(450,0);assert.equal(f.count(),0);
 neighbor.node.active=false;assert.equal(f.count(),1,'a visible living neighbor is required even during the buffer');
 enemy.node.setPosition(535,0);neighbor.node.active=true;assert.equal(f.count(),1);
});
test('Proximity uses projected UI coordinates and scales with viewport and canvas transforms',()=>{
 const wide=liveFixture(1500,2668);wide.enemy(700,0);const enemy=wide.enemy(1000,0);assert.equal(wide.count(),0,'thresholds should scale with the shortest viewport side');
 enemy.node.setPosition(1120,0);assert.equal(wide.count(),1,'scaled edge limit must still preserve distant alerts');
 const transformed=liveFixture();transformed.canvas.scaleX=transformed.canvas.scaleY=.5;transformed.enemy(700,0);transformed.enemy(1000,0);assert.equal(transformed.count(),0,'viewport and targets must share UI coordinates');
 const projected=liveFixture(),world=new Node('World');const nearEnemy=projected.enemy(2450,0),visibleEnemy=projected.enemy(2350,0);nearEnemy.node.setParent(world);visibleEnemy.node.setParent(world);
 projected.state.ctrGame.camera.getWorldToScreenPoint=p=>({x:p.x-2000,y:p.y});assert.equal(projected.count(),0,'world positions must be projected before proximity checks');
});
test('Stock 2D camera projections reuse matrices and retain live indicator positions and counts',()=>{
 const f=liveFixture(),savedCamera=cc.Camera,savedNode=cc.Node;
 const transform=(out,value,matrix)=>{
  const {x,y}=value,m=matrix.m;
  out.x=m[0]*x+m[4]*y+m[12];out.y=m[1]*x+m[5]*y+m[13];return out;
 };
 class Mat4 {
  constructor(){this.m=new Float32Array(16);this.m[0]=this.m[5]=this.m[10]=this.m[15]=1;}
  static invert(out,matrix){
   const m=matrix.m,n=out.m,det=m[0]*m[5]-m[1]*m[4];if(!det)return null;
   n[0]=m[5]/det;n[1]=-m[1]/det;n[4]=-m[4]/det;n[5]=m[0]/det;
   n[12]=-n[0]*m[12]-n[4]*m[13];n[13]=-n[1]*m[12]-n[5]*m[13];return out;
  }
 }
 class Camera{
  constructor(){this.node={is3DNode:false};this.calls=0;this.matrices=0;}
  getWorldToScreenMatrix2D(out){
   this.matrices++;const m=out.m;m[0]=0;m[1]=2;m[4]=-2;m[5]=0;m[12]=80;m[13]=-24;return out;
  }
  getWorldToScreenPoint(point){this.calls++;return transform({},point,this.getWorldToScreenMatrix2D(new Mat4()));}
 }
 Node.prototype.getWorldMatrix=function(out){
  const p=this.convertToWorldSpaceAR({x:0,y:0}),x=this.convertToWorldSpaceAR({x:1,y:0}),y=this.convertToWorldSpaceAR({x:0,y:1}),m=out.m;
  m[0]=x.x-p.x;m[1]=x.y-p.y;m[4]=y.x-p.x;m[5]=y.y-p.y;m[12]=p.x;m[13]=p.y;return out;
 };
 Object.assign(cc,{Camera,Node,Mat4,Vec2:{transformMat4:transform}});
 try{
  const camera=f.state.ctrGame.camera=new Camera();
  f.canvas.setPosition(32,-24);f.canvas.scaleX=f.canvas.scaleY=.5;f.ui.angle=90;
  for(let i=0;i<24;i++)f.enemy(i%2?500:-500,97*i-1000,90001+i%2);
  const capture=()=>f.tick().map(record=>({
   id:record.id,count:record.count,x:record.ndItem.x,y:record.ndItem.y,angle:record.ndItem.getChildByName('ndArr').angle
  }));
  const original=capture();assert(original.length>0);assert.equal(camera.calls,f.enemies.length);
  camera.calls=camera.matrices=0;cc.ENGINE_VERSION='2.4.13';const reused=capture();
  assert.equal(camera.calls,0);assert.equal(camera.matrices,1);assert.equal(reused.length,original.length);
  for(let i=0;i<reused.length;i++){
   assert.equal(reused[i].id,original[i].id);assert.equal(reused[i].count,original[i].count);
   for(const key of ['x','y','angle'])near(reused[i][key],original[i][key]);
  }
  camera.node.is3DNode=true;camera.calls=camera.matrices=0;
  capture();assert.equal(camera.calls,f.enemies.length);assert.equal(camera.matrices,f.enemies.length);
  camera.node.is3DNode=false;camera.getWorldToScreenPoint=point=>Camera.prototype.getWorldToScreenPoint.call(camera,point);
  camera.calls=camera.matrices=0;capture();assert.equal(camera.calls,f.enemies.length);
 }finally{
  cc.Camera=savedCamera;cc.Node=savedNode;delete cc.Mat4;delete cc.Vec2;delete cc.ENGINE_VERSION;delete Node.prototype.getWorldMatrix;
 }
});
test('custom monster pictograms preserve aspect ratio, reject stale callbacks and fall back to the original icon on load failure',()=>{
 const f=fixture(),pending=[],manager=context.$z1KinghtFallDataMgr.KinghtFallDataMgr,previous=manager.getInstance,color=cc.color;
 const settings={unitTypes:{wolf:{icon:'@icon/unit-library/wolf',tint:'#80c0ff'}},unitTypeAssignments:{'enemy:90001:default':'wolf','enemy:90002:default':'wolf'}};
 manager.getInstance=()=>({data:{GameTools:settings},getSoldierCfgById:id=>({loadIcon:String(id)})});cc.color=value=>value;cc.resources={load(path,type,callback){pending.push(callback);}};
 try{
  const record={id:90001,ndItem:f.indicator()},icon=record.ndItem.getChildByName('sprIcon'),sprite=icon.getComponent(Sprite),width=icon.width,height=icon.height;let fallback=0;
  f.state.loadSpriteFrame=(bundle,key,callback)=>{fallback++;callback({key});};loadPictogram.call(f.state,record,90001);record.id=90002;loadPictogram.call(f.state,record,90002);
  pending[0](null,{getOriginalSize:()=>({width:200,height:40})});assert.equal(sprite.spriteFrame,undefined);
  pending[1](null,{getOriginalSize:()=>({width:200,height:40})});near(icon.width/icon.height,5);assert(icon.width<=width&&icon.height<=height);assert.equal(icon.color,'#80c0ff');
  loadPictogram.call(f.state,record,90002);pending[2](Error('missing native texture'));assert.equal(fallback,1);assert.equal(sprite.spriteFrame.key,'icon/90002');near(icon.width,width);near(icon.height,height);assert.equal(icon.color,'#ffffff');
 }finally{manager.getInstance=previous;delete cc.resources;cc.color=color;}
});
test('every monster and boss form uses its own head through the guarded Resources loader',()=>{
 const f=fixture(),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),manager=context.$z1KinghtFallDataMgr.KinghtFallDataMgr,previous=manager.getInstance,pending=[];
 manager.getInstance=()=>({data:config,getSoldierCfgById:id=>config.SoldierCfg[id]});cc.resources={};
 try{f.state.loadSpriteFrame=(bundle,key,done)=>pending.push({bundle,key,done});const record={id:90001,ndItem:f.indicator()};
  const units=Object.values(config.SoldierCfg),legacy=units.filter(unit=>unit.ID>=90001&&unit.ID<=90012),imported=units.filter(unit=>unit.MonsterSource);
  assert.deepEqual(legacy.map(unit=>unit.ID),Array.from({length:12},(_,i)=>90001+i));const importedCount=['monster1','monster2','monster3','fantasy-monsters','fantasy-bosses'].reduce((n,pack)=>n+require('../../assets/resources/unit-library/'+pack+'/catalog.json').units.length,0);assert.equal(imported.length,importedCount);
  for(const unit of units){record.id=unit.ID;loadPictogram.call(f.state,record,unit.ID);const request=pending.at(-1);assert.equal(request.bundle,'resources');assert.equal(request.key,unit.loadIcon.slice(6));assert(request.key.startsWith(unit.MonsterSource||unit.MonsterPack||unit.CampaignBaseUnit?'icons/monster-roster/':'icons/enemy-heads/'));if(unit.CampaignBaseUnit)assert.equal(unit.loadIcon,config.SoldierCfg[unit.AppearanceSourceUnit].loadIcon);}
  assert.equal(pending.length,units.length);assert.equal(new Set(pending.map(p=>p.key)).size,12+importedCount);
  assert.equal(new Set(pending.slice(0,12).map(p=>p.key)).size,12,'The original twelve monster and boss portraits remain independent');
  const sprite=record.ndItem.getChildByName('sprIcon').getComponent(Sprite);
  for(const request of pending.slice(0,-1)){request.done({getOriginalSize:()=>({width:128,height:128})});assert.equal(sprite.spriteFrame,undefined);}
  const current={getOriginalSize:()=>({width:128,height:128})};pending.at(-1).done(current);assert.equal(sprite.spriteFrame,current);
 }finally{manager.getInstance=previous;delete cc.resources;}
});
test('Upcoming portraits from one side pack closer together and retain their true spawn arrows',()=>{
 const f=fixture(),markers=[1200,1100,1000].map(y=>({record:{ndItem:f.indicator()},target:{x:1200,y}})),rectangles=[];
 updateUpcoming.call(f.state,markers,rectangles);
 const positions=markers.map(m=>m.record.ndItem.getPosition());
 for(const marker of markers){const node=marker.record.ndItem;assert.equal(node.width,130);assert.equal(node.getChildByName('labName').active,true,'upcoming-wave captions remain available');arrowPoints(node,marker.target);const r=bounds(node,f.ui);assert(r.minX>=-359&&r.maxX<=359&&r.minY>=-651&&r.maxY<=651);near(node.x,positions[0].x);near(rectangles[markers.indexOf(marker)].maxX,359);}
 for(let i=1;i<positions.length;i++){
  assert(positions[i-1].y>positions[i].y,'upcoming markers must form a downward list');
  const previous=rectangles[i-1],current=rectangles[i];
  near(previous.minY-current.maxY,2); // Include the readable caption and every reserved arrow rotation.
 }
 for(let i=0;i<rectangles.length;i++)for(let j=0;j<i;j++)assert(clear(rectangles[i],rectangles[j],2));
 for(const [locale,style] of Object.entries(catalog.labelStyles['ui.layout.kinghtfalluigame.133'])){
  assert.equal(style.fontSize,52);assert.equal(style.wrap,false);assert.equal(style.lineHeight,58);assert.equal(style.height,128);
  assert.equal(catalog.entries['ui.layout.kinghtfalluigame.133'][locale].split('\n').length,2,'upcoming captions keep two readable lines');
  assert(style.lineHeight*2<=style.height,'both caption lines fit without clipping');
 }
});

test('Upcoming waves stay in vertical side lists even for centered, top and bottom spawn points and crowded HUD edges',()=>{
 const f=fixture(),targets=[[-5,1200],[-1200,50],[-20,-900],[0,0],[1200,80],[5,-900]];
 const markers=targets.map(([x,y])=>({record:{ndItem:f.indicator()},target:{x,y}}));
 const obstacles=[{minX:-375,maxX:-220,minY:360,maxY:667},{minX:220,maxX:375,minY:300,maxY:667}],fixed=obstacles.slice();
 updateUpcoming.call(f.state,markers,obstacles);
 for(const marker of markers){const node=marker.record.ndItem,r=bounds(node,f.ui),reserved=obstacles[fixed.length+markers.indexOf(marker)];arrowPoints(node,marker.target);near(marker.target.x<0?reserved.minX:reserved.maxX,marker.target.x<0?-359:359);assert(r.maxY<=(marker.target.x<0?354:294));}
 for(const side of[-1,1]){
  const list=markers.filter(m=>Math.sign(m.record.ndItem.x)===side).sort((a,b)=>b.target.y-a.target.y);
  for(let i=1;i<list.length;i++){near(list[i].record.ndItem.x,list[0].record.ndItem.x);assert(list[i].record.ndItem.y<list[i-1].record.ndItem.y);}
 }
 for(let i=fixed.length;i<obstacles.length;i++)for(let j=0;j<i;j++)assert(clear(obstacles[i],obstacles[j],j<fixed.length?12:2));
 const before=markers.map(m=>m.record.ndItem.getPosition());
 updateUpcoming.call(f.state,markers,fixed.slice());markers.forEach((m,i)=>{near(m.record.ndItem.x,before[i].x);near(m.record.ndItem.y,before[i].y);});
});

test('Upcoming columns follow the actual visible safe area through canvas transforms and screen resizing',()=>{
 const previousView=cc.view,previousSys=cc.sys;
 try{for(const height of[1334,1688,1900]){
  const f=fixture();f.canvas.setPosition(200,100);f.canvas.scaleX=f.canvas.scaleY=.5;
  cc.view={getVisibleSize:()=>({width:750,height}),getVisibleOrigin:()=>({x:0,y:0})};
  cc.sys={getSafeAreaRect:()=>({x:24,y:32,width:702,height:height-96})};
  const a=f.ui.convertToNodeSpaceAR({x:24,y:32}),b=f.ui.convertToNodeSpaceAR({x:726,y:height-64});
  const markers=[{record:{ndItem:f.indicator()},target:{x:a.x,y:0}},{record:{ndItem:f.indicator()},target:{x:b.x,y:0}}],obstacles=[];
  updateUpcoming.call(f.state,markers,obstacles);
  near(obstacles[0].minX,a.x+16);near(obstacles[1].maxX,b.x-16);
  for(const r of obstacles){assert(r.minY>=a.y+16-1e-6);assert(r.maxY<=b.y-16+1e-6);}
 }}finally{cc.view=previousView;cc.sys=previousSys;}
});
test('Crowded next-wave previews follow saved spawn order and open one horizontal row at a time',()=>{
 const f=upcomingFixture([[1,3,2],[4,5,6]],[
  [1,-1000,240,[{id:-1,num:1}]], [2,-1000,190], [3,-1000,400],
  [4,1000,150], [5,1000,220], [6,1000,350], [13,-1000,-400]
 ]);
 assert.deepEqual(f.paint(),[3,4,13]);
 assert.equal(f.toggle(3).label.string,'+1 \u203a');
 assert.equal(f.toggle(4).label.string,'\u2039 +2');
 const toggleBounds = id => bounds(f.toggle(id).node, f.ui);
 near(toggleBounds(3).minX - f.painted(3).maxX, 4);
 near(f.painted(4).minX - toggleBounds(4).maxX, 4);
 for (const id of [3, 4]) {
  const toggle = f.toggle(id);
  assert.equal(toggle.label.fontSize, 26);
  assert(!toggle.node.getComponent(Graphics));
  assert(toggle.node.height >= 44 && toggle.node.width >= 44);
 }
 f.tap(3,30);assert.deepEqual(f.paint(),[3,4,13]);
 f.tap(3);assert.deepEqual(f.paint(),[2,3,4,13]);
 near(f.portrait(2).y,f.portrait(3).y);
 near(f.painted(2).minX - f.painted(3).maxX, 10);
 near(toggleBounds(3).minX - f.painted(2).maxX, 4);
 assert.equal(f.toggle(3).label.string, '\u2039');
 f.tap(4);assert.deepEqual(f.paint(),[3,4,5,6,13]);
 for(const id of [5,6]){
  near(f.portrait(id).y,f.portrait(4).y);
  near(f.painted(id - 1).minX - f.painted(id).maxX, 10);
  assert.equal(f.portrait(id).getChildByName('labName').active,false);
 }
 near(f.painted(6).minX - toggleBounds(4).maxX, 4);
 assert.equal(f.toggle(4).label.string, '\u203a');
 arrowPoints(f.portrait(5),{x:1000,y:220});
 assert.equal(f.portrait(5).getChildByName('labNum').getComponent(Label).string,'100');
 f.tap(4);assert.deepEqual(f.paint(),[3,4,13]);
 f.tap(4);assert.deepEqual(f.paint(),[3,4,5,6,13]);
 f.state.ctrGame.gameData.round++;
 assert.deepEqual(f.paint(),[3,4,13],'The following wave opens collapsed');
 delete f.state.ctrGame.gameData.enemyQueue[13];
 delete f.state.ctrGame.gameData.enemyQueue[6];
 assert.deepEqual(f.paint(),[2,3,4,5],'Four portraits remain separate despite their enemy counts');
 assert.equal(f.toggle(3).node.active,false);
 assert.equal(f.toggle(4).node.active,false);
 assert.equal(f.portrait(5).getChildByName('labName').active,true);
});
test('A long expanded wave group fits the safe area in one row and restores portrait size when closed',()=>{
 const f=upcomingFixture([[1,2,3,4,5,6]],Array.from({length:6},(_,i)=>[i+1,1000,180]),450);
 const previousSys=cc.sys;
 try{
  cc.sys={getSafeAreaRect:()=>({x:-200,y:-630,width:400,height:1260})};
  assert.deepEqual(f.paint(),[1]);
  assert.equal(f.portrait(1).scaleX,1);
  f.tap(1);assert.deepEqual(f.paint(),[1,2,3,4,5,6]);
  for (const id of [1, 2, 3, 4, 5, 6]) {
   const node = f.portrait(id), rect = context.enemyIndicatorFootprint(node, f.ui);
   near(node.y, f.portrait(1).y);
   assert(node.x + rect.minX >= -184 - 1e-6 && node.x + rect.maxX <= 184 + 1e-6);
   if (id > 1) assert(clear(f.painted(id), f.painted(id - 1), 10));
  }
  const close = bounds(f.toggle(1).node, f.ui);
  assert(close.minX >= -184 - 1e-6 && close.maxX <= 184 + 1e-6);
  near(f.painted(6).minX - close.maxX, 4);
  assert(f.portrait(1).scaleX<1);
  assert.equal(f.toggle(1).node.scaleX,1);
  f.tap(1);assert.deepEqual(f.paint(),[1]);
  assert.equal(f.portrait(1).scaleX,1);
 }finally{cc.sys=previousSys;}
});
test('battle start immediately clears every marker and queued portraits stay hidden until planning resumes',()=>{
 const f=upcomingFixture([[1,2,3],[4,5]],[[1,-600,650],[2,-600,500],[3,-600,400],[4,600,-250],[5,600,-350]]),s=f.state;
 s.ctrGame.ctrPlay={ndRange:new Node('Range')};s.playBattleMusic=()=>{};
 Object.assign(s.ctrGame.gameData,{getBulidList:()=>[],startRoundGame(){}});
 s.ctrUI.ndLight=new Node('Light');
 assert.deepEqual(f.paint(),[1,4]);
 f.tap(1);assert.deepEqual(f.paint(),[1,2,3,4]);
 const live={id:7,tag:true,_guideLive:true,ndItem:f.indicator()};s.enemyIconInfo['live:0']=live;live.ndItem.active=true;
 const tween={set(){return this;},to(){return this;},call(){return this;},start(){}};cc.tween=()=>tween;
 context.BattleSounds={};context.$z1AudioMgr={AudioMgr:{getInstance:()=>({playMusic(){}})}};
 Object.assign(context.$z1KinghtFallConfig,{KinghtFallParameter:{BattleNightStrength:1},KinghtFallAudioId:{}});
 const start=vm.runInNewContext('('+functionAt('_ctor.prototype.startRoundGame =')+')',context);start.call(s);
 assert.equal(s.ctrGame.gameStatus,1);assert(Object.values(s.enemyIconInfo).every(r=>!r.ndItem.active&&!r.tag),'Markers survived the synchronous start');
 assert.equal(f.toggle(1).node.active,false);assert.equal(f.toggle(4).node.active,false);
 update.call(s,.016);assert(Object.values(s.enemyIconInfo).every(r=>!r.ndItem.active),'Transition repainted queued markers');
 s.ctrGame.gameStatus=2;update.call(s,.016);assert(Object.values(s.enemyIconInfo).every(r=>!r.ndItem.active));
 f.enemy(1800,0,7);update.call(s,.016);assert.equal(s.enemyIconInfo[1].ndItem.active,false);assert(Object.values(s.enemyIconInfo).some(r=>r._guideLive&&r.ndItem.active),'Arrived distant enemies need a live marker');
 s.ctrGame.gameStatus=0;assert.deepEqual(f.paint(),[1,4]);assert(Object.values(s.enemyIconInfo).filter(r=>r._guideLive).every(r=>!r.ndItem.active));
});
console.log(passed+' enemy indicator HUD-layout checks passed.');
