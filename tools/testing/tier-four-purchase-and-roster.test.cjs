'use strict';
// Real purchase/roster methods and real navigation; no editor, game or audio.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setup,Node,Vec2,authored}=require('./backend-gameplay-harness.cjs');
const {environment}=require('../navigation/runtime-harness.cjs');
const root=path.resolve(__dirname,'../..'),scripts=path.join(root,'assets/_script'),clone=v=>JSON.parse(JSON.stringify(v)),noop=()=>{};
function plain(name,modules={}){const exports={};vm.runInNewContext(fs.readFileSync(path.join(scripts,name+'.js'),'utf8'),{exports,require:n=>modules[n]});return exports;}
const enums=plain('KinghtFallEnum');
function purchase(family,index,count){
 const info={},state={animations:[],audio:0,scheduled:[]},singleton=v=>({getInstance:()=>v});
 const h=setup({KinghtFallEnum:enums,KinghtFallBuildInfo:info,
  AudioMgr:{AudioMgr:singleton({playEffectFree(){state.audio++;}})},
  KinghtFallPlayerMgr:{KinghtFallPlayerMgr:singleton({getMissionData:()=>({recordQuestEvent:noop})})}});
 info.KinghtFallBuildInfo=plain('KinghtFallBuildInfo',{...h.e.stubs,RelicRuntime:h.load('RelicRuntime'),RelicBattle:h.load('RelicBattle')}).KinghtFallBuildInfo;
 class Label{}class Sprite{}class Color{fromHEX(value){this.value=value;return this;}}Color.WHITE={white:true};
 Object.assign(h.e.cc,{Label,Sprite,Color,tween(){return {set(){return this;},to(){return this;},start(){return this;}};}});
 Object.assign(h.d,{coin:100000,treasureAddTime:{},getBaseLevel:()=>4});Object.assign(h.ui,{canStart:true,isclose:false,initView:noop,addTask:noop,onPauseGame:noop});
 const Type=h.load('KinghtFallBuildBase').default,b=new Type(),cfg=clone(authored.BuildEnum[family]);
 // Isolate selector reuse from independently tested saved pad transformations.
 for(const row of cfg.levelList)delete row.PurchaseField;
 b.node=new Node('building',h.g.ndMain);b.ID=4;b.buildCfg=cfg;b.canLock=true;b.ndAniMain={node:new Node('body',b.node),setSkin:noop,setAnimation(...v){state.animations.push(v);},addAnimation(...v){state.animations.push(v);}};b.ndAniOther=[];
 const group=new Node('authored purchase pads',h.g.ndMain,80,-35);b.ndLockList=Array.from({length:count},(_,i)=>{
  const n=new Node('pad'+i,group,4*i,-2*i),c=n.addComponent(h.e.cc.PolygonCollider);c.points=[new Vec2(-12,-7),new Vec2(12,-7),new Vec2(12,7),new Vec2(-12,7)];
  const progress=new Node('sprPro',n);progress.addComponent(Sprite).fillRange=0;return n;
 });
 b.ndCoin=new Node('coin');new Node('labNum',b.ndCoin).addComponent(Label);b.scheduleOnce=fn=>state.scheduled.push(fn);b.upHpView=noop;b.sendEvent=noop;b.setLevel(index);
 return {...h,b,state};
}
const branches=[['Castle',1,3,4],['Archer',2,3,3],['Cannon',2,6,3],['Sniper',2,9,3],['Royal',3,13,4],['Heavy',3,16,4],['Crossbow',3,19,4],['Stable',3,22,4],['House',4,3,3],['Mill',5,3,3]];
for(const [name,family,index,pads]of branches)test(name+' tier3 uses an authored pad and purchases the real configured tier4 once',()=>{
 const h=purchase(family,index,pads),b=h.b,fields=b.ndLockList.slice(),poses=fields.map(n=>({x:n.x,y:n.y,scaleX:n.scaleX,scaleY:n.scaleY,angle:n.angle,parent:n.parent}));
 const expected=fields[Math.min(3,pads-1)],destination=b.getUpgradeChoices()[0],target=b.getBranchCfg(destination),beforeCfg=JSON.stringify(b.buildCfg);
 assert.equal(target.level,4);assert.equal(b.getPurchaseField(),expected);assert.equal(expected.active,true);assert.equal(b.ndCoin.parent,expected);assert.equal(b.getLockPoint().length,4);
 b.setLight(true);assert(fields.every(n=>!n.active));b.setLight(false);assert.equal(expected.active,true);
 b.doUpgrade(.2,true);assert(expected.getChildByName('sprPro').getComponent(h.e.cc.Sprite).fillRange>0);
 const coin=h.d.coin,cost=b.getSell();assert(cost>=0);b.doUpgrade(b.standTimeMax,true);
 assert.equal(b.getLevel(),4);assert.equal(b.index,destination);assert.equal(h.d.coin,coin-cost);assert(h.state.animations.some(v=>v[1]==='upgrade'));
 assert.equal(b.getUpgradeChoices().length,0);assert.equal(b.getSave().level,destination);assert.equal(b.getSell(),-1);
 b.setLevel(destination);assert(fields.every(n=>!n.active));assert.equal(b.getLockPoint(),null);b.doUpgrade(10,true);assert.equal(h.d.coin,coin-cost);
 assert.deepEqual(b.ndLockList,fields);fields.forEach((n,i)=>assert.deepEqual({x:n.x,y:n.y,scaleX:n.scaleX,scaleY:n.scaleY,angle:n.angle,parent:n.parent},poses[i]));
 assert.equal(JSON.stringify(b.buildCfg),beforeCfg,'branch IDs, defaults and costs remain unchanged');
});
test('all authored/generated map selectors keep their exact references, counts and serialized positions',()=>{
 const Type=setup().load('KinghtFallBuildBase').default;let files=0,controllers=0,missing=0;
 function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
 for(const file of walk(path.join(root,'assets/KinghtFallIconMap')).filter(f=>/\.(prefab|fire)$/.test(f))){
  const raw=fs.readFileSync(file,'utf8');if(!raw.includes('"ndLockList"'))continue;const data=JSON.parse(raw),before=JSON.stringify(data);let found=false;
  for(const c of data){if(!c?.ndAniMain||!Array.isArray(c.ndLockList))continue;found=true;const b=new Type();b.ndLockList=c.ndLockList.map(r=>r&&data[r.__id__]);b.buildInfo={cfg:{level:3},canUpgrade:true};
   const list=b.ndLockList.slice();assert.equal(b.getPurchaseField(),list[3]||list[list.length-1]);assert.deepEqual(b.ndLockList,list);if(!list[3])missing++;controllers++;
   for(let level=0;level<list.length;level++){b.buildInfo.cfg.level=level;assert.equal(b.getPurchaseField(),list[level]);}
  }
  if(found)files++;assert.equal(JSON.stringify(data),before,'runtime lookup cannot serialize any map edit');
 }
 assert(files>=11);assert(controllers>=208);assert(missing>=168);
});
test('unavailable or terminal tiers cannot fabricate a purchase pad',()=>{
 const h=purchase(2,3,3),b=h.b;b.buildInfo.canUpgrade=false;assert.equal(b.getPurchaseField(),null);assert.equal(b.getLockPoint(),null);
 b.ndLockList=[];b.buildInfo.canUpgrade=true;assert.equal(b.getPurchaseField(),null);assert.equal(b.getLockPoint(),null);
});
for(const id of [90001,90002,90003,90004])for(const bonus of [0,3])test('barracks '+id+' places '+(10+bonus)+' distinct bodies without indexing authored move markers',()=>{
 const e=environment();e.stubs.KinghtFallBuildBase={default:function(){}};const B=e.load('KinghtFallBuildBarracks').default,b=new B();
 Object.assign(b,{node:new Node('barracks',e.game.ndMain),ndBotnNodeList:new Node('spawn',e.game.ndMain,-30,-10),buildInfo:{cfg:{Data:[10,id,8]}},ndVideoSoldier:{SolID:id},VideoTimes:bonus,stratAge:75});
 // Intentionally fewer authored move markers than soldiers, matching the maps.
 b.ndMove=[new Node('legacy move marker')];e.game.addSoldier=(unitId,done)=>{
  const n=new Node('ally',e.game.ndMain);n.active=false;n.addComponent(e.cc.PhysicsCircleCollider).radius=id===90004?16:id===90002?12:8;
  const u={uuid:'ally'+e.game.gameData.soldiers.length,cfg:{ID:unitId},node:n,hp:0,rigidBody:n.addComponent(e.cc.RigidBody),setParent(owner){this.outBuild=owner;},initBuffData:noop,isDead(){return this.hp<=0;},setNew(){this.node.active=true;this.hp=100;}};
  e.game.gameData.soldiers.push(u);done(u);
 };
 b.buildInfo.cfg.Data[0]=8;b.initSoldier();const veterans=b.enemyList.slice(),veteranPositions=veterans.map(u=>u.node.getPosition());
 b.buildInfo.cfg.Data[0]=10;b.initSoldier();assert.equal(b.enemyList.filter(Boolean).length,10+bonus);assert(b.enemyList.every(u=>u.node.active&&!u._spawnPending&&Number.isFinite(u.node.x)&&Number.isFinite(u.node.y)));
 veterans.forEach((u,i)=>{assert.equal(b.enemyList[i],u,'an upgrade keeps every existing soldier');assert.deepEqual(u.node.getPosition(),veteranPositions[i]);});
 for(let i=0;i<b.enemyList.length;i++)for(let j=0;j<i;j++){
  const a=b.enemyList[i],c=b.enemyList[j],clearance=e.nav.get(e.game).radius(a)+e.nav.get(e.game).radius(c)+4;
  assert(Math.hypot(a.node.x-c.node.x,a.node.y-c.node.y)>=clearance-1e-6,'spawn bodies must not collapse');
 }
 const positions=b.enemyList.map(u=>u.node.getPosition());b.initSoldier();assert.equal(e.game.gameData.soldiers.length,10+bonus);b.enemyList.forEach((u,i)=>assert.deepEqual(u.node.getPosition(),positions[i]));
 const last=b.enemyList[b.enemyList.length-1];b.setSoldierRallyPoint(last,{x:45,y:-80});assert.deepEqual(JSON.parse(JSON.stringify(b.getSoldierRallyPoint(last))),{x:45,y:-80});assert.equal(b.getSave().rallyPosts.length,10+bonus);
});
