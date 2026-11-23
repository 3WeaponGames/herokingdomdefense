const test=require('node:test'),assert=require('node:assert/strict');
const {setup,hero,Node,Vec2,authored}=require('./backend-gameplay-harness.cjs');
function prefab(id){return ()=>{const node=new Node();node.getComponent=()=>({uuid:String(id),node,initData(){}});return node;};}
function silverStage(schedule) {
 const h=setup({
  PlatformSetting:{SwitchID:{ShenHe:'review'}},
  SdkMgr:{SdkMgr:{getInstance:()=>({getCheckVersion:()=>false})}},
 });
 const offer={node:{active:false},init:h.noop};
 if (schedule) require('../../assets/_script/SilverOfferSchedule').apply(offer,schedule);
 Object.assign(h.d,{
  canNew:true,businessPoints:[offer],baseBuild:{},weaponBusinessPoints:null,horseBusinessPoints:null,
  levelCfg:{Level:1,WaveCfg:Array.from({length:10},()=>({StartSliver:0}))},
  taskInfo:{index:0,list:[],stage:0},loadMonster(){this.round++;},upMap:h.noop,
 });
 return {...h,shown(visible){
  assert.equal(h.d.appearBusinessPoints,visible?offer:null,'wave '+h.d.round);
  assert.equal(offer.node.active,visible);
 }};
}

test('the Silver offer defaults to two waves and can be scheduled for four consecutive waves',()=>{
 for (const [schedule,count] of [[undefined,2],[{count:4},4],[{count:0},0]]) {
  const h=silverStage(schedule);
  h.d.initCom();
  for(let wave=1;wave<=10;wave++){
   h.shown(wave<=count);
   if(wave<10)h.d.endRoundGame();
  }
 }
});

test('a Silver offer scheduled for waves 4 and 9 respects retries and saved claims',()=>{
 const {harness}=require('./persistence-harness.cjs');
 const h=silverStage({count:2,firstWave:4,interval:5}),data=h.d;
 const claimKey=h.load('KinghtFallGameCtrlData').KinghtFallCommerceKeyType.SilverClaimedWave;
 const disk=harness();
 h.e.stubs.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData=()=>disk.player.gameData;
 data.initCom();h.shown(false);
 for(let wave=2;wave<=4;wave++){data.endRoundGame();h.shown(wave===4);}
 data.onRestart(false);h.shown(true);
 data.businessAdd[claimKey]=4;
 data.coin+=7;
 assert(h.g.saveGame());
 assert(h.g.captureWaveStart());
 const retry=h.g.getRestartCheckpoint('wave');
 assert.equal(retry.businessList[claimKey],4);
 assert(disk.player.gameData.setCheckpoint(retry));

 const resumed=silverStage({count:2,firstWave:4,interval:5});
 const saved=harness(disk.persist()).player.gameData;
 resumed.d.round=saved.getCheckpoint(1).roundNum;
 resumed.d.businessAdd=JSON.parse(JSON.stringify(saved.getBusinessList(1)));
 resumed.d._restoringCheckpoint=true;
 resumed.d.onRestart(false);resumed.shown(false);
 assert.equal(saved.getCheckpoint(1).coin,data.coin);
 for(let wave=5;wave<=10;wave++){resumed.d.endRoundGame();resumed.shown(wave===9);}
 resumed.d.onRestart(true);resumed.shown(false);
 assert.equal(resumed.d.businessAdd[claimKey],undefined);
});
test('wave completion waits for asynchronous final enemy and emits once',()=>{
 const h=setup();h.d.enemyList=[{uuid:'alive',onUpdate(){}}];h.d.enemyQueue={1:[{id:90001,num:1}]};h.d.packInterval=.5;
 h.d.onUpdata(.6);h.d.delEnemy({uuid:'alive'});assert.equal(h.events.length,0);assert.equal(h.d.pendingEnemySpawns,1);
 h.pending[0](prefab(90001));assert.equal(h.d.pendingEnemySpawns,0);assert.equal(h.d.enemyList.length,1);
 h.d.delEnemy(h.d.enemyList[0]);h.d.tryEndGame();assert.deepEqual(h.events,[['RoundEnd']]);
});
test('final wave and stale prefab completion preserve current request lifetime',()=>{
 const h=setup();h.d.round=2;h.g.addEnemy(90001,1);h.d.tryEndGame();assert.equal(h.events.length,0);
 h.g.cleanMap();h.d.pendingEnemySpawns=0;h.pending[0](prefab(90001));assert.equal(h.d.enemyList.length,0);
 h.g.addEnemy(90001,1);h.pending[1](prefab(90001));h.d.delEnemy(h.d.enemyList[0]);assert.deepEqual(h.events,[['GameOver',true]]);
});
test('retry accepts its own cold ally roster while rejecting the previous request',()=>{
 const h=setup();let old=0,current=0;h.g.addSoldier(90001,()=>old++);h.d.onRestart=()=>h.g.addSoldier(90001,()=>current++);
 h.g.onRestart(false);h.pending[0](prefab(1));h.pending[1](prefab(2));assert.equal(old,0);assert.equal(current,1);assert.equal(h.d.soldierList.length,1);
});
for(const [id,key] of [[90001,'PerseveranceSymbol'],[90002,'TurtlePower'],[90003,'BowmanStrike'],[90004,'knightHood']])test(`repurposed hero relic leaves soldier ${id} unchanged at spawn and stat refresh`,()=>{
 const h=setup(),s=h.e.actor('KinghtFallSoldierBase');h.e.cfg.ID=id;h.d.treasureAdd[key]=[.2,.3];s.doMove=h.noop;s.initData(id);
 assert.equal(s.hpMax,100);assert.equal(s.attack,5);
 for(let i=0;i<3;i++){s.initBuffData();assert.equal(s.hpMax,100);assert.equal(s.attack,5);}
});
test('Buff40 disables regeneration during idle and after attacks without repeated healing',()=>{
 const h=setup(),p=hero(h);h.d.addGameBuff('Buff40');p.hp=100;p.initBuffData();assert.equal(p.hp,100);
 for(let i=0;i<120;i++){if(i===30)p.doAttackStart();p.onUpdata(1/60);}assert.equal(p.hp,100);
 h.d.buffList=[];p.initBuffData();p.hp=50;p.time.RecoverCd=0;for(let i=0;i<61;i++)p.onUpdata(1/60);assert.equal(p.hp,60);
});
test('hero cached buffs are idempotent and full restart restores baseline',()=>{
 const h=setup(),p=hero(h);h.d.addGameBuff('Buff41');assert.equal(p.attackRange,180);h.d.addGameBuff('Buff14');p.initBuffData();assert.equal(p.attackRange,180);
 h.d.addGameBuff('Buff42');h.d.addTime={SoldierDamage:1.2,SoldierMaxHp:1.2};h.d.getBulidList=()=>[];h.d.loadMonster=h.noop;h.d.upMap=h.noop;h.d.initCom=h.noop;
 h.g.onRestart(true);assert.equal(h.d.buffList.length,0);assert.deepEqual(Object.keys(h.d.addTime),[]);assert.equal(p.attackRange,200);assert.equal(p.time.AttackBuff2,0);assert.equal(p.time.AttackSpeed2,0);
});
test('Buff35/45/53 refresh their existing actors immediately',()=>{
 const h=setup(),p=hero(h),s=h.e.actor('KinghtFallSoldierBase');s.cfg.AttackType=2;h.d.bulidPointMap={b:{initBuffData:()=>s.initBuffData()}};
 h.d.addGameBuff('Buff35');assert.equal(p.time.MoveSpeed,authored.BuffCfg.find(x=>x.enumKey==='Buff35').Pamer[0]);
 h.d.addGameBuff('Buff45');assert.equal(s.attackRange,s.cfg.AttackRange*1.3);assert.equal(s.hpMax,90);
 h.d.addGameBuff('Buff53');assert(Math.abs(s.hpMax-110)<1e-8);
});
test('conditional army damage changes immediately without healing or stale next-wave bonus',()=>{
 const h=setup(),s=h.e.actor('KinghtFallSoldierBase');s.initBuffData();s.hp=40;h.d.soldierList=[s];h.d.buffList=[{id:'Buff17',cfg:{Pamer:[.3]}}];h.d.setLight=h.noop;
 h.d.startRoundGame();assert.equal(s.getAttack(),6.5);assert.equal(s.hp,40);h.d.addTime.SoldierDamage2=.8;assert.equal(s.getAttack(),10.5);
 h.d.coin=0;h.d.startRoundGame();assert.equal(s.getAttack(),5);assert.equal(s.hp,40);
});
for(const order of ['old-first','new-first'])test(`barracks rejects obsolete branch callbacks (${order})`,()=>{
 const h=setup(),B=h.load('KinghtFallBuildBarracks').default,b=new B(),requests=[],removed=[];
 Object.assign(b,{node:new Node(),buildInfo:{cfg:{Data:[1,90001,1]}},VideoTimes:0,ndVideoSoldier:{SolID:90001},getPos:()=>new Vec2()});
 h.g.addSoldier=(id,cb)=>requests.push({id,cb});h.d.delSoldier=s=>removed.push(s.cfg.ID);b.initSoldier();b.initSoldier();assert.equal(requests.length,1);
 b.buildInfo.cfg={Data:[1,90002,1]};b.ndVideoSoldier.SolID=90002;b.initSoldier();if(order==='new-first')requests.reverse();
 for(const r of requests)r.cb({cfg:{ID:r.id},node:new Node(),setParent(){},setNew(){},initBuffData(){}});
 assert.equal(b.enemyList[0].cfg.ID,90002);assert.deepEqual(removed,[90001]);
});
test('barracks discards delayed removed slots and destroyed owner',()=>{
 const h=setup(),B=h.load('KinghtFallBuildBarracks').default,b=new B(),requests=[];let removed=0;
 Object.assign(b,{node:new Node(),buildInfo:{cfg:{Data:[2,90001,1]}},VideoTimes:0,ndVideoSoldier:{SolID:90001},getPos:()=>new Vec2()});
 h.g.addSoldier=(id,cb)=>requests.push(cb);h.d.delSoldier=()=>removed++;b.initSoldier();b.buildInfo.cfg.Data[0]=1;b.initSoldier();b.node.destroyed=true;
 requests.forEach(cb=>cb({node:new Node()}));assert.equal(removed,3);assert.equal(b.enemyList.length,0);
});
test('enemy08 projectile advances in simulation time, including scaled speed and expiry',()=>{
 function run(frames,dt){const h=setup(),B=h.load('KinghtFallBulletEnemy8').default,b=new B();Object.assign(b,{node:new Node(),bullet:new Node(),tagNode:new Node('',null,10000,0),_dir:new Vec2(1,0),speed:100,state:0,targetIsLive:()=>true});for(let i=0;i<frames;i++)b.onUpdate(dt);return b;}
 for(const n of [30,60,120])assert(Math.abs(run(n,1/n).node.x-100)<1e-8);assert(Math.abs(run(60,2/60).node.x-200)<1e-8);
 const b=run(1,.1);b.state=1;b.time=2;let free=0;b.freeNode=()=>free++;b.onUpdate(1);assert.equal(free,0);b.onUpdate(1);assert.equal(free,1);
});
test('pause covers hero lifecycle and every boss transformation skeleton',()=>{
 const h=setup(),A=h.load('KinghtFallPlayGameAniCtrl').default,a=new A();const names=['spAniMa','spAniBody','spAniDrap','spAniHead','spAniBow','spAniArrow','spAniHand','spAniSmoke','spAniSoulFire','spAniRevive','spAniLevelUp'];
 names.forEach(k=>a[k]={paused:false});a.setPause(true);assert(names.every(k=>a[k].paused));a.setPause(false);assert(names.every(k=>!a[k].paused));
 const boss=h.e.actor('KinghtFallEnemyItem10');boss.spAniUp={paused:false};boss.setPause(true);assert(boss.spAniUp.paused);boss.setPause(false);assert(!boss.spAniUp.paused);
});
test('restored one-shot buffs retain ownership without replaying acquisition actions',()=>{
 const h=setup();h.d.coin=77;for(const id of ['Buff10','Buff11','Buff12','Buff24','Buff29'])h.d.addGameBuff(id,true);
 assert.equal(h.d.coin,77);assert.equal(h.d.buffList.length,5);
});
