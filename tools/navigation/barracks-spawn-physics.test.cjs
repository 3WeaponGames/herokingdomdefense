'use strict';
// Real barracks activation and soldier AI with Creator's Box2D contact solver.
// Scene/animation adapters do not start rendering, audio or player persistence.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {environment,Node,Vec2,PhysicsBoxCollider,distance}=require('./runtime-harness.cjs');
const box2dPath=path.join(process.env.COCOS_ENGINE_DIR||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','external/box2d/box2d.js');

function setup(gate){
  const e=environment(),game=e.game;Object.assign(game,{isAgg:false,_separateArmyCommands:true,mapSize:{width:800,height:800}});game.ctrPlay.node.setPosition(350,350);
  e.stubs.BuildingSpawnPositions=require('../../assets/_script/BuildingSpawnPositions');e.stubs.TestMode={TestMode:{getInstance:()=>({shouldBypassAdLimits:()=>false})}};
  if(!Vec2.prototype.multiplyScalar)Vec2.prototype.multiplyScalar=function(value){this.x*=value;this.y*=value;return this;};
  const footprint=e.box(0,0,120,120,!!gate),other=e.box(240,160,40,120);
  if(gate)game.gameData.buildings[0].getNavigationGateShapes=()=>[{collider:footprint,points:[{x:-60,y:-60},{x:60,y:-60},{x:60,y:60},{x:-60,y:60}]}];
  const Barracks=e.load('KinghtFallBuildBarracks').default,barracks=new Barracks();
  Object.assign(barracks,{node:new Node('Barracks',game.ndMain),ndBotnNodeList:new Node('Legacy spawn',game.ndMain,-250,0),buildInfo:{cfg:{Data:[1,90002,.1],SpawnPosition:{x:0,y:0}}},ndVideoSoldier:{SolID:90002}});
  let created=0;
  game.addSoldier=(_id,callback)=>{
    const unit=e.actor('KinghtFallSoldierItem02',-300,0);delete unit.isDead;
    unit.cfg={...e.cfg,ID:90002};unit.uuid='blocked-spawn-'+(++created);unit.node.addComponent(PhysicsBoxCollider).size={width:18,height:18};
    unit._refreshLevelStats=()=>false;unit.initBuffData=function(){this.hpMax=this.hp=100;};game.gameData.soldiers.push(unit);callback(unit);
  };
  barracks.initSoldier();const unit=barracks.enemyList[0];
  assert(unit&&!unit._spawnPending&&!unit.isDead(),'A blocked authored spawn must activate its owned soldier');
  assert(unit.node.active&&unit.rigidBody.active&&unit.hp>0,'The soldier must remain visible, alive and physical');
  assert.equal(created,1);assert(distance(unit.node,{x:0,y:0})<1e-6,'Recovery must begin at the authored spawn, not teleport onto a path');
  return{e,game,barracks,unit,footprint,other,created:()=>created};
}

for(const gate of [false,true])test('blocked barracks '+(gate?'gate':'terrain')+' spawn walks out through real temporary contacts and retains friendly navigation',{skip:!fs.existsSync(box2dPath)},()=>{
  const f=setup(gate),{e,unit,footprint,other}=f,b=require(box2dPath),world=new b.b2World(new b.b2Vec2(0,0)),navigation=e.nav.get(f.game);
  const radius=navigation.radius(unit),origin=unit.node.position;
  function body(x,y,width,height,dynamic,collider){
    const def=new b.b2BodyDef();def.type=dynamic?b.b2BodyType.b2_dynamicBody:b.b2BodyType.b2_staticBody;def.fixedRotation=true;def.allowSleep=false;def.position.Set(x/32,y/32);
    const result=world.CreateBody(def),shape=new b.b2PolygonShape();shape.SetAsBox(width/64,height/64);result.CreateFixture(shape,1).SetUserData(collider);return result;
  }
  body(0,0,120,120,false,footprint);body(other.node.x,other.node.y,other.size.width,other.size.height,false,other);
  const moving=body(unit.node.x,unit.node.y,18,18,true,null);let suppressed=0;
  const listener=new b.b2ContactListener();listener.PreSolve=contact=>{
    const a=contact.GetFixtureA(),collider=(a.GetBody()===moving?contact.GetFixtureB():a).GetUserData(),adapter={};unit.onPreSolve(adapter,null,collider);
    if(adapter.disabledOnce){assert.equal(collider,footprint,'A new unrelated obstacle must stay solid');contact.SetEnabled(false);suppressed++;}
  };world.SetContactListener(listener);
  const unrelatedContact={};unit.onPreSolve(unrelatedContact,null,other);assert(!unrelatedContact.disabledOnce);
  // Activation must capture overlap before the first physics step, even if no
  // soldier update has run yet. Otherwise Box2D can push/pin the fresh body.
  world.Step(1/60,10,10);assert(suppressed>0,'Initial overlap contacts were not prepared during activation');
  let p=moving.GetPosition();assert(distance(origin,{x:p.x*32,y:p.y*32})<1e-6,'Physics displaced the spawn before its controlled walk');
  if(gate){
    assert.equal(navigation.gridFor(unit),navigation.grid,'Only this recovering spawn must temporarily include the gate footprint');
    const ordinary=e.unit(0,0);ordinary.navigationTeam='friendly';assert(navigation.gridFor(ordinary).isWalkable(ordinary.node,radius),'Ordinary friendly gate passage must remain open');
  }
  let escaped=false,walkingFrames=0,firstClear=null;
  for(let frame=0;frame<600;frame++){
    e.setTime((frame+1)*1000/60);e.nav.beginFrame(f.game);const before=unit.node.position;unit.onUpdate(1/60);
    assert(distance(before,unit.node)<=unit.getSpeed()/60+1e-6,'Blocked spawn recovery changed speed or teleported');
    if(distance(before,unit.node)>1e-6)walkingFrames++;
    assert(navigation.grid.canExitBlocked(before,unit.node,radius),'Recovery entered or re-entered solid terrain');
    moving.SetTransformVec(new b.b2Vec2(unit.node.x/32,unit.node.y/32),0);moving.SetLinearVelocity(new b.b2Vec2(0,0));world.Step(1/60,10,10);
    p=moving.GetPosition();unit.node.setPosition(p.x*32,p.y*32);assert(distance(before,unit.node)<=unit.getSpeed()/60+1e-5,'Native contact moved the recovering soldier outside its normal step');
    assert(unit.node.active&&!unit.isDead()&&unit.hp===100);assert.equal(f.created(),1);
    if(navigation.grid.isWalkable(unit.node,radius)&&!firstClear)firstClear=unit.node.position;
    if(firstClear&&!unit._automaticEgress){escaped=true;break;}
  }
  assert(escaped&&walkingFrames>1,'The live actor must walk onto available path ground');
  assert(distance(origin,firstClear)<=60+radius+Math.SQRT2*navigation.grid.cellSize+1,'The actor passed nearby clear ground instead of using the nearest exit');
  const contactAfterExit={};unit.onPreSolve(contactAfterExit,null,footprint);assert(!contactAfterExit.disabledOnce,'The overlap collision exception must expire after exit');
  assert.equal(unit._terrainExit,null);
  if(gate){
    assert.notEqual(navigation.gridFor(unit),navigation.grid,'Full-grid recovery must release the friendly gate exception');
    assert(navigation.gridFor(unit).findPath({x:-180,y:0},{x:180,y:0},radius).reached,'The emerged soldier must retain normal friendly gate traversal');
  }else{
    assert(!navigation.grid.canExitBlocked(unit.node,origin,radius),'Free ground must not reacquire permission to enter the old blocker');
  }
  const resting=unit.node.position;
  for(let frame=0;frame<60;frame++){e.setTime((frame+601)*1000/60);e.nav.beginFrame(f.game);unit.onUpdate(1/60);assert(distance(resting,unit.node)<1e-6,'Recovery returned to its obstructed authored post');}
});
