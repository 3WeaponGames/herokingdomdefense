'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Node,Vec2}=require('./backend-gameplay-harness.cjs');
const root=path.resolve(__dirname,'../..'),source=name=>fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8');
const enums=require('../../assets/_script/KinghtFallEnum');
function fixture(owned={}){
  const data={treasureAdd:owned,talentAdd:{},coin:0,enemyList:[],soldierList:[],getGameBuff:()=>null,getEnemyList(){return this.enemyList;},getSoldierList(){return this.soldierList;},_relicCombatTime:0};
  let commits=0;data.ctrPar={saveGame(){commits++;return true;}};
  const cache={},stubs={KinghtFallEnum:enums,KinghtFallUIGame:{default:{instance:{ctrGame:{gameData:data}}}},GameToolsOverrides:{cancel(enemy){enemy.cancelled=(enemy.cancelled||0)+1;}}};
  function load(name){if(stubs[name])return stubs[name];if(cache[name])return cache[name].exports;const m=cache[name]={exports:{}};vm.runInNewContext(source(name),{module:m,exports:m.exports,require:load,Number,Math,console,Set},{filename:name+'.js'});return m.exports;}
  const Runtime=load('RelicRuntime'),Battle=load('RelicBattle');
  return {data,Runtime,Battle,load,commits:()=>commits};
}
function method(file,name,globals){const text=source(file),start=text.indexOf('_ctor.prototype.'+name+' = function'),end=text.indexOf('\n  };',start);assert(start>=0&&end>start);const body=text.slice(text.indexOf('function',start),end+4);return vm.runInNewContext('('+body+')',{BattleSounds:{},...globals});}
function actor(hp=50){return {hp,hpMax:100,node:new Node(),isDead(){return this.hp<=0;},ctrHp:{setHp(){}},cfg:{}};}
function castle(hp=100){return {buildInfo:{BuildID:1,hp,hpMax:100},buildCfg:{enumValue:1},ctrHp:{setHp(){}},deaths:0,onDead(){this.deaths++;this.isDestroyed=true;}};}

test('Royal Crown adds its stronger Epic HP bonus from the base on every buff rebuild',()=>{
  const f=fixture({120032:[.2]});f.data.talentAdd[enums.KinghtFallEnumTalentCfg.TalenType09]=[[.1]];
  const Info=f.load('KinghtFallBuildInfo').KinghtFallBuildInfo,info=new Info(1,{Hp:100});
  assert.equal(info.hpMax,130);info.initBuffData();assert.equal(info.hpMax,130);
  const ordinary=new Info(2,{Hp:100});assert(Math.abs(ordinary.hpMax-110)<1e-9);
});

test('castle damage consumes each rescue once, applies Golem only below its threshold and never revives a destroyed castle',()=>{
  const f=fixture({120028:[.25],120046:[.12],120050:[4]}),normal=actor(),boss=actor();boss.cfg.IsBoss=true;f.data.enemyList=[normal,boss];
  const hit=method('KinghtFallBuildBase','onAttacked',{RelicBattle:f.Battle,RelicRuntime:f.Runtime}),c=castle(60);
  assert.equal(hit.call(c,40),40);assert.equal(c.buildInfo.hp,45);assert.equal(c.deaths,0);
  assert.equal(f.data.relicState.phoenixUsed,true);assert.equal(f.data.relicState.hourglassUsed,true);assert.equal(f.commits(),1);
  assert.equal(normal._relicControl.freeze,4);assert.equal(normal.cancelled,1);assert.equal(boss._relicControl.slow,.5);
  c.buildInfo.hp=30;assert.equal(hit.call(c,10),8.8);assert.equal(c.buildInfo.hp,21.2);assert.equal(f.commits(),1);
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

test('wave-clear healing affects survivors only and the Epic Key awards once every third cleared wave including after resume',()=>{
  const f=fixture({120043:[.03],120048:[4],120049:[.05]}),hero=actor(),soldier=actor(),dead=actor(0);f.data.soldierList=[soldier,soldier,dead];
  assert.equal(f.Battle.waveCleared(f.data,hero,1),true);assert.equal(hero.hp,53);assert.equal(soldier.hp,55);assert.equal(dead.hp,0);assert.equal(f.data.coin,0);
  assert.equal(f.Battle.waveCleared(f.data,hero,1),false);assert.equal(hero.hp,53);
  f.Battle.waveCleared(f.data,hero,3);assert.equal(f.data.coin,4);assert.equal(hero.hp,56);assert.equal(soldier.hp,60);
  const saved=f.Runtime.snapshot(f.data),next=fixture({120043:[.03],120048:[4],120049:[.05]});next.data.coin=4;next.Runtime.restore(next.data,saved);
  assert.equal(next.Battle.waveCleared(next.data,hero,3),false);assert.equal(next.data.coin,4);assert.equal(hero.hp,56);
});

test('Fairy Acorn accrues fractional production so a small per-wave yield benefits without rounding away or replaying on resume',()=>{
  const f=fixture({120047:[.04]});let coins=0;for(let wave=0;wave<24;wave++)coins+=f.Battle.productionBonus(f.data,1);
  assert.equal(coins,0);assert(Math.abs(f.data.relicState.productionRemainder-.96)<1e-9);
  const next=fixture({120047:[.04]});next.Runtime.restore(next.data,f.Runtime.snapshot(f.data));assert.equal(next.Battle.productionBonus(next.data,1),1);assert(Math.abs(next.data.relicState.productionRemainder)<1e-9);
});

test('unowned new relics preserve legacy damage, timers and wave state exactly',()=>{
  const f=fixture(),c=castle(30),hero=actor();assert.equal(f.Battle.castleIncomingDamage(f.data,c,20),20);assert.equal(f.Battle.afterCastleDamage(f.data,c),false);
  assert.equal(f.Battle.replacementInterval(f.data,10),10);assert.equal(f.Battle.productionBonus(f.data,10),0);assert.equal(f.Battle.waveCleared(f.data,hero,3),false);assert.equal(f.data.relicState,undefined);assert.equal(f.data.coin,0);assert.equal(hero.hp,50);
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
