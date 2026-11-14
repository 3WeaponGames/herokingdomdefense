'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Runtime=require('../../assets/_script/RelicRuntime'),Eligibility=require('../../assets/_script/RelicEligibility');
const root=path.resolve(__dirname,'../..');
function moduleValue(name,deps={},globals={}){
 const m={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8'),{module:m,exports:m.exports,require:id=>deps[id]||require(id),cc:{isValid:value=>!!value&&!value.destroyed},Math,Number,Set,...globals},{filename:name+'.js'});return m.exports;
}
const Tower=moduleValue('TowerCombat'),Battle=moduleValue('RelicBattle',{RelicRuntime:Runtime,TowerCombat:Tower});
function actor(){return {hp:50,hpMax:100,node:{_combatGeneration:1,activeInHierarchy:true,parent:null,getPosition(){return{x:0,y:0};}},isDead(){return this.hp<=0;},ctrHp:{setHp(){}}};}
function aura(){const hero=actor(),a=actor(),b=actor(),data={heroStyle:'guardian',round:1,_relicGeneration:1,treasureAdd:{120049:[.05]},soldierList:[a,b]};data.ctrPar={gameData:data,ctrPlay:hero,_combatEpoch:1};return{hero,a,b,data};}

test('Guardian aura stops its pulse when an HP callback retires its battle or hero',()=>{
 const mutations={generation:f=>f.data._relicGeneration++,round:f=>f.data.round++,epoch:f=>f.data.ctrPar._combatEpoch++,data:f=>f.data.ctrPar.gameData={},owner:f=>f.data.ctrPar={},hero:f=>f.data.ctrPar.ctrPlay=actor(),heroNode:f=>f.hero.node=actor().node,heroGeneration:f=>f.hero.node._combatGeneration++,heroDeath:f=>f.hero.hp=0,heroDestroyed:f=>f.hero.node.destroyed=true};
 for(const [name,mutate]of Object.entries(mutations)){const f=aura();f.a.ctrHp.setHp=()=>mutate(f);assert.equal(Battle.updateHeroAura(f.data,f.hero,8,false),5,name);assert.equal(f.a.hp,55,name);assert.equal(f.b.hp,50,name);}
});

test('Guardian aura preserves valid simultaneous healing and skips recipients retired by an earlier callback',()=>{
 const f=aura();f.data.soldierList=[f.a,f.a,f.b];assert.equal(Battle.updateHeroAura(f.data,f.hero,8,false),10);assert.equal(f.a.hp,55);assert.equal(f.b.hp,55);
 for(const mutate of [f=>f.b.node._combatGeneration++,f=>f.b.node.destroyed=true,f=>f.b._isPooled=true]){const f=aura();f.a.ctrHp.setHp=()=>mutate(f);assert.equal(Battle.updateHeroAura(f.data,f.hero,8,false),5);assert.equal(f.b.hp,50);}
 const retired=aura();retired.hero.node.destroyed=true;retired.hero.node.getPosition=()=>{throw Error('Retired hero geometry was read');};assert.equal(Battle.updateHeroAura(retired.data,retired.hero,8,false),0);
});

test('Guardian aura starts a fresh stationary clock after same-generation hero node replacement',()=>{
 const f=aura();assert.equal(Battle.updateHeroAura(f.data,f.hero,7,false),0);f.hero.node=actor().node;assert.equal(Battle.updateHeroAura(f.data,f.hero,1,false),0);assert.equal(f.a.hp,50);assert.equal(Battle.updateHeroAura(f.data,f.hero,7,false),10);
});

test('relic controls stay with their original node and cannot freeze a replacement from a presentation callback',()=>{
 const h=actor();assert(Runtime.applyControl(h,2));h.node=actor().node;assert.equal(Runtime.controlled(h),false);assert.equal(Runtime.controlDelta(h,.5).dt,.5);
 let cancels=0;const control=moduleValue('RelicRuntime',{'./RelicEligibility':Eligibility,GameToolsOverrides:{cancel(){cancels++;}},BattleSounds:{effect(){h.node=actor().node;}}},{cc:{resources:{},isValid:value=>!!value&&!value.destroyed}});
 assert.equal(control.applyControl(h,2),false);assert.equal(cancels,0);assert.equal(control.controlled(h),false);
});

test('a retired gravity proc cannot control enemies after its sound retires the battle',()=>{
 const data={heroStyle:'skirmisher',treasureAdd:{120037:[.6]},_relicGeneration:1,_relicCombatTime:0,enemyList:[],round:1};data.ctrPar={gameData:data,_combatEpoch:1};const enemy=actor(),tower={buildInfo:{BuildID:2}};data.enemyList=[enemy];data.getEnemyList=()=>data.enemyList;
 const battle=moduleValue('RelicBattle',{RelicRuntime:Runtime,TowerCombat:Tower,BattleSounds:{effect(){data.ctrPar._combatEpoch++;}}},{cc:{resources:{},isValid:value=>!!value&&!value.destroyed}});
 assert.equal(battle.towerImpact(data,tower,enemy),false);assert.equal(Runtime.controlled(enemy),false);
});

test('castle rescue presentation cannot freeze, repair, repaint or checkpoint a retired battle',()=>{
 for(const id of[120028,120050]){
  let views=0,commits=0;const data={heroStyle:'skirmisher',treasureAdd:{[id]:[id===120028?.25:4]},_relicGeneration:1,round:1},enemy=actor(),castle={node:actor().node,buildInfo:{hp:20,hpMax:100},ctrHp:{setHp(){views++;}}};data.enemyList=[enemy];data.getEnemyList=()=>data.enemyList;data.ctrPar={gameData:data,_combatEpoch:1,saveGame(){commits++;return true;}};
  const battle=moduleValue('RelicBattle',{RelicRuntime:Runtime,TowerCombat:Tower,BattleSounds:{effect(){data.ctrPar._combatEpoch++;}}},{cc:{resources:{},isValid:value=>!!value&&!value.destroyed}});
  assert.equal(battle.afterCastleDamage(data,castle),false);assert.equal(Runtime.controlled(enemy),false);assert.equal(castle.buildInfo.hp,20);assert.equal(views,0);assert.equal(commits,0);
 }
});

test('checkpoint callbacks cannot add or clear save retries in a replacement battle lifetime',()=>{
 const changes={owner:d=>d.ctrPar={},gameData:d=>d.ctrPar.gameData={},epoch:d=>d.ctrPar._combatEpoch++,generation:d=>d._relicGeneration++,state:d=>d.relicState={phoenixUsed:false}};
 for(const saved of[true,false])for(const[name,change]of Object.entries(changes)){
  const data={_relicGeneration:1,relicState:{phoenixUsed:true}};
  data.ctrPar={gameData:data,_combatEpoch:1,saveGame(){change(data);data._relicSavePending='replacement';data._relicSaveRetryTime=.75;return saved;}};
  assert.equal(Runtime.commit(data),false,name+' saved='+saved);assert.equal(data._relicSavePending,'replacement',name);assert.equal(data._relicSaveRetryTime,.75,name);
 }
 for(const saved of[true,false]){
  const data={_relicGeneration:1,relicState:{phoenixUsed:true}};
  data.ctrPar={gameData:data,_combatEpoch:1,saveGame(){Runtime.restore(data,{phoenixUsed:false});return saved;}};
  assert.equal(Runtime.commit(data),false);assert.equal(Object.hasOwn(data,'_relicSavePending'),false);assert.equal(Object.hasOwn(data,'_relicSaveRetryTime'),false);
 }
});

test('wave growth callbacks cannot grow later buildings or pay rewards after battle retirement',()=>{
 let views=0;const data={heroStyle:'skirmisher',coin:30,round:1,_relicGeneration:1,treasureAdd:{120004:[2],120023:[1],120047:[.08]}};data.ctrPar={gameData:data,_combatEpoch:1};
 const house=id=>({ID:id,buildInfo:{BuildID:4,cfg:{Hp:100},hp:100,hpMax:100},getIsWork:()=>true,upHpView(){views++;data.ctrPar._combatEpoch++;}}),first=house(1),second=house(2);data.bulidPointMap={1:first,2:second};
 assert.equal(Battle.waveCleared(data,null,1),false);assert.equal(first.buildInfo.hpMax,108);assert.equal(second.buildInfo.hpMax,100);assert.equal(data.coin,30);assert.equal(views,1);
});

test('tower presentation callbacks cannot damage a recycled, pooled, dead, replaced or destroyed victim',()=>{
 const changes={generation:a=>a.node._combatGeneration++,pooled:a=>a._isPooled=true,dead:a=>a.hp=0,node:a=>a.node=actor().node,destroyed:a=>a.node.destroyed=true};
 for(const [name,change]of Object.entries(changes)){const a=actor(),game={_combatEpoch:1,gameData:{},ndUI:null};let hits=0;a.onAttacked=()=>hits++;Tower.damage(game,a,{x:0,y:0},10,{attackType:'arrow'},()=>change(a));assert.equal(hits,0,name);}
 const a=actor(),game={_combatEpoch:1,gameData:{},ndUI:null};let hits=0;a.onAttacked=n=>{hits++;a.hp-=n;};Tower.damage(game,a,{x:0,y:0},10,{attackType:'arrow'},()=>{});assert.equal(hits,1);assert.equal(a.hp,40);
 a._isPooled=true;assert.equal(Tower.choose([a],{x:0,y:0},100,{targeting:'nearest'}),null);
});

test('nullable optional attack requirements inherit shipped style restrictions while explicit values still constrain',()=>{
 for(const value of [undefined,null,'']){assert.equal(Eligibility.required({RequiredAttackType:value},'guardian'),true);assert.equal(Eligibility.eligible(120030,'guardian',{RequiredAttackType:value}),false);assert.equal(Eligibility.eligible(120030,'mystic',{RequiredAttackType:value}),true);}
 for(const value of [0,3,false])for(const style of Eligibility.ids)assert.equal(Eligibility.required({RequiredAttackType:value},style),false);
 assert.equal(Eligibility.required({RequiredAttackType:'1'},'guardian'),true);assert.equal(Eligibility.required({RequiredAttackType:2},'mystic'),true);assert.equal(Eligibility.required({RequiredAttackType:1},'mystic'),false);
});

test('healing feedback stays in the original actor lifetime while preserving committed HP and scalar callers',()=>{
 let sounds=0;
 const Heal=moduleValue('RelicRuntime',{'./RelicEligibility':Eligibility,BattleSounds:{effect(){sounds++;}}},{cc:{resources:{},isValid:value=>!!value&&!value.destroyed}});
 const changes={generation:a=>a.node._combatGeneration++,node:a=>a.node=actor().node,pooled:a=>a._isPooled=true,destroyedNode:a=>a.node.destroyed=true,destroyedActor:a=>a.destroyed=true};
 for(const [name,change]of Object.entries(changes)){
  const a=actor();let views=0;sounds=0;a.ctrHp.setHp=()=>change(a);a.upHpView=()=>views++;assert.equal(Heal.heal(a,.05),5,name);assert.equal(a.hp,55,name);assert.equal(views,0,name);assert.equal(sounds,0,name);
  const b=actor();sounds=0;b.upHpView=()=>change(b);assert.equal(Heal.heal(b,.05),5,name);assert.equal(b.hp,55,name);assert.equal(sounds,0,name+' after view');
 }
 for(const a of [actor(),{hp:95,hpMax:100}]){let views=0;sounds=0;a.upHpView=()=>views++;assert.equal(Heal.heal(a,.05),5);assert.equal(views,1);assert.equal(sounds,1);}
});

test('healing feedback stops after its battle retires even when actor node identity is unchanged',()=>{
 const changes={epoch:f=>f.owner._combatEpoch++,generation:f=>f.data._relicGeneration++,round:f=>f.data.round++,owner:f=>f.data.ctrPar={},data:f=>f.owner.gameData={},sceneNode:f=>f.owner.node=actor().node,destroyedOwner:f=>f.owner.destroyed=true};
 for(const boundary of ['hp-bar','view'])for(const[name,change]of Object.entries(changes)){
  const data={round:1,_relicGeneration:1},owner={gameData:data,node:actor().node,_combatEpoch:1};data.ctrPar=owner;const f={data,owner},a=actor();let views=0,sounds=0;
  const Heal=moduleValue('RelicRuntime',{'./RelicEligibility':Eligibility,KinghtFallUIGame:{default:{instance:{ctrGame:owner}}},BattleSounds:{effect(){sounds++;}}},{cc:{resources:{},isValid:value=>!!value&&!value.destroyed}});
  a.ctrHp.setHp=()=>{if(boundary==='hp-bar')change(f);};a.upHpView=()=>{views++;if(boundary==='view')change(f);};
  assert.equal(Heal.heal(a,.05),5,boundary+'/'+name);assert.equal(a.hp,55,name);assert.equal(views,boundary==='hp-bar'?0:1,name);assert.equal(sounds,0,name);
 }
});

test('healing commits HP while skipping disposed or pending-destroy optional HP widgets',()=>{
 const text=fs.readFileSync(path.join(root,'assets/_script/KinghtFallItemHp.js'),'utf8'),match=text.match(/_ctor\.prototype\.setHp = (function[\s\S]*?\n  });/);assert(match);const setHp=vm.runInNewContext('('+match[1]+')');
 const Heal=moduleValue('RelicRuntime',{'./RelicEligibility':Eligibility},{cc:{isValid:(value,strict)=>!!value&&!value.destroyed&&(!strict||!value.pendingDestroy)}});
 for(const alias of ['ctrHp','hpctrl'])for(const retired of ['component','component-pending','node','node-pending']){
  const a=actor();delete a.ctrHp;const bar={sprPro:{},setHp,node:{set active(_){throw Error('Disposed native HP node');}}};a[alias]=bar;
  if(retired==='component')bar.destroyed=true;else if(retired==='component-pending')bar.pendingDestroy=true;else if(retired==='node')bar.node.destroyed=true;else bar.node.pendingDestroy=true;
  assert.doesNotThrow(()=>assert.equal(Heal.heal(a,.05),5),alias+'/'+retired);assert.equal(a.hp,55);
 }
 const a=actor();let fill;a.ctrHp={sprPro:{},setHp,node:{},setFillProgress(_sprite,progress){fill=progress;}};assert.equal(Heal.heal(a,.05),5);assert.equal(fill,.55);assert.equal(a.ctrHp.node.active,true);
});

test('Phoenix repairs and checkpoints without calling a disposed or pending-destroy HP widget',()=>{
 const text=fs.readFileSync(path.join(root,'assets/_script/KinghtFallItemHp.js'),'utf8'),match=text.match(/_ctor\.prototype\.setHp = (function[\s\S]*?\n  });/);assert(match);const setHp=vm.runInNewContext('('+match[1]+')');
 const Rescue=moduleValue('RelicBattle',{RelicRuntime:Runtime,TowerCombat:Tower},{cc:{isValid:(value,strict)=>!!value&&!value.destroyed&&(!strict||!value.pendingDestroy)}});
 for(const retired of ['component','component-pending','node','node-pending']){
  let saves=0;const data={treasureAdd:{120028:[.25]},round:1},castle={node:actor().node,buildInfo:{hp:20,hpMax:100},ctrHp:{sprPro:{},setHp,node:{set active(_){throw Error('Disposed Phoenix HP node');}}}};data.ctrPar={gameData:data,saveGame(){saves++;return true;}};
  const bar=castle.ctrHp;if(retired==='component')bar.destroyed=true;else if(retired==='component-pending')bar.pendingDestroy=true;else if(retired==='node')bar.node.destroyed=true;else bar.node.pendingDestroy=true;
  assert.doesNotThrow(()=>assert.equal(Rescue.afterCastleDamage(data,castle),true),retired);assert.equal(castle.buildInfo.hp,45,retired);assert.equal(data.relicState.phoenixUsed,true,retired);assert.equal(saves,1,retired);
 }
});

test('already destroyed healing recipients receive no HP writes, view calls or sounds',()=>{
 let calls=0;const Heal=moduleValue('RelicRuntime',{'./RelicEligibility':Eligibility,BattleSounds:{effect(){calls++;}}},{cc:{resources:{},isValid:value=>!!value&&!value.destroyed}});
 for(const change of [a=>a.destroyed=true,a=>a.node.destroyed=true]){const a=actor();change(a);a.ctrHp.setHp=()=>calls++;a.upHpView=()=>calls++;assert.equal(Heal.heal(a,.05),0);assert.equal(a.hp,50);assert.equal(calls,0);}
});
