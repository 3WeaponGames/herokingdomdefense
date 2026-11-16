'use strict';
// Stage-local spawn overrides use the real barracks, soldier and navigation
// methods. Config lookup, artwork and sound remain inert scene adapters.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {environment,Node,Vec2,PhysicsCircleCollider,distance}=require('./runtime-harness.cjs');
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

test('a stage spawn has precedence over shared squad/legacy defaults, including an exact zero offset',()=>{
 const row={SpawnPosition:{x:35,y:-70,future:'default'},SpawnPositions:{'1':{x:50,y:-80}}},owner={squadSpawnPosition:{x:0,y:0,future:'stage'}},before=JSON.stringify({row,owner});
 assert.equal(Positions.anchor(row,owner),owner.squadSpawnPosition);assert.equal(JSON.stringify({row,owner}),before);
 for(const value of [undefined,null,{x:'0',y:0},{x:NaN,y:0},{x:10001,y:0}])assert.equal(Positions.anchor(row,{squadSpawnPosition:value}),row.SpawnPosition);
 const legacy={SpawnPositions:{'1':{x:50,y:-80}}},legacyBefore=JSON.stringify(legacy);assert.equal(Positions.anchor(legacy,{}),null);assert.equal(Positions.get(legacy,0),legacy.SpawnPositions['1']);assert.equal(JSON.stringify(legacy),legacyBefore);
});

test('the same placed barracks override survives every authored branch and tier with exact transformed coordinates',()=>{
 const f=fixture(),b=f.building(180,90),point={x:140,y:-210};b.node.angle=32;b.node.scaleX=.75;b.node.scaleY=1.15;b.squadSpawnPosition=new Vec2(point.x,point.y);
 for(const row of f.rows){b.setLevel(row.index);assert.equal(b.enemyList.length,1);near(b.enemyList[0].node,expected(f,b,point));assert.equal(b.squadSpawnPosition.x,point.x);assert.equal(b.squadSpawnPosition.y,point.y);assert(b.enemyList[0].node.active&&!b.enemyList[0].isDead());}
 assert.equal(JSON.stringify(authored.BuildEnum[3].levelList),JSON.stringify(f.rows),'Runtime placement never rewrites the shared authored rows');
});

test('a stage point stays fixed through real WorldScale and ModelOffset upgrades while inherited defaults still follow tier artwork',()=>{
 const f=fixture(true),custom=f.building(-650,0),inherited=f.building(650,0),point={x:80,y:-140},sourceBefore=JSON.stringify(authored.BuildEnum[3].levelList);custom.node.angle=28;custom.node.scaleX=.75;custom.node.scaleY=1.15;custom.squadSpawnPosition=new Vec2(point.x,point.y);const fixed=expected(f,custom,point);
 f.rows.forEach((row,index)=>{row.WorldScale=.5+index*.06;row.ModelOffset={x:60-index*4,y:-25+index*2};});
 for(const row of f.rows){
  for(const b of [custom,inherited]){const unit=b.enemyList[0];if(unit){unit.hp=0;unit.state=4;unit.node.active=false;unit.rigidBody.active=false;}b.setLevel(row.index);assert(b._buildingWorldScaleRuntime,'The test must apply the real authored owner transform');}
  near(custom.enemyList[0].node,fixed);near(inherited.enemyList[0].node,expected(f,inherited,row.SpawnPosition));assert.equal(custom.squadSpawnPosition.x,point.x);assert.equal(custom.squadSpawnPosition.y,point.y);assert.equal(f.game.gameData.soldiers.length,2);
 }
 assert.equal(JSON.stringify(authored.BuildEnum[3].levelList),sourceBefore);
});

test('a stage override affects only its placed barracks and resetting it restores the inherited default',()=>{
 const f=fixture(),custom=f.building(-450,0),inherited=f.building(450,0),row=f.rows[0];custom.squadSpawnPosition=new Vec2(-90,-130);custom.setLevel(row.index);inherited.setLevel(row.index);
 near(custom.enemyList[0].node,expected(f,custom,custom.squadSpawnPosition));near(inherited.enemyList[0].node,expected(f,inherited,row.SpawnPosition));assert.equal(inherited.squadSpawnPosition,null);
 custom.squadSpawnPosition=null;const casualty=custom.enemyList[0];casualty.hp=0;casualty.state=4;casualty.node.active=false;casualty.rigidBody.active=false;custom._placeSoldier(casualty,0);
 near(casualty.node,expected(f,custom,row.SpawnPosition));assert.equal(custom.squadSpawnPosition,null);
});

test('an explicit stage origin works with legacy numbered defaults while an unconfigured instance keeps its original slot',()=>{
 const f=fixture(),row=f.rows[0];delete row.SpawnPosition;row.SpawnPositions={'1':{x:55,y:-120,future:'keep'}};const before=JSON.stringify(row),custom=f.building(-450,0),inherited=f.building(450,0);custom.squadSpawnPosition=new Vec2(0,0);custom.setLevel(row.index);inherited.setLevel(row.index);
 near(custom.enemyList[0].node,expected(f,custom,{x:0,y:0}));near(inherited.enemyList[0].node,expected(f,inherited,row.SpawnPositions['1']));assert.equal(inherited.squadSpawnPosition,null);assert.equal(JSON.stringify(row),before);
});

test('casualties respawn at the stage override without changing the saved personal rally point',()=>{
 const f=fixture(),b=f.building(),point={x:-170,y:-130};b.squadSpawnPosition=new Vec2(point.x,point.y);b.setLevel(f.rows[0].index);const unit=b.enemyList[0],rally={x:260,y:180};b.setSoldierRallyPoint(unit,rally);unit.node.setPosition(600,600);unit.hp=0;unit.state=4;unit.node.active=false;unit.rigidBody.active=false;b.addDie(unit);b.time.Reborn=b.time.RebornMax;b.doTime(.05);
 assert.equal(b.enemyList[0],unit);assert.equal(f.created(),1);assert.equal(b.waitEnemy.length,0);assert(unit.node.active&&!unit.isDead());near(unit.node,expected(f,b,point));assert.deepEqual({...b.getSoldierRallyPoint(unit)},rally);assert.equal(b.squadSpawnPosition.x,point.x);
});

test('a blocked stage override retains the living actor and uses the existing walking egress',()=>{
 const f=fixture(),b=f.building();b.squadSpawnPosition=new Vec2(0,-80);f.e.box(0,-80,120,120);b.setLevel(f.rows[0].index);const unit=b.enemyList[0],nav=f.e.nav.get(f.game);assert(unit.node.active&&!unit.isDead());near(unit.node,{x:0,y:-80});assert(unit._terrainExit);
 let escaped=false;for(let frame=0;frame<500;frame++){const before=unit.node.position;f.e.setTime(frame*50);f.e.nav.beginFrame(f.game);unit.onUpdate(.05);assert(unit.node.active&&!unit.isDead());assert(distance(before,unit.node)<=unit.getSpeed()*.05+1e-6);assert(nav.gridFor(unit).canExitBlocked(before,unit.node,nav.radius(unit)));if(nav.gridFor(unit).isWalkable(unit.node,nav.radius(unit))){escaped=true;break;}}
 assert(escaped);assert.equal(f.created(),1);assert.equal(b.squadSpawnPosition.x,0);assert.equal(b.squadSpawnPosition.y,-80);
});
