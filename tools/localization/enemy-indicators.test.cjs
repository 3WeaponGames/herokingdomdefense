'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../..'),source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIGame.js'),'utf8');
const data=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'),'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'),'utf8'));
const taskPatch=require('./battle-task-layout-patch.json');
function functionAt(marker){const start=source.indexOf('function',source.indexOf(marker)),open=source.indexOf('{',start);let depth=1,end=open+1;for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}return source.slice(start,end);}
class Label{_forceUpdateRenderData(){}}Label.Overflow={CLAMP:1,NONE:0};class Sprite{}
class Node{
  constructor(name='node',parent=null){this.name=name;this.parent=parent;this.children=[];if(parent)parent.children.push(this);this.active=true;this.x=0;this.y=0;this.width=0;this.height=0;this.anchorX=this.anchorY=0.5;this.scaleX=this.scaleY=1;this.angle=0;this.components=[];}
  get activeInHierarchy(){return this.active&&(!this.parent||this.parent.activeInHierarchy);}
  getChildByName(name){return this.children.find(x=>x.name===name);}
  getComponent(Type){const component=this.components.find(x=>x instanceof Type);if(component)component.node=this;return component;}
  getPosition(){return{x:this.x,y:this.y};}
  setContentSize(width,height){this.width=width;this.height=height;}
  setPosition(x,y){if(typeof x==='object'){this.x=x.x;this.y=x.y;}else{this.x=x;this.y=y;}}
  setParent(parent){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=parent;parent.children.push(this);}
  setSiblingIndex(){}
  convertToWorldSpaceAR(point){const a=this.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=point.x*this.scaleX,y=point.y*this.scaleY;const p={x:this.x+c*x-s*y,y:this.y+s*x+c*y};return this.parent?this.parent.convertToWorldSpaceAR(p):p;}
  convertToNodeSpaceAR(point){const p=this.parent?this.parent.convertToNodeSpaceAR(point):point,a=-this.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=p.x-this.x,y=p.y-this.y;return{x:(c*x-s*y)/this.scaleX,y:(s*x+c*y)/this.scaleY};}
}
const cc={v2:(x,y)=>({x,y}),isValid:x=>!!x&&!x.destroyed,Label,Sprite,Camera:{main:{getWorldToScreenPoint:p=>p}}};
const context={cc,$z1KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getSoldierCfgById:id=>({loadIcon:String(id)})})}},$z1KinghtFallConfig:{KinghtFallBundelName:{Enemy:'enemy'}}};
context.resolveEnemyPictogram=vm.runInNewContext('('+functionAt('function resolveEnemyPictogram')+')',context);
const loadPictogram=vm.runInNewContext('('+functionAt('_ctor.prototype._loadEnemyPictogram =')+')',context);
context.placeEnemyIndicator=vm.runInNewContext('('+functionAt('function placeEnemyIndicator')+')',context);
context.enemyIndicatorBounds=vm.runInNewContext('('+functionAt('function enemyIndicatorBounds')+')',context);
const getObstacles=vm.runInNewContext('('+functionAt('_ctor.prototype._enemyIndicatorObstacles')+')',context);
const place=vm.runInNewContext('('+functionAt('_ctor.prototype._placeEnemyIndicator')+')',context);
const update=vm.runInNewContext('('+functionAt('_ctor.prototype.update =')+')',context);
const updateLive=vm.runInNewContext('('+functionAt('_ctor.prototype._updateOffscreenEnemies =')+')',context);
function authored(index,parent,english=true){const source=data[index],node=new Node(source._name,parent),trs=source._trs&&source._trs.array;node.width=source._contentSize?source._contentSize.width:0;node.height=source._contentSize?source._contentSize.height:0;node.active=source._active!==false;if(source._anchorPoint){node.anchorX=source._anchorPoint.x;node.anchorY=source._anchorPoint.y;}if(trs){node.x=trs[0];node.y=trs[1];node.scaleX=trs[7];node.scaleY=trs[8];node.angle=2*Math.atan2(trs[5],trs[6])*180/Math.PI;}for(const ref of source._components||[]){const component=data[ref.__id__];if(component.__type__==='cc.Label'){const label=new Label();label.string=component._string;node.components.push(label);const key='ui.layout.kinghtfalluigame.'+ref.__id__,style=english&&((taskPatch.labelStyles[key]||catalog.labelStyles[key]||{}).en);if(style){if(style.width!==undefined)node.width=style.width;if(style.height!==undefined)node.height=style.height;if(style.x!==undefined)node.x=style.x;if(style.y!==undefined)node.y=style.y;}}else if(component.__type__==='cc.Sprite')node.components.push(new Sprite());}for(const child of source._children||[])authored(child.__id__,node,english);return node;}
function fixture(english=true){const canvas=new Node('Canvas'),ui=new Node('UI',canvas);ui.width=750;ui.height=1334;const definition=data.find(x=>x.ndEnemyIcon&&x.btnBuildInfo);const state={_updateTestControls(){},_loadEnemyPictogram:loadPictogram,ctrUI:{node:ui,upGuide(){}},_enemyIndicatorObstacles:getObstacles,_placeEnemyIndicator:place,_updateOffscreenEnemies:updateLive};for(const key of['btnBuildInfo','ndTask','btnSuspend','ndCoin','ndLevelInfo','btnStartFight','btnAddCoin','btnAgg'])state[key]=authored(definition[key].__id__,ui,english);state.ndTask.getChildByName('ndAni').active=false;state.ndEnemyIcon=authored(118,ui,english);state.ndEnemyIcon.active=false;return{state,ui,canvas,indicator:()=>authored(118,ui,english)};}
function near(a,b){assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);}
function clear(a,b,gap=0){return a.maxX+gap<=b.minX+1e-6||a.minX-gap>=b.maxX-1e-6||a.maxY+gap<=b.minY+1e-6||a.minY-gap>=b.maxY-1e-6;}
function bounds(node,ui){return context.enemyIndicatorBounds(node,ui);}
function arrowPoints(node,target){const arrow=node.getChildByName('ndArr');assert(arrow.active);near(arrow.angle,Math.atan2(target.y-node.y,target.x-node.x)*180/Math.PI-90);}
let passed=0;function test(name,run){run();passed++;console.log('PASS '+name);}
test('Unobstructed targets retain their original position and offscreen centers stay within original limits',()=>{const p=context.placeEnemyIndicator,shape={minX:-65,maxX:65,minY:-65,maxY:65},limits={minX:-246,maxX:246,minY:-442,maxY:442};const a=p({x:20,y:30},shape,limits,[],12);near(a.x,20);near(a.y,30);const b=p({x:-900,y:1000},shape,limits,[],12);near(b.x,-246);near(b.y,442);});
test('Actual English and Chinese prefab bounds avoid Buildings, taskbar, and visible HUD controls',()=>{for(const english of[true,false]){const f=fixture(english),node=f.indicator(),obstacles=getObstacles.call(f.state),fixed=obstacles.slice(),target={x:-246,y:396};place.call(f.state,node,target,obstacles);for(const obstacle of fixed)assert(clear(obstacles.at(-1),obstacle,12));assert(node.x>=-246&&node.x<=246&&node.y>=-442&&node.y<=442);arrowPoints(node,target);assert(clear(bounds(node,f.ui),bounds(f.state.btnBuildInfo,f.ui)));}});
test('Multiple indicators at the same spawn edge separate without overlap and keep correct arrows',()=>{const f=fixture(),nodes=[f.indicator(),f.indicator(),f.indicator(),f.indicator()],obstacles=getObstacles.call(f.state),count=obstacles.length,target={x:-600,y:650};for(const node of nodes){place.call(f.state,node,target,obstacles);arrowPoints(node,target);}for(let i=count;i<obstacles.length;i++)for(let j=0;j<i;j++)assert(clear(obstacles[i],obstacles[j],12));for(const node of nodes)assert(node.x>=-246&&node.x<=246&&node.y>=-442&&node.y<=442);});
test('Rotating/previously hidden arrows keep a stable footprint and reactivate after displacement',()=>{const f=fixture(),node=f.indicator(),target={x:-600,y:650};place.call(f.state,node,target,getObstacles.call(f.state));const previous=node.getPosition();for(const angle of[0,31,89,173,270]){node.getChildByName('ndArr').angle=angle;place.call(f.state,node,target,getObstacles.call(f.state));near(node.x,previous.x);near(node.y,previous.y);}place.call(f.state,node,{x:0,y:0},[]);assert.equal(node.getChildByName('ndArr').active,false);place.call(f.state,node,target,[]);assert.equal(node.getChildByName('ndArr').active,true);});
test('Canvas transforms and inactive controls do not change local placement or leave phantom blockers',()=>{const f=fixture(),node=f.indicator(),target={x:-246,y:396};place.call(f.state,node,target,getObstacles.call(f.state));const first=node.getPosition();f.canvas.x=375;f.canvas.y=667;f.canvas.scaleX=f.canvas.scaleY=0.5;f.canvas.angle=8;place.call(f.state,node,target,getObstacles.call(f.state));near(node.x,first.x);near(node.y,first.y);for(const key of['btnBuildInfo','ndTask','btnSuspend','ndCoin','ndLevelInfo','btnStartFight','btnAddCoin','btnAgg'])f.state[key].active=false;assert.equal(getObstacles.call(f.state).length,0);place.call(f.state,node,target,[]);near(node.x,target.x);near(node.y,target.y);});
test('Live update retains per-spawn enemy counts/visibility and applies separation to new clones',()=>{const f=fixture(),state=f.state,pathNode=new Node('Path',f.ui);new Node('ndEnemy1',pathNode).setPosition(-600,650);new Node('ndEnemy2',pathNode).setPosition(-600,650);Object.assign(state,{isPauset:false,speed:1,enemyIconInfo:{},ctrGame:{onUpdate(){},ndPath:pathNode,gameData:{baseBuild:{getLevel:()=>1},enemyQueue:{1:[{id:7,num:9}],2:[{id:8,num:3}]}}},loadSpriteFrame(bundle,key,callback){callback({key});}});cc.instantiate=()=>f.indicator();update.call(state,0.016);const a=state.enemyIconInfo[1].ndItem,b=state.enemyIconInfo[2].ndItem;assert(a.active&&b.active);assert.equal(a.getChildByName('labNum').getComponent(Label).string,'9');assert.equal(b.getChildByName('labNum').getComponent(Label).string,'3');assert(clear(bounds(a,f.ui),bounds(b,f.ui),12));delete state.ctrGame.gameData.enemyQueue[2];update.call(state,0.016);assert.equal(b.active,false);assert.equal(a.active,true);});
test('Impossible packing still returns a finite bounded position without hiding indicator data',()=>{const p=context.placeEnemyIndicator({x:99,y:99},{minX:-50,maxX:50,minY:-50,maxY:50},{minX:-10,maxX:10,minY:-10,maxY:10},[{minX:-999,maxX:999,minY:-999,maxY:999}],12);assert(Number.isFinite(p.x)&&Number.isFinite(p.y));assert(p.x>=-10&&p.x<=10&&p.y>=-10&&p.y<=10);});
test('Active offscreen enemies remain represented in all eight directions without a spawn queue or built castle',()=>{
  const f=fixture(),enemies=[];cc.instantiate=()=>f.indicator();
  cc.view={getVisibleSize:()=>({width:750,height:1334}),getVisibleOrigin:()=>({x:-375,y:-667})};
  for(let sector=0;sector<8;sector++)for(let i=0;i<2;i++){
    const angle=sector*Math.PI/4,node=new Node('enemy',f.ui);node.setPosition(Math.cos(angle)*1800,Math.sin(angle)*1800);
    enemies.push({node,cfg:{ID:90001},isDead:()=>false});
  }
  Object.assign(f.state,{isPauset:false,speed:1,enemyIconInfo:{},ctrGame:{onUpdate(){},gameData:{baseBuild:{getLevel:()=>0},enemyQueue:{},getEnemyList:()=>enemies}},loadSpriteFrame(_bundle,_key,done){done({});}});
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
  Object.assign(f.state,{isPauset:false,speed:1,enemyIconInfo:{},ctrGame:{onUpdate(){},gameData:{baseBuild:{getLevel:()=>0},enemyQueue:{},getEnemyList:()=>enemies}},loadSpriteFrame(_bundle,_key,done){done({});}});
  update.call(f.state,.016);const records=Object.values(f.state.enemyIconInfo);assert.equal(records.length,1);assert.equal(records[0].ndItem.getChildByName('labNum').getComponent(Label).string,'100');
  enemies[0].isDead=()=>true;update.call(f.state,.016);assert.equal(records[0].ndItem.getChildByName('labNum').getComponent(Label).string,'99');
  cc.Camera.main.getWorldToScreenPoint=p=>({x:p.x-1800,y:p.y});update.call(f.state,.016);assert(records.every(r=>!r.ndItem.active));cc.Camera.main.getWorldToScreenPoint=p=>p;
});
test('Live markers use the world camera even when a different UI camera becomes main',()=>{
  const f=fixture(),enemy={node:new Node('enemy',f.ui),cfg:{ID:90002},isDead:()=>false};
  enemy.node.setPosition(1800,0);cc.instantiate=()=>f.indicator();
  Object.assign(f.state,{isPauset:false,speed:1,enemyIconInfo:{},ctrGame:{onUpdate(){},camera:{getWorldToScreenPoint:()=>({x:0,y:0})},gameData:{baseBuild:{getLevel:()=>0},enemyQueue:{},getEnemyList:()=>[enemy]}},loadSpriteFrame(_bundle,_key,done){done({});}});
  update.call(f.state,.016);assert.equal(Object.keys(f.state.enemyIconInfo).length,0);
  const previous=cc.Camera.main;
  try{cc.Camera.main={getWorldToScreenPoint:()=>({x:0,y:0})};f.state.ctrGame.camera.getWorldToScreenPoint=p=>p;update.call(f.state,.016);assert.equal(Object.values(f.state.enemyIconInfo).filter(r=>r.ndItem.active).length,1);}
  finally{cc.Camera.main=previous;}
});
test('custom monster pictograms preserve aspect ratio, reject stale callbacks and fall back to the original icon on load failure',()=>{
 const f=fixture(),pending=[],manager=context.$z1KinghtFallDataMgr.KinghtFallDataMgr,previous=manager.getInstance;
 const settings={unitTypes:{wolf:{icon:'@icon/unit-library/wolf',tint:'#80c0ff'}},unitTypeAssignments:{'enemy:90001:default':'wolf','enemy:90002:default':'wolf'}};
 manager.getInstance=()=>({data:{GameTools:settings},getSoldierCfgById:id=>({loadIcon:String(id)})});cc.color=value=>value;cc.resources={load(path,type,callback){pending.push(callback);}};
 try{
  const record={id:90001,ndItem:f.indicator()},icon=record.ndItem.getChildByName('sprIcon'),sprite=icon.getComponent(Sprite),width=icon.width,height=icon.height;let fallback=0;
  f.state.loadSpriteFrame=(bundle,key,callback)=>{fallback++;callback({key});};loadPictogram.call(f.state,record,90001);record.id=90002;loadPictogram.call(f.state,record,90002);
  pending[0](null,{getOriginalSize:()=>({width:200,height:40})});assert.equal(sprite.spriteFrame,undefined);
  pending[1](null,{getOriginalSize:()=>({width:200,height:40})});near(icon.width/icon.height,5);assert(icon.width<=width&&icon.height<=height);assert.equal(icon.color,'#80c0ff');
  loadPictogram.call(f.state,record,90002);pending[2](Error('missing native texture'));assert.equal(fallback,1);assert.equal(sprite.spriteFrame.key,'icon/90002');near(icon.width,width);near(icon.height,height);assert.equal(icon.color,'#ffffff');
 }finally{manager.getInstance=previous;delete cc.resources;delete cc.color;}
});
test('every monster and boss form uses its own head through the guarded Resources loader',()=>{
 const f=fixture(),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),manager=context.$z1KinghtFallDataMgr.KinghtFallDataMgr,previous=manager.getInstance,pending=[];
 manager.getInstance=()=>({data:config,getSoldierCfgById:id=>config.SoldierCfg[id]});cc.resources={};
 try{f.state.loadSpriteFrame=(bundle,key,done)=>pending.push({bundle,key,done});const record={id:90001,ndItem:f.indicator()};
  const units=Object.values(config.SoldierCfg),legacy=units.filter(unit=>!unit.MonsterSource&&!unit.CampaignBaseUnit),imported=units.filter(unit=>unit.MonsterSource),campaign=units.filter(unit=>unit.CampaignBaseUnit);
  assert.deepEqual(legacy.map(unit=>unit.ID),Array.from({length:12},(_,i)=>90001+i));assert.equal(imported.length,100);
  for(const unit of units){record.id=unit.ID;loadPictogram.call(f.state,record,unit.ID);const request=pending.at(-1);assert.equal(request.bundle,'resources');assert.equal(request.key,unit.loadIcon.slice(6));assert(request.key.startsWith(unit.MonsterSource||unit.CampaignBaseUnit?'icons/monster-roster/':'icons/enemy-heads/'));if(unit.CampaignBaseUnit)assert.equal(unit.loadIcon,config.SoldierCfg[unit.AppearanceSourceUnit].loadIcon);}
  assert.equal(campaign.length,127);assert.equal(pending.length,112+campaign.length);assert.equal(new Set(pending.map(p=>p.key)).size,112);
  assert.equal(new Set(pending.slice(0,12).map(p=>p.key)).size,12,'The original twelve monster and boss portraits remain independent');
  const sprite=record.ndItem.getChildByName('sprIcon').getComponent(Sprite);
  for(const request of pending.slice(0,-1)){request.done({getOriginalSize:()=>({width:128,height:128})});assert.equal(sprite.spriteFrame,undefined);}
  const current={getOriginalSize:()=>({width:128,height:128})};pending.at(-1).done(current);assert.equal(sprite.spriteFrame,current);
 }finally{manager.getInstance=previous;delete cc.resources;}
});
console.log(passed+' enemy indicator HUD-layout checks passed.');
