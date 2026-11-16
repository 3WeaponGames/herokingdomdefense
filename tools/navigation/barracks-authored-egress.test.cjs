'use strict';
// Actual map terrain, saved barracks anchors, body polygons and runtime methods.
// No scene, editor, audio, player progress or authored content is loaded for play.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Maps=require('../../packages/game-data-editor/lib/map-assets'),Catalog=require('../../packages/game-data-editor/lib/map-catalog');
const {NavigationGrid}=require('../../assets/_script/NavigationGrid');
const {environment,Node,Vec2,PhysicsPolygonCollider,distance}=require('./runtime-harness.cjs');
const root=path.resolve(__dirname,'../..'),configFile=path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json');
const config=JSON.parse(fs.readFileSync(configFile)),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const protectedFiles=new Map([[configFile,hash(configFile)]]),maps=new Map(),generated=path.join(root,'assets/KinghtFallIconMap/Generated/Stages');
const mapNames=[...Catalog.IDS,...fs.readdirSync(generated).filter(name=>name.endsWith('.prefab')).map(name=>'Generated/Stages/'+name.slice(0,-7))];
for(const name of mapNames){
 const file=path.join(root,'assets/KinghtFallIconMap',name+'.prefab'),data=JSON.parse(fs.readFileSync(file)),model=Maps.model(data);
 protectedFiles.set(file,hash(file));
 const terrain=model.colliders.filter(c=>c.active&&c.registered&&model.byId[c.owner].kind==='obstacle').map(c=>c.points);
 maps.set(name,{name,data,model,terrain,grid:new NavigationGrid(terrain,model.bounds,16)});
}
const bodies=new Map([90001,90002,90003,90004].map(id=>{
 const file=path.join(root,'assets/KinghtFallEnemy/Play'+config.SoldierCfg[id].prefab+'.prefab');
 return[id,JSON.parse(fs.readFileSync(file)).find(row=>row.__type__==='cc.PhysicsPolygonCollider').points];
}));
const transform=(matrix,p)=>({x:matrix[0]*p.x+matrix[2]*p.y+matrix[4],y:matrix[1]*p.x+matrix[3]*p.y+matrix[5]});
const clone=value=>JSON.parse(JSON.stringify(value));
function unchanged(){for(const[file,before]of protectedFiles)assert.equal(hash(file),before,'Runtime recovery must retain '+path.relative(root,file));}
function fixture(map,owner,row,single=false){
 const e=environment(),game=e.game;Object.setPrototypeOf(game,e.load('KinghtFallGameCtrl').default.prototype);
 Object.assign(game,{pathIndex:0,isAgg:false,_separateArmyCommands:true,mapSize:{width:map.model.bounds.maxX-map.model.bounds.minX,height:map.model.bounds.maxY-map.model.bounds.minY}});
 game.ctrPlay.isDead=()=>true;
 e.stubs.BuildingSpawnPositions=require('../../assets/_script/BuildingSpawnPositions');
 e.stubs.TestMode={TestMode:{getInstance:()=>({shouldBypassAdLimits:()=>false})}};
 if(!Vec2.prototype.multiplyScalar)Vec2.prototype.multiplyScalar=function(n){this.x*=n;this.y*=n;return this;};
 for(const points of map.terrain){const node=new Node('Authored terrain',game.ndMain);node.addComponent(PhysicsPolygonCollider).points=clone(points);game.gameData.obstacles.push({node});}
 const Type=e.load('KinghtFallBuildBarracks').default,b=new Type(),cfg=clone(row),matrix=owner.world,node=new Node(owner.name,game.ndMain,matrix[4],matrix[5]);
 node.angle=Math.atan2(matrix[1],matrix[0])*180/Math.PI;node.scaleX=Math.hypot(matrix[0],matrix[1]);node.scaleY=(matrix[0]*matrix[3]-matrix[1]*matrix[2])/node.scaleX;
 if(single)cfg.Data[0]=1;
 Object.assign(b,{node,ID:map.data[owner.ownerComponent].ID,index:cfg.index,buildInfo:{cfg},stratAge:75,getIsWork:()=>true,canAddVideoSoldier:()=>false,_testAdLimitBypass:false,ndPro:{active:false,getChildByName:()=>({getComponent:()=>({fillRange:0})})},time:{Reborn:0,RebornMax:8}});
 const references=map.data[owner.ownerComponent];
 b.ndBotnNodeList=new Node('Authored formation',game.ndMain);b.ndBotnNodeList.setPosition(map.model.byId[references.ndBotnNodeList.__id__].position);
 b.ndVideoSoldier=new Node('Authored doorway',game.ndMain);b.ndVideoSoldier.setPosition(map.model.byId[references.ndVideoSoldier.__id__].position);b.ndVideoSoldier.SolID=cfg.Data[1];
 for(const points of cfg.Blocker.body.polygons)node.addComponent(PhysicsPolygonCollider).points=clone(points);
 game.gameData.buildings.push(b);
 let created=0,clock=0;
 game.addSoldier=(id,done)=>{
  const unit=e.actor('KinghtFallSoldierItem'+String(id-90000).padStart(2,'0'),0,0);delete unit.isDead;
  unit.cfg=clone(config.SoldierCfg[id]);unit.uuid='authored-egress-'+(++created);unit.node.addComponent(PhysicsPolygonCollider).points=clone(bodies.get(id));
  unit._refreshLevelStats=()=>false;unit.getBuffList=()=>[];unit.debuffInfo=[];
  unit.initBuffData=function(){this.hpMax=this.cfg.Health;this.hp=this.hpMax;};
  unit.state=4;unit.hp=0;unit.node.active=false;unit.rigidBody.active=false;
  game.gameData.soldiers.push(unit);done(unit);
 };
 function step(){clock+=1000/30;e.setTime(clock);e.nav.beginFrame(game);for(const unit of b.enemyList)unit.onUpdate(1/30);}
 return{e,game,b,step,created:()=>created};
}
function walkClear(f,label){
 const {e,game,b}=f,nav=e.nav.get(game),grid=nav.gridFor(b.enemyList[0]),starts=b.enemyList.map(u=>u.node.position);
 // Calculate expectations separately so runtime searches still begin cold.
 const reference=new NavigationGrid(grid.polygons.map(p=>p.vertices),grid.bounds,grid.cellSize,grid._passages);
 const plans=b.enemyList.map((u,i)=>reference.isWalkable(starts[i],nav.radius(u))?null:reference.findPath(starts[i],starts[i],nav.radius(u),false,true));
 const count=b.enemyList.length;assert.equal(f.created(),count,label+' creates its exact authored roster');
 function visible(){for(const unit of b.enemyList){assert(unit.node.active&&unit.rigidBody.active&&!unit._spawnPending&&!unit.isDead()&&unit.hp>0,label+' must never hide or kill an owned soldier');}}
 visible();let frames=0;
 while(frames++<900&&b.enemyList.some(unit=>!grid.isWalkable(unit.node.position,nav.radius(unit)))){
  const before=b.enemyList.map(unit=>unit.node.position);f.step();visible();
  b.enemyList.forEach((unit,i)=>{assert(distance(before[i],unit.node)<=unit.getSpeed()/30+1e-6,label+' exits at normal movement speed');assert(grid.canExitBlocked(before[i],unit.node.position,nav.radius(unit)),label+' cannot enter an unrelated obstacle');});
 }
 for(let i=0;i<count;i++){
  const unit=b.enemyList[i];assert(grid.isWalkable(unit.node.position,nav.radius(unit)),label+' reaches available ground');
  if(plans[i]){assert(plans[i].escape,label+' has an escape plan');assert(distance(unit.node,plans[i].goal)<=grid.cellSize*2+unit.getSpeed()/30,label+' uses the nearby escape instead of a distant marker');}
 }
 assert.equal(f.created(),count);assert.equal(game.gameData.soldiers.length,count);assert.equal(b.waitEnemy.length,0);assert.equal(new Set(b.enemyList).size,count);
 const identities=b.enemyList.slice();b.initSoldier();assert.equal(f.created(),count);assert.deepEqual(b.enemyList,identities,label+' roster refresh retains the same actors');
}
const first=maps.get('Generated/Stages/A-1'),firstBarracks=first.model.owners.find(owner=>owner.name==='Barracks 8');
assert(firstBarracks,'The current first-stage second barracks must be exercised');
for(const row of config.BuildEnum[3].levelList.filter(row=>[90001,90003,90004].includes(row.Data[1])))test('real first-stage barracks branch '+row.index+' keeps its full squad visible and walks off blocked terrain',()=>{
 const f=fixture(first,firstBarracks,row),before=JSON.stringify(row);f.b.initSoldier();walkClear(f,'A-1 '+row.index);assert.equal(JSON.stringify(row),before);unchanged();
});
test('every terrain-blocked configured barracks anchor across authored and generated maps remains visible and exits nearby',t=>{
 let checked=0,total=0;
 for(const map of maps.values())for(const owner of map.model.owners.filter(owner=>map.data[owner.ownerComponent].ndBotnNodeList))for(const row of config.BuildEnum[3].levelList){
  total++;const anchor=transform(owner.world,row.SpawnPosition);if(map.grid.isWalkable(anchor,0))continue;
  const f=fixture(map,owner,row,true);f.b.initSoldier();walkClear(f,map.name+' '+owner.name+' '+row.index);checked++;
 }
 assert(checked>0,'The regression must exercise genuinely terrain-blocked authored anchors');t.diagnostic('Checked '+checked+' blocked anchors among '+total+' configured map/slot/tier combinations.');unchanged();
});
