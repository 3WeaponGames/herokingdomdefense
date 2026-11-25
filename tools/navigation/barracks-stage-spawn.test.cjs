'use strict';
// Stage-local deployment destinations use the real barracks, soldier and navigation
// methods. Config lookup, artwork and sound remain inert scene adapters.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {environment,Node,Vec2,PhysicsBoxCollider,PhysicsCircleCollider,distance}=require('./runtime-harness.cjs');
const Positions=require('../../assets/_script/BuildingSpawnPositions');
const authored=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(applyScale=false){
 const e=environment(),game=e.game,rows=clone(authored.BuildEnum[3].levelList);game.mapSize={width:3000,height:3000};game.ctrPlay.node.setPosition(1400,1400);game.isAgg=false;game._separateArmyCommands=true;
 if(!Vec2.prototype.multiplyScalar)Vec2.prototype.multiplyScalar=function(value){this.x*=value;this.y*=value;return this;};
 // The building base supplies the selected authored row; the barracks retains
 // its actual setLevel/roster/respawn path for every branch and tier.
 function Base(){}Base.prototype.setLevel=function(index){this.index=index;this.buildInfo.cfg=clone(rows.find(row=>row.index===index));this.buildInfo.cfg.Data[0]=1;this.ndVideoSoldier.SolID=this.buildInfo.cfg.Data[1];if(applyScale)worldScale.apply(this);};
 const positionRuntime={},worldScale={},runtimeRequire=name=>{assert.equal(name,'BuildingModelOffset');return require('../../assets/_script/BuildingModelOffset');};
 for(const[name,exports]of [['BuildingSpawnPositions',positionRuntime],['BuildingWorldScale',worldScale]])vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/'+name+'.js'),'utf8'),{exports,cc:e.cc,require:runtimeRequire});
 e.stubs.KinghtFallBuildBase={default:Base};e.stubs.BuildingSpawnPositions=positionRuntime;e.stubs.TestMode={TestMode:{getInstance:()=>({shouldBypassAdLimits:()=>false})}};
 e.stubs.RelicBattle={replacementInterval:(_state,value)=>value};e.stubs.RelicRuntime={current:()=>null};
 const Type=e.load('KinghtFallBuildBarracks').default;let created=0;
 game.gameData.delSoldier=unit=>{unit.node.active=false;unit._isPooled=true;game.gameData.soldiers=game.gameData.soldiers.filter(current=>current!==unit);};
 game.addSoldier=(id,done)=>{const unit=e.actor('KinghtFallSoldierItem'+String(id-90000).padStart(2,'0'),0,0);delete unit.isDead;unit.uuid='stage-spawn-'+(++created);unit.cfg={...e.cfg,ID:id};unit.node.addComponent(PhysicsCircleCollider).radius=8;unit._refreshLevelStats=()=>false;unit.initBuffData=function(){this.hpMax=this.hp=100;};game.gameData.soldiers.push(unit);done(unit);};
 function building(x=0,y=0){const b=new Type();Object.assign(b,{node:new Node('Barracks',game.ndMain,x,y),buildInfo:{cfg:null},getIsWork:()=>true,canAddVideoSoldier:()=>false,_testAdLimitBypass:false});b.ndBotnNodeList=new Node('Legacy formation',b.node,0,-80);b.ndVideoSoldier=new Node('Doorway',b.node,0,-140);b.ndPro={active:false,getChildByName:()=>({getComponent:()=>({fillRange:0})})};return b;}
 return{e,game,rows,building,created:()=>created};
}
function expected(f,b,p){return f.game.ndMain.convertToNodeSpaceAR(b.node.convertToWorldSpaceAR(new Vec2(p.x,p.y)));}
function near(actual,point){assert(distance(actual,point)<1e-6,JSON.stringify({actual:{x:actual.x,y:actual.y},expected:point}));}

function barracksFootprint(f, building, width, height){
 const blocker=building.node.addComponent(PhysicsBoxCollider);
 blocker.size={width,height};
 f.game.gameData.buildings.push(building);
 return blocker;
}

function assertExitOnRay(f, unit, spawn, destination){
 const length=distance(spawn,destination),dx=(destination.x-spawn.x)/length,dy=(destination.y-spawn.y)/length;
 const departure=unit.node.position,x=departure.x-spawn.x,y=departure.y-spawn.y;
 assert(x*dx+y*dy>0&&Math.abs(x*dy-y*dx)<1e-6,'The departure faces the destination');
 const nav=f.e.nav.get(f.game),radius=nav.radius(unit,true);
 assert(nav.grid.isWalkable(departure,radius), 'The entire body clears the building');
 assert(!nav.grid.isWalkable({x:departure.x-dx*.1,y:departure.y-dy*.1},radius), 'The position is right outside the blocker');
 assert.equal(unit._terrainExit,null);
}

test('a centered spawn uses the first destination for recruits and the last rally for casualties',()=>{
 const f=fixture(),b=f.building(),[first,upgrade]=f.rows;
 first.SpawnPosition=upgrade.SpawnPosition={x:0,y:0};
 const north={x:0,y:330},south={x:0,y:-320};
 b.squadSpawnPosition=new Vec2(south.x,south.y);
 barracksFootprint(f,b,84,156);
 b.setLevel(first.index);
 const original=b.enemyList[0],origin=expected(f,b,first.SpawnPosition);
 assertExitOnRay(f,original,origin,south);
 near(original.rallyPoint.pos,south);

 original.setPersonalRallyPoint(north,true);
 respawn(b,original);
 assertExitOnRay(f,original,origin,north);
 near(original.rallyPoint.pos,north);

 const beforeUpgrade=original.node.position;
 const buff=f.e.stubs.KinghtFallEnum.KinghtFallEnumBuffCfg.Buff23;
 f.game.gameData.getGameBuff=id=>id===buff?{Pamer:[1]}:null;
 b.setLevel(upgrade.index);
 assert.equal(b.enemyList.length,2);
 near(original.node,beforeUpgrade);
 const recruited=b.enemyList[1],departure=recruited.node.position;
 assertExitOnRay(f,recruited,origin,south);
 near(recruited.rallyPoint.pos,south);
 for(let frame=1;frame<=20;frame++){
  f.e.setTime(frame*50);f.e.nav.beginFrame(f.game);recruited.onUpdate(.05);
 }
 assert(distance(recruited.node,south)<distance(departure,south));
});

test('a mirrored and rotated barracks uses its current tier footprint and stage destination',()=>{
 const f=fixture(true),b=f.building(-150,210),row=f.rows[0];
 b.node.angle=32;b.node.scaleX=-.85;b.node.scaleY=1.3;
 b.squadSpawnPosition=new Vec2(-140,-230);
 row.SpawnPosition={x:0,y:0};
 const destination=expected(f,b,b.squadSpawnPosition);
 const oldGrid=f.e.nav.get(f.game);oldGrid.refresh();
 barracksFootprint(f,b,178,130);
 b.setLevel(row.index);
 near(b.enemyList[0].rallyPoint.pos,destination);
 assertExitOnRay(f,b.enemyList[0],expected(f,b,row.SpawnPosition),destination);
});

test('a blocked ray sends a crowded squad to open ground on the same side',()=>{
 const f=fixture(),b=f.building(),row=f.rows[0],origin={x:0,y:0};
 row.SpawnPosition=origin;
 b.squadSpawnPosition=new Vec2(0,420);
 barracksFootprint(f,b,170,100);
 const obstacle=f.e.box(0,86,50,60);
 const buff=f.e.stubs.KinghtFallEnum.KinghtFallEnumBuffCfg.Buff23;
 f.game.gameData.getGameBuff=id=>id===buff?{Pamer:[5]}:null;
 b.setLevel(row.index);
 const nav=f.e.nav.get(f.game),grid=nav.grid;
 const polygon=grid.polygons[grid.terrainColliders.indexOf(obstacle)].vertices;
 assert.equal(b.enemyList.length,6);
 b.enemyList.forEach((unit,index)=>{
  const radius=nav.radius(unit,true),spawn=unit.node.position;
  assert(unit.node.active&&!unit._spawnPending);
  assert(spawn.y>0&&grid.isWalkable(spawn,radius), 'Each recruit fits north of the barracks center');
  assert(!grid._hitsPolygon(origin,spawn,radius,polygon), 'A second blocker cannot be crossed');
  for(let other=0;other<index;other++){
   const member=b.enemyList[other];
   assert(distance(member.node,spawn)>=radius+nav.radius(member,true)+4-1e-6, 'Squad bodies stay separate');
  }
 });
});

test('a fully blocked barracks retries the same recruit when room becomes available',()=>{
 const f=fixture(),b=f.building(),row=f.rows[0];
 f.game.mapSize={width:160,height:160};
 row.SpawnPosition={x:0,y:0};b.squadSpawnPosition=new Vec2(0,-72);
 const blocker=barracksFootprint(f,b,180,180);
 b.setLevel(row.index);
 const unit=b.enemyList[0];
 assert(unit._spawnPending&&!unit.node.active);
 assert.equal(f.created(),1);
 blocker.size={width:65,height:60};
 f.e.setTime(300);f.e.nav.beginFrame(f.game);b.doTime(.3);
 assert(unit.node.active&&!unit._spawnPending&&!unit.isDead());
 assert.equal(f.created(),1);
 assert.equal(b.enemyList[0],unit);
 assertExitOnRay(f,unit,row.SpawnPosition,b.squadSpawnPosition);
});

test('stage destinations stay separate from building spawn defaults and accept a zero offset',()=>{
 const row={SpawnPosition:{x:35,y:-70},SpawnPositions:{'1':{x:50,y:-80}}},owner={squadSpawnPosition:{x:0,y:0,future:'stage'}},before=JSON.stringify({row,owner});
 assert.equal(Positions.anchor(row),row.SpawnPosition);
 assert.equal(Positions.destination(row,owner),owner.squadSpawnPosition);
 for(const value of [undefined,null,{x:'0',y:0},{x:NaN,y:0},{x:10001,y:0}]) assert.equal(Positions.destination(row,{squadSpawnPosition:value}),null);
 assert.equal(JSON.stringify({row,owner}),before);
});

test('new branch recruits use the building spawn and keep the exact transformed stage destination through upgrades',()=>{
 const f=fixture(true),b=f.building(180,90),point={x:140,y:-210};
 b.node.angle=32;b.node.scaleX=-.75;b.node.scaleY=1.15;
 b.squadSpawnPosition=new Vec2(point.x,point.y);
 const destination=expected(f,b,point),sourceBefore=JSON.stringify(authored.BuildEnum[3].levelList);
 f.rows.forEach((row,index)=>{row.WorldScale=.5+index*.06;row.ModelOffset={x:60-index*4,y:-25+index*2};});
 for(const row of f.rows){
  const previous=b.enemyList[0],position=previous&&previous.node.position;
  b.setLevel(row.index);
  const unit=b.enemyList[0];
  assert.equal(b.enemyList.length,1);
  assert(b._buildingWorldScaleRuntime&&unit.node.active&&!unit.isDead());
  near(unit.node,unit===previous?position:expected(f,b,row.SpawnPosition));
  near(unit.rallyPoint.pos,destination);
  assert(!('rallyPosts' in b.getSave()),'The editor destination is never recorded as a player order');
 }
 assert.deepEqual({...b.squadSpawnPosition},point);
 assert.equal(JSON.stringify(authored.BuildEnum[3].levelList),sourceBefore);
});

test('a stage destination changes only its own barracks and new troops walk to it',()=>{
 const f=fixture(),custom=f.building(-450),inherited=f.building(450),row=f.rows[0];
 custom.squadSpawnPosition=new Vec2(-90,-230);
 custom.setLevel(row.index);inherited.setLevel(row.index);
 const unit=custom.enemyList[0],neighbor=inherited.enemyList[0],destination=expected(f,custom,custom.squadSpawnPosition);
 const spawn=expected(f,custom,row.SpawnPosition),neighborSpawn=expected(f,inherited,row.SpawnPosition);
 near(unit.node,spawn);near(unit.rallyPoint.pos,destination);
 near(neighbor.node,neighborSpawn);near(neighbor.rallyPoint.pos,neighborSpawn);
 for(let frame=0;frame<260;frame++){
  const before=unit.node.position;
  f.e.setTime(frame*50);f.e.nav.beginFrame(f.game);unit.onUpdate(.05);
  assert(distance(before,unit.node)<=unit.getSpeed()*.05+1e-6,'Uses ordinary walking speed');
 }
 near(unit.node,destination);near(neighbor.node,neighborSpawn);
 assert.equal(f.created(),2);
});

test('an explicit origin destination preserves the legacy numbered spawn slot',()=>{
 const f=fixture(),row=f.rows[0];
 delete row.SpawnPosition;row.SpawnPositions={'1':{x:55,y:-120,future:'keep'}};
 const before=JSON.stringify(row),b=f.building(-450);
 b.squadSpawnPosition=new Vec2(0,0);b.setLevel(row.index);
 near(b.enemyList[0].node,expected(f,b,row.SpawnPositions['1']));
 near(b.enemyList[0].rallyPoint.pos,expected(f,b,{x:0,y:0}));
 assert.equal(JSON.stringify(row),before);
});

function respawn(b,unit){
 unit.hp=0;unit.state=4;unit.node.active=false;unit.rigidBody.active=false;
 b.addDie(unit);b.time.Reborn=b.time.RebornMax;b.doTime(.05);
 assert.equal(b.enemyList[0],unit);assert.equal(b.waitEnemy.length,0);
 assert(unit.node.active&&!unit.isDead());
}

test('respawns use the building spawn and a saved rally replaces the first destination',()=>{
 const f=fixture(),b=f.building(),point={x:-170,y:-130},row=f.rows[0];
 b.squadSpawnPosition=new Vec2(point.x,point.y);b.setLevel(row.index);
 const unit=b.enemyList[0],spawn=expected(f,b,row.SpawnPosition);
 near(unit.rallyPoint.pos,expected(f,b,point));
 respawn(b,unit);near(unit.node,spawn);near(unit.rallyPoint.pos,spawn);
 const rally={x:260,y:180};unit.setPersonalRallyPoint(rally,true);
 respawn(b,unit);near(unit.node,spawn);near(unit.rallyPoint.pos,rally);
 assert.deepEqual({...b.getSoldierRallyPoint(unit)},rally);
 assert.equal(f.created(),1);assert.equal(b.squadSpawnPosition.x,point.x);
});

test('a blocked stage destination leaves the spawn on safe ground and does not teleport troops',()=>{
 const f=fixture(),b=f.building(),row=f.rows[0],point={x:0,y:-380};
 b.squadSpawnPosition=new Vec2(point.x,point.y);f.e.box(point.x,point.y,120,120);b.setLevel(row.index);
 const unit=b.enemyList[0],nav=f.e.nav.get(f.game),radius=nav.radius(unit),grid=nav.gridFor(unit),spawn=expected(f,b,row.SpawnPosition);
 near(unit.node,spawn);
 for(let frame=0;frame<300;frame++){
  const before=unit.node.position;
  f.e.setTime(frame*50);f.e.nav.beginFrame(f.game);unit.onUpdate(.05);
  assert(unit.node.active&&!unit.isDead());
  assert(grid.isWalkable(unit.node,radius)&&distance(before,unit.node)<=unit.getSpeed()*.05+1e-6);
 }
 assert(distance(unit.node,spawn)>120,'The unit walks toward the projected destination');
 assert.equal(f.created(),1);
});

for(const blocked of [false,true])test('a returning soldier scans its '+(blocked?'blocked':'clear')+' doorstep before walking to its post',()=>{
 const f=fixture(),b=f.building(),row=f.rows[0];row.SpawnPosition={x:-450,y:0};b.setLevel(row.index);
 const unit=b.enemyList[0],post={x:350,y:0},spawn=expected(f,b,row.SpawnPosition);
 unit.cfg.SightRange=100;unit.attackRange=42;unit.setPersonalRallyPoint(post,true);
 delete unit.getFind;delete unit.onFindList;
 const target=(x,y)=>({node:new Node('enemy',f.game.ndMain,x,y),dead:false,isDead(){return this.dead;}});
 const first=target(spawn.x+30,spawn.y),later=target(-270,45),attacks=[];
 f.game.gameData.enemies.push(first,later);
 unit.doAttackStart=function(){attacks.push(this._orderTarget);this._orderTarget.dead=true;this.time.Attack=0;this.doIdel();};
 const obstacle=blocked&&f.e.box(spawn.x,spawn.y,90,90);
 f.e.nav.beginFrame(f.game);
 respawn(b,unit);near(unit.node,spawn);
 if(blocked)assert(unit._terrainExit);
 const step=(frame)=>{f.e.setTime(frame*50);f.e.nav.beginFrame(f.game);unit.onUpdate(.05);};
 step(0);
 assert.deepEqual(attacks,[first]);near(unit.node,spawn);
 if(obstacle)obstacle.enabled=false;
 for(let frame=1;frame<500;frame++)step(frame);
 assert.deepEqual(attacks,[first,later]);near(unit.node,post);
 assert.equal(unit._deployingFromBarracks,false,'Ordinary standing orders resume on arrival');
});
