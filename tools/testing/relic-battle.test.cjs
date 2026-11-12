'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Node,Vec2}=require('./backend-gameplay-harness.cjs');
const root=path.resolve(__dirname,'../..'),source=name=>fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8');
const enums=require('../../assets/_script/KinghtFallEnum');
function fixture(owned={},style='skirmisher'){
  const data={treasureAdd:owned,heroStyle:style,talentAdd:{},coin:0,enemyList:[],soldierList:[],bulidPointMap:{},round:1,getGameBuff:()=>null,getEnemyList(){return this.enemyList;},getSoldierList(){return this.soldierList;},_relicCombatTime:0};
  let commits=0;data.ctrPar={saveGame(){commits++;return true;}};
  const cache={},stubs={KinghtFallEnum:enums,KinghtFallUIGame:{default:{instance:{ctrGame:{gameData:data}}}},GameToolsOverrides:{cancel(enemy){enemy.cancelled=(enemy.cancelled||0)+1;}}};
  function load(name){if(stubs[name])return stubs[name];if(cache[name])return cache[name].exports;const m=cache[name]={exports:{}};vm.runInNewContext(source(name),{module:m,exports:m.exports,require:load,Number,Math,console,Set},{filename:name+'.js'});return m.exports;}
  const Runtime=load('RelicRuntime'),Battle=load('RelicBattle');
  return {data,Runtime,Battle,load,commits:()=>commits};
}
function method(file,name,globals){const text=source(file),start=text.indexOf('_ctor.prototype.'+name+' = function'),end=text.indexOf('\n  };',start);assert(start>=0&&end>start);const body=text.slice(text.indexOf('function',start),end+4);return vm.runInNewContext('('+body+')',{BattleSounds:{},...globals});}
function actor(hp=50){return {hp,hpMax:100,node:new Node(),isDead(){return this.hp<=0;},ctrHp:{setHp(){}},cfg:{}};}
function castle(hp=100){return {buildInfo:{BuildID:1,hp,hpMax:100},buildCfg:{enumValue:1},ctrHp:{setHp(){}},deaths:0,onDead(){this.deaths++;this.isDestroyed=true;}};}
function building(id,kind,hp=100){return {ID:id,buildInfo:{BuildID:kind,cfg:{Hp:100},hp,hpMax:100},getIsWork(){return !this.isDestroyed&&this.buildInfo.hp>0;},upHpView(){}};}

test('Royal Crown adds its stronger Epic HP bonus from the base on every buff rebuild',()=>{
  const f=fixture({120032:[.2]});f.data.talentAdd[enums.KinghtFallEnumTalentCfg.TalenType09]=[[.1]];
  const Info=f.load('KinghtFallBuildInfo').KinghtFallBuildInfo,info=new Info(1,{Hp:100});
  assert.equal(info.hpMax,130);info.initBuffData();assert.equal(info.hpMax,130);
  const ordinary=new Info(2,{Hp:100});assert(Math.abs(ordinary.hpMax-110)<1e-9);
});

test('castle rescues are once-only and Golem protection requires a living built wall at any castle health',()=>{
  const f=fixture({120028:[.25],120046:[.12],120050:[4]}),normal=actor(),boss=actor();boss.cfg.IsBoss=true;f.data.enemyList=[normal,boss];
  const hit=method('KinghtFallBuildBase','onAttacked',{RelicBattle:f.Battle,RelicRuntime:f.Runtime}),c=castle(60);
  assert.equal(hit.call(c,40),40);assert.equal(c.buildInfo.hp,45);assert.equal(c.deaths,0);
  assert.equal(f.data.relicState.phoenixUsed,true);assert.equal(f.data.relicState.hourglassUsed,true);assert.equal(f.commits(),1);
  assert.equal(normal._relicControl.freeze,4);assert.equal(normal.cancelled,1);assert.equal(boss._relicControl.slow,.5);
  f.data.bulidPointMap[2]=building(2,6);c.buildInfo.hp=90;assert.equal(hit.call(c,10),8.8);assert.equal(c.buildInfo.hp,81.2);assert.equal(f.commits(),1);
  f.data.bulidPointMap[2].buildInfo.hp=0;assert.equal(hit.call(c,10),10);
  f.data.bulidPointMap[2].buildInfo.hp=100;f.data.bulidPointMap[2].isDestroyed=true;assert.equal(hit.call(c,10),10);
  f.data.bulidPointMap[2]=building(2,6);f.data.bulidPointMap[2].buildInfo.cfg=null;assert.equal(hit.call(c,10),10,'unbuilt wall point offers no protection');
  const lethal=fixture({120028:[.25],120050:[4]}),dead=castle(10);
  const kill=method('KinghtFallBuildBase','onAttacked',{RelicBattle:lethal.Battle,RelicRuntime:lethal.Runtime});kill.call(dead,20);
  assert.equal(dead.deaths,1);assert.equal(dead.buildInfo.hp,-10);assert.equal(lethal.data.relicState,undefined);
});

test('saved rescue charges stay spent after a new battle runtime restores the checkpoint',()=>{
  const f=fixture({120028:[.15],120050:[2]}),c=castle(20);f.Battle.afterCastleDamage(f.data,c);
  const saved=f.Runtime.snapshot(f.data),restored=fixture({120028:[.15],120050:[2]});restored.Runtime.restore(restored.data,saved);
  const next=castle(10);assert.equal(restored.Battle.afterCastleDamage(restored.data,next),false);assert.equal(next.buildInfo.hp,10);assert.equal(restored.commits(),0);
});

test('Gravity Orb pulses only nearby living enemies at a tower impact and uses an independent eight-second cooldown',()=>{
  const f=fixture({120037:[.6]}),target=actor(),near=actor(),far=actor(),dead=actor(0),boss=actor();
  target.node.setPosition(100,0);near.node.setPosition(220,0);far.node.setPosition(221,0);boss.node.setPosition(120,0);boss.cfg.IsBoss=true;
  f.data.enemyList=[target,near,far,dead,boss];const tower={buildInfo:{BuildID:2}};
  assert.equal(f.Battle.towerImpact(f.data,tower,target),true);assert.equal(target._relicControl.freeze,.6);assert.equal(near._relicControl.freeze,.6);assert.equal(far._relicControl,undefined);assert.equal(dead._relicControl,undefined);assert.equal(boss._relicControl.slow,.15);
  assert.equal(f.Battle.towerImpact(f.data,tower,target),false);f.data._relicCombatTime=7.99;assert.equal(f.Battle.towerImpact(f.data,tower,target),false);
  f.data._relicCombatTime=8;assert.equal(f.Battle.towerImpact(f.data,tower,target),true);
  assert.equal(f.Battle.towerImpact(f.data,{buildInfo:{BuildID:1}},target),false);
  assert.equal(f.Battle.towerImpact(f.data,{buildInfo:{BuildID:2}},target),true);
});

test('a full battle restart discards a prior tower pulse cooldown even when its data object is reused',()=>{
  const f=fixture({120037:[.8]}),target=actor(),tower={buildInfo:{BuildID:2}};f.data.enemyList=[target];
  f.data._relicCombatTime=5;assert.equal(f.Battle.towerImpact(f.data,tower,target),true);
  f.Runtime.restore(f.data);assert.equal(f.data._relicCombatTime,0);assert.equal(f.Battle.towerImpact(f.data,tower,target),true);
  assert.equal(f.Battle.towerImpact(f.data,tower,target),false);
});

test('Spirit Bell rebuilds replacement delay from the authored timer rather than compounding',()=>{
  const f=fixture({120038:[.07]}),b={buildInfo:{cfg:{Data:[1,90001,10]}},ndPro:{},time:{},initSoldier(){}};
  const set=method('KinghtFallBuildBarracks','setLevel',{t:{prototype:{setLevel(){}}},r:{Reborn:'Reborn',RebornMax:'RebornMax'},RelicBattle:f.Battle,RelicRuntime:f.Runtime});
  set.call(b,1);assert(Math.abs(b.time.RebornMax-9.3)<1e-9);set.call(b,1);assert(Math.abs(b.time.RebornMax-9.3)<1e-9);
});

test('bank interest uses the banked balance with a three-payment cap and a checkpointed once receipt',()=>{
  const f=fixture({120004:[2]});f.data.coin=39;
  assert.equal(f.Battle.waveCleared(f.data,null,1),true);assert.equal(f.data.coin,45);
  assert.equal(f.Battle.waveCleared(f.data,null,1),false);assert.equal(f.data.coin,45);
  const next=fixture({120004:[2]});next.data.coin=45;next.Runtime.restore(next.data,f.Runtime.snapshot(f.data));
  assert.equal(next.Battle.waveCleared(next.data,null,1),false);assert.equal(next.data.coin,45);
  next.data.coin=9;assert.equal(next.Battle.waveCleared(next.data,null,2),true);assert.equal(next.data.coin,9);
  next.data.coin=20;next.Battle.waveCleared(next.data,null,3);assert.equal(next.data.coin,24);
});

test('House of Plenty pays once per point and castle tier, including across destruction, rebuilding and checkpoint resume',()=>{
  const f=fixture({120023:[3]}),house=building(2,4),mill=building(3,5),dead=building(4,4,0);let tier=1;f.data.getBaseLevel=()=>tier;f.data.bulidPointMap={2:house,3:mill,4:dead};
  f.Battle.waveCleared(f.data,null,1);assert.equal(f.data.coin,3);f.Battle.waveCleared(f.data,null,2);assert.equal(f.data.coin,3);
  f.data.bulidPointMap[2]=building(2,4);f.Battle.waveCleared(f.data,null,3);assert.equal(f.data.coin,3);
  const next=fixture({120023:[3]});next.data.coin=3;next.data.bulidPointMap={2:building(2,4)};next.data.getBaseLevel=()=>tier;next.Runtime.restore(next.data,f.Runtime.snapshot(f.data));
  next.Battle.waveCleared(next.data,null,4);assert.equal(next.data.coin,3);tier=2;next.Battle.waveCleared(next.data,null,5);assert.equal(next.data.coin,6);
  tier=1;next.Battle.waveCleared(next.data,null,6);assert.equal(next.data.coin,6,'an earlier tier cannot pay twice');
});

test('Fairy Acorn grows surviving economic buildings from authored HP with three saved stacks and no rebuild compounding',()=>{
  const f=fixture({120047:[.04]}),house=building(2,4,50),mill=building(3,5),dead=building(4,4,0),wall=building(5,6);f.data.bulidPointMap={2:house,3:mill,4:dead,5:wall};
  f.Battle.waveCleared(f.data,null,1);assert.equal(house.buildInfo.hpMax,104);assert.equal(house.buildInfo.hp,54);assert.equal(mill.buildInfo.hpMax,104);assert.equal(dead.buildInfo.hpMax,100);assert.equal(wall.buildInfo.hpMax,100);assert.equal(f.data.coin,0);
  f.Battle.waveCleared(f.data,null,1);assert.equal(house.buildInfo.hpMax,104);f.Battle.waveCleared(f.data,null,2);f.Battle.waveCleared(f.data,null,3);f.Battle.waveCleared(f.data,null,4);assert.equal(house.buildInfo.hpMax,112);
  const next=fixture({120047:[.04]});next.Runtime.restore(next.data,f.Runtime.snapshot(f.data));const Info=next.load('KinghtFallBuildInfo').KinghtFallBuildInfo;
  const rebuilt=new Info(4,{Hp:100},2);assert.equal(rebuilt.hpMax,112);rebuilt.initBuffData();assert.equal(rebuilt.hpMax,112);
  const upgraded=new Info(4,{Hp:200},2);assert.equal(upgraded.hpMax,224);assert.equal(new Info(4,{Hp:100},9).hpMax,100);
});

test('Wavebreaker grants its first stack at ten combat seconds, caps at three and applies to replacement soldiers without compounding',()=>{
  const f=fixture({120010:[.2]});f.data.addTime={};
  const damage=method('KinghtFallSoldierBase','getAttack',{require:f.load,$z1KinghtFallUIGame:{default:{instance:{ctrGame:{gameData:f.data}}}},$z1KinghtFallGameCtrlData:{KinghtFallTimeType:{}},$z1KinghtFallInterface:{KinghtFallEnemyBuffType:{}}});
  const soldier=()=>({cfg:{AttackDamage:10},attack:10,getBuffList:()=>[]}),first=soldier();
  assert.equal(f.Battle.updateArmyBanner(f.data,9.99),0);assert.equal(damage.call(first),10);assert.equal(f.Battle.updateArmyBanner(f.data,.01),1);assert.equal(damage.call(first),12);
  assert.equal(f.Battle.updateArmyBanner(f.data,100),2);assert.equal(damage.call(first),16);assert.equal(f.Battle.updateArmyBanner(f.data,100),0);assert.equal(damage.call(soldier()),16);assert.equal(damage.call(first),16);
  f.data.round++;assert.equal(damage.call(first),10);assert.equal(f.Battle.updateArmyBanner(f.data,10),1);assert.equal(damage.call(first),12);
  f.Runtime.restore(f.data);assert.equal(damage.call(first),10);assert.equal(f.Battle.updateArmyBanner(f.data,10),1);
});

test('Guardian healing aura requires eight continuous stationary combat seconds and affects only nearby living soldiers',()=>{
  const f=fixture({120049:[.05]},'guardian'),hero=actor(),near=actor(),edge=actor(),far=actor(),dead=actor(0),pooled=actor();edge.node.setPosition(220,0);far.node.setPosition(221,0);pooled._isPooled=true;f.data.soldierList=[near,near,edge,far,dead,pooled];
  assert.equal(f.Battle.updateHeroAura(f.data,hero,7,false),0);assert.equal(f.Battle.updateHeroAura(f.data,hero,1,true),0);assert.equal(f.Battle.updateHeroAura(f.data,hero,7,false),0);
  assert.equal(f.Battle.updateHeroAura(f.data,hero,1,false),10);assert.equal(near.hp,55);assert.equal(edge.hp,55);assert.equal(hero.hp,50);assert.equal(far.hp,50);assert.equal(dead.hp,0);assert.equal(pooled.hp,50);
  f.data.round++;f.Battle.updateHeroAura(f.data,hero,7,false);assert.equal(near.hp,55);hero.node._combatGeneration=2;f.Battle.updateHeroAura(f.data,hero,1,false);assert.equal(near.hp,55);
  f.data.heroStyle='fighter';assert.equal(f.Battle.updateHeroAura(f.data,hero,80,false),0);assert.equal(near.hp,55);
});

test('Token of Thrift includes the last configured discounted wave even at relic level one',()=>{
  for(const limit of [1,2,3]){
    const f=fixture({120009:[limit]}),build={buildCfg:{enumValue:4},canLock:true,buildInfo:{canUpgrade:true},hasFreeInitialChoice:()=>false,getUpgradeChoices:()=>[1],getBranchCfg:()=>({})};
    const sell=method('KinghtFallBuildBase','getSell',{require:()=>({value:()=>5}),$z1KinghtFallEnum:enums,$z1KinghtFallUIGame:{default:{instance:{ctrGame:{gameData:f.data}}}}});
    for(let round=1;round<=limit+1;round++){f.data.round=round;assert.equal(sell.call(build),round<=limit?4:5);}
  }
});

test('repurposed hero relics no longer change soldier stats or melee haste, while ranged haste remains',()=>{
  const f=fixture({120014:[.16],120024:[.4,.4],120025:[.16,.16],120026:[.16,.16],120027:[.07,.07],120015:[.3]},'fighter');f.data.addTime={};
  const globals={$z1KinghtFallUIGame:{default:{instance:{ctrGame:{gameData:f.data}}}},$z1KinghtFallEnum:enums,$z1KinghtFallInterface:{KinghtFallEnemyBuffType:{AttackSpeed:1}},$z1KinghtFallGameCtrlData:{KinghtFallTimeType:{}},cc:{CircleCollider:function(){}}};
  const refresh=method('KinghtFallSoldierBase','initBuffData',globals),speed=method('KinghtFallSoldierBase','getAttSpeed',globals);
  for(const id of [90001,90002,90003,90004]){
    const soldier={cfg:{ID:id,Health:100,AttackDamage:10,AttackRange:20,SearchRange:10,AttackType:id===90003?2:1},_refreshLevelStats(){},node:{getComponents:()=>[{},{}]},attSpeed:1,getBuffList:()=>[]};
    refresh.call(soldier);assert.equal(soldier.hpMax,100);assert.equal(soldier.attack,10);assert.equal(speed.call(soldier),id===90003?1.3:1);
  }
});

test('unowned new relics preserve legacy damage, timers and wave state exactly',()=>{
  const f=fixture(),c=castle(30),hero=actor();assert.equal(f.Battle.castleIncomingDamage(f.data,c,20),20);assert.equal(f.Battle.afterCastleDamage(f.data,c),false);
  assert.equal(f.Battle.replacementInterval(f.data,10),10);assert.equal(f.Battle.economicGrowth(f.data,2),0);assert.equal(f.Battle.waveCleared(f.data,hero,3),false);assert.equal(f.data.relicState,undefined);assert.equal(f.data.coin,0);assert.equal(hero.hp,50);
});

test('real melee and ranged soldier hit callbacks pass their original life as the Wolf Totem source',()=>{
  const target=actor(),hits=[];target.node.setPosition(10,0);target.onAttacked=(damage,owner)=>hits.push({damage,owner});
  let impact;const game={gameData:{getEnemyList:()=>[target]},onShotSoldier:()=>({ctr:{setParent(){},setTag(_origin,_target,callback){impact=callback;}},pos:new Vec2()})};
  const globals={
    cc:{Vec2,isValid:()=>true},GameToolsOverrides:{counters:()=>false},
    $z1KinghtFallUIGame:{default:{instance:{ctrGame:game,ctrEffect:{showDamageNum(){},onMonsterAttack(){}}}}}
  };
  const soldier={node:new Node(),time:{},vec2_1:new Vec2(),vec2_2:new Vec2(),attackRange:30,getAttack:()=>10,setLeft(){}};soldier.node._combatGeneration=1;
  method('KinghtFallSoldierBase','doAttack',{...globals,l:{Attack:'Attack'}}).call(soldier);assert.equal(hits[0].owner,soldier);assert.equal(hits[0].damage,10);
  method('KinghtFallSoldierItem03','doAttack',globals).call(soldier);impact();assert.equal(hits[1].owner,soldier);
  soldier.node._combatGeneration++;impact();assert.equal(hits[2].owner,null,'a reused soldier cannot receive credit for an earlier life projectile');
});
